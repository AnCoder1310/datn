"""Validated access to the role-play scenario dataset."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from .contracts import EvaluationCriterion, ScenarioContract

DEFAULT_SCENARIO_PATH = Path(__file__).resolve().parents[3] / "data" / "scenarios" / "scenarios.json"


class ScenarioDatasetError(ValueError):
    """Raised when the scenario dataset cannot be parsed or validated."""


class ScenarioNotFoundError(LookupError):
    """Raised when a requested scenario identifier is not in the dataset."""


class ScenarioSummary(BaseModel):
    """Advisor-safe scenario metadata used by a scenario picker."""

    scenario_id: str
    title: str
    difficulty: str
    target_skills: list[EvaluationCriterion]
    sales_channel: str | None = None
    training_objective: str | None = None
    scenario_version: str
    visible_context: str
    max_turns: int = Field(gt=0)
    voice_gender: Literal["male", "female"] | None = None
    outcome_labels: list[str] = Field(default_factory=list)

    @classmethod
    def from_scenario(cls, scenario: ScenarioContract) -> ScenarioSummary:
        return cls(
            scenario_id=scenario.scenario_id,
            title=scenario.title,
            difficulty=scenario.difficulty,
            target_skills=scenario.target_skills,
            sales_channel=scenario.sales_channel,
            training_objective=scenario.training_objective,
            scenario_version=scenario.scenario_version,
            visible_context=scenario.visible_context,
            max_turns=scenario.termination_conditions.max_turns,
            voice_gender=_voice_gender_from_name(scenario.persona.get("name", "")),
            outcome_labels=[outcome.label for outcome in scenario.acceptable_outcomes],
        )


def _voice_gender_from_name(name: str) -> Literal["male", "female"] | None:
    """Expose only the voice choice implied by a public Vietnamese title."""
    title = name.strip().split(" ", 1)[0].casefold()
    if title in {"anh", "ông", "chú"}:
        return "male"
    if title in {"chị", "cô", "bà"}:
        return "female"
    return None


class ScenarioRepository:
    """Load the complete dataset once and expose safe lookup operations."""

    def __init__(
        self,
        dataset_path: Path = DEFAULT_SCENARIO_PATH,
        custom_dataset_path: Path | None = None,
    ) -> None:
        self.dataset_path = dataset_path
        self.custom_dataset_path = custom_dataset_path or (dataset_path.parent / "custom_scenarios.json")
        self._scenarios = self._load(dataset_path, self.custom_dataset_path)

    @staticmethod
    def _load(dataset_path: Path, custom_path: Path | None = None) -> dict[str, ScenarioContract]:
        try:
            raw_dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ScenarioDatasetError(f"cannot load scenario dataset {dataset_path}: {exc}") from exc

        if not isinstance(raw_dataset, list):
            raise ScenarioDatasetError("scenario dataset root must be a JSON array")

        scenarios: dict[str, ScenarioContract] = {}
        for index, raw_scenario in enumerate(raw_dataset):
            try:
                scenario = ScenarioContract.model_validate(raw_scenario)
            except ValidationError as exc:
                raise ScenarioDatasetError(f"invalid scenario at index {index}: {exc}") from exc
            if scenario.scenario_id in scenarios:
                raise ScenarioDatasetError(f"duplicate scenario_id: {scenario.scenario_id}")
            scenarios[scenario.scenario_id] = scenario

        # Also load custom persistent scenarios if present
        if custom_path and custom_path.exists():
            try:
                custom_raw = json.loads(custom_path.read_text(encoding="utf-8"))
                if isinstance(custom_raw, list):
                    for raw_s in custom_raw:
                        s = ScenarioContract.model_validate(raw_s)
                        scenarios[s.scenario_id] = s
            except Exception:
                pass

        if not scenarios:
            raise ScenarioDatasetError("scenario dataset must contain at least one scenario")
        return scenarios

    def get(self, scenario_id: str) -> ScenarioContract:
        try:
            return self._scenarios[scenario_id].model_copy(deep=True)
        except KeyError as exc:
            raise ScenarioNotFoundError(f"unknown scenario_id: {scenario_id}") from exc

    def list_public(self) -> list[ScenarioSummary]:
        return [ScenarioSummary.from_scenario(scenario) for scenario in self._scenarios.values()]

    def register(self, scenario: ScenarioContract, persist: bool = False) -> ScenarioSummary:
        """Register a validated scenario in memory and optionally persist it."""
        scenario = ScenarioContract.model_validate(scenario)
        self._scenarios[scenario.scenario_id] = scenario
        if persist:
            self._save_custom(scenario)
        return ScenarioSummary.from_scenario(scenario)

    def _save_custom(self, scenario: ScenarioContract) -> None:
        custom_path = self.custom_dataset_path
        custom_list: list[dict] = []
        if custom_path.exists():
            try:
                loaded = json.loads(custom_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    custom_list = loaded
            except Exception:
                custom_list = []
        updated = False
        payload = scenario.model_dump(mode="json")
        for i, item in enumerate(custom_list):
            if item.get("scenario_id") == scenario.scenario_id:
                custom_list[i] = payload
                updated = True
                break
        if not updated:
            custom_list.append(payload)
        custom_path.write_text(json.dumps(custom_list, ensure_ascii=False, indent=2), encoding="utf-8")

    def delete_custom(self, scenario_id: str) -> bool:
        """Delete a custom scenario from memory and file. Core dataset scenarios cannot be deleted."""
        if scenario_id not in self._scenarios:
            raise ScenarioNotFoundError(f"unknown scenario_id: {scenario_id}")

        try:
            core_raw = json.loads(self.dataset_path.read_text(encoding="utf-8"))
            core_ids = {s.get("scenario_id") for s in core_raw if isinstance(s, dict)}
            if scenario_id in core_ids:
                raise ValueError(f"Không thể xóa kịch bản mặc định cốt lõi của hệ thống ({scenario_id})")
        except (OSError, json.JSONDecodeError):
            if not scenario_id.startswith("SCENARIO_CUSTOM_"):
                raise ValueError(f"Không thể xóa kịch bản hệ thống ({scenario_id})")

        del self._scenarios[scenario_id]

        if self.custom_dataset_path.exists():
            try:
                loaded = json.loads(self.custom_dataset_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    filtered = [s for s in loaded if s.get("scenario_id") != scenario_id]
                    self.custom_dataset_path.write_text(
                        json.dumps(filtered, ensure_ascii=False, indent=2),
                        encoding="utf-8"
                    )
            except Exception:
                pass
        return True
