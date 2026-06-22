import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function NutritionEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [pct, setPct] = useState(100);        // water content 0..100 (stored as factor 0..1)
  const [defaultMl, setDefaultMl] = useState('250');

  useEffect(() => {
    if (!isNew) {
      api.get('/nutrition').then((rows) => {
        const it = rows.find((r) => r.id === +id);
        if (it) {
          setName(it.name);
          setPct(Math.round(it.water_factor * 100));
          setDefaultMl(it.default_ml != null ? String(it.default_ml) : '');
        }
      });
    }
  }, [id, isNew]);

  async function save() {
    if (!name.trim()) { alert('Name is required'); return; }
    const body = {
      name: name.trim(),
      water_factor: Math.min(1, Math.max(0, pct / 100)),
      default_ml: defaultMl === '' ? null : parseInt(defaultMl, 10),
    };
    try {
      if (isNew) await api.post('/nutrition', body);
      else await api.put(`/nutrition/${id}`, body);
      nav('/nutrition');
    } catch (e) {
      alert(e.message || 'Could not save');
    }
  }

  async function del() {
    if (!confirm('Delete this drink? Past water logs are kept.')) return;
    await api.del(`/nutrition/${id}`);
    nav('/nutrition');
  }

  return (
    <div className="app-shell page-nutrition-edit">
      <TopBar
        back
        title={isNew ? 'New drink' : 'Edit drink'}
        right={!isNew && <button className="right-action" onClick={del} style={{ color: 'var(--red)' }}>Delete</button>}
      />
      <div className="content">
        <div className="card">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ice Americano" />
          </div>

          <div className="field">
            <label>Water content — {pct}%</label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={pct}
              onChange={(e) => setPct(+e.target.value)}
              className="water-slider"
            />
            <div className="small text-muted" style={{ marginTop: 6 }}>
              How much of this drink counts as water. Plain water = 100%, coffee ≈ 95%,
              juice ≈ 85%, an iced americano ≈ 80%.
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Default amount (ml) — optional</label>
            <input
              type="number"
              inputMode="numeric"
              value={defaultMl}
              onChange={(e) => setDefaultMl(e.target.value)}
              placeholder="250"
            />
            <div className="small text-muted" style={{ marginTop: 6 }}>
              Pre-fills the amount when you log this drink.
            </div>
          </div>
        </div>

        <button className="btn primary block" onClick={save}>
          {isNew ? 'Add drink' : 'Save'}
        </button>
      </div>
    </div>
  );
}
