import { useState } from 'react';
import { fmtDayMonth, fmtScore } from '../../utils/scoreFormat';
import { ArrowRight, RotateCw, History } from 'lucide-react';
import './advisorProgress.css';

const DIFFICULTY = {
  Easy: 'Dễ', Medium: 'Trung bình', Hard: 'Khó', 'Cơ bản': 'Dễ', 'Tiêu chuẩn': 'Trung bình', 'Nâng cao': 'Khó',
};

function carFor(scenario) {
  if (scenario.scenario_id === 'SCENARIO_03_VF6_APARTMENT') return { src: '/vehicles/official/vf-6-green.webp', alt: 'VinFast VF 6 màu xanh' };
  const match = /VF[\s_-]*(Wild|[356789])(?![a-z0-9])/i.exec(`${scenario.model_badge || ''} ${scenario.model || ''} ${scenario.scenario_id} ${scenario.title}`);
  if (!match) return null;
  const model = match[1].toLowerCase();
  return { src: `/vehicles/official/vf-${model}.webp`, alt: `VinFast VF ${model === 'wild' ? 'Wild' : model}` };
}

function openingLine(context) {
  const text = String(context || '').trim();
  const quoted = /['‘“"](.+)['’”"]/s.exec(text);
  return quoted ? { text: quoted[1].trim(), quoted: true } : { text, quoted: false };
}

function lastResult(entry, latest) {
  if (entry) {
    if (entry.last_status === 'approved') {
      const day = fmtDayMonth(entry.last_completed_at);
      return `Lần gần nhất: ${fmtScore(entry.last_score)}/3${day ? ` (${day})` : ''}`;
    }
    if (entry.last_status === 'pending_review') {
      return `Đang chờ duyệt${entry.last_score != null ? ` · AI: ${fmtScore(entry.last_score)}/3` : ''}`;
    }
    if (entry.last_status === 'failed') return 'Chấm điểm chưa đạt';
    return 'Chưa luyện tập';
  }
  if (latest) return `Lần gần nhất: ${fmtScore(latest.approved_score ?? latest.ai_score)}/3`;
  return 'Chưa luyện tập';
}

export function ScenarioCatalog({
  scenarios,
  onStartScenario,
  onOpenHistory,
  latestByScenario = {},
  progressScenarios = null,
  assignments = [],
  starting = false,
  onRefresh = null,
}) {
  const [filterModel, setFilterModel] = useState('ALL');

  const models = ['ALL', 'VF 3', 'VF 5', 'VF 6', 'VF 7', 'VF 8', 'VF 9'];

  const filteredScenarios = scenarios.filter((s) => {
    if (filterModel === 'ALL') return true;
    return s.title.includes(filterModel) || s.scenario_id.includes(filterModel.replace(' ', ''));
  });

  const assignedFor = (scenarioId) => assignments
    .filter((item) => item.scenario_id === scenarioId && item.status !== 'completed')
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))[0];

  return (
    <section className="ap-card" aria-labelledby="ap-library-h">
      <div className="ap-card-head">
        <div>
          <h2 id="ap-library-h">Kịch bản luyện tập</h2>
        </div>

        <div className="ap-library-actions">
          {/* Quick Model Filter Pills */}
          <div className="ap-filter-pills" role="tablist" aria-label="Lọc theo dòng xe">
            {models.map((m) => (
              <button
                key={m}
                type="button"
                className={`ap-filter-pill ${filterModel === m ? 'is-active' : ''}`}
                onClick={() => setFilterModel(m)}
              >
                {m === 'ALL' ? 'Tất cả xe' : m}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              type="button"
              className="ap-btn-icon"
              onClick={onRefresh}
              title="Làm mới danh sách kịch bản"
              aria-label="Làm mới danh sách kịch bản"
            >
              <RotateCw size={14} />
            </button>
          )}
        </div>
      </div>

      {filteredScenarios.length === 0 ? (
        <p className="ap-state">Chưa có tình huống nào phù hợp bộ lọc.</p>
      ) : (
        <ul className="ap-scenarios">
          {filteredScenarios.map((scenario) => {
            const car = carFor(scenario);
            const opening = openingLine(scenario.visible_context);
            const assigned = assignedFor(scenario.scenario_id);
            const due = assigned?.due_date ? fmtDayMonth(`${assigned.due_date}T00:00:00`) : '';
            const upsell = (scenario.outcome_labels || []).some((label) => /upsell/i.test(label));
            const isCustom = scenario.scenario_id.startsWith('SCENARIO_CUSTOM_');

            return (
              <li className="ap-scenario" key={scenario.scenario_id}>
                {/* CARD HEADER */}
                <div className="ap-scenario-header">
                  <div className="ap-scenario-badges">
                    <span className="ap-level">{DIFFICULTY[scenario.difficulty] || scenario.difficulty}</span>
                    {upsell && <span className="ap-badge-tag">Luyện Upsell</span>}
                    {isCustom && <span className="ap-badge-tag is-custom">Quản lý giao</span>}
                    {assigned && <span className="ap-badge-tag is-urgent">Hạn: {due || 'Sớm'}</span>}
                  </div>
                  <h3 className="ap-scenario-title">{scenario.title}</h3>
                </div>

                {/* VEHICLE MEDIA */}
                <div className="ap-scenario-media">
                  {car ? (
                    <img src={car.src} alt={car.alt} loading="lazy" />
                  ) : (
                    <div className="ap-scenario-no-car" />
                  )}
                </div>

                {/* CUSTOMER QUOTE */}
                <div className="ap-scenario-quote">
                  <p>{opening.quoted ? `“${opening.text}”` : `“${opening.text}”`}</p>
                </div>

                {/* CARD FOOTER */}
                <div className="ap-scenario-foot">
                  <div className="ap-scenario-status">
                    <span>{lastResult(progressScenarios?.[scenario.scenario_id], latestByScenario[scenario.scenario_id])}</span>
                  </div>

                  <div className="ap-scenario-buttons">
                    <button
                      type="button"
                      className="ap-btn-history"
                      onClick={() => onOpenHistory(scenario.scenario_id)}
                      title="Xem lịch sử các lần luyện"
                    >
                      <History size={14} />
                      <span>Lịch sử</span>
                    </button>

                    <button
                      type="button"
                      className="ap-btn ap-btn--primary"
                      onClick={() => onStartScenario(scenario.scenario_id)}
                      disabled={starting}
                    >
                      <span>Vào luyện tập</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
