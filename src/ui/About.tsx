import type { MapModel } from '../map/model.ts';

interface AboutProps {
  model: MapModel | null;
  onBack: () => void;
}

export function About({ model, onBack }: AboutProps) {
  const hostApproximated = (model?.craft ?? []).filter((c) => {
    const via = c.eph.source.replace('horizons:', '');
    return c.entry.naifId == null || String(c.entry.naifId) !== via;
  });

  return (
    <div className="about">
      <div className="about-inner">
        <a
          className="back"
          href="#map"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ← Back to the map
        </a>
        <h1>Nothing here is happening now.</h1>
        <p className="lede">
          Sublight maps the active robotic fleet of the solar system by the one number that never
          lies about distance: how long its light takes to reach us. Every figure on the map is
          measured, not imagined.
        </p>

        <h2>Where the data comes from</h2>
        <p>
          Positions and distances come from NASA/JPL's{' '}
          <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">
            Horizons
          </a>{' '}
          ephemeris service, queried once a day by an automated job. For each craft we take its
          heliocentric position (for the map) and its geocentric range (for the light-time), and we
          interpolate the range through the day so the number drifts smoothly rather than jumping.
        </p>
        <p>
          The raw frames come from public NASA image feeds, no key required. Perseverance comes from
          the Mars&nbsp;2020 feed, Curiosity from the MSL raw-image API, and DSCOVR's full-disk Earth
          from the{' '}
          <a href="https://epic.gsfc.nasa.gov/" target="_blank" rel="noreferrer">
            EPIC
          </a>{' '}
          camera at L1. Each frame keeps its true capture timestamp; the &ldquo;arrived&rdquo; time
          you see is simply capture time plus that day's light-time. Live antenna contact is read
          directly from the{' '}
          <a href="https://eyes.nasa.gov/dsn/dsn.html" target="_blank" rel="noreferrer">
            Deep Space Network
          </a>{' '}
          feed, refreshed every fifteen seconds.
        </p>
        <p>
          Craft with no live feed show a hand-picked <strong>mission archive</strong> still from the{' '}
          <a href="https://images.nasa.gov/" target="_blank" rel="noreferrer">
            NASA Image &amp; Video Library
          </a>{' '}
          (Voyager&nbsp;2's Neptune, New Horizons' Pluto, JWST's Cosmic Cliffs, and so on), clearly
          labelled as archive, not a live frame. The Sun itself is a recent full-disk image from{' '}
          <a href="https://sdo.gsfc.nasa.gov/" target="_blank" rel="noreferrer">
            NASA's Solar Dynamics Observatory
          </a>
          .
        </p>
        <p>
          Imagery is public domain (NASA/JPL-Caltech, with instrument teams credited under each
          frame). The credit line is always shown; nothing here implies a partnership.
        </p>

        <h2>Why the map is logarithmic</h2>
        <p>
          Voyager&nbsp;1 is more than a hundred times farther than Mars. On a linear map the inner
          solar system would collapse to a single pixel while the Voyagers sat off the edge of the
          screen. So the radius is compressed logarithmically, with <code>r = log10(1 + AU·400)</code>,
          which lets a rover on Mars and a probe in interstellar space share one frame while keeping
          their order and rough spacing honest. Angles are the real ecliptic longitude from
          Horizons; only the radial distance is stretched.
        </p>
        <p>
          Everything moves in real time. Each body's position is interpolated between today's and
          tomorrow's Horizons snapshot, so the system creeps along its orbits at true speed, and the
          map at dawn is not the map at dusk. The motion is slow (a planet covers a degree or so a day),
          fastest for the Moon and for Parker Solar Probe near the Sun.
        </p>
        <p>
          The <strong>Moon</strong> is a special case: heliocentrically it sits 0.0026&nbsp;AU from
          Earth, glued to it at this scale. We keep its true <em>direction</em> from Earth (which
          swings right round over a month, real motion) but hold a minimum on-screen gap so it stays
          a visible companion. Its distance from Earth is the one thing on the map that is not to
          scale.
        </p>

        <h2>Which craft are approximated</h2>
        <p>
          A few craft have no usable trajectory of their own in Horizons: surface rovers, and a
          probe or two whose ephemeris has lapsed. For those we plot the body they sit on or orbit,
          which is correct to a fraction of a percent for distance. As of the current data:
        </p>
        <ul>
          {hostApproximated.length === 0 ? (
            <li>None. Every craft resolved directly today.</li>
          ) : (
            hostApproximated.map((c) => (
              <li key={c.entry.id}>
                <strong>{c.entry.name}</strong>, via {c.eph.source.replace('horizons:', 'Horizons body ')}
                {c.entry.host ? ` (${c.entry.host})` : ''}
              </li>
            ))
          )}
        </ul>

        <h2>The near-Earth view</h2>
        <p>
          The Near-Earth view plots a curated set of objects still circling Earth: the ISS,
          Hubble, Tiangong, weather and navigation satellites, a slice of Starlink. Their orbital
          elements are snapshotted once a day from{' '}
          <a href="https://celestrak.org/" target="_blank" rel="noreferrer">
            CelesTrak
          </a>
          , and the browser propagates them live from there, so the dots move second by second.
          Every number shown, altitude, speed, period and light-time, is derived from the object's
          mean motion, and so is accurate to well within a light-millisecond. The exact on-screen
          angle is a Keplerian approximation with the two largest Earth-oblateness drifts applied;
          it omits the fine drag and short-period terms of a full model, which do not affect the
          light-time. The same elements feed the decay watch, ranked by lowest perigee.
        </p>
        <p>
          The space-weather readout on the map is the current planetary K index, storm scale, solar
          wind speed and field, read live from{' '}
          <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noreferrer">
            NOAA's Space Weather Prediction Center
          </a>
          .
        </p>

        <h2>Adding a craft</h2>
        <p>
          The fleet is one hand-edited file, <code>data/registry.json</code>. Add an entry with a
          NAIF ID and the daily job resolves the rest. See the project README.
        </p>

        <h2>Support</h2>
        <p>
          Sublight is free, with no ads and no tracking. If it made the solar system feel a little
          closer, you can help keep it running and growing.
        </p>
        <p>
          <a className="support-btn" href="https://ko-fi.com/sublightobserver" target="_blank" rel="noreferrer">
            Buy me a coffee ☕
          </a>
        </p>

        <h2>Type and licences</h2>
        <p>
          Set in Stack Sans Notch and Roboto Mono, with IBM Plex as a fallback, all under the{' '}
          <a href="/licenses/StackSansNotch-OFL.txt" target="_blank" rel="noreferrer">
            SIL Open Font License 1.1
          </a>
          . NASA imagery and data are in the public domain, credited to their source under each
          frame. Sublight is an independent project, not affiliated with or endorsed by NASA or any
          space agency.
        </p>
      </div>
    </div>
  );
}
