// -----------------------------------------------------------------------------
// TweakPanel — a DEV-ONLY live style editor. It writes CSS custom properties on
// <html> so any value using var(--token) updates instantly. Nothing here ships:
// App only mounts it when import.meta.env.DEV is true, and the markup carries its
// own <style>, so the production bundle never includes it.
//
// Copy the changed tokens and paste them into src/styles/tokens.css to keep them.
// -----------------------------------------------------------------------------
import { useMemo, useState } from 'react';

type Control =
  | { name: string; label: string; type: 'color' }
  | { name: string; label: string; type: 'px'; min: number; max: number }
  | { name: string; label: string; type: 'scale'; min: number; max: number };

const CONTROLS: Control[] = [
  { name: '--font-scale', label: 'Text scale (all)', type: 'scale', min: 0.8, max: 1.6 },
  { name: '--void', label: 'Background', type: 'color' },
  { name: '--panel', label: 'Panel', type: 'color' },
  { name: '--rule', label: 'Rule', type: 'color' },
  { name: '--rule-2', label: 'Rule 2', type: 'color' },
  { name: '--txt', label: 'Text', type: 'color' },
  { name: '--dim', label: 'Text dim', type: 'color' },
  { name: '--dim-2', label: 'Text faint', type: 'color' },
  { name: '--signal', label: 'Signal (active)', type: 'color' },
  { name: '--delay', label: 'Amber (light-time)', type: 'color' },
  { name: '--dead', label: 'Silent', type: 'color' },
  { name: '--masthead-h', label: 'Masthead height', type: 'px', min: 36, max: 96 },
];

// Per-text font-size tokens (base px, before --font-scale), grouped by area.
interface FontItem {
  name: string;
  label: string;
  base: number;
}
const FONT_GROUPS: { group: string; items: FontItem[] }[] = [
  {
    group: 'Masthead',
    items: [
      { name: '--fs-brand', label: 'Brand', base: 14.5 },
      { name: '--fs-mast-right', label: 'UTC / tracking', base: 12.5 },
      { name: '--fs-body', label: 'Body default', base: 15.5 },
    ],
  },
  {
    group: 'HUD (over map)',
    items: [
      { name: '--fs-hud-eyebrow', label: 'Eyebrow', base: 11.5 },
      { name: '--fs-hud-name', label: 'Craft name', base: 31 },
      { name: '--fs-hud-name-caret', label: 'Name caret ↗', base: 18 },
      { name: '--fs-hud-loc', label: 'Location', base: 13.5 },
      { name: '--fs-stat-l', label: 'Stat label', base: 11.5 },
      { name: '--fs-stat-v', label: 'Stat value', base: 28 },
      { name: '--fs-stat-v-small', label: 'Stat value small', base: 18 },
      { name: '--fs-ctrl', label: 'Buttons', base: 11.5 },
    ],
  },
  {
    group: 'Thumbnail',
    items: [
      { name: '--fs-thumb-foot', label: 'Caption', base: 11 },
      { name: '--fs-thumb-expand', label: 'Expand hint', base: 10.5 },
      { name: '--fs-thumb-none', label: 'Telemetry only', base: 11 },
      { name: '--fs-thumb-credit', label: 'Credit', base: 10.5 },
    ],
  },
  {
    group: 'Detail panel',
    items: [
      { name: '--fs-detail-name', label: 'Name', base: 29 },
      { name: '--fs-detail-sub', label: 'Subtitle', base: 12 },
      { name: '--fs-detail-note', label: 'Note', base: 15 },
      { name: '--fs-detail-grid-v', label: 'Stat value', base: 17 },
      { name: '--fs-detail-section-l', label: 'Section label', base: 11.5 },
      { name: '--fs-detail-source', label: 'Source line', base: 11 },
    ],
  },
  {
    group: 'Viewer (lightbox)',
    items: [
      { name: '--fs-lb-craft', label: 'Craft name', base: 22 },
      { name: '--fs-lb-meta', label: 'Meta', base: 12 },
      { name: '--fs-lb-nav', label: 'Arrows ‹ ›', base: 26 },
      { name: '--fs-lb-times', label: 'Times', base: 14.5 },
      { name: '--fs-lb-times-lb-l', label: 'Time labels', base: 11.5 },
      { name: '--fs-lb-arrow', label: 'Light arrow', base: 12 },
      { name: '--fs-lb-credit', label: 'Credit', base: 11 },
    ],
  },
  {
    group: 'Gallery & feed',
    items: [
      { name: '--fs-gal-h1', label: 'Title', base: 30 },
      { name: '--fs-gal-lede', label: 'Lede', base: 14 },
      { name: '--fs-gal-shelf', label: 'Shelf label', base: 11 },
      { name: '--fs-post-craft', label: 'Craft name', base: 14 },
      { name: '--fs-post-loc', label: 'Location', base: 11 },
      { name: '--fs-post-when', label: 'Arrived', base: 11.5 },
      { name: '--fs-post-caption', label: 'Caption', base: 12.5 },
      { name: '--fs-post-light', label: 'Light line', base: 12 },
    ],
  },
  {
    group: 'Chrome',
    items: [
      { name: '--fs-mast-stat', label: 'Masthead readout', base: 17 },
      { name: '--fs-mast-stat-em', label: 'Readout label', base: 11.5 },
      { name: '--fs-nav-label', label: 'Nav label', base: 13 },
    ],
  },
  {
    group: 'About page',
    items: [
      { name: '--fs-about-h1', label: 'H1', base: 36 },
      { name: '--fs-about-lede', label: 'Lede', base: 17 },
      { name: '--fs-about-h2', label: 'H2', base: 19 },
      { name: '--fs-about-p', label: 'Paragraph', base: 15.5 },
      { name: '--fs-about-ul', label: 'List', base: 15.5 },
      { name: '--fs-about-a-back', label: 'Back link', base: 12 },
    ],
  },
];
const FONT_ITEMS = FONT_GROUPS.flatMap((g) => g.items);

// Two roles, two tokens. `--sans` is the display face (titles, craft names),
// `--mono` carries every number and every small label.
const FACE_TOKENS = [
  { name: '--sans', label: 'Titles' },
  { name: '--mono', label: 'Numbers & labels' },
] as const;

// What is actually bundled, plus system stacks that need no download. Anything
// else has to be pulled from Google Fonts, which is why that is a separate box.
const BUNDLED_FACES: { label: string; stack: string }[] = [
  { label: 'Stack Sans Notch', stack: "'Stack Sans Notch', system-ui, sans-serif" },
  { label: 'Roboto Mono', stack: "'Roboto Mono', ui-monospace, Menlo, monospace" },
  { label: 'IBM Plex Sans', stack: "'IBM Plex Sans', system-ui, sans-serif" },
  { label: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, Menlo, monospace" },
  { label: 'System sans', stack: 'system-ui, -apple-system, sans-serif' },
  { label: 'System mono', stack: 'ui-monospace, SF Mono, Menlo, monospace' },
  { label: 'Georgia (serif)', stack: 'Georgia, Times, serif' },
];

/**
 * Pull a family from Google Fonts at runtime so a face can be judged in place
 * before anyone commits to self-hosting it. DEV only, like the rest of this
 * panel: nothing here reaches a build, and the site itself never calls a CDN.
 */
function loadGoogleFont(family: string) {
  const id = `tw-gf-${family.replace(/\W+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
const fontCalc = (px: number) => `calc(${px}px * var(--font-scale))`;

const root = () => document.documentElement;
const readVar = (name: string) => getComputedStyle(root()).getPropertyValue(name).trim();

export function TweakPanel() {
  const initial = useMemo(() => {
    const o: Record<string, string> = {};
    for (const c of CONTROLS) o[c.name] = readVar(c.name);
    return o;
  }, []);
  // Read each token's current base px straight from tokens.css (getComputedStyle
  // returns e.g. "calc(40px * 1.2)"), so the panel never drifts from the source.
  // The config `base` is only a fallback if parsing fails.
  const fontBase = useMemo(() => {
    const cs = getComputedStyle(root());
    return Object.fromEntries(
      FONT_ITEMS.map((f) => {
        const m = cs.getPropertyValue(f.name).match(/([0-9.]+)px/);
        return [f.name, m ? parseFloat(m[1]!) : f.base];
      }),
    );
  }, []);

  const [open, setOpen] = useState(false);
  const [fontsOpen, setFontsOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [fonts, setFonts] = useState<Record<string, number>>(fontBase);
  const [faces, setFaces] = useState<Record<string, string>>(() =>
    Object.fromEntries(FACE_TOKENS.map((f) => [f.name, readVar(f.name)])),
  );
  const [gfName, setGfName] = useState('');
  const [gfTarget, setGfTarget] = useState<string>('--sans');
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);

  const setVar = (name: string, value: string) => {
    root().style.setProperty(name, value);
    setValues((v) => ({ ...v, [name]: value }));
    setCopied(false);
  };
  const setFont = (name: string, px: number) => {
    root().style.setProperty(name, fontCalc(px));
    setFonts((f) => ({ ...f, [name]: px }));
    setCopied(false);
  };

  const setFace = (name: string, stack: string) => {
    root().style.setProperty(name, stack);
    setFaces((f) => ({ ...f, [name]: stack }));
    setCopied(false);
  };

  const applyGoogleFont = () => {
    const family = gfName.trim();
    if (!family) return;
    loadGoogleFont(family);
    const generic = gfTarget === '--mono' ? 'monospace' : 'sans-serif';
    setFace(gfTarget, `'${family}', ${generic}`);
  };

  const applyZoom = (z: number) => {
    setZoom(z);
    (root().style as CSSStyleDeclaration & { zoom?: string }).zoom = z === 1 ? '' : String(z);
  };

  const initialFaces = useMemo(
    () => Object.fromEntries(FACE_TOKENS.map((f) => [f.name, readVar(f.name)])),
    [],
  );
  const changedFaces = FACE_TOKENS.filter((f) => faces[f.name] !== initialFaces[f.name]);
  const changed = CONTROLS.filter((c) => values[c.name] !== initial[c.name]);
  const changedFonts = FONT_ITEMS.filter((f) => fonts[f.name] !== fontBase[f.name]);

  const reset = () => {
    for (const c of CONTROLS) root().style.removeProperty(c.name);
    for (const f of FONT_ITEMS) root().style.removeProperty(f.name);
    for (const f of FACE_TOKENS) root().style.removeProperty(f.name);
    setFaces(initialFaces);
    applyZoom(1);
    setValues(initial);
    setFonts(fontBase);
    setCopied(false);
  };

  const copy = () => {
    const lines = [
      ...changed.map((c) => `  ${c.name}: ${values[c.name]};`),
      ...changedFonts.map((f) => `  ${f.name}: ${fontCalc(fonts[f.name]!)};`),
      ...changedFaces.map((f) => `  ${f.name}: ${faces[f.name]};`),
    ];
    if (lines.length === 0) return;
    navigator.clipboard.writeText(`:root {\n${lines.join('\n')}\n}\n`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const totalChanged = changed.length + changedFonts.length + changedFaces.length;

  if (!open) {
    return (
      <button className="tw-fab" onClick={() => setOpen(true)} title="Open style tweaker">
        ⚙
        <TweakStyles />
      </button>
    );
  }

  return (
    <div className="tw-panel">
      <TweakStyles />
      <div className="tw-head">
        <span>Style tweaker · dev</span>
        <button className="tw-x" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="tw-body">
        <div className="tw-face-block">
          {FACE_TOKENS.map((f) => (
            <label className="tw-row" key={f.name}>
              <span className="tw-label">{f.label}</span>
              <select
                className="tw-select"
                value={BUNDLED_FACES.find((b) => b.stack === faces[f.name])?.stack ?? ''}
                onChange={(e) => setFace(f.name, e.target.value)}
              >
                <option value="" disabled>
                  {faces[f.name]?.split(',')[0]?.replace(/'/g, '') || 'custom'}
                </option>
                {BUNDLED_FACES.map((b) => (
                  <option key={b.label} value={b.stack}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="tw-row">
            <span className="tw-label">Try a Google font</span>
            <span className="tw-gf">
              <select className="tw-select" value={gfTarget} onChange={(e) => setGfTarget(e.target.value)}>
                <option value="--sans">Titles</option>
                <option value="--mono">Labels</option>
              </select>
              <input
                type="text"
                className="tw-hex"
                placeholder="Space Grotesk"
                value={gfName}
                spellCheck={false}
                onChange={(e) => setGfName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyGoogleFont(); }}
              />
              <button className="tw-go" onClick={applyGoogleFont}>load</button>
            </span>
          </label>
        </div>

        {CONTROLS.map((c) => (
          <label className="tw-row" key={c.name}>
            <span className="tw-label">{c.label}</span>
            {c.type === 'color' ? (
              <span className="tw-color">
                <input
                  type="color"
                  value={values[c.name] || '#000000'}
                  onChange={(e) => setVar(c.name, e.target.value)}
                />
                <input
                  type="text"
                  className="tw-hex"
                  value={values[c.name] ?? ''}
                  onChange={(e) => setVar(c.name, e.target.value)}
                  spellCheck={false}
                />
              </span>
            ) : c.type === 'px' ? (
              <span className="tw-range">
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  value={parseInt(values[c.name] || '0', 10) || c.min}
                  onChange={(e) => setVar(c.name, `${e.target.value}px`)}
                />
                <span className="tw-num">{values[c.name]}</span>
              </span>
            ) : (
              <span className="tw-range">
                <input
                  type="range"
                  min={Math.round(c.min * 100)}
                  max={Math.round(c.max * 100)}
                  step={5}
                  value={Math.round((parseFloat(values[c.name] || '1') || 1) * 100)}
                  onChange={(e) => setVar(c.name, String(Number(e.target.value) / 100))}
                />
                <span className="tw-num">{(parseFloat(values[c.name] || '1') || 1).toFixed(2)}×</span>
              </span>
            )}
          </label>
        ))}

        <label className="tw-row">
          <span className="tw-label">Zoom (preview)</span>
          <span className="tw-range">
            <input
              type="range"
              min={80}
              max={140}
              value={Math.round(zoom * 100)}
              onChange={(e) => applyZoom(Number(e.target.value) / 100)}
            />
            <span className="tw-num">{Math.round(zoom * 100)}%</span>
          </span>
        </label>

        {/* --- per-text font sizes --- */}
        <button className="tw-section" onClick={() => setFontsOpen((v) => !v)}>
          <span>{fontsOpen ? '▾' : '▸'} Font sizes (px){changedFonts.length ? ` · ${changedFonts.length}` : ''}</span>
        </button>
        {fontsOpen &&
          FONT_GROUPS.map((g) => (
            <div key={g.group}>
              <div className="tw-group">{g.group}</div>
              {g.items.map((f) => (
                <label className="tw-row" key={f.name}>
                  <span className="tw-label">{f.label}</span>
                  <span className="tw-range">
                    <input
                      type="range"
                      min={8}
                      max={56}
                      step={0.5}
                      value={fonts[f.name] ?? f.base}
                      onChange={(e) => setFont(f.name, Number(e.target.value))}
                    />
                    <span className="tw-num">{fonts[f.name]}px</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
      </div>

      <div className="tw-foot">
        <button className="tw-btn" onClick={reset}>
          Reset
        </button>
        <button className="tw-btn tw-primary" onClick={copy} disabled={totalChanged === 0}>
          {copied ? 'Copied ✓' : `Copy ${totalChanged || ''} token${totalChanged === 1 ? '' : 's'}`}
        </button>
      </div>
      <div className="tw-hint">Paste the copied block into src/styles/tokens.css to keep it.</div>
    </div>
  );
}

function TweakStyles() {
  return (
    <style>{`
      .tw-fab {
        position: fixed; left: 14px; bottom: 14px; z-index: 100;
        width: 34px; height: 34px; border-radius: 50%;
        background: var(--panel); color: var(--dim);
        border: 1px solid var(--rule-2); cursor: pointer; font-size: 16px;
      }
      .tw-fab:hover { color: var(--txt); border-color: var(--dim-2); }
      .tw-panel {
        position: fixed; right: 14px; top: calc(var(--masthead-h) + 12px); z-index: 100;
        width: 300px; max-height: calc(100vh - var(--masthead-h) - 24px);
        display: flex; flex-direction: column;
        background: rgba(9,12,17,.97); backdrop-filter: blur(8px);
        border: 1px solid var(--rule-2); font-family: var(--mono);
        box-shadow: 0 10px 40px rgba(0,0,0,.5);
      }
      .tw-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid var(--rule);
        font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim-2);
      }
      .tw-x { background: none; border: none; color: var(--dim); cursor: pointer; font-size: 13px; }
      .tw-x:hover { color: var(--txt); }
      .tw-body { padding: 8px 12px; overflow-y: auto; }
      .tw-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; padding: 4px 0;
      }
      .tw-label { font-size: 12px; color: var(--dim); flex: 1 1 auto; }
      .tw-color { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
      .tw-color input[type=color] {
        width: 24px; height: 22px; padding: 0; border: 1px solid var(--rule-2);
        background: none; cursor: pointer;
      }
      .tw-hex {
        width: 74px; background: var(--void); color: var(--txt);
        border: 1px solid var(--rule-2); font-family: var(--mono); font-size: 11.5px;
        padding: 3px 5px;
      }
      .tw-face-block { border-bottom: 1px solid var(--rule); padding-bottom: 8px; margin-bottom: 4px; }
      .tw-select {
        background: var(--void); color: var(--txt); border: 1px solid var(--rule-2);
        font-family: var(--mono); font-size: 11.5px; padding: 3px 4px; max-width: 150px;
      }
      .tw-gf { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
      .tw-gf .tw-select { max-width: 72px; }
      .tw-gf .tw-hex { width: 104px; }
      .tw-go {
        background: var(--rule-2); color: var(--txt); border: none; cursor: pointer;
        font-family: var(--mono); font-size: 11px; padding: 4px 7px;
      }
      .tw-go:hover { background: var(--dim-2); }
      .tw-range { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .tw-range input { width: 96px; }
      .tw-num { font-size: 11.5px; color: var(--txt); min-width: 46px; text-align: right; }
      .tw-section {
        width: 100%; text-align: left; margin: 8px 0 2px; padding: 7px 0;
        background: none; border: none; border-top: 1px solid var(--rule);
        color: var(--txt); font-family: var(--mono); font-size: 11px;
        letter-spacing: .1em; text-transform: uppercase; cursor: pointer;
      }
      .tw-group {
        margin: 8px 0 2px; font-size: 10px; letter-spacing: .14em;
        text-transform: uppercase; color: var(--signal); opacity: .8;
      }
      .tw-foot { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--rule); }
      .tw-btn {
        flex: 1; background: transparent; border: 1px solid var(--rule-2); color: var(--dim);
        font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
        padding: 7px; cursor: pointer;
      }
      .tw-btn:hover:not(:disabled) { color: var(--txt); border-color: var(--dim-2); }
      .tw-btn:disabled { opacity: .4; cursor: default; }
      .tw-primary { color: var(--signal); border-color: var(--signal); }
      .tw-hint { padding: 0 12px 12px; font-size: 10px; color: var(--dim-2); line-height: 1.5; }
    `}</style>
  );
}
