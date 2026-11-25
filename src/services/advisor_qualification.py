"""Server-side advisor qualification gate backed by approved role-play evaluations.

The evaluator stores rubric scores on a 1–3 scale.  This module is deliberately
pure so assignment and chat authorization can share the same rule without
letting the frontend mint a qualification state.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from src.models.evaluation import CriterionStatus, CriterionType, ReviewStatus, SessionEvaluationResult

# Thresholds are configuration for the MVP rule.  They are kept in one backend
# module and never accepted from a client request.
DEFAULT_THRESHOLDS: Mapping[CriterionType, int] = {
    CriterionType.NEED_DISCOVERY: 80,
    CriterionType.PRODUCT_KNOWLEDGE: 90,
    CriterionType.OBJECTION_HANDLING: 80,
    CriterionType.POLICY_ACCURACY: 95,
    CriterionType.CLOSING_NEXT_STEP: 80,
}


@dataclass(frozen=True)
class QualificationResult:
    qualified: bool
    status: str
    overall_percent: float | None
    failed_criteria: tuple[str, ...]
    critical_violation: bool
    reason: str


def _percent(score: int | None) -> float | None:
    return None if score is None else round((score / 3) * 100, 2)


def evaluate_qualification(
    evaluation: SessionEvaluationResult | None,
    *,
    thresholds: Mapping[CriterionType, int] = DEFAULT_THRESHOLDS,
) -> QualificationResult:
    """Evaluate only an approved, evidence-backed evaluation result."""
    if evaluation is None:
        return QualificationResult(False, "NOT_QUALIFIED", None, tuple(thresholds), False, "Chưa có kết quả đánh giá.")
    if evaluation.review_status is not ReviewStatus.MANAGER_APPROVED:
        return QualificationResult(False, "PENDING_EVALUATION", _percent(evaluation.overall_score), tuple(thresholds), False, "Kết quả chưa được duyệt.")

    by_criterion = {item.criterion: item for item in evaluation.evaluations}
    failed: list[str] = []
    for criterion, minimum in thresholds.items():
        item = by_criterion.get(criterion)
        score = _percent(item.score) if item and item.status is CriterionStatus.ASSESSED else None
        if score is None or score < minimum:
            failed.append(criterion.value)

    critical = any(
        finding.severity == "critical" and finding.status.value == "contradicted"
        for finding in evaluation.factual_findings
    )
    passed = not failed and not critical and evaluation.overall_score is not None and _percent(evaluation.overall_score) >= 90
    if passed:
        return QualificationResult(True, "QUALIFIED", _percent(evaluation.overall_score), tuple(), False, "Đạt đầy đủ tiêu chí tư vấn.")
    reason = "Có vi phạm chính sách nghiêm trọng." if critical else "Chưa đạt một hoặc nhiều tiêu chí bắt buộc."
    return QualificationResult(False, "NOT_QUALIFIED", _percent(evaluation.overall_score), tuple(failed), critical, reason)


def advisor_can_receive_lead(evaluation: SessionEvaluationResult | None) -> bool:
    """Shared eligibility gate for assignment and real-customer chat."""
    return evaluate_qualification(evaluation).qualified
