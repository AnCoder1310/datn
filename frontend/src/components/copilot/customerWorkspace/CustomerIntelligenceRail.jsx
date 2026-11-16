import { useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Bookmark,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Compass,
  CreditCard,
  FileText,
  HelpCircle,
  Info,
  MapPin,
  MessageSquare,
  Milestone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { displayDateTime, formatMoney, taskCounts } from './workspaceData';
import { CustomerKnowledgeTool } from './CustomerKnowledgeTool';
import { CustomerHistory } from './CustomerHistory';

function FactEditorModal({ field, label, initialValue, onSave, onCancel }) {
  const [value, setValue] = useState(
    Array.isArray(initialValue) ? initialValue.join(', ') : initialValue ?? ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isNumeric = ['budget_vnd', 'down_payment_vnd', 'max_monthly_payment_vnd'].includes(field);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const parsed = field === 'interested_models' || field === 'competitor_models'
      ? value.split(',').map((p) => p.trim()).filter(Boolean)
      : isNumeric
      ? (value === '' ? null : Number(value))
      : value.trim();
    try {
      await onSave(field, parsed);
      onCancel();
    } catch (err) {
      setError(err.message || 'Không thể lưu dữ kiện.');
      setBusy(false);
    }
  }

  return (
    <div className="sw-modal-inline-backdrop" onClick={onCancel}>
      <form
        className="sw-fact-editor-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h4>Sửa &amp; Xác nhận: {label}</h4>
        <input
          autoFocus
          type={isNumeric ? 'number' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Nhập ${label.toLowerCase()}...`}
          disabled={busy}
        />
        {error && <p className="sw-fact-error">{error}</p>}
        <div className="sw-fact-editor-actions">
          <button type="button" className="sw-btn-secondary" onClick={onCancel} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="sw-btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Xác nhận'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CustomerIntelligenceRail({
  customer,
  onSourceClick,
  onConfirmFact,
  onToggleTask,
  onCreateTask,
  onEditTask,
  taskBusy,
  onAnalyze,
  analyzing,
  knowledge,
  onSearch,
  onLoadHistory,
  onQueryChange,
  onOpenDocument,
}) {
  const [activeTab, setActiveTab] = useState('intelligence'); // 'intelligence' | 'copilot' | 'history_chat'
  const [editingFact, setEditingFact] = useState(null);

  // Collapsible sections state
  const [sectionsOpen, setSectionsOpen] = useState({
    overview: true,
    actions: true,
    concerns: true,
    timeline: true,
  });

  function toggleSection(sec) {
    setSectionsOpen((prev) => ({ ...prev, [sec]: !prev[sec] }));
  }

  const profile = customer.profile || {};
  const pendingTasks = (customer.tasks || []).filter(
    (t) => !t.completed && !['completed', 'cancelled'].includes(t.status)
  );
  const overdueTasks = pendingTasks.filter((t) => {
    if (!t.ends_at) return false;
    const end = new Date(t.ends_at).getTime();
    return Number.isFinite(end) && end <= Date.now();
  });

  const concernsList = customer.concerns || [];
  const eventsList = customer.events || [];

  return (
    <aside className="sw-intelligence-rail" aria-label="Bảng điều hành và dữ liệu khách hàng 360">
      {/* 1. TOP RAIL TAB SWITCHER */}
      <div className="sw-rail-topbar">
        <div className="sw-rail-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'intelligence'}
            className={`sw-rail-tab ${activeTab === 'intelligence' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('intelligence')}
          >
            <Compass size={13} />
            <span>Thông tin 360°</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'copilot'}
            className={`sw-rail-tab ${activeTab === 'copilot' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('copilot');
              onLoadHistory?.().catch?.(() => {});
            }}
          >
            <Sparkles size={13} />
            <span>Tra cứu Copilot</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history_chat'}
            className={`sw-rail-tab ${activeTab === 'history_chat' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('history_chat')}
          >
            <MessageSquare size={13} />
            <span>Hỏi đáp AI</span>
          </button>
        </div>
      </div>

      {/* 2. TAB CONTENT */}
      {activeTab === 'copilot' && (
        <div className="sw-rail-subview">
          <CustomerKnowledgeTool
            onOpenDocument={onOpenDocument}
            lookup={knowledge}
            onSearch={onSearch}
            onLoadHistory={onLoadHistory}
            onQueryChange={onQueryChange}
          />
        </div>
      )}

      {activeTab === 'history_chat' && (
        <div className="sw-rail-subview">
          <CustomerHistory customer={customer} onSourceClick={onSourceClick} />
        </div>
      )}

      {activeTab === 'intelligence' && (
        <div className="sw-rail-scroll-body">
          {/* AI ANALYSIS META STRIP */}
          <div className="sw-analysis-strip">
            <div className="sw-analysis-strip-left">
              <span className="sw-analysis-dot" />
              <small>
                {customer.updatedAt
                  ? `Đã phân tích ${displayDateTime(customer.updatedAt)}`
                  : 'Chưa chạy phân tích AI'}
              </small>
            </div>
            <button
              type="button"
              className="sw-btn-run-analysis"
              disabled={analyzing || !customer.loaded}
              onClick={onAnalyze}
              title="Chạy AI bóc tách thông tin mới nhất từ hội thoại"
            >
              <RefreshCw size={11} className={analyzing ? 'sw-spin' : ''} />
              <span>{analyzing ? 'Đang phân tích…' : 'Phân tích lại'}</span>
              {!analyzing && customer.pendingAnalysis > 0 && (
                <span className="sw-pending-msg-badge">+{customer.pendingAnalysis} tin</span>
              )}
            </button>
          </div>

          {/* =================================================================
              SECTION A: CUSTOMER PROFILE (CUSTOMER OVERVIEW)
              ================================================================= */}
          <section className="sw-rail-section">
            <header className="sw-rail-section-header" onClick={() => toggleSection('overview')}>
              <div className="sw-rail-section-title">
                <Users size={14} className="sw-rail-icon" />
                <h3>Chân dung khách hàng (EV)</h3>
              </div>
              <ChevronDown
                size={14}
                className={`sw-rail-chevron ${sectionsOpen.overview ? 'is-open' : ''}`}
              />
            </header>

            {sectionsOpen.overview && (
              <div className="sw-rail-section-body">
                <div className="sw-overview-grid">
                  {/* CELL 1: XE QUAN TÂM */}
                  <div className="sw-overview-cell">
                    <span className="sw-cell-label">Dòng xe quan tâm</span>
                    <strong className="sw-cell-val is-accent">{customer.model || 'Chưa xác định'}</strong>
                  </div>

                  {/* CELL 2: NGÂN SÁCH */}
                  <div className="sw-overview-cell">
                    <span className="sw-cell-label">Ngân sách dự kiến</span>
                    <strong className="sw-cell-val">{customer.budget || 'Chưa xác định'}</strong>
                  </div>

                  {/* CELL 3: THANH TOÁN */}
                  <div className="sw-overview-cell">
                    <span className="sw-cell-label">Hình thức thanh toán</span>
                    <strong className="sw-cell-val">
                      {customer.payment}
                      {customer.deposit && customer.deposit !== 'Chưa xác định' ? ` (Trả trước ${customer.deposit})` : ''}
                    </strong>
                  </div>

                  {/* CELL 4: ĐIỀU KIỆN SẠC */}
                  <div className="sw-overview-cell">
                    <span className="sw-cell-label">Điều kiện sạc (EV)</span>
                    <strong className="sw-cell-val is-ev">
                      <BatteryCharging size={12} />
                      {customer.chargingCondition}
                    </strong>
                  </div>

                  {/* CELL 5: NHU CẦU DI CHUYỂN */}
                  <div className="sw-overview-cell">
                    <span className="sw-cell-label">Nhu cầu sử dụng</span>
                    <strong className="sw-cell-val">{customer.usage}</strong>
                  </div>

                  {/* CELL 6: THỜI ĐIỂM MUA */}
                  <div className="sw-overview-cell">
                    <span className="sw-cell-label">Thời điểm nhận xe</span>
                    <strong className="sw-cell-val">{customer.purchaseTimeline}</strong>
                  </div>

                  {/* CELL 7: XE SO SÁNH / ĐỐI THỦ */}
                  <div className="sw-overview-cell sw-cell-full">
                    <span className="sw-cell-label">Xe đang so sánh (Đối thủ)</span>
                    <strong className="sw-cell-val">
                      {customer.competitorModels?.length ? customer.competitorModels.join(', ') : 'Chưa có đối thủ so sánh'}
                    </strong>
                  </div>
                </div>

                {/* FACTS & VERIFICATION CONTROLS */}
                <div className="sw-facts-verify-wrap">
                  <div className="sw-facts-heading">
                    <span>Dữ kiện xác minh</span>
                    <small>Dữ kiện Sales xác nhận sẽ được giữ nguyên khi AI phân tích lại</small>
                  </div>
                  <div className="sw-facts-chips">
                    {[
                      { field: 'interested_models', label: 'Dòng xe', val: customer.model },
                      { field: 'budget_vnd', label: 'Ngân sách', val: customer.budget },
                      { field: 'payment_method', label: 'Thanh toán', val: customer.payment },
                      { field: 'charging_condition', label: 'Điều kiện sạc', val: customer.chargingCondition },
                      { field: 'purchase_timeline', label: 'Thời điểm mua', val: customer.purchaseTimeline },
                    ].map((item) => {
                      const fact = (customer.facts || []).find((f) => f.field === item.field);
                      const isConfirmed = fact?.verification_status === 'confirmed';
                      const isConflicted = fact?.verification_status === 'conflicted';
                      return (
                        <div key={item.field} className="sw-fact-item-row">
                          <div className="sw-fact-meta-left">
                            <span className="sw-fact-title">{item.label}:</span>
                            <span className="sw-fact-text">{item.val}</span>
                            {isConfirmed ? (
                              <span className="sw-fact-tag is-confirmed">
                                <ShieldCheck size={11} /> Đã xác nhận
                              </span>
                            ) : isConflicted ? (
                              <span className="sw-fact-tag is-conflicted">
                                <AlertTriangle size={11} /> Mâu thuẫn
                              </span>
                            ) : (
                              <span className="sw-fact-tag is-inferred">AI suy luận</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="sw-fact-edit-btn"
                            onClick={() => setEditingFact(item)}
                          >
                            {isConfirmed ? 'Sửa' : 'Xác nhận'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* =================================================================
              SECTION B: NEXT BEST ACTIONS (TASKS & APPOINTMENTS)
              ================================================================= */}
          <section className="sw-rail-section">
            <header className="sw-rail-section-header" onClick={() => toggleSection('actions')}>
              <div className="sw-rail-section-title">
                <CalendarCheck size={14} className="sw-rail-icon" />
                <h3>Hành động tiếp theo</h3>
                <span className="sw-rail-count-badge">{pendingTasks.length}</span>
              </div>
              <div className="sw-rail-header-right" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="sw-rail-btn-add"
                  onClick={onCreateTask}
                  title="Thêm lịch hẹn hoặc công việc mới"
                >
                  <Plus size={12} strokeWidth={2.2} />
                  <span>Thêm việc</span>
                </button>
                <ChevronDown
                  size={14}
                  className={`sw-rail-chevron ${sectionsOpen.actions ? 'is-open' : ''}`}
                />
              </div>
            </header>

            {sectionsOpen.actions && (
              <div className="sw-rail-section-body">
                {overdueTasks.length > 0 && (
                  <div className="sw-overdue-alert-banner">
                    <AlertTriangle size={13} />
                    <span>Có {overdueTasks.length} việc quá hạn cần cập nhật trạng thái</span>
                  </div>
                )}

                {pendingTasks.length === 0 ? (
                  <div className="sw-rail-empty">
                    <CheckCircle2 size={18} />
                    <p>Đã hoàn thành mọi công việc của khách này.</p>
                  </div>
                ) : (
                  <div className="sw-task-card-list">
                    {pendingTasks.map((task) => {
                      const isHigh = ['high', 'urgent'].includes(task.priority);
                      const isAppt = task.item_type === 'appointment';
                      return (
                        <div
                          key={task.id}
                          className={`sw-task-rail-card ${isHigh ? 'is-high' : ''} ${isAppt ? 'is-appointment' : ''}`}
                        >
                          <button
                            type="button"
                            className="sw-task-complete-btn"
                            disabled={taskBusy}
                            onClick={() => onToggleTask?.(task.id)}
                            title="Đánh dấu hoàn thành"
                          >
                            <Circle size={15} />
                          </button>

                          <div className="sw-task-rail-content">
                            <strong className="sw-task-rail-title">{task.title}</strong>
                            <div className="sw-task-rail-meta">
                              {task.starts_at && (
                                <span className="sw-task-time">
                                  <Clock size={11} /> {displayDateTime(task.starts_at)}
                                </span>
                              )}
                              {task.location && (
                                <span className="sw-task-loc">
                                  <MapPin size={11} /> {task.location}
                                </span>
                              )}
                              {isHigh && <span className="sw-task-priority-pill">Ưu tiên</span>}
                            </div>
                            {task.sourceMessageIds?.length > 0 && (
                              <button
                                type="button"
                                className="sw-source-jump-btn"
                                onClick={() => onSourceClick?.(task.sourceMessageIds[0])}
                              >
                                Xem tin nguồn <ChevronRight size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* =================================================================
              SECTION C: CUSTOMER CONCERNS (OBJECTIONS & OBSTACLES)
              ================================================================= */}
          <section className="sw-rail-section">
            <header className="sw-rail-section-header" onClick={() => toggleSection('concerns')}>
              <div className="sw-rail-section-title">
                <HelpCircle size={14} className="sw-rail-icon" />
                <h3>Nỗi băn khoăn &amp; Trở ngại</h3>
                {concernsList.length > 0 && (
                  <span className="sw-rail-count-badge is-amber">{concernsList.length}</span>
                )}
              </div>
              <ChevronDown
                size={14}
                className={`sw-rail-chevron ${sectionsOpen.concerns ? 'is-open' : ''}`}
              />
            </header>

            {sectionsOpen.concerns && (
              <div className="sw-rail-section-body">
                {concernsList.length === 0 ? (
                  <p className="sw-rail-empty-text">Chưa phát hiện băn khoăn hay trở ngại nào từ khách.</p>
                ) : (
                  <div className="sw-concerns-list">
                    {concernsList.map((concern, idx) => (
                      <div key={idx} className="sw-concern-card">
                        <div className="sw-concern-top">
                          <span className="sw-concern-dot" />
                          <strong className="sw-concern-text">{concern}</strong>
                        </div>
                        <div className="sw-concern-footer">
                          <span className="sw-concern-status-tag">Cần tư vấn tháo gỡ</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* =================================================================
              SECTION D: INTERACTION HISTORY (TIMELINE MILESTONES)
              ================================================================= */}
          <section className="sw-rail-section">
            <header className="sw-rail-section-header" onClick={() => toggleSection('timeline')}>
              <div className="sw-rail-section-title">
                <Milestone size={14} className="sw-rail-icon" />
                <h3>Lịch sử chăm sóc</h3>
                {eventsList.length > 0 && (
                  <span className="sw-rail-count-badge">{eventsList.length}</span>
                )}
              </div>
              <ChevronDown
                size={14}
                className={`sw-rail-chevron ${sectionsOpen.timeline ? 'is-open' : ''}`}
              />
            </header>

            {sectionsOpen.timeline && (
              <div className="sw-rail-section-body">
                {eventsList.length === 0 ? (
                  <p className="sw-rail-empty-text">Chưa có mốc chăm sóc nào được lưu.</p>
                ) : (
                  <div className="sw-timeline-vertical">
                    {eventsList.map((evt) => (
                      <div key={evt.id} className="sw-timeline-entry">
                        <div className="sw-timeline-bullet" />
                        <div className="sw-timeline-entry-content">
                          <time className="sw-timeline-time">{evt.time}</time>
                          <p className="sw-timeline-title">{evt.text}</p>
                          {evt.sourceMessageId && (
                            <button
                              type="button"
                              className="sw-source-jump-btn"
                              onClick={() => onSourceClick?.(evt.sourceMessageId)}
                            >
                              Xem tin nguồn <ChevronRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* FACT EDITOR MODAL POPUP */}
      {editingFact && (
        <FactEditorModal
          field={editingFact.field}
          label={editingFact.label}
          initialValue={profile[editingFact.field] ?? editingFact.val}
          onSave={onConfirmFact}
          onCancel={() => setEditingFact(null)}
        />
      )}
    </aside>
  );
}
