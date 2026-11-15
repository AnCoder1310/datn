import { RefreshCw, Clock, ArrowRight } from 'lucide-react';
import { fmtDayMonth } from '../../utils/scoreFormat';
import './advisorProgress.css';

const STATUS = { assigned: 'Chưa bắt đầu', in_progress: 'Đang luyện', completed: 'Hoàn thành' };

function dueInfo(assignment) {
  if (!assignment.due_date) return { text: 'Không đặt hạn', warn: false };
  const due = new Date(`${assignment.due_date}T00:00:00`);
  const today = new Date();
  const days = Math.round((due - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const base = `Hạn ${fmtDayMonth(due)}`;
  if (assignment.status === 'completed') return { text: base, warn: false };
  if (days < 0) return { text: `${base} · Quá hạn ${-days} ngày`, warn: true };
  if (days === 0) return { text: `${base} · Hết hạn hôm nay`, warn: true };
  if (days <= 3) return { text: `${base} · Còn ${days} ngày`, warn: true };
  return { text: base, warn: false };
}

export function AdvisorAssignmentsView({ scenarios, assignments, status, error, onReload, onStart }) {
  const scenarioNames = Object.fromEntries(scenarios.map((item) => [item.scenario_id, item.title]));
  const open = assignments.filter((item) => item.status !== 'completed');

  return (
    <section className="ap-card ap-card-assignments" aria-labelledby="ap-assign-h">
      <div className="ap-card-head">
        <div className="ap-card-head-title">
          <h2 id="ap-assign-h">Bài được giao</h2>
          {open.length > 0 && <span className="ap-badge-counter">{open.length} bài cần làm</span>}
        </div>
        <button
          type="button"
          className="ap-refresh-btn"
          onClick={onReload}
          disabled={status === 'loading'}
          title="Làm mới danh sách bài được giao"
        >
          <RefreshCw size={13} className={status === 'loading' ? 'ap-spin' : ''} aria-hidden="true" />
          <span>Làm mới</span>
        </button>
      </div>

      {status === 'loading' && <p className="ap-state" role="status">Đang tải bài được giao…</p>}
      {status === 'error' && (
        <p className="ap-state ap-state--error" role="alert">
          {error || 'Không thể tải bài được giao.'}{' '}
          <button type="button" className="ap-link" onClick={onReload}>Thử lại</button>
        </p>
      )}
      {status === 'ready' && open.length === 0 && (
        <p className="ap-state">Hiện bạn chưa có bài nào được giao. Hãy chọn tình huống trong thư viện bên dưới để bắt đầu luyện tập.</p>
      )}
      {status === 'ready' && open.length > 0 && (
        <div className="ap-assignments-list">
          {open.map((assignment) => {
            const due = dueInfo(assignment);
            const title = scenarioNames[assignment.scenario_id] || assignment.title;
            const isUrgent = due.warn;
            return (
              <div className="ap-assignment-card" key={assignment.assignment_id}>
                <div className="ap-assignment-main">
                  <h3 className="ap-assignment-title">{assignment.title}</h3>
                  {title && title !== assignment.title && (
                    <p className="ap-assignment-desc">{title}</p>
                  )}
                  <div className="ap-assignment-badges">
                    <span className={`ap-status-tag ap-status-${assignment.status || 'assigned'}`}>
                      {STATUS[assignment.status] || assignment.status}
                    </span>
                    <span className={`ap-due-tag ${isUrgent ? 'is-urgent' : ''}`}>
                      <Clock size={11} strokeWidth={2.2} />
                      <span>{due.text}</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ap-assignment-action-btn"
                  onClick={() => onStart(assignment)}
                  disabled={!title}
                >
                  <span>{assignment.status === 'in_progress' ? 'Luyện tiếp' : 'Bắt đầu'}</span>
                  <ArrowRight size={13} strokeWidth={2.2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
