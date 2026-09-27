import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const about = typeof body.about === "string" ? body.about.trim() : "";
    const values = typeof body.values === "string" ? body.values.trim() : "";
    const future = typeof body.future === "string" ? body.future.trim() : "";

    if (!about || !values || !future) {
      return NextResponse.json(
        { error: "All onboarding fields are required." },
        { status: 400 },
      );
    }

    // 1. Save the user's core profile.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        about,
        values,
        future,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("Profile creation failed:", profileError);

      return NextResponse.json(
        { error: "Could not save your profile." },
        { status: 500 },
      );
    }

    // 2. Find the user's primary timeline.
    let { data: timeline, error: timelineError } = await supabase
      .from("timelines")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "primary")
      .maybeSingle();

    if (timelineError) {
      console.error("Timeline lookup failed:", timelineError);

      return NextResponse.json(
        { error: "Could not load your timeline." },
        { status: 500 },
      );
    }

    // 3. Create the primary timeline only if it doesn't exist.
    if (!timeline) {
      const { data: newTimeline, error: createTimelineError } = await supabase
        .from("timelines")
        .insert({
          user_id: user.id,
          name: "My Timeline",
          type: "primary",
          description: "Your original timeline.",
        })
        .select("id")
        .single();

      if (createTimelineError || !newTimeline) {
        console.error(
          "Timeline creation failed:",
          createTimelineError,
        );

        return NextResponse.json(
          { error: "Could not create your timeline." },
          { status: 500 },
        );
      }

      timeline = newTimeline;
    }

    // 4. Remove old onboarding memories.
    //
    // This makes the endpoint safe to call again.
    // If the user changes their onboarding answers later,
    // we replace the old onboarding-derived memories.
    const { error: deleteMemoryError } = await supabase
      .from("memories")
      .delete()
      .eq("user_id", user.id)
      .eq("timeline_id", timeline.id)
      .eq("source", "onboarding");

    if (deleteMemoryError) {
      console.error(
        "Old onboarding memories could not be removed:",
        deleteMemoryError,
      );

      return NextResponse.json(
        { error: "Could not update your memories." },
        { status: 500 },
      );
    }

    // 5. Convert onboarding answers into persistent memories.
    const memories = [
      {
        user_id: user.id,
        timeline_id: timeline.id,
        type: "fact",
        content: about,
        importance: 4,
        confidence: 1,
        source: "onboarding",
      },
      {
        user_id: user.id,
        timeline_id: timeline.id,
        type: "belief",
        content: values,
        importance: 4,
        confidence: 1,
        source: "onboarding",
      },
      {
        user_id: user.id,
        timeline_id: timeline.id,
        type: "goal",
        content: future,
        importance: 5,
        confidence: 1,
        source: "onboarding",
      },
    ];

    const { error: memoryError } = await supabase
      .from("memories")
      .insert(memories);

    if (memoryError) {
      console.error("Memory creation failed:", memoryError);

      return NextResponse.json(
        { error: "Could not save your memories." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      timelineId: timeline.id,
    });
  } catch (error) {
    console.error("Onboarding error:", error);

    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 },
    );
  }
}