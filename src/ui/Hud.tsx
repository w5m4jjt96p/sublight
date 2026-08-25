interface HudProps {
  onReset: () => void;
}

/** Map controls (the corner opposite the info panel). */
export function Hud({ onReset }: HudProps) {
  return (
    <div className="hud hud-controls">
      <button className="ctrl" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}
