import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  MessageSquare,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { salesCopilotApi } from '../../../api/salesCopilotApi';
import { leadStages } from '../customerWorkspace/workspaceData';
import { useAgendaResource } from './agendaResource';
import {
  cleanDemoText,
  compactWaiting,
  filters,
  formatDateTime,
  formatTimeRange,
  itemLabel,
  taskState,
} from './agendaData';
import { useWorkspaceClock } from '../customerWorkspace/useCustomerWorkspace';

const STAGE_LABELS = {
  new: 'Mới liên hệ',
  discovery: 'Tìm hiểu nhu cầu',
  qualified: 'Đang tư vấn',
  considering: 'Đang cân nhắc',
  negotiating: 'Đang đàm phán',
  deposit_process: 'Chuẩn bị đặt cọc',
  won: 'Đã ký hợp đồng',
  lost: 'Ngừng chăm sóc',
  needs_confirmation: 'Cần xác nhận',
};

const STAGE_GRAY_SHADES = {
  won: '#111111',
  deposit_process: '#222222',
  negotiating: '#444444',
  considering: '#666666',
  qualified: '#888888',
  discovery: '#AAAAAA',
  new: '#CCCCCC',
  needs_confirmation: '#999999',
  lost: '#D4D4D4',
};

function getStageLabel(stageId) {
  if (STAGE_LABELS[stageId]) return STAGE_LABELS[stageId];
  const found = leadStages.find((s) => s.id === stageId);
  return found?.label || stageId || 'Chưa phân loại';
}

function formatCompactMoney(vnd) {
  if (!vnd || !Number.isFinite(Number(vnd)) || Number(vnd) <= 0) return null;
  const num = Number(vnd);
  if (num >= 1_000_000_000) {
    const billions = (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `${billions.replace('.', ',')} tỷ ₫`;
  }
  const millions = Math.round(num / 1_000_000);
  return `${millions.toLocaleString('vi-VN')} tr ₫`;
}

function Empty({ children = 'Chưa có dữ liệu.' }) {
  return <p className="agenda-empty">{children}</p>;
}

function Panel({ title, subtitle, children, action, className = '', id }) {
  return (
    <section id={id} className={`agenda-panel ${className}`}>
      <div className="agenda-panel-title">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="agenda-panel-subtitle">{subtitle}</p>}
        </div>
        {action && <div className="agenda-panel-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function TaskRow({ item, now, onEdit, onCustomer, onStatus, busy }) {
  const isDone = item.status === 'completed';
  const stateLabel = taskState(item, now);
  const isOverdue = stateLabel === 'Cần cập nhật trạng thái';
  const isHigh = ['high', 'urgent'].includes(item.priority);
  const timeText = formatTimeRange(item.starts_at, item.ends_at, now);

  return (
    <div className={`agenda-task-row ${isDone ? 'is-completed' : ''}`}>
      {/* Quick completion toggle button */}
      <button
        type="button"
        className={`agenda-task-toggle ${isDone ? 'is-done' : ''}`}
        aria-label={isDone ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'}
        disabled={busy}
        onClick={() => onStatus(item, isDone ? 'pending' : 'completed')}
      >
        {isDone ? (
          <CheckCircle2 size={16} strokeWidth={2.2} />
        ) : (
          <Circle size={16} strokeWidth={1.75} />
        )}
      </button>

      <div className="agenda-task-copy">
        <div className="agenda-task-header-line">
          <strong className="agenda-task-title">{cleanDemoText(item.title)}</strong>
          {isHigh && <span className="agenda-task-pill is-high">Ưu tiên</span>}
          {isOverdue && !isDone && <span className="agenda-task-pill is-overdue">Quá hạn</span>}
        </div>

        <div className="agenda-task-details">
          {item.customer_name && (
            <>
              <button
                type="button"
                className="agenda-inline-link"
                onClick={() => onCustomer(item)}
              >
                {cleanDemoText(item.customer_name)}
              </button>
              <span className="agenda-dot-sep">·</span>
            </>
          )}
          <span>{timeText}</span>
          <span className="agenda-dot-sep">·</span>
          <span>{itemLabel(item)}</span>
          {item.location && (
            <>
              <span className="agenda-dot-sep">·</span>
              <span>{item.location}</span>
            </>
          )}
        </div>
      </div>

      <div className="agenda-task-actions">
        <button
          type="button"
          className="agenda-btn-minimal"
          disabled={busy}
          onClick={() => onEdit(item)}
        >
          {item.status === 'needs_review' ? 'Duyệt' : 'Xếp giờ'}
        </button>
        {item.status !== 'completed' && (
          <button
            type="button"
            className="agenda-btn-minimal is-muted"
            disabled={busy}
            onClick={() => onStatus(item, 'cancelled')}
          >
            Hủy
          </button>
        )}
      </div>
    </div>
  );
}

function Bars({ rows, label, totalCount, selectedKey, onSelect }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const sum = totalCount || rows.reduce((acc, r) => acc + r.count, 0) || 1;
  return rows.length ? (
    <div className="agenda-bars">
      {rows.map((row) => {
        const pct = Math.round((row.count / sum) * 100);
        const isSelected = selectedKey === row.key;
        const InteractiveTag = onSelect ? 'button' : 'div';
        return (
          <InteractiveTag
            key={row.key}
            type={onSelect ? 'button' : undefined}
            className={`agenda-bar-row ${onSelect ? 'is-clickable' : ''} ${isSelected ? 'is-selected' : ''}`}
            onClick={onSelect ? () => onSelect(row.key) : undefined}
          >
            <div className="agenda-bar-header">
              <span className="agenda-bar-label">{label(row)}</span>
              <span className="agenda-bar-value">
                <strong>{row.count}</strong>
                <small>{pct}%</small>
              </span>
            </div>
            <div className="agenda-bar-track">
              <span style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }} />
            </div>
          </InteractiveTag>
        );
      })}
    </div>
  ) : (
    <Empty />
  );
}

export function DashboardView({
  currentUser,
  active,
  onCreate,
  onEdit,
  onCustomer,
  onCalendar,
  focusedTask,
  onClearFocus,
}) {
  const [filter, setFilter] = useState('today');
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [customerQueueTab, setCustomerQueueTab] = useState('waiting');
  const [selectedStage, setSelectedStage] = useState(null);
  const now = useWorkspaceClock();

  const resource = useAgendaResource(
    currentUser?.user_id,
    `dashboard:${days}:${filter}:${page}`,
    () => salesCopilotApi.getDashboard({ activity_days: days, work_filter: filter, work_page: page }),
    active
  );
  const data = resource.data;

  function changeFilter(value) {
    setFilter(value);
    setPage(1);
  }

  async function status(item, value) {
    if (busy) return;
    setBusy(item.id);
    setActionError('');
    try {
      await salesCopilotApi.updateTaskStatus(item.id, value);
      if (focusedTask?.id === item.id) onClearFocus();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(null);
    }
  }

  const row = (item) => (
    <TaskRow
      key={item.id}
      item={item}
      now={now}
      busy={busy === item.id}
      onEdit={onEdit}
      onCustomer={onCustomer}
      onStatus={status}
    />
  );

  const activityMax = Math.max(1, ...(data?.message_activity || []).map((day) => day.customer + day.sales));
  const totalCustomerMsgs = (data?.message_activity || []).reduce((acc, d) => acc + d.customer, 0);
  const totalSalesMsgs = (data?.message_activity || []).reduce((acc, d) => acc + d.sales, 0);
  const workCounts = data?.portfolio_insights?.work_counts || {};
  const pendingActionTasks =
    (data?.kpis?.stale_tasks || 0) + (data?.unscheduled?.total || 0) + (data?.kpis?.review_tasks || 0);

  const rawQueueList =
    customerQueueTab === 'waiting'
      ? data?.waiting_customers || []
      : customerQueueTab === 'priority'
        ? data?.priority_customers || []
        : data?.customer_intelligence || [];

  const filteredCustomers = selectedStage
    ? (data?.customers || []).filter((c) => c.stage === selectedStage)
    : rawQueueList;

  const visibleCustomers = showAllCustomers ? filteredCustomers : filteredCustomers.slice(0, 6);
  const totalCustomers = data?.customers?.length || 0;

  return (
    <div className="agenda-page dashboard-page" aria-label="Bảng điều khiển bán hàng">
      {/* MINIMALIST HEADER */}
      <header className="agenda-topbar">
        <div className="agenda-topbar-left">
          <h1>Bảng điều khiển</h1>
          <span className="agenda-topbar-meta">
            {currentUser?.display_name || 'Tư vấn viên'}
          </span>
        </div>

        <div className="agenda-heading-actions">
          <button
            type="button"
            className="agenda-btn-minimal"
            aria-label="Làm mới bảng điều khiển"
            disabled={resource.loading}
            onClick={resource.reload}
          >
            <RefreshCw size={13} strokeWidth={1.75} />
            <span>Làm mới</span>
          </button>
          <button type="button" className="agenda-btn-minimal" onClick={() => onCalendar()}>
            <CalendarDays size={13} strokeWidth={1.75} />
            <span>Lịch tuần</span>
          </button>
          <button
            type="button"
            className="agenda-btn-solid"
            disabled={!data}
            onClick={() => onCreate(data.customers)}
          >
            <Plus size={14} strokeWidth={2} />
            <span>Tạo việc</span>
          </button>
        </div>
      </header>

      {(resource.error || actionError) && (
        <div className="sw-error-banner" role="alert">
          {resource.error || actionError}
          <button type="button" className="sw-text-button" onClick={resource.reload}>
            Thử lại
          </button>
        </div>
      )}

      {!data && (
        <p className="agenda-empty" role="status">
          {resource.loading ? 'Đang tải dữ liệu...' : 'Chưa tải được dữ liệu.'}
        </p>
      )}

      {data && (
        <>
          {/* ROW 1: SLEEK METRIC STRIP (PURE MONOCHROME) */}
          <section className="agenda-metric-strip" aria-label="Chỉ số vận hành">
            <button
              type="button"
              className="agenda-metric-cell"
              onClick={() => {
                setSelectedStage(null);
                setCustomerQueueTab('waiting');
              }}
            >
              <span className="agenda-metric-label">Chờ phản hồi</span>
              <div className="agenda-metric-main">
                <strong>{data.kpis.waiting_customers}</strong>
                <small>
                  {data.waiting_customers[0]?.waiting_since
                    ? compactWaiting(data.waiting_customers[0].waiting_since, now)
                    : 'Đã phản hồi'}
                </small>
              </div>
            </button>

            <button
              type="button"
              className="agenda-metric-cell"
              onClick={() => {
                setSelectedStage(null);
                setCustomerQueueTab('priority');
              }}
            >
              <span className="agenda-metric-label">Cơ hội nóng</span>
              <div className="agenda-metric-main">
                <strong>
                  {data.kpis.hot_leads}
                  <span className="agenda-metric-denom">/{data.kpis.active_customers}</span>
                </strong>
                <small>{data.kpis.closing_leads || 0} sát chốt</small>
              </div>
            </button>

            <button
              type="button"
              className="agenda-metric-cell"
              onClick={() => changeFilter('today')}
            >
              <span className="agenda-metric-label">Lịch hôm nay</span>
              <div className="agenda-metric-main">
                <strong>{data.kpis.today_events}</strong>
                <small>{data.kpis.upcoming_events} sắp tới</small>
              </div>
            </button>

            <button
              type="button"
              className="agenda-metric-cell"
              onClick={() =>
                changeFilter(
                  data.kpis.stale_tasks > 0
                    ? 'stale'
                    : data.unscheduled.total > 0
                      ? 'unscheduled'
                      : 'review'
                )
              }
            >
              <span className="agenda-metric-label">Cần xếp lịch</span>
              <div className="agenda-metric-main">
                <strong>{pendingActionTasks}</strong>
                <small>{data.unscheduled.total} chưa xếp</small>
              </div>
            </button>

            <button
              type="button"
              className="agenda-metric-cell"
              onClick={() => {
                setSelectedStage(null);
                setCustomerQueueTab('priority');
              }}
            >
              <span className="agenda-metric-label">Dự kiến cọc</span>
              <div className="agenda-metric-main">
                <strong className="is-money">
                  {data.kpis.pipeline_budget_vnd > 0
                    ? formatCompactMoney(data.kpis.pipeline_budget_vnd)
                    : '0 ₫'}
                </strong>
                <small>
                  {data.kpis.completed_tasks}/{data.kpis.total_tasks} việc xong
                </small>
              </div>
            </button>
          </section>

          {/* ROW 2: SLEEK SEGMENTED PIPELINE (REPLACES 9 CHUNKY BOXES) */}
          <section className="agenda-pipeline-card" aria-label="Phễu bán hàng">
            <div className="agenda-pipeline-header">
              <div className="agenda-pipeline-title-group">
                <span className="agenda-pipeline-title">Phễu bán hàng</span>
                <span className="agenda-pipeline-count">Tổng {totalCustomers} khách</span>
              </div>
              {selectedStage && (
                <button
                  type="button"
                  className="agenda-pill-clear"
                  onClick={() => setSelectedStage(null)}
                >
                  <X size={12} /> Bỏ lọc: {getStageLabel(selectedStage)}
                </button>
              )}
            </div>

            {/* Continuous segmented progress bar */}
            <div className="agenda-pipeline-bar" role="meter" aria-label="Tiến độ phễu khách hàng">
              {data.stage_distribution
                .filter((item) => item.count > 0)
                .map((item) => {
                  const pct = Math.max(4, (item.count / Math.max(1, totalCustomers)) * 100);
                  const isSelected = selectedStage === item.stage;
                  const shade = STAGE_GRAY_SHADES[item.stage] || '#888888';
                  return (
                    <button
                      type="button"
                      key={item.stage}
                      className={`agenda-pipeline-segment ${isSelected ? 'is-active' : ''}`}
                      style={{ width: `${pct}%`, backgroundColor: shade }}
                      title={`${getStageLabel(item.stage)}: ${item.count} khách`}
                      onClick={() => setSelectedStage(isSelected ? null : item.stage)}
                    />
                  );
                })}
            </div>

            {/* Horizontal stage filter pills */}
            <div className="agenda-pipeline-pills" role="tablist" aria-label="Bộ lọc giai đoạn phễu">
              <button
                type="button"
                className={`agenda-stage-pill ${!selectedStage ? 'is-active' : ''}`}
                onClick={() => setSelectedStage(null)}
              >
                <span>Tất cả</span>
                <em>{totalCustomers}</em>
              </button>
              {data.stage_distribution
                .filter((item) => item.count > 0)
                .map((item) => {
                  const isSelected = selectedStage === item.stage;
                  return (
                    <button
                      type="button"
                      key={item.stage}
                      className={`agenda-stage-pill ${isSelected ? 'is-active' : ''}`}
                      onClick={() => setSelectedStage(isSelected ? null : item.stage)}
                    >
                      <span>{getStageLabel(item.stage)}</span>
                      <em>{item.count}</em>
                    </button>
                  );
                })}
            </div>
          </section>

          {focusedTask && (
            <Panel
              title="Công việc đang chọn"
              action={
                <button type="button" className="agenda-btn-minimal" onClick={onClearFocus}>
                  Đóng
                </button>
              }
            >
              {row(focusedTask)}
            </Panel>
          )}

          {/* ROW 3: PRIMARY 2-COLUMN WORKSPACE (CUSTOMERS + TASKS) */}
          <div className="agenda-main-grid">
            {/* LEFT: CUSTOMER LIST (MINIMALIST WITH HIGH-VALUE DETAILS) */}
            <div className="agenda-column" id="agenda-primary-queue">
              <section className="agenda-panel">
                <div className="agenda-queue-header">
                  <div className="agenda-queue-tabs" role="tablist" aria-label="Danh sách khách hàng">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!selectedStage && customerQueueTab === 'waiting'}
                      className={!selectedStage && customerQueueTab === 'waiting' ? 'is-active' : ''}
                      onClick={() => {
                        setSelectedStage(null);
                        setCustomerQueueTab('waiting');
                      }}
                    >
                      <span>Chờ phản hồi</span>
                      <em>{data.waiting_customers.length}</em>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!selectedStage && customerQueueTab === 'priority'}
                      className={!selectedStage && customerQueueTab === 'priority' ? 'is-active' : ''}
                      onClick={() => {
                        setSelectedStage(null);
                        setCustomerQueueTab('priority');
                      }}
                    >
                      <span>Trọng điểm</span>
                      <em>{(data.priority_customers || []).length}</em>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!selectedStage && customerQueueTab === 'intelligence'}
                      className={!selectedStage && customerQueueTab === 'intelligence' ? 'is-active' : ''}
                      onClick={() => {
                        setSelectedStage(null);
                        setCustomerQueueTab('intelligence');
                      }}
                    >
                      <span>Băn khoăn</span>
                      <em>{(data.customer_intelligence || []).length}</em>
                    </button>
                  </div>
                </div>

                {visibleCustomers.length ? (
                  <div className="agenda-minimal-list">
                    {visibleCustomers.map((customer) => {
                      const stageLabel = getStageLabel(customer.stage);
                      const modelText = customer.models?.length ? customer.models.join(', ') : null;
                      const budgetText = formatCompactMoney(customer.budget_vnd);
                      const competitorText = customer.competitor_models?.length
                        ? `So sánh ${customer.competitor_models[0]}`
                        : null;
                      const waitText = customer.waiting_since
                        ? compactWaiting(customer.waiting_since, now)
                        : null;

                      const facts = [stageLabel, budgetText, competitorText].filter(Boolean);

                      const singleNote = cleanDemoText(
                        customerQueueTab === 'waiting' && !selectedStage
                          ? customer.last_message || customer.issues?.[0] || customer.buying_signals?.[0]
                          : customerQueueTab === 'intelligence' && !selectedStage
                            ? customer.issues?.[0] || customer.promises?.[0] || customer.quick_summary
                            : customer.buying_signals?.[0] ||
                                customer.issues?.[0] ||
                                customer.quick_summary ||
                                customer.last_message
                      );

                      return (
                        <div className="agenda-minimal-row" key={customer.customer_id}>
                          <div className="agenda-minimal-row-main">
                            <div className="agenda-minimal-line1">
                              <button
                                type="button"
                                className="agenda-customer-name-btn"
                                onClick={() => onCustomer(customer)}
                              >
                                {cleanDemoText(customer.customer_name)}
                              </button>
                              {modelText && <span className="agenda-model-tag">{modelText}</span>}
                              <span className="agenda-minimal-meta">{facts.join(' · ')}</span>
                            </div>
                            {/* Rich customer message/issue - prominent & readable */}
                            {singleNote && (
                              <p className="agenda-customer-note">
                                “{cleanDemoText(singleNote)}”
                              </p>
                            )}
                          </div>

                          <div className="agenda-minimal-row-right">
                            {waitText && <span className="agenda-minimal-time">{waitText}</span>}
                            <button
                              type="button"
                              className="agenda-btn-primary-action"
                              onClick={() => onCustomer(customer)}
                            >
                              <span>Hội thoại</span>
                              <ArrowRight size={12} />
                            </button>
                            <button
                              type="button"
                              className="agenda-btn-subtle"
                              onClick={() => onCustomer({ ...customer, tool: 'summary' })}
                              title="Xem hồ sơ"
                            >
                              Hồ sơ
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {filteredCustomers.length > 6 && (
                      <button
                        type="button"
                        className="agenda-expand-btn"
                        onClick={() => setShowAllCustomers((prev) => !prev)}
                      >
                        {showAllCustomers
                          ? 'Thu gọn'
                          : `Xem thêm ${filteredCustomers.length - 6} khách hàng`}
                      </button>
                    )}
                  </div>
                ) : (
                  <Empty>Không có khách hàng trong mục này.</Empty>
                )}
              </section>
            </div>

            {/* RIGHT: SCHEDULE & TASKS */}
            <div className="agenda-column">
              <Panel
                id="agenda-work-panel"
                title="Công việc & Lịch"
                action={<span className="agenda-muted-caption">{data.work_items.total} mục</span>}
              >
                <div className="agenda-filter-tabs" aria-label="Lọc công việc">
                  {Object.entries(filters).map(([value, label]) => {
                    const tabCount = workCounts[value];
                    return (
                      <button
                        type="button"
                        key={value}
                        className={filter === value ? 'is-active' : ''}
                        aria-pressed={filter === value}
                        onClick={() => changeFilter(value)}
                      >
                        <span>{label}</span>
                        {typeof tabCount === 'number' && <em>{tabCount}</em>}
                      </button>
                    );
                  })}
                </div>

                {data.work_items.items.length ? (
                  <div className="agenda-minimal-list">{data.work_items.items.map(row)}</div>
                ) : (
                  <div className="agenda-empty-work-fallback">
                    <p className="agenda-empty-inline">
                      {filter === 'today'
                        ? 'Hôm nay chưa có lịch cố định giờ.'
                        : 'Không có mục nào trong bộ lọc này.'}
                    </p>
                    {filter === 'today' && data.unscheduled.items.length > 0 && (
                      <div className="agenda-fallback-section">
                        <div className="agenda-fallback-header">
                          <span>Việc chưa xếp giờ ({data.unscheduled.total})</span>
                          <button
                            type="button"
                            className="agenda-inline-link"
                            onClick={() => changeFilter('unscheduled')}
                          >
                            Xem tất cả
                          </button>
                        </div>
                        <div className="agenda-minimal-list">
                          {data.unscheduled.items.slice(0, 4).map(row)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {data.work_items.total > 10 && (
                  <div className="agenda-pagination">
                    <button
                      type="button"
                      className="agenda-btn-minimal"
                      aria-label="Trang trước"
                      disabled={data.work_items.page <= 1 || resource.loading}
                      onClick={() => setPage(data.work_items.page - 1)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span>
                      {data.work_items.page}/{Math.ceil(data.work_items.total / 10)}
                    </span>
                    <button
                      type="button"
                      className="agenda-btn-minimal"
                      aria-label="Trang sau"
                      disabled={data.work_items.page * 10 >= data.work_items.total || resource.loading}
                      onClick={() => setPage(data.work_items.page + 1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </Panel>

              <Panel
                title="Lịch sắp tới"
                action={
                  <button type="button" className="agenda-inline-link" onClick={() => onCalendar()}>
                    Lịch tuần <ArrowRight size={12} />
                  </button>
                }
              >
                {data.upcoming_events.length ? (
                  <div className="agenda-minimal-list">
                    {data.upcoming_events.map((item) => (
                      <button
                        type="button"
                        className="agenda-upcoming"
                        key={item.id}
                        onClick={() => onCalendar(item.starts_at)}
                      >
                        <span className="agenda-upcoming-body">
                          <strong>{cleanDemoText(item.title)}</strong>
                          <small>
                            <Clock3 size={11} /> {formatTimeRange(item.starts_at, item.ends_at, now)} ·{' '}
                            {cleanDemoText(item.customer_name) || 'Cá nhân'}
                            {item.location ? ` · ${item.location}` : ''}
                          </small>
                        </span>
                        <ChevronRight size={14} className="agenda-upcoming-chevron" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty>Chưa có sự kiện sắp đến.</Empty>
                )}
              </Panel>
            </div>
          </div>

          {/* ROW 4: COMPACT BOTTOM INSIGHTS (VEHICLE DEMAND + MESSAGE ACTIVITY) */}
          <div className="agenda-bottom-grid" id="agenda-portfolio">
            <Panel title="Nhu cầu theo dòng xe">
              <Bars
                rows={data.model_interest.map((item) => ({
                  ...item,
                  key: item.model,
                }))}
                label={(item) => item.model}
              />
            </Panel>

            <Panel
              title="Tần suất tương tác tin nhắn"
              action={
                <select
                  aria-label="Khoảng thời gian hoạt động"
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                >
                  <option value={7}>7 ngày</option>
                  <option value={30}>30 ngày</option>
                </select>
              }
            >
              <div className="agenda-activity-header-row">
                <div className="agenda-legend">
                  <span>
                    <i className="customer" />
                    Khách ({totalCustomerMsgs})
                  </span>
                  <span>
                    <i className="sales" />
                    Sales ({totalSalesMsgs})
                  </span>
                </div>
                <span className="agenda-muted-caption">
                  TB {Math.round((totalCustomerMsgs + totalSalesMsgs) / days)} tin/ngày
                </span>
              </div>

              <div
                className="agenda-activity-chart"
                role="img"
                aria-label={`Số tin nhắn khách hàng và sales trong ${days} ngày`}
              >
                {data.message_activity.map((day, index) => (
                  <div
                    className="agenda-activity-day"
                    key={day.date}
                    title={`${day.date}: Khách ${day.customer}, Sales ${day.sales}`}
                  >
                    <span className="agenda-activity-total">{day.customer + day.sales || ''}</span>
                    <div className="agenda-activity-stack">
                      <span className="sales" style={{ height: `${(day.sales / activityMax) * 90}px` }} />
                      <span className="customer" style={{ height: `${(day.customer / activityMax) * 90}px` }} />
                    </div>
                    <small>
                      {days === 7 || index % 5 === 0 || index === days - 1
                        ? day.date.slice(5).split('-').reverse().join('/')
                        : ''}
                    </small>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
