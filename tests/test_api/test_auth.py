from datetime import timedelta

import httpx
import pytest
from fastapi import FastAPI

from src.api.auth import create_auth_router
from src.config import Settings
from src.integrations.auth_repository import SQLAuthRepository
from src.models.auth import UserRole
from src.services.auth import AuthService


async def build_test_app(tmp_path, *, secure_cookie: bool = False) -> FastAPI:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'auth.db'}",
        auth_cookie_secure=secure_cookie,
        embedding_provider="hash",
        app_env="test",
    )
    service = AuthService(SQLAuthRepository(settings.database_url), session_ttl=timedelta(hours=2))
    await service.seed_user(
        user_id="advisor-1",
        username="advisor.one",
        display_name="Advisor One",
        role=UserRole.ADVISOR,
        password="correct horse battery staple",
    )
    await service.seed_user(
        user_id="manager-1",
        username="manager.one",
        display_name="Manager One",
        role=UserRole.MANAGER,
        password="manager secure password",
    )
    app = FastAPI()
    app.include_router(create_auth_router(service, settings), prefix="/api/v1")
    return app


@pytest.mark.asyncio
async def test_login_me_logout_cookie_flow(tmp_path):
    app = await build_test_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        anon_session = await client.get("/api/v1/auth/session")
        assert anon_session.status_code == 200
        assert anon_session.json() == {"authenticated": False, "user": None}
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        rejected = await client.post(
            "/api/v1/auth/login",
            json={"username": "advisor.one", "password": "wrong password"},
        )
        assert rejected.status_code == 401
        assert rejected.json() == {"detail": "Invalid username or password."}

        login = await client.post(
            "/api/v1/auth/login",
            json={"username": " Advisor.One ", "password": "correct horse battery staple"},
        )
        assert login.status_code == 200
        assert login.json() == {
            "user_id": "advisor-1",
            "username": "advisor.one",
            "display_name": "Advisor One",
            "role": "advisor",
            "must_change_password": False,
        }
        cookie = login.headers["set-cookie"].lower()
        assert "httponly" in cookie
        assert "samesite=lax" in cookie
        assert "secure" not in cookie
        auth_session = await client.get("/api/v1/auth/session")
        assert auth_session.status_code == 200
        assert auth_session.json()["authenticated"] is True
        assert auth_session.json()["user"]["user_id"] == "advisor-1"
        assert (await client.get("/api/v1/auth/me")).json()["user_id"] == "advisor-1"

        logout = await client.post("/api/v1/auth/logout")
        assert logout.status_code == 204
        assert logout.content == b""
        assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_production_cookie_can_be_marked_secure(tmp_path):
    app = await build_test_app(tmp_path, secure_cookie=True)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": "advisor.one", "password": "correct horse battery staple"},
        )
        assert "secure" in login.headers["set-cookie"].lower()


@pytest.mark.asyncio
async def test_only_manager_can_create_advisor_and_new_account_can_log_in(tmp_path):
    app = await build_test_app(tmp_path)
    payload = {
        "username": " New.Advisor ",
        "display_name": "New Advisor",
        "password": "advisor secure password",
    }
    async with (
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as anonymous,
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as advisor,
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as manager,
    ):
        assert (await anonymous.post("/api/v1/auth/advisors", json=payload)).status_code == 401
        await advisor.post(
            "/api/v1/auth/login", json={"username": "advisor.one", "password": "correct horse battery staple"}
        )
        assert (await advisor.post("/api/v1/auth/advisors", json=payload)).status_code == 403
        await manager.post(
            "/api/v1/auth/login", json={"username": "manager.one", "password": "manager secure password"}
        )
        created = await manager.post("/api/v1/auth/advisors", json=payload)
        assert created.status_code == 201
        assert created.json()["username"] == "new.advisor"
        assert created.json()["role"] == "advisor"
        assert "password" not in created.json()
        assert (await manager.post("/api/v1/auth/advisors", json=payload)).status_code == 409
        assert (await manager.post("/api/v1/auth/advisors", json={**payload, "role": "manager"})).status_code == 422
        short_password = await manager.post("/api/v1/auth/advisors", json={**payload, "password": "short"})
        assert short_password.status_code == 422
        assert "short" not in short_password.text
        logged_in = await anonymous.post(
            "/api/v1/auth/login", json={"username": "new.advisor", "password": payload["password"]}
        )
        assert logged_in.status_code == 200
        assert logged_in.json()["user_id"] == created.json()["user_id"]
        assert logged_in.json()["must_change_password"] is True
        assert (await anonymous.get("/api/v1/auth/me")).json()["must_change_password"] is True
        assert (await anonymous.post("/api/v1/auth/advisors", json=payload)).status_code == 403
        changed = await anonymous.post(
            "/api/v1/auth/change-password",
            json={"current_password": payload["password"], "new_password": "advisor independent secure password"},
        )
        assert changed.status_code == 204
        assert (await anonymous.get("/api/v1/auth/me")).status_code == 401
        relogin = await anonymous.post(
            "/api/v1/auth/login",
            json={"username": "new.advisor", "password": "advisor independent secure password"},
        )
        assert relogin.json()["must_change_password"] is False
