"""Routing policy for enquiries submitted by the public showroom portal.

Public requests do not carry an authenticated advisor identity.  The policy
therefore prefers an explicitly configured inbox owner, then the first active
advisor, and keeps the demo inbox only as a development fallback for an
unseeded database.
"""

from __future__ import annotations

from typing import Any


DEFAULT_PUBLIC_LEAD_ADVISOR_ID = "advisor-demo"


async def resolve_public_lead_advisor(request: Any) -> str:
    """Return one active advisor for a public enquiry.

    The fallback keeps local smoke tests and a freshly started development
    database usable before users have been seeded.  Production deployments
    should set ``PUBLIC_LEAD_ADVISOR_ID`` or seed at least one active advisor.
    """

    configured = getattr(request.app.state, "public_lead_advisor_id", None)
    qualification_checker = getattr(request.app.state, "advisor_qualification_checker", None)
    if configured and configured.strip():
        if qualification_checker is None or await qualification_checker(configured.strip()):
            return configured.strip()

    auth_service = getattr(request.app.state, "auth_service", None)
    if auth_service is not None:
        advisors = await auth_service.active_advisors()
        for advisor in advisors:
            if qualification_checker is None or await qualification_checker(advisor.user_id):
                return advisor.user_id

    return DEFAULT_PUBLIC_LEAD_ADVISOR_ID
