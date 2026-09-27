import test from "node:test";
import assert from "node:assert/strict";

import { memoryExtractionSchema } from "@/lib/ai/memory-schema";

test("accepts habit memories", () => {
    const result = memoryExtractionSchema.parse({
        memories: [
            {
                type: "habit",
                content: "User goes for a walk every evening.",
                importance: 3,
                confidence: 0.95,
            },
        ],
    });

    assert.equal(result.memories[0].type, "habit");
});

test("accepts multiple memory types", () => {
    const result = memoryExtractionSchema.parse({
        memories: [
            {
                type: "habit",
                content: "User goes for a walk every evening.",
            },
            {
                type: "goal",
                content: "User wants to visit Japan.",
            },
            {
                type: "preference",
                content: "User prefers tea over coffee.",
            },
        ],
    });

    assert.equal(result.memories.length, 3);
});