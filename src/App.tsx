import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Masthead } from './ui/Masthead.tsx';
import { Hud } from './ui/Hud.tsx';
import { DetailPanel } from './ui/DetailPanel.tsx';
import { BodyPanel, type BodyPhoto } from './ui/BodyPanel.tsx';
import { CommandPalette, type SearchItem } from './ui/CommandPalette.tsx';
import { BODIES } from './data/bodies.ts';
import { Lightbox } from './ui/Lightbox.tsx';
import { About } from './ui/About.tsx';
import { Gallery } from './ui/Gallery.tsx';
import { Traverse } from './ui/Traverse.tsx';
import { TweakPanel } from './ui/TweakPanel.tsx';
import { useData } from './data/useData.ts';
import { useNow } from './data/useNow.ts';
import { useDsn } from './data/useDsn.ts';
import { useMapEngine } from './map/useMapEngine.ts';
import { owltAt, rangeAt } from './data/lightTime.ts';
import type { MapCraft } from './map/model.ts';
import type { FrameThumb } from './types.ts';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const { model, frames, archive, bodyPhotos, tracks, generatedAt, loading } = useData();
  const now = useNow();
  const dsn = useDsn();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const showPath = true; // the signal path is always drawn now
  const [detailOpen, setDetailOpen] = useState(true);
  const [lightbox, setLightbox] = useState<{
    frames: FrameThumb[];
    index: number;
    craftName: string;
    credit: string;
    owlt: number | null;
  } | null>(null);
  const [view, setView] = useState<'map' | 'about' | 'gallery' | 'traverse'>(() => {
    if (window.location.hash === '#about') return 'about';
    if (window.location.hash === '#gallery') return 'gallery';
    if (window.location.hash.startsWith('#t/')) return 'traverse';
    return 'map';
  });
  const [traverseId, setTraverseId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Reserve the info panel's width so a flown-to body is centred in the *visible*
  // map, not hidden behind the panel — measured from the panel's real position,
  // so it adapts whether the panel is styled on the left or the right.
  const panelOpen = (detailOpen && !!selectedId) || !!selectedBodyId;
  const [focusInset, setFocusInset] = useState(0);
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const el = document.querySelector('.detail') as HTMLElement | null;
    if (!panelOpen || !el || vw <= 560) {
      setFocusInset(0);
      return;
    }
    const r = el.getBoundingClientRect();
    const onLeft = r.left + r.width / 2 < vw / 2;
    // px the panel occupies from its edge; sign it so the map shifts *away* from it
    const occupied = (onLeft ? r.right : vw - r.left) + 20;
    setFocusInset(onLeft ? -occupied : occupied);
  }, [panelOpen, selectedId, selectedBodyId, now]);

  const controls = useMapEngine({
    canvasRef,
    stageRef,
    model,
    frames,
    selectedId,
    showPath,
    focusInset,
    onPick,
  });

  // Apply state without touching the hash (used when the hash itself changed).
  function applyCraft(id: string) {
    setSelectedBodyId(null);
    setSelectedId(id);
    setDetailOpen(true);
    controls.flyTo(id);
  }
  function applyBody(id: string) {
    setSelectedId(null);
    setSelectedBodyId(id);
    controls.flyToBody(id);
  }

  // User picks write the hash; the effect below is the single place that applies
  // it — so deep links, clicks, search and the back button all share one path.
  function onPick(kind: 'craft' | 'body', id: string) {
    const h = kind === 'craft' ? `#c/${id}` : `#b/${id}`;
    if (window.location.hash === h) {
      if (kind === 'craft') applyCraft(id);
      else applyBody(id);
    } else {
      window.location.hash = h;
    }
  }

  function navigate(v: 'map' | 'about' | 'gallery') {
    if (v === 'about') window.location.hash = '#about';
    else if (v === 'gallery') window.location.hash = '#gallery';
    else
      window.location.hash = selectedBodyId
        ? `#b/${selectedBodyId}`
        : selectedId
          ? `#c/${selectedId}`
          : '#map';
  }

  // Single source of truth: parse the hash → view + selection. Runs once the
  // model is ready (initial deep link) and on every hash change (back/forward).
  useEffect(() => {
    if (!model) return;
    const apply = () => {
      const h = window.location.hash;
      if (h === '#about') {
        setView('about');
        return;
      }
      if (h === '#gallery') {
        setView('gallery');
        return;
      }
      const tm = h.match(/^#t\/(.+)$/);
      if (tm && tracks[tm[1]!]) {
        setView('traverse');
        setTraverseId(tm[1]!);
        setSelectedId(tm[1]!); // keep the craft selected underneath
        return;
      }
      setView('map');
      const m = h.match(/^#([cb])\/(.+)$/);
      if (m && m[1] === 'c' && model.craft.some((c) => c.entry.id === m[2])) {
        applyCraft(m[2]!);
      } else if (m && m[1] === 'b' && BODIES[m[2]!]) {
        applyBody(m[2]!);
      } else {
        setSelectedId(null);
        setSelectedBodyId(null);
        controls.reset(); // whole system, centred on the Sun
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // ⌘K / Ctrl+K / "/" opens the jump-to search (unless already typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchItems: SearchItem[] = useMemo(() => {
    const craftItems: SearchItem[] = (model?.craft ?? []).map((c) => ({
      kind: 'craft',
      id: c.entry.id,
      name: c.entry.name,
      sub: c.entry.location,
    }));
    craftItems.sort((a, b) => a.name.localeCompare(b.name));
    const bodyItems: SearchItem[] = Object.entries(BODIES).map(([id, b]) => ({
      kind: 'body',
      id,
      name: b.name,
      sub: b.kind,
    }));
    return [...craftItems, ...bodyItems];
  }, [model]);

  const selected: MapCraft | null = useMemo(
    () => (model && selectedId ? model.craft.find((c) => c.entry.id === selectedId) ?? null : null),
    [model, selectedId],
  );

  const selOwlt = selected && generatedAt ? owltAt(selected.eph, generatedAt, now) : null;
  const selRange = selected && generatedAt ? rangeAt(selected.eph, generatedAt, now) : null;
  const selFrame = selected ? frames[selected.entry.id] : undefined;
  const selArchive = selected ? archive[selected.entry.id] : undefined;
  const selContact = selected ? dsn.byCraft[selected.entry.id] : undefined;

  // Open the live-frame viewer for a craft at a given recent-frame index.
  const openLightbox = (craftId: string, index: number) => {
    const f = frames[craftId];
    const craft = model?.craft.find((c) => c.entry.id === craftId);
    if (!f || !craft) return;
    const list = f.recent?.length
      ? f.recent
      : [{ file: f.file, full: f.full, sourceUrl: f.sourceUrl, instrument: f.instrument, capturedUtc: f.capturedUtc, sol: f.sol }];
    setLightbox({
      frames: list,
      index,
      craftName: craft.entry.name,
      credit: f.credit,
      owlt: generatedAt ? owltAt(craft.eph, generatedAt, now) : null,
    });
  };

  // Open the archive still full-screen (no live capture time).
  const openArchive = (craftId: string) => {
    const a = archive[craftId];
    const craft = model?.craft.find((c) => c.entry.id === craftId);
    if (!a || !craft) return;
    setLightbox({
      frames: [{ file: a.file, full: a.full, sourceUrl: a.sourceUrl, instrument: a.title, capturedUtc: '', sol: null }],
      index: 0,
      craftName: craft.entry.name,
      credit: a.credit,
      owlt: null,
    });
  };

  // Resolve a body's photo: live SDO for the Sun, live EPIC for Earth, a curated
  // NASA library still for the rest.
  const resolveBodyPhoto = (id: string): BodyPhoto | null => {
    const info = BODIES[id];
    if (!info) return null;
    if (info.photo.kind === 'sun') {
      return {
        file: '/sun.jpg',
        full: '/sun.jpg',
        sourceUrl: 'https://sdo.gsfc.nasa.gov/',
        title: 'Solar Dynamics Observatory · AIA 171',
        credit: 'NASA/SDO',
        live: true,
      };
    }
    if (info.photo.kind === 'epic') {
      const f = frames['dscovr'];
      return f
        ? { file: f.file, full: f.full, sourceUrl: f.sourceUrl, title: 'DSCOVR EPIC · full-disk Earth', credit: f.credit, live: true }
        : null;
    }
    const bp = bodyPhotos[id];
    return bp
      ? { file: bp.file, full: bp.full, sourceUrl: bp.sourceUrl, title: info.photo.title, credit: info.photo.credit, live: false }
      : null;
  };
  const selBodyPhoto = selectedBodyId ? resolveBodyPhoto(selectedBodyId) : null;

  const openBodyPhoto = () => {
    if (!selectedBodyId || !selBodyPhoto) return;
    const p = selBodyPhoto;
    setLightbox({
      frames: [{ file: p.file, full: p.full, sourceUrl: p.sourceUrl, instrument: p.title, capturedUtc: '', sol: null }],
      index: 0,
      craftName: BODIES[selectedBodyId]?.name ?? '',
      credit: p.credit,
      owlt: null,
    });
  };

  // Signal age: for imaging craft, elapsed since the real capture time; otherwise
  // the light-time itself (the age of the wavefront arriving this instant).
  const signalAge = (() => {
    if (selFrame) return Math.max(0, (now - new Date(selFrame.capturedUtc).getTime()) / 1000);
    return selOwlt;
  })();

  // Rows for the screen-reader-only fleet table (the map's text alternative),
  // sorted by range ascending.
  const rows = useMemo(() => {
    if (!model || !generatedAt) return [];
    return model.craft
      .map((c) => ({
        craft: c,
        rangeAu: rangeAt(c.eph, generatedAt, now),
        owltSeconds: owltAt(c.eph, generatedAt, now),
      }))
      .sort((a, b) => a.rangeAu - b.rangeAu);
  }, [model, generatedAt, now]);

  const utc = new Date(now).toISOString().slice(11, 19);
  const tracking = model?.craft.length ?? 0;

  return (
    <>
      <Masthead
        trackingCount={tracking}
        utc={utc}
        view={view === 'traverse' ? 'map' : view}
        onNavigate={navigate}
        onOpenSearch={() => setPaletteOpen(true)}
      />

      <div className="stage" ref={stageRef}>
        <canvas id="sky" ref={canvasRef} />

        {/* Accessible text alternative to the canvas map. */}
        <div className="sr-only" aria-live="polite">
          {selected
            ? `Selected: ${selected.entry.name}, ${selected.entry.location}. One-way light time ${
                selOwlt != null ? Math.round(selOwlt) : 'unknown'
              } seconds.`
            : loading
              ? 'Loading fleet data.'
              : 'Solar system map.'}
        </div>
        <table className="sr-only">
          <caption>Active robotic fleet and current one-way light time</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.craft.entry.id}>
                <th scope="row">{r.craft.entry.name}</th>
                <td>{r.craft.entry.location}</td>
                <td>{Math.round(r.owltSeconds)} light-seconds</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Hud
          onReset={() => {
            if (window.location.hash === '#map' || window.location.hash === '') controls.reset();
            else window.location.hash = '#map';
          }}
        />

        {detailOpen && selected && (
          <DetailPanel
            craft={selected}
            frame={selFrame}
            archive={selArchive}
            owltSeconds={selOwlt}
            rangeAu={selRange}
            signalAgeSeconds={signalAge}
            generatedAt={generatedAt}
            contact={selContact}
            onOpenFrame={(i) => openLightbox(selected.entry.id, i)}
            onOpenArchive={() => openArchive(selected.entry.id)}
            onOpenTraverse={
              tracks[selected.entry.id]
                ? () => { window.location.hash = `#t/${selected.entry.id}`; }
                : undefined
            }
            onClose={() => setDetailOpen(false)}
          />
        )}

        {selectedBodyId && (
          <BodyPanel
            bodyId={selectedBodyId}
            photo={selBodyPhoto}
            onOpenPhoto={openBodyPhoto}
            onClose={() => {
              window.location.hash = '#map';
            }}
          />
        )}
      </div>

      {view === 'about' && (
        <div className="about-overlay">
          <About model={model} onBack={() => navigate('map')} />
        </div>
      )}

      {view === 'gallery' && (
        <Gallery
          frames={frames}
          now={now}
          onOpen={(craftId, index) => openLightbox(craftId, index)}
          onBack={() => navigate('map')}
        />
      )}

      {view === 'traverse' && traverseId && tracks[traverseId] && (
        <Traverse
          track={tracks[traverseId]!}
          craftName={model?.craft.find((c) => c.entry.id === traverseId)?.entry.name ?? tracks[traverseId]!.label}
          onOpenImages={(list, index, credit) =>
            setLightbox({
              frames: list,
              index,
              craftName: model?.craft.find((c) => c.entry.id === traverseId)?.entry.name ?? tracks[traverseId]!.label,
              credit,
              owlt: null,
            })
          }
          onBack={() => { window.location.hash = `#c/${traverseId}`; }}
        />
      )}

      {lightbox && lightbox.frames.length > 0 && (
        <Lightbox
          frames={lightbox.frames}
          index={Math.min(lightbox.index, lightbox.frames.length - 1)}
          craftName={lightbox.craftName}
          credit={lightbox.credit}
          owltSeconds={lightbox.owlt}
          onIndex={(i) => setLightbox({ ...lightbox, index: i })}
          onClose={() => setLightbox(null)}
        />
      )}

      {paletteOpen && (
        <CommandPalette items={searchItems} onPick={onPick} onClose={() => setPaletteOpen(false)} />
      )}

      {import.meta.env.DEV && <TweakPanel />}
    </>
  );
}
