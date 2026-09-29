import type { EventExtraction } from "../ai/event-schema";

export function validateEventExtraction(extraction: EventExtraction) {
  if (extraction.action === "none") {
    const invalid =
      extraction.candidateEventId !== null ||
      extraction.title !== null ||
      extraction.description !== null ||
      extraction.eventType !== null ||
      extraction.status !== null ||
      extraction.startAt !== null ||
      extraction.endAt !== null ||
      extraction.timePrecision !== "unknown" ||
      extraction.rawTimeText !== null ||
      extraction.importance !== null ||
      extraction.evidence !== null;

    if (invalid) {
      throw new Error(
        "Invalid event extraction: action=none must contain no event payload.",
      );
    }

    return;
  }

  if (!extraction.title) {
    throw new Error(
      `Invalid event extraction: action=${extraction.action} requires title.`,
    );
  }

  if (!extraction.eventType) {
    throw new Error(
      `Invalid event extraction: action=${extraction.action} requires eventType.`,
    );
  }

  if (!extraction.status) {
    throw new Error(
      `Invalid event extraction: action=${extraction.action} requires status.`,
    );
  }

  if (!extraction.evidence) {
    throw new Error(
      `Invalid event extraction: action=${extraction.action} requires evidence.`,
    );
  }

  if (extraction.action === "create" && extraction.candidateEventId !== null) {
    throw new Error(
      "Invalid event extraction: create cannot contain candidateEventId.",
    );
  }

  if (
    extraction.action === "update" &&
    extraction.candidateEventId === null
  ) {
    throw new Error(
      "Invalid event extraction: update requires candidateEventId.",
    );
  }
}