import { useEffect } from 'react';
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useStore } from '../state/store';
import { DEFAULT_AREA, DEFAULT_FILTERS, DEFAULT_SETTINGS, newSite, uid } from '../state/defaults';
import { assessScenario, useSiteContext } from '../state/hooks';
import { buildAreaIndex, runArea } from '../sim/area';
import { nameplateKw } from '../sim/model';
import type { Scenario, SiteAssessment } from '../types';
import { fmt } from './ui';

const LS_KEY = 'evsim.tour.seen.v3';
const TOUR_NAME = 'Tour walkthrough';
const HUB = 'Roosevelt Ave fast hub (tour)';
const GARAGE = 'Mott Haven L2 garage (tour)';

/** A tour step: `setup` mutates the app *before* the step is shown; `dyn` renders a live description. */
interface Step {
  element?: string;
  title: string;
  description: string;
  setup?: () => void;
  dyn?: () => string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/* ---------- helpers that read the store ---------- */

const S = () => useStore.getState();

function currentAssessments(): Map<string, SiteAssessment> {
  const st = S();
  const sd = st.staticData;
  if (!sd.networks || !sd.plates || !sd.tracts) return new Map();
  return assessScenario(st.scenario, {
    transformers: st.live.transformers,
    feeders: st.live.feeders,
    plates: sd.plates,
    networks: sd.networks,
    tracts: sd.tracts,
    structures: st.live.structures.features.length ? st.live.structures : undefined,
  });
}

const siteByName = (name: string) => S().scenario.sites.find((s) => s.name === name);
const assessmentFor = (name: string) => {
  const s = siteByName(name);
  return s ? currentAssessments().get(s.id) : undefined;
};
const loading = () => Object.values(S().live.loading).some(Boolean);
const li = (s: string) => `<li>${s}</li>`;

/** Plain-English name for an asset kind. */
function friendlyName(a: { kind: string; name: string }) {
  switch (a.kind) {
    case 'transformer':
      return `transformer ${a.name}`;
    case 'feeder':
      return `street main (${a.name})`;
    case 'structure':
      return `underground vault ${a.name.replace(/^Structure\s*/, '')}`;
    case 'plate':
      return `map sheet ${a.name.replace(/^M&S Plate\s*/, '')}`;
    case 'network':
      return a.name;
    default:
      return a.name;
  }
}

function statusLine(a?: SiteAssessment) {
  if (!a) return '<i>Loading Con Edison grid data…</i>';
  const live = a.assets.filter((x) => x.ratio != null);
  if (!live.length) return `<i>${loading() ? 'Loading Con Edison grid data…' : 'No equipment with capacity data nearby.'}</i>`;
  const by = (k: 'ok' | 'warn' | 'crit') => live.filter((x) => x.status === k).length;
  const worst = live.slice().sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
  const over = worst.ratio! > 1;
  return `This site adds <b>${fmt.kw(a.coincidentKw)}</b> at the 5 PM rush → <span style="color:#22c55e">${by('ok')} green</span>, <span style="color:#f59e0b">${by('warn')} amber</span>, <span style="color:#ef4444">${by('crit')} red</span>.<br/>Tightest spot: <b>${friendlyName(worst)}</b> — it has <b>${fmt.kw(worst.headroomKw)}</b> of room and this site would ${over ? 'fill it <b>' + fmt.pct(Math.min(worst.ratio!, 9.99)) + '</b> over' : 'use <b>' + fmt.pct(worst.ratio!) + '</b> of it'}.`;
}

function areaLine() {
  const st = S();
  const sd = st.staticData;
  if (!st.scenario.area.enabled || !sd.tracts || !sd.networks || !sd.plates) return '<i>Computing…</i>';
  const idx = buildAreaIndex(sd.tracts, sd.networks, sd.plates);
  const r = runArea(st.scenario.area, sd.tracts, sd.networks, idx, st.scenario.settings);
  const top = r.networkStats.filter((n) => n.evs > 0).slice(0, 3);
  const crit = r.networkStats.filter((n) => n.status === 'crit').length;
  return `About <b>${fmt.int(r.totalEvs)} EVs</b> (${fmt.pct(r.evShare, 1)} of ${fmt.int(r.totalVehicles)} cars) would add <b>${fmt.mw(r.totalAddedMw)}</b> at the 5 PM rush. <b>${crit}</b> grid zone${crit === 1 ? '' : 's'} would be over the line.<br/>Most stretched: <ul style="margin:4px 0 0 16px;padding:0">${top
    .map((n) => li(`<b>${n.network}</b> — adds ${n.addedMw.toFixed(1)} MW to a zone rated ${n.capacityRange ?? '?'} MW (${fmt.pct(n.ratio)} of its mid-point)`))
    .join('')}</ul>`;
}

function kpiLine() {
  const st = S();
  const as = currentAssessments();
  const sites = st.scenario.sites;
  const np = sites.reduce((s, x) => s + nameplateKw(x), 0);
  const co = sites.reduce((s, x) => s + (as.get(x.id)?.coincidentKw ?? 0), 0);
  const cost = sites.reduce((s, x) => s + (as.get(x.id)?.cost.total ?? 0), 0);
  const inc = sites.reduce((s, x) => s + (as.get(x.id)?.cost.incentive ?? 0), 0);
  const crit = sites.flatMap((x) => as.get(x.id)?.assets ?? []).filter((a) => a.status === 'crit').length;
  return `${sites.length} sites · sticker rating <b>${fmt.kw(np)}</b> · actual rush-hour load <b>${fmt.kw(co)}</b> · ${crit} piece${crit === 1 ? '' : 's'} of equipment in the red · est. cost <b>${fmt.usd(cost)}</b>, of which grants cover ${fmt.usd(inc)} (${fmt.pct(cost ? inc / cost : 0)}).`;
}

/* ---------- the script ---------- */

function buildSteps(): Step[] {
  const st = S;
  const addHub = () => {
    if (siteByName(HUB)) return;
    st().addSite(
      newSite(-73.8803, 40.7498, {
        name: HUB,
        address: 'Roosevelt Ave & 82nd St, Jackson Heights, Queens',
        profile: 'public',
        chargers: { L2_7: 0, L2_11: 0, L2_19: 0, DCFC_50: 0, DCFC_150: 8, DCFC_350: 0 },
        utilization: 0.7,
        diversity: 0.9,
      }),
    );
  };
  const addGarage = () => {
    if (siteByName(GARAGE)) return;
    st().addSite(
      newSite(-73.9208, 40.8166, {
        name: GARAGE,
        address: 'E 149th St & Morris Ave, Mott Haven, Bronx',
        profile: 'residential',
        chargers: { L2_7: 20, L2_11: 0, L2_19: 0, DCFC_50: 0, DCFC_150: 0, DCFC_350: 0 },
        utilization: 0.6,
        diversity: 0.8,
      }),
    );
  };
  const selectAndFly = (name: string, zoom: number) => {
    const s = siteByName(name);
    if (!s) return;
    st().selectSite(s.id);
    st().requestFlyTo([s.lng, s.lat], zoom);
  };
  const patchSite = (name: string, patch: Parameters<ReturnType<typeof S>['updateSite']>[1]) => {
    const s = siteByName(name);
    if (s) st().updateSite(s.id, patch);
  };

  return [
    {
      title: 'Welcome — a 5-minute guided tour',
      description:
        'Think of the power grid as plumbing. Big pipes (<b>feeders</b>) run under the street; a smaller tap (<b>transformer</b>) serves each block or building. Every pipe has only so much <b>room left</b> before it is full. An EV analyst’s job is to work out where new chargers can plug in without overfilling a pipe.<br/><br/>This tour drives the app for you and answers five questions that come up every week. Your own work is set aside and comes back at the end. Press <b>Next</b> — each step changes something on screen.',
      setup: () => {
        st().setTab('map');
        st().setPanel('scenario');
        st().setSidebarOpen(true);
        st().requestFlyTo([-73.93, 40.75], 10.8);
      },
    },
    /* ---------- Q1 ---------- */
    {
      element: '#tour-search',
      title: 'Question 1 · “Can we plug a big fast-charging station in at Roosevelt Ave & 82nd St?”',
      description:
        'A developer wants 8 fast chargers in Jackson Heights — enough to charge a car in 20 minutes each. Normally you would type the address here and click <i>Put chargers here</i>. The tour will place it for you on the next step.',
      side: 'bottom',
    },
    {
      element: '#tour-map',
      title: 'The station is on the map',
      description:
        'The white pin is the station. The dashed circle is how far we look for nearby grid equipment (250 m). The coloured dots are Con Edison’s <b>transformers</b> — the “taps” — coloured like a fuel gauge: green = lots of room, red = nearly full. A white ring means the tap is the higher-voltage type (460 V) that fast chargers need. The three dots with rings are the ones this station would draw from.',
      setup: () => {
        addHub();
        selectAndFly(HUB, 16.2);
        st().setPanel('scenario');
      },
      side: 'left',
    },
    {
      element: '#tour-chargers',
      title: 'Sticker rating vs. real load',
      description:
        'Adding up the chargers gives the <b>sticker rating</b> (engineers say <i>nameplate</i>) — like a car’s top speed. What the grid actually feels is the load at <b>5 PM on a hot day</b>, when everyone’s air conditioning is on — the grid’s “rush hour”. Not every charger is busy at once, and cars slow their charging as they fill up, so the real rush-hour load is lower.',
      dyn: () => {
        const s = siteByName(HUB);
        const a = assessmentFor(HUB);
        return s ? `Sticker rating <b>${fmt.kw(nameplateKw(s))}</b> → busiest moment <b>${a ? fmt.kw(a.peakKw) : '…'}</b> → load at the 5 PM rush <b>${a ? fmt.kw(a.coincidentKw) : '…'}</b>.` : '';
      },
      side: 'right',
    },
    {
      element: '#tour-impact',
      title: 'Answer 1: not as designed',
      description:
        'The traffic lights below compare this station’s rush-hour load with the <b>room left</b> on each piece of nearby equipment. Here the nearby taps are the smaller 208 V kind with little room, and the underground <b>vaults</b> (the rooms under manhole covers where cables join) have only a few dozen kW spare — so most go <b>red</b>. No street mains are listed because in this part of Queens the grid is a <b>web</b> rather than a single pipe (more on that later). Bottom line: this exact corner would need Con Edison to install new equipment.',
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    /* ---------- Q2 ---------- */
    {
      element: '#tour-loadshape',
      title: 'Question 2 · “Would smart charging fix it?”',
      description:
        '<b>Smart (managed) charging</b> is like running the dishwasher after 10 PM: shift the energy use away from rush hour. The tour has just switched it <b>on</b>. For a public fast-charging station it barely helps — drivers charge when they show up, and that is mostly afternoon and evening. Compare the numbers with the previous step.',
      setup: () => patchSite(HUB, { managed: true }),
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    {
      element: '#tour-loadshape',
      title: 'Add a battery on site',
      description:
        'A battery works like a water tank: it fills up quietly overnight and tops up the station at rush hour, so less is drawn from the grid. The tour just added a 400 kW / 1,600 kWh battery. The load drops, but the small taps still can’t carry a fast-charging station. <b>Answer 2:</b> smart charging and batteries are great for sites that are <i>amber</i>; they can’t fix a site that is deep in the red. The next question is where the right-sized taps are.',
      setup: () => patchSite(HUB, { storageKw: 400, storageKwh: 1600 }),
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    {
      element: '#tour-rail-filters',
      title: 'Hunt for the right taps nearby',
      description:
        'The <b>Filters</b> panel is now showing only the taps fast chargers need: <b>460 V</b> with at least <b>500 kVA</b> of room. The map zoomed out a notch. Every dot you still see is a plausible place for a fast-charging station. Where dots cluster, a developer can build; where there are none, Con Edison would need to add equipment first.',
      setup: () => {
        st().setPanel('filters');
        st().setFilters({ xfmrVoltage: ['460'], xfmrBuckets: ['500 kVA to 1000 kVA', '> 1000 kVA'] });
        const s = siteByName(HUB);
        if (s) st().requestFlyTo([s.lng, s.lat], 14.6);
      },
      side: 'right',
    },
    {
      element: '#tour-map',
      title: 'Reading the result',
      description:
        'White-ringed dots are the good candidates. Click any dot to see exactly how much room it has. In real life you would drag the station pin onto the best candidate, or widen the search circle in the site editor, and watch the traffic lights change.',
      side: 'left',
    },
    /* ---------- Q3 ---------- */
    {
      element: '#tour-rail-filters',
      title: 'Question 3 · “Where should a fairness-focused home-charging program go?”',
      description:
        'Filters are reset. The map now shades every neighbourhood by <b>how many households have no car</b>, and outlines in orange the areas New York State has flagged as <b>Disadvantaged Communities</b> (DACs) — places that get the larger grants. The South Bronx stands out: lots of apartment buildings, few cars today, no driveways to charge in. Shared slower chargers in apartment garages (<b>Level 2</b>) are the fix, and DAC siting unlocks the bigger grant.',
      setup: () => {
        st().resetFilters();
        st().setFilters({ acsVariable: 'no_veh_share' });
        st().setLayers({ tracts: true, dac: true });
        st().setPanel('filters');
        st().requestFlyTo([-73.915, 40.825], 12.3);
      },
      side: 'right',
    },
    {
      element: '#tour-map',
      title: 'Place an apartment-garage site',
      description:
        'The tour placed 20 overnight chargers (7.2 kW each — like a clothes-dryer outlet) in a Mott Haven garage. Note the orange <b>DAC</b> badge on its card: it sits inside a Disadvantaged Community.',
      setup: () => {
        addGarage();
        selectAndFly(GARAGE, 16);
        st().setPanel('scenario');
      },
      side: 'left',
    },
    {
      element: '#tour-impact',
      title: 'Answer 3: it fits, and it qualifies for the bigger grant',
      description:
        'Overnight chargers are small loads, so the nearby taps swallow it with room to spare — all green. Because the site is in a DAC, the cost section later uses the <b>90 %</b> grant rate for the wiring work instead of 50 %.',
      dyn: () => statusLine(assessmentFor(GARAGE)),
      side: 'right',
    },
    /* ---------- Q4 ---------- */
    {
      element: '#tour-area',
      title: 'Question 4 · “How much extra load will the Bronx add by 2035, and where does it bite first?”',
      description:
        'Now zoom out from single sites to a whole borough. The <b>Area-wide</b> model is switched <b>on</b>: year 2035, the <b>Policy</b> adoption path (New York’s rule that all new cars sold are electric by 2035), Bronx only. The recipe is simple: count the cars in each neighbourhood (Census), assume a share go electric, work out how many are plugged in at 5 PM, and add it up for each Con Edison <b>grid zone</b> (a “network”).',
      setup: () => {
        st().setArea({ enabled: true, year: 2035, curve: 'policy', boroughs: ['Bronx'], dacOnly: false });
        st().setFilters({ acsVariable: 'none' });
        st().setLayers({ tracts: false, areaStress: true });
        st().selectSite(null);
        st().setPanel('scenario');
        st().requestFlyTo([-73.88, 40.85], 11.4);
      },
      dyn: areaLine,
      side: 'right',
    },
    {
      element: '#tour-map',
      title: 'Reading the heat map',
      description:
        'Neighbourhoods are shaded by how much new EV load lands per square kilometre (blue = little, red = a lot). The outlined grid zones turn amber or red when the added load approaches or passes the capacity Con Edison publishes for that zone. Click a zone to see its numbers.',
      side: 'left',
    },
    {
      element: '#tour-networktable',
      title: 'Answer 4: the to-do list for the grid planners',
      description:
        'The Analytics tab ranks every grid zone by how full the new load would make it. Red rows are where Con Edison’s planners need to add equipment (or pay customers to shift load) first. The <b>DAC share</b> column shows how much of that growth is in disadvantaged neighbourhoods. The <b>CSV</b> button drops the table straight into Excel.',
      setup: () => st().setTab('analytics'),
      dyn: areaLine,
      side: 'top',
    },
    {
      element: '#tour-hourly',
      title: 'The day-long picture',
      description:
        'This chart shows both sites’ load hour by hour, stacked. The dashed red line is what the same sites would draw <i>without</i> smart charging or batteries — a one-glance way to show their value. The blue marker is 5 PM, the rush hour every traffic light is judged on.',
      side: 'bottom',
    },
    /* ---------- Q5 ---------- */
    {
      element: '#tour-cost',
      title: 'Question 5 · “What does this cost, and how much do grants cover?”',
      description:
        'Cost = the chargers themselves + the wiring from the street to the parking spot (called <b>make-ready</b>, like plumbing before you buy the faucet) + any battery + an allowance for grid equipment Con Edison would have to add where a light is red. The Roosevelt Ave station carries those upgrade costs; the Mott Haven garage does not, and gets the higher DAC grant rate. All the price assumptions can be changed in Settings.',
      side: 'top',
    },
    {
      element: '#tour-kpis',
      title: 'The headline numbers',
      description:
        'These are the figures a program manager asks for: total sticker rating, real rush-hour load, how many pieces of equipment go red, total cost, grant coverage, and how many sites are in disadvantaged communities. Use the dropdown above to show a saved scenario side by side.',
      dyn: kpiLine,
      side: 'bottom',
    },
    /* ---------- wrap up ---------- */
    {
      element: '#tour-rail-saved',
      title: 'Save, share, compare',
      description:
        'Everything you set up — sites, borough-wide settings, price assumptions — fits in one share link. Save a few variations (for example “with smart charging” vs. “without”) and compare them in Analytics.',
      setup: () => {
        st().setTab('map');
        st().setPanel('saved');
      },
      side: 'right',
    },
    {
      element: '#tour-rail-missions',
      title: 'Keep practising',
      description:
        '<b>Missions</b> pose more questions like these and check your answers automatically. Hover any <b>(?)</b> for a plain-English explanation; the <b>Help</b> tab has pictures of how the grid fits together. Finishing now brings your own scenario back.',
      setup: () => st().setPanel('missions'),
      side: 'right',
    },
  ];
}

/* ---------- runner ---------- */

function runTour(onDone: () => void): { cancel: () => void } {
  const prev = structuredClone(S().scenario);
  const prevLayers = { ...S().layers };
  const prevFilters = { ...S().filters };

  // start from a clean walkthrough scenario
  S().importScenario({ id: uid(), name: TOUR_NAME, sites: [], area: structuredClone(DEFAULT_AREA), settings: structuredClone(DEFAULT_SETTINGS), createdAt: Date.now() });
  S().setFilters(DEFAULT_FILTERS);
  S().setLayers({ transformers: true, feeders: true, buildings: true, networks: true, dac: true, tracts: false, sites: true, areaStress: true });

  const steps = buildSteps();
  let unsub: (() => void) | null = null;
  let d: Driver;

  const renderDyn = (popover: { description: HTMLElement }, step: Step) => {
    const update = () => {
      popover.description.innerHTML = `${step.description}${step.dyn ? `<div class="tour-dyn">${step.dyn()}</div>` : ''}`;
    };
    update();
    unsub?.();
    unsub = step.dyn ? useStore.subscribe(() => update()) : null;
  };

  const go = (toIndex: number, move: () => void) => {
    const target = steps[toIndex];
    target?.setup?.();
    // let React commit the new UI before driver.js looks for the element
    setTimeout(move, target?.setup ? 450 : 50);
  };

  const driveSteps: DriveStep[] = steps.map((s, i) => ({
    element: s.element,
    popover: {
      title: s.title,
      description: s.description,
      side: s.side,
      align: 'start',
      onPopoverRender: (popover) => renderDyn(popover, s),
      onNextClick: () => (i === steps.length - 1 ? d.destroy() : go(i + 1, () => d.moveNext())),
      onPrevClick: () => (i === 0 ? d.destroy() : go(i - 1, () => d.movePrevious())),
    },
  }));

  d = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    popoverClass: 'tour-popover',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: 'Finish & bring my work back',
    progressText: 'Step {{current}} of {{total}}',
    steps: driveSteps,
    onDestroyed: () => {
      unsub?.();
      localStorage.setItem(LS_KEY, '1');
      const st = S();
      // keep the walkthrough in Saved (replace any older copy) and restore the user's scenario
      const tourScenario: Scenario = { ...structuredClone(st.scenario), name: TOUR_NAME, createdAt: Date.now() };
      useStore.setState({ saved: [...st.saved.filter((x) => x.name !== TOUR_NAME), tourScenario] });
      st.importScenario(prev);
      st.setLayers(prevLayers);
      st.setFilters(prevFilters);
      st.setTab('map');
      st.setPanel('scenario');
      st.setToast('Tour finished — your scenario is back; the walkthrough is kept under Saved');
      onDone();
    },
  });

  steps[0].setup?.();
  let started = false;
  const timer = setTimeout(() => {
    started = true;
    d.drive();
  }, 300);
  return {
    cancel: () => {
      clearTimeout(timer);
      if (started && d.isActive()) d.destroy();
      else if (!started) {
        // never shown: restore silently
        S().importScenario(prev);
        S().setLayers(prevLayers);
        S().setFilters(prevFilters);
      }
    },
  };
}

export function useTour() {
  const tourRequested = useStore((s) => s.tourRequested);
  const requestTour = useStore((s) => s.requestTour);
  const ctx = useSiteContext();
  const ready = !!ctx;

  // first visit: auto-start once reference data has loaded
  useEffect(() => {
    if (!ready || localStorage.getItem(LS_KEY)) return;
    const t = setTimeout(() => requestTour(true), 800);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tourRequested) return;
    const run = runTour(() => requestTour(false));
    return () => run.cancel();
  }, [tourRequested]); // eslint-disable-line react-hooks/exhaustive-deps
}
