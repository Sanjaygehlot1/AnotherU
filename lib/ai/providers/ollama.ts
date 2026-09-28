import type { ZodType } from "zod";
import type { AIProvider } from "../provider";

const baseURL =
    process.env.OLLAMA_NATIVE_URL ??
    "http://localhost:11434";

const REQUEST_TIMEOUT_MS = 120_000;

function createTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function buildMessages(system: string, user: string) {
    return [
        {
            role: "system",
            content: system,
        },
        {
            role: "user",
            content: user,
        },
    ];
}

type OllamaChatChunk = {
    model?: string;
    created_at?: string;
    message?: {
        role?: string;
        content?: string;
        thinking?: string;
    };
    done?: boolean;
    done_reason?: string;

    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_cached_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
};

async function assertOK(response: Response): Promise<void> {
    if (response.ok) {
        return;
    }

    const body = await response.text();

    throw new Error(
        `Ollama request failed (${response.status}): ${body}`,
    );
}

async function readJSONResponse(
    response: Response,
): Promise<OllamaChatChunk> {
    await assertOK(response);

    return (await response.json()) as OllamaChatChunk;
}

export const ollamaProvider: AIProvider = {
    async generateText({ model, system, user }) {
        const response = await fetch(`${baseURL}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: buildMessages(system, user),
                stream: false,
                think: false,
            }),
            signal: createTimeoutSignal(),
        });

        const data = await readJSONResponse(response);

        return data.message?.content?.trim() ?? "";
    },

    async *streamText({ model, system, user }) {
        const startedAt = performance.now();
        let firstTokenAt: number | null = null;

        const response = await fetch(`${baseURL}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: buildMessages(system, user),
                stream: true,
                think: false,
                keep_alive: "30m",
                options: {
                    num_ctx: 2048,
                    num_predict: 128,
                },
            }),
            signal: createTimeoutSignal(),
        });

        await assertOK(response);

        if (!response.body) {
            throw new Error(
                "Ollama returned an empty streaming response body.",
            );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        try {
            while (true) {
                const { value, done } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, {
                    stream: true,
                });

                const lines = buffer.split("\n");

                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();

                    if (!trimmed) {
                        continue;
                    }

                    let chunk: OllamaChatChunk;

                    try {
                        chunk = JSON.parse(trimmed) as OllamaChatChunk;
                    } catch {
                        throw new Error(
                            `Ollama returned invalid streaming JSON: ${trimmed}`,
                        );
                    }

                    const content = chunk.message?.content;

                    if (content) {
                        if (firstTokenAt === null) {
                            firstTokenAt = performance.now();

                            console.info("[OLLAMA FIRST TOKEN]", {
                                model,
                                ttftMs: Math.round(
                                    firstTokenAt - startedAt,
                                ),
                            });
                        }

                        yield content;
                    }

                    if (chunk.done) {
                        console.info("[OLLAMA STREAM METRICS]", {
                            model,

                            totalDurationMs: chunk.total_duration
                                ? Math.round(
                                    chunk.total_duration / 1_000_000,
                                )
                                : null,

                            promptEvalCachedCount:
                                chunk.prompt_eval_cached_count ?? null,

                            loadDurationMs: chunk.load_duration
                                ? Math.round(
                                    chunk.load_duration / 1_000_000,
                                )
                                : null,

                            promptEvalCount:
                                chunk.prompt_eval_count ?? null,

                            promptEvalDurationMs:
                                chunk.prompt_eval_duration
                                    ? Math.round(
                                        chunk.prompt_eval_duration /
                                        1_000_000,
                                    )
                                    : null,

                            evalCount:
                                chunk.eval_count ?? null,

                            evalDurationMs:
                                chunk.eval_duration
                                    ? Math.round(
                                        chunk.eval_duration /
                                        1_000_000,
                                    )
                                    : null,

                            generationTokensPerSecond:
                                chunk.eval_count &&
                                    chunk.eval_duration
                                    ? Number(
                                        (
                                            chunk.eval_count /
                                            (chunk.eval_duration /
                                                1_000_000_000)
                                        ).toFixed(2),
                                    )
                                    : null,
                        });

                        return;
                    }
                }
            }

            buffer += decoder.decode();

            const trimmed = buffer.trim();

            if (trimmed) {
                let chunk: OllamaChatChunk;

                try {
                    chunk = JSON.parse(trimmed) as OllamaChatChunk;
                } catch {
                    throw new Error(
                        `Ollama returned invalid trailing JSON: ${trimmed}`,
                    );
                }

                const content = chunk.message?.content;

                if (content) {
                    if (firstTokenAt === null) {
                        firstTokenAt = performance.now();

                        console.info("[OLLAMA FIRST TOKEN]", {
                            model,
                            ttftMs: Math.round(
                                firstTokenAt - startedAt,
                            ),
                        });
                    }

                    yield content;
                }
            }
        } finally {
            reader.releaseLock();
        }
    },

    async generateStructured<T>(
        {
            model,
            system,
            user,
        }: {
            model: string;
            system: string;
            user: string;
        },
        schema: ZodType<T>,
    ): Promise<T> {
        const response = await fetch(`${baseURL}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: buildMessages(
                    `${system}

Return ONLY valid JSON.
Do not use markdown fences.
Do not include explanations outside the JSON.`,
                    user,
                ),
                stream: false,
                think: false,
                format: "json",
            }),
            signal: createTimeoutSignal(),
        });

        const data = await readJSONResponse(response);

        const content = data.message?.content;

        if (!content) {
            throw new Error(
                "Ollama returned an empty structured response.",
            );
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch {
            throw new Error(
                `Ollama returned invalid JSON: ${content}`,
            );
        }

        return schema.parse(parsed);
    },
};