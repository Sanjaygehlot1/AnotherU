import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { eventExtractionSchema } from "@/lib/ai/event-schema";

describe("eventExtractionSchema", () => {
    it("accepts a planned asserted event", () => {
        const result = eventExtractionSchema.parse({
            action: "create",
            candidateEventId: null,
            title: "Family trip",
            description: "Trip with family",
            eventType: "travel",
            status: "planned",
            certainty: "asserted",
            startAt: null,
            endAt: null,
            timePrecision: "approximate",
            rawTimeText: "next week",
            importance: 4,
            confidence: 0.95,
            evidence: "I'm going on a family trip next week.",
        });

        assert.equal(result.action, "create");
        assert.equal(result.eventType, "travel");
    });

    it("accepts a tentative event", () => {
        const result = eventExtractionSchema.parse({
            action: "create",
            candidateEventId: null,
            title: "Laptop purchase",
            description: "Possible laptop purchase",
            eventType: "purchase",
            status: "planned",
            certainty: "tentative",
            startAt: null,
            endAt: null,
            timePrecision: "unknown",
            rawTimeText: null,
            importance: 3,
            confidence: 0.65,
            evidence: "I might buy a new laptop.",
        });

        assert.equal(result.certainty, "tentative");
    });

    it("accepts a conditional future event", () => {
        const result = eventExtractionSchema.parse({
            action: "create",
            candidateEventId: null,
            title: "Move to another city",
            description: "Possible move depending on selection",
            eventType: "life_change",
            status: "planned",
            certainty: "conditional",
            startAt: null,
            endAt: null,
            timePrecision: "unknown",
            rawTimeText: null,
            importance: 4,
            confidence: 0.8,
            evidence: "If I get selected, I'll move there.",
        });

        assert.equal(result.certainty, "conditional");
    });

    it("accepts a no-event result", () => {
        const result = eventExtractionSchema.parse({
            action: "none",
            candidateEventId: null,
            title: null,
            description: null,
            eventType: null,
            status: null,
            certainty: "asserted",
            startAt: null,
            endAt: null,
            timePrecision: "unknown",
            rawTimeText: null,
            importance: null,
            confidence: 0.98,
            evidence: null,
        });

        assert.equal(result.action, "none");
    });
});