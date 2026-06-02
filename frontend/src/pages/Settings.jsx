import { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Settings() {
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState('');
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    api.get('/groups').then(setGroups).catch(() => {});
  }, []);

  async function addGroup() {
    if (!newGroup.trim()) return;
    try {
      await api.post('/groups', { name: newGroup.trim() });
      setNewGroup('');
      const list = await api.get('/groups');
      setGroups(list);
    } catch (e) { alert(e.message); }
  }

  async function delGroup(id) {
    if (!confirm('Delete this group? Exercises will become ungrouped.')) return;
    await api.del(`/groups/${id}`);
    const list = await api.get('/groups');
    setGroups(list);
  }

  async function exportCsv() {
    // Hit the protected endpoint with the auth token and trigger a download.
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
    <div className="app-shell">
      <TopBar back title="Settings" />
      <div className="content">
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
            Export gives one row per set. Import is additive — it never overwrites your existing data.
          </div>
        </div>

        <div className="section-title">Exercise groups</div>
        <div className="card">
          <div className="row mb-1">
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="e.g. Push, Pull, Legs, Cardio"
            />
            <button className="btn primary" style={{ width: 100, flexShrink: 0 }} onClick={addGroup}>+ Add</button>
          </div>
          {groups.length === 0 ? (
            <div className="empty"><div>No groups yet</div></div>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="list-row">
                <div className="meta">{g.name}</div>
                <button className="btn tiny ghost" onClick={() => delGroup(g.id)}>✕</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
