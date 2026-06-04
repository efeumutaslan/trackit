import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Exercises() {
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState('');
  const [showGroupsMgr, setShowGroupsMgr] = useState(false);

  function loadAll() {
    api.get('/exercises').then(setRows).catch(() => {});
    api.get('/groups').then(setGroups).catch(() => {});
  }
  useEffect(loadAll, []);

  async function addGroup() {
    if (!newGroup.trim()) return;
    try {
      await api.post('/groups', { name: newGroup.trim() });
      setNewGroup('');
      loadAll();
    } catch (e) { alert(e.message); }
  }

  // Confirm deletion with a preview of every exercise in the group so the
  // user knows what will be left ungrouped.
  async function delGroup(g) {
    const inGroup = await api.get(`/groups/${g.id}/exercises`).catch(() => []);
    const lines = (inGroup || []).map((e) => `• ${e.name}`).join('\n');
    const msg = inGroup.length === 0
      ? `Delete the group "${g.name}"?`
      : `Do you really want to delete this group? This action can't be undone. Following exercises happen to be in this group:\n\n${lines}\n\nThey will become ungrouped.`;
    if (!confirm(msg)) return;
    await api.del(`/groups/${g.id}`);
    loadAll();
  }

  const grouped = rows.reduce((acc, e) => {
    const k = e.group_name || 'Ungrouped';
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});

  return (
    <div className="app-shell page-exercises">
      <TopBar back title="Exercises" />
      <div className="content">
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/exercises/new" className="btn primary" style={{ flex: 1, whiteSpace: 'nowrap' }}>+ New exercise</Link>
          <button className="btn ghost" style={{ flex: 1, whiteSpace: 'nowrap' }} onClick={() => setShowGroupsMgr((v) => !v)}>
            {showGroupsMgr ? 'Hide groups' : 'Manage groups'}
          </button>
        </div>

        {showGroupsMgr && (
          <div className="card mt-2">
            <div className="section-title" style={{ marginTop: 0 }}>Exercise groups</div>
            <div className="row mb-1">
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="e.g. Push, Pull, Legs, Cardio"
                onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }}
              />
              <button className="btn primary" style={{ width: 90, flexShrink: 0 }} onClick={addGroup}>+ Add</button>
            </div>
            {groups.length === 0 ? (
              <div className="small text-muted">No groups yet</div>
            ) : (
              groups.map((g) => (
                <div key={g.id} className="list-row">
                  <div className="meta">{g.name}</div>
                  <button className="btn tiny ghost" onClick={() => delGroup(g)}>✕</button>
                </div>
              ))
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="empty mt-2">
            <div className="icon">💪</div>
            <div>No exercises yet</div>
          </div>
        ) : (
          <div className="exercise-groups mt-2">
            {Object.entries(grouped).map(([gname, list]) => (
              <div key={gname} className="exercise-group">
                <div className="exercise-group__head">{gname}</div>
                <div className="exercise-group__list">
                  {list.map((e) => (
                    <Link to={`/exercises/${e.id}`} key={e.id} className="exercise-pill">
                      <span>💪</span>
                      <span>{e.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
