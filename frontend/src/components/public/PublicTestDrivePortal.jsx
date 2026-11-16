import './publicPortal.css';
import { useState } from 'react';
import {
  ArrowLeft,
  BatteryCharging,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck,
  MapPin,
  Phone,
  Send,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { salesCopilotApi } from '../../api/salesCopilotApi';
import { VINFAST_SHOWCASE_MODELS } from '../../data/vehicleShowcaseData';

const SHOWROOMS = [
  'VinFast Ocean Park — Gia Lâm, Hà Nội',
  'VinFast Smart City — Nam Từ Liêm, Hà Nội',
  'VinFast Phạm Hùng — Cầu Giấy, Hà Nội',
  'VinFast Landmark 81 — Bình Thạnh, TP. HCM',
  'VinFast Thảo Điền — TP. Thủ Đức, TP. HCM',
  'VinFast Ngô Quyền — Sơn Trà, Đà Nẵng',
  'VinFast Lê Thánh Tông — Ngô Quyền, Hải Phòng',
];

const TIME_SLOTS = [
  'Hôm nay — Chiều 14:30',
  'Ngày mai — Sáng 09:30',
  'Ngày mai — Chiều 15:00',
  'Thứ Bảy tuần này — 09:00',
  'Thứ Bảy tuần này — 14:30',
  'Chủ Nhật tuần này — 10:00',
];

export function PublicTestDrivePortal({ onBack, onOpenLeadInCrm }) {
  const [selectedModel, setSelectedModel] = useState('VF 7');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showroom, setShowroom] = useState(SHOWROOMS[0]);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[1]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  const activeVehicle =
    VINFAST_SHOWCASE_MODELS.find((m) => m.key === selectedModel) || VINFAST_SHOWCASE_MODELS[3];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      setError('Vui lòng nhập họ tên và số điện thoại liên hệ.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await salesCopilotApi.submitPublicTestDrive({
        name: fullName.trim(),
        phone: phone.trim(),
        model: selectedModel,
        location: showroom,
        preferred_date: timeSlot,
        notes: notes.trim(),
      });
      setSuccessResult(res);
    } catch (err) {
      setError(err.message || 'Không thể gửi đăng ký. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="vf-portal-shell">
      {/* 1. PORTAL TOP NAVBAR */}
      <header className="vf-portal-navbar">
        <div className="vf-portal-nav-inner">
          <div className="vf-portal-brand">
            <img src="/vinfast-official-logo.png?v=silver" alt="VinFast" className="vf-portal-logo" />
            <div>
              <strong>CỔNG ĐĂNG KÝ LÁI THỬ TRỰC TUYẾN</strong>
              <small>Hệ thống kết nối khách hàng &amp; Trợ lý tư vấn AI VinFast</small>
            </div>
          </div>

          <button type="button" className="vf-portal-btn-back" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>Về hệ thống CRM nội bộ</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN PORTAL CONTAINER */}
      <main className="vf-portal-container">
        {successResult ? (
          /* SUCCESS CONFIRMATION CARD */
          <div className="vf-portal-success-card">
            <div className="vf-success-icon-wrap">
              <CheckCircle2 size={48} className="vf-success-icon" />
            </div>
            <h2>Đăng ký lái thử thành công!</h2>
            <p className="vf-success-desc">
              Hệ thống đã tự động chuyển thông tin của quý khách tới{' '}
              <strong>Tư vấn viên Phạm Đình Duy (Showroom VinFast)</strong>.
            </p>

            <div className="vf-success-summary-box">
              <div className="vf-summary-row">
                <span>Khách hàng:</span>
                <strong>{fullName} ({phone})</strong>
              </div>
              <div className="vf-summary-row">
                <span>Dòng xe lái thử:</span>
                <strong className="vf-accent-text">{selectedModel}</strong>
              </div>
              <div className="vf-summary-row">
                <span>Địa điểm:</span>
                <strong>{showroom}</strong>
              </div>
              <div className="vf-summary-row">
                <span>Thời gian hẹn:</span>
                <strong>{timeSlot}</strong>
              </div>
              {notes && (
                <div className="vf-summary-row">
                  <span>Nhu cầu tư vấn:</span>
                  <p>{notes}</p>
                </div>
              )}
            </div>

            <div className="vf-success-actions">
              <button
                type="button"
                className="vf-btn-view-crm"
                onClick={() => {
                  if (onOpenLeadInCrm) {
                    onOpenLeadInCrm(successResult.conversation_id);
                  } else {
                    onBack();
                  }
                }}
              >
                <Compass size={16} />
                <span>Mở Lead này ngay trên màn hình CRM của Sales →</span>
              </button>

              <button
                type="button"
                className="vf-btn-register-more"
                onClick={() => {
                  setSuccessResult(null);
                  setFullName('');
                  setPhone('');
                  setNotes('');
                }}
              >
                Đăng ký thêm lượt khác
              </button>
            </div>
          </div>
        ) : (
          /* BOOKING WORKFLOW */
          <div className="vf-portal-grid">
            {/* LEFT: VEHICLE SHOWCASE & SELECTION */}
            <section className="vf-portal-vehicle-col">
              <div className="vf-vehicle-selector-card">
                <span className="vf-vehicle-badge">{activeVehicle.segment}</span>
                <h1 className="vf-vehicle-title">{activeVehicle.name}</h1>
                <div className="vf-vehicle-price-tag">{activeVehicle.price}</div>

                <div className="vf-portal-img-stage">
                  <img
                    src={activeVehicle.image}
                    alt={activeVehicle.name}
                    className="vf-portal-car-img"
                  />
                </div>

                {/* 4 SPECS HUD */}
                <div className="vf-portal-specs-row">
                  <div className="vf-spec-item">
                    <BatteryCharging size={16} />
                    <div>
                      <small>Quãng đường</small>
                      <strong>{activeVehicle.range}</strong>
                    </div>
                  </div>
                  <div className="vf-spec-item">
                    <Zap size={16} />
                    <div>
                      <small>Sạc nhanh</small>
                      <strong>{activeVehicle.charging.split('/')[0]}</strong>
                    </div>
                  </div>
                  <div className="vf-spec-item">
                    <Sparkles size={16} />
                    <div>
                      <small>Công suất</small>
                      <strong>{activeVehicle.power.split('·')[0]}</strong>
                    </div>
                  </div>
                </div>

                {/* MODEL CHIPS */}
                <div className="vf-model-chips-list">
                  <span className="vf-choose-lbl">Chọn dòng xe lái thử:</span>
                  <div className="vf-chips-wrap">
                    {VINFAST_SHOWCASE_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`vf-portal-model-pill ${m.key === selectedModel ? 'is-active' : ''}`}
                        onClick={() => setSelectedModel(m.key)}
                      >
                        {m.key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT: REGISTRATION FORM */}
            <section className="vf-portal-form-col">
              <div className="vf-form-card">
                <div className="vf-form-card-header">
                  <h2>Thông tin đặt lịch lái thử</h2>
                  <p>Trải nghiệm công nghệ lái thông minh ADAS và trợ lý Vivi tiếng Việt</p>
                </div>

                {error && <div className="vf-portal-error-banner" role="alert">{error}</div>}

                <form onSubmit={handleSubmit} className="vf-booking-form">
                  <div className="vf-form-group">
                    <label htmlFor="pf-name">
                      <User size={14} /> Họ và tên của bạn <span className="vf-req">*</span>
                    </label>
                    <input
                      id="pf-name"
                      required
                      placeholder="Ví dụ: Đỗ Hoàng Long"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>

                  <div className="vf-form-group">
                    <label htmlFor="pf-phone">
                      <Phone size={14} /> Số điện thoại liên hệ <span className="vf-req">*</span>
                    </label>
                    <input
                      id="pf-phone"
                      type="tel"
                      required
                      placeholder="Ví dụ: 0912 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <div className="vf-form-group">
                    <label htmlFor="pf-showroom">
                      <MapPin size={14} /> Showroom VinFast tiếp đón
                    </label>
                    <select
                      id="pf-showroom"
                      value={showroom}
                      onChange={(e) => setShowroom(e.target.value)}
                    >
                      {SHOWROOMS.map((s, idx) => (
                        <option key={idx} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="vf-form-group">
                    <label htmlFor="pf-time">
                      <Clock size={14} /> Thời gian lái thử mong muốn
                    </label>
                    <select
                      id="pf-time"
                      value={timeSlot}
                      onChange={(e) => setTimeSlot(e.target.value)}
                    >
                      {TIME_SLOTS.map((t, idx) => (
                        <option key={idx} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="vf-form-group">
                    <label htmlFor="pf-notes">
                      <FileCheck size={14} /> Nhu cầu tư vấn thêm (tùy chọn)
                    </label>
                    <textarea
                      id="pf-notes"
                      rows={3}
                      placeholder="Ví dụ: Tôi muốn tư vấn thêm về phương án sạc tại chung cư và gói vay trả góp ngân hàng..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="vf-portal-submit-btn"
                    disabled={submitting}
                  >
                    <Send size={15} />
                    <span>{submitting ? 'Đang gửi đăng ký…' : 'GỬI ĐĂNG KÝ LÁI THỬ NGAY'}</span>
                  </button>

                  <p className="vf-form-disclaimer">
                    Thông tin của quý khách được bảo mật theo chính sách quyền riêng tư của VinFast Auto.
                  </p>
                </form>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
