import { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);

  async function update(patch) {
    const next = await api.put('/settings', { ...settings, ...patch });
    setSettings(next);
  }

  async function exportCsv() {
    const token = localStorage.getItem('trackit_token');
    const r = await fetch('/api/csv/export', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) { alert('Export failed'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackit-export-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Reading file…');
    const text = await file.text();
    setImportStatus('Importing…');
    try {
      const res = await api.post('/csv/import', { csv: text });
      setImportStatus(`Imported ${res.imported} rows`);
    } catch (err) {
      setImportStatus('Import failed: ' + (err.message || err));
    }
    e.target.value = '';
  }

  return (
    <div className="app-shell page-settings">
      <TopBar back title="Settings" />
      <div className="content">
        {/* ── Rep input placeholder ────────────────────────────────────── */}
        <div className="section-title">Rep input placeholder</div>
        <div className="card">
          <div className="small text-muted mb-1">
            What should appear inside a set's rep input before you fill it in.
          </div>
          <div className="seg-group">
            <button
              className={`seg-btn${settings?.rep_placeholder_mode === 'empty' ? ' on' : ''}`}
              onClick={() => update({ rep_placeholder_mode: 'empty' })}
            >Keep empty</button>
            <button
              className={`seg-btn${settings?.rep_placeholder_mode === 'previous' ? ' on' : ''}`}
              onClick={() => update({ rep_placeholder_mode: 'previous' })}
            >Show previous reps</button>
          </div>
        </div>

        {/* ── Rest timer ───────────────────────────────────────────────── */}
        <div className="section-title">Rest timer</div>
        <div className="card">
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Sound</label>
            <div className="seg-group">
              <button
                className={`seg-btn${settings?.rest_timer_sound ? ' on' : ''}`}
                onClick={() => update({ rest_timer_sound: true })}
              >On</button>
              <button
                className={`seg-btn${!settings?.rest_timer_sound ? ' on' : ''}`}
                onClick={() => update({ rest_timer_sound: false })}
              >Off</button>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Vibration</label>
            <div className="seg-group">
              <button
                className={`seg-btn${settings?.rest_timer_vibrate ? ' on' : ''}`}
                onClick={() => update({ rest_timer_vibrate: true })}
              >On</button>
              <button
                className={`seg-btn${!settings?.rest_timer_vibrate ? ' on' : ''}`}
                onClick={() => update({ rest_timer_vibrate: false })}
              >Off</button>
            </div>
          </div>
        </div>

        {/* ── Data ─────────────────────────────────────────────────────── */}
        <div className="section-title">Data</div>
        <div className="card">
          <button className="btn primary" onClick={exportCsv}>📤 Export all data (CSV)</button>
          <div className="mt-2">
            <label className="btn ghost" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
              📥 Import from CSV
              <input type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: 'none' }} />
            </label>
            {importStatus && <div className="small text-muted mt-1">{importStatus}</div>}
          </div>
          <div className="small text-muted mt-2">
            Export gives one row per set. Import is additive — it never overwrites existing data.
          </div>
        </div>

        <div className="small text-muted mt-2" style={{ textAlign: 'center' }}>
          Manage exercise groups under the <strong>Exercises</strong> tab.
        </div>
      </div>
    </div>
  );
}
