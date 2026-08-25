// Jump-to search (⌘K / Ctrl+K / "/"). Since the map has no fleet list any more,
// this is how you reach a specific craft or body without hunting for a pixel.
// Styles: see the ".cp-*" block in src/styles/app.css.
import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchItem {
  kind: 'craft' | 'body';
  id: string;
  name: string;
  sub: string;
}

interface CommandPaletteProps {
  items: SearchItem[];
  onPick: (kind: 'craft' | 'body', id: string) => void;
  onClose: () => void;
}

export function CommandPalette({ items, onPick, onClose }: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (it) => it.name.toLowerCase().includes(needle) || it.sub.toLowerCase().includes(needle),
    );
  }, [q, items]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  const choose = (it: SearchItem | undefined) => {
    if (!it) return;
    onPick(it.kind, it.id);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    }
  };

  // keep the active row in view
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div className="cp" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Jump to">
        <input
          ref={inputRef}
          className="cp-input"
          placeholder="Jump to a craft or a planet…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          aria-label="Search"
        />
        <ul className="cp-list" ref={listRef}>
          {results.length === 0 && <li className="cp-empty">No match</li>}
          {results.map((it, i) => (
            <li key={`${it.kind}-${it.id}`}>
              <button
                className={`cp-row${i === active ? ' active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
              >
                <span className={`cp-badge cp-${it.kind}`}>{it.kind === 'body' ? 'BODY' : 'CRAFT'}</span>
                <span className="cp-name">{it.name}</span>
                <span className="cp-sub">{it.sub}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="cp-hint">↑ ↓ to move · ↵ to open · esc to close</div>
      </div>
    </div>
  );
}
