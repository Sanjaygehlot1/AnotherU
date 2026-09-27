import type { MemoryCandidate } from "@/lib/ai/memory-schema";
import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@/lib/ai/embeddings/gateway";
import {
    decideMemory,
    isRetractionOnly,
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
 * PHASE 3 — PLAN ALL MEMORY MUTATIONS
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * We do NOT mutate PostgreSQL inside this loop.
 *
 * Every candidate is evaluated against the SAME pre-existing
 * memory state.
 */

    const rows: Array<{
        type: MemoryCandidate["type"];
        content: string;
        importance: number;
        confidence: number;
        supersedes_memory_id?: string;
        embedding: number[];
    }> = [];

    const retractIds = new Set<string>();
    const supersedeIds = new Set<string>();

    let reviewedCount = 0;
    let skippedCount = 0;

    for (const memory of newMemories) {
        /*
         * Generate candidate embedding.
         */
        const embedding = await generateEmbedding(
            memory.content,
        );

        /*
         * Retrieve semantic candidates.
         *
         * 0.72 is a retrieval threshold, NOT a decision threshold.
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

        /*
         * Prefer a same-type match when one exists.
         *
         * Example:
         *
         * candidate type = goal
         *
         * If the search returns:
         *   fact  0.93
         *   goal  0.86
         *
         * the goal is more relevant for update/supersession.
         */
        const sameTypeMatch = semanticMatches.find(
            (match) => match.type === memory.type,
        );

        const bestMatch =
            sameTypeMatch ??
            semanticMatches[0] ??
            null;

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
         * SKIP
         * -----------------------------------------------------
         */
        if (decision.action === "skip") {
            skippedCount++;

            continue;
        }

        /*
         * -----------------------------------------------------
         * REVIEW
         * -----------------------------------------------------
         *
         * Do nothing to persistent identity.
         *
         * The original user message remains available as raw
         * evidence.
         */
        if (decision.action === "review") {
            reviewedCount++;

            console.info(
                "[MEMORY] deferred for review",
                {
                    sourceMessageId,
                    candidate: memory.content,
                    reason: decision.reason,
                },
            );

            continue;
        }

        /*
         * -----------------------------------------------------
         * SUPERSEDE / RETRACT
         * -----------------------------------------------------
         */
        if (decision.action === "supersede") {
            const oldMemoryId = decision.match.id;

            if (isRetractionOnly(memory.content)) {
                retractIds.add(oldMemoryId);

                console.info(
                    "[MEMORY] planned retraction",
                    {
                        oldMemoryId,
                        oldContent:
                            decision.match.content,
                        sourceMessageId,
                    },
                );

                /*
                 * The retraction statement itself is not stored
                 * as an active memory.
                 */
                continue;
            }

            supersedeIds.add(oldMemoryId);

            /*
             * The new memory references the memory it replaces.
             */
            rows.push({
                type: memory.type,
                content: memory.content,
                importance: memory.importance,
                confidence: memory.confidence,
                supersedes_memory_id:
                    oldMemoryId,
                embedding,
            });

            continue;
        }

        /*
         * -----------------------------------------------------
         * SAVE
         * -----------------------------------------------------
         */
        rows.push({
            type: memory.type,
            content: memory.content,
            importance: memory.importance,
            confidence: memory.confidence,
            embedding,
        });
    }

    /*
     * If the same old memory was both retracted and replaced
     * within one message, replacement wins.
     *
     * Example:
     *
     * "I no longer want DevOps.
     *  I want backend instead."
     */
    for (const id of supersedeIds) {
        retractIds.delete(id);
    }

    /*
     * ---------------------------------------------------------
     * PHASE 4 — ONE ATOMIC DATABASE MUTATION
     * ---------------------------------------------------------
     */
    if (
        rows.length === 0 &&
        retractIds.size === 0 &&
        supersedeIds.size === 0
    ) {
        console.info("[MEMORY] no persistent mutations", {
            sourceMessageId,
            skipped: skippedCount,
            reviewed: reviewedCount,
        });

        return 0;
    }

    const { data: savedCount, error: consolidationError } =
        await supabase.rpc(
            "consolidate_memory_batch",
            {
                p_user_id: userId,
                p_timeline_id: timelineId,
                p_source_message_id:
                    sourceMessageId,
                p_retract_ids: [
                    ...retractIds,
                ],
                p_supersede_ids: [
                    ...supersedeIds,
                ],
                p_new_memories: rows.map(
                    (row) => ({
                        type: row.type,
                        content: row.content,
                        importance:
                            row.importance,
                        confidence:
                            row.confidence,
                        supersedes_memory_id:
                            row.supersedes_memory_id ??
                            null,
                        embedding:
                            row.embedding,
                    }),
                ),
            },
        );

    if (consolidationError) {
        throw consolidationError;
    }

    console.info("[MEMORY] consolidated", {
        sourceMessageId,
        saved: Number(savedCount ?? 0),
        retracted: retractIds.size,
        superseded: supersedeIds.size,
        skipped: skippedCount,
        reviewed: reviewedCount,
    });

    return Number(savedCount ?? 0);

}