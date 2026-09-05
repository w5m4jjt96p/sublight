// The floating navigation, mirroring the iOS app: a capsule at the foot of the
// screen with the Sun at its centre — tap it to come back to the map — and the
// four destinations either side. Moving navigation out of the masthead also
// stops that bar from overflowing on a phone.
import type { ReactNode } from 'react';
import { IconGallery, IconMars, IconNearEarth, IconDeepSky, IconSun } from './Icons.tsx';

type View = 'map' | 'about' | 'gallery' | 'orbit' | 'mars' | 'deepsky' | 'traverse';
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
      onClick={() => onNavigate(view === target ? 'map' : target)}
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
        {item('gallery', 'Gallery', <IconGallery />)}
        {item('mars', 'Mars', <IconMars />)}
        <button
          className={`bn-home${view === 'map' ? ' is-on' : ''}`}
          onClick={onHome}
          aria-label="Solar system map"
        >
          <IconSun />
        </button>
        {item('orbit', 'Near-Earth', <IconNearEarth />)}
        {item('deepsky', 'Deep Sky', <IconDeepSky />)}
      </div>
    </nav>
  );
}
