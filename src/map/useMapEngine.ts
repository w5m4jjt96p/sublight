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
  onPick: (kind: 'craft' | 'body', id: string) => void;
}

export interface MapControls {
  flyTo: (id: string) => void;
  flyToBody: (id: string) => void;
  reset: () => void;
  zoomBy: (factor: number) => void;
}

export function useMapEngine(args: UseMapEngineArgs): MapControls {
  const { canvasRef, stageRef, model, frames, selectedId, showPath, focusInset, onPick } = args;
  const engineRef = useRef<AnyEngine | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const opts = {
      onPick: (kind: 'craft' | 'body', id: string) => onPickRef.current(kind, id),
      onDragStateChange: (dragging: boolean) => stage.classList.toggle('drag', dragging),
    };
    // Behind ?map3d=1 the GPU engine takes over the same canvas as its
    // overlay. If WebGL is missing or refuses, the flat map is the fallback,
    // not a blank stage.
    let engine: AnyEngine;
    if (readSceneFlags().tilt) {
      try {
        engine = new GlMapEngine(canvas, stage, opts);
      } catch (err) {
        console.warn('3D map unavailable, using the flat map:', err);
        engine = new MapEngine(canvas, stage, opts);
      }
    } else {
      engine = new MapEngine(canvas, stage, opts);
    }
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Preload the (fixed) set of planet icons once.
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const ids = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const cache = new Map<string, HTMLImageElement>();
    for (const id of ids) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `${base}/planets/${id}.svg`;
      cache.set(id, img);
    }
    engineRef.current?.setPlanetImages(cache);
  }, []);

  // Preload each imaging craft's hero frame; the render loop draws whatever has
  // decoded so far, so late arrivals simply appear on the next frame.
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const cache = new Map<string, HTMLImageElement>();
    for (const [id, frame] of Object.entries(frames)) {
      if (!frame?.file) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = `${base.replace(/\/$/, '')}${frame.file}`;
      cache.set(id, img);
    }
    engineRef.current?.setFrameImages(cache);
  }, [frames]);

  return {
    flyTo: (id) => engineRef.current?.flyToId(id),
    flyToBody: (id) => engineRef.current?.flyToBody(id),
    reset: () => engineRef.current?.reset(),
    zoomBy: (factor) => engineRef.current?.zoomBy(factor),
  };
}
