from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import (
    OpenAIRerankerClient,
)
from graphiti_core.embedder.openai import (
    OpenAIEmbedder,
    OpenAIEmbedderConfig,
)
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from anotheru_graphiti.ollama_openai import OllamaOpenAIClient
from graphiti_core.nodes import EpisodeType


load_dotenv()

NEO4J_URI = os.environ.get(
    "NEO4J_URI",
    "bolt://localhost:7687",
)
NEO4J_USER = os.environ.get(
    "NEO4J_USER",
    "neo4j",
)
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]

OLLAMA_BASE_URL = os.environ.get(
    "OLLAMA_BASE_URL",
    "http://127.0.0.1:11434/v1",
)

OLLAMA_MODEL = os.environ.get(
    "OLLAMA_MODEL",
    "qwen3.5:4b",
)

OLLAMA_EMBEDDING_MODEL = os.environ.get(
    "OLLAMA_EMBEDDING_MODEL",
    "nomic-embed-text",
)

GROUP_ID = os.environ.get(
    "GRAPHITI_GROUP_ID",
    "neo4j",
)


def create_graphiti() -> Graphiti:
    llm_config = LLMConfig(
        api_key="ollama",
        model=OLLAMA_MODEL,
        small_model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
    )

    ollama_client = OllamaOpenAIClient(
        api_key="ollama",
        base_url=OLLAMA_BASE_URL,
    )

    llm_client = OpenAIGenericClient(
        config=llm_config,
        client=ollama_client,
    )

    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            api_key="ollama",
            embedding_model=OLLAMA_EMBEDDING_MODEL,
            embedding_dim=768,
            base_url=OLLAMA_BASE_URL,
        ),
    )

    cross_encoder = OpenAIRerankerClient(
        client=llm_client,
        config=llm_config,
    )

    return Graphiti(
        NEO4J_URI,
        NEO4J_USER,
        NEO4J_PASSWORD,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
        max_coroutines=2,
    )


async def main():
    graphiti = create_graphiti()

    try:
        print("Building Graphiti indices...")
        await graphiti.build_indices_and_constraints()

        print("Adding test episode...")

        result = await graphiti.add_episode(
            name="anotheru-smoke-test",
            episode_body=(
                "Sanjay works at AnotherU Technologies. "
                "Sanjay lives in Mumbai. "
                "Sanjay uses Docker and Kubernetes. "
                "Sanjay is learning Japanese with Reshuu."
            ),
            source=EpisodeType.text,
            source_description="AnotherU Graphiti smoke test",
            reference_time=datetime.now(timezone.utc),
            group_id=GROUP_ID,
        )

        await graphiti.add_episode(
            name="anotheru-temporal-test",
            episode_body=(
                "Sanjay no longer lives in Mumbai. "
                "Sanjay now lives in Pune."
            ),
            source=EpisodeType.text,
            source_description="AnotherU temporal update test",
            reference_time=datetime.now(timezone.utc),
            group_id=GROUP_ID,
        )

        print(f"Episode UUID: {result.episode.uuid}")
        print(f"Extracted nodes: {len(result.nodes)}")
        print(f"Extracted edges: {len(result.edges)}")

        print("\n=== EXTRACTED EDGES ===")

        for edge in result.edges:
            print(f"{edge.fact}")

        print("Searching graph...")

        results = await graphiti.search(
            "Where does Sanjay live?",
            group_ids=[GROUP_ID],
            num_results=10,
        )

        print("\n=== FACT RESULTS ===")

        if not results:
            print("NO FACT RESULTS")
        else:
            for result in results:
                print(f"FACT: {result.fact}")
                print(f"VALID AT: {result.valid_at}")
                print(f"INVALID AT: {result.invalid_at}")
                print("---")

    finally:
        await graphiti.close()


if __name__ == "__main__":
    asyncio.run(main())