import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type RetrievedTimelineEvent = {
    id: string;
    title: string;
    description: string | null;
    eventType: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    timePrecision: string;
    importance: number;
    confidence: number;
    createdAt: string;
    updatedAt: string;
    relevance: number;
};

const DEFAULT_MATCH_COUNT = 5;

type EventRow = {
    id: string;
    title: string;
    description: string | null;
    event_type: string;
    status: string;
    start_at: string | null;
    end_at: string | null;
    time_precision: string;
    importance: number;
    confidence: number;
    created_at: string;
    updated_at: string;
    relevance?: number | null;
};

function mapEvent(
    event: EventRow,
    relevance: number,
): RetrievedTimelineEvent {
    return {
        id: event.id,
        title: event.title,
        description: event.description,
        eventType: event.event_type,
        status: event.status,
        startAt: event.start_at,
        endAt: event.end_at,
        timePrecision: event.time_precision,
        importance: event.importance,
        confidence: event.confidence,
        createdAt: event.created_at,
        updatedAt: event.updated_at,
        relevance,
    };
}

export async function retrieveRelevantTimelineEvents(input: {
    userId: string;
    timelineId: string;
    query: string;
    matchCount?: number;
}): Promise<RetrievedTimelineEvent[]> {
    const {
        userId,
        timelineId,
        query,
        matchCount = DEFAULT_MATCH_COUNT,
    } = input;

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        return [];
    }

    /*
     * Three candidate sources:
     *
     * 1. Text matches
     *    "What happened with my internship?"
     *
     * 2. Active events
     *    "What am I doing these days?"
     *
     * 3. Recently updated events
     *    "What have I been working on lately?"
     */
    const [textResult, activeResult, recentResult] =
        await Promise.all([
            supabase.rpc("match_timeline_events", {
                p_user_id: userId,
                p_timeline_id: timelineId,
                p_query: trimmedQuery,
                p_match_count: Math.min(matchCount, 20),
            }),

            supabase
                .from("timeline_events")
                .select(
                    [
                        "id",
                        "title",
                        "description",
                        "event_type",
                        "status",
                        "start_at",
                        "end_at",
                        "time_precision",
                        "importance",
                        "confidence",
                        "created_at",
                        "updated_at",
                    ].join(","),
                )
                .eq("user_id", userId)
                .eq("timeline_id", timelineId)
                .in("status", ["ongoing", "planned"])
                .order("start_at", {
                    ascending: true,
                    nullsFirst: false,
                })
                .limit(5),

            supabase
                .from("timeline_events")
                .select(
                    [
                        "id",
                        "title",
                        "description",
                        "event_type",
                        "status",
                        "start_at",
                        "end_at",
                        "time_precision",
                        "importance",
                        "confidence",
                        "created_at",
                        "updated_at",
                    ].join(","),
                )
                .eq("user_id", userId)
                .eq("timeline_id", timelineId)
                .order("updated_at", {
                    ascending: false,
                })
                .limit(5),
        ]);

    if (textResult.error) {
        throw new Error(
            `Failed to retrieve event matches: ${textResult.error.message}`,
        );
    }

    if (activeResult.error) {
        throw new Error(
            `Failed to retrieve active events: ${activeResult.error.message}`,
        );
    }

    if (recentResult.error) {
        throw new Error(
            `Failed to retrieve recent events: ${recentResult.error.message}`,
        );
    }

    const candidates = new Map<
        string,
        {
            event: EventRow;
            score: number;
        }
    >();

    // 1. Text relevance
    for (const event of (textResult.data ?? []) as EventRow[]) {
        candidates.set(event.id, {
            event,
            score: Number(event.relevance ?? 0),
        });
    }

    // 2. Active-state boost
    for (const event of (activeResult.data ?? []) as any) {
        const existing = candidates.get(event.id);

        const statusBoost =
            event.status === "ongoing"
                ? 0.35
                : 0.20;

        const importanceBoost =
            Number(event.importance ?? 0) * 0.04;

        const score =
            (existing?.score ?? 0) +
            statusBoost +
            importanceBoost;

        candidates.set(event.id, {
            event,
            score,
        });
    }

    // 3. Recent-update boost
    for (const event of (recentResult.data ?? []) as any) {
        const existing = candidates.get(event.id);

        const score =
            (existing?.score ?? 0) +
            0.15 +
            Number(event.importance ?? 0) * 0.02;

        candidates.set(event.id, {
            event,
            score,
        });
    }

    const events = [...candidates.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(matchCount, 20))
        .map(({ event, score }) =>
            mapEvent(event, score),
        );

    console.info("[EVENT RETRIEVAL]", {
        timelineId,
        query: trimmedQuery,
        textMatches: textResult.data?.length ?? 0,
        activeCandidates: activeResult.data?.length ?? 0,
        recentCandidates: recentResult.data?.length ?? 0,
        returned: events.length,
    });

    return events;
}