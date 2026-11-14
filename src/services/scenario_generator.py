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

        # 1. Detect target VinFast model
        vf_match = re.search(r"VF\s*([356789]|Wild)", clean, re.IGNORECASE)
        if vf_match:
            vf_key = vf_match.group(1).upper()
            vf_model = f"VF {vf_key}" if vf_key != "WILD" else "VF Wild"
            vf_num = vf_key
        elif re.search(r"(xe\s*máy\s*điện|xe\s*máy|chạy\s*phố|nhỏ\s*gọn|đô\s*thị|đầu\s*tiên)", clean, re.IGNORECASE):
            vf_model = "VF 3"
            vf_num = "3"
        elif re.search(r"(taxi|dịch\s*vụ|chạy\s*grab|vios|i10|tiết\s*kiệm\s*xăng)", clean, re.IGNORECASE):
            vf_model = "VF 5 Plus"
            vf_num = "5"
        elif re.search(r"(chung\s*cư|gia\s*đình\s*trẻ|seltos|creta)", clean, re.IGNORECASE):
            vf_model = "VF 6"
            vf_num = "6"
        elif re.search(r"(cx-5|cx5|cr-v|crv|tucson|thể\s*thao|sedan)", clean, re.IGNORECASE):
            vf_model = "VF 7"
            vf_num = "7"
        elif re.search(r"(santa\s*fe|everest|toàn\s*cầu|doanh\s*nhân)", clean, re.IGNORECASE):
            vf_model = "VF 8"
            vf_num = "8"
        elif re.search(r"(chủ\s*tịch|carnival|sang\s*trọng|full-size)", clean, re.IGNORECASE):
            vf_model = "VF 9"
            vf_num = "9"
        else:
            vf_model = "VF 6"
            vf_num = "6"

        # 2. Extract Gender, Name, Age
        is_female = bool(re.search(r"(nữ|chị|cô|bà|mẹ)", clean, re.IGNORECASE))
        is_elderly = bool(re.search(r"(bác|chú|bác\s*tài)", clean, re.IGNORECASE))

        name_match = re.search(r"tên\s+(?:là\s+)?([A-ZÀ-Ỹa-zà-ỹ]+)", clean, re.IGNORECASE)
        extracted_name = None
        if name_match:
            cand = name_match.group(1).capitalize()
            if cand.lower() not in {"nữ", "nam", "trẻ", "già", "khách", "hàng", "muốn", "cần", "lo", "bác"}:
                extracted_name = cand
        if not extracted_name:
            kh_match = re.search(r"(?:anh|chị|bác)\s+([A-ZÀ-Ỹa-zà-ỹ]+)", clean, re.IGNORECASE)
            if kh_match:
                cand = kh_match.group(1).capitalize()
                if cand.lower() not in {"nữ", "nam", "trẻ", "già", "khách", "hàng", "muốn", "cần", "lo", "tài"}:
                    extracted_name = cand

        prefix = "Chị" if is_female else ("Bác" if is_elderly else "Anh")
        default_names = {
            "Chị": "Linh" if vf_num == "3" else ("Hà" if vf_num == "6" else "Phương"),
            "Anh": "Nam" if vf_num in {"5", "7"} else ("Tuấn" if vf_num == "6" else "Hoàng"),
            "Bác": "Hùng" if vf_num == "5" else "Thành",
        }
        person_name = extracted_name or default_names.get(prefix, "Nam")
        full_name = f"{prefix} {person_name}"

        age_match = re.search(r"(\d{2})\s*tuổi", clean)
        if age_match:
            age = int(age_match.group(1))
        elif is_female:
            age = 27 if vf_num == "3" else 33
        elif is_elderly:
            age = 48
        else:
            age = 35 if vf_num in {"5", "6"} else 38

        # 3. Detect Competitor / Current Vehicle
        comp_match = re.search(
            r"(Mazda\s*CX-5|CX-5|Honda\s*CR-V|CR-V|Hyundai\s*Tucson|Tucson|Santa\s*Fe|Kia\s*Cerato|Cerato|Toyota\s*Vios|Vios|Hyundai\s*i10|i10|Kia\s*Seltos|Seltos|xe\s*máy\s*điện|xe\s*máy|xe\s*xăng\s*phân\s*khúc\s*[a-zA-Z]|xe\s*xăng)",
            clean,
            re.IGNORECASE,
        )
        if comp_match:
            raw_comp = comp_match.group(1).strip()
            if "cx-5" in raw_comp.lower() or "cx5" in raw_comp.lower():
                comp_car = "Mazda CX-5"
                comp_type = "petrol_suv"
            elif "vios" in raw_comp.lower():
                comp_car = "Toyota Vios"
                comp_type = "petrol_sedan"
            elif "cr-v" in raw_comp.lower() or "crv" in raw_comp.lower():
                comp_car = "Honda CR-V"
                comp_type = "petrol_suv"
            elif "máy điện" in raw_comp.lower():
                comp_car = "xe máy điện"
                comp_type = "e_scooter"
            elif "máy" in raw_comp.lower():
                comp_car = "xe máy"
                comp_type = "scooter"
            elif "sedan" in clean.lower():
                comp_car = "sedan xăng"
                comp_type = "petrol_sedan"
            else:
                comp_car = raw_comp
                comp_type = "petrol_car"
        elif vf_num == "3":
            comp_car = "xe máy điện"
            comp_type = "e_scooter"
        elif vf_num == "5":
            comp_car = "Toyota Vios"
            comp_type = "petrol_sedan"
        elif vf_num in {"6", "7"}:
            comp_car = "Mazda CX-5"
            comp_type = "petrol_suv"
        else:
            comp_car = "xe xăng cùng tầm giá"
            comp_type = "petrol_car"

        # 4. Context themes
        is_taxi = bool(re.search(r"(taxi|dịch\s*vụ|chạy\s*grab|chở\s*khách|bác\s*tài)", clean, re.IGNORECASE))
        is_apartment = bool(re.search(r"(chung\s*cư|hầm|sạc\s*chung\s*cư|tòa\s*nhà)", clean, re.IGNORECASE))
        has_kids = bool(re.search(r"(con|gia\s*đình|bé|trẻ\s*nhỏ|đưa\s*đón)", clean, re.IGNORECASE))
        has_long_trip = bool(re.search(r"(đường\s*dài|về\s*quê|cao\s*tốc|đi\s*xa|xuyên\s*việt)", clean, re.IGNORECASE))
        is_strict = bool(re.search(r"(khó\s*tính|kỹ\s*tính|cẩn\s*thận|đòi\s*hỏi|soi)", clean, re.IGNORECASE))

        # 5. Budget
        budget_match = re.search(r"(?:ngân\s*sách|tài\s*chính|tầm|khoảng)\s*([0-9\.,]+\s*(?:tỷ|triệu|tr))", clean, re.IGNORECASE)
        if budget_match:
            budget = budget_match.group(1)
        elif vf_num == "3":
            budget = "250 - 300 triệu"
        elif vf_num == "5":
            budget = "450 - 550 triệu"
        elif vf_num == "6":
            budget = "650 - 750 triệu"
        elif vf_num == "7":
            budget = "850 triệu - 1 tỷ"
        elif vf_num == "8":
            budget = "1 - 1,2 tỷ"
        else:
            budget = "1,6 - 1,8 tỷ"

        # 6. Style
        if is_strict:
            style = "Khó tính, cẩn trọng, đòi hỏi số liệu chính xác và so sánh chi phí rõ ràng"
        elif is_taxi:
            style = "Thực dụng, nói ngắn gọn, quan tâm thu nhập ròng và thời gian sạc giữa ca"
        elif is_female and vf_num == "3":
            style = "Nhẹ nhàng, thực tế, quan tâm sự tiện lợi khi sạc và độ an toàn khi đi mưa gió đô thị"
        elif has_kids:
            style = "Chu đáo, hướng về gia đình, ưu tiên an toàn cho con nhỏ và cốp để đồ rộng rãi"
        else:
            style = "Cởi mở, thực tế, quan tâm chi phí vận hành và trải nghiệm lái xe điện"

        uid = uuid4().hex[:6].upper()
        scenario_id = f"SCENARIO_CUSTOM_VF{vf_num}_{uid}"

        # 7. Objections tailored to detected context
        objections = []
        if comp_type in {"e_scooter", "scooter"}:
            objections.append(
                ObjectionContract(
                    objection_id=f"OBJ_COMPARE_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["xe máy", "chi phí", "bảo dưỡng", "tốn kém", "nuôi xe"],
                    objection_text=f"Chị đi {comp_car} quen sạc gọn nhẹ ở nhà, nâng cấp lên {vf_model} thì chi phí sạc pin với bảo dưỡng hàng tháng có tốn kém hơn nhiều không em?",
                    resolve_condition=f"Tư vấn viên phân tích chi phí sạc điện của {vf_model} cực kỳ kinh tế, che mưa che nắng và an toàn vượt trội",
                    ideal_sales_response=f"{vf_model} tiêu thụ điện cực kỳ tiết kiệm, chi phí mỗi tháng chỉ tương đương vài bình xăng xe máy, trong khi mang lại không gian máy lạnh che mưa che nắng an toàn tuyệt đối.",
                    requires_revealed_facts=[],
                )
            )
        elif is_taxi:
            objections.append(
                ObjectionContract(
                    objection_id=f"OBJ_COMPARE_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["xăng", "vios", "chi phí", "tiền điện", "thu nhập", "kinh tế"],
                    objection_text=f"Anh đang chạy {comp_car} quen rồi, đổi sang {vf_model} mỗi tháng có thực sự tiết kiệm được nhiều tiền nhiên liệu so với chạy xăng không em?",
                    resolve_condition="Tư vấn viên chứng minh bài toán tiết kiệm tiền nhiên liệu đáng kể mỗi tháng khi chạy dịch vụ",
                    ideal_sales_response=f"Với cự ly chạy dịch vụ hàng tháng, {vf_model} giúp anh tiết kiệm phần lớn chi phí năng lượng so với {comp_car}, giúp nâng cao trực tiếp thu nhập mang về cho gia đình.",
                    requires_revealed_facts=[],
                )
            )
        else:
            objections.append(
                ObjectionContract(
                    objection_id=f"OBJ_COMPARE_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["so sánh", comp_car.lower(), "đổ xăng", "bất tiện", "xe xăng"],
                    objection_text=f"Gia đình anh/chị thấy {comp_car} đổ xăng nhanh rất tiện, chuyển sang {vf_model} thì có ưu điểm gì thực sự vượt trội để thuyết phục anh/chị?",
                    resolve_condition=f"Tư vấn viên làm rõ sức mạnh động cơ, độ êm ái cách âm, chi phí bảo dưỡng rẻ hơn một nửa và công nghệ thông minh của {vf_model}",
                    ideal_sales_response=f"{vf_model} sở hữu sức mạnh động cơ và trang bị công nghệ an toàn ADAS vượt trội so với {comp_car}, kèm chi phí năng lượng và bảo dưỡng định kỳ tiết kiệm hơn một nửa.",
                    requires_revealed_facts=[],
                )
            )

        if is_apartment:
            objections.append(
                ObjectionContract(
                    objection_id=f"OBJ_APARTMENT_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["chung cư", "hầm", "không có sạc", "tìm trạm", "bất tiện"],
                    objection_text="Nhà chị ở chung cư dưới hầm ban quản lý không cho lắp trụ sạc, nếu mua xe thì hàng tuần sạc ở đâu và mất bao lâu em? Chị sợ nhất khoản đi tìm trạm sạc.",
                    resolve_condition="Tư vấn viên giải thích mạng lưới trạm sạc V-GREEN dày đặc tại các TTTM, trạm xăng lân cận và tốc độ sạc nhanh DC",
                    ideal_sales_response="Trạm sạc V-GREEN hiện có mặt tại hầu hết các trung tâm thương mại Vincom, bãi đỗ xe và trạm xăng lớn; chị chỉ cần tranh thủ cắm sạc nhanh trong thời gian ngắn đi siêu thị là đủ pin chạy cả tuần.",
                    requires_revealed_facts=[],
                )
            )
        elif is_taxi:
            objections.append(
                ObjectionContract(
                    objection_id=f"OBJ_CHARGING_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["chờ sạc", "giờ trưa", "mất cuốc", "trụ sạc", "xếp hàng"],
                    objection_text="Anh chạy khách liên tục cả ngày, lỡ trưa hết pin mà trụ sạc đông phải xếp hàng chờ thì mất hết cuốc khách hả em?",
                    resolve_condition="Tư vấn viên hướng dẫn dùng app VinFast kiểm tra trước trụ trống và giới thiệu trụ sạc nhanh DC nạp pin nhanh chóng",
                    ideal_sales_response="Ứng dụng VinFast hiển thị trạng thái trụ sạc theo thời gian thực giúp anh chủ động đặt chỗ trước; trụ sạc nhanh DC chỉ mất khoảng thời gian nghỉ trưa ngắn là xe đã sẵn sàng cho cả ca chiều.",
                    requires_revealed_facts=[],
                )
            )
        else:
            objections.append(
                ObjectionContract(
                    objection_id=f"OBJ_CHARGING_{vf_num}",
                    trigger_stage="objection_handling",
                    trigger_keywords=["đường dài", "về quê", "hết pin", "trạm sạc cao tốc", "lo pin"],
                    objection_text="Lúc đưa gia đình đi chơi xa hoặc về quê nhỡ hết pin dọc đường hoặc trạm sạc cao tốc đông xe thì xử lý thế nào em?",
                    resolve_condition="Tư vấn viên giới thiệu hệ thống trạm sạc V-GREEN phủ kín các tuyến cao tốc, quốc lộ và chính sách cứu hộ pin suốt ngày đêm",
                    ideal_sales_response="Mạng lưới trạm sạc V-GREEN hiện đã phủ kín tất cả các tuyến quốc lộ và cao tốc toàn quốc, kèm dịch vụ cứu hộ pin di động sẵn sàng trợ giúp đảm bảo hành trình luôn thông suốt.",
                    requires_revealed_facts=[],
                )
            )

        # 8. Disclosure rules & Context
        vis_context = f'Khách bước vào showroom: "Chào em, anh/chị đang tìm hiểu mẫu xe {vf_model} bên mình, muốn lái thử và so sánh thực tế với {comp_car}."'

        disclosure_rules = [
            DisclosureRule(
                fact_key="budget",
                trigger_intent="ask_budget",
                trigger_keywords=["ngân sách", "tài chính", "giá", "khoảng", "tiền", "trả trước", "vay"],
                revealed_statement=f"Tài chính anh/chị chuẩn bị tầm {budget}, muốn xem phương án thanh toán và gói ưu đãi lãi suất phù hợp.",
            ),
            DisclosureRule(
                fact_key="usage",
                trigger_intent="ask_usage",
                trigger_keywords=["nhu cầu", "đi lại", "mỗi ngày", "km", "cự ly", "quãng đường", "mục đích"],
                revealed_statement="Hàng ngày anh/chị di chuyển chủ yếu trong công việc và đưa đón người thân, thỉnh thoảng có đi ngoại thành.",
            ),
        ]

        title = f"Khách hàng {full_name} cân nhắc lựa chọn giữa {vf_model} và {comp_car}"

        return ScenarioContract(
            scenario_id=scenario_id,
            title=title,
            difficulty=diff,
            target_skills=["need_discovery", "product_knowledge", "objection_handling", "closing_next_step"],
            sales_channel="Showroom",
            training_objective=f"Khai thác nhu cầu sử dụng thực tế, giải tỏa băn khoăn so sánh với {comp_car} và chốt lịch lái thử {vf_model}.",
            scenario_version="1.0",
            persona={
                "name": full_name,
                "age": age,
                "current_car": f"Đang cân nhắc {comp_car}",
                "communication_style": style,
            },
            visible_context=vis_context,
            hidden_facts={
                "budget": f"Ngân sách dự trù tầm {budget}",
                "usage": "Hàng ngày di chuyển thường xuyên trong thành phố và có nhu cầu sạc tiện lợi",
                "real_concern": f"Băn khoăn về chi phí sử dụng và độ thuận tiện trạm sạc khi so sánh với {comp_car}",
            },
            buyer_intent=f"Muốn chọn chiếc xe điện hiện đại {vf_model} nhưng cần giải tỏa triệt để băn khoăn so với {comp_car}",
            customer_goals=f"Hiểu rõ chi phí sạc pin, bài toán tiết kiệm và trải nghiệm vận hành thực tế của {vf_model}",
            disclosure_rules=disclosure_rules,
            objections=objections,
            expected_discovery="Tư vấn viên hỏi rõ nhu cầu di chuyển thực tế và ngân sách dự kiến của khách hàng",
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
                    topic=f"Chính sách sạc pin và bảo hành xe điện VinFast {vf_model}",
                    lookup=PolicyLookup(
                        query="Chính sách ưu đãi sạc pin",
                        document_type="policy",
                        policy_type="charging",
                        product_model="ALL",
                    ),
                ),
            ],
        )
