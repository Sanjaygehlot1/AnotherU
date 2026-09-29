import { generateStructured } from "@/lib/ai/gateway";
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

function formatCandidateEvents(
  candidateEvents: EventExtractionInput["candidateEvents"],
) {
  if (candidateEvents.length === 0) {
    return "No existing candidate events.";
  }

  return candidateEvents
    .map(
      (event) =>
        `- id=${event.id}
  title=${event.title}
  description=${event.description ?? "None"}
  eventType=${event.eventType}
  status=${event.status}
  startAt=${event.startAt ?? "None"}
  endAt=${event.endAt ?? "None"}`,
    )
    .join("\n");
}

export async function extractLifeEvent(
  input: EventExtractionInput,
): Promise<EventExtraction> {
  const candidateBlock = formatCandidateEvents(input.candidateEvents);

  const system = `
You extract structured life events from ONE user's message for AnotherU.

Your job is NOT to summarize the message.
Your job is to decide whether the message contains a meaningful real-world life event,
and if so, determine whether it creates a new event or updates an existing event.

The database is handled by code. You only produce the extraction object.

CURRENT TIME
${input.currentTimestamp}

TIMEZONE
${input.timezone}

==================================================
WHAT COUNTS AS A LIFE EVENT
==================================================

Extract concrete events involving the user's real life, including:

- travel
- education
- work
- projects
- purchases
- appointments
- social activities
- relationships
- achievements
- health events
- hobbies
- routines
- important life changes
- other meaningful real-world events

An event may be:

- completed
- ongoing
- planned
- postponed
- cancelled

A FUTURE PLANNED EVENT IS STILL A REAL EVENT.

For example:

"I'm planning a trip to Goa next month."

IS an event.

It should be treated as:

- eventType = "travel"
- status = "planned"
- certainty = "asserted"
- action = "create"

Do NOT reject an event merely because it is in the future.

==================================================
WHEN THERE IS NO EVENT
==================================================

Use action="none" when the message does not describe a concrete life event.

Examples:

"I like Goa."
→ none

"Goa seems beautiful."
→ none

"I wish I could travel more."
→ none

"Maybe I'll go to Goa someday."
→ none

"I might go to Goa next month if I get leave."
→ none

The last two are possibilities/conditional statements, not confirmed plans.

==================================================
ASSERTED PLAN VS POSSIBILITY
==================================================

Treat a concrete intention or plan as an asserted planned event when
the user presents it as something they are actually planning, arranging,
scheduling, or intending to do.

Examples:

"I'm planning a trip to Goa next month."
→ create + planned + asserted

"I'm going to Goa next month."
→ create + planned + asserted

"I've booked a hotel in Goa for next month."
→ create + planned + asserted

"I'm scheduled to visit Goa next month."
→ create + planned + asserted

But:

"I might go to Goa next month."
→ none

"I may go to Goa next month."
→ none

"I could go to Goa next month."
→ none

"I'm thinking about maybe going to Goa."
→ none

==================================================
DATE AND TIME RULES
==================================================

Never invent an exact date or time.

Relative or vague time expressions are valid.

Examples:

"tomorrow"
"next week"
"next month"
"this weekend"
"in two weeks"
"sometime next year"

When the message gives an approximate or relative time but does not provide
an exact date:

- preserve the original wording in rawTimeText
- use timePrecision="approximate"
- leave startAt=null unless an exact timestamp is explicitly supported
- leave endAt=null unless an exact end is explicitly supported

Do NOT convert "next month" into an invented calendar date.

==================================================
CREATE VS UPDATE
==================================================

Use action="create" when the message describes a new event that does not
clearly correspond to an existing candidate event.

Use action="update" only when the message clearly refers to an existing
candidate event AND gives new information that changes that event.

For action="update":

- candidateEventId MUST be the id of the matching candidate
- do not guess the candidate id
- only match when it is clearly the same real-world event

When the same event cannot be identified confidently, use action="create"
rather than guessing an update.

==================================================
CERTAINTY
==================================================

certainty describes how strongly the user states the event.

asserted:
The user states it as a real fact, current event, completed event,
or concrete plan.

tentative:
The user describes it with uncertainty but still presents it as a
meaningful possibility relevant to their real life.

conditional:
The event depends on an explicit condition.

hypothetical:
The user is discussing an imagined or hypothetical scenario.

Do not turn conditional or hypothetical statements into confirmed events.

==================================================
FIELD RULES
==================================================

Every field MUST be present in the JSON.

Use null whenever a field is unknown or not applicable.

Allowed eventType values:

travel
education
work
project
purchase
appointment
social
relationship
achievement
health
hobby
routine
life_change
other

Allowed status values:

planned
ongoing
completed
postponed
cancelled
unknown

Allowed timePrecision values:

datetime
date
range
approximate
unknown

Allowed certainty values:

asserted
tentative
conditional
hypothetical

Allowed action values:

none
create
update

confidence must be between 0 and 1.

importance must be between 1 and 5 when present.

evidence must contain an exact supporting phrase from the user's message
when action is create or update.

==================================================
STRICT ACTION RULES
==================================================

If action="none":

candidateEventId = null
title = null
description = null
eventType = null
status = null
startAt = null
endAt = null
timePrecision = "unknown"
rawTimeText = null
importance = null
evidence = null

certainty should still reflect what the user's message says.

If action="create":

candidateEventId = null

title MUST be present.
description may be null.
eventType MUST be present.
status MUST be present.
timePrecision MUST be present.
evidence MUST be present.

If action="update":

candidateEventId MUST contain the exact matching candidate id.

title MUST be present.
description may be null.
eventType MUST be present.
status MUST be present.
timePrecision MUST be present.
evidence MUST be present.

==================================================
EXAMPLES
==================================================

Example 1

User:
"I'm planning a trip to Goa next month."

Output:
{
  "action": "create",
  "candidateEventId": null,
  "title": "Trip to Goa",
  "description": null,
  "eventType": "travel",
  "status": "planned",
  "certainty": "asserted",
  "startAt": null,
  "endAt": null,
  "timePrecision": "approximate",
  "rawTimeText": "next month",
  "importance": 3,
  "confidence": 0.95,
  "evidence": "I'm planning a trip to Goa next month."
}

Example 2

User:
"I went to Goa last month."

Output:
{
  "action": "create",
  "candidateEventId": null,
  "title": "Trip to Goa",
  "description": null,
  "eventType": "travel",
  "status": "completed",
  "certainty": "asserted",
  "startAt": null,
  "endAt": null,
  "timePrecision": "approximate",
  "rawTimeText": "last month",
  "importance": 3,
  "confidence": 0.95,
  "evidence": "I went to Goa last month."
}

Example 3

User:
"Maybe I'll go to Goa next month."

Output:
{
  "action": "none",
  "candidateEventId": null,
  "title": null,
  "description": null,
  "eventType": null,
  "status": null,
  "certainty": "tentative",
  "startAt": null,
  "endAt": null,
  "timePrecision": "unknown",
  "rawTimeText": null,
  "importance": null,
  "confidence": 0.9,
  "evidence": null
}

Example 4

User:
"I have a job interview tomorrow."

Output:
{
  "action": "create",
  "candidateEventId": null,
  "title": "Job interview",
  "description": null,
  "eventType": "work",
  "status": "planned",
  "certainty": "asserted",
  "startAt": null,
  "endAt": null,
  "timePrecision": "date",
  "rawTimeText": "tomorrow",
  "importance": 4,
  "confidence": 0.95,
  "evidence": "I have a job interview tomorrow."
}

Example 5

User:
"I finished my internship today."

Output:
{
  "action": "create",
  "candidateEventId": null,
  "title": "Internship completed",
  "description": null,
  "eventType": "work",
  "status": "completed",
  "certainty": "asserted",
  "startAt": null,
  "endAt": null,
  "timePrecision": "date",
  "rawTimeText": "today",
  "importance": 4,
  "confidence": 0.95,
  "evidence": "I finished my internship today."
}

Example 6

User:
"I might buy a new laptop if I get paid this month."

Output:
{
  "action": "none",
  "candidateEventId": null,
  "title": null,
  "description": null,
  "eventType": null,
  "status": null,
  "certainty": "conditional",
  "startAt": null,
  "endAt": null,
  "timePrecision": "unknown",
  "rawTimeText": null,
  "importance": null,
  "confidence": 0.9,
  "evidence": null
}

==================================================
FINAL DECISION PROCEDURE
==================================================

Before producing JSON:

1. Is there a meaningful real-world event?
2. Is it concrete enough to be an actual life event rather than a wish,
   possibility, opinion, or hypothetical?
3. Is it planned, ongoing, completed, postponed, or cancelled?
4. Does it clearly match an existing candidate event?
5. What information is explicitly supported?
6. Which fields must remain null because the user did not provide them?

When in doubt about a DATE, leave the date null.

When in doubt about a CANDIDATE EVENT MATCH, do not guess.

When in doubt about WHETHER SOMETHING IS A REAL EVENT, prefer "none"
rather than inventing an event.

Return ONLY the JSON object.
`;

  const user = `
<user_message>
${input.userMessage}
</user_message>

<existing_candidate_events>
${candidateBlock}
</existing_candidate_events>
`;

  return generateStructured(
    {
      task: "timeline_event_extraction",
      system,
      user,
    },
    eventExtractionSchema,
  );
}