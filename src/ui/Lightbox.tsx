import { useCallback, useEffect } from 'react';
import type { FrameThumb } from '../types.ts';
import { fmtUtcHm, fmtDuration } from '../data/format.ts';
import { downloadFile, frameFilename } from '../data/download.ts';

interface LightboxProps {
  frames: FrameThumb[];
  index: number;
  craftName: string;
  credit: string;
  /** Light time used to compute the arrival stamp. */
  owltSeconds: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const asset = (p: string) => `${base}${p}`;

export function Lightbox({
  frames,
  index,
  craftName,
  credit,
  owltSeconds,
  onIndex,
  onClose,
}: LightboxProps) {
  const frame = frames[index];
  const count = frames.length;

  const prev = useCallback(() => onIndex((index - 1 + count) % count), [index, count, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % count), [index, count, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // capture-phase + stop, so an open panel's Escape listener doesn't also fire
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && count > 1) prev();
      else if (e.key === 'ArrowRight' && count > 1) next();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose, prev, next, count]);

  if (!frame) return null;

  const arrivedUtc =
    owltSeconds != null
      ? new Date(new Date(frame.capturedUtc).getTime() + owltSeconds * 1000).toISOString()
      : null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${craftName} frame viewer`} onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <div className="lb-title">
          <span className="lb-craft">{craftName}</span>
          <span className="lb-meta">
            {frame.instrument.replace(/_/g, ' ')}
            {frame.sol != null ? ` · SOL ${frame.sol}` : ''}
            {count > 1 ? ` · ${index + 1}/${count}` : ''}
          </span>
        </div>
        <div className="lb-actions">
          <button
            className="ctrl"
            onClick={() =>
              downloadFile(
                asset(frame.full),
                frameFilename(craftName, frame.instrument, frame.sol, frame.capturedUtc),
              )
            }
          >
            Download HQ
          </button>
          <a className="ctrl" href={frame.sourceUrl} target="_blank" rel="noreferrer">
            Original ↗
          </a>
          <button className="ctrl lb-close" onClick={onClose} aria-label="Close viewer">
            ✕
          </button>
        </div>
      </div>

      <div className="lb-stage" onClick={onClose}>
        {count > 1 && (
          <button
            className="lb-nav lb-prev"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous frame"
          >
            ‹
          </button>
        )}
        <img
          className="lb-img"
          src={asset(frame.full)}
          alt={`${craftName} raw frame — ${frame.instrument}${frame.sol != null ? `, sol ${frame.sol}` : ''}, captured ${frame.capturedUtc} UTC`}
          onClick={(e) => e.stopPropagation()}
          onError={(e) => {
            // fall back to the small local thumbnail if the large one is missing
            const el = e.currentTarget;
            if (!el.src.endsWith(frame.file)) el.src = asset(frame.file);
          }}
        />
        {count > 1 && (
          <button
            className="lb-nav lb-next"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next frame"
          >
            ›
          </button>
        )}
      </div>

      <div className="lb-foot" onClick={(e) => e.stopPropagation()}>
        {frame.capturedUtc ? (
          <div className="lb-times">
            <span>
              <span className="lb-l">Captured</span> {fmtUtcHm(frame.capturedUtc)} UTC
            </span>
            <span className="lb-arrow">
              → {owltSeconds != null ? fmtDuration(owltSeconds) : ''} of light →
            </span>
            <span>
              <span className="lb-l">Arrived</span>{' '}
              <b>{arrivedUtc ? `${fmtUtcHm(arrivedUtc)} UTC` : '—'}</b>
            </span>
          </div>
        ) : (
          <div className="lb-times">
            <span className="lb-l">Mission archive · NASA</span>
          </div>
        )}
        <div className="lb-credit">{credit}</div>
      </div>
    </div>
  );
}
