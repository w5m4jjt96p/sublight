// The masthead now carries identity and live readouts only — the clock and the
// tracking count, each with its icon. Navigation moved to the floating bar at
// the foot of the screen, which is also what stopped this row overflowing on a
// phone.
import { IconClock, IconTracking, IconSearch } from './Icons.tsx';

type View = 'map' | 'about' | 'gallery' | 'orbit' | 'mars' | 'deepsky' | 'traverse';
// You can *be* on the traverse, but you never navigate to it from a nav item —
// it needs a rover id — so the callback takes the narrower set.
type NavTarget = Exclude<View, 'traverse'>;

interface MastheadProps {
  trackingCount: number;
  utc: string;
  view: View;
  onNavigate: (view: NavTarget) => void;
  onOpenSearch: () => void;
}

export function Masthead({ trackingCount, utc, view, onNavigate, onOpenSearch }: MastheadProps) {
  return (
    <div className="masthead">
      <button className="brand" onClick={() => onNavigate('map')} aria-label="Sublight — home">
        <img className="brand-logo" src="/sublight.svg" alt="Sublight" />
      </button>

      <div className="mast-status">
        <span className="mast-stat" title="Coordinated Universal Time">
          <IconClock className="mast-icon" />
          <b>{utc}</b>
          <em>UTC</em>
        </span>
        <span className="mast-stat" title="Craft currently tracked">
          <IconTracking className="mast-icon" />
          <b>{trackingCount}</b>
          <em>tracking</em>
        </span>
      </div>

      <div className="mast-right">
        <button type="button" className="mast-icon-btn" onClick={onOpenSearch} aria-label="Search (press / or Cmd-K)">
          <IconSearch className="mast-icon" />
        </button>
        <a
          className={`mast-link${view === 'about' ? ' active' : ''}`}
          href="#about"
          onClick={(e) => { e.preventDefault(); onNavigate(view === 'about' ? 'map' : 'about'); }}
        >
          About
        </a>
      </div>
    </div>
  );
}
