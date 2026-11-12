// The floating navigation, mirroring the iOS app: a capsule at the foot of the
// screen. The photos lead because they are home; tapping them there returns to
// the top of the stream, the way every feed does. Moving navigation out of the
// masthead also stops that bar from overflowing on a phone.
import type { ReactNode } from 'react';
import { IconGallery, IconMars, IconDeepSky, IconSun } from './Icons.tsx';

type View = 'map' | 'about' | 'gallery' | 'mars' | 'deepsky' | 'traverse';
// You can *be* on the traverse, but you never navigate to it from a nav item —
// it needs a rover id — so the callback takes the narrower set.
type NavTarget = Exclude<View, 'traverse'>;

interface BottomNavProps {
  view: View;
  onNavigate: (v: NavTarget) => void;
  onHome: () => void;
}

export function BottomNav({ view, onNavigate, onHome }: BottomNavProps) {
  const item = (target: NavTarget, label: string, icon: ReactNode) => (
    <button
      className={`bn-item${view === target ? ' is-on' : ''}`}
      onClick={() => {
        if (view !== target) onNavigate(target);
        else if (target === 'gallery') document.querySelector('.gallery-overlay')?.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      aria-label={label}
      aria-current={view === target ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="bottom-nav" aria-label="Sections">
      <div className="bn-capsule">
        {item('gallery', 'Photos', <IconGallery />)}
        <button
          className={`bn-item${view === 'map' ? ' is-on' : ''}`}
          onClick={onHome}
          aria-label="Solar system map"
          aria-current={view === 'map' ? 'page' : undefined}
        >
          <IconSun />
          <span>Map</span>
        </button>
        {item('mars', 'Mars', <IconMars />)}
        {item('deepsky', 'Deep Sky', <IconDeepSky />)}
      </div>
    </nav>
  );
}
