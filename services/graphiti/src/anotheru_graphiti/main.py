from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.embedder.openai import (
    OpenAIEmbedder,
    OpenAIEmbedderConfig,
)
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from anotheru_graphiti.ollama_openai import OllamaOpenAIClient
from graphiti_core.nodes import EpisodeType
from pydantic import BaseModel, Field
import hmac
from uuid import UUID

from fastapi import Header

load_dotenv()


NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")

OLLAMA_BASE_URL = os.environ.get(
    "OLLAMA_BASE_URL",
    "http://127.0.0.1:11434/v1",
)
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.5:4b")
OLLAMA_EMBEDDING_MODEL = os.environ.get(
    "OLLAMA_EMBEDDING_MODEL",
    "nomic-embed-text",
)

GRAPHITI_SERVICE_TOKEN = os.environ.get(
    "GRAPHITI_SERVICE_TOKEN",
    "",
)

GRAPHITI_GROUP_ID = os.environ.get(
    "GRAPHITI_GROUP_ID",
    NEO4J_DATABASE,
)

GRAPHITI_MAX_COROUTINES = int(
    os.environ.get("GRAPHITI_MAX_COROUTINES", "2")
)

def timeline_group_id(timeline_id: UUID) -> str:
    return f"anotheru-timeline-{timeline_id}"


def require_service_token(authorization: str | None) -> None:
    if not GRAPHITI_SERVICE_TOKEN:
        raise RuntimeError(
            "GRAPHITI_SERVICE_TOKEN is not configured"
        )

    expected = f"Bearer {GRAPHITI_SERVICE_TOKEN}"

    if not authorization or not hmac.compare_digest(
        authorization,
        expected,
    ):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
        )


def create_graphiti() -> Graphiti:
    if not NEO4J_PASSWORD:
        raise RuntimeError("NEO4J_PASSWORD is not configured")

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
        max_coroutines=GRAPHITI_MAX_COROUTINES,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    graphiti = create_graphiti()

    await graphiti.build_indices_and_constraints()

    app.state.graphiti = graphiti

    import asyncio

    # Graphiti recommends sequential episode ingestion.
    app.state.ingest_lock = asyncio.Lock()

    print("Graphiti initialized.")
    print(f"Neo4j: {NEO4J_URI}")
    print(f"Neo4j database: {NEO4J_DATABASE}")
    print(f"Ollama model: {OLLAMA_MODEL}")
    print(f"Embedding model: {OLLAMA_EMBEDDING_MODEL}")

    try:
        yield
    finally:
        await graphiti.close()
        print("Graphiti connection closed.")


app = FastAPI(
    title="AnotherU Graphiti Service",
    version="0.1.0",
    lifespan=lifespan,
)


class EpisodeRequest(BaseModel):
    timeline_id: UUID
    source_message_id: UUID
    speaker: str = Field(
        min_length=1,
        max_length=200,
    )
    content: str = Field(
        min_length=1,
        max_length=20_000,
    )
    reference_time: datetime


class SearchRequest(BaseModel):
    timeline_id: UUID
    query: str = Field(
        min_length=1,
        max_length=2_000,
    )
    num_results: int = Field(
        default=6,
        ge=1,
        le=20,
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "anotheru-graphiti",
        "group_id": GRAPHITI_GROUP_ID,
    }


@app.post("/episodes")
async def add_episode(
    payload: EpisodeRequest,
    authorization: str | None = Header(default=None),
):
    require_service_token(authorization)

    graphiti: Graphiti = app.state.graphiti
    ingest_lock = app.state.ingest_lock

    group_id = timeline_group_id(payload.timeline_id)

    async with ingest_lock:
        result = await graphiti.add_episode(
            name=f"user-message:{payload.source_message_id}",
            episode_body=f"{payload.speaker}: {payload.content}",
            source=EpisodeType.message,
            source_description="AnotherU user message",
            reference_time=payload.reference_time,
            group_id=group_id,
        )

    return {
        "status": "ok",
        "timeline_id": str(payload.timeline_id),
        "group_id": group_id,
        "episode_uuid": result.episode.uuid,
        "nodes": len(result.nodes),
        "edges": len(result.edges),
    }


@app.post("/search")
async def search(
    payload: SearchRequest,
    authorization: str | None = Header(default=None),
):
    require_service_token(authorization)

    graphiti: Graphiti = app.state.graphiti

    group_id = timeline_group_id(payload.timeline_id)

    results = await graphiti.search(
        payload.query,
        group_ids=[group_id],
        num_results=payload.num_results,
    )

    # Remove exact duplicates while preserving order.
    seen: set[tuple[str, str | None, str | None]] = set()
    facts = []

    for result in results:
        key = (
            result.fact,
            (
                result.valid_at.isoformat()
                if result.valid_at
                else None
            ),
            (
                result.invalid_at.isoformat()
                if result.invalid_at
                else None
            ),
        )

        if key in seen:
            continue

        seen.add(key)

        facts.append(
            {
                "fact": result.fact,
                "valid_at": (
                    result.valid_at.isoformat()
                    if result.valid_at
                    else None
                ),
                "invalid_at": (
                    result.invalid_at.isoformat()
                    if result.invalid_at
                    else None
                ),
            }
        )

    return {
        "status": "ok",
        "timeline_id": str(payload.timeline_id),
        "facts": facts,
    }

@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception):
    print(f"Graphiti service error: {exc}")
    raise HTTPException(
        status_code=500,
        detail=str(exc),
    )