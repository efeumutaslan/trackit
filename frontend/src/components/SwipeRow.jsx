import { useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Swipe-to-delete wrapper. Wrap any list row; dragging it left reveals a
// red delete affordance behind it. Releasing past the threshold (or
// tapping the revealed Delete) triggers onDelete. Works with touch and
// mouse/pointer. A small drag is treated as a tap so the row's own
// click/navigation still works.
//
// onDelete should handle its own confirmation if needed and return a
// promise (or nothing). The row animates closed after.
export default function SwipeRow({ children, onDelete, deleteLabel = 'Delete', className = '' }) {
  const [dx, setDx] = useState(0);          // current horizontal offset (<=0)
  const [open, setOpen] = useState(false);  // snapped-open state
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  const REVEAL = 84;     // width of the action area
  const SNAP = 40;       // drag past this snaps open
  const TRIGGER = 200;   // drag past this deletes immediately

  function down(x, y) {
    startX.current = x;
    startY.current = y;
    dragging.current = true;
    moved.current = false;
  }
  function moveTo(x, y) {
    if (!dragging.current) return;
    const deltaX = x - startX.current;
    const deltaY = y - startY.current;
    // Ignore mostly-vertical gestures (let the page scroll).
    if (!moved.current && Math.abs(deltaY) > Math.abs(deltaX)) {
      dragging.current = false;
      setDx(open ? -REVEAL : 0);
      return;
    }
    if (Math.abs(deltaX) > 4) moved.current = true;
    // Only allow dragging left; a little rightward to close when open.
    const base = open ? -REVEAL : 0;
    let next = base + deltaX;
    if (next > 0) next = 0;
    if (next < -TRIGGER - 40) next = -TRIGGER - 40;
    setDx(next);
  }
  async function up() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dx <= -TRIGGER) {
      await doDelete();
      return;
    }
    if (dx <= -SNAP) { setOpen(true); setDx(-REVEAL); }
    else { setOpen(false); setDx(0); }
  }
  async function doDelete() {
    try { await onDelete?.(); } finally { setOpen(false); setDx(0); }
  }

  // Suppress the child's click when the row was actually dragged.
  function onClickCapture(e) {
    if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; }
  }

  return (
    <div className={`swipe-row ${className}`.trim()}>
      <button
        className="swipe-row__action"
        style={{ width: REVEAL, opacity: dx < -2 ? 1 : 0, pointerEvents: dx < -2 ? 'auto' : 'none' }}
        onClick={doDelete}
        tabIndex={open ? 0 : -1}
        aria-label={deleteLabel}
      >
        <Icon name="trash" />
        <span>{deleteLabel}</span>
      </button>
      <div
        className="swipe-row__content"
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? 'none' : 'transform 0.2s ease' }}
        onClickCapture={onClickCapture}
        onTouchStart={(e) => down(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => moveTo(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={up}
      >
        {children}
      </div>
    </div>
  );
}
