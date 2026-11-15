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
  (modelInterest || []).forEach((item) => {
    if (item?.model) interestMap[item.model] = item.count || 0;
  });

  // Interested customers matching current model
  const matchingCustomers = (customers || []).filter((c) =>
    Array.isArray(c?.models) &&
    c.models.some((m) => m && currentModel?.key && m.toLowerCase().includes(currentModel.key.toLowerCase()))
  );

  const handleModelChange = (model) => {
    setActiveModelId(model.id);
    if (onSelectModel) {
      onSelectModel(selectedModelKey === model.key ? null : model.key);
    }
  };

  // Compact specs formatted cleanly without wordy clutter
  const rangeVal = currentModel.range;
  const chargingVal = currentModel.charging.includes('/')
    ? currentModel.charging.split('/')[1].trim()
    : currentModel.charging;
  const batteryVal = currentModel.battery.split(' ')[0] + ' kWh';
  const powerVal = currentModel.power.split('·')[0].trim();

  return (
    <section className="vf-showcase-card" aria-label="Showroom VinFast">
      {/* 1. MODEL SELECTOR TABS */}
      <div className="vf-model-tabs-wrap">
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
                  <span className="vf-model-tab-badge">
                    {leadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MINIMALIST SHOWROOM STAGE */}
      <div className="vf-showroom-stage">
        {/* HEADER: NAME, SEGMENT & PRICE */}
        <div className="vf-showroom-header">
          <div className="vf-showroom-titles">
            <span className="vf-showroom-badge">{currentModel.segment}</span>
            <h2 className="vf-showroom-name">{currentModel.name}</h2>
          </div>

          <div className="vf-showroom-price-card">
            <span className="vf-price-label">Niêm yết</span>
            <strong className="vf-price-value">{currentModel.price}</strong>
          </div>
        </div>

        {/* CENTER VEHICLE IMAGE WITH NATURAL CONTACT SHADOW (NO SMEARS / NO CLUTTER) */}
        <div className="vf-vehicle-stage">
          <img
            src={currentModel.image}
            alt={currentModel.name}
            className="vf-hero-image"
            loading="eager"
            onError={(e) => {
              if (e.currentTarget.src.endsWith('.webp')) {
                e.currentTarget.src = currentModel.image.replace('/official/', '/').replace('.webp', '.jpg');
              } else if (e.currentTarget.src.endsWith('.jpg')) {
                e.currentTarget.src = currentModel.image.replace('/official/', '/').replace('.webp', '.svg');
              }
            }}
          />
          <div className="vf-hero-ground-shadow" />
        </div>

        {/* BOTTOM HUD: 4 ESSENTIAL SPECS */}
        <div className="vf-specs-hud" aria-label="Thông số kỹ thuật">
          <div className="vf-hud-item">
            <BatteryCharging size={15} className="vf-hud-icon" />
            <div className="vf-hud-copy">
              <span className="vf-hud-label">Quãng đường</span>
              <strong className="vf-hud-val">{rangeVal}</strong>
            </div>
          </div>

          <div className="vf-hud-divider" />

          <div className="vf-hud-item">
            <Zap size={15} className="vf-hud-icon" />
            <div className="vf-hud-copy">
              <span className="vf-hud-label">Sạc nhanh</span>
              <strong className="vf-hud-val">{chargingVal}</strong>
            </div>
          </div>

          <div className="vf-hud-divider" />

          <div className="vf-hud-item">
            <Gauge size={15} className="vf-hud-icon" />
            <div className="vf-hud-copy">
              <span className="vf-hud-label">Dung lượng pin</span>
              <strong className="vf-hud-val">{batteryVal}</strong>
            </div>
          </div>

          <div className="vf-hud-divider" />

          <div className="vf-hud-item">
            <Sparkles size={15} className="vf-hud-icon" />
            <div className="vf-hud-copy">
              <span className="vf-hud-label">Công suất</span>
              <strong className="vf-hud-val">{powerVal}</strong>
            </div>
          </div>
        </div>

        {/* CALL TO ACTION BUTTONS (TRANSLUCENT CYAN + BRIGHT CYAN BORDER) */}
        <div className="vf-showroom-actions">
          <button
            type="button"
            className="vf-btn-action is-primary"
            onClick={() => onBookTestDrive && onBookTestDrive(currentModel)}
          >
            <CalendarCheck size={15} strokeWidth={2.2} />
            <span>Lái thử</span>
          </button>

          <button
            type="button"
            className="vf-btn-action is-secondary"
            onClick={() => onQuotePrice && onQuotePrice(currentModel)}
          >
            <FileSpreadsheet size={15} strokeWidth={2} />
            <span>Báo giá</span>
          </button>

          {matchingCustomers.length > 0 && (
            <button
              type="button"
              className={`vf-btn-action is-leads ${selectedModelKey === currentModel.key ? 'is-active' : ''}`}
              onClick={() => onSelectModel && onSelectModel(selectedModelKey === currentModel.key ? null : currentModel.key)}
            >
              <Users size={14} strokeWidth={2} />
              <span>
                {selectedModelKey === currentModel.key
                  ? `Đang lọc (${matchingCustomers.length})`
                  : `${matchingCustomers.length} khách quan tâm`}
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
