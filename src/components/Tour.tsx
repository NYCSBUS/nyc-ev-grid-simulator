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

const LS_KEY = 'evsim.tour.seen.v2';
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

function statusLine(a?: SiteAssessment) {
  if (!a) return '<i>Loading grid data from Con Edison…</i>';
  const live = a.assets.filter((x) => x.ratio != null);
  if (!live.length) return `<i>${loading() ? 'Loading grid data from Con Edison…' : 'No assets with capacity data within the radius.'}</i>`;
  const by = (k: 'ok' | 'warn' | 'crit') => live.filter((x) => x.status === k).length;
  const worst = live.slice().sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
  return `Coincident load <b>${fmt.kw(a.coincidentKw)}</b> → <span style="color:#22c55e">${by('ok')} OK</span>, <span style="color:#f59e0b">${by('warn')} watch</span>, <span style="color:#ef4444">${by('crit')} critical</span>.<br/>Binding asset: <b>${worst.name}</b> at <b>${fmt.pct(Math.min(worst.ratio!, 9.99))}</b> of ${fmt.kw(worst.headroomKw)} headroom.`;
}

function areaLine() {
  const st = S();
  const sd = st.staticData;
  if (!st.scenario.area.enabled || !sd.tracts || !sd.networks || !sd.plates) return '<i>Computing…</i>';
  const idx = buildAreaIndex(sd.tracts, sd.networks, sd.plates);
  const r = runArea(st.scenario.area, sd.tracts, sd.networks, idx, st.scenario.settings);
  const top = r.networkStats.filter((n) => n.evs > 0).slice(0, 3);
  return `<b>${fmt.int(r.totalEvs)} EVs</b> (${fmt.pct(r.evShare, 1)} of ${fmt.int(r.totalVehicles)} vehicles) add <b>${fmt.mw(r.totalAddedMw)}</b> at system peak. ${r.networkStats.filter((n) => n.status === 'crit').length} networks critical.<br/>Most stressed: <ul style="margin:4px 0 0 16px;padding:0">${top
    .map((n) => li(`<b>${n.network}</b> — ${n.addedMw.toFixed(1)} MW vs ${n.capacityRange ?? '?'} MW range (${fmt.pct(n.ratio)})`))
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
  return `${sites.length} sites · <b>${fmt.kw(np)}</b> nameplate · <b>${fmt.kw(co)}</b> coincident · ${crit} critical assets · est. <b>${fmt.usd(cost)}</b>, incentive ${fmt.usd(inc)} (${fmt.pct(cost ? inc / cost : 0)}).`;
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
      title: 'How an EV analyst uses this tool',
      description:
        'This walkthrough drives the app for you to answer five questions the EV Strategy group gets asked. Your current scenario has been set aside and will be restored at the end; the walkthrough is kept under Saved as “Tour walkthrough”. Use <b>Next</b> to advance — each step changes something on screen.',
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
      title: 'Q1 · “Can the grid take a 1.2 MW fast hub at Roosevelt Ave & 82nd St?”',
      description:
        'A developer wants 8 × 150 kW DC fast ports in Jackson Heights. Normally you would type the address here and click <i>Add site here</i>. The tour will place it for you on the next step.',
      side: 'bottom',
    },
    {
      element: '#tour-map',
      title: 'The site is placed',
      description:
        'White pin = the hub; dashed circle = its 250 m search radius. Coloured dots are Con Edison EV transformers (green → red = more → less available capacity; white ring = 460 V). The rings around three dots show which transformers receive this site’s load, coloured by status.',
      setup: () => {
        addHub();
        selectAndFly(HUB, 16.2);
        st().setPanel('scenario');
      },
      side: 'left',
    },
    {
      element: '#tour-chargers',
      title: 'Sizing the load',
      description: 'Nameplate is what the developer quotes; the utility cares about load at the 5 PM system peak. Public-hub profile × 70 % utilization × 90 % diversity gives the coincident load used for every status below.',
      dyn: () => {
        const s = siteByName(HUB);
        const a = assessmentFor(HUB);
        return s ? `Nameplate <b>${fmt.kw(nameplateKw(s))}</b> → peak <b>${a ? fmt.kw(a.peakKw) : '…'}</b>, at system peak <b>${a ? fmt.kw(a.coincidentKw) : '…'}</b>.` : '';
      },
      side: 'right',
    },
    {
      element: '#tour-impact',
      title: 'Answer 1: not as designed',
      description:
        'The load is split 60 / 25 / 15 % over the three nearest transformers and the three nearest vault structures. The transformers are 208 V units with < 500 kVA available and the vaults have only a few dozen kW of published headroom, so most go <b>critical</b> — the binding asset below is the one with the least room. No feeders appear because this is a secondary-network area; Con Edison publishes M&S plate and structure kVA here instead, and the plate itself has room. The constraint is local: this parcel needs a dedicated 460 V service.',
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    /* ---------- Q2 ---------- */
    {
      element: '#tour-loadshape',
      title: 'Q2 · “Would managed charging fix it?”',
      description:
        'Managed charging is now <b>on</b>. For a public hub it barely helps — drivers charge when they arrive, and the profile already peaks mid-afternoon to early evening. Compare the coincident load with the previous step.',
      setup: () => patchSite(HUB, { managed: true }),
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    {
      element: '#tour-loadshape',
      title: 'Add on-site storage',
      description:
        'A 400 kW / 1.6 MWh battery now peak-shaves the site. Coincident load falls, but 208 V transformers still can’t host a fast hub. Answer 2: storage and managed charging are tools for <i>watch</i> sites, not for a fundamental voltage mismatch. The next question is where 460 V capacity exists.',
      setup: () => patchSite(HUB, { storageKw: 400, storageKwh: 1600 }),
      dyn: () => statusLine(assessmentFor(HUB)),
      side: 'right',
    },
    {
      element: '#tour-rail-filters',
      title: 'Hunt for 460 V capacity',
      description:
        'Filters are now set to <b>460 V</b> transformers with <b>≥ 500 kVA</b> available, and the map zoomed out a notch. Every remaining dot is a plausible plug-in point for a DC fast hub. Where they cluster, a developer can site; where there are none, the answer is a new vault or a different corridor.',
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
        'White-ringed dots = 460 V ≥ 500 kVA. Click any for its exact range and plate. In a real screening you would drag the site onto the best candidate, or widen the search radius in the site editor, and re-check the impact list.',
      side: 'left',
    },
    /* ---------- Q3 ---------- */
    {
      element: '#tour-rail-filters',
      title: 'Q3 · “Where should an equity L2 program go?”',
      description:
        'Filters reset. Census tracts are now coloured by <b>households without a vehicle</b>, with <b>Disadvantaged Community</b> tracts outlined in orange. The South Bronx combines DAC status, low car ownership today and dense multifamily housing: residents can’t charge at home, so shared L2 is the program lever — and DAC siting earns the higher make-ready incentive.',
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
      title: 'Place a multifamily garage site',
      description: 'A 20-port 7.2 kW L2 garage (144 kW) is now placed in Mott Haven with the residential profile. Note the <b>DAC</b> badge on its card.',
      setup: () => {
        addGarage();
        selectAndFly(GARAGE, 16);
        st().setPanel('scenario');
      },
      side: 'left',
    },
    {
      element: '#tour-impact',
      title: 'Answer 3: fits, and qualifies for DAC incentives',
      description: 'L2 loads are small; the nearest 208 V transformers absorb it with headroom to spare. In the cost module this site gets the 90 % DAC make-ready share rather than 50 %.',
      dyn: () => statusLine(assessmentFor(GARAGE)),
      side: 'right',
    },
    /* ---------- Q4 ---------- */
    {
      element: '#tour-area',
      title: 'Q4 · “How much EV load will the Bronx add by 2035, and which networks hit limits first?”',
      description:
        'The area scenario is now <b>on</b>: year 2035, <b>Policy</b> curve (NY Advanced Clean Cars II), scope = Bronx. Per tract: EVs = ACS vehicles × fleet share; peak kW = home-charging share × 7.2 kW × 22 % coincidence, minus managed-charging savings, plus 0.15 kW public/fleet per EV.',
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
      title: 'Reading the overlay',
      description: 'Tracts shade by added EV kW per km² (quintiles). Network outlines turn amber/red where the scenario’s MW approaches or exceeds Con Edison’s published network capacity range. Click a network for its numbers.',
      side: 'left',
    },
    {
      element: '#tour-networktable',
      title: 'Answer 4: the reinforcement queue',
      description:
        'Analytics ranks every network by added MW ÷ capacity-range midpoint. Red rows are where Distribution Planning needs reinforcement or a non-wires solution first; the <b>DAC share</b> column shows how much of that growth is in disadvantaged communities. Export CSV to drop straight into Excel.',
      setup: () => st().setTab('analytics'),
      dyn: areaLine,
      side: 'top',
    },
    {
      element: '#tour-hourly',
      title: 'Load shape for the deck',
      description: 'The hourly chart stacks both sites. The dashed red line is the same portfolio without managed charging or storage — a one-glance way to show the value of load management. The blue marker is the system-peak hour used for every status.',
      side: 'bottom',
    },
    /* ---------- Q5 ---------- */
    {
      element: '#tour-cost',
      title: 'Q5 · “What does this cost, and what does the incentive cover?”',
      description:
        'Chargers + make-ready ($/kW) + storage + grid-upgrade allowances triggered by critical assets. The Roosevelt hub carries transformer-upgrade allowances; the Mott Haven garage does not, and earns the higher DAC incentive share. Every number is editable in Settings and saved with the scenario.',
      side: 'top',
    },
    {
      element: '#tour-kpis',
      title: 'Headline KPIs',
      description: 'The numbers a program manager asks for: nameplate, coincident peak, critical assets, cost, incentive, DAC share. Pick a saved scenario in the dropdown above to show them side by side.',
      dyn: kpiLine,
      side: 'bottom',
    },
    /* ---------- wrap up ---------- */
    {
      element: '#tour-rail-saved',
      title: 'Save, share, compare',
      description: 'The whole scenario — sites, area settings, model assumptions — is encoded in a share link. Save variants (e.g. “with managed charging”) and compare them in Analytics.',
      setup: () => {
        st().setTab('map');
        st().setPanel('saved');
      },
      side: 'right',
    },
    {
      element: '#tour-rail-missions',
      title: 'Keep practising',
      description: 'Missions pose more questions like these and check your answers. Hover any (?) for a definition; the Help tab explains hosting capacity, coincidence, diversity and the area model with diagrams. Finishing now restores your previous scenario.',
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
    doneBtnText: 'Finish & restore my scenario',
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
      st.setToast('Tour finished — your scenario is restored; the walkthrough is in Saved');
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
