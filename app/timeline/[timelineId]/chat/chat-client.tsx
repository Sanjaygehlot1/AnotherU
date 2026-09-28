"use client";

import { FormEvent, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type SSEEvent =
  | {
      event: "user_message";
      data: {
        message: Message;
      };
    }
  | {
      event: "token";
      data: {
        text: string;
      };
    }
  | {
      event: "done";
      data: {
        message: Message;
      };
    }
  | {
      event: "error";
      data: {
        error: string;
      };
    };

function parseSSEBlock(block: string): SSEEvent | null {
  const lines = block.split("\n");

  let event = "";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }

    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!event || !data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);

    switch (event) {
      case "user_message":
        return {
          event,
          data: parsed,
        };

      case "token":
        return {
          event,
          data: parsed,
        };

      case "done":
        return {
          event,
          data: parsed,
        };

      case "error":
        return {
          event,
          data: parsed,
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function ChatClient({
  timelineId,
}: {
  timelineId: string;
}) {
  const [conversationId, setConversationId] =
    useState<string | null>(null);

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

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const content = input.trim();

    if (!content || isSending) {
      return;
    }

    setError("");
    setIsSending(true);

    const streamingAssistantId =
      crypto.randomUUID();

    try {
      const activeConversationId =
        await getConversation();

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: activeConversationId,
          timelineId,
          content,
        }),
      });

      /*
       * These errors happen before streaming starts.
       * In that case the route returns normal JSON.
       */
      if (!response.ok) {
        let message = "Could not send message.";

        try {
          const data = await response.json();

          if (
            data &&
            typeof data.error === "string"
          ) {
            message = data.error;
          }
        } catch {
          // Ignore JSON parsing failure.
        }

        throw new Error(message);
      }

      if (!response.body) {
        throw new Error(
          "Streaming response unavailable.",
        );
      }

      const reader =
        response.body.getReader();

      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } =
          await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        /*
         * SSE events are separated by a blank line.
         *
         * A network chunk does NOT necessarily contain
         * one complete event, so we keep the remaining
         * partial event in `buffer`.
         */
        const blocks = buffer.split(
          /\r?\n\r?\n/,
        );

        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsed =
            parseSSEBlock(block);

          if (!parsed) {
            continue;
          }

          switch (parsed.event) {
            case "user_message": {
              setMessages((previous) => [
                ...previous,
                parsed.data.message,
              ]);

              setInput("");

              break;
            }

            case "token": {
              const token =
                parsed.data.text;

              setMessages((previous) => {
                const existing =
                  previous.find(
                    (message) =>
                      message.id ===
                      streamingAssistantId,
                  );

                if (existing) {
                  return previous.map(
                    (message) =>
                      message.id ===
                      streamingAssistantId
                        ? {
                            ...message,
                            content:
                              message.content +
                              token,
                          }
                        : message,
                  );
                }

                return [
                  ...previous,
                  {
                    id: streamingAssistantId,
                    role: "assistant",
                    content: token,
                  },
                ];
              });

              break;
            }

            case "done": {
              const assistantMessage =
                parsed.data.message;

              /*
               * Replace the temporary streaming
               * message with the persisted DB message.
               */
              setMessages((previous) => {
                const exists =
                  previous.some(
                    (message) =>
                      message.id ===
                      streamingAssistantId,
                  );

                if (!exists) {
                  return [
                    ...previous,
                    assistantMessage,
                  ];
                }

                return previous.map(
                  (message) =>
                    message.id ===
                    streamingAssistantId
                      ? assistantMessage
                      : message,
                );
              });

              break;
            }

            case "error": {
              throw new Error(
                parsed.data.error ||
                  "Something went wrong.",
              );
            }
          }
        }
      }

      /*
       * Flush any remaining decoder bytes.
       */
      buffer += decoder.decode();

      /*
       * Process one final SSE event if the stream
       * ended without a trailing blank line.
       */
      if (buffer.trim()) {
        const parsed =
          parseSSEBlock(buffer);

        if (parsed?.event === "error") {
          throw new Error(
            parsed.data.error ||
              "Something went wrong.",
          );
        }

        if (parsed?.event === "done") {
          const assistantMessage =
            parsed.data.message;

          setMessages((previous) =>
            previous.map((message) =>
              message.id ===
              streamingAssistantId
                ? assistantMessage
                : message,
            ),
          );
        }
      }
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
          onChange={(event) =>
            setInput(event.target.value)
          }
          placeholder="Talk to Present You..."
          disabled={isSending}
          className="min-w-0 flex-1 rounded-full border border-border bg-card px-5 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={
            !input.trim() || isSending
          }
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}