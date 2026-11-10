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
import { friendlyAsset, roomPhrase } from '../sim/verdict';

/** Set once the visitor has either taken the tour or chosen to explore alone; the welcome card shows until then. */
export const TOUR_SEEN_KEY = 'evsim.tour.seen.v4';
const LS_KEY = TOUR_SEEN_KEY;
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
    covered: st.live.covered,
  });
}

const siteByName = (name: string) => S().scenario.sites.find((s) => s.name === name);
const assessmentFor = (name: string) => {
  const s = siteByName(name);
  return s ? currentAssessments().get(s.id) : undefined;
};
const loading = () => Object.values(S().live.loading).some(Boolean);
const li = (s: string) => `<li>${s}</li>`;

function statusLine(a?: SiteAssessment) {
  // same rule as the verdict card: no colours until the equipment around the site has arrived
  if (!a || a.provisional) return '<i>Checking the grid around the site…</i>';
  const live = a.assets.filter((x) => x.ratio != null);
  if (!live.length) return `<i>${loading() ? 'Checking the grid around the site…' : 'No equipment with published room nearby.'}</i>`;
  const by = (k: 'ok' | 'warn' | 'crit') => live.filter((x) => x.status === k).length;
  const worst = live.slice().sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
  return `<b>${fmt.kw(a.coincidentKw)}</b> at the 5 PM rush → <span style="color:#22c55e">${by('ok')} green</span>, <span style="color:#f59e0b">${by('warn')} amber</span>, <span style="color:#ef4444">${by('crit')} red</span>.<br/>Tightest spot: <b>${friendlyAsset(worst)}</b> — the site uses <b>${roomPhrase(worst)}</b>.`;
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
    .map((n) => li(`<b>${n.network}</b> — adds ${n.addedMw.toFixed(1)} MW to a zone rated ${n.capacityRange ?? '?'} MW (${fmt.fill(n.ratio)} of its mid-point)`))
    .join('')}</ul>`;
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

  // Each step: one idea, about 50 words, and something visibly changes on screen.
  return [
    {
      title: 'A 5-minute tour: five everyday questions',
      description:
        'Think of the grid as plumbing: mains under the street, a tap (<b>transformer</b>) for each block. Each has only so much <b>room left</b>. The tour drives the app for you; your own work is set aside and comes back at the end. Every <b>Next</b> changes something on screen.',
      setup: () => {
        st().setTab('sites');
        st().setDrawer(null);
        st().setSidebarOpen(true);
        st().requestFlyTo([-73.93, 40.75], 10.8);
      },
    },
    /* ---------- Q1 ---------- */
    {
      element: '#tour-map',
      title: 'Question 1 · “Can 8 fast chargers go in at Roosevelt Ave & 82nd St?”',
      description:
        'The white pin is the station; the dashed circle is how far it looks for equipment. The dots are Con Edison’s transformers, shaded by the room they have <i>today</i>: <b>pale blue = lots, violet = little</b>. A white ring marks the 460 V kind that fast chargers need.',
      setup: () => {
        addHub();
        selectAndFly(HUB, 16.2);
        st().setDrawer(null);
      },
      side: 'left',
    },
    {
      element: '#tour-chargers',
      title: 'Sticker rating vs. real load',
      description:
        'Add up the plugs and you get the <b>sticker rating</b> — like a car’s top speed. The grid feels something smaller: the load at <b>5 PM on a hot day</b>, its rush hour, because not every plug is busy at once.',
      dyn: () => {
        const s = siteByName(HUB);
        const a = assessmentFor(HUB);
        return s ? `Sticker rating <b>${fmt.kw(nameplateKw(s))}</b> → busiest moment <b>${a ? fmt.kw(a.peakKw) : '…'}</b> → at the 5 PM rush <b>${a ? fmt.kw(a.coincidentKw) : '…'}</b>.` : '';
      },
      side: 'right',
    },
    {
      element: '#tour-verdict',
      title: 'Answer 1: not on this corner',
      description:
        'The verdict comes first, and the same banner floats on the map. Each light compares the station’s rush-hour load with the room left on one nearby piece of equipment: <b>green fits, amber is tight, red doesn’t fit</b>. The taps and vaults here are small, so this corner would need new equipment.',
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    /* ---------- Q2 ---------- */
    {
      element: '#tour-loadshape',
      title: 'Question 2 · “Would smart charging or a battery fix it?”',
      description:
        'The tour just switched on <b>smart charging</b> (shifting use away from rush hour, like running the dishwasher at night) and added a <b>battery</b> (a tank that fills overnight). The load drops, but not enough. <b>Answer 2:</b> both can turn an amber site green; neither rescues one deep in the red.',
      setup: () => patchSite(HUB, { managed: true, storageKw: 400, storageKwh: 1600 }),
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    {
      element: '#tour-drawer',
      title: 'So where would it fit?',
      description:
        '<b>Filters</b> now shows only the taps fast chargers need: 460 V with at least 500 kVA of room. Every dot still on the map is a candidate. <b>Drag the pin</b> onto one and the verdict re-checks itself.',
      setup: () => {
        st().setDrawer('filters');
        st().setFilters({ xfmrVoltage: ['460'], xfmrBuckets: ['500 kVA to 1000 kVA', '> 1000 kVA'] });
        const s = siteByName(HUB);
        if (s) st().requestFlyTo([s.lng, s.lat], 14.6);
      },
      side: 'left',
    },
    /* ---------- Q3 ---------- */
    {
      element: '#tour-drawer',
      title: 'Question 3 · “Where should a fairness-focused program go?”',
      description:
        'Neighbourhoods are now shaded by <b>households with no car</b>. Orange outlines are State-designated <b>Disadvantaged Communities</b> (DACs), which earn bigger grants. The South Bronx stands out: apartments, no driveways. Shared overnight chargers in garages are the fix.',
      setup: () => {
        st().resetFilters();
        st().setFilters({ acsVariable: 'no_veh_share' });
        st().setLayers({ tracts: true, dac: true });
        st().setDrawer('filters');
        st().selectSite(null);
        st().requestFlyTo([-73.915, 40.825], 12.3);
      },
      side: 'left',
    },
    {
      element: '#tour-verdict',
      title: 'Answer 3: a garage in Mott Haven',
      description:
        'The tour placed 20 overnight chargers (7 kW each, like a clothes dryer) in a Mott Haven garage. Small loads fit easily. The orange <b>DAC</b> badge at the top means the wiring grant is 90 % instead of 50 %.',
      setup: () => {
        addGarage();
        selectAndFly(GARAGE, 16);
        st().setDrawer(null);
      },
      dyn: () => statusLine(assessmentFor(GARAGE)),
      side: 'right',
    },
    /* ---------- Q4 ---------- */
    {
      element: '#tour-outlook',
      title: 'Question 4 · “What does the Bronx add by 2035?”',
      description:
        '<b>Outlook</b> zooms out to a whole borough. Count each neighbourhood’s cars, assume a share go electric, work out who is plugged in at 5 PM, and add it up for each Con Edison <b>grid zone</b>.',
      setup: () => {
        st().setTab('outlook');
        st().setArea({ enabled: true, year: 2035, curve: 'policy', boroughs: ['Bronx'], dacOnly: false });
        st().setFilters({ acsVariable: 'none' });
        st().setLayers({ tracts: false, areaStress: true });
        st().selectSite(null);
        st().requestFlyTo([-73.88, 40.85], 11.4);
      },
      dyn: areaLine,
      side: 'right',
    },
    {
      element: '#tour-map',
      title: 'Reading the outlook map',
      description:
        'Neighbourhoods are shaded <b>purple</b> by the new EV load that lands there (brighter = more). Grid zones get a traffic light: amber or red where the added load nears or passes the capacity Con Edison publishes. Click a zone for its numbers.',
      side: 'left',
    },
    {
      element: '#tour-networktable',
      title: 'Answer 4: the planners’ to-do list',
      description:
        '<b>Results</b> ranks every grid zone by how full it gets. Red rows need equipment first. <b>DAC share</b> shows how much of the growth is in disadvantaged neighbourhoods, and <b>CSV</b> takes the table to Excel.',
      setup: () => st().setTab('results'),
      side: 'top',
    },
    {
      element: '#tour-hourly',
      title: 'The day-long picture',
      description:
        'Both sites, hour by hour, stacked. The dashed red line is the same sites <i>without</i> smart charging or batteries. The blue marker is the 5 PM rush that every light is judged on.',
      side: 'bottom',
    },
    /* ---------- Q5 ---------- */
    {
      element: '#tour-cost',
      title: 'Question 5 · “What does it cost, and what do grants cover?”',
      description:
        'Cost = chargers + wiring to the parking spot (<b>make-ready</b>) + battery + an allowance for new grid equipment wherever a light is red. The fast hub carries upgrade costs; the garage doesn’t, and earns the larger DAC grant. Prices can be changed in Settings.',
      side: 'top',
    },
    {
      element: '#tour-summary',
      title: 'Answer 5: the bottom line',
      description:
        'The same answer in sentences: load, fit, cost against your budget, equity, outlook. <b>Snapshot &amp; compare</b> (top right) freezes these numbers, so the next thing you change shows up as before and after.',
      side: 'bottom',
    },
    /* ---------- wrap up ---------- */
    {
      element: '#tour-tab-learn',
      title: 'Keep practising',
      description:
        '<b>Scenarios</b> saves versions and shares them as a link. <b>Learn</b> has an illustrated guide and <b>missions</b> that check your answers. Any <b>(?)</b> explains itself. Finishing now brings your own scenario back.',
      setup: () => {
        st().setTab('learn');
        st().setLearnView('missions');
      },
      side: 'bottom',
    },
  ];
}

/* ---------- runner ---------- */

function runTour(onDone: () => void): { cancel: () => void } {
  const prev = structuredClone(S().scenario);
  const prevLayers = { ...S().layers };
  const prevFilters = { ...S().filters };
  const prevStash = S().stash;
  const prevMode = S().mapMode;

  // start from a clean walkthrough scenario, on the Sites map
  S().setTab('sites');
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
      st.setTab('sites');
      // put both map experiences back exactly as the user had them
      useStore.setState({ stash: prevStash });
      if (prevMode === 'sites') {
        st.setLayers(prevLayers);
        st.setFilters(prevFilters);
      } else {
        st.setLayers(prevStash.sites.layers);
        st.setFilters(prevStash.sites.filters);
      }
      st.setDrawer(null);
      st.setToast('Tour finished — your scenario is back. The walkthrough is saved in the Scenarios tab.');
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
        S().setTab('sites');
        useStore.setState({ stash: prevStash });
        S().setLayers(prevMode === 'sites' ? prevLayers : prevStash.sites.layers);
        S().setFilters(prevMode === 'sites' ? prevFilters : prevStash.sites.filters);
      }
    },
  };
}

export function useTour() {
  const tourRequested = useStore((s) => s.tourRequested);
  const requestTour = useStore((s) => s.requestTour);
  const ctx = useSiteContext();
  const ready = !!ctx;

  // The tour never starts by itself: a first-time visitor is offered it (see the welcome card in App) and chooses.
  useEffect(() => {
    if (!tourRequested || !ready) return;
    const run = runTour(() => requestTour(false));
    return () => run.cancel();
  }, [tourRequested, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
