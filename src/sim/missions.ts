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
    brief: 'Place a new site anywhere in NYC with at least 2 DC fast ports and no asset in the red.',
    why: 'Learn the core loop: drop a site, size the chargers, read the traffic-light status on nearby transformers and feeders.',
    steps: ['Click "Add site" then click the map (or search an address)', 'Give it ≥ 2 DCFC ports', 'Check the Impact list — nothing should be critical'],
    check: ({ scenario, assessments }) => {
      const ok = scenario.sites.filter((s) => dcfcPorts(s) >= 2 && noCrit(assessments.get(s.id)));
      return { done: ok.length > 0, progress: `${ok.length} qualifying site(s)` };
    },
  },
  {
    id: 'equity-hub',
    title: '2 · Equity fast-charging hub',
    brief: 'Build a hub with ≥ 4 × 150 kW ports inside a Disadvantaged Community tract where the nearest transformer stays out of the red.',
    why: 'NY CLCPA directs 35–40% of clean-energy benefits to DACs. Siting fast charging there without triggering upgrades is a real program objective.',
    steps: ['Turn on the DAC layer', 'Find a DAC tract with a > 1000 kVA transformer nearby (use the transformer filter)', 'Place a site with 4+ DCFC 150 kW'],
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
    title: '3 · Managed fleet depot',
    brief: 'Create a fleet-depot site with ≥ 1 MW of nameplate where managed charging keeps coincident peak below 45% of nameplate.',
    why: 'Depots are the biggest single loads in the pipeline. Managed charging and storage are how the utility avoids feeder upgrades.',
    steps: ['Set profile to "Fleet depot"', 'Add chargers until nameplate ≥ 1,000 kW', 'Enable managed charging and/or add storage until coincident / nameplate < 45%'],
    check: ({ scenario, assessments }) => {
      const ok = scenario.sites.filter((s) => {
        const a = assessments.get(s.id);
        return s.profile === 'fleet' && nameplateKw(s) >= 1000 && !!a && a.coincidentKw / a.nameplateKw < 0.45;
      });
      return { done: ok.length > 0, progress: `${ok.length} qualifying depot(s)` };
    },
  },
  {
    id: 'outlook-2030',
    title: '4 · 2030 load outlook',
    brief: 'Run the area scenario for 2030+ on the Policy curve and review network stress in the Analytics tab.',
    why: 'Forecasting EV load by network is how the EV Strategy group tells Distribution Planning where reinforcement is needed first.',
    steps: ['Open Scenario → Area-wide adoption and enable it', 'Set year ≥ 2030, curve = Policy', 'Open the Analytics tab and find the most stressed network'],
    check: ({ scenario, area, analyticsVisited }) => {
      const done = !!area && scenario.area.year >= 2030 && scenario.area.curve === 'policy' && analyticsVisited;
      return { done, progress: area ? `Scenario year ${area.year}, ${area.networkStats.filter((n) => n.status === 'crit').length} networks critical` : 'Area scenario off' };
    },
  },
  {
    id: 'budget',
    title: '5 · Budget-constrained portfolio',
    brief: 'Have ≥ 3 sites totalling ≥ 1.5 MW nameplate, zero critical assets, with total estimated cost under $4M.',
    why: 'Portfolio optimisation under a budget is the day job: cost validation, incentive setting and prioritisation.',
    steps: ['Add or resize sites', 'Use L2 where headroom is tight and DCFC where > 1000 kVA transformers exist', 'Watch the cost module in the Analytics tab'],
    check: ({ scenario, assessments }) => {
      const n = scenario.sites.length;
      const np = scenario.sites.reduce((s, x) => s + nameplateKw(x), 0);
      const cost = scenario.sites.reduce((s, x) => s + (assessments.get(x.id)?.cost.total ?? 0), 0);
      const crit = scenario.sites.some((x) => assessments.get(x.id)?.assets.some((a) => a.status === 'crit'));
      const allLive = scenario.sites.every((x) => hasLive(assessments.get(x.id)));
      const done = n >= 3 && np >= 1500 && !crit && cost < 4_000_000 && allLive;
      return { done, progress: `${n} sites · ${(np / 1000).toFixed(2)} MW · $${(cost / 1e6).toFixed(2)}M${crit ? ' · has critical' : ''}` };
    },
  },
  {
    id: 'many-ports',
    title: '6 · Curbside L2 corridor',
    brief: 'Place a residential-profile site with ≥ 20 L2 ports in a tract where fewer than 40% of households own a car, keeping the plate/transformer out of the red.',
    why: 'Curbside L2 for car-light, renter-heavy neighbourhoods is a core equity and demand-growth lever in dense NYC.',
    steps: ['Turn on the Census tracts layer and colour by "No-vehicle households"', 'Place an L2 site in a high no-vehicle tract', 'Keep status green or amber'],
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
