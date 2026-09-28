import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@/lib/ai/embeddings/gateway";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type RetrievedMemory = {
    id: string;
    type: string;
    content: string;
    importance: number;
    confidence: number;
    similarity: number;
};

const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MIN_SIMILARITY = 0.72;

export async function retrieveRelevantMemories(input: {
    userId: string;
    timelineId: string;
    query: string;
    matchCount?: number;
    minSimilarity?: number;
}): Promise<RetrievedMemory[]> {
    const {
        userId,
        timelineId,
        query,
        matchCount = DEFAULT_MATCH_COUNT,
        minSimilarity = DEFAULT_MIN_SIMILARITY,
    } = input;

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        return [];
    }

    const embedding = await generateEmbedding(trimmedQuery);

    const { data, error } = await supabase.rpc(
        "match_active_memories",
        {
            p_user_id: userId,
            p_timeline_id: timelineId,
            p_embedding: embedding,
            p_match_count: Math.min(matchCount, 20),
            p_min_similarity: minSimilarity,
        },
    );

    if (error) {
        throw new Error(
            `Failed to retrieve memories: ${error.message}`,
        );
    }

    const memories = (data ?? []) as RetrievedMemory[];

    console.info("[MEMORY RETRIEVAL]", {
        timelineId,
        query: trimmedQuery,
        returned: memories.length,
        matches: memories.map((memory) => ({
            id: memory.id,
            type: memory.type,
            similarity: Number(memory.similarity.toFixed(3)),
        })),
    });

    return memories;
}