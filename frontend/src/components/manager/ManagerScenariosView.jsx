import { useState, useEffect } from "react";
import { managerApi } from "../../api/managerApi";
import { SparkleIcon, CheckCircleIcon, CarIcon } from "../common/Icons";

const QUICK_PROMPTS = [
  "Khách hàng nữ trẻ 27 tuổi muốn mua VF 3 chạy phố thay xe máy điện, lo sợ sạc pin chung cư",
  "Khách hàng nam tên An, có gia đình và 2 con nhỏ, phân vân giữa VinFast VF 6 và Mazda CX-5",
  "Bác tài chạy taxi công nghệ phân vân đổi từ Toyota Vios sang VF 5 Plus để tiết kiệm chi phí sạc"
];

export function ManagerScenariosView() {
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [autoSave, setAutoSave] = useState(false);
  const [status, setStatus] = useState("idle"); // idle, generating, saving, saved, error
  const [generatedScenario, setGeneratedScenario] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [customScenarios, setCustomScenarios] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  const loadCustomScenarios = async () => {
    try {
      const list = await managerApi.getScenarios();
      const customs = (list || []).filter(
        (s) => s.scenario_id.startsWith("SCENARIO_CUSTOM_") || s.scenario_id.startsWith("VF6_") || s.scenario_id.includes("CUSTOM")
      );
      setCustomScenarios(customs);
    } catch (err) {
      console.error("Failed to load custom scenarios:", err);
    }
  };

  useEffect(() => {
    loadCustomScenarios();
  }, []);

  const handleGenerate = async (e) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    setStatus("generating");
    setFeedbackMsg("");
    setIsEditing(false);
    try {
      const scenario = await managerApi.generateScenario(prompt.trim(), difficulty);
      setGeneratedScenario(scenario);
      if (autoSave) {
        setStatus("saving");
        await managerApi.createScenario(scenario);
        setStatus("saved");
        setFeedbackMsg(`Kịch bản "${scenario.title}" đã được lưu và kích hoạt thành công vào phòng luyện tập của tư vấn viên!`);
        await loadCustomScenarios();
      } else {
        setStatus("generated");
      }
    } catch (err) {
      setFeedbackMsg(err.message || "Không thể tạo kịch bản. Vui lòng thử lại.");
      setStatus("error");
    }
  };

  const handleManualSave = async () => {
    if (!generatedScenario) return;
    setStatus("saving");
    try {
      await managerApi.createScenario(generatedScenario);
      setStatus("saved");
      setFeedbackMsg(`Kịch bản "${generatedScenario.title}" đã được lưu và kích hoạt thành công vào phòng luyện tập!`);
      await loadCustomScenarios();
    } catch (err) {
      setFeedbackMsg(err.message || "Lỗi khi lưu kịch bản.");
      setStatus("error");
    }
  };

  const handleDelete = async (scenarioId, title) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa kịch bản "${title}" khỏi hệ thống?`)) return;
    try {
      await managerApi.deleteScenario(scenarioId);
      if (generatedScenario?.scenario_id === scenarioId) {
        setGeneratedScenario(null);
        setStatus("idle");
      }
      setFeedbackMsg(`Đã xóa kịch bản "${title}" thành công!`);
      await loadCustomScenarios();
    } catch (err) {
      alert(err.message || "Lỗi khi xóa kịch bản.");
    }
  };

  const updatePersona = (field, value) => {
    if (!generatedScenario) return;
    setGeneratedScenario({
      ...generatedScenario,
      persona: {
        ...generatedScenario.persona,
        [field]: value
      }
    });
  };

  return (
    <section className="md-panel" aria-labelledby="scenario-gen-title">
      <div className="md-panel-head">
        <div>
          <h2 id="scenario-gen-title" className="md-panel-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <SparkleIcon style={{ width: 22, height: 22, color: "#111111" }} />
            AI Sinh Kịch Bản Luyện Tập (Prompt-to-Scenario)
          </h2>
          <p style={{ color: "#666", fontSize: "13px", margin: "4px 0 0 0" }}>
            Nhập yêu cầu đào tạo thực tế, hệ thống AI sẽ tự động sinh Persona, rào cản và ánh xạ chính sách VinFast.
          </p>
        </div>
      </div>

      <div style={{ padding: "20px", background: "#fafbfc", borderRadius: "8px", border: "1px solid #E5E5E5", marginTop: "16px" }}>
        <form onSubmit={handleGenerate}>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: "13px", marginBottom: "6px" }}>
              Mô tả tình huống đào tạo mong muốn:
            </label>
            <textarea
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical"
              }}
              placeholder="VD: Khách hàng nam tên An, đã có gia đình và 2 con nhỏ, đang phân vân giữa VinFast VF 6 và Mazda CX-5..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={status === "generating" || status === "saving"}
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
            <span style={{ fontSize: "12px", color: "#666", alignSelf: "center" }}>Gợi ý nhanh:</span>
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                className="md-btn md-btn--outline"
                style={{ fontSize: "12px", padding: "4px 10px", height: "auto", background: "#fff" }}
                onClick={() => setPrompt(qp)}
              >
                {qp.slice(0, 42)}...
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: 500 }}>Độ khó:</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
              >
                <option value="Easy">Cơ bản (Easy)</option>
                <option value="Medium">Tiêu chuẩn (Medium)</option>
                <option value="Hard">Nâng cao (Hard)</option>
              </select>
            </div>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              Tự động lưu và kích hoạt ngay sau khi tạo
            </label>

            <button
              type="submit"
              className="md-btn md-btn--primary"
              disabled={status === "generating" || status === "saving" || !prompt.trim()}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}
            >
              <SparkleIcon style={{ width: 16, height: 16 }} />
              {status === "generating" ? "AI đang khởi tạo kịch bản..." : status === "saving" ? "Đang lưu vào hệ thống..." : "Tạo Kịch Bản Với AI"}
            </button>
          </div>
        </form>

        {status === "error" && (
          <div style={{ marginTop: "16px", padding: "12px", background: "#F8F8F8", color: "#111111", border: "1px solid #CCCCCC", borderRadius: "6px", fontSize: "13px" }}>
            {feedbackMsg}
          </div>
        )}

        {status === "saved" && (
          <div style={{ marginTop: "16px", padding: "14px", background: "#FAFAFA", color: "#111111", borderRadius: "8px", fontSize: "13px", border: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircleIcon style={{ width: 20, height: 20, color: "#111111", flexShrink: 0 }} />
            <div>
              <strong>Kích hoạt thành công!</strong> {feedbackMsg}
              <div style={{ fontSize: "12px", color: "#555555", marginTop: "2px" }}>
                👉 Tư vấn viên chỉ cần đăng nhập và mở tab <strong>"Phòng luyện tập"</strong> là sẽ thấy kịch bản có huy hiệu <strong>"✨ Kịch bản mới từ Quản lý"</strong> ngay trên danh sách.
              </div>
            </div>
          </div>
        )}
      </div>

      {generatedScenario && (
        <div style={{ marginTop: "24px", padding: "20px", background: "#fff", borderRadius: "8px", border: "1px solid #CCCCCC", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #eee", paddingBottom: "14px", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: "260px" }}>
              <span style={{ display: "inline-block", padding: "2px 8px", background: "#F5F5F5", color: "#111111", border: "1px solid #E5E5E5", borderRadius: "12px", fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
                Mã: {generatedScenario.scenario_id} • Độ khó: {generatedScenario.difficulty}
              </span>
              {isEditing ? (
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#555" }}>Tiêu đề kịch bản:</label>
                  <input
                    type="text"
                    value={generatedScenario.title}
                    onChange={(e) => setGeneratedScenario({ ...generatedScenario, title: e.target.value })}
                    style={{ width: "100%", padding: "6px 10px", fontSize: "16px", fontWeight: 600, borderRadius: "4px", border: "1px solid #111111", marginTop: "4px" }}
                  />
                </div>
              ) : (
                <h3 style={{ margin: 0, fontSize: "18px", color: "#1a1f36" }}>{generatedScenario.title}</h3>
              )}
            </div>
            
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className="md-btn md-btn--outline"
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  padding: "8px 14px",
                  background: isEditing ? "#F5F5F5" : "#FFFFFF",
                  borderColor: isEditing ? "#007aff" : "#ccc",
                  color: isEditing ? "#111111" : "inherit"
                }}
              >
                {isEditing ? "✓ Xong chỉnh sửa" : "✏️ Chỉnh sửa bản nháp"}
              </button>

              <button
                type="button"
                className="md-btn md-btn--primary"
                onClick={handleManualSave}
                disabled={status === "saving"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#111111",
                  fontWeight: 600,
                  fontSize: "13px",
                  padding: "8px 16px"
                }}
              >
                <CheckCircleIcon style={{ width: 16, height: 16 }} />
                {status === "saving" ? "Đang lưu..." : status === "saved" ? "✓ Đã Lưu & Kích Hoạt (Bấm để lưu lại)" : "💾 Lưu & Kích Hoạt Kịch Bản"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", fontSize: "13px" }}>
            <div style={{ padding: "14px", background: "#f8f9fa", borderRadius: "6px", border: isEditing ? "1px dashed #111111" : "1px solid #E5E5E5" }}>
              <h4 style={{ margin: "0 0 10px 0", color: "#333", display: "flex", alignItems: "center", gap: "6px" }}>
                <CarIcon style={{ width: 16, height: 16 }} /> Thông tin khách hàng (Persona)
              </h4>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#666" }}>Họ tên khách:</label>
                    <input
                      type="text"
                      value={generatedScenario.persona.name}
                      onChange={(e) => updatePersona("name", e.target.value)}
                      style={{ width: "100%", padding: "4px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "#666" }}>Tuổi:</label>
                      <input
                        type="number"
                        value={generatedScenario.persona.age}
                        onChange={(e) => updatePersona("age", Number(e.target.value))}
                        style={{ width: "100%", padding: "4px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "#666" }}>Xe cân nhắc/xe cũ:</label>
                      <input
                        type="text"
                        value={generatedScenario.persona.current_car}
                        onChange={(e) => updatePersona("current_car", e.target.value)}
                        style={{ width: "100%", padding: "4px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#666" }}>Phong cách giao tiếp:</label>
                    <input
                      type="text"
                      value={generatedScenario.persona.communication_style}
                      onChange={(e) => updatePersona("communication_style", e.target.value)}
                      style={{ width: "100%", padding: "4px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p><strong>Họ tên:</strong> {generatedScenario.persona.name} ({generatedScenario.persona.age} tuổi)</p>
                  <p><strong>Xe hiện tại:</strong> {generatedScenario.persona.current_car}</p>
                  <p><strong>Phong cách:</strong> {generatedScenario.persona.communication_style}</p>
                </>
              )}
            </div>

            <div style={{ padding: "14px", background: "#f8f9fa", borderRadius: "6px", border: isEditing ? "1px dashed #111111" : "1px solid #E5E5E5" }}>
              <h4 style={{ margin: "0 0 10px 0", color: "#333" }}>Bối cảnh & Lời mở đầu</h4>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#666" }}>Lời mở đầu của khách:</label>
                    <textarea
                      rows={2}
                      value={generatedScenario.visible_context}
                      onChange={(e) => setGeneratedScenario({ ...generatedScenario, visible_context: e.target.value })}
                      style={{ width: "100%", padding: "6px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#666" }}>Mục tiêu tư vấn:</label>
                    <input
                      type="text"
                      value={generatedScenario.training_objective}
                      onChange={(e) => setGeneratedScenario({ ...generatedScenario, training_objective: e.target.value })}
                      style={{ width: "100%", padding: "4px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontStyle: "italic", color: "#555" }}>"{generatedScenario.visible_context}"</p>
                  <p><strong>Mục tiêu tư vấn:</strong> {generatedScenario.training_objective}</p>
                </>
              )}
            </div>
          </div>

          <div style={{ marginTop: "16px", padding: "12px", background: "#f8f9fa", borderRadius: "6px", fontSize: "13px" }}>
            <h4 style={{ margin: "0 0 8px 0", color: "#333" }}>Rào cản khách hàng (Objections)</h4>
            {generatedScenario.objections.map((obj, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <p style={{ margin: "0 0 4px 0" }}><strong>Khách nói:</strong> "{obj.objection_text}"</p>
                <p style={{ margin: 0, color: "#111111" }}><strong>Hướng phản hồi chuẩn:</strong> {obj.ideal_sales_response}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danh sách các kịch bản tùy chỉnh do Quản lý đã kích hoạt */}
      <div style={{ marginTop: "36px", paddingTop: "24px", borderTop: "1px solid #E5E5E5" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "16px", margin: 0, display: "flex", alignItems: "center", gap: "8px", color: "#1a1f36" }}>
              <CarIcon style={{ width: 18, height: 18, color: "#111111" }} />
              Danh Sách Kịch Bản Do Quản Lý Đã Kích Hoạt ({customScenarios.length})
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#666" }}>
              Các kịch bản này đã được đưa vào Thư viện tình huống cho tư vấn viên luyện tập. Bạn có thể xóa nếu trùng lặp.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCustomScenarios}
            className="md-btn md-btn--outline"
            style={{ fontSize: "12px", padding: "6px 12px", background: "#fff" }}
          >
            🔄 Làm mới danh sách
          </button>
        </div>

        {customScenarios.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", background: "#fafbfc", borderRadius: "6px", border: "1px dashed #CCCCCC", color: "#666", fontSize: "13px" }}>
            Chưa có kịch bản tùy chỉnh nào do Quản lý tạo. Hãy dùng form phía trên để khởi tạo kịch bản mới!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {customScenarios.map((sc) => {
              const modelMatch = sc.title.match(/VF\s*[3-9]/i)?.[0] || "VinFast";
              return (
                <div
                  key={sc.scenario_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "#fff",
                    borderRadius: "6px",
                    border: "1px solid #E5E5E5",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexWrap: "wrap",
                    gap: "10px"
                  }}
                >
                  <div style={{ maxWidth: "78%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ background: "#F5F5F5", color: "#111111", border: "1px solid #E5E5E5", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px" }}>
                        {modelMatch}
                      </span>
                      <strong style={{ fontSize: "14px", color: "#1a1f36" }}>{sc.title}</strong>
                      <span style={{ fontSize: "11px", color: "#666", background: "#f1f3f5", padding: "1px 6px", borderRadius: "3px" }}>
                        Độ khó: {sc.difficulty}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#555" }}>
                      Mã: <code>{sc.scenario_id}</code> • <em>"{sc.visible_context ? sc.visible_context.slice(0, 95) : ""}{sc.visible_context?.length > 95 ? "..." : ""}"</em>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(sc.scenario_id, sc.title)}
                    className="md-btn md-btn--outline"
                    style={{ color: "#111111", borderColor: "#CCCCCC", fontSize: "12px", padding: "6px 12px", background: "#FFFFFF" }}
                    title="Xóa kịch bản này khỏi phòng luyện tập"
                  >
                    🗑️ Xóa kịch bản
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
