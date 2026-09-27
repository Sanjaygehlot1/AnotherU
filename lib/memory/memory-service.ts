import type { MemoryCandidate } from "@/lib/ai/memory-schema";
import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@/lib/ai/embeddings/gateway";
import {
    decideMemory,
    type MatchingMemory,
} from "@/lib/memory/memory-decision";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type SaveMemoriesInput = {
    userId: string;
    timelineId: string;
    sourceMessageId: string;
    candidates: MemoryCandidate[];
};

function normalizeContent(content: string): string {
    return content
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[.!?]+$/, "");
}

function looksHypothetical(content: string): boolean {
    const text = content.toLowerCase();

    return /\b(might|maybe|perhaps|could|would|possibly|probably|if i|if they|someday|one day)\b/.test(
        text,
    );
}

function looksEphemeral(content: string): boolean {
    const text = content.toLowerCase();

    return /\b(right now|today|this morning|this evening|currently feeling|feeling tired|feeling sad|feeling angry|just woke up|just got|at the moment)\b/.test(
        text,
    );
}

function isQualityMemory(candidate: MemoryCandidate): boolean {
    const content = candidate.content.trim();

    if (content.length < 8) {
        return false;
    }

    if (content.length > 500) {
        return false;
    }

    if (looksHypothetical(content)) {
        return false;
    }

    if (looksEphemeral(content)) {
        return false;
    }

    return true;
}

export async function saveMemories({
    userId,
    timelineId,
    sourceMessageId,
    candidates,
}: SaveMemoriesInput): Promise<number> {
    const accepted: MemoryCandidate[] = [];
    const seen = new Set<string>();

    /*
     * ---------------------------------------------------------
     * PHASE 1 — Deterministic quality gate
     * ---------------------------------------------------------
     */
    for (const candidate of candidates) {
        if (!isQualityMemory(candidate)) {
            console.info("[MEMORY] rejected by quality gate", {
                type: candidate.type,
                content: candidate.content,
            });

            continue;
        }

        const normalized = normalizeContent(candidate.content);

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        accepted.push(candidate);
    }

    if (accepted.length === 0) {
        return 0;
    }

    /*
     * ---------------------------------------------------------
     * PHASE 2 — Exact duplicate detection
     * ---------------------------------------------------------
     */
    const { data: existingMemories, error: existingError } =
        await supabase
            .from("memories")
            .select("id, content, type, importance, confidence")
            .eq("user_id", userId)
            .eq("timeline_id", timelineId)
            .eq("status", "active");

    if (existingError) {
        throw existingError;
    }

    const existingNormalized = new Set(
        (existingMemories ?? []).map((memory) =>
            normalizeContent(memory.content),
        ),
    );

    const newMemories = accepted.filter(
        (candidate) =>
            !existingNormalized.has(
                normalizeContent(candidate.content),
            ),
    );

    if (newMemories.length === 0) {
        console.info("[MEMORY] all candidates already exist", {
            sourceMessageId,
        });

        return 0;
    }

    /*
     * ---------------------------------------------------------
     * PHASE 3 — Semantic retrieval + decision engine
     * ---------------------------------------------------------
     */
    const rows = [];
    let savedCount = 0;

    for (const memory of newMemories) {
        /*
         * Generate embedding for the candidate.
         */
        const embedding = await generateEmbedding(
            memory.content,
        );

        /*
         * Retrieve nearby active memories.
         *
         * 0.72 is NOT a duplicate threshold.
         *
         * It simply gives our decision engine a wider candidate
         * set for update/conflict detection.
         */
        const { data: matches, error: matchError } =
            await supabase.rpc(
                "match_active_memories",
                {
                    p_user_id: userId,
                    p_timeline_id: timelineId,
                    p_embedding: embedding,
                    p_match_count: 5,
                    p_min_similarity: 0.72,
                },
            );

        if (matchError) {
            throw matchError;
        }

        const semanticMatches =
            (matches ?? []) as MatchingMemory[];

        const bestMatch =
            semanticMatches.length > 0
                ? semanticMatches[0]
                : null;

        const decision = decideMemory(
            memory,
            bestMatch,
        );

        console.info("[MEMORY] decision", {
            sourceMessageId,
            candidate: memory.content,
            action: decision.action,
            reason: decision.reason,
            match: decision.match
                ? {
                      id: decision.match.id,
                      similarity: Number(
                          decision.match.similarity.toFixed(3),
                      ),
                      content: decision.match.content,
                  }
                : null,
        });

        /*
         * -----------------------------------------------------
         * Semantic duplicate
         * -----------------------------------------------------
         */
        if (decision.action === "skip") {
            continue;
        }

        /*
         * -----------------------------------------------------
         * Explicit update / supersession
         * -----------------------------------------------------
         *
         * We mark the old memory as superseded BEFORE inserting
         * the new one.
         *
         * This works well with retries:
         *
         * old memory
         *    ↓
         * superseded
         *    ↓
         * insert new memory
         *
         * If insertion fails, the durable memory job retries.
         */
        if (decision.action === "supersede") {
            const { error: supersedeError } =
                await supabase
                    .from("memories")
                    .update({
                        status: "superseded",
                        updated_at:
                            new Date().toISOString(),
                    })
                    .eq("id", decision.match.id)
                    .eq("user_id", userId)
                    .eq("timeline_id", timelineId)
                    .eq("status", "active");

            if (supersedeError) {
                throw supersedeError;
            }

            console.info("[MEMORY] superseded", {
                oldMemoryId: decision.match.id,
                oldContent: decision.match.content,
                newContent: memory.content,
                sourceMessageId,
            });
        }

        /*
         * -----------------------------------------------------
         * Save new memory
         * -----------------------------------------------------
         */
        rows.push({
            user_id: userId,
            timeline_id: timelineId,
            type: memory.type,
            content: memory.content,
            importance: memory.importance,
            confidence: memory.confidence,
            source: "conversation" as const,
            source_message_id: sourceMessageId,
            status: "active" as const,
            embedding,
            ...(decision.action === "supersede"
                ? {
                      supersedes_memory_id:
                          decision.match.id,
                  }
                : {}),
        });
    }

    if (rows.length === 0) {
        console.info("[MEMORY] no new memories saved", {
            sourceMessageId,
        });

        return 0;
    }

    const { error: insertError } = await supabase
        .from("memories")
        .insert(rows);

    if (insertError) {
        throw insertError;
    }

    savedCount = rows.length;

    console.info("[MEMORY] saved", {
        sourceMessageId,
        count: savedCount,
    });

    return savedCount;
}