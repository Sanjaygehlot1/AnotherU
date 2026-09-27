import { NextResponse } from "next/server";
import { buildTimelineContext } from "@/lib/ai/context";
import { generatePresentYouResponse } from "@/lib/ai/gateway";
import { extractMemories } from "@/lib/ai/memory-extractor";
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

        const conversationId =
            typeof body.conversationId === "string"
                ? body.conversationId
                : "";

        const content =
            typeof body.content === "string"
                ? body.content.trim()
                : "";

        if (!conversationId || !content) {
            return NextResponse.json(
                { error: "Conversation ID and message are required." },
                { status: 400 },
            );
        }

        if (content.length > 4000) {
            return NextResponse.json(
                { error: "Message is too long." },
                { status: 400 },
            );
        }

        // Make sure this conversation belongs to the
        // authenticated user.
        const { data: conversation, error: conversationError } =
            await supabase
                .from("conversations")
                .select("id, timeline_id")
                .eq("id", conversationId)
                .eq("user_id", user.id)
                .maybeSingle();

        if (conversationError || !conversation) {
            return NextResponse.json(
                { error: "Conversation not found." },
                { status: 404 },
            );
        }

        // Save user message.
        const { data: userMessage, error: userMessageError } =
            await supabase
                .from("messages")
                .insert({
                    conversation_id: conversation.id,
                    user_id: user.id,
                    role: "user",
                    content,
                })
                .select("id, role, content, created_at")
                .single();

        if (userMessageError || !userMessage) {
            console.error("User message creation failed:", userMessageError);

            return NextResponse.json(
                { error: "Could not save your message." },
                { status: 500 },
            );
        }

        const context = await buildTimelineContext(
            conversation.timeline_id,
            conversation.id,
        );

        const assistantContent = await generatePresentYouResponse(
            context,
            content,
        );

        const { data: assistantMessage, error: assistantError } =
            await supabase
                .from("messages")
                .insert({
                    conversation_id: conversation.id,
                    user_id: user.id,
                    role: "assistant",
                    content: assistantContent,
                })
                .select("id, role, content, created_at")
                .single();

        if (assistantError || !assistantMessage) {
            console.error(
                "Assistant message creation failed:",
                assistantError,
            );

            return NextResponse.json(
                { error: "Could not save the assistant response." },
                { status: 500 },
            );
        }

        // Extract durable memories from the user's message.
        //
        // Memory extraction is intentionally best-effort.
        // A memory extraction failure must not break the conversation.
        try {
            const extraction = await extractMemories(content);

            if (extraction.memories.length > 0) {
                const memoryRows = extraction.memories.map((memory) => ({
                    user_id: user.id,
                    timeline_id: conversation.timeline_id,
                    type: memory.type,
                    content: memory.content,
                    importance: memory.importance,
                    confidence: memory.confidence,
                    source: "conversation",
                    source_message_id: userMessage.id,
                    status: "active",
                }));

                const { error: memoryError } = await supabase
                    .from("memories")
                    .insert(memoryRows);

                if (memoryError) {
                    console.error(
                        "Memory persistence failed:",
                        memoryError,
                    );
                }
            }
        } catch (memoryExtractionError) {
            console.error(
                "Memory extraction failed:",
                memoryExtractionError,
            );
        }

        // Update conversation activity.
        await supabase
            .from("conversations")
            .update({
                updated_at: new Date().toISOString(),
            })
            .eq("id", conversation.id)
            .eq("user_id", user.id);

        return NextResponse.json({
            userMessage,
            assistantMessage,
        });
    } catch (error) {
        console.error("Message API error:", error);

        return NextResponse.json(
            { error: "Something went wrong." },
            { status: 500 },
        );
    }
}