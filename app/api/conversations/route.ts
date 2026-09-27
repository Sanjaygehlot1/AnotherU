import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const timelineId =
      typeof body.timelineId === "string" ? body.timelineId : "";

    if (!timelineId) {
      return NextResponse.json(
        { error: "Timeline ID is required." },
        { status: 400 },
      );
    }

    // Verify that this timeline belongs to the authenticated user.
    const { data: timeline, error: timelineError } = await supabase
      .from("timelines")
      .select("id")
      .eq("id", timelineId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (timelineError || !timeline) {
      return NextResponse.json(
        { error: "Timeline not found." },
        { status: 404 },
      );
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        timeline_id: timelineId,
      })
      .select("id, timeline_id, created_at")
      .single();

    if (error) {
      console.error("Conversation creation failed:", error);

      return NextResponse.json(
        { error: "Could not create conversation." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      conversation,
    });
  } catch (error) {
    console.error("Conversation API error:", error);

    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 },
    );
  }
}