import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = 8787;
const TOKEN = "test-token";

const encoder = new TextEncoder();

function writeSse(
  response: ServerResponse<IncomingMessage>,
  data: string,
) {
  response.write(`data: ${data}\n\n`);
}

const server = createServer((request, response) => {
  if (
    request.method !== "POST" ||
    request.url !== "/v1/chat/completions"
  ) {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  response.write(": connected\n\n");

  const chunks = [
    "Hey",
    ", ",
    "this ",
    "is ",
    "a ",
    "streaming ",
    "response.",
  ];

  let index = 0;

  const interval = setInterval(() => {
    if (index >= chunks.length) {
      clearInterval(interval);
      writeSse(response, "[DONE]");
      response.end();
      return;
    }

    writeSse(
      response,
      JSON.stringify({
        id: "test-stream",
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {
              content: chunks[index],
            },
            finish_reason: null,
          },
        ],
      }),
    );

    index += 1;
  }, 100);

  request.on("close", () => {
    clearInterval(interval);
  });
});

async function main() {
  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  console.log(
    `[TEST SERVER] http://127.0.0.1:${PORT}`,
  );

  process.env.REMOTE_AI_URL =
    `http://127.0.0.1:${PORT}`;

  process.env.REMOTE_AI_TOKEN = TOKEN;

  const { remoteProvider } =
    await import("@/lib/ai/providers/remote");

  let output = "";

  console.log("[STREAM]");

  for await (const chunk of remoteProvider.streamText({
    model: "test-model",
    system: "You are a test assistant.",
    user: "Hello",
  })) {
    process.stdout.write(`[${chunk}]`);
    output += chunk;
  }

  console.log("\n");
  console.log("[RESULT]", output);

  const expected =
    "Hey, this is a streaming response.";

  if (output !== expected) {
    console.error("[FAIL] Unexpected streamed output.");
    console.error("Expected:", expected);
    console.error("Received:", output);
    process.exitCode = 1;
  } else {
    console.log("[PASS] Provider streaming contract works.");
  }

  server.close();
}

main().catch((error) => {
  console.error("[FAIL]", error);
  server.close();
  process.exitCode = 1;
});