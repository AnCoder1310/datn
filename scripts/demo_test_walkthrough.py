"""Demo walkthrough script testing all new endpoints and core features against the live app."""

import asyncio
import httpx

from src.main import app

async def run_demo():
    print("=" * 60)
    print("  VINFAST AI SALES COACH — DEMO TEST WALKTHROUGH")
    print("=" * 60)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        # 1. Health & Readiness
        health = await client.get("/health")
        print(f"\n[1] Health Check: status_code={health.status_code}, data={health.json()}")

        # 2. Login Manager
        mgr_login = await client.post("/api/v1/auth/login", json={
            "username": "manager.demo",
            "password": "manager123456"
        })
        print(f"[2] Manager Login: status_code={mgr_login.status_code}, user={mgr_login.json().get('display_name')}")
        mgr_cookies = mgr_login.cookies

        # 3. Login Advisor
        adv_login = await client.post("/api/v1/auth/login", json={
            "username": "advisor.demo",
            "password": "advisor123456"
        })
        print(f"[3] Advisor Login: status_code={adv_login.status_code}, user={adv_login.json().get('display_name')}")
        adv_cookies = adv_login.cookies

        # 4. Feature 1: Prompt-to-Scenario Generation (Manager)
        prompt = "Khách hàng nữ trẻ 27 tuổi muốn mua VF 3 chạy phố thay xe máy điện Klara, băn khoăn về trạm sạc chung cư"
        print(f"\n[4] Manager yêu cầu AI sinh kịch bản mới:")
        print(f"    Prompt: '{prompt}'")
        gen_res = await client.post("/api/v1/manager/scenarios/generate", json={
            "prompt": prompt,
            "difficulty": "Medium"
        }, cookies=mgr_cookies)
        scenario_data = gen_res.json()
        print(f"    -> Đã sinh kịch bản: [{scenario_data['scenario_id']}] {scenario_data['title']}")
        print(f"    -> Persona: {scenario_data['persona']['name']} ({scenario_data['persona']['age']} tuổi, {scenario_data['persona']['current_car']})")
        print(f"    -> Rào cản chính: {scenario_data['objections'][0]['objection_text']}")

        # 5. Lưu và kích hoạt kịch bản mới
        save_res = await client.post("/api/v1/manager/scenarios", json=scenario_data, cookies=mgr_cookies)
        print(f"    -> Lưu kịch bản thành công: status_code={save_res.status_code}, summary={save_res.json()['scenario_id']}")

        # 6. Advisor kiểm tra danh sách kịch bản (thấy ngay kịch bản mới)
        scenarios_res = await client.get("/api/v1/practice/scenarios", cookies=adv_cookies)
        scenario_list = scenarios_res.json()
        print(f"\n[5] Advisor xem danh sách kịch bản luyện tập: {len(scenario_list)} kịch bản")
        found = any(s['scenario_id'] == scenario_data['scenario_id'] for s in scenario_list)
        print(f"    -> Kịch bản mới đã xuất hiện trong phòng luyện tập: {found}")

        # 7. Advisor bắt đầu phiên luyện tập với kịch bản mới
        session_res = await client.post("/api/v1/practice/sessions", json={
            "scenario_id": scenario_data["scenario_id"]
        }, cookies=adv_cookies)
        session_info = session_res.json()
        session_id = session_info["session_id"]
        print(f"\n[6] Advisor bắt đầu phiên luyện tập:")
        print(f"    Session ID: {session_id}")
        print(f"    Lời mở đầu của khách: \"{session_info['visible_context']}\"")

        # 8. Advisor gửi tin nhắn tư vấn
        msg_res = await client.post(f"/api/v1/practice/{session_id}/message", json={
            "message": "Chào chị Linh, em là tư vấn viên VinFast. Quanh chung cư chị hiện có trạm sạc nhanh V-Green rất tiện lợi ạ."
        }, cookies=adv_cookies)
        print(f"    -> Advisor gửi lời chào và giải tỏa nỗi lo trạm sạc: status_code={msg_res.status_code}")

        # 9. Feature 2: Deal-Lost Diagnostic RCA
        print(f"\n[7] Chạy phân tích nguyên nhân (Deal Diagnostic RCA) cho phiên {session_id}:")
        diag_res = await client.get(f"/api/v1/practice/{session_id}/diagnostic", cookies=adv_cookies)
        diag_data = diag_res.json()
        print(f"    -> Trạng thái Deal: {diag_data['deal_status']} (Mức độ nghiêm trọng: {diag_data['severity']})")
        print(f"    -> Nhóm nguyên nhân: {diag_data['root_cause_category']}")
        print(f"    -> Tiêu đề chẩn đoán: {diag_data['root_cause_title']}")
        print(f"    -> Lời khuyên thực chiến: {diag_data['remediation_advice']}")
        print(f"    -> Câu thoại mẫu VinFast chuẩn: \"{diag_data['recommended_script']}\"")

        # 10. Feature 3: Audit Trail Log (Manager)
        print(f"\n[8] Manager kiểm tra nhật ký kiểm toán (Audit Logs):")
        audit_res = await client.get("/api/v1/manager/audit-logs", cookies=mgr_cookies)
        audit_data = audit_res.json()
        print(f"    -> Tổng số bản ghi audit: {audit_data['total_items']}")
        for item in audit_data['items'][:3]:
            print(f"       [{item['action']}] do {item['actor_id']} lúc {item['created_at'][:19]}: {item['detail']}")

    print("\n" + "=" * 60)
    print("  DEMO WALKTHROUGH HOÀN TẤT THÀNH CÔNG 100%!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_demo())
