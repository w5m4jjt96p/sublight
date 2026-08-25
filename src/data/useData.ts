// Loads the three generated JSON files and fuses them with the registry into a
// render model. A showcase never shows a network error, so failures degrade to
// an empty-but-typed state and a console warning.
import { useEffect, useState } from 'react';
import type { FleetData, FramesData, PlanetsData, ArchiveData, TracksData } from '../types.ts';
import { registry } from './registry.ts';
import { buildModel, type MapModel } from '../map/model.ts';

export type BodyPhotos = Record<string, { file: string; full: string; sourceUrl: string }>;

export interface LoadedData {
  model: MapModel | null;
  frames: FramesData;
  archive: ArchiveData;
  bodyPhotos: BodyPhotos;
  tracks: TracksData['rovers'];
  generatedAt: string | null;
  loading: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function useData(): LoadedData {
  const [state, setState] = useState<LoadedData>({
    model: null,
    frames: {},
    archive: {},
    bodyPhotos: {},
    tracks: {},
    generatedAt: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        const [fleet, planets, frames, archive, bodyPhotos, tracks] = await Promise.all([
          getJson<FleetData>(`${base}data/fleet.json`),
          getJson<PlanetsData>(`${base}data/planets.json`),
          getJson<FramesData>(`${base}data/frames.json`).catch(() => ({}) as FramesData),
          getJson<ArchiveData>(`${base}data/archive.json`).catch(() => ({}) as ArchiveData),
          getJson<BodyPhotos>(`${base}data/bodyphotos.json`).catch(() => ({}) as BodyPhotos),
          getJson<TracksData>(`${base}data/tracks.json`).catch(() => ({ generatedAt: '', rovers: {} }) as TracksData),
        ]);
        if (cancelled) return;
        const model = buildModel(registry, fleet.craft, planets.planets, fleet.generatedAt);
        setState({ model, frames, archive, bodyPhotos, tracks: tracks.rovers, generatedAt: fleet.generatedAt, loading: false });
      } catch (err) {
        console.warn('[sublight] data load failed:', err);
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
