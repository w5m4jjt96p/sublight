import { useEffect, useRef } from 'react';
import type { MapCraft } from '../map/model.ts';
import type { FrameData, ArchiveEntry, DsnContact } from '../types.ts';
import { fmtAu, fmtDuration, fmtClock, fmtMissionDays, fmtUtcHm, EMDASH } from '../data/format.ts';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

interface DetailPanelProps {
  craft: MapCraft;
  frame: FrameData | undefined;
  archive: ArchiveEntry | undefined;
  owltSeconds: number | null;
  rangeAu: number | null;
  signalAgeSeconds: number | null;
  generatedAt: string | null;
  contact: DsnContact | undefined;
  onOpenFrame: (index: number) => void;
  onOpenArchive: () => void;
  onOpenTraverse?: () => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  cruise: 'In cruise',
  dormant: 'Dormant',
  silent: 'Silent',
  retired: 'Retired',
};

export function DetailPanel({
  craft,
  frame,
  archive,
  owltSeconds,
  rangeAu,
  signalAgeSeconds,
  generatedAt,
  contact,
  onOpenFrame,
  onOpenArchive,
  onOpenTraverse,
  onClose,
}: DetailPanelProps) {
  const e = craft.entry;

  // Stable Escape-to-close; the panel stays mounted across selections and
  // re-renders every second, so keep the listener out of the render deps.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const arrived = e.arrived ? new Date(e.arrived).toISOString().slice(0, 10) : EMDASH;
  const launched = new Date(e.launched).toISOString().slice(0, 10);

  // "Talk to it": turn the one-way light time into a felt, round-trip action.
  const quiet = e.status === 'silent' || e.status === 'retired';
  const roundTrip = (() => {
    if (owltSeconds == null) return null;
    const nowMs = Date.now();
    return {
      arrival: fmtUtcHm(new Date(nowMs + owltSeconds * 1000).toISOString()),
      reply: fmtUtcHm(new Date(nowMs + 2 * owltSeconds * 1000).toISOString()),
      rtt: fmtDuration(2 * owltSeconds),
    };
  })();
  const via = craft.eph.source.startsWith('horizons:')
    ? craft.eph.source.slice('horizons:'.length)
    : craft.eph.source;
  const directId = e.naifId != null && String(e.naifId) === via;

  const hero = frame?.recent?.[0];
  const arrivedUtc =
    hero && owltSeconds != null
      ? new Date(new Date(hero.capturedUtc).getTime() + owltSeconds * 1000).toISOString()
      : null;

  const lastDownlink = contact?.inContact
    ? `In contact${contact.antenna ? ` · ${contact.antenna}` : ''}`
    : generatedAt
      ? `as of ${fmtUtcHm(generatedAt)} UTC`
      : EMDASH;

  return (
    <aside className="detail" aria-label={`${e.name} details`}>
      <div className="detail-head">
        <div>
          <div className="detail-name">{e.name}</div>
          <div className="detail-sub">
            {e.agency} · {e.kind} · {STATUS_LABEL[e.status] ?? e.status}
          </div>
          <div className="detail-loc">{e.location}</div>
        </div>
        <button className="detail-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {/* hero frame (imaging craft) */}
      {hero ? (
        <div>
          <button
            className="detail-hero"
            onClick={() => onOpenFrame(0)}
            aria-label={`View ${e.name} frame full screen: ${hero.instrument}${hero.sol != null ? `, sol ${hero.sol}` : ''}`}
          >
            <img src={hero.file} alt={`${e.name} raw frame, ${hero.instrument}`} />
            <span className="scan" />
            <span className="detail-hero-cap">
              <span>
                {hero.instrument.replace(/_/g, ' ')}
                {hero.sol != null ? ` · SOL ${hero.sol}` : ''}
              </span>
              <span aria-hidden="true">⤢</span>
            </span>
          </button>
          <div className="detail-hero-foot">
            <span>CAPTURED {fmtUtcHm(hero.capturedUtc)}</span>
            <span>
              ARRIVED <b>{arrivedUtc ? fmtUtcHm(arrivedUtc) : EMDASH}</b>
            </span>
          </div>
          <div className="thumb-credit">{frame!.credit}</div>
        </div>
      ) : archive ? (
        <div>
          <button
            className="detail-hero"
            onClick={onOpenArchive}
            aria-label={`View archive image full screen: ${archive.title}`}
          >
            <img src={asset(archive.file)} alt={`${e.name} — ${archive.title}`} />
            <span className="detail-hero-cap">
              <span>Mission archive</span>
              <span aria-hidden="true">⤢</span>
            </span>
          </button>
          <div className="detail-hero-foot">
            <span>{archive.title}</span>
          </div>
          <div className="thumb-credit">{archive.credit}</div>
        </div>
      ) : (
        <div className="detail-noimg">No imaging downlink · telemetry only</div>
      )}

      <p className="detail-note">{e.note}</p>

      {onOpenTraverse && (
        <button className="detail-traverse" onClick={onOpenTraverse}>
          <span className="dt-ico" aria-hidden="true">⤳</span>
          <span className="dt-text">
            <b>Surface traverse</b>
            <span>Every drive and photo, on the real map of Mars</span>
          </span>
          <span className="dt-go" aria-hidden="true">→</span>
        </button>
      )}

      <div className="detail-grid">
        <div>
          <div className="stat-l">One-way light time</div>
          <div className="v delay">{fmtDuration(owltSeconds)}</div>
        </div>
        <div>
          <div className="stat-l">Signal age</div>
          <div className="v">{fmtClock(signalAgeSeconds)}</div>
        </div>
        <div>
          <div className="stat-l">Range from Earth</div>
          <div className="v">{fmtAu(rangeAu)}</div>
        </div>
        <div>
          <div className="stat-l">Last downlink</div>
          <div className="v">{lastDownlink}</div>
        </div>
        <div>
          <div className="stat-l">Launched</div>
          <div className="v">{launched}</div>
        </div>
        <div>
          <div className="stat-l">Arrived</div>
          <div className="v">{arrived}</div>
        </div>
        <div>
          <div className="stat-l">Mission duration</div>
          <div className="v">{fmtMissionDays(e.launched)}</div>
        </div>
        <div>
          <div className="stat-l">DSN link</div>
          <div className="v">{contact?.inContact ? `In contact` : 'Not right now'}</div>
        </div>
      </div>

      {roundTrip && (
        <div className="detail-talk">
          <div className="detail-section-l">Talk to it</div>
          {quiet ? (
            <p className="detail-note detail-talk-p">
              No longer listening. {e.name} is {e.status}: a message would arrive, but nothing
              would answer.
            </p>
          ) : (
            <p className="detail-note detail-talk-p">
              A command sent now reaches {e.name} at <b>{roundTrip.arrival} UTC</b>. Its reply would
              return at <b>{roundTrip.reply} UTC</b>, a {roundTrip.rtt} round trip. You cannot have a
              conversation with it.
            </p>
          )}
        </div>
      )}

      {frame?.recent && frame.recent.length > 1 && (
        <div>
          <div className="detail-section-l">More frames · {frame.instrument.replace(/_/g, ' ')}</div>
          <div className="detail-strip">
            {frame.recent.slice(1, 6).map((t, i) => (
              <button
                key={t.file}
                className="detail-strip-btn"
                onClick={() => onOpenFrame(i + 1)}
                aria-label={`View frame full screen: ${t.instrument}${t.sol != null ? `, sol ${t.sol}` : ''}, captured ${fmtUtcHm(t.capturedUtc)} UTC`}
              >
                <img
                  src={t.file}
                  alt={`${e.name} raw frame, ${t.instrument}, sol ${t.sol ?? '?'}, captured ${fmtUtcHm(t.capturedUtc)} UTC`}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="detail-source">
        Position resolved via Horizons body {via}
        {directId ? ' (direct)' : ' (host body)'}
        {craft.eph.stale ? ' · stale: reused last good value' : ''}
      </div>
    </aside>
  );
}
