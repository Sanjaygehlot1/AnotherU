import { z } from "zod";

export const eventTypeSchema = z.enum([
  "travel",
  "education",
  "work",
  "project",
  "purchase",
  "appointment",
  "social",
  "relationship",
  "achievement",
  "health",
  "hobby",
  "routine",
  "life_change",
  "other",
]);

export const eventStatusSchema = z.enum([
  "planned",
  "ongoing",
  "completed",
  "postponed",
  "cancelled",
  "unknown",
]);

export const eventTimePrecisionSchema = z.enum([
  "datetime",
  "date",
  "range",
  "approximate",
  "unknown",
]);

/**
 * Describes how certain the user's statement is.
 *
 * asserted   -> user presents it as true
 * tentative  -> user is unsure / considering it
 * conditional -> depends on another condition
 * hypothetical -> imagined scenario
 */
export const eventCertaintySchema = z.enum([
  "asserted",
  "tentative",
  "conditional",
  "hypothetical",
]);

export const eventActionSchema = z.enum([
  "none",
  "create",
  "update",
]);

export const eventExtractionSchema = z.object({
  action: eventActionSchema,

  /**
   * Only use an existing candidate event ID when action = "update".
   * Never invent IDs.
   */
  candidateEventId: z.string().uuid().nullable(),

  title: z.string().min(1).max(200).nullable(),

  description: z.string().max(1500).nullable(),

  eventType: eventTypeSchema.nullable(),

  status: eventStatusSchema.nullable(),

  certainty: eventCertaintySchema,

  startAt: z.string().datetime().nullable(),

  endAt: z.string().datetime().nullable(),

  timePrecision: eventTimePrecisionSchema,

  rawTimeText: z.string().max(300).nullable(),

  importance: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable(),

  confidence: z
    .number()
    .min(0)
    .max(1),

  evidence: z
    .string()
    .min(1)
    .max(1000)
    .nullable(),
});

export type EventExtraction =
  z.infer<typeof eventExtractionSchema>;