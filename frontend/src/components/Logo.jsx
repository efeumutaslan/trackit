// Inline SVG of the TrackIt brand mark. Same geometry as the favicon
// (3 ascending bars + a tracker ring on the tallest), proportioned for
// the golden ratio so each bar is ~φ taller than the previous.
//
// Usage:
//   <Logo size={32} />          // brand mark in the topbar
//   <Logo size={72} />          // login splash
// Pass a className to layer it into flex / grid containers.
export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="TrackIt"
    >
      {/* Three bars stepping up by ≈φ (golden ratio). Heights 6→10→18.
          Widths 5, gaps 2. Baseline y=26. */}
      <rect x="6"  y="20" width="5" height="6"  rx="1.4" fill="#5C6E26" />
      <rect x="13" y="16" width="5" height="10" rx="1.4" fill="#9DBF35" />
      <rect x="20" y="8"  width="5" height="18" rx="1.4" fill="#D3FF56" />
      {/* Tracker ring on top of the tallest bar — the "marker" point */}
      <circle cx="22.5" cy="8" r="3" fill="currentColor" stroke="#D3FF56" strokeWidth="2" />
    </svg>
  );
}
