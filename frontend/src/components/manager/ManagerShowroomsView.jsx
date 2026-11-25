import { RefreshCw, MapPin } from 'lucide-react';
import { managerApi } from '../../api/managerApi';
import { useLoad } from '../../hooks/useLoad';

export function ManagerShowroomsView() {
  const load = useLoad(managerApi.getShowrooms, 'manager-showrooms', 'Không thể tải danh sách showroom.');
  const showrooms = load.data || [];
  return (
    <section className="manager-accounts-page" aria-labelledby="manager-showrooms-title">
      <header className="manager-accounts-header">
        <div className="manager-accounts-header-titles">
          <h1 id="manager-showrooms-title">Showroom &amp; khu vực</h1>
          <p>Danh sách showroom đang đủ điều kiện tiếp nhận yêu cầu mới.</p>
        </div>
        <button type="button" className="manager-btn-secondary" onClick={load.reload} disabled={load.status === 'loading'}>
          <RefreshCw size={15} /> Làm mới
        </button>
      </header>
      {load.status === 'loading' && <p className="md-state">Đang tải…</p>}
      {load.status === 'error' && <p className="md-state md-state--error" role="alert">{load.error}</p>}
      {load.status === 'ready' && (
        <div className="manager-accounts-grid">
          {showrooms.map((showroom) => (
            <article key={showroom.id} className="manager-accounts-card">
              <div className="manager-card-head-title"><MapPin size={18} className="manager-card-icon" /><div><h2>{showroom.name}</h2><p>{showroom.address || 'Chưa có địa chỉ'}</p></div></div>
              <div className="manager-accounts-stat-chip is-active">Đang hoạt động</div>
            </article>
          ))}
          {!showrooms.length && <p className="md-state">Chưa có showroom đang hoạt động.</p>}
        </div>
      )}
    </section>
  );
}
