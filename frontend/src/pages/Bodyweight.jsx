import { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export default function Bodyweight() {
  const [rows, setRows] = useState([]);
  const [date, setDate] = useState(todayISO);
  const [w, setW] = useState('');
  const [note, setNote] = useState('');

  function load() {
    api.get('/bodyweight').then(setRows).catch(() => {});
  }
  useEffect(load, []);

  async function add() {
    const parsed = parseFloat(String(w).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    await api.post('/bodyweight', { log_date: date, weight_kg: parsed, note });
    setW(''); setNote('');
    load();
  }

  async function del(id) {
    if (!confirm('Delete this entry?')) return;
    await api.del(`/bodyweight/${id}`);
    load();
  }

  // Mini chart — last 30 entries, oldest first
  const chartData = rows.slice(0, 30).reverse();
  const max = Math.max(...chartData.map((r) => r.weight_kg), 1);
  const min = Math.min(...chartData.map((r) => r.weight_kg), max);
  const range = Math.max(max - min, 1);

  return (
    <div className="app-shell page-bodyweight">
      <TopBar back title="Bodyweight" />
      <div className="content">
        <div className="card">
          <div className="row mb-1">
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Weight (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                value={w}
                onChange={(e) => setW(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="78,5"
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label className="small" style={{ color: 'var(--ink-soft)' }}>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. morning, before breakfast" />
          </div>
          <button className="btn primary" onClick={add}>Save</button>
        </div>

        {chartData.length >= 2 && (
          <div className="card mt-2">
            <div className="section-title" style={{ marginTop: 0 }}>Trend</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
              {chartData.map((r) => {
                const h = 6 + 80 * ((r.weight_kg - min) / range);
                return (
                  <div
                    key={r.id}
                    style={{
                      flex: 1,
                      height: h,
                      background: 'var(--peach)',
                      borderRadius: 3,
                    }}
                    title={`${fmtDate(r.log_date)}: ${r.weight_kg} kg`}
                  />
                );
              })}
            </div>
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
