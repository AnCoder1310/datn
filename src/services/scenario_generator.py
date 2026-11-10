"""AI Prompt-to-Scenario Generator for VinFast Sales Training.

Decomposes natural language coaching requirements into production-grade
validated ScenarioContract objects.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from src.agents.roleplay.contracts import (
    _CORPUS_FIGURE,
    _CORPUS_ONLY_FIGURE,
    AcceptableOutcome,
    DisclosureRule,
    ObjectionContract,
    PolicyExpectation,
    PolicyLookup,
    ScenarioContract,
    TerminationConditions,
)
from src.config import Settings, get_settings
from src.services.llm import get_llm

logger = logging.getLogger(__name__)

SCENARIO_SYSTEM_PROMPT = """Bạn là Chuyên gia Đào tạo Bán hàng Cấp cao của VinFast (VinFast Sales Training Architect).
Nhiệm vụ của bạn là chuyển đổi yêu cầu đào tạo bằng ngôn ngữ tự nhiên từ Quản lý bán hàng (Manager) thành kịch bản luyện tập Role-play chi tiết cho tư vấn viên.

QUY TẮC BẮT BUỘC VỀ DỮ LIỆU:
1. TRUNG THỰC VỚI YÊU CẦU CỦA QUẢN LÝ (CỰC KỲ QUAN TRỌNG):
   - Nếu trong yêu cầu có nêu tên khách hàng (ví dụ: "tên An", "chị Lan", "bác Hùng"), trường persona.name BẮT BUỘC phải dùng đúng tên đó (ví dụ: "Anh An" hoặc "Chị An"). TUYỆT ĐỐI không tự ý đổi tên thành tên khác (như Anh Minh, Anh Tuấn,...).
   - Nếu yêu cầu có nêu xe phân vân/xe cũ (ví dụ: "Mazda CX-5", "Kia Cerato"), trường persona.current_car phải thể hiện rõ xe đó.
   - Nếu yêu cầu có nêu thông tin gia đình/con nhỏ, persona và bối cảnh phải phản ánh chính xác.
1. Thông tin khách hàng (persona, hidden_facts, visible_context, buyer_intent, customer_goals):
   - Cho phép khách nói số tiền ngân sách (ví dụ: 300 triệu) và quãng đường (ví dụ: 20 km/ngày).
   - TUYỆT ĐỐI KHÔNG chứa tỷ lệ phần trăm (%), ngày tháng (dd/mm/yyyy) hoặc cặp bảo hành số năm/số km (ví dụ không ghi '10 năm/200.000 km').
2. Tiêu chí đào tạo & chính sách (expected_discovery, success_conditions, policy_expectations, objections):
   - TUYỆT ĐỐI figure-free: Không chứa bất kỳ con số cụ thể nào về tiền, km, %, ngày tháng hay bảo hành. Hãy dùng từ ngữ mô tả định tính (ví dụ: 'chi phí sạc hợp lý', 'quãng đường di chuyển hàng ngày', 'thời hạn bảo hành dài hạn').
3. Dải xe VinFast: VF 3, VF 5, VF 6, VF 7, VF 8, VF 9.
4. Trả về đúng định dạng JSON hợp lệ, KHÔNG bọc văn bản giải thích ngoài JSON.
"""


def _sanitize_figure_free(text: str) -> str:
    """Ensure text contains no corpus figures (money, km, %, dates, warranty pairs)."""
    return _CORPUS_FIGURE.sub("tiêu chuẩn", text)


def _sanitize_customer_text(text: str) -> str:
    """Ensure customer text contains no corpus-only figures (%, dates, warranty pairs)."""
    return _CORPUS_ONLY_FIGURE.sub("phù hợp", text)


class GenerateScenarioRequest(BaseModel):
    prompt: str = Field(min_length=5, description="Yêu cầu kịch bản từ quản lý")
    difficulty: str = Field(default="Medium", description="Độ khó: Easy, Medium, Hard")


class ScenarioGeneratorService:
    """Translates manager coaching prompts into complete, verified VinFast training scenarios."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def generate(
        self,
        prompt: str,
        difficulty: str = "Medium",
        model_name: str | None = None,
    ) -> ScenarioContract:
        clean_prompt = prompt.strip()
        diff = difficulty if difficulty in {"Easy", "Medium", "Hard"} else "Medium"

        # 1. Attempt LLM Generation if configured
        try:
            llm = get_llm(model=model_name, temperature=0.2)
            user_msg = (
                f"Tạo kịch bản luyện tập bán xe VinFast với yêu cầu sau:\n"
                f"- Yêu cầu: {clean_prompt}\n"
                f"- Độ khó: {diff}\n"
                f"Hãy trả về JSON cấu trúc kịch bản theo đúng schema quy định."
            )
            response = await llm.ainvoke([
                {"role": "system", "content": SCENARIO_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ])
            raw_content = response.content if hasattr(response, "content") else str(response)
            parsed = self._parse_llm_json(raw_content)
            scenario = self._build_contract_from_parsed(parsed, diff, clean_prompt)
            return scenario
        except Exception as exc:
            logger.warning("LLM scenario generation failed or not configured (%s), using intelligent fallback template", exc)
            return self.generate_offline_template(clean_prompt, diff)

    @classmethod
    def _parse_llm_json(cls, raw: str) -> dict[str, Any]:
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

    def _build_contract_from_parsed(self, data: dict[str, Any], difficulty: str, prompt: str) -> ScenarioContract:
        # Sanitize text fields to guarantee figure-free invariants
        model_tag = "VINFAST"
        for candidate in ["VF 3", "VF 5", "VF 6", "VF 7", "VF 8", "VF 9"]:
            if candidate.lower() in prompt.lower() or candidate.replace(" ", "").lower() in prompt.lower():
                model_tag = candidate.replace(" ", "")
                break

        scenario_id = data.get("scenario_id") or f"SCENARIO_GEN_{model_tag}_{uuid4().hex[:6].upper()}"
        title = data.get("title") or f"Tư vấn xe {model_tag} theo nhu cầu khách hàng"
        title = _sanitize_customer_text(title)

        visible_context = _sanitize_customer_text(
            data.get("visible_context") or "Khách hàng nhắn tin hỏi thông tin lăn bánh và ưu đãi sạc pin."
        )

        persona = data.get("persona") or {
            "name": "Anh Minh",
            "age": 32,
            "current_car": "Xe máy xăng",
            "communication_style": "Thân thiện, thực tế, quan tâm chi phí vận hành",
        }
        # Safeguard: Enforce explicit prompt attributes (name, competing car, family)
        prompt_name_match = re.search(r"tên\s+(?:là\s+)?([A-ZÀ-Ỹa-zà-ỹ]+)", prompt, re.IGNORECASE)
        if prompt_name_match:
            explicit_name = prompt_name_match.group(1).capitalize()
            is_female = bool(re.search(r"(?i)\b(nữ|chị|cô|bà)\b", prompt))
            prefix = "Chị" if is_female else "Anh"
            expected_full_name = f"{prefix} {explicit_name}"

            curr_persona_name = persona.get("name", "")
            curr_tokens = [t.lower() for t in re.findall(r"\w+", curr_persona_name)]
            if explicit_name.lower() not in curr_tokens:
                logger.info("Aligning persona name from '%s' to prompt-explicit name '%s'", curr_persona_name, expected_full_name)
                persona["name"] = expected_full_name
                if curr_persona_name:
                    title = title.replace(curr_persona_name, expected_full_name)
                    visible_context = visible_context.replace(curr_persona_name, expected_full_name)

        comp_match = re.search(r"(?i)\b(mazda\s*cx-?5|cx-?5|cr-?v|tucson|santa\s*fe|cerato|vios|i10|innova)\b", prompt)
        if comp_match:
            raw_car = comp_match.group(1).upper()
            comp_name = "Mazda CX-5" if "CX" in raw_car else raw_car
            if "xe máy" in persona.get("current_car", "").lower() or not persona.get("current_car"):
                persona["current_car"] = f"Đang cân nhắc {comp_name}"

        if re.search(r"(2\s*con|con\s*nhỏ|gia\s*đình)", prompt, re.IGNORECASE):
            if "con" not in persona.get("communication_style", "").lower():
                persona["communication_style"] = f"{persona.get('communication_style', '')}, quan tâm an toàn cho gia đình và 2 con nhỏ".strip(", ")

        for k, v in list(persona.items()):
            if isinstance(v, str):
                persona[k] = _sanitize_customer_text(v)



        hidden_facts = data.get("hidden_facts") or {
            "budget": "Khách có sẵn ngân sách trả trước vừa phải, phần còn lại cân nhắc trả góp",
            "real_concern": "Lo ngại thời gian sạc pin và khoảng cách giữa các trạm sạc công cộng",
        }
        sanitized_hidden: dict[str, str] = {}
        for k, v in hidden_facts.items():
            sanitized_hidden[str(k)] = _sanitize_customer_text(str(v))

        buyer_intent = _sanitize_customer_text(
            data.get("buyer_intent") or f"Cân nhắc chuyển đổi sang xe điện {model_tag} để tiết kiệm chi phí nhiên liệu"
        )
        customer_goals = _sanitize_customer_text(
            data.get("customer_goals") or "Tìm hiểu chi phí sử dụng hàng tháng và trải nghiệm lái thử thực tế"
        )

        # Build disclosure rules linking to hidden facts
        disclosure_rules: list[DisclosureRule] = []
        raw_rules = data.get("disclosure_rules", [])
        if raw_rules and isinstance(raw_rules, list):
            for r in raw_rules:
                fk = r.get("fact_key", "")
                if fk in sanitized_hidden:
                    disclosure_rules.append(
                        DisclosureRule(
                            fact_key=fk,
                            trigger_intent=r.get("trigger_intent", "ask_customer_need"),
                            trigger_keywords=[_sanitize_figure_free(kw) for kw in r.get("trigger_keywords", ["nhu cầu"]) if kw.strip()],
                            revealed_statement=_sanitize_customer_text(r.get("revealed_statement", sanitized_hidden[fk])),
                        )
                    )
        if not disclosure_rules:
            first_key = next(iter(sanitized_hidden.keys()))
            disclosure_rules.append(
                DisclosureRule(
                    fact_key=first_key,
                    trigger_intent="ask_customer_concern",
                    trigger_keywords=["quan tâm", "băn khoăn"],
                    revealed_statement=sanitized_hidden[first_key],
                )
            )

        # Build objections
        objections: list[ObjectionContract] = []
        raw_objs = data.get("objections", [])
        if raw_objs and isinstance(raw_objs, list):
            for obj in raw_objs:
                objections.append(
                    ObjectionContract(
                        objection_id=obj.get("objection_id", f"OBJ_{uuid4().hex[:4]}"),
                        trigger_stage=obj.get("trigger_stage", "objection_handling"),
                        trigger_keywords=[_sanitize_figure_free(kw) for kw in obj.get("trigger_keywords", ["sạc", "pin"]) if kw.strip()] or ["băn khoăn"],
                        objection_text=_sanitize_figure_free(obj.get("objection_text", "Tôi lo trạm sạc không tiện")),
                        resolve_condition=_sanitize_figure_free(obj.get("resolve_condition", "Tư vấn viên giải thích mạng lưới sạc")),
                        ideal_sales_response=_sanitize_figure_free(obj.get("ideal_sales_response", "VinFast có hệ thống trạm sạc phủ khắp toàn quốc")),
                    )
                )
        if not objections:
            objections.append(
                ObjectionContract(
                    objection_id="OBJ_CHARGING_CONCERN",
                    trigger_stage="objection_handling",
                    trigger_keywords=["trạm sạc", "sạc pin", "hết pin"],
                    objection_text=_sanitize_figure_free("Tôi lo ngại việc tìm trạm sạc khi di chuyển xa"),
                    resolve_condition=_sanitize_figure_free("Tư vấn viên giới thiệu mạng lưới trạm sạc và ứng dụng định vị trụ sạc"),
                    ideal_sales_response=_sanitize_figure_free("Hệ thống trạm sạc VinFast hiện diện tại các trung tâm thương mại và trạm dừng nghỉ trên toàn quốc"),
                )
            )

        # Build policy expectations
        policy_expectations: list[PolicyExpectation] = []
        raw_policies = data.get("policy_expectations", [])
        if raw_policies and isinstance(raw_policies, list):
            for p in raw_policies:
                policy_expectations.append(
                    PolicyExpectation(
                        policy_id=p.get("policy_id", "charging_policy"),
                        level=p.get("level", "expected"),
                        requires_eligibility_check=bool(p.get("requires_eligibility_check", False)),
                        topic=_sanitize_figure_free(p.get("topic", "Chính sách sạc pin và bảo hành xe")),
                        lookup=PolicyLookup(
                            query=_sanitize_figure_free(p.get("lookup", {}).get("query", "chính sách sạc")),
                            document_type=p.get("lookup", {}).get("document_type", "policy"),
                            policy_type=p.get("lookup", {}).get("policy_type", "charging"),
                            product_model=model_tag if model_tag != "VINFAST" else "ALL",
                        ),
                    )
                )
        if not policy_expectations:
            policy_expectations.append(
                PolicyExpectation(
                    policy_id="charging_benefits",
                    level="expected",
                    topic=_sanitize_figure_free("Chính sách ưu đãi trạm sạc và điều kiện sử dụng"),
                    lookup=PolicyLookup(
                        query="Chính sách ưu đãi sạc pin",
                        document_type="policy",
                        policy_type="charging",
                        product_model=model_tag if model_tag != "VINFAST" else "ALL",
                    ),
                )
            )

        return ScenarioContract(
            scenario_id=scenario_id,
            title=title,
            difficulty=difficulty,
            target_skills=["need_discovery", "product_knowledge", "objection_handling", "closing_next_step"],
            sales_channel=data.get("sales_channel") or "Showroom",
            training_objective=_sanitize_customer_text(
                data.get("training_objective") or f"Luyện kỹ năng khai thác nhu cầu và giải tỏa băn khoăn về xe điện {model_tag}"
            ),
            scenario_version="1.0",
            persona=persona,
            visible_context=visible_context,
            hidden_facts=sanitized_hidden,
            buyer_intent=buyer_intent,
            customer_goals=customer_goals,
            disclosure_rules=disclosure_rules,
            objections=objections,
            expected_discovery=_sanitize_figure_free("Tư vấn viên khai thác rõ nhu cầu di chuyển và thói quen sạc xe của khách"),
            success_conditions=_sanitize_figure_free("Giải tỏa được băn khoăn về trạm sạc và hẹn lịch lái thử trải nghiệm xe"),
            termination_conditions=TerminationConditions(
                max_turns=10,
                drop_out_trigger=_sanitize_figure_free("Tư vấn viên không trả lời trọng tâm thắc mắc sau nhiều lượt"),
            ),
            acceptable_outcomes=[
                AcceptableOutcome(
                    outcome_id="schedule_test_drive",
                    label=_sanitize_figure_free("Hẹn lịch lái thử"),
                    product=model_tag,
                    preferred=True,
                )
            ],
            policy_expectations=policy_expectations,
        )

    @classmethod
    def generate_offline_template(cls, prompt: str, difficulty: str = "Medium") -> ScenarioContract:
        """Deterministic, adaptive offline template generator customized to the prompt details."""
        clean = prompt.strip()
        diff = difficulty if difficulty in {"Easy", "Medium", "Hard"} else "Medium"

        # 1. Parse Key Attributes from User Prompt
        name_match = re.search(r"tên\s+(?:là\s+)?([A-ZÀ-Ỹa-zà-ỹ]+)", clean, re.IGNORECASE)
        name = name_match.group(1).capitalize() if name_match else None
        is_female = bool(re.search(r"\b(nữ|chị|cô|bà)\b", clean, re.IGNORECASE))
        full_name = f"Chị {name}" if (name and is_female) else (f"Anh {name}" if name else ("Chị Linh" if is_female else "Anh Tuấn"))

        age_match = re.search(r"(\d{2})\s*tuổi", clean)
        age = int(age_match.group(1)) if age_match else (27 if is_female else 36)

        comp_match = re.search(
            r"(Mazda\s*CX-5|CX-5|Honda\s*CR-V|CR-V|Hyundai\s*Tucson|Tucson|Santa\s*Fe|Kia\s*Cerato|Cerato|Toyota\s*Vios|Vios|Hyundai\s*i10|i10|xe\s*máy\s*điện|xe\s*xăng)",
            clean,
            re.IGNORECASE,
        )
        comp_car = comp_match.group(1) if comp_match else ("xe máy điện Klara" if is_female else "xe xăng phân khúc C")

        vf_match = re.search(r"VF\s*([356789])", clean, re.IGNORECASE)
        vf_num = vf_match.group(1) if vf_match else ("3" if is_female else "7")
        vf_model = f"VF {vf_num}"

        budget_match = re.search(r"(?:ngân\s*sách|tài\s*chính|tầm|khoảng)\s*([0-9\.,]+\s*(?:tỷ|triệu|tr))", clean, re.IGNORECASE)
        budget = budget_match.group(1) if budget_match else ("250 triệu" if vf_num == "3" else "1 tỷ")

        has_kids = bool(re.search(r"(con|gia\s*đình|bé|trẻ)", clean, re.IGNORECASE))
        has_long_trip = bool(re.search(r"(đường\s*dài|về\s*quê|cao\s*tốc|đi\s*xa)", clean, re.IGNORECASE))
        is_strict = bool(re.search(r"(khó\s*tính|kỹ\s*tính|cẩn\s*thận|đòi\s*hỏi)", clean, re.IGNORECASE))

        style = "Khó tính, cẩn trọng, đòi hỏi thông số kỹ thuật và độ an toàn cao" if is_strict else "Cởi mở, thực tế, quan tâm chi phí vận hành và tiện nghi gia đình"
        uid = uuid4().hex[:6].upper()
        scenario_id = f"SCENARIO_CUSTOM_VF{vf_num}_{uid}"

        # 2. Build Scenario Contract Tailored to Extracted Details
        title = f"Khách hàng {full_name} cân nhắc lựa chọn giữa {vf_model} và {comp_car}"
        vis_context = (
            f"Khách bước vào showroom: 'Chào em, anh/chị đang phân vân giữa {vf_model} với chiếc {comp_car}. "
            f"Ngân sách tầm {budget}, cần xe phù hợp cho {('gia đình có con nhỏ và đi đường dài' if (has_kids or has_long_trip) else 'nhu cầu đi lại hàng ngày')}.'"
        )
        hidden_family = "Gia đình có con nhỏ, thường xuyên đi lại cuối tuần và đường dài" if (has_kids or has_long_trip) else "Di chuyển chủ yếu trong đô thị và công việc hàng ngày"

        return ScenarioContract(
            scenario_id=scenario_id,
            title=title,
            difficulty=diff,
            target_skills=["need_discovery", "product_knowledge", "objection_handling", "closing_next_step"],
            sales_channel="Showroom",
            training_objective=_sanitize_customer_text(
                f"Khai thác nhu cầu sử dụng thực tế, giải tỏa băn khoăn so sánh với {comp_car} và chốt lịch lái thử {vf_model}."
            ),
            scenario_version="1.0",
            persona={
                "name": full_name,
                "age": age,
                "current_car": f"Đang cân nhắc {comp_car}",
                "communication_style": style,
            },
            visible_context=vis_context,
            hidden_facts={
                "budget": f"Ngân sách dự trù khoảng {budget}",
                "usage": hidden_family,
                "real_concern": f"Lo ngại chi phí pin và trạm sạc đường xa khi so với xe xăng {comp_car}",
            },
            buyer_intent=f"Muốn chọn một chiếc SUV điện hiện đại {vf_model} nhưng còn e ngại tính tiện lợi so với {comp_car}",
            customer_goals=f"So sánh rõ ràng chi phí năng lượng và trải nghiệm vận hành thực tế giữa {vf_model} và {comp_car}",
            disclosure_rules=[
                DisclosureRule(
                    fact_key="budget",
                    trigger_intent="ask_budget",
                    trigger_keywords=["ngân sách", "tài chính", "giá", "khoảng"],
                    revealed_statement=f"Tài chính anh/chị chuẩn bị tầm {budget}, có thể trả thẳng hoặc trả góp hợp lý.",
                ),
                DisclosureRule(
                    fact_key="usage",
                    trigger_intent="ask_usage",
                    trigger_keywords=["nhu cầu", "đi lại", "con nhỏ", "đường dài", "về quê"],
                    revealed_statement=f"{hidden_family}, nên anh/chị rất quan tâm độ an toàn và trạm sạc.",
                ),
            ],
            objections=[
                ObjectionContract(
                    objection_id=f"OBJ_COMPARE_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["so sánh", comp_car.lower(), "xe xăng", "bất tiện"],
                    objection_text=f"Anh/chị thấy {comp_car} chạy xăng đổ xăng nhanh tiện, sao anh/chị phải chọn xe điện {vf_model}?",
                    resolve_condition="Tư vấn viên làm rõ công nghệ vượt trội, chi phí vận hành tiết kiệm và độ an toàn của xe điện VinFast",
                    ideal_sales_response=f"{vf_model} sở hữu sức mạnh động cơ và trang bị an toàn vượt trội trong tầm giá, chi phí năng lượng tiết kiệm hơn một nửa so với xe xăng.",
                    requires_revealed_facts=[],
                ),
                ObjectionContract(
                    objection_id=f"OBJ_CHARGING_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["trạm sạc", "hết pin", "đường dài", "chờ sạc"],
                    objection_text="Gia đình đi xa nhỡ hết pin dọc đường hoặc trạm sạc đông phải chờ lâu thì bất tiện lắm em?",
                    resolve_condition="Tư vấn viên giới thiệu quy mô trạm sạc V-Green phủ khắp quốc lộ và tốc độ sạc nhanh",
                    ideal_sales_response="Mạng lưới trạm sạc V-Green hiện phủ kín quốc lộ và cao tốc toàn quốc, tốc độ sạc nhanh giúp xe nạp lại phần lớn năng lượng chỉ trong thời gian nghỉ giải lao ngắn.",
                    requires_revealed_facts=[],
                ),
            ],
            expected_discovery="Tư vấn viên hỏi rõ nhu cầu di chuyển của gia đình và ngân sách dự kiến",
            success_conditions=f"Giải tỏa nỗi lo trạm sạc và thuyết phục khách đăng ký trải nghiệm lái thử {vf_model}",
            termination_conditions=TerminationConditions(
                max_turns=10,
                drop_out_trigger="Tư vấn viên không so sánh được ưu thế vận hành hoặc né tránh câu hỏi về trạm sạc",
            ),
            acceptable_outcomes=[
                AcceptableOutcome(
                    outcome_id="schedule_test_drive",
                    label=f"Hẹn lịch lái thử {vf_model}",
                    product=vf_model,
                    preferred=True,
                )
            ],
            upsell_benefits=[],
            upsell_rule=None,
            policy_expectations=[
                PolicyExpectation(
                    policy_id="charging",
                    level="expected",
                    topic="Chính sách sạc pin và bảo hành xe điện VinFast",
                    lookup=PolicyLookup(
                        query=f"{vf_model} trạm sạc bảo hành",
                        document_type="policy",
                        policy_type="charging",
                        product_model=vf_model,
                    ),
                ),
            ],
        )
