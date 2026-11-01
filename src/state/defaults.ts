import type { AreaScenario, Filters, LayerOpacity, LayerVisibility, Scenario, Settings, Site } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 9);

export const DEFAULT_SETTINGS: Settings = {
  season: 'summer',
  peakHour: 17,
  thresholds: { warn: 0.6, crit: 1.0 },
  powerFactor: 0.95,
  xfmrKvaEstimate: {
    '< 200 kVA': 100,
    '200 kVA to 499 kVA': 350,
    '500 kVA to 1000 kVA': 750,
    '> 1000 kVA': 1500,
    'N/A': 0,
  },
  xfmrBaseLoading: 0,
  cost: {
    portCost: { L2_7: 6500, L2_11: 9000, L2_19: 14000, DCFC_50: 65000, DCFC_150: 140000, DCFC_350: 220000 },
    makeReadyPerKw: 450,
    xfmrUpgrade: 120000,
    feederPerMwOver: 900000,
    incentiveBase: 0.5,
    incentiveDac: 0.9,
    incentiveCap: 1500000,
    storagePerKwh: 550,
  },
};

export const DEFAULT_AREA: AreaScenario = {
  enabled: false,
  year: 2030,
  curve: 'policy',
  custom2035: 0.3,
  homeShare: 0.6,
  evKw: 7.2,
  coincidence: 0.22,
  managedShare: 0.25,
  managedReduction: 0.6,
  publicKwPerEv: 0.15,
  boroughs: [],
  dacOnly: false,
};

export const DEFAULT_FILTERS: Filters = {
  xfmrVoltage: ['208', '460'],
  xfmrBuckets: ['< 200 kVA', '200 kVA to 499 kVA', '500 kVA to 1000 kVA', '> 1000 kVA', 'N/A'],
  feederMinHeadroom: 0,
  feederVoltages: [],
  boroughs: [],
  dacOnly: false,
  plutoLandUse: [],
  minUnits: 0,
  acsVariable: 'none',
  networkMinRemaining: 0,
  plateMinKva: 0,
};

export const DEFAULT_LAYERS: LayerVisibility = {
  networks: false,
  msplates: false,
  dac: false,
  nws: false,
  tracts: false,
  transformers: true,
  feeders: true,
  structures: false,
  buildings: true,
  feeders33kv: false,
  sites: true,
  areaStress: true,
  satellite: false,
};

/** 1 = the layer's normal strength. Buildings are dimmed by default so the equipment dots stay readable. */
export const DEFAULT_OPACITY: LayerOpacity = { buildings: 0.45, msplates: 0.8, tracts: 0.9, networks: 1, dac: 1 };

export function newSite(lng: number, lat: number, partial: Partial<Site> = {}): Site {
  return {
    id: uid(),
    name: partial.name ?? 'New site',
    lng,
    lat,
    chargers: { L2_7: 0, L2_11: 4, L2_19: 0, DCFC_50: 0, DCFC_150: 2, DCFC_350: 0 },
    utilization: 0.7,
    diversity: 0.9,
    profile: 'public',
    managed: false,
    storageKw: 0,
    storageKwh: 0,
    radiusM: 250,
    sharing: 'grid',
    ...partial,
  };
}

/** Default scenario: a DC fast hub in Jackson Heights, Queens, plus a multifamily garage in the South Bronx. */
export function defaultScenario(): Scenario {
  return {
    id: uid(),
    name: 'Baseline',
    createdAt: Date.now(),
    settings: structuredClone(DEFAULT_SETTINGS),
    area: structuredClone(DEFAULT_AREA),
    sites: [
      newSite(-73.8803, 40.7498, {
        name: 'Roosevelt Ave DC fast hub',
        address: 'Roosevelt Ave & 82nd St, Jackson Heights, Queens',
        profile: 'public',
        chargers: { L2_7: 0, L2_11: 0, L2_19: 0, DCFC_50: 0, DCFC_150: 6, DCFC_350: 2 },
      }),
      newSite(-73.9208, 40.8166, {
        name: 'Mott Haven multifamily garage',
        address: 'E 149th St & Morris Ave, Bronx',
        profile: 'residential',
        chargers: { L2_7: 12, L2_11: 0, L2_19: 0, DCFC_50: 0, DCFC_150: 0, DCFC_350: 0 },
        utilization: 0.6,
        diversity: 0.8,
      }),
    ],
  };
}
