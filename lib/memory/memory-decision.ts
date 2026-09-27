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
    }
    | {
        action: "review";
        reason: "ambiguous_update";
        match?: MatchingMemory;
    };

const DUPLICATE_SIMILARITY = Number(
    process.env.MEMORY_DUPLICATE_SIMILARITY ?? "0.90",
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
 * Detect statements that indicate the user is uncertain,
 * considering a change, or exploring an option.
 *
 * These should not immediately mutate persistent identity.
 *
 * Examples:
 *
 * "User is considering switching from DevOps to backend."
 * "User is thinking about leaving DevOps."
 * "User is unsure whether to continue with DevOps."
 */
function hasUncertaintySignal(content: string): boolean {
    const text = content.toLowerCase();

    return (
        /\bconsidering\b/.test(text) ||
        /\bthinking about\b/.test(text) ||
        /\bthinking of\b/.test(text) ||
        /\bnot sure\b/.test(text) ||
        /\bunsure\b/.test(text) ||
        /\buncertain\b/.test(text) ||
        /\bleaning toward\b/.test(text) ||
        /\bexploring\b/.test(text) ||
        /\bon the fence\b/.test(text) ||
        /\bdebating\b/.test(text) ||
        /\bmaybe\b/.test(text) ||
        /\bmight\b/.test(text)
    );
}

function isRetractionOnly(content: string): boolean {
    const text = content
        .toLowerCase()
        .trim();

    const hasRetraction =
        text.includes("no longer") ||
        text.includes("not anymore") ||
        text.includes("stopped") ||
        text.includes("quit") ||
        text.includes("doesn't") ||
        text.includes("does not") ||
        text.includes("don't") ||
        text.includes("do not") ||
        text.includes("isn't") ||
        text.includes("is not");

    const hasReplacement =
        text.includes("instead") ||
        text.includes("switched to") ||
        text.includes("changed to") ||
        text.includes("changed from") ||
        text.includes("prefer") ||
        text.includes("rather than");

    return hasRetraction && !hasReplacement;
}

/**
 * How much of the existing memory's meaningful vocabulary
 * is still present in the new candidate.
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
 * Detect language indicating the user has explicitly changed
 * an existing state.
 *
 * These are intentionally stronger signals than simple
 * preference/goal language.
 */
function hasExplicitUpdateSignal(content: string): boolean {
    const text = content.toLowerCase();

    return (
        /\bno longer\b/.test(text) ||
        /\bnot anymore\b/.test(text) ||
        /\bstopped\b/.test(text) ||
        /\bstop(ed|ping)?\b/.test(text) ||
        /\bquit\b/.test(text) ||
        /\bdoesn't\b/.test(text) ||
        /\bdoes not\b/.test(text) ||
        /\bdo not\b/.test(text) ||
        /\bdon't\b/.test(text) ||
        /\bisn't\b/.test(text) ||
        /\bis not\b/.test(text) ||
        /\bswitched to\b/.test(text) ||
        /\bchanged from\b/.test(text) ||
        /\bchanged to\b/.test(text) ||
        /\bdecided to\b/.test(text) ||
        /\bhas decided\b/.test(text) ||
        /\bhave decided\b/.test(text) ||
        /\bchosen to\b/.test(text) ||
        /\bnow wants\b/.test(text) ||
        /\binstead of\b/.test(text) ||
        /\bused to\b/.test(text) ||
        /\bpreviously\b/.test(text) ||
        /\bchanged my\b/.test(text) ||
        /\bprefer .* instead\b/.test(text) ||
        /\bwant(?:s)? .* instead\b/.test(text)
    );
}

export function decideMemory(
    candidate: MemoryCandidate,
    bestMatch: MatchingMemory | null,
): MemoryDecision {
    /*
     * ---------------------------------------------------------
     * 1. Uncertainty gets handled FIRST.
     * ---------------------------------------------------------
     *
     * A statement such as:
     *
     * "User is considering switching careers."
     *
     * must not accidentally become a persistent identity change
     * just because its embedding is highly similar to an
     * existing memory.
     */
    if (hasUncertaintySignal(candidate.content)) {
        return {
            action: "review",
            reason: "ambiguous_update",
            match: bestMatch ?? undefined,
        };
    }

    /*
     * ---------------------------------------------------------
     * 2. No related memory -> save.
     * ---------------------------------------------------------
     */
    if (!bestMatch) {
        return {
            action: "save",
            reason: "related_or_new",
        };
    }

    const similarity = Number(bestMatch.similarity);

    /*
     * ---------------------------------------------------------
     * 3. Explicit update -> supersede.
     * ---------------------------------------------------------
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
     * ---------------------------------------------------------
     * 4. Very high semantic similarity -> duplicate.
     * ---------------------------------------------------------
     */
    if (
        candidate.type === bestMatch.type &&
        similarity >= DUPLICATE_SIMILARITY
    ) {
        return {
            action: "skip",
            reason: "semantic_duplicate",
            match: bestMatch,
        };
    }

    /*
     * ---------------------------------------------------------
     * 5. Same core fact + additional information.
     * ---------------------------------------------------------
     */
    const existingTokens = meaningfulTokens(
        bestMatch.content,
    );

    const candidateTokens = meaningfulTokens(
        candidate.content,
    );

    const containment = lexicalContainment(
        bestMatch.content,
        candidate.content,
    );

    const hasAdditionalInformation =
        candidateTokens.size >= existingTokens.size + 1;

    if (
        candidate.type === bestMatch.type &&
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
     * ---------------------------------------------------------
     * 6. Related/new -> save.
     * ---------------------------------------------------------
     */
    return {
        action: "save",
        reason: "related_or_new",
        match: bestMatch,
    };
}

export {
    isRetractionOnly,
};