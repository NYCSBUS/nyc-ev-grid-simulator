import { PROFILES } from '../sim/profiles';
import { useStore } from '../state/store';

const T = { text: '#e6edf3', muted: '#9aa7b4', line: '#2b3542', accent: '#38bdf8', ok: '#22c55e', warn: '#f59e0b', crit: '#ef4444', coned: '#0072ce' };

function GridHierarchy() {
  const box = (x: number, y: number, w: number, label: string, sub: string, color: string) => (
    <g>
      <rect x={x} y={y} width={w} height={54} rx={8} fill="#1f2730" stroke={color} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 22} textAnchor="middle" fill={T.text} fontSize={13} fontWeight={600}>
        {label}
      </text>
      <text x={x + w / 2} y={y + 40} textAnchor="middle" fill={T.muted} fontSize={11}>
        {sub}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.muted} strokeWidth={1.5} markerEnd="url(#arr)" />;
  return (
    <svg viewBox="0 0 900 300">
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={T.muted} />
        </marker>
      </defs>
      {box(20, 20, 160, 'Transmission', '138 / 345 kV', '#c084fc')}
      {arrow(180, 47, 220, 47)}
      {box(220, 20, 170, 'Area substation', 'steps down to 13 / 27 kV', '#c084fc')}
      {arrow(390, 47, 430, 47)}
      {box(430, 20, 190, 'Primary feeder', 'EV_HEADROOM in MW', T.accent)}
      {arrow(620, 47, 660, 47)}
      {box(660, 20, 220, 'Distribution transformer', 'range: < 200 … > 1000 kVA', T.ok)}
      {arrow(770, 74, 770, 120)}
      {box(640, 120, 250, '208 V or 460 V service', 'your charging site connects here', T.warn)}
      <text x={20} y={150} fill={T.text} fontSize={13} fontWeight={600}>
        In secondary-network areas (most of Manhattan, dense parts of the boroughs):
      </text>
      {box(20, 170, 200, 'Network', '89 networks; LSRV MW', T.coned)}
      {arrow(220, 197, 260, 197)}
      {box(260, 170, 200, 'M&S plate', 'KVA hosting capacity', T.coned)}
      {arrow(460, 197, 500, 197)}
      {box(500, 170, 200, 'Structure (vault)', 'KVA per manhole', T.coned)}
      <text x={20} y={262} fill={T.muted} fontSize={12}>
        Many transformers feed one meshed low-voltage grid, so a new load is shared across neighbours. The simulator's "secondary grid" sharing mode
      </text>
      <text x={20} y={280} fill={T.muted} fontSize={12}>
        allocates 60 / 25 / 15 % of coincident load to the three nearest transformers; "radial" mode puts 100 % on the nearest.
      </text>
    </svg>
  );
}

function HeadroomDiagram() {
  const bar = (x: number, label: string, cap: number, used: number, add: number, status: string, color: string) => {
    const H = 160;
    const y0 = 200;
    const s = H / 100;
    return (
      <g>
        <rect x={x} y={y0 - cap * s} width={90} height={cap * s} fill="#1f2730" stroke={T.line} />
        <rect x={x} y={y0 - used * s} width={90} height={used * s} fill="#334155" />
        <rect x={x} y={y0 - (used + add) * s} width={90} height={add * s} fill={color} opacity={0.9} />
        <text x={x + 45} y={y0 + 18} textAnchor="middle" fill={T.text} fontSize={12} fontWeight={600}>
          {label}
        </text>
        <text x={x + 45} y={y0 + 34} textAnchor="middle" fill={color} fontSize={11}>
          {status}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 700 250">
      <line x1={40} y1={40} x2={660} y2={40} stroke={T.line} strokeDasharray="4 4" />
      <text x={45} y={34} fill={T.muted} fontSize={11}>
        asset rating / published hosting capacity
      </text>
      {bar(80, 'Existing only', 100, 55, 0, 'baseline', '#334155')}
      {bar(220, '+ small L2 site', 100, 55, 20, 'OK (< 60 %)', T.ok)}
      {bar(360, '+ DCFC hub', 100, 55, 38, 'Watch (60–100 %)', T.warn)}
      {bar(500, '+ depot', 100, 55, 60, 'Critical (> 100 %)', T.crit)}
      <text x={40} y={235} fill={T.muted} fontSize={12}>
        Grey = load already served. Coloured = coincident EV load you add. Con Edison's maps publish the remaining "headroom" (white space), not the rating.
      </text>
    </svg>
  );
}

function ProfilesDiagram() {
  const W = 760;
  const H = 180;
  const x0 = 50;
  const y0 = 150;
  const px = (h: number) => x0 + (h / 23) * (W - x0 - 20);
  const py = (v: number) => y0 - v * 120;
  const colors: Record<string, string> = { residential: '#f59e0b', workplace: '#38bdf8', public: '#a78bfa', fleet: '#22c55e', transit: '#f472b6' };
  return (
    <svg viewBox={`0 0 ${W} ${H + 60}`}>
      <rect x={px(16.5)} y={20} width={px(18.5) - px(16.5)} height={y0 - 20} fill="rgba(56,189,248,0.12)" />
      <text x={px(17.5)} y={14} textAnchor="middle" fill={T.accent} fontSize={11}>
        system peak
      </text>
      {Object.entries(PROFILES).map(([k, p]) => (
        <polyline key={k} fill="none" stroke={colors[k]} strokeWidth={2} points={p.shape.map((v, h) => `${px(h)},${py(v)}`).join(' ')} />
      ))}
      <polyline fill="none" stroke={colors.residential} strokeWidth={2} strokeDasharray="5 4" points={PROFILES.residential.managedShape.map((v, h) => `${px(h)},${py(v)}`).join(' ')} />
      <line x1={x0} y1={y0} x2={W - 20} y2={y0} stroke={T.line} />
      {[0, 6, 12, 18, 23].map((h) => (
        <text key={h} x={px(h)} y={y0 + 16} textAnchor="middle" fill={T.muted} fontSize={11}>
          {h}:00
        </text>
      ))}
      <text x={10} y={py(1) + 4} fill={T.muted} fontSize={11}>
        100 %
      </text>
      <text x={10} y={y0 + 4} fill={T.muted} fontSize={11}>
        0
      </text>
      {Object.entries(PROFILES).map(([k, p], i) => (
        <g key={k} transform={`translate(${x0 + i * 145}, ${H + 25})`}>
          <rect width={14} height={3} y={6} fill={colors[k]} />
          <text x={20} y={11} fill={T.text} fontSize={11}>
            {p.label.split(' /')[0].split(' (')[0]}
          </text>
        </g>
      ))}
      <g transform={`translate(${x0}, ${H + 45})`}>
        <line x1={0} x2={14} y1={7} y2={7} stroke={colors.residential} strokeWidth={2} strokeDasharray="5 4" />
        <text x={20} y={11} fill={T.muted} fontSize={11}>
          residential with managed charging (shifted to after 10 PM)
        </text>
      </g>
    </svg>
  );
}

function DiversityDiagram() {
  return (
    <svg viewBox="0 0 760 170">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} transform={`translate(${30 + i * 60}, 30)`}>
          <rect width={40} height={80} rx={4} fill="#1f2730" stroke={T.line} />
          <rect width={40} height={[80, 80, 55, 30, 12, 0][i]} y={80 - [80, 80, 55, 30, 12, 0][i]} rx={4} fill={i < 2 ? T.accent : i < 4 ? '#818cf8' : '#334155'} />
          <text x={20} y={100} textAnchor="middle" fill={T.muted} fontSize={10}>
            port {i + 1}
          </text>
        </g>
      ))}
      <text x={30} y={140} fill={T.text} fontSize={12}>
        6 × 150 kW ports = 900 kW nameplate. At the busiest hour only 5 are occupied (utilization 83 %) and tapering batteries draw
      </text>
      <text x={30} y={158} fill={T.text} fontSize={12}>
        ~57 % of nameplate on average (diversity). Actual site peak ≈ 900 × 0.83 × 0.57 ≈ 430 kW. The simulator multiplies these three terms.
      </text>
      <g transform="translate(430, 30)">
        <rect width={300} height={80} rx={8} fill="#1f2730" stroke={T.warn} />
        <text x={150} y={30} textAnchor="middle" fill={T.text} fontSize={12} fontWeight={600}>
          site kW(h) = nameplate × utilization × diversity × shape(h)
        </text>
        <text x={150} y={55} textAnchor="middle" fill={T.muted} fontSize={11}>
          then storage shaves the peak; coincident kW = kW(peak hour)
        </text>
      </g>
    </svg>
  );
}

function AreaDiagram() {
  return (
    <svg viewBox="0 0 760 200">
      {[
        ['Census tract', 'vehicles from ACS B08201', '#38bdf8'],
        ['× EV share (year, curve)', '→ EVs in tract', '#a78bfa'],
        ['× kW per EV', 'home share × kW × coincidence × (1 − managed) + public', '#f59e0b'],
        ['Σ by network', 'vs network hosting-capacity MW range', '#22c55e'],
      ].map(([a, b, c], i) => (
        <g key={a} transform={`translate(${20 + i * 185}, 40)`}>
          <rect width={170} height={70} rx={8} fill="#1f2730" stroke={c} strokeWidth={1.5} />
          <text x={85} y={28} textAnchor="middle" fill={T.text} fontSize={12} fontWeight={600}>
            {a}
          </text>
          <foreignObject x={6} y={36} width={158} height={32}>
            <div style={{ color: T.muted, fontSize: 10, textAlign: 'center', lineHeight: 1.2 }}>{b}</div>
          </foreignObject>
          {i < 3 && <path d={`M170,35 L185,35`} stroke={T.muted} strokeWidth={1.5} markerEnd="url(#arr2)" />}
        </g>
      ))}
      <defs>
        <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={T.muted} />
        </marker>
      </defs>
      <text x={20} y={150} fill={T.muted} fontSize={12}>
        Example: 2,000 vehicles × 15 % (2030, policy) = 300 EVs × 1.1 kW/EV ≈ 330 kW coincident. Summed over a network's ~30 tracts → ~10 MW,
      </text>
      <text x={20} y={168} fill={T.muted} fontSize={12}>
        compared with the network's published hosting-capacity range (e.g. 0–25 MW → midpoint 12.5) to flag where reinforcement comes first.
      </text>
    </svg>
  );
}

const SECTIONS = [
  ['start', 'Quick start'],
  ['grid', 'How the grid is organised'],
  ['headroom', 'Hosting capacity & headroom'],
  ['profiles', 'Load profiles & coincidence'],
  ['diversity', 'Utilization & diversity'],
  ['area', 'Area-wide adoption model'],
  ['status', 'Reading the traffic lights'],
  ['equity', 'Disadvantaged communities'],
  ['cost', 'Costs & incentives'],
  ['data', 'Data sources & caveats'],
  ['glossary', 'Glossary'],
];

export function HelpTab() {
  const requestTour = useStore((s) => s.requestTour);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="help" id="tour-help">
      <nav>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#help-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
            {label}
          </a>
        ))}
        <button
          className="btn primary"
          style={{ marginTop: 14 }}
          onClick={() => {
            setTab('map');
            requestTour(true);
          }}
        >
          ▶ Replay guided tour
        </button>
      </nav>
      <article>
        <h2 id="help-start">Quick start</h2>
        <p>
          This simulator lets an EV program analyst test where new charging load can land on Con Edison's distribution system before anyone files an interconnection request. It combines Con Edison's public
          hosting-capacity maps, NYC MapPLUTO buildings and Census demographics with a simple, transparent load model.
        </p>
        <ol>
          <li>
            <b>Search an address</b> in the top bar (or click <i>Add site on map</i>, or shift-click a building). A site appears with a default charger mix.
          </li>
          <li>
            <b>Size it</b> in the Scenario panel: port counts, use profile, utilization, managed charging, storage.
          </li>
          <li>
            <b>Read the impact list</b>: each nearby transformer, feeder, M&amp;S plate and network gets a green / amber / red status.
          </li>
          <li>
            <b>Turn on area-wide adoption</b> to see organic EV growth by tract and network for any year to 2045.
          </li>
          <li>
            <b>Open Analytics</b> for load curves, asset loading, cost and network tables; save scenarios and compare them; export CSV/PNG.
          </li>
        </ol>
        <div className="callout">The model is deliberately simple and every assumption is exposed in Settings. Treat results as screening-level, not as an engineering study.</div>

        <h2 id="help-grid">How the grid is organised</h2>
        <p>
          Power flows from transmission into area substations, out along <b>primary feeders</b> (4, 13, 27 or 33 kV), down through <b>distribution transformers</b> to a 208 V or 460 V service at the
          customer. Con Edison also runs the world's largest <b>secondary network</b> system: in dense areas many transformers feed one meshed low-voltage grid, described by <b>networks</b>,
          <b> M&amp;S plates</b> and <b>structures</b> (vaults/manholes).
        </p>
        <figure>
          <GridHierarchy />
          <figcaption>Each level has its own hosting-capacity dataset; the simulator checks all the ones it can find around a site.</figcaption>
        </figure>

        <h2 id="help-headroom">Hosting capacity & headroom</h2>
        <p>
          <b>Hosting capacity</b> is how much new load (or generation) an asset can take before a limit is hit. Con Edison publishes it as <i>EV_HEADROOM</i> (MW) on feeders, as a kVA range on EV
          transformers, as kVA on plates and structures, and as remaining non-wires (LSRV) MW on networks. The simulator divides the load you add at the system peak hour by that headroom.
        </p>
        <figure>
          <HeadroomDiagram />
          <figcaption>Status thresholds (60 % / 100 % by default) are adjustable in Settings. Transformer ranges are converted to a point estimate you can also edit.</figcaption>
        </figure>

        <h2 id="help-profiles">Load profiles & coincidence</h2>
        <p>
          What matters to the utility is not a site's nameplate but its load at the <b>system peak</b> — around 5–6 PM on hot summer weekdays for Con Edison. Each use profile has a 24-hour shape; the
          value at the peak hour is the <b>coincident load</b>. Managed charging swaps in a shape that moves energy to off-peak hours.
        </p>
        <figure>
          <ProfilesDiagram />
          <figcaption>Normalised daily shapes used by the simulator. Residential and public profiles overlap the evening peak; workplace does not.</figcaption>
        </figure>

        <h2 id="help-diversity">Utilization & diversity</h2>
        <figure>
          <DiversityDiagram />
          <figcaption>Why a 900 kW hub rarely draws 900 kW.</figcaption>
        </figure>
        <p>
          <b>Utilization</b> is the share of ports occupied at the busiest hour. <b>Diversity</b> captures that occupied ports do not all draw full power at once (batteries taper, vehicles have lower max
          rates). On-site <b>storage</b> then shaves whatever peak is left, limited by both kW and kWh.
        </p>

        <h2 id="help-area">Area-wide adoption model</h2>
        <figure>
          <AreaDiagram />
          <figcaption>From Census vehicles to network-level MW in four multiplications.</figcaption>
        </figure>
        <p>
          The adoption curves are fleet-share trajectories: <b>Policy</b> follows New York's Advanced Clean Cars II path to 100 % ZEV sales in 2035 (fleet share lags sales share by roughly a decade);
          <b> Moderate</b> and <b>Slow</b> stretch that out. The <b>home-charging share</b> matters enormously in NYC, where most households rent and park on-street — that demand shows up instead as public
          and fleet charging, captured by the <i>public kW per EV</i> term.
        </p>

        <h2 id="help-status">Reading the traffic lights</h2>
        <dl>
          <dt>
            <span className="pill ok">OK</span>
          </dt>
          <dd>Added coincident load is below the watch threshold of published headroom. A standard service request is likely.</dd>
          <dt>
            <span className="pill warn">Watch</span>
          </dt>
          <dd>Between watch and critical. Expect a detailed study, possible phasing, managed charging or storage conditions.</dd>
          <dt>
            <span className="pill crit">Critical</span>
          </dt>
          <dd>Added load exceeds headroom — an upgrade (new transformer, feeder work) or a different site is needed. The cost module adds an upgrade allowance.</dd>
          <dt>
            <span className="pill unknown">No data</span>
          </dt>
          <dd>The asset is in range but has no published capacity (e.g. "N/A" transformer range, or a network with no LSRV MW), or no load was allocated to it.</dd>
        </dl>
        <p>A site's overall colour is its worst asset. The map highlights every assessed asset in its own colour; click one for its raw attributes.</p>

        <h2 id="help-equity">Disadvantaged communities</h2>
        <p>
          New York's Climate Leadership and Community Protection Act (CLCPA) requires that disadvantaged communities (DACs) receive at least 35 % — with a goal of 40 % — of the benefits of clean-energy
          spending. Con Edison's make-ready incentives pay a higher share in DACs. The simulator flags sites in DAC tracts, tracks the DAC share of area-scenario EVs by network, and uses the DAC incentive
          rate in the cost module.
        </p>

        <h2 id="help-cost">Costs & incentives</h2>
        <p>
          Costs are <i>illustrative planning numbers</i>: port hardware and installation by charger type, make-ready $/kW for service and civil work, storage $/kWh, plus an allowance when an asset goes
          critical. The incentive mirrors the structure of utility make-ready programs (a percentage of make-ready costs, higher in DACs, capped per site). All of it is editable in Settings and saved with
          the scenario, so two scenarios can carry different assumptions.
        </p>

        <h2 id="help-data">Data sources & caveats</h2>
        <ul>
          <li>
            <b>Con Edison hosting capacity</b> (ArcGIS FeatureServer, public): EV transformers summer/winter, EV feeders summer/winter, segmented hosting capacity, M&amp;S plates, structures, networks
            (LSRV), network supplied areas, NWS networks, disadvantaged communities, 33 kV feeders. Small layers are snapshotted at build time; large ones stream by viewport.
          </li>
          <li>
            <b>NYC Open Data</b>: Building Footprints (5zhs-2jue) joined to MapPLUTO (64uk-42ks) by BBL, fetched for the viewport at zoom ≥ 15.
          </li>
          <li>
            <b>Census</b>: TIGERweb tract geometry; ACS 5-year tables B01003, B19013, B25003, B08201, B25024, B11001 via Census Reporter.
          </li>
          <li>
            <b>Basemap & geocoding</b>: Mapbox.
          </li>
        </ul>
        <div className="callout">
          Caveats: transformer capacity is a range, not a value; which transformer actually serves an address is unknown (we use proximity); feeder headroom is for the whole feeder, not the segment;
          network LSRV MW reflects a non-wires procurement, not thermal capacity; ACS values are 5-year estimates with sampling error. None of this replaces a Con Edison service determination.
        </div>

        <h2 id="help-glossary">Glossary</h2>
        <dl>
          <dt>kW vs kVA</dt>
          <dd>Real power vs apparent power. kW = kVA × power factor (0.95 default).</dd>
          <dt>Nameplate</dt>
          <dd>Sum of maximum port power at a site.</dd>
          <dt>Coincident load</dt>
          <dd>A site's load at the hour the system peaks.</dd>
          <dt>Headroom</dt>
          <dd>Published capacity remaining for new load on an asset.</dd>
          <dt>L2 / DCFC</dt>
          <dd>Level 2 AC charging (7–19 kW) / DC fast charging (50–350 kW per port).</dd>
          <dt>Make-ready</dt>
          <dd>Electrical infrastructure from the grid to the charger stub — the part utilities often fund.</dd>
          <dt>LSRV</dt>
          <dd>Locational System Relief Value — Con Edison's payment for load relief in constrained networks (non-wires solutions).</dd>
          <dt>M&amp;S plate</dt>
          <dd>Mains &amp; Services map sheet; the unit at which secondary-network hosting capacity is published.</dd>
          <dt>DAC</dt>
          <dd>Disadvantaged community under the CLCPA.</dd>
          <dt>Managed charging</dt>
          <dd>Shifting or throttling charging to avoid peaks, via price signals or direct control.</dd>
        </dl>
      </article>
    </div>
  );
}
