import OpenAI from "openai";
import type { ZodType } from "zod";
import type { AIProvider } from "../provider";

function getClient() {
    const baseURL = process.env.REMOTE_AI_URL?.replace(/\/+$/, "");
    const token = process.env.REMOTE_AI_TOKEN;

    if (!baseURL) {
        throw new Error("REMOTE_AI_URL is not configured");
    }

    if (!token) {
        throw new Error("REMOTE_AI_TOKEN is not configured");
    }

    return new OpenAI({
        baseURL: `${baseURL}/v1`,
        apiKey: token,
    });
}

function buildMessages(system: string, user: string) {
    return [
        {
            role: "system" as const,
            content: system,
        },
        {
            role: "user" as const,
            content: user,
        },
    ];
}

export const remoteProvider: AIProvider = {
    async generateText({ model, system, user }) {
        const client = getClient();

        const response =
            await client.chat.completions.create({
                model,
                messages: buildMessages(system, user),
                stream: false,
            });

        return (
            response.choices[0]?.message?.content?.trim() ??
            ""
        );
    },

    async *streamText({ model, system, user }) {
        const client = getClient();

        const stream =
            await client.chat.completions.create({
                model,
                messages: buildMessages(system, user),
                stream: true,
            });

        for await (const chunk of stream) {
            const content =
                chunk.choices[0]?.delta?.content;

            if (content) {
                yield content;
            }
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
        const client = getClient();

        const response =
            await client.chat.completions.create({
                model,
                messages: buildMessages(
                    `${system}

Return ONLY valid JSON.
Do not use markdown fences.
Do not include explanations outside the JSON.`,
                    user,
                ),
                stream: false,
            });

        const content =
            response.choices[0]?.message?.content;

        if (!content) {
            throw new Error(
                "Remote AI returned an empty structured response",
            );
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch {
            throw new Error(
                "Remote AI returned invalid JSON",
            );
        }

        return schema.parse(parsed);
    },
};