import type { EmbeddingProvider } from "./provider";

const OLLAMA_URL =
    process.env.OLLAMA_EMBEDDING_URL  ?? "http://localhost:11434";

const OLLAMA_EMBEDDING_MODEL =
    process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";

export const ollamaEmbeddingProvider: EmbeddingProvider = {
    async embed(input: string): Promise<number[]> {
        const response = await fetch(
            `${OLLAMA_URL}/api/embed`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: OLLAMA_EMBEDDING_MODEL,
                    input,
                }),
            },
        );

        if (!response.ok) {
            const body = await response.text();

            throw new Error(
                `Ollama embedding request failed (${response.status}): ${body}`,
            );
        }

        const data = (await response.json()) as {
            embeddings?: number[][];
        };

        const embedding = data.embeddings?.[0];

        if (!embedding || embedding.length === 0) {
            throw new Error("Ollama returned an empty embedding.");
        }

        return embedding;
    },
};