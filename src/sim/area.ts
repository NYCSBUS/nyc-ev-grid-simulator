import * as turf from '@turf/turf';
import type { Polygon, MultiPolygon } from 'geojson';
import type { AreaResult, AreaScenario, FC, Settings } from '../types';
import { evShare } from './profiles';
import { statusFor } from './model';

/** Precomputed spatial join of tracts to networks and plate headroom per network. */
export interface AreaIndex {
  tractNetwork: Map<string, string>; // GEOID -> NETWORK name
  tractBorough: Map<string, string>;
  networkPlateKva: Map<string, number>;
}

const COUNTY_TO_BOROUGH: Record<string, string> = {
  '005': 'Bronx',
  '047': 'Brooklyn',
  '061': 'Manhattan',
  '081': 'Queens',
  '085': 'Staten Island',
  '119': 'Westchester',
};

export function buildAreaIndex(tracts: FC<Polygon | MultiPolygon>, networks: FC<Polygon | MultiPolygon>, plates: FC<Polygon | MultiPolygon>): AreaIndex {
  const tractNetwork = new Map<string, string>();
  const tractBorough = new Map<string, string>();
  const netBBoxes = networks.features.map((f) => ({ f, bbox: turf.bbox(f as any) }));
  for (const t of tracts.features) {
    const geoid = String(t.properties?.GEOID);
    tractBorough.set(geoid, COUNTY_TO_BOROUGH[String(t.properties?.county)] ?? 'Other');
    const c = t.properties?.CENTLON != null ? turf.point([+t.properties.CENTLON, +t.properties.CENTLAT]) : turf.centroid(t as any);
    const [x, y] = c.geometry.coordinates;
    for (const n of netBBoxes) {
      if (x < n.bbox[0] || x > n.bbox[2] || y < n.bbox[1] || y > n.bbox[3]) continue;
      if (turf.booleanPointInPolygon(c, n.f as any)) {
        tractNetwork.set(geoid, String(n.f.properties?.NETWORK));
        break;
      }
    }
  }
  const networkPlateKva = new Map<string, number>();
  for (const p of plates.features) {
    const c = turf.centroid(p as any);
    const [x, y] = c.geometry.coordinates;
    for (const n of netBBoxes) {
      if (x < n.bbox[0] || x > n.bbox[2] || y < n.bbox[1] || y > n.bbox[3]) continue;
      if (turf.booleanPointInPolygon(c, n.f as any)) {
        const name = String(n.f.properties?.NETWORK);
        networkPlateKva.set(name, (networkPlateKva.get(name) ?? 0) + (p.properties?.KVA ?? 0));
        break;
      }
    }
  }
  return { tractNetwork, tractBorough, networkPlateKva };
}

/** Con Edison publishes network hosting capacity as an MW range; use the midpoint (open-ended bucket → 150). */
export const NETWORK_RANGE_MW: Record<string, number> = {
  '0-24.99': 12.5,
  '25-49.99': 37.5,
  '50-99.99': 75,
  '> 100': 150,
};
export function networkCapacityMw(props: Record<string, any>): number | null {
  const r = String(props.CapacityRange ?? '');
  return NETWORK_RANGE_MW[r] ?? null;
}

/** Added peak kW per EV for residential charging under this scenario. */
export function kwPerEv(a: AreaScenario): number {
  const unmanagedFactor = 1 - a.managedShare * a.managedReduction;
  return a.homeShare * a.evKw * a.coincidence * unmanagedFactor + a.publicKwPerEv;
}

export function runArea(
  a: AreaScenario,
  tracts: FC<Polygon | MultiPolygon>,
  networks: FC<Polygon | MultiPolygon>,
  idx: AreaIndex,
  settings: Settings,
): AreaResult {
  const share = evShare(a.curve, a.year, a.custom2035);
  const perEv = kwPerEv(a);
  const tractStats = new Map<string, { evs: number; addedKw: number; kwPerKm2: number }>();
  const netAgg = new Map<string, { evs: number; addedKw: number; dacEvs: number; borough: string }>();
  let totalEvs = 0;
  let totalVehicles = 0;

  for (const t of tracts.features) {
    const p = t.properties ?? {};
    const geoid = String(p.GEOID);
    const borough = idx.tractBorough.get(geoid) ?? 'Other';
    if (a.boroughs.length && !a.boroughs.includes(borough)) continue;
    if (a.dacOnly && !p.dac) continue;
    const vehicles = +(p.vehicles ?? 0);
    const evs = vehicles * share;
    const addedKw = evs * perEv;
    totalEvs += evs;
    totalVehicles += vehicles;
    tractStats.set(geoid, { evs, addedKw, kwPerKm2: p.area_km2 > 0 ? addedKw / p.area_km2 : 0 });
    const net = idx.tractNetwork.get(geoid);
    if (net) {
      const cur = netAgg.get(net) ?? { evs: 0, addedKw: 0, dacEvs: 0, borough };
      cur.evs += evs;
      cur.addedKw += addedKw;
      if (p.dac) cur.dacEvs += evs;
      netAgg.set(net, cur);
    }
  }

  const networkStats = networks.features.map((n) => {
    const p = n.properties ?? {};
    const name = String(p.NETWORK);
    const agg = netAgg.get(name) ?? { evs: 0, addedKw: 0, dacEvs: 0, borough: p.BOROUGH };
    const plateKva = idx.networkPlateKva.get(name);
    const plateHeadroomMw = plateKva != null ? (plateKva * settings.powerFactor) / 1000 : null;
    const remainingMw = p.CapacityMW > 0 ? Math.max(0, p.CapacityMW - (p.SubscribedMW ?? 0)) : null;
    const capacityMw = networkCapacityMw(p);
    const addedMw = agg.addedKw / 1000;
    // Binding constraint: the network's published hosting-capacity range (midpoint); LSRV remaining as fallback
    const denom = capacityMw ?? remainingMw;
    const ratio = denom != null && denom > 0 ? addedMw / denom : null;
    return {
      network: name,
      borough: String(p.BOROUGH ?? agg.borough),
      evs: agg.evs,
      addedMw,
      capacityMw,
      capacityRange: p.CapacityRange ? String(p.CapacityRange) : null,
      plateHeadroomMw,
      remainingMw,
      ratio,
      status: statusFor(ratio, settings.thresholds),
      dacShare: agg.evs > 0 ? agg.dacEvs / agg.evs : 0,
    };
  });

  return {
    year: a.year,
    evShare: share,
    tractStats,
    networkStats: networkStats.sort((x, y) => (y.ratio ?? -1) - (x.ratio ?? -1)),
    totalEvs,
    totalAddedMw: [...tractStats.values()].reduce((s, t) => s + t.addedKw, 0) / 1000,
    totalVehicles,
  };
}
