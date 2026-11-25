import { useEffect, useRef, useState } from 'react';
import '../../../assets/HomeShowroom.css';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
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
  formatTimeRange,
  itemLabel,
  taskState,
} from './agendaData';
import { useWorkspaceClock } from '../customerWorkspace/useCustomerWorkspace';
import { VINFAST_SHOWCASE_MODELS } from '../../../data/vehicleShowcaseData';

const WORK_FILTERS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'upcoming', label: 'Sắp đến' },
  { key: 'stale', label: 'Cần cập nhật' },
  { key: 'unscheduled', label: 'Cần xếp lịch' },
  { key: 'review', label: 'Cần duyệt' },
  { key: 'completed', label: 'Hoàn thành' },
];

const STAGE_LABELS = {
  new: 'Mới',
  discovery: 'Tìm hiểu',
  qualified: 'Đang tư vấn',
  considering: 'Cân nhắc',
  negotiating: 'Đàm phán',
  deposit_process: 'Đặt cọc',
  won: 'Đã ký',
  lost: 'Ngừng',
  needs_confirmation: 'Xác nhận',
};

const STAGE_COLORS = {
  won: '#1D1D1F',
  deposit_process: '#2D2D2F',
  negotiating: '#4A4A4C',
  considering: '#6E6E73',
  qualified: '#8E8E93',
  discovery: '#AEAEB2',
  new: '#D1D1D6',
  needs_confirmation: '#8E8E93',
  lost: '#E5E5EA',
};
const DASHBOARD_MODEL_IMAGES = {
  'VF 3': '/vehicles/official/vf-3.webp', 'VF 5': '/vehicles/official/vf-5.webp',
  'VF 6': '/vehicles/official/vf-6.webp', 'VF 7': '/vehicles/official/vf-7.webp',
  'VF 8': '/vehicles/official/vf-8.webp', 'VF 9': '/vehicles/official/vf-9.webp',
  'VF Wild': '/vehicles/official/vf-wild.webp',
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

function Bars({ rows = [], label, totalCount, selectedKey, onSelect }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const max = Math.max(1, ...safeRows.map((row) => row.count || 0));
  const sum = totalCount || safeRows.reduce((acc, r) => acc + (r.count || 0), 0) || 1;
  return safeRows.length ? (
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

const showroomGroups = [
  { label: 'Tất cả' },
  { label: 'Đô thị', ids: ['vf3', 'vf5'] },
  { label: 'SUV gia đình', ids: ['vf6', 'vf7'] },
  { label: 'SUV cao cấp', ids: ['vf8', 'vf9'] },
];

export function HomeShowroom({ onOpenCalendar, onOpenQueue, onCreateTask, creatingTask, actionError }) {
  const [category, setCategory] = useState(showroomGroups[0]);
  const [selectedIndex, setSelectedIndex] = useState(3);
  const sectionRef = useRef(null);
  const collectionRef = useRef(null);
  const revealed = useRef(new WeakSet());
  const models = VINFAST_SHOWCASE_MODELS;
  const selected = models[selectedIndex];
  const visibleModels = category.ids ? models.filter((model) => category.ids.includes(model.id)) : models;

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!window.IntersectionObserver || !Element.prototype.animate || motion.matches) return;
    const seen = revealed.current;
    const animations = new Set();
    const observer = new IntersectionObserver((entries) => {
      if (motion.matches) return;
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        observer.unobserve(target);
        seen.add(target);
        const animation = target.animate(
          [{ opacity: 0.25, translate: '0 18px' }, { opacity: 1, translate: '0 0' }],
          { duration: 460, easing: 'cubic-bezier(.2,.7,.25,1)' }
        );
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    }, { threshold: 0.15 });
    sectionRef.current?.querySelectorAll('[data-showroom-reveal]').forEach((element) => {
      if (!seen.has(element)) observer.observe(element);
    });
    const cancel = () => {
      for (const animation of animations) animation.cancel();
      animations.clear();
    };
    motion.addEventListener('change', cancel);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', cancel);
      cancel();
    };
  }, [category]);

  function moveHero(step) {
    setSelectedIndex((index) => (index + step + models.length) % models.length);
  }

  function scrollTo(ref) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  }

  const quickHighlights = [
    { title: 'Lịch hẹn lái thử tuần này', image: '/vehicles/user/vf-lineup.jpg', onClick: onOpenCalendar },
    { title: 'Hàng đợi tư vấn', image: '/vehicles/user/vf6-lineup.webp', onClick: onOpenQueue },
    { title: creatingTask ? 'Đang mở công việc…' : 'Tạo nhiệm vụ chăm sóc mới', image: '/vehicles/user/vf8-night.jpeg', onClick: onCreateTask, disabled: creatingTask },
  ];

  return (
    <section className="porsche-showroom" aria-label="Showroom xe điện VinFast" ref={sectionRef}>
      <div className="ps-hero">
        <div className="ps-hero-brand">VINFAST</div>
        <img className="ps-hero-bg" key={selected.id} src={selected.image} alt="" fetchPriority="high" />
        <div className="ps-hero-bottom">
          <div className="ps-hero-copy" key={selected.id} aria-live="polite">
            <h2 className="ps-hero-title">{selected.name}</h2>
            <p className="ps-hero-subtitle">{selected.tagline}</p>
          </div>
          <div className="ps-hero-actions">
            <button type="button" className="ps-btn-outline-light" onClick={() => scrollTo(collectionRef)}>Khám phá dòng xe</button>
            <button type="button" className="ps-btn-ghost-light" onClick={onOpenCalendar}>Xem lịch tuần</button>
          </div>
        </div>
        <div className="ps-hero-controls" role="group" aria-label="Đổi xe trưng bày">
          <button type="button" aria-label="Xe trước" onClick={() => moveHero(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span>{selectedIndex + 1} / {models.length}</span>
          <button type="button" aria-label="Xe tiếp theo" onClick={() => moveHero(1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="ps-highlight-strip" data-showroom-reveal>
        {quickHighlights.map((item) => (
          <button key={item.image} type="button" className="ps-highlight-card" disabled={item.disabled} onClick={item.onClick}>
            <img src={item.image} alt="" loading="lazy" />
            <span className="ps-highlight-footer">{item.title}<ArrowRight size={18} aria-hidden="true" /></span>
          </button>
        ))}
        {actionError && <p className="ps-home-error" role="alert">{actionError}</p>}
      </div>

      <div className="ps-editorial-header" ref={collectionRef} data-showroom-reveal>
        <h2>Hành trình VinFast của bạn bắt đầu ngay bây giờ.</h2>
        <div className="ps-category-tabs" role="group" aria-label="Lọc nhóm xe">
          {showroomGroups.map((item) => (
            <button key={item.label} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-showcase-dark-band">
        <div className="ps-model-grid" key={category.label}>
          {visibleModels.map((model) => (
            <button
              key={model.id}
              type="button"
              className="ps-model-card"
              data-showroom-reveal
              aria-pressed={selected.id === model.id}
              onClick={() => {
                setSelectedIndex(models.indexOf(model));
                scrollTo(sectionRef);
              }}
            >
              <span className="ps-model-top"><strong>{model.name}</strong></span>
              <img className="ps-model-bg" src={model.image} alt="" loading="lazy" />
              <span className="ps-model-bottom">
                <span className="ps-model-badges"><span>{model.segment}</span><span>{model.price}</span></span>
                <span className="ps-model-caption-row">
                  <span>{model.tagline}</span>
                  <span className="ps-model-arrow"><ArrowRight size={18} aria-hidden="true" /></span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
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
  const [selectedModel, setSelectedModel] = useState(null);
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

  const rawQueueList =
    customerQueueTab === 'waiting'
      ? data?.waiting_customers || []
      : customerQueueTab === 'priority'
        ? data?.priority_customers || []
        : data?.customers || [];

  let filteredCustomers = rawQueueList;
  if (selectedModel) {
    filteredCustomers = (data?.customers || []).filter((c) =>
      c.models?.some((m) => m.toLowerCase().includes(selectedModel.toLowerCase()))
    );
  } else if (selectedStage) {
    filteredCustomers = (data?.customers || []).filter((c) => c.stage === selectedStage);
  }

  const visibleCustomers = showAllCustomers ? filteredCustomers : filteredCustomers.slice(0, 6);
  const totalCustomers = data?.customers?.length || 0;
  const workCounts = data?.portfolio_insights?.work_counts || {};

  const activityMax = Math.max(
    1,
    ...(data?.message_activity || []).map((day) => day.customer + day.sales)
  );
  const totalCustomerMsgs = (data?.message_activity || []).reduce((acc, d) => acc + d.customer, 0);
  const totalSalesMsgs = (data?.message_activity || []).reduce((acc, d) => acc + d.sales, 0);

  return (
    <div className="agenda-page dashboard-page" aria-label="Bảng điều khiển bán hàng">
      {/* TOP HEADER */}
      <header className="agenda-topbar">
        <div className="agenda-topbar-left">
          <h1>Bảng điều khiển</h1>
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
            onClick={() => onCreate(data?.customers || [])}
          >
            <Plus size={14} strokeWidth={2.2} />
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

      <section className="dashboard-product-hero" aria-label="Dòng xe nổi bật">
        <div className="dashboard-model-tabs">
          {VINFAST_SHOWCASE_MODELS.map((model) => (
            <button key={model.key} type="button" className={selectedModel === model.key ? 'is-active' : ''} onClick={() => setSelectedModel(model.key)}>
              {model.name} <span>{(data?.model_interest || []).find((item) => item.model === model.key)?.count || 0}</span>
            </button>
          ))}
        </div>
        <div className="dashboard-product-copy">
          <span className="dashboard-product-kicker">{VINFAST_SHOWCASE_MODELS.find((m) => m.key === selectedModel)?.segment || 'SUV điện cao cấp'}</span>
          <h2>{VINFAST_SHOWCASE_MODELS.find((m) => m.key === selectedModel)?.name || 'VinFast VF 7'}</h2>
          <p>Không gian rộng rãi, công nghệ thông minh và trải nghiệm lái đầy cảm hứng.</p>
          <div className="dashboard-product-actions">
            <button type="button" className="agenda-btn-solid" onClick={() => onCalendar()}><CalendarDays size={15} /> Lái thử</button>
            <button type="button" className="agenda-btn-minimal" onClick={() => onCreate(data?.customers || [])}><Plus size={15} /> Báo giá</button>
          </div>
        </div>
        <img className="dashboard-product-image" src={DASHBOARD_MODEL_IMAGES[selectedModel] || DASHBOARD_MODEL_IMAGES['VF 7']} alt="" />
      </section>

      {!data && (
        <p className="agenda-empty" role="status">
          {resource.loading ? 'Đang tải dữ liệu…' : 'Chưa tải được dữ liệu.'}
        </p>
      )}

      {data && (
        <>
          {/* UNIFIED EXECUTIVE COMMAND HUB */}
          <section className="agenda-command-hub" aria-label="Trung tâm điều hành kinh doanh">
            <div className="agenda-command-top">
              <button
                type="button"
                className="agenda-kpi-block"
                onClick={() => {
                  setSelectedModel(null);
                  setSelectedStage(null);
                  setCustomerQueueTab('waiting');
                }}
              >
                <span className="agenda-kpi-label">Khách chờ</span>
                <div className="agenda-kpi-val">
                  <strong>{data?.kpis?.waiting_customers || 0}</strong>
                  <small>
                    {data?.waiting_customers?.[0]?.waiting_since
                      ? compactWaiting(data.waiting_customers[0].waiting_since, now)
                      : 'Đã phản hồi'}
                  </small>
                </div>
              </button>

              <button
                type="button"
                className="agenda-kpi-block"
                onClick={() => {
                  setSelectedModel(null);
                  setSelectedStage(null);
                  setCustomerQueueTab('priority');
                }}
              >
                <span className="agenda-kpi-label">Cơ hội nóng</span>
                <div className="agenda-kpi-val">
                  <strong>
                    {data?.kpis?.hot_leads || 0}
                    <span className="agenda-kpi-sub">/{data?.kpis?.active_customers || 0}</span>
                  </strong>
                  <small>{data?.kpis?.closing_leads || 0} sát chốt</small>
                </div>
              </button>

              <button
                type="button"
                className="agenda-kpi-block"
                onClick={() => changeFilter('today')}
              >
                <span className="agenda-kpi-label">Lịch hôm nay</span>
                <div className="agenda-kpi-val">
                  <strong>{data?.kpis?.today_events || 0}</strong>
                  <small>{data?.kpis?.upcoming_events || 0} tuần này</small>
                </div>
              </button>

              <button
                type="button"
                className="agenda-kpi-block"
                onClick={() => {
                  setSelectedModel(null);
                  setSelectedStage(null);
                  setCustomerQueueTab('priority');
                }}
              >
                <span className="agenda-kpi-label">Tổng cọc</span>
                <div className="agenda-kpi-val">
                  <strong className="is-money">
                    {data?.kpis?.pipeline_budget_vnd > 0
                      ? formatCompactMoney(data.kpis.pipeline_budget_vnd)
                      : '0 ₫'}
                  </strong>
                  <small>
                    {data?.kpis?.completed_tasks || 0}/{data?.kpis?.total_tasks || 0} xong
                  </small>
                </div>
              </button>
            </div>

            {/* INTEGRATED PIPELINE PROGRESS & FILTER PILLS */}
            <div className="agenda-command-bottom">
              <div className="agenda-pipeline-strip-head">
                <span className="agenda-pipeline-strip-title">Phễu</span>
                <span className="agenda-pipeline-strip-meta">
                  {selectedModel ? `Lọc theo dòng xe ${selectedModel}: ` : ''}
                  {filteredCustomers.length} khách
                </span>
                {(selectedStage || selectedModel) && (
                  <button
                    type="button"
                    className="agenda-pill-clear"
                    onClick={() => {
                      setSelectedStage(null);
                      setSelectedModel(null);
                    }}
                  >
                    <X size={12} /> Bỏ lọc
                  </button>
                )}
              </div>

              <div className="agenda-pipeline-bar" role="meter" aria-label="Tiến độ phễu khách hàng">
                {(data?.stage_distribution || [])
                  .filter((item) => item.count > 0)
                  .map((item) => {
                    const pct = Math.max(4, (item.count / Math.max(1, totalCustomers)) * 100);
                    const isSelected = selectedStage === item.stage;
                    const shade = STAGE_COLORS[item.stage] || '#1D1D1F';
                    return (
                      <button
                        type="button"
                        key={item.stage}
                        className={`agenda-pipeline-segment ${isSelected ? 'is-active' : ''}`}
                        style={{ width: `${pct}%`, backgroundColor: shade }}
                        title={`${getStageLabel(item.stage)}: ${item.count} khách`}
                        onClick={() => {
                          setSelectedModel(null);
                          setSelectedStage(isSelected ? null : item.stage);
                        }}
                      />
                    );
                  })}
              </div>

              <div className="agenda-pipeline-pills" role="tablist" aria-label="Bộ lọc giai đoạn phễu">
                <button
                  type="button"
                  className={`agenda-stage-pill ${!selectedStage && !selectedModel ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedStage(null);
                    setSelectedModel(null);
                  }}
                >
                  <span>Tất cả</span>
                  <em>{totalCustomers}</em>
                </button>
                {(data?.stage_distribution || [])
                  .filter((item) => item.count > 0)
                  .map((item) => {
                    const isSelected = selectedStage === item.stage;
                    return (
                      <button
                        type="button"
                        key={item.stage}
                        className={`agenda-stage-pill ${isSelected ? 'is-active' : ''}`}
                        onClick={() => {
                          setSelectedModel(null);
                          setSelectedStage(isSelected ? null : item.stage);
                        }}
                      >
                        <span>{getStageLabel(item.stage)}</span>
                        <em>{item.count}</em>
                      </button>
                    );
                  })}
              </div>
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

          {/* PRIMARY 2-COLUMN ACTION WORKSPACE */}
          <div className="agenda-main-grid">
            <div className="agenda-column" id="agenda-primary-queue">
              <section className="agenda-panel">
                <div className="agenda-queue-header">
                  <div className="agenda-queue-tabs" role="tablist" aria-label="Danh sách khách hàng">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!selectedStage && !selectedModel && customerQueueTab === 'waiting'}
                      className={!selectedStage && !selectedModel && customerQueueTab === 'waiting' ? 'is-active' : ''}
                      onClick={() => {
                        setSelectedStage(null);
                        setSelectedModel(null);
                        setCustomerQueueTab('waiting');
                      }}
                    >
                      <span>Cần phản hồi</span>
                      <em>{(data?.waiting_customers || []).length}</em>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!selectedStage && !selectedModel && customerQueueTab === 'priority'}
                      className={!selectedStage && !selectedModel && customerQueueTab === 'priority' ? 'is-active' : ''}
                      onClick={() => {
                        setSelectedStage(null);
                        setSelectedModel(null);
                        setCustomerQueueTab('priority');
                      }}
                    >
                      <span>Cơ hội nóng</span>
                      <em>{(data?.priority_customers || []).length}</em>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={customerQueueTab === 'all' && !selectedStage && !selectedModel}
                      className={customerQueueTab === 'all' && !selectedStage && !selectedModel ? 'is-active' : ''}
                      onClick={() => {
                        setSelectedStage(null);
                        setSelectedModel(null);
                        setCustomerQueueTab('all');
                      }}
                    >
                      <span>Tất cả</span>
                      <em>{totalCustomers}</em>
                    </button>
                  </div>
                </div>

                {visibleCustomers.length ? (
                  <div className="agenda-minimal-list">
                    {visibleCustomers.map((customer) => {
                      const stageLabel = getStageLabel(customer.stage);
                      const modelText = customer.models?.length ? customer.models.join(', ') : null;
                      const budgetText = formatCompactMoney(customer.budget_vnd);
                      const waitText = customer.waiting_since
                        ? compactWaiting(customer.waiting_since, now)
                        : null;

                      return (
                        <div className="agenda-minimal-row" key={customer.customer_id}>
                          <div className="agenda-minimal-row-main">
                            <div className="agenda-minimal-line1">
                              <span className="agenda-avatar-circle">
                                {customer.customer_name
                                  ? customer.customer_name.slice(0, 1).toUpperCase()
                                  : 'K'}
                              </span>
                              <button
                                type="button"
                                className="agenda-customer-name-btn"
                                onClick={() => onCustomer(customer)}
                              >
                                {cleanDemoText(customer.customer_name)}
                              </button>
                              {modelText && <span className="agenda-model-tag">{modelText}</span>}
                              <span className="agenda-stage-tag">{stageLabel}</span>
                              {budgetText && <span className="agenda-budget-tag">{budgetText}</span>}
                            </div>
                          </div>

                          <div className="agenda-minimal-row-right">
                            {waitText && <span className="agenda-minimal-time">{waitText}</span>}
                            <button
                              type="button"
                              className="agenda-btn-primary-action"
                              onClick={() => onCustomer(customer)}
                            >
                              <span>Tư vấn</span>
                              <ArrowRight size={13} />
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
                          ? 'Thu gọn danh sách'
                          : `Xem thêm ${filteredCustomers.length - 6} khách hàng khác`}
                      </button>
                    )}
                  </div>
                ) : (
                  <Empty>Không có khách hàng trong mục này.</Empty>
                )}
              </section>
            </div>

            <div className="agenda-column">
              <section className="agenda-panel">
                <div className="agenda-panel-title">
                  <div>
                    <h2>Nhiệm vụ</h2>
                    <p className="agenda-panel-subtitle">{workCounts[filter] || 0} mục cần xử lý</p>
                  </div>
                  <button
                    type="button"
                    className="agenda-btn-solid"
                    disabled={!data}
                    onClick={() => onCreate(data?.customers || [])}
                  >
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Tạo việc</span>
                  </button>
                </div>

                <div className="agenda-filter-tabs" aria-label="Lọc công việc">
                  {WORK_FILTERS.map((f) => (
                    <button
                      type="button"
                      key={f.key}
                      className={filter === f.key ? 'is-active' : ''}
                      onClick={() => changeFilter(f.key)}
                    >
                      <span>{f.label}</span>
                      <em>{workCounts[f.key] || 0}</em>
                    </button>
                  ))}
                </div>

                {data?.work_items?.items?.length ? (
                  <div className="agenda-minimal-list">{data.work_items.items.map(row)}</div>
                ) : (
                  <div className="agenda-empty-work-fallback">
                    <Empty>Không có việc nào trong mục này.</Empty>
                    {data?.unscheduled_urgent_tasks?.length > 0 && (
                      <div className="agenda-fallback-section">
                        <div className="agenda-fallback-header">
                          <strong>Việc gấp cần xếp lịch</strong>
                          <span>({data.unscheduled_urgent_tasks.length})</span>
                        </div>
                        <div className="agenda-minimal-list">
                          {data.unscheduled_urgent_tasks.slice(0, 3).map(row)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {data?.work_items?.total > 10 && (
                  <div className="agenda-pagination">
                    <button
                      type="button"
                      className="agenda-btn-minimal"
                      aria-label="Trang trước"
                      disabled={page <= 1 || resource.loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                      disabled={
                        data.work_items.page * 10 >= data.work_items.total || resource.loading
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                {(data?.upcoming_events || []).length > 0 && (
                  <div className="agenda-upcoming-section">
                    <div className="agenda-upcoming-header">
                      <span>Lịch hẹn sắp tới</span>
                      <button type="button" className="agenda-inline-link" onClick={() => onCalendar()}>
                        Xem lịch tuần <ArrowRight size={12} />
                      </button>
                    </div>
                    <div className="agenda-minimal-list">
                      {(data?.upcoming_events || []).slice(0, 3).map((item) => (
                        <button
                          type="button"
                          className="agenda-upcoming"
                          key={item.id}
                          onClick={() => onCalendar(item.starts_at)}
                        >
                          <span className="agenda-upcoming-body">
                            <strong>{cleanDemoText(item.title)}</strong>
                            <small>
                              <Clock3 size={11} />{' '}
                              {formatTimeRange(item.starts_at, item.ends_at, now)} ·{' '}
                              {cleanDemoText(item.customer_name) || 'Cá nhân'}
                              {item.location ? ` · ${item.location}` : ''}
                            </small>
                          </span>
                          <ChevronRight size={14} className="agenda-upcoming-chevron" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* DEEP ANALYTICS ACCORDION */}
          <details className="agenda-analytics-accordion">
            <summary className="agenda-analytics-summary">
              <div className="agenda-analytics-title">
                <BarChart3 size={16} />
                <span>Báo cáo phân tích chuyên sâu (Nhu cầu dòng xe &amp; Tần suất tương tác)</span>
              </div>
              <ChevronDown size={15} className="agenda-analytics-chevron" />
            </summary>

            <div className="agenda-analytics-body">
              <div className="agenda-bottom-grid" id="agenda-portfolio">
                <Panel title="Nhu cầu khách theo dòng xe">
                  <Bars
                    rows={(data?.model_interest || []).map((item) => ({
                      ...item,
                      key: item.model,
                    }))}
                    label={(item) => item.model}
                    selectedKey={selectedModel}
                    onSelect={(modelKey) => {
                      setSelectedModel(selectedModel === modelKey ? null : modelKey);
                      setSelectedStage(null);
                    }}
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
                    {(data?.message_activity || []).map((day, index) => (
                      <div
                        className="agenda-activity-day"
                        key={day.date}
                        title={`${day.date}: Khách ${day.customer}, Sales ${day.sales}`}
                      >
                        <span className="agenda-activity-total">
                          {day.customer + day.sales || ''}
                        </span>
                        <div className="agenda-activity-stack">
                          <span
                            className="sales"
                            style={{ height: `${(day.sales / activityMax) * 90}px` }}
                          />
                          <span
                            className="customer"
                            style={{ height: `${(day.customer / activityMax) * 90}px` }}
                          />
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
            </div>
          </details>
        </>
      )}
    </div>
  );
}
