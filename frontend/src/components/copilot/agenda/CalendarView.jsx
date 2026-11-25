import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { salesCopilotApi } from '../../../api/salesCopilotApi';
import { DetailDialog } from '../customerWorkspace/WorkspacePrimitives';
import { useWorkspaceClock } from '../customerWorkspace/useCustomerWorkspace';
import {
  addDays,
  dateKey,
  formatDateTime,
  itemLabel,
  layoutDay,
  cleanDemoText,
  localInput,
  mondayOf,
  taskState,
} from './agendaData';
import { useAgendaResource } from './agendaResource';

const emptyEvents = [];
const pixelsPerHour = 48;
const pixelsPerMinute = pixelsPerHour / 60;

const weekdays = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

function formatShortDate(isoDay) {
  if (!isoDay) return '';
  return isoDay.split('-').reverse().join('/');
}

export function CalendarView({
  currentUser,
  active,
  week,
  onWeekChange: setWeek,
  onCreate,
  onEdit,
  onCustomer,
  onTask,
}) {
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const scrollRef = useRef(null);
  const now = useWorkspaceClock();
  const today = dateKey(new Date(now).toISOString());
  const timeNow = localInput(new Date(now).toISOString())
    .slice(11)
    .split(':')
    .map(Number);

  const resource = useAgendaResource(
    currentUser.user_id,
    `calendar:${week}`,
    () => salesCopilotApi.getCalendar(week),
    active
  );

  const data = resource.data;
  const items = data?.items || emptyEvents;
  const days = useMemo(() => weekdays.map((label, index) => {
    const date = addDays(week, index);
    return { label, date, events: layoutDay(items, date) };
  }), [items, week]);

  useEffect(() => {
    if (!active || !scrollRef.current) return;
    const firstEvent = days.flatMap((day) => day.events)
      .reduce((earliest, event) => Math.min(earliest, event.top), 8 * 60);
    scrollRef.current.scrollTop = Math.max(0, firstEvent - 60) * pixelsPerMinute;
  }, [active, days]);

  const shown = selected && items.find((item) => item.id === selected.id);

  async function handleQuickComplete(item) {
    if (!item || busyId) return;
    setBusyId(item.id);
    setActionError('');
    try {
      await salesCopilotApi.updateTaskStatus(item.id, 'completed');
      setSelected(null);
    } catch (err) {
      setActionError(err.message || 'Không thể cập nhật trạng thái.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="agenda-page calendar-page" aria-label="Lịch sự kiện">
      <header className="agenda-calendar-heading">
        <div className="agenda-calendar-title-block">
          <h1>Lịch sự kiện</h1>
          <span className="agenda-updated" role="status">
            {resource.loading
              ? 'Đang tải lịch…'
              : data
                ? `${items.length} sự kiện trong tuần · Cập nhật ${formatDateTime(data.generated_at)}`
                : 'Chưa tải được lịch.'}
          </span>
        </div>
        <div className="agenda-calendar-actions">
          {onCreate && (
            <button
              type="button"
              className="sw-primary-button agenda-create-button"
              onClick={() => onCreate(data?.customers || [])}
            >
              <Plus size={15} />
              Tạo lịch
            </button>
          )}

          <button
            type="button"
            className="sw-secondary-button"
            aria-label="Làm mới lịch"
            title="Làm mới lịch"
            disabled={resource.loading}
            onClick={resource.reload}
          >
            <RefreshCw size={15} />
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

      <section className="agenda-week" aria-label="Lịch tuần">
        <div className="agenda-week-toolbar">
          <div className="agenda-week-navigation">
            <div className="agenda-calendar-nav-buttons">
              <button
                type="button"
                className="sw-secondary-button"
                aria-label="Tuần trước"
                onClick={() => setWeek(addDays(week, -7))}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={`sw-secondary-button ${week === mondayOf() ? 'is-current-week' : ''}`}
                onClick={() => setWeek(mondayOf())}
              >
                Hôm nay
              </button>
              <button
                type="button"
                className="sw-secondary-button"
                aria-label="Tuần sau"
                onClick={() => setWeek(addDays(week, 7))}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="agenda-calendar-range-badge">
              <CalendarIcon size={14} />
              <strong>
                {formatShortDate(week)} – {formatShortDate(addDays(week, 6))}
              </strong>
            </div>
            <label className="agenda-date-picker-label">
              <span>Chọn ngày</span>
              <input
                type="date"
                aria-label="Chọn ngày để xem tuần"
                value={week}
                onInput={(event) => {
                  if (event.target.value) setWeek(mondayOf(event.target.value));
                }}
                onChange={(event) => {
                  if (event.target.value) setWeek(mondayOf(event.target.value));
                }}
              />
            </label>
          </div>
          <div className="agenda-legend">
            <span>
              <i className="task" />
              Công việc
            </span>
            <span>
              <i className="appointment" />
              Lịch hẹn
            </span>
            <span>
              <Check size={12} />
              Hoàn thành
            </span>
          </div>
        </div>
        <div className="agenda-calendar-scroll" ref={scrollRef}>
          <div className="agenda-calendar-grid" style={{ '--calendar-hour': `${pixelsPerHour}px` }}>
            <div className="agenda-calendar-corner">
              <span>Giờ VN</span>
              <small>UTC+7</small>
            </div>

            {days.map(({ label, date: day, events }) => {
              const eventCount = events.length;
              const isToday = day === today;
              return (
                <div
                  className={`agenda-calendar-day-heading ${isToday ? 'is-today' : ''}`}
                  key={day}
                  aria-current={isToday ? 'date' : undefined}
                >
                  <div className="agenda-day-top-line">
                    <span className="agenda-day-name">{label}</span>
                    {eventCount > 0 && (
                      <span
                        className="agenda-day-count"
                        title={`${eventCount} sự kiện trong ngày ${day.slice(8)}/${day.slice(5, 7)}`}
                        aria-label={`${eventCount} sự kiện`}
                      >
                        {eventCount}
                      </span>
                    )}
                  </div>
                  <strong className="agenda-day-date">
                    {day.slice(8)}/{day.slice(5, 7)}
                  </strong>
                </div>
              );
            })}

            <div className="agenda-calendar-hours">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} style={{ top: hour * pixelsPerHour }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map(({ date: day, events }) => {
              const isToday = day === today;
              return (
                <div
                  className={`agenda-calendar-day ${isToday ? 'is-today' : ''}`}
                  key={day}
                  aria-label={day}
                >
                  {events.map(({ item, top, height: duration, column, columns }) => {
                    const height = duration * pixelsPerMinute;
                    const isCompact = height < 44;
                    const timeRange = `${formatDateTime(item.starts_at, false)}–${formatDateTime(item.ends_at, false)}`;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`agenda-calendar-event ${item.item_type} ${item.status === 'completed' ? 'is-completed' : ''} ${isCompact ? 'is-compact' : ''} ${height >= 72 ? 'can-wrap-title' : ''}`}
                        style={{
                          top: top * pixelsPerMinute,
                          height: Math.max(22, height),
                          left: `calc(${(column / columns) * 100}% + 3px)`,
                          width: `calc(${100 / columns}% - 6px)`,
                          zIndex: height < 35 ? 3 : 2,
                        }}
                        onClick={() => setSelected(item)}
                        title={`${cleanDemoText(item.title)} · ${formatDateTime(item.starts_at)} – ${formatDateTime(item.ends_at)} · ${itemLabel(item)}`}
                      >
                        {isCompact ? (
                          <div className="agenda-event-compact-row">
                            <span className="agenda-event-compact-time">
                              {formatDateTime(item.starts_at, false)}
                            </span>
                            <strong>
                              {item.status === 'completed' && <Check size={11} />}
                              {cleanDemoText(item.title)}
                            </strong>
                          </div>
                        ) : (
                          <>
                            <strong>
                              {item.status === 'completed' && <Check size={11} />}
                              {cleanDemoText(item.title)}
                            </strong>
                            <small className="agenda-event-time">{timeRange}</small>
                            {height >= 56 && (
                              <small className="agenda-event-sub">
                                {cleanDemoText(item.customer_name) || 'Cá nhân'} · {itemLabel(item)}
                              </small>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                  {isToday && (
                    <div
                      className="agenda-now-line"
                      style={{ top: timeNow[0] * pixelsPerHour + timeNow[1] * pixelsPerMinute }}
                      aria-label="Giờ hiện tại"
                    >
                      <span className="agenda-now-badge">
                        {String(timeNow[0]).padStart(2, '0')}:{String(timeNow[1]).padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* EVENT DETAIL DIALOG */}
      {shown && (
        <DetailDialog title={itemLabel(shown)} onClose={() => setSelected(null)}>
          <div className="agenda-event-detail-modal">
            <div className="agenda-event-badges-row">
              <span className={`agenda-state-badge ${shown.status === "completed" ? "is-done" : "is-active"}`}>
                {taskState(shown, now)}
              </span>
              <span className={`agenda-priority-badge is-${shown.priority}`}>
                Ưu tiên: {["high", "urgent"].includes(shown.priority) ? "Cao" : shown.priority === "low" ? "Thấp" : "Trung bình"}
              </span>
            </div>

            <h3 className="agenda-event-detail-title">{cleanDemoText(shown.title)}</h3>

            <div className="agenda-event-meta-card">
              <div className="agenda-meta-line">
                <Clock3 size={15} className="agenda-meta-icon" />
                <span>{formatDateTime(shown.starts_at)} – {formatDateTime(shown.ends_at)}</span>
              </div>
              <div className="agenda-meta-line">
                <UserRound size={15} className="agenda-meta-icon" />
                <span>{cleanDemoText(shown.customer_name) || "Cá nhân · Không gắn khách hàng"}</span>
              </div>
              {shown.location && (
                <div className="agenda-meta-line">
                  <MapPin size={15} className="agenda-meta-icon" />
                  <span>{shown.location}</span>
                </div>
              )}
            </div>

            {shown.description && (
              <div className="agenda-event-desc-card">
                <p>{shown.description}</p>
              </div>
            )}

            <div className="agenda-event-action-bar">
              {shown.status !== "completed" && (
                <button
                  type="button"
                  className="agenda-btn-action is-primary"
                  disabled={busyId === shown.id}
                  onClick={() => handleQuickComplete(shown)}
                >
                  <Check size={14} />
                  <span>Hoàn thành</span>
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className="agenda-btn-action is-secondary"
                  onClick={() => {
                    const target = shown;
                    setSelected(null);
                    onEdit(target);
                  }}
                >
                  <span>Sửa / Đổi giờ</span>
                </button>
              )}
              <button
                type="button"
                className="agenda-btn-action is-secondary"
                onClick={() => {
                  setSelected(null);
                  onTask(shown);
                }}
              >
                <span>Xem trên Dashboard</span>
              </button>
              {shown.conversation_id && (
                <button
                  type="button"
                  className="agenda-btn-action is-secondary"
                  onClick={() => {
                    setSelected(null);
                    onCustomer(shown);
                  }}
                >
                  <span>Mở khách hàng</span>
                </button>
              )}
            </div>
          </div>
        </DetailDialog>
      )}

    </div>
  );
}
