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

  candidateEventId: z
    .string()
    .uuid()
    .nullable()
    .catch(null),

  title: z
    .string()
    .min(1)
    .max(200)
    .nullable()
    .catch(null),

  description: z
    .string()
    .max(1500)
    .nullable()
    .catch(null),

  eventType: eventTypeSchema
    .nullable()
    .catch(null),

  status: eventStatusSchema
    .nullable()
    .catch(null),

  certainty: eventCertaintySchema
    .catch("asserted"),

  startAt: z
    .string()
    .datetime()
    .nullable()
    .catch(null),

  endAt: z
    .string()
    .datetime()
    .nullable()
    .catch(null),

  timePrecision: eventTimePrecisionSchema
    .catch("unknown"),

  rawTimeText: z
    .string()
    .max(300)
    .nullable()
    .catch(null),

  importance: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .catch(null),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .catch(0),

  evidence: z
    .string()
    .min(1)
    .max(1000)
    .nullable()
    .catch(null),
});

export type EventExtraction =
  z.infer<typeof eventExtractionSchema>;