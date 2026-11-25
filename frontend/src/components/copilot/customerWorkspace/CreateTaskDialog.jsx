import './customerWorkspace.css';
import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { salesCopilotApi } from "../../../api/salesCopilotApi";
import { DetailDialog } from "./WorkspacePrimitives";
import { defaultTaskWindow, formatDateTime, localInput, toUTC } from "../agenda/agendaData";

export function CreateTaskDialog({ customer, customers = [], onClose, onCreate }) {
  return (
    <DetailDialog title="Tạo công việc / lịch hẹn" onClose={onClose}>
      <TaskEditor customer={customer} customers={customers} onSave={onCreate} onCancel={onClose} />
    </DetailDialog>
  );
}

export function TaskEditor({ task, customer, customers = [], onSave, onCancel }) {
  const initialKind = task?.item_type || "task";
  const defaultWindow = defaultTaskWindow(initialKind);
  const [title, setTitle] = useState(task?.title || "");
  const [priority, setPriority] = useState(task?.priority === "urgent" ? "high" : task?.priority || "medium");
  const [start, setStart] = useState(() => localInput(task?.starts_at) || defaultWindow.start);
  const [end, setEnd] = useState(() => localInput(task?.ends_at) || defaultWindow.end);
  const [kind, setKind] = useState(initialKind);
  const [location, setLocation] = useState(task?.location || "");
  const [description, setDescription] = useState(task?.description || "");
  const [customerId, setCustomerId] = useState(task?.customer_id || customer?.customerId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overlaps, setOverlaps] = useState([]);
  const [conflictError, setConflictError] = useState("");
  const [confirmOverlap, setConfirmOverlap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!start || !end || end <= start) {
        setOverlaps([]);
        setConflictError("");
        return;
      }
      salesCopilotApi
        .getTaskOverlaps({
          starts_at: toUTC(start),
          ends_at: toUTC(end),
          ...(task?.id ? { exclude_id: task.id } : {}),
        })
        .then((items) => {
          if (!cancelled) {
            setOverlaps(items);
            setConflictError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOverlaps([]);
            setConflictError("Chưa kiểm tra được lịch trùng. Bạn vẫn có thể lưu.");
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [start, end, task?.id, kind]);

  async function doSave(forceOverlap = false) {
    if (busy || !title.trim()) return;
    if (!start || !end || end <= start) {
      setError("Cần chọn giờ bắt đầu và kết thúc hợp lệ để hiển thị trên thời khóa biểu.");
      return;
    }
    if (kind === "appointment" && !location.trim()) {
      setError("Lịch hẹn cần địa điểm cụ thể.");
      return;
    }
    if (overlaps.length > 0 && !forceOverlap && !confirmOverlap) {
      setConfirmOverlap(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        priority,
        location: location.trim(),
        description: description.trim(),
        item_type: kind,
        starts_at: toUTC(start),
        ends_at: toUTC(end),
        ...(!task ? { customer_id: customerId || null } : {}),
        ...(task?.status === "needs_review" ? { status: "pending" } : {}),
      });
    } catch (failure) {
      setError(typeof failure.message === "string" ? failure.message : "Chưa lưu được công việc.");
      setBusy(false);
    }
  }

  return (
    <form className="sw-task-form-modern" onSubmit={(event) => { event.preventDefault(); void doSave(false); }}>
      <div className="sw-form-grid">
        <div className="sw-form-row-2">
          <div className="sw-form-group">
            <label htmlFor="task-kind-select" className="sw-form-label">
              Loại mục
            </label>
            <select
              id="task-kind-select"
              className="sw-form-select"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setConfirmOverlap(false);
              }}
            >
              <option value="task">Công việc bán hàng</option>
              <option value="appointment">Lịch hẹn gặp khách / Lái thử</option>
            </select>
          </div>

          <div className="sw-form-group">
            <label htmlFor="task-priority-select" className="sw-form-label">
              Mức ưu tiên
            </label>
            <select
              id="task-priority-select"
              className="sw-form-select"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="low">Tiêu chuẩn (Thấp)</option>
              <option value="medium">Trung bình</option>
              <option value="high">Ưu tiên cao</option>
            </select>
          </div>
        </div>

        <div className="sw-form-group">
          <label htmlFor="task-title-input" className="sw-form-label">
            Tiêu đề <span className="sw-required">*</span>
          </label>
          <input
            id="task-title-input"
            className="sw-form-input"
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ví dụ: Gọi tư vấn lái thử VF 7, hỗ trợ hồ sơ ngân hàng..."
          />
        </div>

        <div className="sw-form-group">
          <label htmlFor="task-customer-select" className="sw-form-label">
            Khách hàng liên quan
          </label>
          {task ? (
            <div className="sw-form-static-pill">
              {customer?.name || task.customer_name || "Cá nhân · Không gắn khách hàng"}
            </div>
          ) : (
            <select
              id="task-customer-select"
              className="sw-form-select"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">Cá nhân · Không gắn khách hàng</option>
              {(customer ? [{ customer_id: customer.customerId, customer_name: customer.name }] : customers).map((item) => (
                <option key={item.customer_id} value={item.customer_id}>
                  {item.customer_name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="sw-form-row-2">
          <div className="sw-form-group">
            <label htmlFor="task-start-time" className="sw-form-label">
              Thời gian bắt đầu <span className="sw-required">*</span>
            </label>
            <input
              id="task-start-time"
              type="datetime-local"
              className="sw-form-input"
              required
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setConfirmOverlap(false);
              }}
            />
          </div>

          <div className="sw-form-group">
            <label htmlFor="task-end-time" className="sw-form-label">
              Thời gian kết thúc <span className="sw-required">*</span>
            </label>
            <input
              id="task-end-time"
              type="datetime-local"
              className="sw-form-input"
              required
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                setConfirmOverlap(false);
              }}
            />
          </div>
        </div>

        <div className="sw-form-group">
          <label htmlFor="task-location-input" className="sw-form-label">
            Địa điểm {kind === "appointment" ? <span className="sw-required">*</span> : <span className="sw-optional">(tùy chọn)</span>}
          </label>
          <input
            id="task-location-input"
            className="sw-form-input"
            required={kind === "appointment"}
            maxLength={1000}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={kind === "appointment" ? "Showroom VinFast Times City, nhà khách..." : "Địa chỉ hoặc ghi chú vị trí (nếu có)..."}
          />
        </div>

        <div className="sw-form-group">
          <label htmlFor="task-desc-textarea" className="sw-form-label">
            Ghi chú chi tiết
          </label>
          <textarea
            id="task-desc-textarea"
            className="sw-form-textarea"
            rows={3}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Nội dung cần chuẩn bị, tài liệu xe hoặc yêu cầu của khách hàng..."
          />
        </div>

        <div className="sw-form-hint">
          <Clock size={13} />
          <span>Giờ Việt Nam (UTC+7) · Tự động đồng bộ lên Bảng điều khiển và Lịch sự kiện</span>
        </div>
      </div>

      {overlaps.length > 0 && !confirmOverlap && (
        <div className="sw-info-note" role="status">
          <strong>Lưu ý:</strong> Đang trùng giờ với {overlaps.length} mục trên lịch: {overlaps.slice(0, 3).map((item) => `${item.title} (${formatDateTime(item.starts_at)} – ${formatDateTime(item.ends_at, false)})`).join("; ")}.
        </div>
      )}

      {confirmOverlap && overlaps.length > 0 && (
        <div className="sw-overlap-confirm-box" role="alert">
          <div className="sw-overlap-head">
            <AlertTriangle size={16} />
            <strong>Khung giờ này đã có lịch trên Thời khóa biểu!</strong>
          </div>
          <ul>
            {overlaps.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong> ({formatDateTime(item.starts_at)} – {formatDateTime(item.ends_at, false)})
              </li>
            ))}
          </ul>
          <p>Bạn vẫn muốn thêm công việc này vào cùng khung giờ chứ?</p>
          <div className="sw-dialog-footer-actions">
            <button
              type="button"
              className="sw-btn-modal-cancel"
              disabled={busy}
              onClick={() => setConfirmOverlap(false)}
            >
              Đổi giờ khác
            </button>
            <button
              type="button"
              className="sw-btn-modal-save"
              disabled={busy}
              onClick={() => void doSave(true)}
            >
              {busy ? "Đang lưu…" : "Vẫn thêm vào lịch"}
            </button>
          </div>
        </div>
      )}

      {conflictError && <p className="sw-info-note" role="status">{conflictError}</p>}
      {error && <p className="sw-stage-error" role="alert">{error}</p>}

      {!confirmOverlap && (
        <div className="sw-dialog-footer-actions">
          <button type="button" className="sw-btn-modal-cancel" disabled={busy} onClick={onCancel}>
            Hủy bỏ
          </button>
          <button
            type="submit"
            className="sw-btn-modal-save"
            disabled={busy || !title.trim() || !start || !end || end <= start}
          >
            {busy ? "Đang lưu…" : task?.status === "needs_review" ? "Duyệt và xếp lịch" : "Lưu công việc"}
          </button>
        </div>
      )}
    </form>
  );
}
