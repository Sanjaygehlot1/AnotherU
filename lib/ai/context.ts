import { createClient } from "@/lib/supabase/server";
import { retrieveRelevantMemories } from "@/lib/memory/memory-retrieval";
import { searchTimelineFacts } from "@/lib/graphiti/client";
import type { TimelineContext } from "./gateway";

export async function buildTimelineContext(
    timelineId: string,
    conversationId: string,
): Promise<TimelineContext> {
    const supabase = await createClient();

    // 1. Authenticate the request
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        throw new Error("Unauthorized");
    }

    // 2. Load the requested timeline.
    //    The user_id check prevents accessing another user's timeline.
    const { data: timeline, error: timelineError } = await supabase
        .from("timelines")
        .select("name, type, description")
        .eq("id", timelineId)
        .eq("user_id", user.id)
        .single();

    if (timelineError || !timeline) {
        throw new Error("Timeline not found");
    }

    // 3. Load the user's global profile
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("about, values, future")
        .eq("id", user.id)
        .single();

    if (profileError || !profile) {
        throw new Error("Profile not found");
    }

    // 4. Load recent conversation history
    const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);

    if (messagesError) {
        throw new Error("Failed to load conversation");
    }

    // Newest → oldest from DB, oldest → newest for the model.
    const recentMessages = (messages ?? []).reverse();

    // 5. The latest user message is the retrieval query.
    const retrievalQuery =
        [...recentMessages]
            .reverse()
            .find((message) => message.role === "user")
            ?.content ?? "";

    // 6. Retrieve persistent memories + temporal Graphiti facts.
    //
    // Both are scoped to the authenticated user's requested timeline.
    const [retrievedMemories, graphFacts] = await Promise.all([
        retrievalQuery
            ? retrieveRelevantMemories({
                  userId: user.id,
                  timelineId,
                  query: retrievalQuery,
                  matchCount: 3,
                  minSimilarity: 0.72,
              })
            : Promise.resolve([]),

        retrievalQuery
            ? searchTimelineFacts({
                  timelineId,
                  query: retrievalQuery,
                  numResults: 6,
              }).catch((error) => {
                  // Graphiti is a retrieval layer.
                  // A temporary Graphiti failure must not break chat.
                  console.error(
                      "[GRAPHITI RETRIEVAL] failed:",
                      error,
                  );

                  return [];
              })
            : Promise.resolve([]),
    ]);

    // Do not expose memory retrieval internals such as similarity.
    const memories = retrievedMemories.map(
        ({ id, type, content, importance, confidence }) => ({
            id,
            type,
            content,
            importance,
            confidence,
        }),
    );

    // Convert Graphiti's API shape into the internal context shape.
    const formattedGraphFacts = graphFacts.map(
        ({ fact, valid_at, invalid_at }) => ({
            fact,
            validAt: valid_at,
            invalidAt: invalid_at,
        }),
    );

    console.info("[TIMELINE CONTEXT]", {
        timelineId,
        conversationId,
        recentMessages: recentMessages.length,
        retrievalQueryLength: retrievalQuery.length,
        retrievedMemories: memories.length,
        retrievedGraphFacts: formattedGraphFacts.length,
    });

    return {
        timeline,
        profile,
        memories,
        graphFacts: formattedGraphFacts,
        recentMessages,
    };
}