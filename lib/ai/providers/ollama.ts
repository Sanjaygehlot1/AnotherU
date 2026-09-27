import OpenAI from "openai";
import type { ZodType } from "zod";
import type { AIProvider } from "../provider";

const baseURL = process.env.OLLAMA_URL ?? "http://localhost:11434/v1";
const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";

const client = new OpenAI({
    baseURL,
    apiKey: "ollama",
});

const REQUEST_TIMEOUT_MS = 30_000;

function createTimeoutSignal() {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

export const ollamaProvider: AIProvider = {
    async generateText({ system, user }) {
        const response = await client.chat.completions.create(
            {
                model,
                messages: [
                    {
                        role: "system",
                        content: system,
                    },
                    {
                        role: "user",
                        content: user,
                    },
                ],
            },
            {
                signal: createTimeoutSignal(),
            },
        );

        const content = response.choices[0]?.message?.content;

        if (!content || typeof content !== "string") {
            throw new Error("Ollama returned an empty response");
        }

        return content.trim();
    },

    async generateStructured<T>(
        input: {
            system: string;
            user: string;
        },
        schema: ZodType<T>,
    ): Promise<T> {
        const { system, user } = input;

        const response = await client.chat.completions.create(
            {
                model,
                messages: [
                    {
                        role: "system",
                        content: system,
                    },
                    {
                        role: "user",
                        content: user,
                    },
                ],
                response_format: {
                    type: "json_object",
                },
            },
            {
                signal: createTimeoutSignal(),
            },
        );

        const content = response.choices[0]?.message?.content;

        if (!content || typeof content !== "string") {
            throw new Error("Ollama returned an empty structured response");
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch {
            throw new Error("Ollama returned invalid JSON");
        }

        return schema.parse(parsed);
    },
};