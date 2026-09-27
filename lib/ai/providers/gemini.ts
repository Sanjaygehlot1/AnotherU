import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured");
}

const ai = new GoogleGenAI({
  apiKey,
});

const MODEL = "gemini-3.8-flash";

const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    status?: number;
    code?: number;
  };

  const status = candidate.status ?? candidate.code;

  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export async function generateGeminiResponse(
  systemPrompt: string,
  userMessage: string,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}

<user_message>
${userMessage}
</user_message>`,
              },
            ],
          },
        ],
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error("Gemini returned an empty response");
      }

      return text;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      // Exponential backoff:
      // ~1s → ~2s → ~4s
      const baseDelay = 1000 * 2 ** attempt;

      // Small random jitter prevents synchronized retries.
      const jitter = Math.floor(Math.random() * 500);

      await sleep(baseDelay + jitter);
    }
  }

  throw lastError ?? new Error("Gemini request failed");
}