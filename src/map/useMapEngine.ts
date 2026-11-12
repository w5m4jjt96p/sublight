// React glue for MapEngine. Owns the imperative engine instance and keeps it in
// sync with declarative props (model, selection, path toggle).
import { useEffect, useRef } from 'react';
import { MapEngine } from './engine.ts';
import { GlMapEngine } from './gl/GlMapEngine.ts';
import { readSceneFlags } from './scene.ts';
import type { MapModel } from './model.ts';

/** What the hook needs from whichever engine is mounted. */
type AnyEngine = MapEngine | GlMapEngine;
import type { FramesData } from '../types.ts';

export interface UseMapEngineArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  stageRef: React.RefObject<HTMLElement | null>;
  model: MapModel | null;
  frames: FramesData;
  selectedId: string | null;
  showPath: boolean;
  /** Px reserved on the right by the info panel (0 when closed). */
  focusInset: number;
  /** The map is on screen. The engine, its sky and planet maps (2 MB) and its
   *  draw loop wait for this: the reader who came for photos pays for none of it. */
  active: boolean;
  onPick: (kind: 'craft' | 'body', id: string) => void;
}

export interface MapControls {
  flyTo: (id: string) => void;
  flyToBody: (id: string) => void;
  reset: () => void;
  zoomBy: (factor: number) => void;
}

export function useMapEngine(args: UseMapEngineArgs): MapControls {
  const { canvasRef, stageRef, model, frames, selectedId, showPath, focusInset, active, onPick } = args;
  const engineRef = useRef<AnyEngine | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  /** A fly-to asked for before the engine exists: search from the feed lands here. */
  const pendingRef = useRef<((e: AnyEngine) => void) | null>(null);

  const planetImages = (): Map<string, HTMLImageElement> => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const ids = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const cache = new Map<string, HTMLImageElement>();
    for (const id of ids) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `${base}/planets/${id}.svg`;
      cache.set(id, img);
    }
    return cache;
  };
  // Each imaging craft's hero frame; the render loop draws whatever has decoded
  // so far, so late arrivals simply appear on the next frame.
  const frameImages = (): Map<string, HTMLImageElement> => {
    const base = import.meta.env.BASE_URL;
    const cache = new Map<string, HTMLImageElement>();
    for (const [id, frame] of Object.entries(frames)) {
      if (!frame?.file) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = `${base.replace(/\/$/, '')}${frame.file}`;
      cache.set(id, img);
    }
    return cache;
  };

  // Built the first time the map is shown, then kept: leaving and coming back
  // must not lose the camera.
  useEffect(() => {
    if (!active || engineRef.current) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const opts = {
      onPick: (kind: 'craft' | 'body', id: string) => onPickRef.current(kind, id),
      onDragStateChange: (dragging: boolean) => stage.classList.toggle('drag', dragging),
    };
    // The GPU engine is the default and takes the same canvas as its overlay.
    // If WebGL is missing or refuses, the flat map is the fallback, not a
    // blank stage; whatever the failed attempt left on the stage is undone.
    let engine: AnyEngine;
    if (readSceneFlags().gl) {
      try {
        engine = new GlMapEngine(canvas, stage, opts);
      } catch (err) {
        console.warn('3D map unavailable, using the flat map:', err);
        stage.querySelectorAll('canvas.sky-gl').forEach((c) => c.remove());
        canvas.style.position = '';
        engine = new MapEngine(canvas, stage, opts);
      }
    } else {
      engine = new MapEngine(canvas, stage, opts);
    }
    engineRef.current = engine;
    if (model) engine.setModel(model);
    engine.setSelected(selectedId);
    engine.setShowPath(showPath);
    engine.setFocusInset(focusInset);
    engine.setPlanetImages(planetImages());
    engine.setFrameImages(frameImages());
    pendingRef.current?.(engine);
    pendingRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => {
    engineRef.current?.destroy();
    engineRef.current = null;
  }, []);

  // Nobody can see it behind the feed, so it does not draw behind the feed.
  useEffect(() => {
    engineRef.current?.setPaused(!active);
  }, [active]);

  useEffect(() => {
    if (model) engineRef.current?.setModel(model);
  }, [model]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    engineRef.current?.setShowPath(showPath);
  }, [showPath]);

  useEffect(() => {
    engineRef.current?.setFocusInset(focusInset);
  }, [focusInset]);

  useEffect(() => {
    engineRef.current?.setFrameImages(frameImages());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  const withEngine = (act: (e: AnyEngine) => void) => {
    if (engineRef.current) act(engineRef.current);
    else pendingRef.current = act;
  };

  return {
    flyTo: (id) => withEngine((e) => e.flyToId(id)),
    flyToBody: (id) => withEngine((e) => e.flyToBody(id)),
    reset: () => engineRef.current?.reset(),
    zoomBy: (factor) => engineRef.current?.zoomBy(factor),
  };
}
