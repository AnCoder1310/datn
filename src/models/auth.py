"""Authentication contracts shared by API, service, and persistence layers."""

from datetime import datetime
try:
    from enum import StrEnum
except ImportError:
    from enum import Enum
    class StrEnum(str, Enum):
        pass

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class UserRole(StrEnum):
    ADVISOR = "advisor"
    MANAGER = "manager"


class AccountAlreadyExistsError(ValueError):
    """Insert-only account creation collided with an existing identity."""


class AuthenticatedUser(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=1, max_length=120)
    display_name: str = Field(min_length=1, max_length=200)
    role: UserRole
    must_change_password: bool = False


class StoredUser(AuthenticatedUser):
    password_hash: str = Field(min_length=1)
    password_salt: str = Field(min_length=1)
    password_iterations: int = Field(ge=100_000)
    active: bool = True


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if not normalized:
            raise ValueError("username must not be blank")
        return normalized


class CreateAdvisorRequest(BaseModel):
    """Manager-supplied identity; the API assigns the advisor role and ID."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=120)
    display_name: str = Field(min_length=1, max_length=200)
    # Check length in the route so validation errors never echo a password.
    password: str

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if not normalized:
            raise ValueError("username must not be blank")
        return normalized

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("display_name must not be blank")
        return normalized


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: SecretStr
    new_password: SecretStr


class StoredSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token_hash: str = Field(min_length=64, max_length=64)
    user_id: str = Field(min_length=1, max_length=120)
    created_at: datetime
    expires_at: datetime
