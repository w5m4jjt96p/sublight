// Circular craft avatar; falls back to a monogram if the image is missing.
import { useState } from 'react';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

export function Avatar({ craftId, name }: { craftId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="ga-avatar ga-avatar-mono">{name.charAt(0)}</div>;
  }
  return (
    <img
      className="ga-avatar"
      src={asset(`/avatars/${craftId}.jpg`)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
