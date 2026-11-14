import os
for _k in ['MODEL_NAME', 'OPENROUTER_MODEL_NAME', 'PRACTICE_JUDGE_MODEL', 'EMBEDDING_PROVIDER', 'OPENROUTER_BASE_URL', 'LANGCHAIN_PROJECT']:
    os.environ.pop(_k, None)
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

previous_embedding_provider = os.environ.get("EMBEDDING_PROVIDER")
os.environ["EMBEDDING_PROVIDER"] = "hash"

from src.main import app  # noqa: E402

if previous_embedding_provider is None:
    os.environ.pop("EMBEDDING_PROVIDER")
else:
    os.environ["EMBEDDING_PROVIDER"] = previous_embedding_provider


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock

@pytest.fixture(autouse=True)
def isolate_model_env():
    for _var in ['MODEL_NAME', 'OPENROUTER_MODEL_NAME', 'PRACTICE_JUDGE_MODEL', 'EMBEDDING_PROVIDER', 'OPENROUTER_BASE_URL', 'LANGCHAIN_PROJECT']:
        os.environ.pop(_var, None)
    yield
    for _var in ['MODEL_NAME', 'OPENROUTER_MODEL_NAME', 'PRACTICE_JUDGE_MODEL', 'EMBEDDING_PROVIDER', 'OPENROUTER_BASE_URL', 'LANGCHAIN_PROJECT']:
        os.environ.pop(_var, None)
