import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';

export type ChargerType = 'L2_7' | 'L2_11' | 'L2_19' | 'DCFC_50' | 'DCFC_150' | 'DCFC_350';
export type ProfileType = 'residential' | 'workplace' | 'public' | 'fleet' | 'transit';
export type Season = 'summer' | 'winter';
export type Status = 'ok' | 'warn' | 'crit' | 'unknown';

export interface Site {
  /** Optional cap on kW per plug by charger type (e.g. a managed-charging system limits 19.2 kW plugs to 10 kW). */
  derateKw?: Partial<Record<ChargerType, number>>;
  id: string;
  name: string;
  lng: number;
  lat: number;
  address?: string;
  bbl?: string;
  chargers: Record<ChargerType, number>;
  /** Share of ports simultaneously drawing at peak (0-1). */
  utilization: number;
  /** Diversity factor applied on top of utilization (0-1). */
  diversity: number;
  profile: ProfileType;
  managed: boolean;
  storageKw: number;
  storageKwh: number;
  /** Search radius for nearby assets, metres. */
  radiusM: number;
  /** 'single' = all load on nearest transformer; 'grid' = share across nearest 3 (secondary network). */
  sharing: 'single' | 'grid';
}

export type AdoptionCurve = 'policy' | 'moderate' | 'slow' | 'custom';

export interface AreaScenario {
  enabled: boolean;
  year: number;
  curve: AdoptionCurve;
  /** Custom curve anchor: EV share of light-duty fleet in 2035 (0-1). */
  custom2035: number;
  /** Share of EV energy charged at home (0-1). */
  homeShare: number;
  /** Average home charger power, kW. */
  evKw: number;
  /** Unmanaged peak coincidence factor (0-1). */
  coincidence: number;
  /** Share of EV owners enrolled in managed charging (0-1). */
  managedShare: number;
  /** Peak reduction achieved by managed charging (0-1). */
  managedReduction: number;
  /** Public/fleet charging load added per EV at system peak, kW. */
  publicKwPerEv: number;
  boroughs: string[];
  dacOnly: boolean;
}

export interface Thresholds {
  warn: number;
  crit: number;
}

export interface CostParams {
  portCost: Record<ChargerType, number>;
  /** Utility-side make-ready $/kW (service, metering, trenching). */
  makeReadyPerKw: number;
  /** Cost to upgrade an overloaded transformer, $ per unit. */
  xfmrUpgrade: number;
  /** Cost for feeder reinforcement when feeder headroom exceeded, $ per MW over. */
  feederPerMwOver: number;
  /** Incentive share of make-ready costs (base / in DAC). */
  incentiveBase: number;
  incentiveDac: number;
  /** Incentive cap per site, $. */
  incentiveCap: number;
  storagePerKwh: number;
}

export interface Settings {
  season: Season;
  peakHour: number;
  thresholds: Thresholds;
  powerFactor: number;
  xfmrKvaEstimate: Record<string, number>;
  /** Assumed existing loading on a transformer before EV load (0-1). */
  xfmrBaseLoading: number;
  cost: CostParams;
  /** Optional total-cost budget for the scenario, $. Results compares the estimate against it. */
  budget?: number;
}

export interface Filters {
  xfmrVoltage: Array<'208' | '460'>;
  xfmrBuckets: string[];
  feederMinHeadroom: number;
  feederVoltages: string[];
  boroughs: string[];
  dacOnly: boolean;
  plutoLandUse: string[];
  minUnits: number;
  acsVariable: AcsVariable;
  networkMinRemaining: number;
  plateMinKva: number;
}

export type AcsVariable = 'none' | 'density' | 'mhi' | 'renter_share' | 'veh_per_hh' | 'no_veh_share' | 'mf_share' | 'dac';

export interface LayerVisibility {
  networks: boolean;
  msplates: boolean;
  dac: boolean;
  nws: boolean;
  tracts: boolean;
  transformers: boolean;
  feeders: boolean;
  structures: boolean;
  buildings: boolean;
  feeders33kv: boolean;
  sites: boolean;
  areaStress: boolean;
  satellite: boolean;
}

export type LayerOpacity = Partial<Record<keyof LayerVisibility, number>>;

export interface Scenario {
  id: string;
  name: string;
  sites: Site[];
  area: AreaScenario;
  settings: Settings;
  createdAt: number;
}

/* ---------- Assessment outputs ---------- */

export interface AssetStatus {
  id: string;
  kind: 'transformer' | 'feeder' | 'plate' | 'network' | 'structure';
  name: string;
  distanceM: number;
  /** Capacity / headroom available for new load, kW. null when unknown. */
  headroomKw: number | null;
  /** Load this site adds to the asset at system peak, kW. */
  addedKw: number;
  ratio: number | null;
  status: Status;
  props: Record<string, unknown>;
  geometry: Geometry;
  note?: string;
}

export interface SiteAssessment {
  siteId: string;
  nameplateKw: number;
  peakKw: number;
  coincidentKw: number;
  hourly: number[];
  hourlyUnmanaged: number[];
  dailyKwh: number;
  annualMwh: number;
  assets: AssetStatus[];
  worst: Status;
  /** True while the live grid data around this site has not finished loading; `worst` is held at 'unknown' until it has. */
  provisional?: boolean;
  inDac: boolean;
  inNetworkArea: boolean;
  notes: string[];
  tract?: Record<string, unknown>;
  network?: Record<string, unknown>;
  cost: CostBreakdown;
}

export interface CostBreakdown {
  chargers: number;
  makeReady: number;
  storage: number;
  gridUpgrades: number;
  total: number;
  incentive: number;
  customerNet: number;
  perKw: number;
}

export interface AreaResult {
  year: number;
  evShare: number;
  tractStats: Map<string, { evs: number; addedKw: number; kwPerKm2: number }>;
  networkStats: Array<{
    network: string;
    borough: string;
    evs: number;
    addedMw: number;
    /** Midpoint of the network's published hosting-capacity MW range. */
    capacityMw: number | null;
    capacityRange: string | null;
    plateHeadroomMw: number | null;
    remainingMw: number | null;
    ratio: number | null;
    status: Status;
    dacShare: number;
  }>;
  totalEvs: number;
  totalAddedMw: number;
  totalVehicles: number;
}

/* ---------- Geo ---------- */

export type FC<G extends Geometry = Geometry, P = Record<string, any>> = FeatureCollection<G, P>;
export type F<G extends Geometry = Geometry, P = Record<string, any>> = Feature<G, P>;
export type PointFC = FC<Point>;
export type PolyFC = FC<Polygon | MultiPolygon>;
export type LineFC = FC<LineString | MultiLineString>;
