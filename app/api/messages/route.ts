import { NextResponse } from "next/server";
import { buildTimelineContext } from "@/lib/ai/context";
import { streamPresentYouResponse } from "@/lib/ai/gateway";
import { createClient } from "@/lib/supabase/server";


function sse(event: string, data: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
                {
                    error: "Conversation ID and message are required.",
                },
                { status: 400 },
            );
        }

        if (content.length > 4000) {
            return NextResponse.json(
                {
                    error: "Message is too long.",
                },
                { status: 400 },
            );
        }

        // Verify conversation ownership.
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

        // Persist the user message before starting generation.
        const {
            data: userMessage,
            error: userMessageError,
        } = await supabase
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
            console.error(
                "User message creation failed:",
                userMessageError,
            );

            return NextResponse.json(
                { error: "Could not save your message." },
                { status: 500 },
            );
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                const enqueue = (event: string, data: unknown) => {
                    controller.enqueue(
                        encoder.encode(sse(event, data)),
                    );
                };

                try {
                    // Let the client know the persisted user message.
                    enqueue("user_message", {
                        message: userMessage,
                    });

                    const context = await buildTimelineContext(
                        conversation.timeline_id,
                        conversation.id,
                    );

                    let assistantContent = "";

                    for await (const token of streamPresentYouResponse(
                        context,
                        content,
                    )) {
                        // Stop cleanly if the browser disconnected.
                        if (request.signal.aborted) {
                            break;
                        }

                        assistantContent += token;

                        enqueue("token", {
                            text: token,
                        });
                    }

                    // Do not persist an incomplete assistant response
                    // when the client disconnected.
                    if (request.signal.aborted) {
                        controller.close();
                        return;
                    }

                    const finalContent = assistantContent.trim();

                    if (!finalContent) {
                        throw new Error(
                            "AI returned an empty response",
                        );
                    }

                    // Persist the complete assistant response ONCE.
                    const {
                        data: assistantMessage,
                        error: assistantError,
                    } = await supabase
                        .from("messages")
                        .insert({
                            conversation_id: conversation.id,
                            user_id: user.id,
                            role: "assistant",
                            content: finalContent,
                        })
                        .select("id, role, content, created_at")
                        .single();

                    if (assistantError || !assistantMessage) {
                        console.error(
                            "Assistant message creation failed:",
                            assistantError,
                        );

                        throw new Error(
                            "Could not save the assistant response.",
                        );
                    }

                    // Queue durable memory extraction.
                    //
                    // This is intentionally best-effort.
                    // Conversation persistence must not depend on
                    // the memory worker being available.
                    const { error: jobError } =
                        await supabase
                            .from("memory_jobs")
                            .insert({
                                user_id: user.id,
                                timeline_id:
                                    conversation.timeline_id,
                                source_message_id:
                                    userMessage.id,
                            });

                    if (jobError && jobError.code !== "23505") {
                        console.error(
                            "[MEMORY JOB] enqueue failed",
                            jobError,
                        );
                    }

                    // Update conversation activity.
                    const { error: conversationUpdateError } =
                        await supabase
                            .from("conversations")
                            .update({
                                updated_at:
                                    new Date().toISOString(),
                            })
                            .eq("id", conversation.id)
                            .eq("user_id", user.id);

                    if (conversationUpdateError) {
                        console.error(
                            "Conversation update failed:",
                            conversationUpdateError,
                        );
                    }

                    enqueue("done", {
                        message: assistantMessage,
                    });

                    controller.close();
                } catch (error) {
                    console.error(
                        "Message streaming error:",
                        error,
                    );

                    if (!request.signal.aborted) {
                        enqueue("error", {
                            error: "Something went wrong.",
                        });

                        controller.close();
                    }
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type":
                    "text/event-stream; charset=utf-8",
                "Cache-Control":
                    "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error) {
        console.error("Message API error:", error);

        return NextResponse.json(
            { error: "Something went wrong." },
            { status: 500 },
        );
    }
}