// Monoline icons drawn for Sublight: 24x24, currentColor, 1.5 stroke, round
// caps — the same weight as the rules and type, so they sit quietly next to
// mono text rather than shouting.
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

/** UTC — a clock face reading a few minutes past. */
export function IconClock(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.3 2" />
    </svg>
  );
}

/** Tracking — a carrier going out, the fleet answering back. */
export function IconTracking(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <path d="M8.6 15.4a4.8 4.8 0 0 1 0-6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8" />
      <path d="M5.9 18.1a8.6 8.6 0 0 1 0-12.2M18.1 5.9a8.6 8.6 0 0 1 0 12.2" />
    </svg>
  );
}

/** Mars — a disc with its polar cap and one dark basin. */
export function IconMars(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.4 5.2a8.5 8.5 0 0 0 7.2 0" />
      <circle cx="9.6" cy="13.6" r="1.7" />
      <path d="M14.1 15.8c1.1-.6 2-1.6 2.5-2.8" />
    </svg>
  );
}

/** Near-Earth — a globe inside a tilted orbit, with something on it. */
export function IconNearEarth(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="5.4" />
      <ellipse cx="12" cy="12" rx="9" ry="3.9" transform="rotate(-25 12 12)" />
      <circle cx="20.2" cy="8.2" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Deep Sky — one bright star and two far fainter ones. */
export function IconDeepSky(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M11.5 3.8l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6L5 10.3l4.6-1.9z" />
      <path d="M18.6 15.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" />
      <path d="M6 17.6l.45 1.1 1.1.45-1.1.45L6 20.7l-.45-1.1-1.1-.45 1.1-.45z" />
    </svg>
  );
}

/** Gallery — stacked frames, the front one holding a horizon and a sun. */
export function IconGallery(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="7.5" y="3.5" width="13" height="10" rx="2" />
      <rect x="3.5" y="9.5" width="13" height="11" rx="2" />
      <circle cx="7.6" cy="13.4" r="1.25" />
      <path d="M3.9 18.9l3.1-2.9 2.7 2.4 2-1.7 4.4 3.8" />
    </svg>
  );
}

/** The map home: the Sun the whole thing orbits. */
export function IconSun(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4.3" />
      <path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </svg>
  );
}

export function IconSearch(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.5 15.5l4 4" />
    </svg>
  );
}
