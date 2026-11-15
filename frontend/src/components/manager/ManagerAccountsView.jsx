import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { managerApi } from '../../api/managerApi';
import { fmtScore } from '../../utils/scoreFormat';

export function ManagerAccountsView() {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const [advisors, setAdvisors] = useState([]);
  const [listStatus, setListStatus] = useState('loading');
  const [listError, setListError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAdvisors = async () => {
    setListStatus('loading');
    setListError('');
    try {
      const data = await managerApi.getAdvisors();
      setAdvisors(data || []);
      setListStatus('ready');
    } catch (err) {
      setListError(err.message || 'Không thể tải danh sách tư vấn viên.');
      setListStatus('error');
    }
  };

  useEffect(() => {
    loadAdvisors();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setCreated(null);
    if (!displayName.trim() || !username.trim() || password.length < 12) {
      setError('Vui lòng nhập họ tên, tên đăng nhập và mật khẩu ít nhất 12 ký tự.');
      return;
    }
    setStatus('saving');
    try {
      const account = await managerApi.createAdvisor({
        displayName: displayName.trim(),
        username: username.trim(),
        password,
      });
      setCreated(account);
      setDisplayName('');
      setUsername('');
      setPassword('');
      setStatus('ready');

      // Thêm tư vấn viên mới vào danh sách ngay lập tức
      setAdvisors((prev) => [
        {
          advisor_id: account.username || username.trim(),
          display_name: account.display_name || displayName.trim(),
          completed_sessions: 0,
          approved_sessions: 0,
          average_score: null,
          rank: null,
        },
        ...prev,
      ]);
    } catch (createError) {
      setError(
        createError.status === 409
          ? 'Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.'
          : createError.message || 'Không thể tạo tài khoản. Vui lòng thử lại.'
      );
      setStatus('error');
    }
  };

  const filteredAdvisors = advisors.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.display_name?.toLowerCase().includes(q) ||
      item.advisor_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="manager-accounts-page">
      {/* 1. TOP HEADER & SUMMARY STATS */}
      <header className="manager-accounts-header">
        <div className="manager-accounts-header-titles">
          <h1>Quản lý tài khoản đội ngũ</h1>
          <p>Cấp quyền và quản lý tài khoản tư vấn viên trong hệ thống VinFast AI Sales.</p>
        </div>

        <div className="manager-accounts-header-stats">
          <div className="manager-accounts-stat-chip">
            <UsersRound size={15} />
            <span>Tổng số: <strong>{advisors.length}</strong> tư vấn viên</span>
          </div>
          <div className="manager-accounts-stat-chip is-active">
            <span className="manager-accounts-dot" />
            <span>100% Hoạt động</span>
          </div>
        </div>
      </header>

      {/* 2. BALANCED TWO-COLUMN WORKSPACE */}
      <div className="manager-accounts-grid">
        {/* LEFT COLUMN: CREATE ACCOUNT FORM */}
        <section className="manager-accounts-card manager-account-form-card">
          <div className="manager-accounts-card-head">
            <div className="manager-card-head-title">
              <UserPlus size={18} className="manager-card-icon" />
              <div>
                <h2>Tạo tài khoản mới</h2>
                <p>Cấp quyền truy cập vai trò Tư vấn viên (Advisor)</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="manager-queue-error" role="alert">
              {error}
            </div>
          )}

          {created && (
            <div className="manager-account-success-banner" role="status">
              <CheckCircle2 size={16} />
              <span>
                Đã tạo thành công <strong>{created.display_name}</strong> ({created.username}). Bắt buộc đổi mật khẩu ở lần đăng nhập đầu.
              </span>
            </div>
          )}

          <form className="manager-account-form" onSubmit={submit}>
            <div className="manager-form-field">
              <label htmlFor="advisor-name">Họ tên tư vấn viên</label>
              <div className="manager-input-wrap">
                <User size={15} className="manager-input-icon" />
                <input
                  id="advisor-name"
                  placeholder="VD: Lê Thu Hà"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="off"
                  maxLength={200}
                  disabled={status === 'saving'}
                  required
                />
              </div>
            </div>

            <div className="manager-form-field">
              <label htmlFor="advisor-username">Tên đăng nhập</label>
              <div className="manager-input-wrap">
                <input
                  id="advisor-username"
                  placeholder="VD: advisor.ha"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  maxLength={120}
                  disabled={status === 'saving'}
                  required
                />
              </div>
            </div>

            <div className="manager-form-field">
              <label htmlFor="advisor-password">Mật khẩu khởi tạo</label>
              <div className="manager-input-wrap">
                <KeyRound size={15} className="manager-input-icon" />
                <input
                  id="advisor-password"
                  type="password"
                  placeholder="Tối thiểu 12 ký tự"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={1024}
                  disabled={status === 'saving'}
                  required
                />
              </div>
              <small className="manager-form-hint">
                Tư vấn viên sẽ bắt buộc phải đổi mật khẩu ngay sau lần đăng nhập đầu tiên.
              </small>
            </div>

            <button
              type="submit"
              className="manager-btn-primary"
              disabled={status === 'saving'}
            >
              <Plus size={15} strokeWidth={2.2} />
              <span>{status === 'saving' ? 'Đang tạo…' : 'Tạo tài khoản Advisor'}</span>
            </button>
          </form>
        </section>

        {/* RIGHT COLUMN: TEAM DIRECTORY TABLE */}
        <section className="manager-accounts-card manager-account-list-card">
          <div className="manager-accounts-card-head is-between">
            <div className="manager-card-head-title">
              <UsersRound size={18} className="manager-card-icon" />
              <div>
                <h2>Danh sách tư vấn viên ({advisors.length})</h2>
                <p>Toàn bộ tài khoản tư vấn viên đang hoạt động trong hệ thống</p>
              </div>
            </div>

            <button
              type="button"
              className="manager-btn-minimal"
              onClick={loadAdvisors}
              disabled={listStatus === 'loading'}
              title="Làm mới danh sách"
            >
              <RefreshCw size={13} />
              <span>Làm mới</span>
            </button>
          </div>

          {/* SEARCH BAR */}
          <div className="manager-accounts-search-bar">
            <Search size={15} className="manager-search-icon" />
            <input
              type="text"
              placeholder="Tìm kiếm theo họ tên hoặc mã tài khoản…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="manager-search-clear"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* TABLE */}
          {listStatus === 'loading' && (
            <p className="manager-state-loading" role="status">Đang tải danh sách tư vấn viên…</p>
          )}

          {listStatus === 'error' && (
            <div className="manager-queue-error" role="alert">
              {listError}
              <button type="button" className="manager-btn-retry" onClick={loadAdvisors}>
                Thử lại
              </button>
            </div>
          )}

          {listStatus === 'ready' && filteredAdvisors.length === 0 && (
            <p className="manager-state-empty">
              {searchQuery ? 'Không tìm thấy tư vấn viên phù hợp.' : 'Chưa có tài khoản tư vấn viên nào.'}
            </p>
          )}

          {listStatus === 'ready' && filteredAdvisors.length > 0 && (
            <div className="manager-table-wrap">
              <table className="manager-accounts-table">
                <thead>
                  <tr>
                    <th scope="col">Tư vấn viên</th>
                    <th scope="col">Tên đăng nhập</th>
                    <th scope="col" className="text-center">Bài luyện</th>
                    <th scope="col" className="text-center">Điểm TB</th>
                    <th scope="col" className="text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdvisors.map((advisor) => {
                    const initials = advisor.display_name
                      ? advisor.display_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(-2)
                          .join('')
                          .toUpperCase()
                      : 'TV';

                    return (
                      <tr key={advisor.advisor_id}>
                        <td>
                          <div className="manager-advisor-identity">
                            <span className="manager-advisor-avatar">{initials}</span>
                            <div className="manager-advisor-names">
                              <strong>{advisor.display_name}</strong>
                              <span className="manager-role-tag">Advisor</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code className="manager-username-code">{advisor.advisor_id}</code>
                        </td>
                        <td className="text-center">
                          <span className="manager-sessions-val">
                            {advisor.completed_sessions || 0} bài
                          </span>
                        </td>
                        <td className="text-center">
                          <strong className="manager-score-val">
                            {advisor.average_score != null
                              ? `${fmtScore(advisor.average_score)} / 3`
                              : '—'}
                          </strong>
                        </td>
                        <td className="text-right">
                          <span className="manager-status-badge">
                            <span className="manager-status-dot" />
                            Hoạt động
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
