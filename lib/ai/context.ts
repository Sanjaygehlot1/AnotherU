import { createClient } from "@/lib/supabase/server";
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

  // 3. Load the user's profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("about, values, future")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Profile not found");
  }

  // 4. Load persistent memories belonging to this timeline
  const { data: memories, error: memoriesError } = await supabase
    .from("memories")
    .select("type, content, importance, confidence")
    .eq("user_id", user.id)
    .eq("timeline_id", timelineId)
    .order("importance", { ascending: false })
    .limit(30);

  if (memoriesError) {
    throw new Error("Failed to load memories");
  }

  // 5. Load recent conversation history
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (messagesError) {
    throw new Error("Failed to load conversation");
  }

  // We queried newest → oldest for efficiency,
  // but the AI should receive the conversation oldest → newest.
  const recentMessages = (messages ?? []).reverse();

  return {
    timeline,
    profile,
    memories: memories ?? [],
    recentMessages,
  };
}