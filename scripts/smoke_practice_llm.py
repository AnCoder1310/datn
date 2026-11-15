"""Make two real structured OpenRouter calls through the Practice adapters.

Run from the repository root after configuring ``.env``:

    .venv/bin/python -m scripts.smoke_practice_llm

The script never prints the API key.
"""

from __future__ import annotations

import asyncio

from src.agents.roleplay.customer_agent import CustomerAgent
from src.agents.roleplay.scenario_loader import ScenarioRepository
from src.agents.roleplay.state import RoleplayState
from src.agents.roleplay.turn_analyzer import TurnAnalyzer
from src.config import get_settings
from src.integrations.practice_runtime import SharedLLMCustomerModel, SharedLLMTurnAnalysisModel


async def run_smoke() -> None:
    settings = get_settings()
    if settings.llm_provider != "openrouter":
        raise RuntimeError("Set LLM_PROVIDER=openrouter before running this smoke test")
    if not settings.openrouter_api_key or settings.openrouter_api_key.startswith("sk-or-v1-your-"):
        raise RuntimeError("Set a real OPENROUTER_API_KEY in .env; never commit that file")

    scenario = ScenarioRepository().get("SCENARIO_01_VF5_TAXI")
    state = RoleplayState.from_scenario("openrouter-smoke", scenario)
    customer = CustomerAgent(SharedLLMCustomerModel())
    analyzer = TurnAnalyzer(SharedLLMTurnAnalysisModel())

    opening = await customer.generate_reply(scenario, state, mode="opening")
    analysis = await analyzer.analyze(
        "Mỗi ngày anh thường di chuyển khoảng bao nhiêu km?",
        scenario,
        state,
    )

    print(f"provider={settings.llm_provider}")
    print(f"model={settings.openrouter_model_name}")
    print(f"customer_reply={opening.content}")
    print(f"detected_intents={analysis.detected_intents}")
    print(f"discovered_fact_ids={analysis.discovered_fact_ids}")
    print("structured_smoke=PASS")


if __name__ == "__main__":
    asyncio.run(run_smoke())
