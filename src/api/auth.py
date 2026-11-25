"""Cookie authentication endpoints and reusable current-user dependency."""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from src.config import Settings
from src.models.auth import (
    AccountAlreadyExistsError,
    AuthenticatedUser,
    ChangePasswordRequest,
    CreateAdvisorRequest,
    CreateCustomerRequest,
    LoginRequest,
    UserRole,
)
from src.services.auth import (
    AuthenticationRequiredError,
    AuthService,
    InvalidCredentialsError,
)


class CurrentUserDependency:
    def __init__(self, service: AuthService, cookie_name: str) -> None:
        self._service = service
        self._cookie_name = cookie_name

    async def __call__(self, request: Request) -> AuthenticatedUser:
        return await self.authenticate(request)

    async def authenticate(self, request: Request, *, allow_password_change: bool = False) -> AuthenticatedUser:
        try:
            user = await self._service.current_user(request.cookies.get(self._cookie_name))
        except AuthenticationRequiredError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
            ) from exc
        if user.must_change_password and not allow_password_change:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password change required.")
        return user


def build_auth_service(settings: Settings) -> AuthService:
    from src.integrations.auth_repository import SQLAuthRepository

    return AuthService(
        SQLAuthRepository(settings.database_url),
        session_ttl=timedelta(hours=settings.auth_session_ttl_hours),
    )


def create_auth_router(service: AuthService, settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])
    current_user = CurrentUserDependency(service, settings.auth_cookie_name)

    @router.post("/login", response_model=AuthenticatedUser)
    async def login(payload: LoginRequest, response: Response) -> AuthenticatedUser:
        try:
            token, user = await service.login(payload.username, payload.password)
        except InvalidCredentialsError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
            ) from exc
        response.set_cookie(
            key=settings.auth_cookie_name,
            value=token,
            max_age=int(service.session_ttl.total_seconds()),
            httponly=True,
            secure=settings.auth_cookie_secure,
            samesite="lax",
            path="/",
        )
        return user

    class SessionStatusResponse(BaseModel):
        authenticated: bool
        user: AuthenticatedUser | None = None

    @router.get("/session", response_model=SessionStatusResponse)
    async def session(request: Request) -> SessionStatusResponse:
        cookie = request.cookies.get(settings.auth_cookie_name)
        if not cookie:
            return SessionStatusResponse(authenticated=False, user=None)
        try:
            user = await service.current_user(cookie)
            return SessionStatusResponse(authenticated=True, user=user)
        except AuthenticationRequiredError:
            return SessionStatusResponse(authenticated=False, user=None)

    @router.get("/me", response_model=AuthenticatedUser)
    async def me(request: Request) -> AuthenticatedUser:
        return await current_user.authenticate(request, allow_password_change=True)

    class UpdateProfileRequest(BaseModel):
        display_name: str = Field(min_length=1, max_length=200)

    @router.patch("/profile", response_model=AuthenticatedUser)
    async def update_profile(payload: UpdateProfileRequest, request: Request) -> AuthenticatedUser:
        user = await current_user(request)
        await service.update_display_name(user.user_id, payload.display_name.strip())
        return AuthenticatedUser(
            user_id=user.user_id,
            username=user.username,
            display_name=payload.display_name.strip(),
            role=user.role,
            must_change_password=user.must_change_password,
        )

    @router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
    async def change_password(payload: ChangePasswordRequest, request: Request, response: Response) -> None:
        user = await current_user.authenticate(request, allow_password_change=True)
        try:
            await service.change_password(
                user,
                payload.current_password.get_secret_value(),
                payload.new_password.get_secret_value(),
            )
        except InvalidCredentialsError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid current password.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
        response.delete_cookie(
            key=settings.auth_cookie_name,
            path="/",
            secure=settings.auth_cookie_secure,
            httponly=True,
            samesite="lax",
        )

    @router.post("/advisors", response_model=AuthenticatedUser, status_code=status.HTTP_201_CREATED)
    async def create_advisor(payload: CreateAdvisorRequest, request: Request) -> AuthenticatedUser:
        actor = await current_user(request)
        if actor.role is not UserRole.MANAGER:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required.")
        if not 12 <= len(payload.password) <= 1024:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid password length.")
        try:
            return await service.create_advisor(
                username=payload.username,
                display_name=payload.display_name,
                password=payload.password,
            )
        except AccountAlreadyExistsError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.") from exc

    @router.post("/customers", response_model=AuthenticatedUser, status_code=status.HTTP_201_CREATED)
    async def create_customer(payload: CreateCustomerRequest) -> AuthenticatedUser:
        """Create a customer identity. Verification/CRM linkage is completed by the portal flow."""
        try:
            return await service.create_customer(username=payload.username, display_name=payload.display_name, password=payload.password)
        except AccountAlreadyExistsError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.") from exc

    @router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
    async def logout(request: Request, response: Response) -> None:
        await service.logout(request.cookies.get(settings.auth_cookie_name))
        response.delete_cookie(
            key=settings.auth_cookie_name,
            path="/",
            secure=settings.auth_cookie_secure,
            httponly=True,
            samesite="lax",
        )

    return router
