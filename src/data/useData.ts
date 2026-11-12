// Loads the three generated JSON files and fuses them with the registry into a
// render model. A showcase never shows a network error, so failures degrade to
// an empty-but-typed state and a console warning.
import { useEffect, useState } from 'react';
import type { FleetData, FramesData, PlanetsData, ArchiveData, TracksData, SatellitesData, SatelliteRecord, DeepSkyData, DeepSkyObject } from '../types.ts';
import { registry } from './registry.ts';
import { buildModel, type MapModel } from '../map/model.ts';

export type BodyPhotos = Record<string, { file: string; full: string; sourceUrl: string }>;

export interface LoadedData {
  model: MapModel | null;
  frames: FramesData;
  archive: ArchiveData;
  bodyPhotos: BodyPhotos;
  tracks: TracksData['rovers'];
  satellites: SatelliteRecord[];
  deepSky: DeepSkyObject[];
  generatedAt: string | null;
  loading: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  // Default cache mode: the host already sends must-revalidate, and an explicit
  // no-cache would stop these requests from using the preloads in index.html.
  const res = await fetch(path);
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
    satellites: [],
    deepSky: [],
    generatedAt: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL;
    (async () => {
      try {
        // What the first post needs, on its own: nothing below may hold up a photo.
        const [fleet, planets, frames] = await Promise.all([
          getJson<FleetData>(`${base}data/fleet.json`),
          getJson<PlanetsData>(`${base}data/planets.json`),
          getJson<FramesData>(`${base}data/frames.json`).catch(() => ({}) as FramesData),
        ]);
        if (cancelled) return;
        const model = buildModel(registry, fleet.craft, planets.planets, fleet.generatedAt);
        setState((s) => ({ ...s, model, frames, generatedAt: fleet.generatedAt, loading: false }));

        const [archive, bodyPhotos, tracks, sats, deep] = await Promise.all([
          getJson<ArchiveData>(`${base}data/archive.json`).catch(() => ({}) as ArchiveData),
          getJson<BodyPhotos>(`${base}data/bodyphotos.json`).catch(() => ({}) as BodyPhotos),
          getJson<TracksData>(`${base}data/tracks.json`).catch(() => ({ generatedAt: '', rovers: {} }) as TracksData),
          getJson<SatellitesData>(`${base}data/satellites.json`).catch(() => ({ generatedAt: '', satellites: [] }) as SatellitesData),
          getJson<DeepSkyData>(`${base}data/deepsky.json`).catch(() => ({ generatedAt: '', objects: [] }) as DeepSkyData),
        ]);
        if (cancelled) return;
        setState((s) => ({ ...s, archive, bodyPhotos, tracks: tracks.rovers, satellites: sats.satellites, deepSky: deep.objects }));
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
