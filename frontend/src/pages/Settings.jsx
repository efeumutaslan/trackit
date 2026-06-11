import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useSettings } from '../lib/settings.jsx';
import Icon from '../components/Icon.jsx';

export default function Settings() {
  const { settings, update } = useSettings();
  const [importStatus, setImportStatus] = useState('');
  const [incInput, setIncInput] = useState(
    settings?.weight_increment != null ? String(settings.weight_increment) : '2.5'
  );
  const { logoutAll } = useAuth();

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

  async function handleLogoutAll() {
    if (!confirm('Sign out of all devices? You will need to sign in again everywhere.')) return;
    await logoutAll();
  }

  // The optional features, with the settings key + label shown in the UI.
  const FEATURES = [
    { key: 'feat_rest_timer',    label: 'Rest timer',           desc: 'Countdown timer between sets.' },
    { key: 'feat_bodyweight',    label: 'Bodyweight tracking',  desc: 'The Body tab for logging your weight.' },
    { key: 'feat_weight_adjust', label: 'Weight ▲▼ indicator',  desc: 'The go-heavier / back-off buttons on each exercise.' },
    { key: 'feat_prev_note',     label: 'Previous exercise note', desc: 'The card recalling last session\u2019s note.' },
    { key: 'feat_tonnage',       label: 'Tonnage',              desc: 'Total volume (kg\u00d7reps) shown per exercise.' },
    { key: 'feat_heatmap',       label: 'Home calendar',        desc: 'The activity calendar / heatmap on the home screen.' },
  ];

  const isOn = (k) => settings?.[k] === 1 || settings?.[k] === true;

  return (
    <div className="app-shell page-settings">
      <TopBar back title="Settings" />
      <div className="content">
        {/* ── Library ──────────────────────────────────────────────────── */}
        <div className="section-title">Library</div>
        <div className="card" style={{ padding: 0 }}>
          <Link to="/templates" className="settings-link-row">
            <span className="settings-link-row__icon"><Icon name="ruler" /></span>
            <span className="settings-link-row__label">Templates</span>
            <span className="settings-link-row__chev"><Icon name="chevron-right" /></span>
          </Link>
          <Link to="/exercises" className="settings-link-row">
            <span className="settings-link-row__icon"><Icon name="dumbbell" /></span>
            <span className="settings-link-row__label">Exercises</span>
            <span className="settings-link-row__chev"><Icon name="chevron-right" /></span>
          </Link>
        </div>

        {/* ── Appearance / theme ───────────────────────────────────────── */}
        <div className="section-title">Appearance</div>
        <div className="card">
          <div className="small text-muted mb-1">
            Choose the look. “System” follows your device’s light/dark setting.
          </div>
          <div className="seg-group">
            {[
              { v: 'system', label: 'System' },
              { v: 'light',  label: 'Light' },
              { v: 'dark',   label: 'Dark' },
            ].map((o) => (
              <button
                key={o.v}
                className={`seg-btn${settings?.theme === o.v ? ' on' : ''}`}
                onClick={() => update({ theme: o.v })}
              >{o.label}</button>
            ))}
          </div>
        </div>

        {/* ── Optional features ────────────────────────────────────────── */}
        <div className="section-title">Features</div>
        <div className="card" style={{ padding: 0 }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.key}
              className="feature-row"
              style={i < FEATURES.length - 1 ? { borderBottom: '1px solid var(--gray-soft)' } : undefined}
            >
              <div className="feature-row__text">
                <div className="feature-row__label">{f.label}</div>
                <div className="small text-muted">{f.desc}</div>
              </div>
              <button
                role="switch"
                aria-checked={isOn(f.key)}
                className={`switch${isOn(f.key) ? ' on' : ''}`}
                onClick={() => update({ [f.key]: !isOn(f.key) })}
              >
                <span className="switch__knob" />
              </button>
            </div>
          ))}
        </div>

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

        {/* ── Weight increment ─────────────────────────────────────────── */}
        <div className="section-title">Weight increment</div>
        <div className="card">
          <div className="small text-muted mb-1">
            How much the +/- buttons change the weight on each tap.
          </div>
          <div className="seg-group mb-1">
            {[1.25, 2.5, 5].map((v) => (
              <button
                key={v}
                className={`seg-btn${Number(settings?.weight_increment) === v ? ' on' : ''}`}
                onClick={() => { setIncInput(String(v)); update({ weight_increment: v }); }}
              >{v} kg</button>
            ))}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Custom step (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              value={incInput}
              onChange={(e) => setIncInput(e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={() => {
                const n = parseFloat(String(incInput).replace(',', '.'));
                if (Number.isFinite(n) && n > 0 && n <= 100) {
                  update({ weight_increment: n });
                } else {
                  setIncInput(settings?.weight_increment != null ? String(settings.weight_increment) : '2.5');
                }
              }}
              placeholder="2.5"
            />
          </div>
        </div>

        {/* ── Rest timer (only relevant when the feature is on) ─────────── */}
        {isOn('feat_rest_timer') && (
          <>
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
          </>
        )}

        {/* ── Data ─────────────────────────────────────────────────────── */}
        <div className="section-title">Data</div>
        <div className="card">
          <button className="btn primary" onClick={exportCsv}><Icon name="export" /> Export all data (CSV)</button>
          <div className="mt-2">
            <label className="btn ghost" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
              <><Icon name="import" /> Import from CSV</>
              <input type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: 'none' }} />
            </label>
            {importStatus && <div className="small text-muted mt-1">{importStatus}</div>}
          </div>
          <div className="small text-muted mt-2">
            Export gives one row per set. Import is additive — it never overwrites existing data.
          </div>
        </div>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <div className="section-title">Account</div>
        <div className="card">
          <button className="btn ghost" onClick={handleLogoutAll}>
            <Icon name="sign-out" /> Sign out of all devices
          </button>
          <div className="small text-muted mt-1">
            Revokes every active session. Use this if a device was lost.
          </div>
        </div>

        <div className="small text-muted mt-2" style={{ textAlign: 'center' }}>
          Manage exercise groups under the <strong>Exercises</strong> section above.
        </div>
      </div>
    </div>
  );
}
