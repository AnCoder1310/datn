"""Explicitly requested, private drafts. Sales reviews before use."""

import re
from uuid import uuid4

from src.config import get_settings
from src.integrations.customer_intelligence_store import IntelligenceStore
from src.knowledge.retrieval_service import get_retrieval_service
from src.models.customer_intelligence import DraftAnswer
from src.models.sales_copilot import MessageDraftResponse, SenderRole
from src.observability import private_customer_context
from src.services.customer_pii import CustomerPII

DRAFT_PROMPT = """Soạn một tin nhắn tiếng Việt để tư vấn viên VinFast gửi cho khách.

Trả lời trực tiếp lượt khách đang chờ trong `customer_turn` (có thể gồm nhiều tin liên tiếp). Dùng
`messages` để hiểu câu hỏi nối tiếp như “còn bản Plus thì sao?” hoặc “tầm đó được không em?”.
Ưu tiên nội dung khách vừa xác nhận khi hồ sơ cũ mâu thuẫn. Chỉ nhắc nhu cầu, ngân sách,
phiên bản xe hay lịch đã trao đổi khi chúng giúp trả lời lượt này, tránh hỏi lại thông tin đã có.

Viết như tin nhắn hội thoại, thường từ 1 đến 3 câu. Giữ cách tư vấn viên xưng hô nếu đã rõ.
Nếu chưa rõ cách gọi khách, có thể mở đầu “Dạ” rồi trả lời mà không cần gọi tên hay dùng “anh/chị”.
Không đọc lại họ tên và số điện thoại khách, chào lại giữa cuộc trò chuyện, chèn lời quảng cáo
hay mời lái thử khi chưa phù hợp với nội dung trao đổi. Chỉ thêm một câu hỏi làm rõ nếu cần để xử lý yêu cầu.

Chỉ nêu giá, ưu đãi, chính sách, điều kiện trả góp, thông số và mốc thời gian khi có căn cứ
trong `knowledge` hoặc đã được tư vấn viên xác nhận trong `messages`. Đối chiếu đúng xe,
phiên bản, khu vực, thời điểm và đối tượng. Ngân sách khách đưa ra không phải giá bán.
Nếu chưa thể xác nhận (ví dụ giá lăn bánh hiện tại, tồn kho, lịch giao xe), nêu đúng điểm cần
kiểm tra hoặc hỏi dữ kiện còn thiếu. Không đoán số liệu hay cam kết kết quả.

Chỉ viết tin nhắn gửi khách trong `text`. Nếu dẫn lời trong `messages`, trường `evidence`
chứa `message_id` và `quote` nguyên văn. Dùng `[]` nếu không dẫn lời."""

_VEHICLE_REFERENCE = re.compile(
    r"\b(?:VF[\s-]*(?:[356789]|Wild)|(?:Minio|Herio|Nerio|Limo)\s+Green|EC\s+Van)\b", re.I,
)


def _doc_label(doc) -> str:
    direct = getattr(doc, "source", None)
    if direct:
        return str(direct)
    meta = getattr(doc, "metadata", None)
    if isinstance(meta, dict):
        return str(meta.get("title") or meta.get("source") or "Tài liệu sản phẩm")
    if meta is not None:
        title = getattr(meta, "title", None)
        source = getattr(meta, "source", None)
        if title and source and title != source:
            return f"{title} ({source})"
        if title or source:
            return str(title or source)
    return "Tài liệu sản phẩm"


def _extract_sales_style(all_messages, customer_name: str, pii: CustomerPII) -> dict:
    """Analyze how the Sales advisor addresses the customer and writes messages."""
    sales_msgs = [pii.mask(m.content.strip()) for m in all_messages if m.sender_role == "sales" and m.content.strip()]
    joined = " ".join(sales_msgs)
    lower_joined = joined.lower()

    # 1. Self pronoun used by Sales
    self_pronoun = "em"
    if re.search(r"\bmình\b", lower_joined) and not re.search(r"\bem\b", lower_joined):
        self_pronoun = "mình"

    # Recognize observed forms of address. A name on its own gives no reliable honorific.
    honorifics = ("anh", "chị", "bác", "cô", "chú", "bạn")
    name_parts = (customer_name or "").strip().split()
    explicit_honorific = name_parts[0].lower() if name_parts else ""
    customer_address = explicit_honorific if explicit_honorific in honorifics else ""
    for message in reversed(sales_msgs):
        address = re.search(r"(?i)^(?:dạ|vâng|chào)[, ]+?(anh/chị|anh|chị|bác|cô|chú|bạn)\b", message)
        if address:
            customer_address = address[1].lower()
            break

    # 3. Tone markers / particles used by Sales
    markers = []
    for particle in ("Dạ", "Vâng", "ạ", "nhé", "nha"):
        if re.search(rf"(?i)\b{particle}\b", joined):
            markers.append(particle)
    if not markers:
        markers = ["Dạ", "ạ", "nhé"]

    return {
        "self_pronoun": self_pronoun,
        "customer_address": customer_address,
        "tone_markers": markers,
        "sample_messages": sales_msgs[-3:],
    }


def _build_customer_context(detail, confirmed: dict) -> dict:
    """Build structured customer personalization context from profile and memory."""
    profile = detail.profile or {}
    memory = detail.memory or {}
    payment_map = {"cash": "Trả thẳng", "installment": "Trả góp", "mixed": "Kết hợp trả thẳng / trả góp"}
    raw_payment = profile.get("payment_method")
    open_points = [
        kp.get("question") or kp.get("topic")
        for kp in (memory.get("key_points") or [])
        if isinstance(kp, dict) and kp.get("status") == "open" and (kp.get("question") or kp.get("topic"))
    ]
    return {
        "location": detail.customer_location or profile.get("living_area") or "",
        "lead_stage": (detail.lead_status or {}).get("stage") or "",
        "interested_models": profile.get("interested_models") or [],
        "competitor_models": profile.get("competitor_models") or [],
        "payment_method": payment_map.get(raw_payment, raw_payment or ""),
        "budget_vnd": profile.get("budget_vnd"),
        "budget_notes": profile.get("budget_notes") or "",
        "down_payment_vnd": profile.get("down_payment_vnd"),
        "usage_purpose": profile.get("usage_purpose") or "",
        "charging_condition": profile.get("charging_condition") or "",
        "purchase_timeline": profile.get("purchase_timeline") or "",
        "objections_and_concerns": profile.get("objections_and_concerns") or [],
        "open_questions": open_points or (profile.get("unresolved_questions") or []),
        "recap": memory.get("recap") or memory.get("quick_summary") or memory.get("detailed_summary") or "",
        "confirmed_facts": confirmed,
    }


class SalesCopilotAssistant:
    def __init__(self, repository):
        self.repository = repository

    async def generate_message_draft(self, conversation_id, advisor_id, *, force=False):
        if not get_settings().sales_intelligence_v2_enabled:
            raise ValueError("Customer Intelligence mới chưa được bật.")
        repo = self.repository
        customer_id = repo.owned_conversation(conversation_id, advisor_id)["customer_id"]
        store = IntelligenceStore(repo)
        store.authorize(customer_id, advisor_id)
        head = store.head(customer_id)
        pii = CustomerPII(head["pii_mapping"], customer_id=customer_id)
        from src.services.sales_conversation_service import SalesConversationService

        detail = SalesConversationService(repo).get_conversation_details(conversation_id, message_limit=1)
        confirmed = {
            f["field"]: f["value"]
            for f in detail.profile.get("facts", [])
            if f.get("verification_status") == "confirmed"
        }
        all_messages = repo.list_messages(
            conversation_id, limit=12, sender_roles=(SenderRole.CUSTOMER, SenderRole.SALES),
        )
        messages = all_messages[-6:]
        if not messages or messages[-1].sender_role != "customer":
            raise ValueError("Chưa có tin nhắn mới từ khách hàng cần trả lời.")
        customer_turn = []
        for message in reversed(messages):
            if message.sender_role != "customer":
                break
            customer_turn.append(message)
        customer_turn.reverse()
        customer_context = _build_customer_context(detail, confirmed)
        sales_style = _extract_sales_style(all_messages, detail.customer_name or "", pii)
        models = customer_context["interested_models"]

        query = pii.mask("\n".join(m.content for m in customer_turn))
        rag_query = query
        if not _VEHICLE_REFERENCE.search(query):
            previous_mention = next(
                (match[0] for message in reversed(messages[:-len(customer_turn)])
                 if (match := _VEHICLE_REFERENCE.search(message.content))),
                None,
            )
            vehicle_context = previous_mention or ", ".join(str(model) for model in models if model)
            if vehicle_context:
                rag_query = f"{vehicle_context}: {query}"
        # Retrieval may call an embedding model; it receives masked text too.
        with private_customer_context():
            docs = get_retrieval_service().retrieve(pii.mask(rag_query), top_k=5)
        sources = [{"id": str(i), "title": _doc_label(d), "content": d.content} for i, d in enumerate(docs)]
        draft = await pii.ask(
            DRAFT_PROMPT,
            {
                "profile": confirmed,
                "customer_context": customer_context,
                "sales_style": sales_style,
                "messages": [m.model_dump(mode="json") for m in messages],
                "customer_turn": [m.content for m in customer_turn],
                "knowledge": sources,
            },
            DraftAnswer,
        )
        draft_text = pii.restore(draft.text).strip()
        if not draft_text:
            raise ValueError("AI chưa soạn được nội dung trả lời.")
        from src.services.intelligence_engine import checked_evidence

        masked = {m.id: {"content": pii.mask(m.content)} for m in messages}
        valid_evidence = [
            e for e in (draft.evidence or [])
            if e.message_id in masked and e.quote and e.quote in masked[e.message_id]["content"]
        ]
        if valid_evidence:
            checked_evidence([{"evidence": [e.model_dump() for e in valid_evidence]}], masked)
        unique_sources = list(dict.fromkeys(_doc_label(d) for d in docs))
        response = MessageDraftResponse(
            conversation_id=conversation_id,
            draft_id=uuid4().hex,
            text=draft_text,
            context_trigger=pii.restore(query),
            sources=unique_sources,
            based_on_message_seq=max(detail.last_message_seq, all_messages[-1].seq),
        )
        # Persist any new identifiers with optimistic concurrency before saving the draft.
        store.save_mapping(customer_id, pii, head)
        repo.save_recommendation_or_draft(conversation_id, "draft", response.model_dump(mode="json"))
        return response
