import { useEffect, useState } from 'react';
import { Edit3, KeyRound, Save } from 'lucide-react';
import { practiceApi } from '../../api/practiceApi';
import { salesCopilotApi } from '../../api/salesCopilotApi';
import { DetailDialog } from '../copilot/customerWorkspace/WorkspacePrimitives';
import { CRITERIA, fmtDelta, fmtScore, initialsOf } from '../../utils/scoreFormat';
import './profile.css';

const blankDetails = { role: '', phone: '', email: '', showroom: '', motto: '' };
const emptyPassword = { currentPw: '', newPw: '', confirmPw: '' };
const historyLabels = {
  ai_draft: 'Bản nháp AI',
  pending_manager_review: 'Chờ quản lý duyệt',
  manager_approved: 'Đã duyệt',
};
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function ProfileView({ currentUser, onUpdateProfile, onOpenRoleplay, onChangePassword }) {
  const storageKey = `vinfast_profile_custom:${currentUser.user_id}`;
  const [details, setDetails] = useState(() => {
    try {
      return { ...blankDetails, ...JSON.parse(localStorage.getItem(storageKey) || '{}') };
    } catch {
      return blankDetails;
    }
  });
  const [editForm, setEditForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [toast, setToast] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwForm, setPwForm] = useState(emptyPassword);
  const [pwStatus, setPwStatus] = useState({ loading: false, error: '' });
  const [summary, setSummary] = useState(null);
  const [reload, setReload] = useState(0);
  const name = currentUser.display_name || currentUser.username;

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      practiceApi.getProgress(),
      practiceApi.getHistory(),
      salesCopilotApi.getDashboard({ work_page: 1 }),
    ]).then(([progress, history, dashboard]) => {
      if (active) setSummary({ progress, history, dashboard });
    });
    return () => { active = false; };
  }, [reload]);

  async function handleSaveProfile(event) {
    event.preventDefault();
    if (savingProfile) return;
    if (!editForm.name.trim()) {
      setProfileError('Vui lòng nhập họ tên.');
      return;
    }
    setSavingProfile(true);
    setProfileError('');
    try {
      await onUpdateProfile({ name: editForm.name.trim() });
      const { role, phone, email, showroom, motto } = editForm;
      const updated = { role, phone, email, showroom, motto };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setDetails(updated);
        setToast('Đã lưu hồ sơ.');
        setEditForm(null);
      } catch {
        setProfileError('Tên hiển thị đã được lưu. Trình duyệt chưa lưu được các trường trên thiết bị.');
      }
    } catch (error) {
      setProfileError(error.message || 'Chưa lưu được hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  }

  function setIsEditing(value) {
    if (!value && !savingProfile) setEditForm(null);
  }

  async function handleChangePasswordSubmit(event) {
    event.preventDefault();
    if (pwStatus.loading) return;
    if (pwForm.newPw !== pwForm.confirmPw || pwForm.newPw.length < 12 || pwForm.newPw === pwForm.currentPw) {
      setPwStatus({ loading: false, error: 'Mật khẩu mới phải khác mật khẩu cũ, có ít nhất 12 ký tự và khớp với ô xác nhận.' });
      return;
    }
    setPwStatus({ loading: true, error: '' });
    try {
      await onChangePassword(pwForm.currentPw, pwForm.newPw);
    } catch (error) {
      setPwStatus({ loading: false, error: error.message || 'Chưa đổi được mật khẩu.' });
    }
  }

  function closePassword() {
    if (pwStatus.loading) return;
    setShowPasswordModal(false);
    setPwForm(emptyPassword);
    setPwStatus({ loading: false, error: '' });
  }

  const progress = summary?.progress.value;
  const kpis = summary?.dashboard.value?.kpis;
  const history = summary?.history.value?.slice(0, 4) ?? [];
  const hasError = summary && Object.values(summary).some(({ status }) => status === 'rejected');

  return (
    <div className="vf-profile-container">
      {toast && <p className="vf-profile-feedback" role="status">{toast}</p>}
      <header className="vf-account-header">
        <span className="vf-account-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="vf-account-identity">
          <h1>{name}</h1>
          <p>{details.role || 'Tư vấn viên'} · {currentUser.username}</p>
        </div>
        <div className="vf-account-actions">
          <button type="button" className="vf-btn-hero is-secondary" onClick={() => setShowPasswordModal(true)}><KeyRound size={16} /> Đổi mật khẩu</button>
          <button type="button" className="vf-btn-hero is-primary" onClick={() => {
            setProfileError('');
            setEditForm({ ...details, name });
          }}><Edit3 size={16} /> Chỉnh sửa hồ sơ</button>
        </div>
      </header>

      <section className="vf-panel" aria-labelledby="profile-contact">
        <h2 id="profile-contact">Thông tin cá nhân</h2>
        <dl className="vf-account-details">
          <div><dt>Đại lý / Showroom</dt><dd>{details.showroom || 'Chưa cập nhật'}</dd></div>
          <div><dt>Email công vụ</dt><dd>{details.email || 'Chưa cập nhật'}</dd></div>
          <div><dt>Điện thoại</dt><dd>{details.phone || 'Chưa cập nhật'}</dd></div>
          {details.motto && <div><dt>Châm ngôn tư vấn</dt><dd>{details.motto}</dd></div>}
        </dl>
      </section>

      {!summary && <p role="status">Đang tải hoạt động và chỉ số…</p>}
      {hasError && <div className="vf-profile-feedback" role="alert">
        Một phần dữ liệu hồ sơ chưa tải được. <button type="button" className="vf-btn-cancel" onClick={() => { setSummary(null); setReload((value) => value + 1); }}>Thử lại</button>
      </div>}

      <section className="vf-panel" aria-labelledby="profile-metrics">
        <h2 id="profile-metrics">Tổng quan hoạt động</h2>
        <dl className="vf-account-details vf-account-metrics">
          <div><dt>Điểm luyện tập đã duyệt</dt><dd>{progress?.overall_avg == null ? '—' : `${fmtScore(progress.overall_avg)} / 3`}</dd></div>
          <div><dt>Bài quản lý đã duyệt</dt><dd>{progress?.approved_sessions ?? '—'}</dd></div>
          <div><dt>Khách hàng đang chăm sóc</dt><dd>{kpis?.active_customers ?? '—'}</dd></div>
          <div><dt>Ngân sách khách trong phễu</dt><dd>{kpis?.pipeline_budget_vnd == null ? '—' : currency.format(kpis.pipeline_budget_vnd)}</dd></div>
        </dl>
      </section>

      <div className="vf-account-columns">
        <section className="vf-panel" aria-labelledby="profile-skills">
          <h2 id="profile-skills">Kỹ năng bán hàng</h2>
          <p className="vf-panel-desc">Điểm trung bình từ các bài luyện tập đã được quản lý duyệt.</p>
          <dl className="vf-account-skill-list">
            {CRITERIA.map(({ key, label }) => {
              const skill = progress?.criteria?.[key];
              return <div key={key}><dt>{label}</dt><dd>{skill?.latest_avg == null ? 'Chưa có điểm' : `${fmtScore(skill.latest_avg)} / 3`}{skill?.change_4w != null && <small>{fmtDelta(skill.change_4w)} trong 4 tuần</small>}</dd></div>;
            })}
          </dl>
        </section>
        <section className="vf-panel" aria-labelledby="profile-certificates">
          <h2 id="profile-certificates">Chứng chỉ và huy hiệu</h2>
          <p className="vf-panel-desc">Chưa có dữ liệu chứng chỉ từ hệ thống.</p>
        </section>
      </div>

      <section className="vf-panel" aria-labelledby="profile-history">
        <div className="vf-panel-head">
          <h2 id="profile-history">Luyện tập gần đây</h2>
          <button type="button" className="vf-btn-panel-action" onClick={onOpenRoleplay}>Mở phòng luyện tập</button>
        </div>
        {history.length > 0 ? <div className="vf-history-table-wrap">
          <table className="vf-history-table">
            <thead><tr><th scope="col">Tình huống</th><th scope="col">Hoàn thành</th><th scope="col">Điểm</th><th scope="col">Trạng thái duyệt</th></tr></thead>
            <tbody>{history.map((item) => <tr key={item.session_id}>
              <td>{item.scenario_title || item.scenario_id}</td>
              <td>{item.completed_at ? new Date(item.completed_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</td>
              <td>{fmtScore(item.approved_score ?? item.ai_score)}</td>
              <td>{historyLabels[item.review_status] || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div> : summary?.history.status === 'fulfilled' && <p className="vf-panel-desc">Chưa có lịch sử luyện tập.</p>}
      </section>

      {editForm && <DetailDialog title="Chỉnh sửa hồ sơ" onClose={() => setIsEditing(false)}>
            <form onSubmit={handleSaveProfile} className="vf-modal-form">
              {profileError && <p className="vf-form-alert" role="alert">{profileError}</p>}
              <fieldset disabled={savingProfile} className="vf-profile-fields">
              <div className="vf-form-row">
                <div className="vf-form-group">
                  <label htmlFor="pf-name">Họ và tên</label>
                  <input
                    id="pf-name"
                    type="text"
                    value={editForm.name}
                    maxLength={200}
                    required
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}

                  />
                </div>
                <div className="vf-form-group">
                  <label htmlFor="pf-role">Chức danh</label>
                  <input
                    id="pf-role"
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}

                  />
                </div>
              </div>

              <div className="vf-form-row">
                <div className="vf-form-group">
                  <label htmlFor="pf-phone">Số điện thoại</label>
                  <input
                    id="pf-phone"
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}

                  />
                </div>
                <div className="vf-form-group">
                  <label htmlFor="pf-email">Email công vụ</label>
                  <input
                    id="pf-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}

                  />
                </div>
              </div>

              <div className="vf-form-group">
                <label htmlFor="pf-showroom">Đại lý / Showroom làm việc</label>
                <input
                  id="pf-showroom"
                  type="text"
                  value={editForm.showroom}
                  onChange={(e) => setEditForm({ ...editForm, showroom: e.target.value })}

                />
              </div>

              <div className="vf-form-group">
                <label htmlFor="pf-motto">Châm ngôn tư vấn (Hiển thị đầu trang)</label>
                <textarea
                  id="pf-motto"
                  rows={3}
                  value={editForm.motto}
                  onChange={(e) => setEditForm({ ...editForm, motto: e.target.value })}

                />
              </div>

              </fieldset>
              <p className="vf-profile-local-note">Tên hiển thị được lưu vào tài khoản. Các trường còn lại được lưu trên thiết bị này.</p>
              <div className="vf-modal-actions">
                <button type="button" className="vf-btn-cancel" onClick={() => setIsEditing(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="vf-btn-submit" disabled={savingProfile}>
                  <Save size={14} />
                  <span>{savingProfile ? 'Đang lưu…' : 'Lưu thay đổi'}</span>
                </button>
              </div>
            </form>
      </DetailDialog>}
      {showPasswordModal && <DetailDialog title="Đổi mật khẩu" onClose={closePassword}>
            <form onSubmit={handleChangePasswordSubmit} className="vf-modal-form">
              {pwStatus.error && <p className="vf-form-alert is-error" role="alert">{pwStatus.error}</p>}


              <div className="vf-form-group">
                <label htmlFor="pw-cur">Mật khẩu hiện tại</label>
                <input
                  id="pw-cur"
                  type="password"
                  placeholder="Nhập mật khẩu đang dùng"
                  autoComplete="current-password"
                  value={pwForm.currentPw}
                  onChange={(e) => setPwForm({ ...pwForm, currentPw: e.target.value })}
                  required
                />
              </div>

              <div className="vf-form-group">
                <label htmlFor="pw-new">Mật khẩu mới</label>
                <input
                  id="pw-new"
                  type="password"
                  placeholder="Ít nhất 12 ký tự"
                  minLength={12}
                  maxLength={1024}
                  autoComplete="new-password"
                  value={pwForm.newPw}
                  onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                  required
                />
              </div>

              <div className="vf-form-group">
                <label htmlFor="pw-conf">Xác nhận mật khẩu mới</label>
                <input
                  id="pw-conf"
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                  autoComplete="new-password"
                  value={pwForm.confirmPw}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPw: e.target.value })}
                  required
                />
              </div>

              <div className="vf-modal-actions">
                <button type="button" className="vf-btn-cancel" onClick={closePassword}>
                  Đóng
                </button>
                <button type="submit" className="vf-btn-submit" disabled={pwStatus.loading}>
                  {pwStatus.loading ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
      </DetailDialog>}
    </div>
  );
}
