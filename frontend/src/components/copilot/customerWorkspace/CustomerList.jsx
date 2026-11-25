import { useState } from 'react';
import { Search, ChevronDown, Inbox, AlertCircle, Sparkles, Check, RefreshCw, X, Clock } from 'lucide-react';
import { Avatar, StageBadge } from './WorkspacePrimitives';
import { filterCustomers } from './workspaceData';

const QUEUE_FILTERS = [
  { id: 'attention', label: 'Cần chú ý' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'active', label: 'Đang chăm sóc' },
  { id: 'all', label: 'Tất cả' },
  { id: 'won', label: 'Đã chốt' },
  { id: 'lost', label: 'Ngừng CS' },
];

const SORT_OPTIONS = [
  { id: 'urgency', label: 'Khẩn cấp' },
  { id: 'waiting', label: 'Chờ lâu nhất' },
  { id: 'recent', label: 'Tin mới nhất' },
  { id: 'deadline', label: 'Hạn công việc' },
];

export function CustomerList({
  customers,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  status,
  error,
  onRetry,
  analysisIds = {},
  batchProgress = null,
  onAnalyzeBatch,
  onCancelBatch,
}) {
  const [sort, setSort] = useState('urgency');
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState({});

  const filtered = filterCustomers(customers, query, filter, sort);
  const analyzable = customers.filter((customer) => customer.messageTotal > 0);
  const unprocessed = analyzable.filter((customer) => customer.pendingAnalysis > 0 || customer.requiresReanalysis);
  const selectedIds = analyzable.filter((customer) => checked[customer.id]).map((customer) => customer.id);
  const allUnprocessedSelected = unprocessed.length > 0 && unprocessed.every((customer) => checked[customer.id]);
  const isAllSelected = analyzable.length > 0 && analyzable.every((customer) => checked[customer.id]);
  const processed = batchProgress ? batchProgress.completed + batchProgress.skipped + batchProgress.failures.length : 0;

  // Counts for each tab
  const counts = {
    attention: customers.filter((c) => c.attention).length,
    today: customers.filter((c) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      return (c.tasks || []).some((t) => t.starts_at?.startsWith(todayStr)) || c.attention;
    }).length,
    active: customers.filter((c) => ['new', 'discovery', 'qualified', 'considering', 'negotiating', 'deposit_process'].includes(c.stageId)).length,
    all: customers.length,
    won: customers.filter((c) => c.stageId === 'won').length,
    lost: customers.filter((c) => c.stageId === 'lost').length,
  };

  function toggleSelectAll() {
    if (isAllSelected) {
      setChecked({});
    } else {
      setChecked(Object.fromEntries(analyzable.map((c) => [c.id, true])));
    }
  }

  function toggleRow(id) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSelectAllUnprocessed() {
    if (allUnprocessedSelected) {
      setChecked({});
    } else {
      setChecked(Object.fromEntries(unprocessed.map((customer) => [customer.id, true])));
    }
  }

  function startBatch(ids) {
    if (!ids.length) return;
    setSelecting(false);
    setChecked({});
    onAnalyzeBatch?.(ids);
  }

  return (
    <section className="sw-customer-list" aria-label="Hộp thư khách hàng">
      <div className="sw-list-heading">
        <div className="sw-list-title-wrap">
          <h2>Hộp thư</h2>
          <span className="sw-active-customers-badge">{filtered.length} / {counts.all} khách hàng</span>
        </div>
        {!batchProgress?.running && analyzable.length > 0 && !error && (
          selecting ? (
            <button
              type="button"
              className="sw-select-cancel-pill"
              onClick={() => { setSelecting(false); setChecked({}); }}
            >
              Hủy
            </button>
          ) : (
            <button
              type="button"
              className={`sw-batch-trigger ${unprocessed.length > 0 ? 'has-pending' : ''}`}
              onClick={() => { setSelecting(true); setChecked(Object.fromEntries(unprocessed.map((customer) => [customer.id, true]))); }}
              title="Chọn hội thoại để AI phân tích hàng loạt"
            >
              <Sparkles size={13} />
              <span>{unprocessed.length > 0 ? `AI (${unprocessed.length})` : 'AI'}</span>
            </button>
          )
        )}
      </div>

      {/* BATCH PROGRESS BAR */}
      {batchProgress?.running && (
        <div className="sw-batch-progress" role="status" aria-live="polite">
          <div className="sw-batch-progress-top">
            <span>
              <RefreshCw size={12} className="sw-spin" /> {batchProgress.cancelled ? 'Đang dừng' : 'Đang phân tích'} · {processed}/{batchProgress.total}
              {batchProgress.currentLabel ? ` · ${batchProgress.currentLabel}` : '…'}
            </span>
            <button type="button" className="sw-text-button" disabled={batchProgress.cancelled} onClick={onCancelBatch}>
              Dừng
            </button>
          </div>
          <progress aria-label="Tiến độ phân tích khách hàng" value={processed} max={batchProgress.total} />
        </div>
      )}

      {batchProgress && !batchProgress.running && !selecting && (
        <div className="sw-batch-progress" role="status">
          <span>
            {batchProgress.completed}/{batchProgress.total} khách đã phân tích
            {batchProgress.failures.length > 0 && ` · ${batchProgress.failures.length} lỗi`}
            {batchProgress.skipped > 0 && ` · ${batchProgress.skipped} chưa có tin nhắn`}
            {batchProgress.cancelled && ` · ${batchProgress.total - processed} chưa chạy`}
          </span>
          {batchProgress.failures.length > 0 && (
            <>
              <details>
                <summary>Xem lỗi</summary>
                <ul>{batchProgress.failures.map(({ id, name, message }) => <li key={id}>{name} · {message}</li>)}</ul>
              </details>
              <button type="button" className="sw-text-button" onClick={() => startBatch(batchProgress.failures.map(({ id }) => id))}>
                Thử lại các khách bị lỗi
              </button>
            </>
          )}
        </div>
      )}

      {/* SELECTION BAR WHEN SELECTING MULTIPLE CUSTOMERS */}
      {selecting && !batchProgress?.running && (
        <div className="sw-selection-bar" role="region" aria-label="Tùy chọn phân tích hàng loạt">
          <div className="sw-selection-bar-header">
            <div className="sw-selection-bar-actions">
              <button type="button" className="sw-select-all-pill" onClick={toggleSelectAll}>
                <span className={`sw-row-checkbox ${isAllSelected ? 'is-checked' : ''}`}>
                  {isAllSelected && <Check size={11} />}
                </span>
                <span>{isAllSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${analyzable.length})`}</span>
              </button>
              {unprocessed.length > 0 && (
                <button type="button" className="sw-select-all-pill is-secondary" onClick={toggleSelectAllUnprocessed}>
                  <span className={`sw-row-checkbox ${allUnprocessedSelected ? 'is-checked' : ''}`}>
                    {allUnprocessedSelected && <Check size={11} />}
                  </span>
                  <span>Cần phân tích ({unprocessed.length})</span>
                </button>
              )}
            </div>
            {selectedIds.length > 0 && (
              <span className="sw-selected-count-badge">Đã chọn {selectedIds.length}</span>
            )}
          </div>
          <button
            type="button"
            className="sw-selection-run-btn"
            disabled={selectedIds.length === 0}
            onClick={() => startBatch(selectedIds)}
          >
            <Sparkles size={14} />
            <span>
              {selectedIds.length > 0
                ? `Phân tích ${selectedIds.length} khách đã chọn`
                : 'Chọn ít nhất 1 khách để phân tích'}
            </span>
          </button>
        </div>
      )}

      {/* 2. SEARCH INPUT WITH CLEAR BUTTON */}
      <div className="sw-list-search-row">
        <label className="sw-search sw-list-search">
          <Search size={15} />
          <input
            aria-label="Tìm kiếm khách hàng theo tên, điện thoại, xe"
            placeholder="Tìm tên, số ĐT, dòng xe..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="sw-search-clear-btn"
              onClick={() => onQueryChange('')}
              aria-label="Xóa tìm kiếm"
            >
              <X size={13} />
            </button>
          )}
        </label>
      </div>

      <div className="sw-inbox-controls">
        <label>
          <span>Trạng thái</span>
          <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
            {QUEUE_FILTERS.map(({ id, label }) => (
              <option key={id} value={id}>{label} ({counts[id]})</option>
            ))}
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>
        <label>
          <span>Sắp xếp</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORT_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>
      </div>

      {/* 5. CUSTOMER ROWS LIST */}
      <div className="sw-customer-rows">
        {status === 'loading' && !customers.length ? (
          <div className="sw-loading-state" role="status" aria-label="Đang tải khách hàng">
            {[1, 2, 3, 4, 5].map((id) => (
              <div className="sw-skeleton" key={id} />
            ))}
          </div>
        ) : error ? (
          <div className="sw-empty" role="alert">
            <Inbox size={26} />
            <strong>Chưa tải được khách hàng</strong>
            <p>{error}</p>
            <button type="button" className="sw-text-button" onClick={onRetry}>
              Thử lại
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="sw-empty">
            <Inbox size={26} />
            <strong>{customers.length ? 'Không có khách phù hợp' : 'Chưa có khách hàng'}</strong>
            <p>{customers.length ? 'Thử đổi từ khóa hoặc bộ lọc hàng chờ.' : 'Khách hàng sẽ hiển thị tại đây.'}</p>
            {customers.length > 0 && (
              <button
                type="button"
                className="sw-text-button"
                onClick={() => {
                  onQueryChange('');
                  onFilterChange('all');
                }}
              >
                Xem tất cả khách hàng
              </button>
            )}
          </div>
        ) : (
          filtered.map((customer) => {
            const latest = customer.messages.at(-1);
            const isAnalyzing = Boolean(analysisIds[customer.id]);
            const isChecked = Boolean(checked[customer.id]);
            const isSelected = !selecting && selectedId === customer.id;
            const primaryModel = customer.primaryModel ? `VF ${customer.primaryModel}` : customer.model || 'VinFast';
            const isUnread = customer.attention && customer.attentionReason?.includes('chờ phản hồi');
            const isOverdue = customer.attention && customer.attentionReason?.includes('quá hạn');

            return (
              <button
                key={customer.id}
                type="button"
                className={`sw-customer-row ${isSelected ? 'is-selected' : ''} ${selecting && isChecked ? 'is-checked-row' : ''}`}
                onClick={() => (selecting ? toggleRow(customer.id) : onSelect(customer.id))}
                disabled={selecting && !customer.messageTotal}
                aria-pressed={selecting ? isChecked : isSelected}
              >
                {selecting && (
                  <span className={`sw-row-checkbox ${isChecked ? 'is-checked' : ''}`} aria-hidden="true">
                    {isChecked && <Check size={11} />}
                  </span>
                )}

                <div className="sw-avatar-col">
                  <Avatar customer={customer} />
                </div>

                <div className="sw-customer-row-content">
                  {/* ROW 1: NAME + MODEL BADGE + TIME */}
                  <div className="sw-customer-row-top">
                    <div className="sw-name-badge-group">
                      <strong className="sw-customer-name-text">{customer.name}</strong>
                      {primaryModel && <span className="sw-vehicle-model-pill">{primaryModel}</span>}
                    </div>
                    <time className="sw-time-stamp">{latest?.time || customer.lastMessageTime || customer.time}</time>
                  </div>

                  {/* ROW 2: LAST MESSAGE PREVIEW */}
                  <p className="sw-message-preview">
                    {latest?.role === 'sales' ? <span className="sw-sales-prefix">Bạn: </span> : ''}
                    {latest?.content || customer.preview}
                  </p>

                  {/* ROW 3: STAGE BADGE + URGENCY INDICATORS */}
                  <div className="sw-row-status">
                    {isAnalyzing ? (
                      <span className="sw-analyzing-pill">
                        <RefreshCw size={10} className="sw-spin" /> Đang phân tích…
                      </span>
                    ) : (
                      <>
                        <StageBadge customer={customer} />
                        {isUnread && (
                          <span className="sw-urgent-tag is-waiting">
                            <Clock size={10} /> Chờ trả lời
                          </span>
                        )}
                        {isOverdue && (
                          <span className="sw-urgent-tag is-overdue">
                            <AlertCircle size={10} /> Quá hạn
                          </span>
                        )}
                        {customer.pendingAnalysis > 0 && (
                          <span className="sw-unprocessed-pill">+{customer.pendingAnalysis}</span>
                        )}
                        {customer.requiresReanalysis && !customer.pendingAnalysis && (
                          <span className="sw-unprocessed-pill">Cần cập nhật</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
