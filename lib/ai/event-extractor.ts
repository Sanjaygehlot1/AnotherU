import {
  generateStructured,
} from "./gateway";

import {
  eventExtractionSchema,
  type EventExtraction,
} from "./event-schema";

type EventExtractionInput = {
  userMessage: string;
  currentTimestamp: string;
  timezone: string;
  candidateEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    eventType: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
  }>;
};

export async function extractLifeEvent(
  input: EventExtractionInput,
): Promise<EventExtraction> {
  const candidateBlock =
    input.candidateEvents.length === 0
      ? "No candidate events."
      : input.candidateEvents
          .map(
            (event) => `
ID: ${event.id}
Title: ${event.title}
Type: ${event.eventType}
Status: ${event.status}
Start: ${event.startAt ?? "unknown"}
End: ${event.endAt ?? "unknown"}
Description: ${event.description ?? "none"}
`,
          )
          .join("\n---\n");

  return generateStructured(
    {
        task: "timeline_event_extraction",

        system: `
You extract life-event information from a user's message for AnotherU.

You are NOT the database.
You do NOT decide what ultimately becomes part of the user's permanent life model.

Return only information supported by the user's message.

A life event can represent something:
- that happened
- that is happening
- that is planned
- that changed
- that was postponed
- that was cancelled

Do NOT create an event from ordinary conversation when no meaningful
life event is present.

Important distinctions:

- asserted = user states it as true
- tentative = user is unsure or considering it
- conditional = depends on another condition
- hypothetical = imagined scenario

Hypothetical and conditional statements must not be treated as confirmed
real-world experiences.

Never invent dates, locations, people, outcomes, or details.

Use candidateEventId only when an existing candidate clearly refers to
the same real-world event.

If no meaningful life event exists:
action = "none"
candidateEventId = null
title = null
description = null
eventType = null
status = null
startAt = null
endAt = null
rawTimeText = null
importance = null
certainty should still reflect the message
confidence should be low.

Current timestamp:
${input.currentTimestamp}

User timezone:
${input.timezone}

Candidate events:
${candidateBlock}
`,

        user: `
<user_message>
${input.userMessage}
</user_message>
`,
    },
    eventExtractionSchema,
);
}