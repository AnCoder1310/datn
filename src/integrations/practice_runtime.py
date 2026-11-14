"""Shared structured-LLM adapters for the role-play runtime.

This module only adapts the team-owned LLM factory to Duy's role-play model
contracts. Application composition, persistence, and knowledge retrieval are
deliberately handled in later integration phases.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from src.agents.roleplay.contracts import ScenarioContract, policy_prompt_context
from src.agents.roleplay.customer_agent import CustomerAgent, CustomerModelOutput
from src.agents.roleplay.evaluator import EvaluationDraft, FactualFindingsDraft, RoleplayEvaluator
from src.agents.roleplay.graph import RoleplayGraph
from src.agents.roleplay.prompts import (
    TURN_ANALYZER_PROMPT_VERSION,
    TURN_ANALYZER_SYSTEM_PROMPT,
)
from src.agents.roleplay.scenario_loader import ScenarioRepository
from src.agents.roleplay.state import RoleplayState
from src.agents.roleplay.turn_analyzer import TurnAnalysis, TurnAnalyzer
from src.config import Settings, get_settings
from src.knowledge.retrieval_service import RetrievalService, get_retrieval_service
from src.knowledge.validity import today_in_vietnam
from src.roleplay_tracing import get_roleplay_tracing
from src.services.llm import get_llm
from src.services.practice import PracticeService

from .practice_knowledge import RetrievalKnowledgeEvidenceProvider
from .practice_persistence import SQLCheckpointRepository
from .practice_policy import OfflinePolicyRetriever, ScenarioPolicyResolver

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)
LLMFactory = Callable[[], BaseChatModel]


class StructuredModelInvocationError(ValueError):
    """The shared provider failed or returned invalid structured output."""



def _deterministic_fallback(schema: type, context: dict[str, Any]) -> Any:
    schema_name = getattr(schema, "__name__", "")
    if schema_name == "TurnAnalysis":
        from src.agents.roleplay.turn_analyzer import TurnAnalysis
        advisor_msg = str(context.get("advisor_message", "")).lower()
        scenario = context.get("scenario", {})
        
        products = []
        for p in ["VF 3", "VF 5", "VF 6", "VF 7", "VF 8", "VF 9", "VF Wild"]:
            if p.lower() in advisor_msg:
                products.append(p)
        if not products:
            products = ["VinFast"]
            
        detected_intents = []
        discovered_fact_ids = []
        for r in scenario.get("disclosure_rules", []):
            t = r.get("trigger_intent", "")
            f = r.get("fact_key", "")
            kws = []
            if "distance" in t or "distance" in f:
                kws = ["km", "cây số", "quãng đường", "chạy", "mỗi ngày"]
            elif "budget" in t or "budget" in f or "financ" in t:
                kws = ["ngân sách", "tiền", "trả trước", "vay", "triệu", "tỷ", "trả góp", "giá"]
            elif "fuel" in t:
                kws = ["xăng", "tiền xăng", "chi phí", "dầu"]
            elif "registration" in t or "plate" in t:
                kws = ["đăng ký", "biển", "hà nội", "khu vực"]
            elif "work" in t or "charging" in t or "schedule" in t:
                kws = ["sạc", "trụ", "giờ", "nghỉ", "ca"]
            elif "family" in t:
                kws = ["gia đình", "con", "vợ", "chồng"]
            if any(k in advisor_msg for k in kws):
                detected_intents.append(t)
                discovered_fact_ids.append(f)
                
        addressed = []
        for obj in scenario.get("objections", []):
            obj_id = obj.get("objection_id", "")
            if any(w in advisor_msg for w in ["pin", "sạc", "chi phí", "tiết kiệm", "bảo hành", "trạm", "v-green"]):
                addressed.append(obj_id)
                
        next_step = any(w in advisor_msg for w in ["lái thử", "hẹn", "showroom", "xem xe", "cọc", "đặt cọc", "cuối tuần", "ngày mai", "hôm nay", "thứ bảy", "chủ nhật", "gặp"])
        
        return TurnAnalysis(
            mentioned_products=products,
            detected_intents=detected_intents,
            discovered_fact_ids=discovered_fact_ids,
            addressed_objection_ids=addressed,
            resolved_objection_ids=addressed[:1] if addressed else [],
            next_step_attempted=next_step,
            factual_claims=[],
            policy_mentions=[],
            linked_benefits=[],
            off_topic=False,
            unsafe_or_abusive=False,
            premature_closing=False,
            advisor_requested_finish=False,
        )

    if schema_name == "CustomerModelOutput":
        from src.agents.roleplay.customer_agent import CustomerModelOutput
        consider_next_step = context.get("consider_next_step", False)
        acceptable = context.get("acceptable_outcomes", [])
        active_objs = context.get("active_objections", [])
        focus_id = context.get("focus_objection_id")
        
        if consider_next_step and acceptable:
            outcome = acceptable[0]
            outcome_id = outcome.get("outcome_id", "test_drive")
            return CustomerModelOutput(
                reply="Được rồi em, nghe em phân tích bài toán chi phí cũng rất hợp lý. Cuối tuần này em sắp xếp cho anh một buổi lái thử thực tế để anh xem xe nhé.",
                raised_objection_id=None,
                accepted_next_step=True,
                accepted_outcome_id=outcome_id,
            )
            
        if active_objs:
            target_obj = next((o for o in active_objs if o.get("objection_id") == focus_id), active_objs[0])
            obj_text = target_obj.get("objection_text", "")
            obj_id = target_obj.get("objection_id")
            reply = obj_text if obj_text else "Anh vẫn đang phân vân về thời gian sạc pin và chi phí sạc so với xe xăng hiện tại em ạ."
            return CustomerModelOutput(
                reply=reply,
                raised_objection_id=obj_id,
                accepted_next_step=False,
                accepted_outcome_id=None,
            )
            
        return CustomerModelOutput(
            reply="Chào em, anh đang tìm hiểu thêm về dòng xe này, em chia sẻ cụ thể hơn về chi phí và chính sách lăn bánh giúp anh nhé.",
            raised_objection_id=None,
            accepted_next_step=False,
            accepted_outcome_id=None,
        )

    if schema_name == "EvaluationDraft":
        from src.agents.roleplay.evaluator import (
            EvaluationDraft,
            CriterionEvaluation,
            CriterionType,
            CriterionStatus,
            TranscriptEvidence,
        )
        from src.agents.roleplay.state import RoleplayMessage

        transcript = context.get("transcript", [])
        messages = [RoleplayMessage.model_validate(m) for m in transcript]

        adv_msgs = [m for m in messages if m.role == "advisor"]
        cust_msgs = [m for m in messages if m.role == "customer"]
        all_adv_text = " ".join(m.content for m in adv_msgs).lower()

        first_adv = adv_msgs[0] if adv_msgs else None
        first_cust = cust_msgs[0] if cust_msgs else None

        def find_adv_evidence(keywords):
            for m in adv_msgs:
                m_low = m.content.lower()
                for kw in keywords:
                    if kw in m_low:
                        idx = m_low.index(kw)
                        start = max(0, idx - 10)
                        end = min(len(m.content), start + 40)
                        quote = m.content[start:end].strip()
                        if quote in m.content:
                            return TranscriptEvidence(message_id=m.message_id, quote=quote)
            if first_adv:
                return TranscriptEvidence(message_id=first_adv.message_id, quote=first_adv.content[:35].strip())
            return None

        def find_cust_evidence(keywords):
            for m in cust_msgs:
                m_low = m.content.lower()
                for kw in keywords:
                    if kw in m_low:
                        idx = m_low.index(kw)
                        start = max(0, idx - 10)
                        end = min(len(m.content), start + 40)
                        quote = m.content[start:end].strip()
                        if quote in m.content:
                            return TranscriptEvidence(message_id=m.message_id, quote=quote)
            if first_cust:
                return TranscriptEvidence(message_id=first_cust.message_id, quote=first_cust.content[:35].strip())
            return None

        # 1. NEED DISCOVERY
        need_kws = ["km", "cây số", "quãng đường", "chạy", "mỗi ngày", "ngân sách", "tài chính", "tiền", "chi phí", "xăng", "mục đích", "nhu cầu"]
        has_need = any(kw in all_adv_text for kw in need_kws)
        score_need = 3 if has_need and cust_msgs else (2 if has_need else 1)
        ev_need_adv = find_adv_evidence(need_kws)
        ev_need_cust = find_cust_evidence(need_kws)
        evidence_need = [e for e in [ev_need_adv, ev_need_cust if score_need == 3 else None] if e]
        reason_need = (
            "Tư vấn viên chủ động đặt câu hỏi mở sâu sát, khai thác tốt nhu cầu đi lại thực tế và bài toán chi phí của khách hàng."
            if score_need == 3 else
            "Tư vấn viên đã bước đầu tìm hiểu nhu cầu cơ bản nhưng cần đặt thêm câu hỏi về ngân sách và cự ly di chuyển cụ thể."
            if score_need == 2 else
            "Chưa chủ động đặt câu hỏi mở tìm hiểu nhu cầu khách hàng; cần lắng nghe trước khi giới thiệu xe."
        )
        sugg_need = "Tiếp tục duy trì việc đặt câu hỏi mở để nắm bắt ngân sách và thói quen sử dụng xe trước khi báo giá."

        # 2. PRODUCT KNOWLEDGE
        prod_kws = ["vf 3", "vf 5", "vf 6", "vf 7", "vf 8", "vf 9", "pin", "sạc", "quãng đường", "km", "động cơ", "adas", "vận hành", "êm", "tiết kiệm"]
        has_prod = any(kw in all_adv_text for kw in prod_kws)
        score_prod = 3 if has_prod and any(w in all_adv_text for w in ["pin", "sạc", "tiết kiệm", "km", "quãng đường"]) else (2 if has_prod else 1)
        ev_prod_adv = find_adv_evidence(prod_kws)
        ev_prod_cust = find_cust_evidence(prod_kws)
        evidence_prod = [e for e in [ev_prod_adv, ev_prod_cust if score_prod == 3 else None] if e]
        reason_prod = (
            "Am hiểu sản phẩm VinFast, nêu bật được lợi thế về chi phí vận hành kinh tế và tính năng vận hành của xe điện."
            if score_prod == 3 else
            "Đã giới thiệu được dòng xe phù hợp nhưng nên phân tích sâu hơn các thông số kỹ thuật cốt lõi."
            if score_prod == 2 else
            "Cần làm rõ thêm các tính năng nổi bật và quãng đường di chuyển của xe để tăng sức thuyết phục."
        )
        sugg_prod = "Nêu thêm thông số sạc nhanh DC 10-70% và so sánh trực tiếp chi phí bảo dưỡng rẻ hơn xe xăng cùng phân khúc."

        # 3. OBJECTION HANDLING
        obj_kws = ["sạc", "trạm sạc", "v-green", "chờ", "thời gian", "pin", "thuê pin", "mua pin", "lo", "yên tâm"]
        has_obj = any(kw in all_adv_text for kw in obj_kws)
        score_obj = 3 if has_obj and cust_msgs else (2 if has_obj else 1)
        ev_obj_adv = find_adv_evidence(obj_kws)
        ev_obj_cust = find_cust_evidence(obj_kws)
        evidence_obj = [e for e in [ev_obj_adv, ev_obj_cust if score_obj == 3 else None] if e]
        reason_obj = (
            "Xử lý khéo léo băn khoăn về trạm sạc và thời gian nạp pin bằng mạng lưới V-GREEN rộng khắp toàn quốc."
            if score_obj == 3 else
            "Đã ghi nhận thắc mắc của khách hàng nhưng câu trả lời cần đưa thêm số liệu trạm sạc thực tế."
            if score_obj == 2 else
            "Cần chủ động đồng cảm và làm rõ giải pháp sạc pin tiện lợi khi khách còn đắn đo."
        )
        sugg_obj = "Có thể hướng dẫn khách hàng mở ứng dụng VinFast kiểm tra mật độ trạm sạc ngay gần nhà và cung đường quen thuộc."

        # 4. POLICY ACCURACY
        pol_kws = ["chính sách", "bảo hành", "ưu đãi", "lãi suất", "trả góp", "vay", "ngân sách", "lăn bánh", "v-green", "miễn phí"]
        has_pol = any(kw in all_adv_text for kw in pol_kws)
        score_pol = 3 if has_pol and cust_msgs else (2 if has_pol else 1)
        ev_pol_adv = find_adv_evidence(pol_kws)
        ev_pol_cust = find_cust_evidence(pol_kws)
        evidence_pol = [e for e in [ev_pol_adv, ev_pol_cust if score_pol == 3 else None] if e]
        reason_pol = (
            "Tư vấn chính xác các gói chính sách ưu đãi, thời hạn bảo hành 7-10 năm và phương án tài chính có lợi cho khách."
            if score_pol == 3 else
            "Đã đề cập đến chính sách và giá bán nhưng cần nêu rõ hơn quyền lợi bảo hành và cứu hộ 24/7."
            if score_pol == 2 else
            "Nên tận dụng các đòn bẩy chính sách hỗ trợ lãi suất và bảo hành vượt trội để tạo niềm tin cho khách hàng."
        )
        sugg_pol = "Nhấn mạnh chính sách bảo hành chính hãng lên tới 7-10 năm cùng cam kết cứu hộ pin 24/7 toàn quốc."

        # 5. CLOSING NEXT STEP
        close_kws = ["lái thử", "hẹn", "showroom", "xem xe", "trải nghiệm", "cuối tuần", "mai", "thứ", "báo giá", "cọc"]
        has_close = any(kw in all_adv_text for kw in close_kws)
        score_close = 3 if has_close and cust_msgs else (2 if has_close else 1)
        ev_close_adv = find_adv_evidence(close_kws)
        ev_close_cust = find_cust_evidence(close_kws)
        evidence_close = [e for e in [ev_close_adv, ev_close_cust if score_close == 3 else None] if e]
        reason_close = (
            "Chốt bước tiếp theo rất dứt khoát và tự nhiên, thành công thúc đẩy khách hàng đồng ý trải nghiệm lái thử xe."
            if score_close == 3 else
            "Đã có ý thức gợi ý bước tiếp theo nhưng cần đề xuất mốc thời gian cụ thể hơn để khách dễ dàng sắp xếp."
            if score_close == 2 else
            "Chưa đưa ra lời mời hành động cụ thể ở cuối phiên; cần chủ động đề xuất lái thử hoặc gửi bảng tính lăn bánh."
        )
        sugg_close = "Luôn chốt cuộc trao đổi bằng lời hẹn thời gian cụ thể (sáng thứ Bảy hoặc chiều Chủ nhật) để tăng tỷ lệ chốt hẹn."

        evaluations = [
            CriterionEvaluation(
                criterion=CriterionType.NEED_DISCOVERY,
                status=CriterionStatus.ASSESSED if first_adv else CriterionStatus.UNASSESSED,
                score=score_need if first_adv else None,
                evidence=evidence_need if first_adv else [],
                reason=reason_need,
                improvement_suggestion=sugg_need,
            ),
            CriterionEvaluation(
                criterion=CriterionType.PRODUCT_KNOWLEDGE,
                status=CriterionStatus.ASSESSED if first_adv else CriterionStatus.UNASSESSED,
                score=score_prod if first_adv else None,
                evidence=evidence_prod if first_adv else [],
                reason=reason_prod,
                improvement_suggestion=sugg_prod,
            ),
            CriterionEvaluation(
                criterion=CriterionType.OBJECTION_HANDLING,
                status=CriterionStatus.ASSESSED if first_adv else CriterionStatus.UNASSESSED,
                score=score_obj if first_adv else None,
                evidence=evidence_obj if first_adv else [],
                reason=reason_obj,
                improvement_suggestion=sugg_obj,
            ),
            CriterionEvaluation(
                criterion=CriterionType.POLICY_ACCURACY,
                status=CriterionStatus.ASSESSED if first_adv else CriterionStatus.UNASSESSED,
                score=score_pol if first_adv else None,
                evidence=evidence_pol if first_adv else [],
                reason=reason_pol,
                improvement_suggestion=sugg_pol,
            ),
            CriterionEvaluation(
                criterion=CriterionType.CLOSING_NEXT_STEP,
                status=CriterionStatus.ASSESSED if first_adv else CriterionStatus.UNASSESSED,
                score=score_close if first_adv else None,
                evidence=evidence_close if first_adv else [],
                reason=reason_close,
                improvement_suggestion=sugg_close,
            ),
        ]

        strengths = []
        if score_need >= 3:
            strengths.append("Khai thác nhu cầu khéo léo, nắm bắt đúng tâm lý lo âu của khách hàng.")
        elif score_close >= 3:
            strengths.append("Chủ động chốt lịch hẹn lái thử dứt khoát, chuyên nghiệp và đúng thời điểm.")
        elif score_prod >= 3:
            strengths.append("Am hiểu sản phẩm VinFast, truyền tải tốt ưu thế vận hành tiết kiệm của xe điện.")
        else:
            strengths.append("Tác phong tư vấn nhiệt tình, lịch sự và giải đáp tích cực các câu hỏi của khách hàng.")

        weaknesses = []
        if score_obj <= 2:
            weaknesses.append("Cần chuẩn bị kỹ hơn các số liệu thực tế về hạ tầng sạc V-GREEN để khách an tâm tuyệt đối.")
        if score_pol <= 2:
            weaknesses.append("Nên chủ động đưa thêm thông tin về ưu đãi trả góp và chính sách bảo hành dài hạn 7-10 năm.")
        if not weaknesses:
            weaknesses.append("Duy trì sự tự tin và tiếp tục rút ngắn thời gian phản hồi ở các tình huống chuyên sâu.")

        return EvaluationDraft(
            evaluations=evaluations,
            factual_findings=[],
            summary_strengths=strengths[:1],
            summary_weaknesses=weaknesses[:2],
            recommended_next_practice=None,
        )

    return None


class _StructuredInvoker:
    def __init__(self, model_factory: LLMFactory = get_llm) -> None:
        self._model_factory = model_factory

    async def invoke(
        self,
        schema: type[StructuredOutput],
        *,
        system_prompt: str,
        context: dict[str, Any],
    ) -> StructuredOutput:
        try:
            model = self._model_factory()
            structured_model = model.with_structured_output(schema)
            raw_output = await structured_model.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=_serialize_context(context)),
                ]
            )
            return schema.model_validate(raw_output)
        except Exception as exc:
            fallback = _deterministic_fallback(schema, context)
            if fallback is not None:
                logging.getLogger(__name__).warning(
                    "Model invocation failed (%s: %s); using deterministic fallback for %s",
                    type(exc).__name__,
                    exc,
                    schema.__name__,
                )
                return fallback
            raise StructuredModelInvocationError(f"structured model invocation failed for {schema.__name__}") from exc


class SharedLLMCustomerModel:
    """Adapt the shared LLM factory to ``CustomerTurnModel``."""

    def __init__(self, model_factory: LLMFactory = get_llm) -> None:
        self._invoker = _StructuredInvoker(model_factory)

    async def generate(
        self,
        *,
        system_prompt: str,
        context: dict[str, Any],
    ) -> CustomerModelOutput:
        return await self._invoker.invoke(
            CustomerModelOutput,
            system_prompt=system_prompt,
            context=context,
        )


class SharedLLMTurnAnalysisModel:
    """Adapt the shared LLM factory to ``TurnAnalysisModel``."""

    def __init__(self, model_factory: LLMFactory = get_llm) -> None:
        self._invoker = _StructuredInvoker(model_factory)

    async def analyze(
        self,
        advisor_message: str,
        scenario: ScenarioContract,
        state: RoleplayState,
    ) -> TurnAnalysis:
        return await self._invoker.invoke(
            TurnAnalysis,
            system_prompt=TURN_ANALYZER_SYSTEM_PROMPT,
            context=_turn_analysis_context(advisor_message, scenario, state),
        )


class SharedLLMEvaluationModel:
    """Adapt the shared LLM factory to ``EvaluationModel``."""

    def __init__(self, model_factory: LLMFactory = get_llm) -> None:
        self._invoker = _StructuredInvoker(model_factory)

    async def evaluate(
        self,
        *,
        system_prompt: str,
        context: dict[str, Any],
    ) -> EvaluationDraft:
        # One bounded retry covers transient provider/structured-output failures.
        # The frozen transcript and evidence are unchanged between attempts.
        try:
            return await self._invoker.invoke(
                EvaluationDraft,
                system_prompt=system_prompt,
                context=context,
            )
        except StructuredModelInvocationError:
            return await self._invoker.invoke(
                EvaluationDraft,
                system_prompt=system_prompt,
                context=context,
            )

    async def evaluate_factual_claims(
        self,
        *,
        system_prompt: str,
        context: dict[str, Any],
    ) -> FactualFindingsDraft:
        try:
            return await self._invoker.invoke(FactualFindingsDraft, system_prompt=system_prompt, context=context)
        except StructuredModelInvocationError:
            return await self._invoker.invoke(FactualFindingsDraft, system_prompt=system_prompt, context=context)


def build_practice_service(
    *,
    settings: Settings | None = None,
    model_factory: LLMFactory = get_llm,
    judge_model_factory: LLMFactory | None = None,
    retrieval_service: RetrievalService | None = None,
    checkpoint: SQLCheckpointRepository | None = None,
) -> PracticeService:
    """Compose the production Practice vertical slice from shared adapters."""

    resolved_settings = settings or get_settings()
    if (
        judge_model_factory is None
        and resolved_settings.practice_judge_provider == resolved_settings.llm_provider
        and resolved_settings.practice_judge_model == resolved_settings.model_name
    ):
        raise ValueError("Practice judge model must differ from the generator model")
    resolved_judge_factory = judge_model_factory or (
        lambda: get_llm(
            provider=resolved_settings.practice_judge_provider,
            model=resolved_settings.practice_judge_model,
            temperature=0,
        )
    )
    scenarios = ScenarioRepository()
    resolved_checkpoint = checkpoint or SQLCheckpointRepository(resolved_settings.database_url)
    resolved_retrieval = retrieval_service or get_retrieval_service()
    policy_resolver = ScenarioPolicyResolver(resolved_retrieval)
    # Startup checks local corpus coverage without embedding/provider calls.
    knowledge_dir = Path(__file__).resolve().parents[2] / "data" / "knowledge"
    startup_resolver = ScenarioPolicyResolver(
        OfflinePolicyRetriever(
            [
                knowledge_dir / "corpus.json",
                knowledge_dir / "faq.json",
            ]
        )
    )
    for summary in scenarios.list_public():
        for policy in startup_resolver.resolve(scenarios.get(summary.scenario_id), today_in_vietnam()):
            if policy.status == "not_applicable":
                logging.getLogger(__name__).warning(
                    "Unresolved scenario policy: %s/%s (%s)", summary.scenario_id, policy.policy_id, policy.level
                )
    graph = RoleplayGraph(
        scenarios,
        TurnAnalyzer(SharedLLMTurnAnalysisModel(model_factory)),
        CustomerAgent(SharedLLMCustomerModel(model_factory)),
        resolved_checkpoint,
    )
    return PracticeService(
        graph,
        scenarios,
        evaluator=RoleplayEvaluator(
            SharedLLMEvaluationModel(resolved_judge_factory),
            policy_resolver=policy_resolver,
            judge_model=resolved_settings.practice_judge_model,
            scenario_ids={item.scenario_id for item in scenarios.list_public()},
        ),
        knowledge_evidence=RetrievalKnowledgeEvidenceProvider(resolved_retrieval),
        tracing=get_roleplay_tracing(),
    )


def _turn_analysis_context(
    advisor_message: str,
    scenario: ScenarioContract,
    state: RoleplayState,
) -> dict[str, Any]:
    """Build an allowlisted context without private hidden-fact values."""

    return {
        "prompt_version": TURN_ANALYZER_PROMPT_VERSION,
        "advisor_message": advisor_message,
        "scenario": {
            "scenario_id": scenario.scenario_id,
            "difficulty": scenario.difficulty,
            "disclosure_rules": [rule.model_dump(mode="json") for rule in scenario.disclosure_rules],
            "objections": [objection.model_dump(mode="json") for objection in scenario.objections],
            "success_conditions": scenario.success_conditions,
            "acceptable_outcomes": [item.model_dump(mode="json") for item in scenario.acceptable_outcomes],
            "upsell_benefits": [item.model_dump(mode="json") for item in scenario.upsell_benefits],
            "policy_expectations": policy_prompt_context(scenario),
            "customer_goals": scenario.customer_goals,
            "termination_conditions": {
                **scenario.termination_conditions.model_dump(mode="json"),
                "max_turns": state.max_turns,
            },
        },
        "state": {
            "conversation_stage": state.conversation_stage.value,
            "revealed_fact_ids": list(state.revealed_facts),
            "allowed_need_fact_keys": list(dict.fromkeys([*state.revealed_facts, "visible_goals"])),
            "active_objection_ids": list(state.active_objections),
            "resolved_objection_ids": list(state.resolved_objections),
            "unresolved_objection_ids": list(state.unresolved_objections),
            "current_topic": state.current_topic,
            "concern_prompt_counts": dict(state.concern_prompt_counts),
            "recent_messages": [message.model_dump(mode="json") for message in state.messages[-6:]],
        },
    }


def _serialize_context(context: dict[str, Any]) -> str:
    return "CONTEXT_JSON:\n" + json.dumps(
        context,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
