import type {
    EventAction,
    EventStatus,
    EventType,
    TimePrecision,
} from "./schema";

export type TimelineEventCandidate = {
    action: EventAction;

    title: string;
    description: string | null;

    eventType: EventType;

    status: EventStatus | null;

    startAt: string | null;
    endAt: string | null;

    timePrecision: TimePrecision;
    rawTimeText: string | null;

    importance: number;
    confidence: number;

    evidence: string;

    metadata: Record<string, unknown>;
};

export type TimelineEventExtractionResult = {
    events: TimelineEventCandidate[];
};