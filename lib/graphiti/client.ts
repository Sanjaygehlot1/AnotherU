import "server-only";

export type GraphitiFact = {
  fact: string;
  valid_at: string | null;
  invalid_at: string | null;
};

type AddTimelineEpisodeInput = {
    timelineId: string;
    sourceMessageId: string;
    speaker: string;
    content: string;
    referenceTime: string;
};

type SearchTimelineFactsInput = {
  timelineId: string;
  query: string;
  numResults?: number;
};

const GRAPHITI_URL = process.env.GRAPHITI_SERVICE_URL;
const GRAPHITI_TOKEN = process.env.GRAPHITI_SERVICE_TOKEN;

function getConfig() {
  if (!GRAPHITI_URL) {
    throw new Error(
      "GRAPHITI_SERVICE_URL is not configured.",
    );
  }

  if (!GRAPHITI_TOKEN) {
    throw new Error(
      "GRAPHITI_SERVICE_TOKEN is not configured.",
    );
  }

  return {
    url: GRAPHITI_URL.replace(/\/$/, ""),
    token: GRAPHITI_TOKEN,
  };
}

async function graphitiRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const { url, token } = getConfig();

  const response = await fetch(
    `${url}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Graphiti request failed (${response.status}): ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function addTimelineEpisode(
  input: AddTimelineEpisodeInput,
) {
  return graphitiRequest<{
    status: string;
    timeline_id: string;
    group_id: string;
    episode_uuid: string;
    nodes: number;
    edges: number;
  }>("/episodes", {
    method: "POST",
    body: JSON.stringify({
        timeline_id: input.timelineId,
        source_message_id: input.sourceMessageId,
        speaker: input.speaker,
        content: input.content,
        reference_time: input.referenceTime,
    }),
  });
}

export async function searchTimelineFacts(
  input: SearchTimelineFactsInput,
): Promise<GraphitiFact[]> {
  const result = await graphitiRequest<{
    status: string;
    timeline_id: string;
    facts: GraphitiFact[];
  }>("/search", {
    method: "POST",
    body: JSON.stringify({
      timeline_id: input.timelineId,
      query: input.query,
      num_results: input.numResults ?? 6,
    }),
  });

  return result.facts;
}