import { useState } from 'react';
import {
  BatteryCharging,
  CalendarCheck,
  FileSpreadsheet,
  Gauge,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

export const VINFAST_SHOWCASE_MODELS = [
  {
    id: 'vf3',
    key: 'VF 3',
    name: 'VinFast VF 3',
    segment: 'Mini e-SUV Đô thị',
    price: '240.000.000 ₫',
    range: '215 km',
    battery: '18.64 kWh LFP',
    charging: '10–70% / 36 phút',
    power: '40.2 HP · 110 Nm RWD',
    image: '/vehicles/official/vf-3.webp',
    tagline: 'Cá tính, linh hoạt, di chuyển xanh trong đô thị',
  },
  {
    id: 'vf5',
    key: 'VF 5',
    name: 'VinFast VF 5 Plus',
    segment: 'A-SUV Đô thị Thông minh',
    price: '468.000.000 ₫',
    range: '326 km',
    battery: '37.23 kWh',
    charging: '10–70% / 30 phút',
    power: '134 HP · 135 Nm FWD',
    image: '/vehicles/official/vf-5.webp',
    tagline: 'Lựa chọn SUV điện quốc dân, kinh tế và bền bỉ',
  },
  {
    id: 'vf6',
    key: 'VF 6',
    name: 'VinFast VF 6',
    segment: 'B-SUV Gia đình Hiện đại',
    price: '675.000.000 ₫',
    range: '399 km',
    battery: '59.6 kWh LFP',
    charging: '10–70% / 27 phút',
    power: '201 HP · ADAS Cấp 2',
    image: '/vehicles/official/vf-6.webp',
    tagline: 'Thiết kế tinh tế của Torino Design, công nghệ hỗ trợ lái vượt trội',
  },
  {
    id: 'vf7',
    key: 'VF 7',
    name: 'VinFast VF 7 Plus AWD',
    segment: 'C-SUV Thể thao Tương lai',
    price: '850.000.000 ₫',
    range: '496 km',
    battery: '75.3 kWh',
    charging: '10–70% / 24 phút',
    power: '349 HP · 0–100km/h 5.8s',
    image: '/vehicles/official/vf-7.webp',
    tagline: 'Thiết kế vũ trụ phi đối xứng, sức mạnh 2 mô-tơ điện thông minh',
  },
  {
    id: 'vf8',
    key: 'VF 8',
    name: 'VinFast VF 8 Plus',
    segment: 'D-SUV Toàn cầu Thông minh',
    price: '1.090.000.000 ₫',
    range: '471 km',
    battery: '87.7 kWh CATL',
    charging: '10–70% / 24 phút',
    power: '402 HP · 620 Nm AWD',
    image: '/vehicles/official/vf-8.webp',
    tagline: 'Chuẩn an toàn 5 sao toàn cầu, trợ lý ảo thông minh Vivi tiếng Việt',
  },
  {
    id: 'vf9',
    key: 'VF 9',
    name: 'VinFast VF 9 Full-size',
    segment: 'E-SUV Đẳng cấp Chủ tịch',
    price: '1.589.000.000 ₫',
    range: '626 km',
    battery: '123 kWh CATL',
    charging: '10–70% / 26 phút',
    power: '402 HP · Ghế Captain Seat',
    image: '/vehicles/official/vf-9.webp',
    tagline: 'Không gian siêu sang, ghế massage đa điểm và cửa hít tự động',
  },
  {
    id: 'vfwild',
    key: 'VF Wild',
    name: 'VinFast VF Wild Concept',
    segment: 'Bán tải Điện Thể thao Đột phá',
    price: 'Dự kiến 2026',
    range: '500+ km',
    battery: 'Pin thế hệ mới',
    charging: 'Siêu nạp V-GREEN',
    power: '4x4 Địa hình Thông minh',
    image: '/vehicles/official/vf-wild.webp',
    tagline: 'Ngôn ngữ thiết kế đột phá, dẫn đầu phân khúc bán tải điện tương lai',
  },
];

export function VinFastShowcaseHero({
  modelInterest = [],
  customers = [],
  selectedModelKey = null,
  onSelectModel,
  onBookTestDrive,
  onQuotePrice,
}) {
  const [activeModelId, setActiveModelId] = useState('vf7');
  const currentModel =
    VINFAST_SHOWCASE_MODELS.find((m) => m.key === selectedModelKey) ||
    VINFAST_SHOWCASE_MODELS.find((m) => m.id === activeModelId) ||
    VINFAST_SHOWCASE_MODELS[3];

  // Count leads interested in each model from CRM data
  const interestMap = {};
  modelInterest.forEach((item) => {
    interestMap[item.model] = item.count;
  });

  // Interested customers matching current model
  const matchingCustomers = customers.filter((c) =>
    c.models?.some((m) => m.toLowerCase().includes(currentModel.key.toLowerCase()))
  );

  const handleModelChange = (model) => {
    setActiveModelId(model.id);
    if (onSelectModel) {
      onSelectModel(selectedModelKey === model.key ? null : model.key);
    }
  };

  return (
    <section className="vf-showcase-card" aria-label="Khu vực giới thiệu xe VinFast">
      {/* MODEL SELECTOR TAB BAR */}
      <div className="vf-model-tabs" role="tablist" aria-label="Chọn dòng xe VinFast">
        {VINFAST_SHOWCASE_MODELS.map((model) => {
          const isSelected = currentModel.id === model.id;
          const leadCount = interestMap[model.key] || 0;
          return (
            <button
              key={model.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`vf-model-tab ${isSelected ? 'is-active' : ''}`}
              onClick={() => handleModelChange(model)}
            >
              <span className="vf-model-tab-label">{model.key}</span>
              {leadCount > 0 && (
                <span className="vf-model-tab-badge" title={`${leadCount} khách đang quan tâm`}>
                  {leadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SHOWCASE HERO STAGE */}
      <div className="vf-hero-stage">
        {/* LEFT COLUMN: VEHICLE DETAILS & SPEC CHIPS */}
        <div className="vf-hero-info">
          <div className="vf-hero-header">
            <span className="vf-hero-segment">{currentModel.segment}</span>
            <h2 className="vf-hero-title">{currentModel.name}</h2>
            <div className="vf-hero-price-row">
              <span className="vf-hero-price-label">Giá niêm yết:</span>
              <span className="vf-hero-price-value">{currentModel.price}</span>
            </div>
            <p className="vf-hero-tagline">{currentModel.tagline}</p>
          </div>

          {/* SPECIFICATION MINI TILES */}
          <div className="vf-spec-grid">
            <div className="vf-spec-tile">
              <div className="vf-spec-icon">
                <BatteryCharging size={16} strokeWidth={2.2} />
              </div>
              <div className="vf-spec-copy">
                <span className="vf-spec-label">Quãng đường (WLTP)</span>
                <strong className="vf-spec-value">{currentModel.range}</strong>
              </div>
            </div>

            <div className="vf-spec-tile">
              <div className="vf-spec-icon">
                <Zap size={16} strokeWidth={2.2} />
              </div>
              <div className="vf-spec-copy">
                <span className="vf-spec-label">Sạc nhanh DC</span>
                <strong className="vf-spec-value">{currentModel.charging}</strong>
              </div>
            </div>

            <div className="vf-spec-tile">
              <div className="vf-spec-icon">
                <Gauge size={16} strokeWidth={2.2} />
              </div>
              <div className="vf-spec-copy">
                <span className="vf-spec-label">Động cơ / Pin</span>
                <strong className="vf-spec-value">{currentModel.battery}</strong>
              </div>
            </div>

            <div className="vf-spec-tile">
              <div className="vf-spec-icon">
                <Sparkles size={16} strokeWidth={2.2} />
              </div>
              <div className="vf-spec-copy">
                <span className="vf-spec-label">Hiệu năng</span>
                <strong className="vf-spec-value">{currentModel.power}</strong>
              </div>
            </div>
          </div>

          {/* DIRECT ACTION BUTTONS */}
          <div className="vf-hero-actions">
            <button
              type="button"
              className="vf-btn-primary"
              onClick={() => onBookTestDrive && onBookTestDrive(currentModel)}
            >
              <CalendarCheck size={16} strokeWidth={2.2} />
              <span>Đăng ký lái thử</span>
            </button>

            <button
              type="button"
              className="vf-btn-secondary"
              onClick={() => onQuotePrice && onQuotePrice(currentModel)}
            >
              <FileSpreadsheet size={16} strokeWidth={2} />
              <span>Báo giá lăn bánh</span>
            </button>

            {matchingCustomers.length > 0 && (
              <button
                type="button"
                className={`vf-btn-leads ${selectedModelKey === currentModel.key ? 'is-filtering' : ''}`}
                onClick={() => onSelectModel && onSelectModel(selectedModelKey === currentModel.key ? null : currentModel.key)}
                title="Lọc danh sách khách hàng đang quan tâm dòng xe này"
              >
                <Users size={14} strokeWidth={2} />
                <span>
                  {selectedModelKey === currentModel.key
                    ? `Đang lọc: ${matchingCustomers.length} khách`
                    : `${matchingCustomers.length} khách quan tâm`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: VEHICLE IMAGE STAGE */}
        <div className="vf-hero-visual">
          <div className="vf-visual-backdrop" />
          <img
            src={currentModel.image}
            alt={currentModel.name}
            className="vf-vehicle-image"
            loading="eager"
          />
          <div className="vf-vehicle-shadow" />
        </div>
      </div>
    </section>
  );
}
