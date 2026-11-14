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

import { VINFAST_SHOWCASE_MODELS } from '../../../data/vehicleShowcaseData';

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
          <div className="vf-visual-badge">
            <span>⚡ 100% Thuần điện</span>
            <span>🛡️ An toàn 5★</span>
          </div>
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
