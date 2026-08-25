type View = 'map' | 'about' | 'gallery';

interface MastheadProps {
  trackingCount: number;
  utc: string;
  view: View;
  onNavigate: (view: View) => void;
  onOpenSearch: () => void;
}

export function Masthead({ trackingCount, utc, view, onNavigate, onOpenSearch }: MastheadProps) {
  const navLink = (target: 'gallery' | 'about', label: string) => (
    <a
      className={`mast-link${view === target ? ' active' : ''}`}
      href={`#${target}`}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(view === target ? 'map' : target);
      }}
    >
      {label}
    </a>
  );

  return (
    <div className="masthead">
      <button className="brand" onClick={() => onNavigate('map')} aria-label="Sublight — home">
        <img className="brand-logo" src="/sublight.svg" alt="Sublight" />
      </button>
      <div className="mast-right">
        <span>
          UTC <b>{utc}</b>
        </span>
        <span>
          TRACKING <b>{trackingCount}</b>
        </span>
        <button
          type="button"
          className="mast-link mast-search"
          onClick={onOpenSearch}
          aria-label="Search (press / or Cmd-K)"
        >
          Find ⌘K
        </button>
        {navLink('gallery', 'Gallery')}
        {navLink('about', 'About')}
      </div>
    </div>
  );
}
