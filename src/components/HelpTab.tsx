import { PROFILES } from '../sim/profiles';
import { useStore } from '../state/store';

const T = { text: '#e6edf3', muted: '#9aa7b4', line: '#2b3542', accent: '#38bdf8', ok: '#22c55e', warn: '#f59e0b', crit: '#ef4444', coned: '#0072ce' };

function GridHierarchy() {
  const box = (x: number, y: number, w: number, label: string, sub: string, color: string) => (
    <g>
      <rect x={x} y={y} width={w} height={56} rx={8} fill="#1f2730" stroke={color} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 23} textAnchor="middle" fill={T.text} fontSize={13} fontWeight={600}>
        {label}
      </text>
      <text x={x + w / 2} y={y + 42} textAnchor="middle" fill={T.muted} fontSize={11}>
        {sub}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.muted} strokeWidth={1.5} markerEnd="url(#arr)" />;
  return (
    <>
      <svg viewBox="0 0 1000 330">
        <defs>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill={T.muted} />
          </marker>
        </defs>
        <text x={20} y={22} fill={T.muted} fontSize={12}>
          Most of the city: one pipe per building
        </text>
        {box(20, 36, 190, 'Reservoir', 'power plants · 138–345 kV', '#c084fc')}
        {arrow(210, 64, 250, 64)}
        {box(250, 36, 210, 'Pumping station', 'substation · down to 13–27 kV', '#c084fc')}
        {arrow(460, 64, 500, 64)}
        {box(500, 36, 210, 'Street main = feeder', 'room left published in MW', T.accent)}
        {arrow(710, 64, 750, 64)}
        {box(750, 36, 230, 'Tap = transformer', 'room left: < 200 … > 1000 kVA', T.ok)}
        {arrow(865, 92, 865, 130)}
        {box(700, 130, 280, 'Your building · 208 V or 460 V', 'the charging site plugs in here', T.warn)}

        <text x={20} y={230} fill={T.muted} fontSize={12}>
          Densest areas: a web — many taps share one underground grid
        </text>
        {box(20, 244, 250, 'Grid zone = network', '89 zones, neighbourhood-sized', T.coned)}
        {arrow(270, 272, 310, 272)}
        {box(310, 244, 250, 'Map sheet = M&S plate', 'a page of the underground atlas', T.coned)}
        {arrow(560, 272, 600, 272)}
        {box(600, 244, 250, 'Vault = structure', 'the room under a manhole cover', T.coned)}
      </svg>
      <p className="fig-note">
        In a web, a new load is spread across neighbours. The simulator's "web" setting splits a site's load 60 / 25 / 15 % over the three nearest taps; the "single pipe" setting puts all of it
        on the nearest one.
      </p>
    </>
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
    <>
      <svg viewBox="0 0 700 250">
        <line x1={40} y1={40} x2={660} y2={40} stroke={T.line} strokeDasharray="4 4" />
        <text x={45} y={34} fill={T.muted} fontSize={11}>
          the pipe is full here
        </text>
        {bar(80, 'Today', 100, 55, 0, 'already in use', '#64748b')}
        {bar(220, '+ small garage', 100, 55, 20, 'Green (< 60 % of room)', T.ok)}
        {bar(360, '+ fast-charge hub', 100, 55, 38, 'Amber (60–100 %)', T.warn)}
        {bar(500, '+ truck depot', 100, 55, 60, 'Red (over 100 %)', T.crit)}
      </svg>
      <p className="fig-note">
        Grey = what the pipe already carries. Colour = what your site adds at rush hour. Con Edison publishes the white space (room left), not the size of the pipe.
      </p>
    </>
  );
}

const PROFILE_COLORS: Record<string, string> = { residential: '#f59e0b', workplace: '#38bdf8', public: '#a78bfa', fleet: '#22c55e', transit: '#f472b6' };

function ProfilesDiagram() {
  const W = 760;
  const x0 = 50;
  const y0 = 150;
  const px = (h: number) => x0 + (h / 23) * (W - x0 - 20);
  const py = (v: number) => y0 - v * 120;
  return (
    <>
      <svg viewBox={`0 0 ${W} 175`}>
        <rect x={px(16.5)} y={20} width={px(18.5) - px(16.5)} height={y0 - 20} fill="rgba(56,189,248,0.12)" />
        <text x={px(17.5)} y={14} textAnchor="middle" fill={T.accent} fontSize={11}>
          grid rush hour
        </text>
        {Object.entries(PROFILES).map(([k, p]) => (
          <polyline key={k} fill="none" stroke={PROFILE_COLORS[k]} strokeWidth={2} points={p.shape.map((v, h) => `${px(h)},${py(v)}`).join(' ')} />
        ))}
        <polyline fill="none" stroke={PROFILE_COLORS.residential} strokeWidth={2} strokeDasharray="5 4" points={PROFILES.residential.managedShape.map((v, h) => `${px(h)},${py(v)}`).join(' ')} />
        <line x1={x0} y1={y0} x2={W - 20} y2={y0} stroke={T.line} />
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={px(h)} y={y0 + 16} textAnchor="middle" fill={T.muted} fontSize={11}>
            {h}:00
          </text>
        ))}
        <text x={10} y={py(1) + 4} fill={T.muted} fontSize={11}>
          busiest
        </text>
        <text x={10} y={y0 + 4} fill={T.muted} fontSize={11}>
          idle
        </text>
      </svg>
      <div className="fig-legend">
        {Object.entries(PROFILES).map(([k, p]) => (
          <span key={k}>
            <i style={{ background: PROFILE_COLORS[k] }} /> {p.label}
          </span>
        ))}
        <span>
          <i style={{ background: 'transparent', borderTop: `2px dashed ${PROFILE_COLORS.residential}`, height: 0 }} /> Home charging with smart charging on (pushed to after 10 PM)
        </span>
      </div>
    </>
  );
}

function DiversityDiagram() {
  const fill = [80, 80, 55, 30, 12, 0];
  return (
    <>
      <svg viewBox="0 0 760 130">
        {fill.map((f, i) => (
          <g key={i} transform={`translate(${30 + i * 60}, 15)`}>
            <rect width={40} height={80} rx={4} fill="#1f2730" stroke={T.line} />
            <rect width={40} height={f} y={80 - f} rx={4} fill={i < 2 ? T.accent : i < 4 ? '#818cf8' : '#334155'} />
            <text x={20} y={100} textAnchor="middle" fill={T.muted} fontSize={10}>
              plug {i + 1}
            </text>
          </g>
        ))}
        <g transform="translate(410, 15)">
          <rect width={340} height={80} rx={8} fill="#1f2730" stroke={T.warn} />
          <text x={170} y={32} textAnchor="middle" fill={T.text} fontSize={11.5} fontWeight={600}>
            load each hour = sticker × in-use × taper × daily shape
          </text>
          <text x={170} y={56} textAnchor="middle" fill={T.muted} fontSize={10.5}>
            then a battery trims the top; rush-hour load = the 5 PM value
          </text>
        </g>
      </svg>
      <p className="fig-note">
        Six 150 kW plugs = 900 kW on the sticker. At the busiest hour only five have a car (83 % in use), and cars that are nearly full charge slowly — like a phone — so the average plug draws
        about 57 % of its maximum. Real peak ≈ 900 × 0.83 × 0.57 ≈ <b>430 kW</b>.
      </p>
    </>
  );
}

function AreaDiagram() {
  const steps: Array<[string, string, string]> = [
    ['Count the cars', 'per neighbourhood, from the Census', '#38bdf8'],
    ['× share that are electric', 'depends on the year and adoption path', '#a78bfa'],
    ['× load per EV at 5 PM', 'home share, how many at once, smart charging', '#f59e0b'],
    ['Add up per grid zone', "compare with the zone's published capacity", '#22c55e'],
  ];
  return (
    <>
      <svg viewBox="0 0 800 110">
        <defs>
          <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill={T.muted} />
          </marker>
        </defs>
        {steps.map(([a, b, c], i) => (
          <g key={a} transform={`translate(${10 + i * 198}, 15)`}>
            <rect width={180} height={76} rx={8} fill="#1f2730" stroke={c} strokeWidth={1.5} />
            <text x={90} y={30} textAnchor="middle" fill={T.text} fontSize={12} fontWeight={600}>
              {a}
            </text>
            <foreignObject x={6} y={40} width={168} height={34}>
              <div style={{ color: T.muted, fontSize: 10.5, textAlign: 'center', lineHeight: 1.25 }}>{b}</div>
            </foreignObject>
            {i < 3 && <path d="M180,38 L196,38" stroke={T.muted} strokeWidth={1.5} markerEnd="url(#arr2)" />}
          </g>
        ))}
      </svg>
      <p className="fig-note">
        Example: a neighbourhood with 2,000 cars × 15 % electric (2030, Policy path) = 300 EVs × 1.1 kW each at 5 PM ≈ 330 kW. Add the ~30 neighbourhoods in a grid zone → ~10 MW, compared with
        the zone's published range (e.g. 0–25 MW → mid-point 12.5) to flag where work is needed first.
      </p>
    </>
  );
}

const SECTIONS = [
  ['start', 'Quick start'],
  ['grid', 'The grid as plumbing'],
  ['headroom', 'Room left & the traffic lights'],
  ['profiles', 'When people charge (rush hour)'],
  ['diversity', 'Why the sticker overstates the load'],
  ['area', 'Borough-wide EV growth'],
  ['status', 'What each colour means'],
  ['equity', 'Disadvantaged communities'],
  ['cost', 'Costs & grants'],
  ['data', 'Where the data comes from'],
  ['glossary', 'Jargon decoder'],
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
            setTab('sites');
            requestTour(true);
          }}
        >
          ▶ Replay the guided tour
        </button>
      </nav>
      <article>
        <h2 id="help-start">Quick start</h2>
        <p>
          This tool answers one question: <b>“If we put EV chargers here, can the local grid handle it?”</b> It puts Con Edison's public maps of spare grid capacity, New York City's
          building records and Census data on one map, with a simple, see-through calculation on top.
        </p>
        <ol>
          <li>
            <b>Pick a spot.</b> In the <i>Sites</i> tab, search an address in the top bar, click <i>Add a site</i>, or shift-click a building. A charging site appears with a starter set of chargers. Drag its pin to try the corner next door.
          </li>
          <li>
            <b>Describe the site</b> in the left panel: how many chargers, what kind of place it is, whether charging is smart, whether there is a battery.
          </li>
          <li>
            <b>Read the traffic lights.</b> Every nearby piece of grid equipment gets a light: green = <i>fits</i>, amber = <i>tight</i>, red = <i>doesn’t fit</i>. (The blue-to-violet dots and lines on the map are a different thing: how much room that equipment has <i>today</i>, before your site.)
          </li>
          <li>
            <b>Zoom out</b> in the <i>Outlook</i> tab to see how a whole borough's EV growth lands on the grid in any year to 2045.
          </li>
          <li>
            <b>Open Results</b> for the bottom line in plain sentences, then charts, tables and costs. <i>Snapshot &amp; compare</i> there freezes today’s numbers so your next change shows up as before and after. <i>Scenarios</i> saves and shares versions.
          </li>
        </ol>
        <div className="callout">
          The maths is deliberately simple and every assumption is visible in Settings. Treat results as a first screening — a way to spot good and bad candidates — not as an engineering
          study.
        </div>

        <h2 id="help-grid">The grid as plumbing</h2>
        <p>
          Electricity reaches a building much like water does. Power plants are the reservoir. Substations are pumping stations that lower the pressure. <b>Feeders</b> are the mains under
          the street. A <b>transformer</b> is the tap that serves one block or building, at either 208 V (most buildings) or 460 V (what fast chargers need). Each stage can carry only so
          much, and Con Edison publishes how much <b>room is left</b> at each stage.
        </p>
        <p>
          In the densest parts of the city Con Edison runs the grid as a <b>web</b> rather than separate pipes: many taps feed one shared underground grid, so if one is busy, the load
          flows through its neighbours. Con Edison describes this web at three sizes — <b>grid zones</b> (it calls them <i>networks</i>), <b>map sheets</b> (<i>M&amp;S plates</i>), and
          <b> vaults</b> (<i>structures</i>: the rooms under manhole covers where cables join).
        </p>
        <figure>
          <GridHierarchy />
          <figcaption>Each stage has its own published "room left" figure; the simulator checks every one it can find around a site.</figcaption>
        </figure>

        <h2 id="help-headroom">Room left &amp; the traffic lights</h2>
        <p>
          Engineers call the room left in a pipe its <b>hosting capacity</b> or <b>headroom</b>. Con Edison publishes it in different units at each stage: megawatts (MW) on feeders, a
          size band (e.g. “500–1000 kVA”) on transformers, kVA on map sheets and vaults, and MW on grid zones. The simulator takes the load your site adds at rush hour and divides it by
          the room left — that percentage sets the colour.
        </p>
        <figure>
          <HeadroomDiagram />
          <figcaption>The amber and red lines (60 % and 100 % by default) can be moved in Settings. Transformer size bands are turned into a single number you can also edit.</figcaption>
        </figure>

        <h2 id="help-profiles">When people charge (the grid's rush hour)</h2>
        <p>
          The grid does not care about a site's sticker rating; it cares about what the site draws at the <b>system peak</b> — Con Edison's rush hour, about 5–6 PM on hot summer weekdays,
          when air conditioners are all on. Each kind of site has a daily rhythm. The value of that rhythm at 5 PM is the site's <b>coincident load</b>: the part that lands on top of
          everyone else's. <b>Smart charging</b> swaps in a rhythm that moves energy use to the quiet hours — like running the dishwasher after 10 PM.
        </p>
        <figure>
          <ProfilesDiagram />
          <figcaption>Daily rhythms used by the simulator. Home and public charging overlap the evening rush; workplace charging does not.</figcaption>
        </figure>

        <h2 id="help-diversity">Why the sticker overstates the load</h2>
        <figure>
          <DiversityDiagram />
          <figcaption>Why a 900 kW hub almost never draws 900 kW.</figcaption>
        </figure>
        <p>
          Two reasons. <b>In use</b> (engineers: <i>utilization</i>): not every plug has a car at the busiest hour. <b>Taper</b> (<i>diversity</i>): like a phone, a car charges slowly once
          its battery is nearly full, so even an occupied plug rarely draws its maximum. A <b>battery</b> on site then trims whatever peak is left — it is a water tank that fills overnight
          and tops up the station at rush hour, limited by how fast it can pour (kW) and how much it holds (kWh).
        </p>

        <h2 id="help-area">Borough-wide EV growth</h2>
        <figure>
          <AreaDiagram />
          <figcaption>From Census car counts to megawatts per grid zone in four multiplications.</figcaption>
        </figure>
        <p>
          The <b>adoption paths</b> are guesses at how fast cars go electric. <b>Policy</b> follows New York's rule that all new cars sold must be zero-emission by 2035 (the cars on the
          road lag new sales by about a decade); <b>Moderate</b> and <b>Slow</b> stretch that out. The <b>home-charging share</b> matters enormously in New York, where most people rent
          and park on the street: those drivers charge in public instead, which the <i>public kW per EV</i> slider captures.
        </p>

        <h2 id="help-status">What each colour means</h2>
        <dl>
          <dt>
            <span className="pill ok">Fits</span>
          </dt>
          <dd>Your site uses less than the amber line (60 %) of the room left. A routine connection is likely.</dd>
          <dt>
            <span className="pill warn">Tight</span>
          </dt>
          <dd>Between the amber and red lines. Expect Con Edison to study it closely and possibly ask for smart charging, a battery, or a phased build.</dd>
          <dt>
            <span className="pill crit">Doesn’t fit</span>
          </dt>
          <dd>Your site needs more than the room left. Either Con Edison installs bigger equipment (and the cost section adds an allowance for that) or you pick another spot.</dd>
          <dt>
            <span className="pill unknown">No data</span>
          </dt>
          <dd>The equipment is nearby but Con Edison has not published a number for it, or your site's load was not assigned to it.</dd>
        </dl>
        <p>
          A site's overall colour is its worst light. The map outlines every piece of equipment it checked in that colour; click one to see Con Edison's raw figures. Until the equipment
          around a site has loaded, the site shows <i>Checking…</i> rather than a colour.
        </p>
        <p>
          Green, amber and red are used <b>only</b> for these lights. The map’s other shading uses its own scales so the two are never confused: pale blue → violet for how much room
          equipment has today (pale = lots), and purple for borough-wide EV growth in the Outlook tab (brighter = more).
        </p>

        <h2 id="help-equity">Disadvantaged communities</h2>
        <p>
          New York's climate law (the CLCPA) says at least 35 % — ideally 40 % — of clean-energy spending must benefit <b>Disadvantaged Communities</b> (DACs): neighbourhoods the state has
          identified as carrying more pollution and fewer resources. Con Edison's grants cover a bigger share of the wiring costs there. The simulator flags sites in DACs, reports what
          share of borough-wide EV growth falls in DACs, and uses the DAC grant rate in the cost section.
        </p>

        <h2 id="help-cost">Costs &amp; grants</h2>
        <p>
          The cost figures are <i>rough planning numbers</i>: the chargers themselves; the wiring from the street to the parking spot (<b>make-ready</b> — like plumbing you install before
          buying the faucet), priced per kW; any battery, priced per kWh; and an allowance whenever a light goes red and Con Edison would have to add equipment. The <b>grant</b> copies the
          shape of utility make-ready programs: a percentage of the wiring cost, higher in DACs, capped per site. Everything is editable in Settings and saved with the scenario, so two
          scenarios can carry different price assumptions.
        </p>

        <h2 id="help-data">Where the data comes from</h2>
        <ul>
          <li>
            <b>Con Edison hosting-capacity maps</b> (public ArcGIS services): EV transformers (summer and winter), EV feeders, M&amp;S plates, vaults (structures), grid zones (networks),
            non-wires-solution networks, disadvantaged communities, 33 kV feeders. Small layers are snapshotted when the app is built; big ones stream in as you pan and zoom.
          </li>
          <li>
            <b>NYC Open Data</b>: building footprints joined to MapPLUTO lot records (land use, number of units), loaded for what is on screen at zoom 15+.
          </li>
          <li>
            <b>US Census</b>: neighbourhood (tract) boundaries and the American Community Survey — population, income, renters, car ownership, building types.
          </li>
          <li>
            <b>Base map &amp; address search</b>: Mapbox.
          </li>
        </ul>
        <div className="callout">
          Caveats: transformer room is published as a band, not a number; we do not know which transformer truly serves an address (we use the nearest); feeder room is for the whole
          feeder, not just your block; grid-zone MW reflects a market programme, not the physical limit; Census figures are 5-year estimates with sampling error. None of this replaces a
          Con Edison service determination.
        </div>

        <h2 id="help-glossary">Jargon decoder</h2>
        <dl>
          <dt>Nameplate</dt>
          <dd>The sticker rating: all the chargers' maximum power added together. Almost never reached in practice.</dd>
          <dt>Coincident load</dt>
          <dd>What a site draws at the grid's rush hour (5 PM). This is the number that matters.</dd>
          <dt>Headroom / hosting capacity</dt>
          <dd>Room left in the pipe: how much more load a piece of equipment can take before Con Edison has to upgrade it.</dd>
          <dt>Utilization</dt>
          <dd>Share of plugs with a car attached at the busiest hour.</dd>
          <dt>Diversity</dt>
          <dd>Taper: occupied plugs don't all draw full power at once, because batteries slow down as they fill.</dd>
          <dt>Managed (smart) charging</dt>
          <dd>Delaying or slowing charging to avoid rush hour, through pricing or remote control. Like running the dishwasher at night.</dd>
          <dt>kW vs kVA</dt>
          <dd>Two ways of measuring power; kW ≈ kVA × 0.95 for our purposes.</dd>
          <dt>Level 2 / DC fast</dt>
          <dd>Level 2 is overnight-speed charging (7–19 kW, like a dryer outlet). DC fast is 20-minute charging (50–350 kW) and needs 460 V service.</dd>
          <dt>Feeder</dt>
          <dd>The main under the street carrying power from the substation to the transformers.</dd>
          <dt>Transformer</dt>
          <dd>The tap: steps power down to the voltage a building uses (208 V or 460 V).</dd>
          <dt>Network (grid zone)</dt>
          <dd>In dense areas, a neighbourhood-sized web of transformers and cables that share load. Con Edison has 89.</dd>
          <dt>M&amp;S plate (map sheet)</dt>
          <dd>One page of Con Edison's underground atlas; room left in the web is published per page.</dd>
          <dt>Structure (vault)</dt>
          <dd>The room under a manhole cover where cables join; room left is published per vault.</dd>
          <dt>Make-ready</dt>
          <dd>The wiring from the street to the parking spot — the part utilities often pay for.</dd>
          <dt>LSRV</dt>
          <dd>Locational System Relief Value: a payment Con Edison offers customers in crowded grid zones to reduce load instead of building new equipment ("non-wires solution").</dd>
          <dt>DAC</dt>
          <dd>Disadvantaged Community under New York's climate law — qualifies for larger grants.</dd>
        </dl>
      </article>
    </div>
  );
}
