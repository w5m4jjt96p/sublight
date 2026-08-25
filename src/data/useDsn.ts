// Live DSN poll. Returns, per craft id: { inContact, direction, antenna }.
// Fetches directly from eyes.nasa.gov (CORS-open) every 15s. Any network or
// parse failure degrades silently to the last good value — the map never shows
// a network error.
import { useEffect, useRef, useState } from 'react';
import type { DsnContact } from '../types.ts';
import { registry } from './registry.ts';
import { DSN_URL, parseDsnXml, buildLookup, contactsByCraft } from './dsn.ts';

const POLL_MS = 15_000;

export interface DsnState {
  byCraft: Record<string, DsnContact>;
  /** True once at least one live poll has succeeded this session. */
  live: boolean;
  /** ms timestamp of the last successful poll, or null. */
  lastOkMs: number | null;
}

export function useDsn(): DsnState {
  const [state, setState] = useState<DsnState>({ byCraft: {}, live: false, lastOkMs: null });
  const lookup = useRef(buildLookup(registry));

  useEffect(() => {
    let cancelled = false;
    const controllerRef: { c: AbortController | null } = { c: null };

    const poll = async () => {
      controllerRef.c?.abort();
      const controller = new AbortController();
      controllerRef.c = controller;
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(`${DSN_URL}?cachebust=${Math.floor(Date.now() / POLL_MS)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const contacts = contactsByCraft(parseDsnXml(xml), lookup.current);
        if (!cancelled) setState({ byCraft: contacts, live: true, lastOkMs: Date.now() });
      } catch {
        // silent: keep the previous byCraft, just don't mark a fresh success
      } finally {
        clearTimeout(timeout);
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      controllerRef.c?.abort();
    };
  }, []);

  return state;
}
