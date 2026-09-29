from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI


class OllamaOpenAIClient:
    """
    Thin wrapper around AsyncOpenAI that disables Qwen thinking
    for every Graphiti LLM request.

    Graphiti still owns:
      - prompts
      - Pydantic schemas
      - response_format
      - JSON parsing
      - retries
    """

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
    ) -> None:
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )

        self.chat = _ChatWrapper(self._client)


class _ChatWrapper:
    def __init__(self, client: AsyncOpenAI) -> None:
        self.completions = _CompletionsWrapper(client)


class _CompletionsWrapper:
    def __init__(self, client: AsyncOpenAI) -> None:
        self._client = client

    async def create(
        self,
        **kwargs: Any,
    ):
        kwargs["reasoning_effort"] = "none"

        return await self._client.chat.completions.create(
            **kwargs,
        )
