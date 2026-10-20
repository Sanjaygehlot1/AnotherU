import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEventExtraction } from "./event-validator";
import {
    extractLifeEvent,
} from "@/lib/ai/event-extractor";
import type {
    EventExtraction,
} from "@/lib/ai/event-schema";

type TimelineEventRow = {
    id: string;
    title: string;
    description: string | null;
    event_type: string;
    status: string;
    start_at: string | null;
    end_at: string | null;
    time_precision: string;
    raw_time_text: string | null;
    importance: number;
    confidence: number;
    metadata: Record<string, unknown>;
};

type ProcessTimelineEventInput = {
    supabase: SupabaseClient;
    userId: string;
    timelineId: string;
    sourceMessageId: string;
    userMessage: string;
    currentTimestamp: string;
    timezone: string;
};

type ProcessTimelineEventResult = {
    extraction: EventExtraction;
    action: "none" | "create" | "update";
    eventId: string | null;
};

async function loadCandidateEvents(
    supabase: SupabaseClient,
    userId: string,
    timelineId: string,
) {
    const { data, error } = await supabase
        .from("timeline_events")
        .select(
            `
            id,
            title,
            description,
            event_type,
            status,
            start_at,
            end_at
            `,
        )
        .eq("user_id", userId)
        .eq("timeline_id", timelineId)
        .order("updated_at", {
            ascending: false,
        })
        .limit(25);

    if (error) {
        throw new Error(
            `Failed to load candidate events: ${error.message}`,
        );
    }

    return (data ?? []).map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        eventType: event.event_type,
        status: event.status,
        startAt: event.start_at,
        endAt: event.end_at,
    }));
}

export async function processTimelineEvent(
    input: ProcessTimelineEventInput,
): Promise<ProcessTimelineEventResult> {
    const {
        supabase,
        userId,
        timelineId,
        sourceMessageId,
        userMessage,
        currentTimestamp,
        timezone,
    } = input;

    // 1. Give the extractor recent events so it can resolve
    //    update references such as "that interview".
    const candidateEvents = await loadCandidateEvents(
        supabase,
        userId,
        timelineId,
    );

    // 2. LLM extraction.
    const extraction = await extractLifeEvent({
        userMessage,
        currentTimestamp,
        timezone,
        candidateEvents,
    });

    validateEventExtraction(extraction);

    console.info("[TIMELINE EVENT EXTRACTION]", {
        timelineId,
        sourceMessageId,
        action: extraction.action,
        candidateEventId: extraction.candidateEventId,
        title: extraction.title,
        status: extraction.status,
        certainty: extraction.certainty,
        confidence: extraction.confidence,
    });

    // 3. Never persist hypothetical/conditional statements
    //    as confirmed real-life events.
    if (
        extraction.certainty === "hypothetical" ||
        extraction.certainty === "conditional"
    ) {
        console.info(
            "[TIMELINE EVENT] skipped non-confirmed statement",
            {
                timelineId,
                sourceMessageId,
                certainty: extraction.certainty,
            },
        );

        return {
            extraction,
            action: "none",
            eventId: null,
        };
    }

    if (extraction.action === "none") {
        return {
            extraction,
            action: "none",
            eventId: null,
        };
    }

    // ---------------------------------------------------------
    // CREATE
    // ---------------------------------------------------------

    if (extraction.action === "create") {
        if (!extraction.title) {
            console.warn(
                "[TIMELINE EVENT] create missing title",
                {
                    timelineId,
                    sourceMessageId,
                },
            );

            return {
                extraction,
                action: "none",
                eventId: null,
            };
        }

        const metadata = {
            certainty: extraction.certainty,
        };

        const { data: event, error: eventError } = await supabase
            .from("timeline_events")
            .insert({
                user_id: userId,
                timeline_id: timelineId,
                title: extraction.title,
                description: extraction.description,
                event_type: extraction.eventType ?? "other",
                status: extraction.status ?? "unknown",
                start_at: extraction.startAt,
                end_at: extraction.endAt,
                time_precision:
                    extraction.timePrecision ?? "unknown",
                raw_time_text: extraction.rawTimeText,
                importance: extraction.importance ?? 3,
                confidence: extraction.confidence,
                metadata,
                created_from_message_id: sourceMessageId,
            })
            .select("id")
            .single();

        if (eventError || !event) {
            throw new Error(
                `Failed to create timeline event: ${eventError?.message ?? "unknown error"
                }`,
            );
        }

        const { error: evidenceError } = await supabase
            .from("timeline_event_evidence")
            .insert({
                event_id: event.id,
                user_id: userId,
                timeline_id: timelineId,
                source_message_id: sourceMessageId,
                action: "create",
                evidence: extraction.evidence,
                confidence: extraction.confidence, // REQUIRED
                changes: {
                    title: extraction.title,
                    description: extraction.description,
                    eventType: extraction.eventType,
                    status: extraction.status,
                    startAt: extraction.startAt,
                    endAt: extraction.endAt,
                    timePrecision: extraction.timePrecision,
                    certainty: extraction.certainty,
                    confidence: extraction.confidence,
                },
            });

        if (evidenceError) {
            throw new Error(
                `Failed to save event evidence: ${evidenceError.message}`,
            );
        }

        console.info("[TIMELINE EVENT] created", {
            timelineId,
            eventId: event.id,
            sourceMessageId,
        });

        return {
            extraction,
            action: "create",
            eventId: event.id,
        };
    }

    // ---------------------------------------------------------
    // UPDATE
    // ---------------------------------------------------------

    if (
        extraction.action === "update" &&
        extraction.candidateEventId
    ) {
        const { data: existingEvent, error: existingError } =
            await supabase
                .from("timeline_events")
                .select(
                    `
                    id,
                    title,
                    description,
                    event_type,
                    status,
                    start_at,
                    end_at,
                    time_precision,
                    raw_time_text,
                    importance,
                    confidence,
                    metadata
                    `,
                )
                .eq("id", extraction.candidateEventId)
                .eq("user_id", userId)
                .eq("timeline_id", timelineId)
                .maybeSingle<TimelineEventRow>();

        if (existingError) {
            throw new Error(
                `Failed to load event for update: ${existingError.message}`,
            );
        }

        if (!existingEvent) {
            console.warn(
                "[TIMELINE EVENT] candidate event not found",
                {
                    timelineId,
                    candidateEventId:
                        extraction.candidateEventId,
                },
            );

            return {
                extraction,
                action: "none",
                eventId: null,
            };
        }

        const updatedMetadata = {
            ...(existingEvent.metadata ?? {}),
            certainty: extraction.certainty,
        };

        const nextValues = {
            title:
                extraction.title ??
                existingEvent.title,

            description:
                extraction.description ??
                existingEvent.description,

            event_type:
                extraction.eventType ??
                existingEvent.event_type,

            status:
                extraction.status ??
                existingEvent.status,

            start_at:
                extraction.startAt ??
                existingEvent.start_at,

            end_at:
                extraction.endAt ??
                existingEvent.end_at,

            time_precision:
                extraction.timePrecision !== "unknown"
                    ? extraction.timePrecision
                    : existingEvent.time_precision,

            raw_time_text:
                extraction.rawTimeText ??
                existingEvent.raw_time_text,

            importance:
                extraction.importance ??
                existingEvent.importance,

            confidence:
                extraction.confidence,

            metadata: updatedMetadata,

            updated_from_message_id:
                sourceMessageId,

            updated_at:
                new Date().toISOString(),
        };

        const { error: updateError } = await supabase
            .from("timeline_events")
            .update(nextValues)
            .eq("id", existingEvent.id)
            .eq("user_id", userId)
            .eq("timeline_id", timelineId);

        if (updateError) {
            throw new Error(
                `Failed to update timeline event: ${updateError.message}`,
            );
        }

        const { error: evidenceError } = await supabase
            .from("timeline_event_evidence")
            .insert({
                event_id: existingEvent.id,
                user_id: userId,
                timeline_id: timelineId,
                source_message_id: sourceMessageId,
                confidence: extraction.confidence,
                action: "update",
                evidence:
                    extraction.evidence ?? userMessage,
                changes: {
                    before: {
                        title: existingEvent.title,
                        status: existingEvent.status,
                        startAt: existingEvent.start_at,
                        endAt: existingEvent.end_at,
                    },
                    after: {
                        title: nextValues.title,
                        status: nextValues.status,
                        startAt: nextValues.start_at,
                        endAt: nextValues.end_at,
                    },
                },
            });

        if (evidenceError) {
            throw new Error(
                `Failed to save event update evidence: ${evidenceError.message}`,
            );
        }

        console.info("[TIMELINE EVENT] updated", {
            timelineId,
            eventId: existingEvent.id,
            sourceMessageId,
        });

        return {
            extraction,
            action: "update",
            eventId: existingEvent.id,
        };
    }

    // Update without a safe candidate ID:
    // never guess which event the user meant.
    console.warn(
        "[TIMELINE EVENT] update without candidateEventId",
        {
            timelineId,
            sourceMessageId,
            title: extraction.title,
        },
    );

    return {
        extraction,
        action: "none",
        eventId: null,
    };
}