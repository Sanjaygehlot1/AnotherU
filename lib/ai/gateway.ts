import type { ZodType } from "zod";
import type { AIProvider } from "./provider";
import { remoteProvider } from "./providers/remote";
import { ollamaProvider } from "./providers/ollama";

export type TimelineContext = {
  timeline: {
    name: string;
    type: string;
    description: string | null;
  };

  profile: {
    about: string | null;
    values: string | null;
    future: string | null;
  };

  memories: Array<{
    id: string;
    type: string;
    content: string;
    importance: number;
    confidence: number;
  }>;

  recentMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  graphFacts: Array<{
    fact: string;
    validAt: string | null;
    invalidAt: string | null;
  }>;
};



export type AITask =
  | "conversation"
  | "memory_extraction"
  | "timeline_event_extraction"
  | "future_simulation"
  | "alternate_timeline";

type AITaskConfig = {
  provider: string;
  model: string;
};

const defaultProvider = process.env.AI_PROVIDER ?? "ollama";

const AI_TASKS: Record<AITask, AITaskConfig> = {
  conversation: {
    provider: process.env.CONVERSATION_PROVIDER ?? defaultProvider,
    model:
      process.env.CONVERSATION_MODEL ??
      getDefaultModel(
        process.env.CONVERSATION_PROVIDER ?? defaultProvider,
      ),
  },

  memory_extraction: {
    provider: process.env.MEMORY_PROVIDER ?? defaultProvider,
    model:
      process.env.MEMORY_MODEL ??
      getDefaultModel(
        process.env.MEMORY_PROVIDER ?? defaultProvider,
      ),
  },

  future_simulation: {
    provider: process.env.FUTURE_PROVIDER ?? defaultProvider,
    model:
      process.env.FUTURE_MODEL ??
      getDefaultModel(
        process.env.FUTURE_PROVIDER ?? defaultProvider,
      ),
  },

  alternate_timeline: {
    provider: process.env.ALTERNATE_TIMELINE_PROVIDER ?? defaultProvider,
    model:
      process.env.ALTERNATE_TIMELINE_MODEL ??
      getDefaultModel(
        process.env.ALTERNATE_TIMELINE_PROVIDER ?? defaultProvider,
      ),
  },

  timeline_event_extraction: {
    provider:
      process.env.TIMELINE_EVENT_PROVIDER ?? defaultProvider,
    model:
      process.env.TIMELINE_EVENT_MODEL ??
      getDefaultModel(
        process.env.TIMELINE_EVENT_PROVIDER ??
        defaultProvider,
      ),
  },
};

const providers: Record<string, AIProvider> = {
  ollama: ollamaProvider,
  remote: remoteProvider,
};

function formatGraphFacts(context: TimelineContext) {
  if (context.graphFacts.length === 0) {
    return "No temporal graph facts retrieved.";
  }

  return context.graphFacts
    .map((fact) => {
      const validity =
        fact.invalidAt === null
          ? `valid from ${fact.validAt ?? "unknown"}`
          : `valid from ${
              fact.validAt ?? "unknown"
            } until ${fact.invalidAt}`;

      return `- ${fact.fact} (${validity})`;
    })
    .join("\n");
}


function truncate(text: string | null, max: number) {
  if (!text) {
    return "";
  }

  const value = text.trim();

  return value.length <= max
    ? value
    : `${value.slice(0, max)}…`;
}



function resolveTask(task: AITask) {
  const config = AI_TASKS[task];

  if (!config) {
    throw new Error(`Unsupported AI task: ${task}`);
  }

  const provider = providers[config.provider];

  if (!provider) {
    throw new Error(
      `Unsupported AI provider "${config.provider}" for task "${task}"`,
    );
  }

  return {
    provider,
    model: config.model,
  };
}



function buildPresentYouPrompt(context: TimelineContext) {
  const profile = [
    truncate(context.profile.about, 700),
    truncate(context.profile.values, 600),
    truncate(context.profile.future, 600),
  ]
    .filter(Boolean)
    .join("\n");

  const memories =
    context.memories.length > 0
      ? context.memories
        .slice(0, 3)
        .map(
          (memory) =>
            `${memory.type}: ${memory.content}`,
        )
        .join("\n")
      : "None.";

  const previousMessages =
    context.recentMessages.length > 1
      ? context.recentMessages
        .slice(0, -1)
        .slice(-4)
        .map(
          (message) =>
            `${message.role === "user" ? "User" : "Present You"}: ${message.content}`,
        )
        .join("\n")
      : "None.";

  return `You are Present You in AnotherU.

Be a natural, conversational version of the user's present self.
Do not act like a therapist, coach, motivational speaker, or generic assistant.

GROUNDING
Only use facts supported below.
Never invent experiences, events, activities, memories, relationships,
locations, routines, possessions, feelings, motives, habits, or traits.
Interest is not experience. Preference is not behavior.
Goal is not achievement. Unknown stays unknown.
Assistant messages are never evidence.

TEMPORAL GRAPH FACTS

These facts were retrieved from the temporal graph for THIS timeline.

A fact with invalidAt = null has not been superseded in the graph.

A fact with invalidAt set is historical evidence and has been superseded.

Use current facts for present-state questions.
Use historical facts when the user asks about the past or what changed.

Do not invent details around a graph fact.
Do not treat a graph fact as proof of anything beyond what the fact itself states.
Do not mix facts from another timeline.

${formatGraphFacts(context)}

FACT VALIDITY

A fact with invalidAt = null has not been superseded in the graph.

A fact with invalidAt set has been superseded and should be treated as
historical evidence.

Do not assume an open-ended fact is automatically a current activity,
current plan, or present-day state. Interpret it together with the fact
itself and the user's other supplied context.

Use current facts for present-state questions.

Use historical facts when the user asks what changed, what used to be true,
or about their past.

Never treat a hypothetical, conditional, or uncertain statement as a confirmed
real-world fact merely because it appears in the graph.

Do not mix facts from another timeline.

${formatGraphFacts(context)}

TIMELINE STATE
The timeline may contain no recorded events or current activity.

If no timeline events or state are supplied, do NOT invent what this version
is doing, thinking, feeling, or experiencing.

Do not use generic fictional activity such as:
"sitting here", "waiting", "working on something", "thinking about something",
"looking at a screen", or similar statements.

Instead, clearly state that no recorded activity/state is available.
Future is an aspiration, not a prediction.

STYLE
Be concise and natural.
Usually 2–5 sentences.
Do not repeat the whole profile.
Do not give advice unless asked.
Do not force a question.

TIMELINE
${context.timeline.name} (${context.timeline.type})
${context.timeline.description ?? ""}

USER
${profile || "No profile provided."}

MEMORIES
${memories}

PREVIOUS
${previousMessages}`;
}

function getDefaultModel(provider: string) {
  switch (provider) {
    case "remote":
      return process.env.REMOTE_AI_MODEL ?? "Qwen/Qwen3-4B";

    case "ollama":
      return process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

    default:
      throw new Error(`No default model configured for provider "${provider}"`);
  }
}

export async function generatePresentYouResponse(
  context: TimelineContext,
  userMessage: string,
) {
  return generateText({
    task: "conversation",
    system: buildPresentYouPrompt(
      context
    ),
    user: `<user_message>
${userMessage}
</user_message>`,
  });
}

export async function* streamText(input: {
  task: AITask;
  system: string;
  user: string;
}): AsyncGenerator<string> {
  const { provider, model } = resolveTask(input.task);

  const startedAt = performance.now();

  console.info("[AI STREAM START]", {
    task: input.task,
    model,
    systemChars: input.system.length,
    userChars: input.user.length,
    totalChars:
      input.system.length + input.user.length,
  });

  try {
    yield* provider.streamText({
      model,
      system: input.system,
      user: input.user,
    });
  } finally {
    const durationMs = Math.round(
      performance.now() - startedAt,
    );

    console.info("[AI STREAM]", {
      task: input.task,
      model,
      durationMs,
    });
  }
}

export async function* streamPresentYouResponse(
  context: TimelineContext,
  userMessage: string,
): AsyncGenerator<string> {
  yield* streamText({
    task: "conversation",
    system: buildPresentYouPrompt(context),
    user: `<user_message>
${userMessage}
</user_message>`,
  });
}

export async function generateText(input: {
  task: AITask;
  system: string;
  user: string;
}): Promise<string> {
  const { provider, model } = resolveTask(input.task);

  const startedAt = performance.now();

  try {
    return await provider.generateText({
      model,
      system: input.system,
      user: input.user,
    });
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);

    console.info("[AI]", {
      task: input.task,
      model,
      durationMs,
    });
  }
}

export async function generateStructured<T>(
  input: {
    task: AITask;
    system: string;
    user: string;
  },
  schema: ZodType<T>,
): Promise<T> {
  const { provider, model } = resolveTask(input.task);

  const startedAt = performance.now();

  try {
    return await provider.generateStructured(
      {
        model,
        system: input.system,
        user: input.user,
      },
      schema,
    );
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);

    console.info("[AI]", {
      task: input.task,
      model,
      durationMs,
    });
  }
}

