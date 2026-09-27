import test from "node:test";
import assert from "node:assert/strict";

import {
    decideMemory,
    isRetractionOnly,
    type MatchingMemory,
} from "@/lib/memory/memory-decision";
import type { MemoryCandidate } from "@/lib/ai/memory-schema";

function candidate(
    overrides: Partial<MemoryCandidate> = {},
): MemoryCandidate {
    return {
        type: "goal",
        content: "User wants to become a Cloud DevOps engineer.",
        importance: 4,
        confidence: 1,
        ...overrides,
    };
}

function match(
    overrides: Partial<MatchingMemory> = {},
): MatchingMemory {
    return {
        id: "memory-1",
        type: "goal",
        content: "User wants to become a Cloud DevOps engineer.",
        importance: 4,
        confidence: 1,
        similarity: 0.95,
        ...overrides,
    };
}

/*
 * ------------------------------------------------------------
 * Semantic duplicate
 * ------------------------------------------------------------
 */
test("high-similarity paraphrase is skipped", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User wants to build a career around Cloud and DevOps.",
        }),
        match({
            content:
                "User wants to become a Cloud DevOps engineer.",
            similarity: 0.917,
        }),
    );

    assert.equal(decision.action, "skip");
    assert.equal(decision.reason, "semantic_duplicate");
});

/*
 * ------------------------------------------------------------
 * More specific memory
 * ------------------------------------------------------------
 */
test("more specific memory is saved", () => {
    const decision = decideMemory(
        candidate({
            type: "fact",
            content:
                "User is learning Kubernetes from KodeKloud.",
        }),
        match({
            type: "fact",
            content: "User is learning Kubernetes.",
            similarity: 0.85,
        }),
    );

    assert.equal(decision.action, "save");
    assert.equal(decision.reason, "more_specific");
});

/*
 * ------------------------------------------------------------
 * Related but not duplicate
 * ------------------------------------------------------------
 */
test("related memory that is not clearly duplicate is saved", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User is interested in backend engineering.",
        }),
        match({
            content:
                "User wants to become a Cloud DevOps engineer.",
            similarity: 0.76,
        }),
    );

    assert.equal(decision.action, "save");
    assert.equal(decision.reason, "related_or_new");
});

/*
 * ------------------------------------------------------------
 * Explicit update
 * ------------------------------------------------------------
 */
test("explicit update supersedes an existing memory", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User no longer wants to become a Cloud DevOps engineer.",
        }),
        match({
            content:
                "User wants to become a Cloud DevOps engineer.",
            similarity: 0.90,
        }),
    );

    assert.equal(decision.action, "supersede");
    assert.equal(decision.reason, "explicit_update");
    assert.equal(decision.match.id, "memory-1");
});

/*
 * ------------------------------------------------------------
 * No semantic match
 * ------------------------------------------------------------
 */
test("memory with no match is saved", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User enjoys watching psychological thriller movies.",
        }),
        null,
    );

    assert.equal(decision.action, "save");
    assert.equal(decision.reason, "related_or_new");
    assert.equal(decision.match, undefined);
});

/*
 * ------------------------------------------------------------
 * Retraction detection
 * ------------------------------------------------------------
 */
test("pure retraction is detected", () => {
    assert.equal(
        isRetractionOnly(
            "User no longer wants to become a Cloud DevOps engineer.",
        ),
        true,
    );
});

test("retraction with explicit replacement is not retraction-only", () => {
    assert.equal(
        isRetractionOnly(
            "User no longer wants to become a Cloud DevOps engineer and wants to become a backend engineer instead.",
        ),
        false,
    );
});

test("ordinary memory is not retraction-only", () => {
    assert.equal(
        isRetractionOnly(
            "User wants to become a backend engineer.",
        ),
        false,
    );
});

test("ambiguous career change goes to review", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User is considering switching from Cloud DevOps to backend engineering.",
        }),
        match({
            content:
                "User wants to become a Cloud DevOps engineer.",
            similarity: 0.84,
        }),
    );

    assert.equal(decision.action, "review");
    assert.equal(decision.reason, "ambiguous_update");
    assert.equal(decision.match?.id, "memory-1");
});

test("thinking about changing goals goes to review", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User is thinking about leaving DevOps and focusing on backend engineering.",
        }),
        match({
            content:
                "User wants to become a Cloud DevOps engineer.",
            similarity: 0.83,
        }),
    );

    assert.equal(decision.action, "review");
    assert.equal(decision.reason, "ambiguous_update");
});

test("firm career decision supersedes existing memory", () => {
    const decision = decideMemory(
        candidate({
            content:
                "User has decided to switch to backend engineering.",
        }),
        match({
            content:
                "User wants to become a Cloud DevOps engineer.",
            similarity: 0.84,
        }),
    );

    assert.equal(decision.action, "supersede");
    assert.equal(decision.reason, "explicit_update");
    assert.equal(decision.match?.id, "memory-1");
});