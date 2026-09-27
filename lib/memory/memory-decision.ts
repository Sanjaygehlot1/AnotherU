import type { MemoryCandidate } from "@/lib/ai/memory-schema";

export type MatchingMemory = {
    id: string;
    type: string;
    content: string;
    importance: number;
    confidence: number;
    similarity: number;
};

export type MemoryDecision =
    | {
          action: "skip";
          reason: "semantic_duplicate";
          match: MatchingMemory;
      }
    | {
          action: "supersede";
          reason: "explicit_update";
          match: MatchingMemory;
      }
    | {
          action: "save";
          reason: "more_specific" | "related_or_new";
          match?: MatchingMemory;
      };

const DUPLICATE_SIMILARITY = Number(
    process.env.MEMORY_DUPLICATE_SIMILARITY ?? "0.92",
);

const UPDATE_SIMILARITY = Number(
    process.env.MEMORY_UPDATE_SIMILARITY ?? "0.72",
);

const SPECIFICITY_SIMILARITY = Number(
    process.env.MEMORY_SPECIFICITY_SIMILARITY ?? "0.80",
);

const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "is",
    "am",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "to",
    "of",
    "and",
    "or",
    "for",
    "in",
    "on",
    "at",
    "with",
    "from",
    "as",
    "by",
    "about",
    "this",
    "that",
    "it",
    "my",
    "me",
    "i",
    "user",
]);

function meaningfulTokens(content: string): Set<string> {
    return new Set(
        content
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .split(/\s+/)
            .filter(
                (token) =>
                    token.length >= 3 &&
                    !STOP_WORDS.has(token),
            ),
    );
}

/**
 * How much of the existing memory's meaningful vocabulary
 * is still present in the new candidate.
 *
 * Example:
 *
 * Existing:
 *   learning kubernetes
 *
 * Candidate:
 *   learning kubernetes from abhishek veeramalla
 *
 * => high containment
 */
function lexicalContainment(
    existing: string,
    candidate: string,
): number {
    const existingTokens = meaningfulTokens(existing);
    const candidateTokens = meaningfulTokens(candidate);

    if (existingTokens.size === 0) {
        return 0;
    }

    let overlap = 0;

    for (const token of existingTokens) {
        if (candidateTokens.has(token)) {
            overlap++;
        }
    }

    return overlap / existingTokens.size;
}

/**
 * Detect explicit language that strongly suggests
 * the user has changed or replaced an older state.
 *
 * We intentionally do NOT treat generic words such as
 * "now" as an update signal.
 */
function hasExplicitUpdateSignal(content: string): boolean {
    const text = content.toLowerCase();

    return (
        /\bno longer\b/.test(text) ||
        /\bnot anymore\b/.test(text) ||
        /\bstopped\b/.test(text) ||
        /\bstop(ed|ping)?\b/.test(text) ||
        /\bquit\b/.test(text) ||
        /\bswitched to\b/.test(text) ||
        /\bchanged from\b/.test(text) ||
        /\binstead of\b/.test(text) ||
        /\bused to\b/.test(text) ||
        /\bpreviously\b/.test(text) ||
        /\bchanged my\b/.test(text) ||
        /\bprefer .* instead\b/.test(text) ||
        /\bwant .* instead\b/.test(text)
    );
}

export function decideMemory(
    candidate: MemoryCandidate,
    bestMatch: MatchingMemory | null,
): MemoryDecision {
    if (!bestMatch) {
        return {
            action: "save",
            reason: "related_or_new",
        };
    }

    const similarity = Number(bestMatch.similarity);

    /*
     * IMPORTANT:
     * Explicit updates are checked BEFORE duplicate detection.
     *
     * Example:
     *
     * Old:
     *   User likes frontend development.
     *
     * New:
     *   User no longer likes frontend development.
     *
     * These can have very high semantic similarity,
     * but they represent an update rather than a duplicate.
     */
    if (
        candidate.type === bestMatch.type &&
        similarity >= UPDATE_SIMILARITY &&
        hasExplicitUpdateSignal(candidate.content)
    ) {
        return {
            action: "supersede",
            reason: "explicit_update",
            match: bestMatch,
        };
    }

    /*
     * Very high semantic similarity means the candidate
     * is probably saying the same thing.
     *
     * This threshold is intentionally conservative.
     */
    if (similarity >= DUPLICATE_SIMILARITY) {
        return {
            action: "skip",
            reason: "semantic_duplicate",
            match: bestMatch,
        };
    }

    /*
     * Detect a "same core fact + additional information" case.
     *
     * Example:
     *
     * Existing:
     *   User is learning Kubernetes.
     *
     * Candidate:
     *   User is learning Kubernetes from Abhishek Veeramalla.
     */
    const existingTokens = meaningfulTokens(bestMatch.content);
    const candidateTokens = meaningfulTokens(candidate.content);

    const containment = lexicalContainment(
        bestMatch.content,
        candidate.content,
    );

    const hasAdditionalInformation =
        candidateTokens.size >= existingTokens.size + 2;

    if (
        similarity >= SPECIFICITY_SIMILARITY &&
        containment >= 0.75 &&
        hasAdditionalInformation
    ) {
        return {
            action: "save",
            reason: "more_specific",
            match: bestMatch,
        };
    }

    /*
     * Related memories that don't clearly qualify as duplicates
     * or updates are kept.
     */
    return {
        action: "save",
        reason: "related_or_new",
        match: bestMatch,
    };
}