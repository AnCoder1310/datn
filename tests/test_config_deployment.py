"""Production must reject settings that would lose data or weaken auth."""

import pytest

from src.config import Settings


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"AUTH_COOKIE_SECURE": "false"}, "AUTH_COOKIE_SECURE"),
        ({"DATABASE_URL": "sqlite:///./data/app.db"}, "DATABASE_URL"),
        ({"OPENROUTER_API_KEY": ""}, "OPENROUTER_API_KEY"),
    ],
)
def test_production_rejects_unsafe_configuration(override: dict[str, str], message: str) -> None:
    values = {
        "APP_ENV": "production",
        "AUTH_COOKIE_SECURE": "true",
        "DATABASE_URL": "postgresql://user:pass@db/app",
        "VECTOR_STORE_TYPE": "pgvector",
        "EMBEDDING_PROVIDER": "openrouter",
        "OPENROUTER_API_KEY": "test-key",
        **override,
    }
    with pytest.raises(ValueError, match=message):
        Settings(_env_file=None, **values)


def test_production_accepts_persistent_secure_configuration() -> None:
    settings = Settings(
        _env_file=None,
        APP_ENV="production",
        AUTH_COOKIE_SECURE="true",
        DATABASE_URL="postgresql://user:pass@db/app",
        VECTOR_STORE_TYPE="pgvector",
        OPENROUTER_API_KEY="test-key",
    )
    assert settings.app_env == "production"
