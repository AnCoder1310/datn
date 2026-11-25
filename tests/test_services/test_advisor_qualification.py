from src.models.evaluation import (
    CriterionEvaluation, CriterionStatus, CriterionType, FactualFinding,
    FactualClaimStatus, ReviewStatus, SessionEvaluationResult, TranscriptEvidence,
)
from src.services.advisor_qualification import evaluate_qualification


def _evaluation(scores, *, review=ReviewStatus.MANAGER_APPROVED, critical=False):
    criteria = [
        CriterionType.NEED_DISCOVERY, CriterionType.PRODUCT_KNOWLEDGE,
        CriterionType.OBJECTION_HANDLING, CriterionType.POLICY_ACCURACY,
        CriterionType.CLOSING_NEXT_STEP,
    ]
    items = [CriterionEvaluation(criterion=c, status=CriterionStatus.ASSESSED, score=s, reason='ok', evidence=[TranscriptEvidence(message_id='m', quote='e')]) for c, s in zip(criteria, scores)]
    findings = [FactualFinding(claim='x', message_id='m', status=FactualClaimStatus.CONTRADICTED, severity='critical', reason='x')] if critical else []
    return SessionEvaluationResult(session_id='s', scenario_id='sc', rubric_version='v1', assessed_criteria_count=5, overall_score=sum(scores)/5, evaluations=items, factual_findings=findings, review_status=review)


def test_qualification_requires_manager_approval():
    result = evaluate_qualification(_evaluation([3, 3, 3, 3, 3], review=ReviewStatus.AI_DRAFT))
    assert not result.qualified
    assert result.status == 'PENDING_EVALUATION'


def test_qualification_requires_each_threshold_and_no_critical_violation():
    assert evaluate_qualification(_evaluation([3, 3, 3, 3, 3])).qualified
    assert not evaluate_qualification(_evaluation([3, 3, 3, 2, 3])).qualified
    assert not evaluate_qualification(_evaluation([3, 3, 3, 3, 3], critical=True)).qualified
