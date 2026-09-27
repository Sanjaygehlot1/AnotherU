import { ollamaEmbeddingProvider } from "./ollama";
import type { EmbeddingProvider } from "./provider";

const EMBEDDING_PROVIDER =
    process.env.EMBEDDING_PROVIDER ?? "ollama";

const providers: Record<string, EmbeddingProvider> = {
    ollama: ollamaEmbeddingProvider,
};

function resolveProvider(): EmbeddingProvider {
    const provider = providers[EMBEDDING_PROVIDER];

    if (!provider) {
        throw new Error(
            `Unsupported embedding provider: ${EMBEDDING_PROVIDER}`,
        );
    }

    return provider;
}

export async function generateEmbedding(
    input: string,
): Promise<number[]> {
    const provider = resolveProvider();

    const startedAt = performance.now();

    try {
        return await provider.embed(input);
    } finally {
        const durationMs = Math.round(
            performance.now() - startedAt,
        );

        console.info("[EMBEDDING]", {
            provider: EMBEDDING_PROVIDER,
            model:
                process.env.OLLAMA_EMBEDDING_MODEL ??
                "nomic-embed-text",
            durationMs,
        });
    }
}