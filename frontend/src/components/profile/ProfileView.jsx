import { useState, useEffect } from 'react';
import {
  Award,
  BadgeCheck,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  Edit3,
  Flame,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Zap,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { practiceApi } from '../../api/practiceApi';
import { authApi } from '../../api/authApi';
import './profile.css';

const DEFAULT_PROFILE = {
  name: 'Phạm Đình Duy',
  username: 'advisor.demo',
  role: 'Chuyên viên Tư vấn Bán hàng Cao cấp',
  showroom: 'Showroom VinFast Smart City - Hà Nội',
  showroomCode: 'VF-HN-042',
  email: 'duy.pd@vinfast.vn',
  phone: '0988 123 456',
  employeeId: 'VF-88219',
  joinedDate: 'Tháng 10 / 2023',
  rank: 'Diamond Advisor',
  motto: 'Tận tâm đồng hành, chia sẻ giải pháp di chuyển thông minh và kinh tế nhất cho từng gia đình.',
  smartReply: true,
  overdueAlerts: true,
  autoVoiceTranscript: true,
};

const CERTIFICATIONS = [
  {
    id: 'cert-1',
    code: 'VF-ACADEMY-2026',
    title: 'VinFast Master Sales Enablement',
    issuer: 'VinFast Global Academy',
    date: 'Tháng 01/2026',
    level: 'Cấp độ Chuyên gia (Level 4)',
    icon: Award,
    badgeColor: 'gold',
  },
  {
    id: 'cert-2',
    code: 'VGREEN-PRO-150K',
    title: 'V-GREEN Charging Infrastructure Specialist',
    issuer: 'Công ty Cổ phần Trạm sạc Toàn cầu V-GREEN',
    date: 'Tháng 12/2025',
    level: 'Chuẩn quy hoạch 150.000 cổng sạc',
    icon: Zap,
    badgeColor: 'cyan',
  },
  {
    id: 'cert-3',
    code: 'ADAS-SAFETY-L2',
    title: 'VinFast ADAS & Smart Services Certified',
    issuer: 'Khối Công nghệ VinFast Auto',
    date: 'Tháng 11/2025',
    level: 'Công nghệ hỗ trợ lái Cấp 2+',
    icon: ShieldCheck,
    badgeColor: 'emerald',
  },
  {
    id: 'cert-4',
    code: 'AI-SIM-EXCELLENCE',
    title: 'Top AI Roleplay Simulation Mastery',
    issuer: 'Hệ thống Đánh giá Tự động AI Evaluator',
    date: 'Tháng 02/2026',
    level: '22 phiên luyện tập xuất sắc',
    icon: Sparkles,
    badgeColor: 'purple',
  },
];

const VEHICLE_SPECIALTIES = [
  {
    model: 'VF 3',
    segment: 'Mini e-SUV Đô thị',
    badge: 'Chuyên viên Quốc dân',
    completionRate: 98,
    image: '/vehicles/official/vf-3.webp',
    status: 'Đạt chuẩn',
  },
  {
    model: 'VF 5 Plus',
    segment: 'A-SUV Dịch vụ & Gia đình',
    badge: 'Chuyên gia Chuyển đổi Vận tải Xanh',
    completionRate: 95,
    image: '/vehicles/official/vf-5.webp',
    status: 'Đạt chuẩn',
  },
  {
    model: 'VF 6',
    segment: 'B-SUV Gia đình Hiện đại',
    badge: 'Chuyên viên Công nghệ ADAS Cấp 2',
    completionRate: 92,
    image: '/vehicles/official/vf-6.webp',
    status: 'Đạt chuẩn',
  },
  {
    model: 'VF 7 Plus',
    segment: 'C-SUV Thể thao Tương lai',
    badge: 'Chuyên gia Hiệu năng AWD 349 HP',
    completionRate: 94,
    image: '/vehicles/official/vf-7.webp',
    status: 'Đạt chuẩn',
  },
  {
    model: 'VF 8 & VF 9',
    segment: 'D & E-SUV Hạng Sang',
    badge: 'Cố vấn Khách hàng Doanh nghiệp VIP',
    completionRate: 90,
    image: '/vehicles/official/vf-8.webp',
    status: 'Đạt chuẩn',
  },
];

export function ProfileView({
  currentUser,
  onOpenRoleplay,
  onOpenCopilot,
  onLogout,
  onSwitchRole,
}) {
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('vinfast_profile_custom');
      if (saved) return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return {
      ...DEFAULT_PROFILE,
      name: currentUser?.display_name || DEFAULT_PROFILE.name,
      username: currentUser?.username || DEFAULT_PROFILE.username,
    };
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profile);
  const [saveSuccessToast, setSaveSuccessToast] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPw: '', newPw: '', confirmPw: '' });
  const [pwStatus, setPwStatus] = useState({ loading: false, error: '', success: '' });
  const [progressData, setProgressData] = useState(null);
  const [recentHistory, setRecentHistory] = useState([]);

  // Tải dữ liệu tiến độ & phiên luyện tập thực tế từ backend
  useEffect(() => {
    let active = true;
    practiceApi.getProgress().then((data) => {
      if (active && data) setProgressData(data);
    }).catch(() => { /* use defaults */ });

    practiceApi.getHistory().then((data) => {
      if (active && Array.isArray(data)) setRecentHistory(data.slice(0, 4));
    }).catch(() => { /* use defaults */ });

    return () => { active = false; };
  }, []);

  const handleSaveProfile = (e) => {
    e.preventDefault();
    setProfile(editForm);
    try {
      localStorage.setItem('vinfast_profile_custom', JSON.stringify(editForm));
    } catch { /* ignore */ }
    setIsEditing(false);
    setSaveSuccessToast('Đã lưu cập nhật hồ sơ thành công!');
    setTimeout(() => setSaveSuccessToast(''), 3500);
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirmPw) {
      setPwStatus({ loading: false, error: 'Mật khẩu xác nhận không khớp.', success: '' });
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwStatus({ loading: false, error: 'Mật khẩu mới phải có ít nhất 8 ký tự.', success: '' });
      return;
    }

    setPwStatus({ loading: true, error: '', success: '' });
    try {
      await authApi.changePassword(pwForm.currentPw, pwForm.newPw);
      setPwStatus({ loading: false, error: '', success: 'Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu mới.' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwForm({ currentPw: '', newPw: '', confirmPw: '' });
        setPwStatus({ loading: false, error: '', success: '' });
      }, 2000);
    } catch (err) {
      setPwStatus({ loading: false, error: err.message || 'Mật khẩu hiện tại không đúng.', success: '' });
    }
  };

  const skillsMatrix = [
    {
      name: 'Khám phá nhu cầu',
      score: 94,
      level: 'Chuyên gia',
      desc: 'Lắng nghe nhu cầu sử dụng thực tế, bài toán chi phí xăng vs điện và thói quen sạc pin.',
      change: '+14% so với quý trước',
    },
    {
      name: 'Kiến thức kỹ thuật & Pin',
      score: 96,
      level: 'Chuyên gia',
      desc: 'Thông số động cơ, dung lượng pin LFP/CATL, quãng đường di chuyển và mạng lưới V-GREEN.',
      change: '+8% so với quý trước',
    },
    {
      name: 'Xử lý băn khoăn & phản đối',
      score: 90,
      level: 'Thành thạo',
      desc: 'Giải tỏa lo lắng về độ bền pin, sạc tại chung cư và chính sách thuê/mua pin linh hoạt.',
      change: '+18% so với quý trước',
    },
    {
      name: 'Chính xác chính sách & Giá',
      score: 95,
      level: 'Chuyên gia',
      desc: 'Ưu đãi lệ phí trước bạ, bảo hành 10 năm/200.000km, quà tặng VinClub và trả góp ngân hàng.',
      change: '+5% so với quý trước',
    },
    {
      name: 'Chốt cọc & Bước tiếp theo',
      score: 92,
      level: 'Quyết đoán',
      desc: 'Chốt lái thử tại nhà, giữ xe với ưu đãi có thời hạn và tạo hợp đồng cọc chuẩn xác.',
      change: '+22% so với quý trước',
    },
  ];

  return (
    <div className="vf-profile-container">
      {saveSuccessToast && (
        <div className="vf-profile-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{saveSuccessToast}</span>
        </div>
      )}

      {/* 1. HERO PROFILE COVER & EXECUTIVE CARD */}
      <section className="vf-profile-hero" aria-label="Hồ sơ cá nhân">
        <div className="vf-hero-backdrop">
          <div className="vf-hero-glow" />
        </div>

        <div className="vf-hero-body">
          <div className="vf-hero-avatar-wrap">
            <div className="vf-hero-avatar">
              <span>{profile.name ? profile.name.slice(0, 1) : 'D'}</span>
              <span className="vf-hero-avatar-star" title="Tư vấn viên Kim Cương">
                <Star size={13} fill="#F59E0B" color="#F59E0B" />
              </span>
            </div>
            <div className="vf-hero-status-pill">
              <span className="vf-pulse-dot" />
              <span>Sẵn sàng tiếp khách</span>
            </div>
          </div>

          <div className="vf-hero-details">
            <div className="vf-hero-name-row">
              <h1 className="vf-hero-name">{profile.name}</h1>
              <span className="vf-verified-badge" title="Tư vấn viên đã xác thực">
                <BadgeCheck size={18} />
                <span>Đã chứng nhận</span>
              </span>
              <span className="vf-rank-tag">{profile.rank}</span>
            </div>

            <p className="vf-hero-role">{profile.role}</p>

            <div className="vf-hero-meta-strip">
              <span className="vf-meta-item">
                <MapPin size={13} />
                <span>{profile.showroom}</span>
              </span>
              <span className="vf-meta-dot">·</span>
              <span className="vf-meta-item">
                <ShieldCheck size={13} />
                <span>Mã NV: <strong>{profile.employeeId}</strong></span>
              </span>
              <span className="vf-meta-dot">·</span>
              <span className="vf-meta-item">
                <Mail size={13} />
                <span>{profile.email}</span>
              </span>
              <span className="vf-meta-dot">·</span>
              <span className="vf-meta-item">
                <Phone size={13} />
                <span>{profile.phone}</span>
              </span>
              <span className="vf-meta-dot">·</span>
              <span className="vf-meta-item">
                <Calendar size={13} />
                <span>Gia nhập: {profile.joinedDate}</span>
              </span>
            </div>

            <p className="vf-hero-motto">“{profile.motto}”</p>
          </div>

          <div className="vf-hero-actions">
            <button
              type="button"
              className="vf-btn-hero is-primary"
              onClick={() => {
                setEditForm(profile);
                setIsEditing(true);
              }}
            >
              <Edit3 size={14} />
              <span>Chỉnh sửa hồ sơ</span>
            </button>

            <button
              type="button"
              className="vf-btn-hero is-secondary"
              onClick={() => setShowPasswordModal(true)}
            >
              <KeyRound size={14} />
              <span>Đổi mật khẩu</span>
            </button>

            {onSwitchRole && (
              <button
                type="button"
                className="vf-btn-hero is-outline"
                onClick={() => onSwitchRole('manager')}
                title="Đổi cổng làm việc"
              >
                <Users size={14} />
                <span>Cổng Quản lý</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. EXECUTIVE 4-KPI METRIC STRIP */}
      <section className="vf-kpi-grid" aria-label="Chỉ số hiệu quả kinh doanh & luyện tập">
        <div className="vf-kpi-card">
          <div className="vf-kpi-icon-wrap is-gold">
            <Award size={18} />
          </div>
          <div className="vf-kpi-info">
            <span className="vf-kpi-label">Điểm AI Roleplay</span>
            <div className="vf-kpi-val-row">
              <strong className="vf-kpi-number">
                {progressData?.overall_avg ? `${progressData.overall_avg} / 3.0` : '2.8 / 3.0'}
              </strong>
              <span className="vf-trend-pill is-up">
                <TrendingUp size={11} /> +0.8
              </span>
            </div>
            <span className="vf-kpi-sub">
              {progressData?.approved_sessions || 22} buổi luyện tập xuất sắc đã duyệt
            </span>
          </div>
        </div>

        <div className="vf-kpi-card">
          <div className="vf-kpi-icon-wrap is-cyan">
            <Users size={18} />
          </div>
          <div className="vf-kpi-info">
            <span className="vf-kpi-label">Khách hàng phụ trách</span>
            <div className="vf-kpi-val-row">
              <strong className="vf-kpi-number">12 Khách hàng</strong>
              <span className="vf-trend-pill is-neutral">8 cơ hội nóng</span>
            </div>
            <span className="vf-kpi-sub">Tốc độ phản hồi trung bình: 8 phút</span>
          </div>
        </div>

        <div className="vf-kpi-card">
          <div className="vf-kpi-icon-wrap is-emerald">
            <Flame size={18} />
          </div>
          <div className="vf-kpi-info">
            <span className="vf-kpi-label">Quy mô phễu chốt cọc</span>
            <div className="vf-kpi-val-row">
              <strong className="vf-kpi-number">9,35 tỷ ₫</strong>
              <span className="vf-trend-pill is-up">
                <TrendingUp size={11} /> 68%
              </span>
            </div>
            <span className="vf-kpi-sub">6 khách hàng sẵn sàng đặt cọc tuần này</span>
          </div>
        </div>

        <div className="vf-kpi-card">
          <div className="vf-kpi-icon-wrap is-purple">
            <Target size={18} />
          </div>
          <div className="vf-kpi-info">
            <span className="vf-kpi-label">Tiến độ KPI tháng</span>
            <div className="vf-kpi-val-row">
              <strong className="vf-kpi-number">114%</strong>
              <span className="vf-trend-pill is-up">Top 2 Miền Bắc</span>
            </div>
            <span className="vf-kpi-sub">Vượt 14% chỉ tiêu giao của Đại lý</span>
          </div>
        </div>
      </section>

      {/* 3. MAIN DUAL COLUMN: SKILLS MATRIX & VEHICLE CERTIFICATIONS */}
      <div className="vf-profile-main-grid">
        {/* LEFT COLUMN: 5 SKILLS RADAR & PERFORMANCE BREAKDOWN */}
        <section className="vf-panel" aria-labelledby="skills-heading">
          <div className="vf-panel-head">
            <div className="vf-panel-title-group">
              <Compass size={17} />
              <h2 id="skills-heading">Ma trận 5 kỹ năng bán hàng AI (AI Evaluator)</h2>
            </div>
            <span className="vf-badge-verified">Chứng nhận VinFast AI</span>
          </div>

          <p className="vf-panel-desc">
            Chỉ số năng lực chuyên môn được AI Evaluator phân tích tự động dựa trên toàn bộ các phiên đàm phán mô phỏng với khách hàng thực tế.
          </p>

          <div className="vf-skills-list">
            {skillsMatrix.map((item, index) => (
              <div className="vf-skill-card" key={item.name}>
                <div className="vf-skill-header">
                  <div className="vf-skill-left">
                    <span className="vf-skill-num">0{index + 1}</span>
                    <div>
                      <strong className="vf-skill-name">{item.name}</strong>
                      <span className="vf-skill-level">{item.level}</span>
                    </div>
                  </div>
                  <div className="vf-skill-score">
                    <strong>{item.score}%</strong>
                    <span className="vf-skill-change">{item.change}</span>
                  </div>
                </div>

                <div className="vf-skill-bar-track" role="meter" aria-label={item.name} aria-valuenow={item.score} aria-valuemin="0" aria-valuemax="100">
                  <span
                    className="vf-skill-bar-fill"
                    style={{ width: `${item.score}%` }}
                  />
                </div>

                <p className="vf-skill-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT COLUMN: VEHICLE SPECIALTIES & OFFICIAL CERTIFICATIONS */}
        <div className="vf-profile-right-stack">
          {/* VEHICLE EXPERTISE TILES */}
          <section className="vf-panel" aria-labelledby="vehicles-heading">
            <div className="vf-panel-head">
              <div className="vf-panel-title-group">
                <Car size={17} />
                <h2 id="vehicles-heading">Chứng chỉ chuyên sâu các dòng xe VinFast</h2>
              </div>
              <span className="vf-badge-counter">{VEHICLE_SPECIALTIES.length} Dòng xe</span>
            </div>

            <div className="vf-vehicles-grid">
              {VEHICLE_SPECIALTIES.map((v) => (
                <div className="vf-vehicle-item" key={v.model}>
                  <div className="vf-vehicle-thumb">
                    <img src={v.image} alt={v.model} loading="lazy" />
                  </div>
                  <div className="vf-vehicle-copy">
                    <div className="vf-vehicle-top">
                      <strong className="vf-vehicle-name">{v.model}</strong>
                      <span className="vf-vehicle-status">{v.status}</span>
                    </div>
                    <span className="vf-vehicle-seg">{v.segment}</span>
                    <span className="vf-vehicle-badge-pill">{v.badge}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* OFFICIAL CERTIFICATIONS */}
          <section className="vf-panel" aria-labelledby="certs-heading">
            <div className="vf-panel-head">
              <div className="vf-panel-title-group">
                <Award size={17} />
                <h2 id="certs-heading">Chứng chỉ & Huy hiệu số đạt được</h2>
              </div>
            </div>

            <div className="vf-certs-list">
              {CERTIFICATIONS.map((cert) => {
                const IconComponent = cert.icon;
                return (
                  <div className={`vf-cert-card is-${cert.badgeColor}`} key={cert.id}>
                    <div className="vf-cert-icon-wrap">
                      <IconComponent size={18} />
                    </div>
                    <div className="vf-cert-info">
                      <div className="vf-cert-head-line">
                        <strong className="vf-cert-title">{cert.title}</strong>
                        <span className="vf-cert-date">{cert.date}</span>
                      </div>
                      <span className="vf-cert-issuer">{cert.issuer}</span>
                      <div className="vf-cert-footer">
                        <span className="vf-cert-code">{cert.code}</span>
                        <span className="vf-cert-level">{cert.level}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* 4. RECENT PRACTICE ACTIVITY & SHORTCUT JUMP */}
      <section className="vf-panel" aria-labelledby="history-heading">
        <div className="vf-panel-head">
          <div className="vf-panel-title-group">
            <Clock size={17} />
            <h2 id="history-heading">Hoạt động luyện tập & Đánh giá Quản lý gần đây</h2>
          </div>
          {onOpenRoleplay && (
            <button type="button" className="vf-btn-panel-action" onClick={onOpenRoleplay}>
              <span>Vào phòng luyện tập AI</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>

        {recentHistory.length > 0 ? (
          <div className="vf-history-table-wrap">
            <table className="vf-history-table">
              <thead>
                <tr>
                  <th scope="col">Tình huống khách hàng</th>
                  <th scope="col">Kênh tư vấn</th>
                  <th scope="col">Thời điểm hoàn thành</th>
                  <th scope="col">Điểm số AI</th>
                  <th scope="col">Đánh giá Quản lý</th>
                </tr>
              </thead>
              <tbody>
                {recentHistory.map((item) => (
                  <tr key={item.attempt_id || item.session_id}>
                    <td>
                      <div className="vf-table-scenario">
                        <strong>{item.scenario_title || item.scenario_id}</strong>
                        <span>{item.model_badge || 'VinFast EV'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="vf-channel-tag">{item.sales_channel || 'Fanpage'}</span>
                    </td>
                    <td>
                      <span className="vf-date-text">
                        {item.completed_at ? new Date(item.completed_at).toLocaleDateString('vi-VN') : 'Gần đây'}
                      </span>
                    </td>
                    <td>
                      <span className="vf-score-pill">
                        {item.approved_score || item.ai_score || 2.8} / 3.0
                      </span>
                    </td>
                    <td>
                      <span className="vf-status-badge is-approved">
                        {item.review_status === 'manager_approved' ? 'Quản lý đã duyệt' : 'Đã xác nhận'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vf-empty-history">
            <Sparkles size={24} />
            <p>Hệ thống đã ghi nhận 22 phiên luyện tập được quản lý duyệt. Hãy tiếp tục nâng cao kỹ năng tư vấn!</p>
            {onOpenRoleplay && (
              <button type="button" className="vf-btn-action-primary" onClick={onOpenRoleplay}>
                Bắt đầu kịch bản mới
              </button>
            )}
          </div>
        )}
      </section>

      {/* 5. MODAL: EDIT PROFILE */}
      {isEditing && (
        <div className="vf-modal-backdrop" onClick={() => setIsEditing(false)}>
          <div className="vf-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="vf-modal-head">
              <div className="vf-modal-title-group">
                <Edit3 size={17} />
                <h3>Chỉnh sửa hồ sơ tư vấn viên</h3>
              </div>
              <button type="button" className="vf-modal-close" onClick={() => setIsEditing(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveProfile} className="vf-modal-form">
              <div className="vf-form-row">
                <div className="vf-form-group">
                  <label htmlFor="pf-name">Họ và tên</label>
                  <input
                    id="pf-name"
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="vf-form-group">
                  <label htmlFor="pf-role">Chức danh</label>
                  <input
                    id="pf-role"
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    required
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
                    required
                  />
                </div>
                <div className="vf-form-group">
                  <label htmlFor="pf-email">Email công vụ</label>
                  <input
                    id="pf-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
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
                  required
                />
              </div>

              <div className="vf-form-group">
                <label htmlFor="pf-motto">Châm ngôn tư vấn (Hiển thị đầu trang)</label>
                <textarea
                  id="pf-motto"
                  rows={3}
                  value={editForm.motto}
                  onChange={(e) => setEditForm({ ...editForm, motto: e.target.value })}
                  required
                />
              </div>

              <div className="vf-modal-actions">
                <button type="button" className="vf-btn-cancel" onClick={() => setIsEditing(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="vf-btn-submit">
                  <Save size={14} />
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: CHANGE PASSWORD */}
      {showPasswordModal && (
        <div className="vf-modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <div className="vf-modal-card is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="vf-modal-head">
              <div className="vf-modal-title-group">
                <Lock size={17} />
                <h3>Đổi mật khẩu tài khoản</h3>
              </div>
              <button type="button" className="vf-modal-close" onClick={() => setShowPasswordModal(false)}>✕</button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="vf-modal-form">
              {pwStatus.error && <p className="vf-form-alert is-error">{pwStatus.error}</p>}
              {pwStatus.success && <p className="vf-form-alert is-success">{pwStatus.success}</p>}

              <div className="vf-form-group">
                <label htmlFor="pw-cur">Mật khẩu hiện tại</label>
                <input
                  id="pw-cur"
                  type="password"
                  placeholder="Nhập mật khẩu đang dùng"
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
                  placeholder="Ít nhất 8 ký tự"
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
                  value={pwForm.confirmPw}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPw: e.target.value })}
                  required
                />
              </div>

              <div className="vf-modal-actions">
                <button type="button" className="vf-btn-cancel" onClick={() => setShowPasswordModal(false)}>
                  Đóng
                </button>
                <button type="submit" className="vf-btn-submit" disabled={pwStatus.loading}>
                  {pwStatus.loading ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileView;
