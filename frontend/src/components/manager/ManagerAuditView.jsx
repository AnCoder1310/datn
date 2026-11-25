import { useState } from 'react';
import { managerApi } from '../../api/managerApi';
import { useLoad } from '../../hooks/useLoad';
import { ShieldCheckIcon, RefreshIcon } from '../common/Icons';

const ACTION_LABELS = {
  SCORE_OVERRIDE: { label: 'Sửa điểm AI', color: 'var(--color-text-primary)', bg: 'var(--color-white)' },
  REVIEW_APPROVED: { label: 'Duyệt bài thi', color: 'var(--color-text-primary)', bg: 'var(--color-white)' },
  ASSIGNMENT_CREATED: { label: 'Giao bài tập', color: 'var(--color-text-primary)', bg: 'var(--color-white)' },
  SCENARIO_CREATED: { label: 'Tạo kịch bản', color: 'var(--color-text-primary)', bg: 'var(--color-white)' },
  SCENARIO_GENERATED: { label: 'AI sinh kịch bản', color: 'var(--color-text-primary)', bg: 'var(--color-white)' },
};

function formatDateTime(val) {
  if (!val) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(val));
}

export function ManagerAuditView() {
  const [actionFilter, setActionFilter] = useState('');
  const { data, status: requestStatus, error, reload: loadLogs } = useLoad(
    async () => {
      const response = await managerApi.getAuditLogs({ action: actionFilter || null, pageSize: 50 });
      return { filter: actionFilter, items: response.items || [] };
    }, actionFilter, 'Không thể tải nhật ký kiểm toán.',
  );
  const matchesFilter = data?.filter === actionFilter;
  const logs = matchesFilter ? data.items : [];
  const status = !matchesFilter && !error ? 'loading' : requestStatus;

  return (
    <section className="md-panel" aria-labelledby="audit-title">
      <div className="md-panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 id="audit-title" className="md-panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheckIcon style={{ width: 22, height: 22, color: 'var(--color-text-primary)' }} />
            Nhật ký kiểm toán
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', margin: '4px 0 0 0' }}>
            Lưu vết bất biến mọi hành động can thiệp sửa điểm, duyệt bài, giao bài và tạo kịch bản của quản lý.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            aria-label="Lọc hành động kiểm toán"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px' }}
          >
            <option value="">Tất cả hành động</option>
            <option value="SCORE_OVERRIDE">Sửa điểm AI (Score Override)</option>
            <option value="REVIEW_APPROVED">Duyệt bài thi (Approved)</option>
            <option value="ASSIGNMENT_CREATED">Giao bài tập (Assignment)</option>
            <option value="SCENARIO_CREATED">Tạo kịch bản (Scenario Create)</option>
            <option value="SCENARIO_GENERATED">AI sinh kịch bản (Scenario AI)</option>
          </select>

          <button
            type="button"
            className="md-btn md-btn--outline"
            onClick={loadLogs}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshIcon style={{ width: 14, height: 14 }} /> Làm mới
          </button>
        </div>
      </div>

      {status === 'loading' && <p className="md-state">Đang tải nhật ký kiểm toán...</p>}
      {status === 'error' && (
        <p className="md-state md-state--error">
          {error} <button type="button" className="md-link-btn" onClick={loadLogs}>Thử lại</button>
        </p>
      )}

      {status === 'ready' && logs.length === 0 && (
        <p className="md-state">Chưa có bản ghi kiểm toán nào phù hợp với bộ lọc.</p>
      )}

      {status === 'ready' && logs.length > 0 && (
        <div className="md-table-scroll" style={{ marginTop: '16px' }}>
          <table className="md-queue">
            <thead>
              <tr>
                <th scope="col" style={{ width: '160px' }}>Thời gian</th>
                <th scope="col" style={{ width: '130px' }}>Người thực hiện</th>
                <th scope="col" style={{ width: '150px' }}>Hành động</th>
                <th scope="col">Chi tiết tác động</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const badge = ACTION_LABELS[log.action] || { label: log.action, color: 'var(--color-text-secondary)', bg: 'var(--color-white)' };
                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatDateTime(log.created_at)}</td>
                    <td style={{ fontWeight: 600 }}>{log.actor_id}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: badge.color,
                        background: badge.bg,
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px' }}>{log.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
