import { createClient } from "@/lib/supabase/server";
import { retrieveRelevantMemories } from "@/lib/memory/memory-retrieval";
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

    // 2. Load the requested timeline
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

    // We queried newest → oldest for efficiency,
    // but the AI should receive the conversation oldest → newest.
    const recentMessages = (messages ?? []).reverse();

    // 5. Find the current/latest user message.
    //    /api/messages saves the user message before building context,
    //    so the latest user message is the retrieval query.
    const currentUserMessage =
        [...recentMessages]
            .reverse()
            .find((message) => message.role === "user")
            ?.content ?? "";

    // 6. Retrieve only semantically relevant ACTIVE memories
    //    from this exact timeline.
    const retrievedMemories = await retrieveRelevantMemories({
        userId: user.id,
        timelineId,
        query: currentUserMessage,
        matchCount: 3,
        minSimilarity: 0.72,
    });

    // Do not expose retrieval internals such as similarity
    // to the conversation model.
    const memories = retrievedMemories.map(
        ({ id, type, content, importance, confidence }) => ({
            id,
            type,
            content,
            importance,
            confidence,
        }),
    );

    console.info("[TIMELINE CONTEXT]", {
        timelineId,
        conversationId,
        recentMessages: recentMessages.length,
        currentUserMessageLength: currentUserMessage.length,
        retrievedMemories: memories.length,
    });

    return {
        timeline,
        profile,
        memories,
        recentMessages,
    };
}