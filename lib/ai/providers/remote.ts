import type { ZodType } from "zod";
import type { AIProvider } from "../provider";

const baseURL = process.env.REMOTE_AI_URL;

const token = process.env.REMOTE_AI_TOKEN;

if (!baseURL) {
  throw new Error("REMOTE_AI_URL is not configured");
}

if (!token) {
  throw new Error("REMOTE_AI_TOKEN is not configured");
}

type GenerateResponse = {
  text: string;
};

async function generate(
  model: string,
  system: string,
  user: string,
  maxNewTokens = 150,
): Promise<string> {
  const response = await fetch(`${baseURL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      system,
      user,
      max_new_tokens: maxNewTokens,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Remote AI request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as GenerateResponse;

  if (!data.text || typeof data.text !== "string") {
    throw new Error("Remote AI returned an invalid response");
  }

  return data.text.trim();
}

export const remoteProvider: AIProvider = {
  async generateText({ model, system, user }) {
    return generate(model, system, user);
  },

  async generateStructured<T>(
    {
      model,
      system,
      user,
    }: {
      model: string;
      system: string;
      user: string;
    },
    schema: ZodType<T>,
  ): Promise<T> {
    const text = await generate(
      model,
      `${system}

Return ONLY valid JSON.
Do not use markdown fences.
Do not include explanations outside the JSON.`,
      user,
      300,
    );

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Remote AI returned invalid JSON");
    }

    return schema.parse(parsed);
  },
};