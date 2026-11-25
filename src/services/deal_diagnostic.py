"""Deal-Lost Root Cause Diagnostic Service (RCA) for VinFast sales role-play training.

Analyzes dialogue transcripts and evaluation rubric findings to pinpoint the exact
critical turning point where a sale was compromised, diagnose the root cause, and
provide concrete remediation advice with suggested scripts.
"""

from __future__ import annotations

import json
import logging
import re
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from src.agents.roleplay.contracts import ScenarioContract
from src.agents.roleplay.state import RoleplayMessage
from src.config import Settings, get_settings
from src.models.evaluation import CriterionStatus, CriterionType, SessionEvaluationResult
from src.services.llm import get_llm
from src.services.practice import PracticeSessionView
from src.services.practice_records import AttemptSummary

logger = logging.getLogger(__name__)


class RootCauseSeverity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RootCauseCategory(StrEnum):
    POLICY_INACCURACY = "POLICY_INACCURACY"
    MISSED_OBJECTION = "MISSED_OBJECTION"
    PREMATURE_CLOSING = "PREMATURE_CLOSING"
    POOR_NEED_DISCOVERY = "POOR_NEED_DISCOVERY"
    WEAK_VALUE_PROPOSITION = "WEAK_VALUE_PROPOSITION"
    COMMUNICATION_STYLE = "COMMUNICATION_STYLE"


class TurningPointTurn(BaseModel):
    turn_number: int
    speaker: str
    message: str
    impact: str


class DealDiagnosticResult(BaseModel):
    session_id: str
    scenario_id: str
    deal_status: str  # "LOST", "RISK", "WON"
    overall_score: float | None = None
    critical_turn: int | None = None
    root_cause_category: RootCauseCategory
    root_cause_title: str
    root_cause_explanation: str
    severity: RootCauseSeverity
    turning_point_turns: list[TurningPointTurn] = Field(default_factory=list)
    key_missed_facts: list[str] = Field(default_factory=list)
    remediation_advice: str
    recommended_script: str


DIAGNOSTIC_SYSTEM_PROMPT = """Bạn là Trưởng ban Huấn luyện Bán hàng Ô tô VinFast.
Nhiệm vụ của bạn là phân tích transcript buổi luyện tập tư vấn bán xe giữa Tư vấn viên (Advisor) và Khách hàng (Customer) để tìm ra NGUYÊN NHÂN GỐC RỄ (Root Cause Analysis) khiến cuộc tư vấn bị rớt deal hoặc bị đánh giá thấp.

Yêu cầu phân tích:
1. Xác định 'critical_turn': Lượt đối thoại mang tính bước ngoặt khiến khách hàng do dự hoặc từ chối.
2. Phân loại root_cause_category: POLICY_INACCURACY, MISSED_OBJECTION, PREMATURE_CLOSING, POOR_NEED_DISCOVERY, WEAK_VALUE_PROPOSITION, COMMUNICATION_STYLE.
3. Đưa ra giải thích chi tiết (root_cause_explanation) và lời khuyên khắc phục (remediation_advice).
4. Viết câu thoại mẫu chuẩn chỉnh (recommended_script) cho tư vấn viên bằng tiếng Việt chuyên nghiệp, lịch sự, đúng chính sách VinFast.

Trả về JSON theo đúng định dạng:
{
  "deal_status": "LOST" hoặc "RISK" hoặc "WON",
  "critical_turn": số lượt (int),
  "root_cause_category": "TÊN_CATEGORY",
  "root_cause_title": "Tiêu đề ngắn gọn lỗi",
  "root_cause_explanation": "Giải thích chi tiết",
  "severity": "HIGH" hoặc "MEDIUM" hoặc "LOW",
  "remediation_advice": "Lời khuyên thực chiến cho tư vấn viên",
  "recommended_script": "Câu thoại mẫu tư vấn viên nên nói"
}
"""


class DealDiagnosticService:
    """Diagnoses sales failures and derives coaching recommendations from practice attempts."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def diagnose(
        self,
        session_id: str,
        scenario: ScenarioContract,
        session: PracticeSessionView,
        evaluation: SessionEvaluationResult | None = None,
        attempt: AttemptSummary | None = None,
    ) -> DealDiagnosticResult:
        messages: list[RoleplayMessage] = session.messages
        overall_score = evaluation.overall_score if evaluation else None

        # 1. Try LLM Diagnosis if enabled
        try:
            llm = get_llm(temperature=0.0)
            transcript_text = "\n".join(
                f"[Lượt {i+1}][{m.role.upper()}]: {m.content}" for i, m in enumerate(messages)
            )
            eval_text = "Chưa có kết quả chấm điểm"
            if evaluation and evaluation.evaluations:
                eval_text = "\n".join(
                    f"- {ev.criterion}: {ev.score}/3 điểm ({ev.status}) - Lý do: {ev.reason}"
                    for ev in evaluation.evaluations
                )

            user_prompt = (
                f"Kịch bản: {scenario.title} ({scenario.scenario_id})\n"
                f"Khách hàng: {scenario.persona.get('name')} (Đang đi {scenario.persona.get('current_car')})\n"
                f"Mục tiêu khách: {scenario.buyer_intent}\n"
                f"Kết quả chấm điểm:\n{eval_text}\n\n"
                f"Toàn bộ Transcript:\n{transcript_text}\n"
            )

            response = await llm.ainvoke([
                {"role": "system", "content": DIAGNOSTIC_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ])
            raw_text = response.content if hasattr(response, "content") else str(response)
            parsed = self._parse_json(raw_text)

            critical_turn = parsed.get("critical_turn")
            turning_turns: list[TurningPointTurn] = []
            if critical_turn and 1 <= critical_turn <= len(messages):
                target_msg = messages[critical_turn - 1]
                turning_turns.append(
                    TurningPointTurn(
                        turn_number=critical_turn,
                        speaker=target_msg.role,
                        message=target_msg.content,
                        impact="Lượt đối thoại mấu chốt làm thay đổi cảm xúc của khách hàng",
                    )
                )

            return DealDiagnosticResult(
                session_id=session_id,
                scenario_id=scenario.scenario_id,
                deal_status=parsed.get("deal_status", "RISK"),
                overall_score=overall_score,
                critical_turn=critical_turn,
                root_cause_category=parsed.get("root_cause_category", RootCauseCategory.POOR_NEED_DISCOVERY),
                root_cause_title=parsed.get("root_cause_title", "Phát hiện điểm gãy trong tư vấn"),
                root_cause_explanation=parsed.get("root_cause_explanation", "Tư vấn viên chưa xử lý tối ưu tình huống."),
                severity=parsed.get("severity", RootCauseSeverity.MEDIUM),
                turning_point_turns=turning_turns,
                key_missed_facts=self._find_missed_facts(scenario, messages),
                remediation_advice=parsed.get("remediation_advice", "Luyện tập thêm kỹ năng lắng nghe và đặt câu hỏi."),
                recommended_script=parsed.get("recommended_script", "Em cảm ơn anh/chị đã chia sẻ băn khoăn..."),
            )
        except Exception as exc:
            logger.info("LLM diagnostic skipped or offline (%s), falling back to rule-based RCA", exc)
            return self._heuristic_diagnose(session_id, scenario, session, evaluation, attempt)

    @classmethod
    def _parse_json(cls, raw: str) -> dict[str, Any]:
        content = raw.strip()
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1:
            content = content[start : end + 1]
        content = re.sub(r",\s*([\]}])", r"\1", content)
        return json.loads(content)

    def _find_missed_facts(self, scenario: ScenarioContract, messages: list[RoleplayMessage]) -> list[str]:
        full_dialogue = " ".join(m.content.lower() for m in messages)
        missed: list[str] = []
        for fact_key, fact_val in scenario.hidden_facts.items():
            words = [w for w in fact_key.split("_") if len(w) > 2]
            if not any(w in full_dialogue for w in words):
                missed.append(f"{fact_key}: {fact_val}")
        return missed[:3]

    def _heuristic_diagnose(
        self,
        session_id: str,
        scenario: ScenarioContract,
        session: PracticeSessionView,
        evaluation: SessionEvaluationResult | None,
        attempt: AttemptSummary | None,
    ) -> DealDiagnosticResult:
        messages = session.messages
        overall_score = evaluation.overall_score if evaluation else None
        scores_by_crit: dict[str, int] = {}
        reasons_by_crit: dict[str, str] = {}

        if evaluation and evaluation.evaluations:
            for ev in evaluation.evaluations:
                if ev.status == CriterionStatus.ASSESSED and ev.score is not None:
                    scores_by_crit[ev.criterion] = ev.score
                    reasons_by_crit[ev.criterion] = ev.reason

        # 1. Determine deal status & severity
        if overall_score is not None and overall_score >= 2.5:
            deal_status = "WON"
            severity = RootCauseSeverity.LOW
        elif overall_score is not None and overall_score < 2.0:
            deal_status = "LOST"
            severity = RootCauseSeverity.HIGH
        else:
            deal_status = "RISK"
            severity = RootCauseSeverity.MEDIUM

        # 2. Identify primary failure category and critical turn
        critical_turn = None
        turning_turns: list[TurningPointTurn] = []

        if scores_by_crit.get(CriterionType.POLICY_ACCURACY, 3) <= 1:
            category = RootCauseCategory.POLICY_INACCURACY
            title = "Tư vấn sai hoặc thiếu cơ sở về chính sách VinFast"
            explanation = (
                reasons_by_crit.get(CriterionType.POLICY_ACCURACY)
                or "Tư vấn viên cung cấp số liệu chính sách giá, ưu đãi pin hoặc bảo hành không có căn cứ xác thực từ tài liệu chính thức của VinFast."
            )
            remediation = "Tra cứu tài liệu chuẩn bằng Copilot trước khi đưa ra khẳng định về giá hoặc chính sách pin cho khách."
            script = "Dạ về chính sách bảo hành và ưu đãi pin của dòng xe này, em xin phép gửi anh/chị thông tin chính thức được áp dụng mới nhất từ VinFast để anh/chị hoàn toàn yên tâm ạ."
            critical_turn = min(len(messages), 4)

        elif scores_by_crit.get(CriterionType.OBJECTION_HANDLING, 3) <= 1:
            category = RootCauseCategory.MISSED_OBJECTION
            title = "Bỏ qua hoặc chưa giải tỏa được rào cản tâm lý của khách hàng"
            explanation = (
                reasons_by_crit.get(CriterionType.OBJECTION_HANDLING)
                or "Khách hàng nêu rõ băn khoăn về trạm sạc, dung lượng pin hoặc độ bền nhưng tư vấn viên lảng tránh hoặc trả lời chung chung."
            )
            remediation = "Áp dụng kỹ thuật đồng cảm (Em rất hiểu nỗi lo của anh/chị) và dùng dẫn chứng thực tế về mạng lưới trạm sạc V-Green để thuyết phục."
            script = "Em rất hiểu băn khoăn của anh/chị về việc sạc xe. Hiện tại VinFast đã phủ sóng trạm sạc trên toàn quốc từ cao tốc đến trung tâm thương mại, và có ứng dụng định vị trụ sạc rảnh thời gian thực ngay trên màn hình xe ạ."
            critical_turn = min(len(messages), 3)

        elif scores_by_crit.get(CriterionType.NEED_DISCOVERY, 3) <= 1:
            category = RootCauseCategory.POOR_NEED_DISCOVERY
            title = "Chưa khai thác nhu cầu sử dụng thực tế của khách hàng"
            explanation = (
                reasons_by_crit.get(CriterionType.NEED_DISCOVERY)
                or "Tư vấn viên vội vàng giới thiệu xe khi chưa tìm hiểu cự ly di chuyển hàng ngày, nơi đỗ xe qua đêm và ngân sách dự kiến của khách."
            )
            remediation = "Mở đầu cuộc trò chuyện bằng các câu hỏi mở thân thiện để khách chia sẻ thói quen đi lại trước khi tư vấn phiên bản xe."
            script = "Dạ trước khi tư vấn chi tiết các phiên bản, cho em hỏi thêm là bình thường anh/chị dự định dùng xe để đi làm hàng ngày hay thường xuyên đi đường dài, và nơi ở của mình có tiện sạc xe không ạ?"
            critical_turn = 1

        elif scores_by_crit.get(CriterionType.CLOSING_NEXT_STEP, 3) <= 1:
            category = RootCauseCategory.PREMATURE_CLOSING
            title = "Chốt cọc xe quá vội khi khách hàng chưa sẵn sàng"
            explanation = (
                reasons_by_crit.get(CriterionType.CLOSING_NEXT_STEP)
                or "Tư vấn viên thúc ép chốt hợp đồng hoặc cọc xe khi khách hàng còn nhiều do dự, gây cảm giác áp lực và phòng thủ."
            )
            remediation = "Hạ bớt áp lực chốt mua, thay vào đó mời khách hàng lái thử trải nghiệm xe thực tế để tự cảm nhận ưu điểm."
            script = "Dạ em hiểu anh/chị cần cân nhắc thêm với gia đình. Hay là cuối tuần này em mời anh/chị ghé showroom lái thử xe một vòng quanh phố để cảm nhận độ êm ái và tầm quan sát thực tế trước nhé ạ?"
            critical_turn = max(1, len(messages) - 1)

        else:
            category = RootCauseCategory.WEAK_VALUE_PROPOSITION
            title = "Chưa làm nổi bật bài toán tổng chi phí sở hữu (TCO) xe điện"
            explanation = (
                "Chưa so sánh được chi phí sạc điện và chi phí bảo dưỡng vượt trội so với chiếc xe xăng cũ khách hàng đang sử dụng."
            )
            remediation = "Lập bảng so sánh chi phí năng lượng hàng tháng giữa chiếc xe hiện tại của khách và xe điện VinFast tương ứng."
            script = "Dạ với cự ly di chuyển hàng tháng của anh, chi phí tiền sạc xe điện sẽ tiết kiệm được hơn một nửa so với tiền xăng chiếc xe hiện tại, chưa kể chi phí bảo dưỡng định kỳ rẻ hơn rất nhiều ạ."
            critical_turn = min(len(messages), 2)

        if critical_turn and 1 <= critical_turn <= len(messages):
            msg = messages[critical_turn - 1]
            turning_turns.append(
                TurningPointTurn(
                    turn_number=critical_turn,
                    speaker=msg.role,
                    message=msg.content,
                    impact=f"Điểm gãy nhận diện: {category.value}",
                )
            )

        return DealDiagnosticResult(
            session_id=session_id,
            scenario_id=scenario.scenario_id,
            deal_status=deal_status,
            overall_score=overall_score,
            critical_turn=critical_turn,
            root_cause_category=category,
            root_cause_title=title,
            root_cause_explanation=explanation,
            severity=severity,
            turning_point_turns=turning_turns,
            key_missed_facts=self._find_missed_facts(scenario, messages),
            remediation_advice=remediation,
            recommended_script=script,
        )
