import Icon from './Icon.jsx';

export function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

// Date picker that ALWAYS displays dd.mm.yyyy regardless of the device
// locale. A native <input type="date"> can't be reformatted (iOS shows
// "11 Jun 2026", US Chrome shows mm/dd/yyyy), so we lay a transparent
// native input over our own dd.mm.yyyy text: tapping anywhere still opens
// the OS calendar, the value stays a real date, but the visible label is
// always dd.mm.yyyy.
export default function DateField({ value, onChange, className = '' }) {
  return (
    <div className={`date-field ${className}`.trim()}>
      <span className="date-field__text">{fmtDate(value) || 'dd.mm.yyyy'}</span>
      <Icon name="calendar" />
      <input
        type="date"
        className="date-field__native"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Date"
      />
    </div>
  );
}
