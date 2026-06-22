import { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import DateField, { fmtDate } from '../components/DateField.jsx';
import WaterTracker from '../components/WaterTracker.jsx';
import { useSettings } from '../lib/settings.jsx';

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export default function Bodyweight() {
  const { settings } = useSettings();
  const [rows, setRows] = useState([]);
  const [date, setDate] = useState(todayISO);
  const [w, setW] = useState('');
  const [note, setNote] = useState('');
  const [showWeightForm, setShowWeightForm] = useState(false);

  function load() {
    api.get('/bodyweight').then(setRows).catch(() => {});
  }
  useEffect(load, []);

  async function add() {
    const parsed = parseFloat(String(w).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    await api.post('/bodyweight', { log_date: date, weight_kg: parsed, note });
    setW(''); setNote('');
    setShowWeightForm(false);
    load();
  }

  async function del(id) {
    if (!confirm('Delete this entry?')) return;
    await api.del(`/bodyweight/${id}`);
    load();
  }

  // Most recent entry (rows come newest-first from the API).
  const latest = rows[0];

  // Mini chart — last 30 entries, oldest first
  const chartData = rows.slice(0, 30).reverse();
  const max = Math.max(...chartData.map((r) => r.weight_kg), 1);
  const min = Math.min(...chartData.map((r) => r.weight_kg), max);
  const range = Math.max(max - min, 1);

  return (
    <div className="app-shell page-bodyweight">
      <TopBar back title="Body" />
      <div className="content">
        {settings?.feat_water !== 0 && <WaterTracker />}

        <div className="card">
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: showWeightForm ? 12 : 0 }}>
            <div>
              <div className="section-title" style={{ margin: 0 }}>Bodyweight</div>
              <div className="small text-muted">
                {latest ? `Last: ${latest.weight_kg} kg · ${fmtDate(latest.log_date)}` : 'No entries yet'}
              </div>
            </div>
            {!showWeightForm && (
              <button className="btn tiny" onClick={() => { setDate(todayISO()); setShowWeightForm(true); }}>
                + Log weight
              </button>
            )}
          </div>

          {showWeightForm && (
            <>
              <div className="row mb-1">
                <div>
                  <label className="small" style={{ color: 'var(--ink-soft)' }}>Date</label>
                  <DateField value={date} onChange={setDate} />
                </div>
                <div>
                  <label className="small" style={{ color: 'var(--ink-soft)' }}>Weight (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={w}
                    onChange={(e) => setW(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="78,5"
                    autoFocus
                  />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="small" style={{ color: 'var(--ink-soft)' }}>Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. morning, before breakfast" />
              </div>
              <button className="btn primary" onClick={add}>Save</button>
              <button className="btn ghost mt-1" onClick={() => { setShowWeightForm(false); setW(''); setNote(''); }}>Cancel</button>
            </>
          )}
        </div>

        {chartData.length >= 2 && (
          <div className="card mt-2">
            <div className="section-title" style={{ marginTop: 0 }}>Trend</div>
            {(() => {
              // A line/area chart is the honest way to show weight: bars
              // from zero exaggerated tiny changes into dramatic drops.
              // We pad the y-range a little above/below the data so the
              // line sits in the middle and the curve is readable.
              const W = 300, H = 90, padX = 4, padY = 10;
              const pts = chartData.map((r, i) => {
                const x = padX + (chartData.length === 1 ? 0 : i * (W - 2 * padX) / (chartData.length - 1));
                const y = padY + (H - 2 * padY) * (1 - (r.weight_kg - min) / range);
                return [x, y];
              });
              const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
              const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
              return (
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="90" preserveAspectRatio="none" style={{ display: 'block' }}>
                  <path d={area} fill="var(--peach-soft)" />
                  <path d={line} fill="none" stroke="var(--peach)" strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {pts.map(([x, y], i) => (
                    <circle key={chartData[i].id} cx={x} cy={y} r="2.5" fill="var(--peach)">
                      <title>{`${fmtDate(chartData[i].log_date)}: ${chartData[i].weight_kg} kg`}</title>
                    </circle>
                  ))}
                </svg>
              );
            })()}
            <div className="small text-muted mt-1" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{fmtDate(chartData[0].log_date)}</span>
              <span>min {min.toFixed(1)} / max {max.toFixed(1)} kg</span>
              <span>{fmtDate(chartData[chartData.length - 1].log_date)}</span>
            </div>
          </div>
        )}

        <div className="section-title">History</div>
        {rows.length === 0 ? (
          <div className="empty"><div className="icon"><Icon name="scale" /></div><div>No entries yet</div></div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="list-row">
              <div className="meta">
                <div>
                  <div style={{ fontWeight: 600 }}>{r.weight_kg} kg</div>
                  <div className="small text-muted">{fmtDate(r.log_date)} {r.note && `· ${r.note}`}</div>
                </div>
              </div>
              <button className="btn tiny ghost" onClick={() => del(r.id)}><Icon name="xmark" /></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
