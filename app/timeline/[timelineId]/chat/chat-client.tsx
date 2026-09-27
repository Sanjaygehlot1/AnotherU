"use client";

import { FormEvent, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function ChatClient({
  timelineId,
}: {
  timelineId: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(
    null,
  );

  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  async function getConversation() {
    if (conversationId) {
      return conversationId;
    }

    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timelineId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Could not create conversation.",
      );
    }

    setConversationId(data.conversation.id);

    return data.conversation.id as string;
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();

    if (!content || isSending) {
      return;
    }

    setError("");
    setIsSending(true);

    try {
      const activeConversationId = await getConversation();

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: activeConversationId,
          content,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not send message.",
        );
      }

      setMessages((previous) => [
        ...previous,
        data.userMessage,
        data.assistantMessage,
      ]);

      setInput("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-6 min-h-40 space-y-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Start the conversation.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[80%] rounded-2xl bg-foreground px-4 py-3 text-left text-sm text-background"
                  : "mr-auto max-w-[80%] rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm"
              }
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      {error && (
        <p className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <form
        onSubmit={sendMessage}
        className="flex gap-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Talk to Present You..."
          disabled={isSending}
          className="min-w-0 flex-1 rounded-full border border-border bg-card px-5 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!input.trim() || isSending}
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}