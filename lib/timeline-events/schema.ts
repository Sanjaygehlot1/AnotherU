import { z } from "zod";
import {
    EVENT_ACTIONS,
    EVENT_STATUSES,
    EVENT_TYPES,
    TIME_PRECISIONS,
} from "./constants";

export const eventActionSchema =
    z.enum(EVENT_ACTIONS);

export const eventStatusSchema =
    z.enum(EVENT_STATUSES);

export const eventTypeSchema =
    z.enum(EVENT_TYPES);

export const timePrecisionSchema =
    z.enum(TIME_PRECISIONS);

const nullableIsoDateTime = z
    .string()
    .datetime({
        offset: true,
    })
    .nullable()
    .default(null);

export const timelineEventCandidateSchema = z.object({
    action: eventActionSchema,

    title: z
        .string()
        .trim()
        .min(1)
        .max(200),

    description: z
        .string()
        .trim()
        .max(2000)
        .nullable()
        .default(null),

    eventType: eventTypeSchema,

    status: eventStatusSchema.nullable().default(null),

    startAt: nullableIsoDateTime,

    endAt: nullableIsoDateTime,

    timePrecision: timePrecisionSchema,

    rawTimeText: z
        .string()
        .trim()
        .max(200)
        .nullable()
        .default(null),

    importance: z
        .number()
        .int()
        .min(1)
        .max(5),

    confidence: z
        .number()
        .min(0)
        .max(1),

    evidence: z
        .string()
        .trim()
        .min(1)
        .max(1000),

    metadata: z
        .record(z.string(), z.unknown())
        .default({}),
});

export const timelineEventExtractionSchema =
    z.object({
        events: z
            .array(timelineEventCandidateSchema)
            .max(10),
    });

export type EventAction =
    z.infer<typeof eventActionSchema>;

export type EventStatus =
    z.infer<typeof eventStatusSchema>;

export type EventType =
    z.infer<typeof eventTypeSchema>;

export type TimePrecision =
    z.infer<typeof timePrecisionSchema>;

export type TimelineEventExtraction =
    z.infer<typeof timelineEventExtractionSchema>;