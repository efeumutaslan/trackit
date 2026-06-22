import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import SwipeRow from '../components/SwipeRow.jsx';

// Pick a sensible icon for a drink by name; falls back to a droplet.
function drinkIcon(name) {
  const n = (name || '').toLowerCase();
  if (/coffee|americano|espresso|latte|cappuccino|mocha|tea|çay|kahve/.test(n)) return 'mug-hot';
  if (/juice|soda|cola|meyve|smoothie|shake|milk|süt/.test(n)) return 'glass-water';
  return 'droplet';
}

export default function Nutrition() {
  const [rows, setRows] = useState([]);

  function load() { api.get('/nutrition').then(setRows).catch(() => {}); }
  useEffect(load, []);

  async function delItem(item) {
    if (!confirm(`Delete "${item.name}"? Past water logs are kept.`)) return;
    await api.del(`/nutrition/${item.id}`);
    setRows((cur) => cur.filter((r) => r.id !== item.id));
  }

  return (
    <div className="app-shell page-nutrition">
      <TopBar back title="Nutrition" />
      <div className="content">
        <Link to="/nutrition/new" className="btn primary block">+ New drink</Link>

        <div className="small text-muted" style={{ margin: '12px 4px' }}>
          Each drink has a water content. When you log it on the Body page, the amount you
          drank is multiplied by this to count toward your daily water.
        </div>

        <div className="nutrition-list">
          {rows.map((it) => (
            <SwipeRow key={it.id} onDelete={() => delItem(it)} className="swipe-row--pill">
              <Link to={`/nutrition/${it.id}`} className="exercise-pill">
                <span><Icon name={drinkIcon(it.name)} /></span>
                <span className="exercise-pill__name">{it.name}</span>
                <span className="nutrition-pill__pct">{Math.round(it.water_factor * 100)}%</span>
                <button
                  className="exercise-pill__del desktop-only"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); delItem(it); }}
                  title="Delete drink"
                ><Icon name="trash" /></button>
              </Link>
            </SwipeRow>
          ))}
        </div>
      </div>
    </div>
  );
}
