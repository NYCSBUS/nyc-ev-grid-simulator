import type { AreaResult, Scenario, SiteAssessment } from '../types';
import { nameplateKw, portCount } from './model';

export interface MissionCtx {
  scenario: Scenario;
  assessments: Map<string, SiteAssessment>;
  area: AreaResult | null;
  analyticsVisited: boolean;
}

export interface Mission {
  id: string;
  title: string;
  brief: string;
  why: string;
  steps: string[];
  check: (c: MissionCtx) => { done: boolean; progress: string };
}

const dcfcPorts = (s: Scenario['sites'][number]) => s.chargers.DCFC_50 + s.chargers.DCFC_150 + s.chargers.DCFC_350;
/** True only once live grid assets (transformers / feeders / structures) are loaded and none is critical. */
const hasLive = (a?: SiteAssessment) => !!a && a.assets.some((x) => x.kind === 'transformer' || x.kind === 'feeder' || x.kind === 'structure');
const noCrit = (a?: SiteAssessment) => hasLive(a) && !a!.assets.some((x) => x.status === 'crit');

export const MISSIONS: Mission[] = [
  {
    id: 'first-site',
    title: '1 · First connection',
    brief: 'Put a site with at least 2 fast-charging plugs anywhere in NYC without turning any light red.',
    why: 'This is the basic move: drop a site, choose the chargers, read the traffic lights on the nearby grid equipment.',
    steps: ['Click "Add a site" then click the map (or search an address)', 'Give it 2 or more DC fast plugs', 'Check the traffic lights — none should be red'],
    check: ({ scenario, assessments }) => {
      const ok = scenario.sites.filter((s) => dcfcPorts(s) >= 2 && noCrit(assessments.get(s.id)));
      return { done: ok.length > 0, progress: `${ok.length} qualifying site(s)` };
    },
  },
  {
    id: 'equity-hub',
    title: '2 · Equity fast-charging hub',
    brief: 'Build a fast-charging station (4 or more 150 kW plugs) inside a Disadvantaged Community without pushing a transformer into the red.',
    why: 'New York\'s climate law sends 35–40 % of clean-energy benefits to disadvantaged communities. Finding spots there that don\'t need expensive grid work is a real program goal.',
    steps: ['On the map, open Layers and turn on Disadvantaged communities', 'Open Filters and keep only big 460 V taps (> 1000 kVA); look inside an orange area', 'Place a site there with 4+ DC Fast 150 kW plugs'],
    check: ({ scenario, assessments }) => {
      const ok = scenario.sites.filter((s) => {
        const a = assessments.get(s.id);
        return s.chargers.DCFC_150 >= 4 && !!a?.inDac && hasLive(a) && !a.assets.some((x) => x.kind === 'transformer' && x.status === 'crit');
      });
      return { done: ok.length > 0, progress: `${ok.length} qualifying hub(s)` };
    },
  },
  {
    id: 'managed-depot',
    title: '3 · Smart-charging van depot',
    brief: 'Create a delivery-van depot with a sticker rating of 1 MW or more, then use smart charging and/or a battery so its rush-hour load is under 45 % of the sticker.',
    why: 'Depots are the biggest single loads coming to the grid. Smart charging and batteries are how the utility avoids digging up the street to upgrade mains.',
    steps: ['Set "What kind of place" to the van / truck depot', 'Add chargers until the sticker rating reaches 1,000 kW', 'Turn on smart charging and/or add a battery until rush-hour load ÷ sticker is below 45 %'],
    check: ({ scenario, assessments }) => {
      const ok = scenario.sites.filter((s) => {
        const a = assessments.get(s.id);
        return s.profile === 'fleet' && nameplateKw(s) >= 1000 && !!a && a.coincidentKw / a.nameplateKw < 0.45;
      });
      return { done: ok.length > 0, progress: `${ok.length} qualifying depot(s)` };
    },
  },
  {
    id: 'outlook-2035',
    title: '4 · 2035 load outlook',
    brief: 'Run borough-wide growth for 2035 or later on the Policy path and look at the grid-zone table in Results.',
    why: 'Forecasting EV load zone by zone is how the EV team tells the grid planners where to add equipment first.',
    steps: ['Open the Outlook tab (this switches borough-wide growth on)', 'Drag the year to 2035 or later and keep the adoption path on Policy', 'Open Results and find the fullest grid zone'],
    check: ({ scenario, area, analyticsVisited }) => {
      const done = !!area && scenario.area.year >= 2035 && scenario.area.curve === 'policy' && analyticsVisited;
      return { done, progress: area ? `Year ${area.year}, ${area.networkStats.filter((n) => n.status === 'crit').length} grid zones in the red` : 'Borough-wide growth is off' };
    },
  },
  {
    id: 'budget',
    title: '5 · Portfolio on a budget',
    brief: 'Have 3 or more sites adding up to at least 1.5 MW on the sticker, no red lights anywhere, for under $4M total.',
    why: 'Getting the most charging for a fixed budget is the day job: checking costs, setting grants, choosing what to build first.',
    steps: ['Add or resize sites', 'Use slow (Level 2) chargers where room is tight and fast chargers only near big 460 V taps', 'Watch the cost section in Results'],
    check: ({ scenario, assessments }) => {
      const n = scenario.sites.length;
      const np = scenario.sites.reduce((s, x) => s + nameplateKw(x), 0);
      const cost = scenario.sites.reduce((s, x) => s + (assessments.get(x.id)?.cost.total ?? 0), 0);
      const crit = scenario.sites.some((x) => assessments.get(x.id)?.assets.some((a) => a.status === 'crit'));
      const allLive = scenario.sites.every((x) => hasLive(assessments.get(x.id)));
      const done = n >= 3 && np >= 1500 && !crit && cost < 4_000_000 && allLive;
      return { done, progress: `${n} sites · ${(np / 1000).toFixed(2)} MW · $${(cost / 1e6).toFixed(2)}M${crit ? ' · has a red light' : ''}` };
    },
  },
  {
    id: 'many-ports',
    title: '6 · Curbside chargers for a car-light neighbourhood',
    brief: 'Place a home-style site with 20 or more Level 2 plugs in a neighbourhood where over 60 % of households have no car, keeping every light out of the red.',
    why: 'Curbside chargers in renter-heavy, car-light neighbourhoods are a core fairness and growth lever in dense NYC — people there can\'t charge at home.',
    steps: ['On the map, open Filters and shade neighbourhoods by "Households with no car"', 'Place a Level 2 site in a dark-shaded (high) neighbourhood with the Home / apartment profile', 'Keep every light green or amber'],
    check: ({ scenario, assessments }) => {
      const ok = scenario.sites.filter((s) => {
        const a = assessments.get(s.id);
        const l2 = s.chargers.L2_7 + s.chargers.L2_11 + s.chargers.L2_19;
        return s.profile === 'residential' && l2 >= 20 && portCount(s) >= 20 && (a?.tract?.no_veh_share as number) >= 0.6 && noCrit(a);
      });
      return { done: ok.length > 0, progress: `${ok.length} qualifying corridor(s)` };
    },
  },
];
