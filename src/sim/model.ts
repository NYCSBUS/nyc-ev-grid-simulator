import * as turf from '@turf/turf';
import type { Feature, Point, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';
import type { AssetStatus, CostBreakdown, FC, Settings, Site, SiteAssessment, Status } from '../types';
import { CHARGERS, PROFILES } from './profiles';

export interface SiteContext {
  transformers: FC<Point>;
  feeders: FC<LineString | MultiLineString>;
  plates: FC<Polygon | MultiPolygon>;
  networks: FC<Polygon | MultiPolygon>;
  tracts: FC<Polygon | MultiPolygon>;
  structures?: FC<Point>;
  /** Cover keys (see `coverKey`) of the sites whose surroundings have been fetched. Omit to treat everything as loaded. */
  covered?: string[];
}

/** Identifies "the live data around this site": changes when the site moves, its search circle changes, or the season changes. */
export const coverKey = (s: Site, season: string) => `${s.lng.toFixed(5)},${s.lat.toFixed(5)},${s.radiusM},${season}`;

export function nameplateKw(site: Site): number {
  return (Object.keys(site.chargers) as Array<keyof typeof CHARGERS>).reduce((s, k) => s + (site.chargers[k] || 0) * CHARGERS[k].kw, 0);
}

/** kW one plug of this type can actually deliver here: the hardware rating, or the user's cap if lower. */
export function plugKw(site: Site, k: keyof typeof CHARGERS): number {
  const cap = site.derateKw?.[k];
  return cap != null && cap > 0 ? Math.min(CHARGERS[k].kw, cap) : CHARGERS[k].kw;
}

/** Rating after any per-plug caps — what the load model actually uses. */
export function effectiveKw(site: Site): number {
  return (Object.keys(site.chargers) as Array<keyof typeof CHARGERS>).reduce((s, k) => s + (site.chargers[k] || 0) * plugKw(site, k), 0);
}

export function portCount(site: Site): number {
  return Object.values(site.chargers).reduce((s, n) => s + (n || 0), 0);
}

/** Simple peak-shaving dispatch: lowers the peak until storage power or energy is exhausted. */
export function applyStorage(hourly: number[], kw: number, kwh: number): number[] {
  if (kw <= 0 || kwh <= 0) return hourly;
  const peak = Math.max(...hourly);
  let lo = Math.max(0, peak - kw);
  let hi = peak;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const energy = hourly.reduce((s, v) => s + Math.max(0, v - mid), 0);
    if (energy > kwh) lo = mid;
    else hi = mid;
  }
  const threshold = hi;
  return hourly.map((v) => Math.min(v, threshold));
}

export function siteHourly(site: Site, managedOverride?: boolean): { hourly: number[]; unmanaged: number[] } {
  const np = effectiveKw(site);
  const factor = site.utilization * site.diversity;
  const prof = PROFILES[site.profile];
  const managed = managedOverride ?? site.managed;
  const unmanaged = prof.shape.map((s) => np * factor * s);
  let hourly = (managed ? prof.managedShape : prof.shape).map((s) => np * factor * s);
  hourly = applyStorage(hourly, site.storageKw, site.storageKwh);
  return { hourly, unmanaged };
}

export function statusFor(ratio: number | null, t: Settings['thresholds']): Status {
  if (ratio == null || !Number.isFinite(ratio)) return 'unknown';
  if (ratio >= t.crit) return 'crit';
  if (ratio >= t.warn) return 'warn';
  return 'ok';
}

const worstOf = (a: Status, b: Status): Status => {
  const rank: Record<Status, number> = { unknown: 0, ok: 1, warn: 2, crit: 3 };
  return rank[a] >= rank[b] ? a : b;
};

function xfmrHeadroomKw(props: Record<string, any>, settings: Settings): number | null {
  const bucket = String(props.CapacityRange ?? '');
  const kva = settings.xfmrKvaEstimate[bucket];
  if (!kva) return null;
  // Con Ed's EV map ranges are "available capacity" ranges, so treat the estimate as headroom
  return kva * settings.powerFactor * (1 - settings.xfmrBaseLoading);
}

export function assessSite(site: Site, ctx: SiteContext, settings: Settings): SiteAssessment {
  const pt = turf.point([site.lng, site.lat]);
  const { hourly, unmanaged } = siteHourly(site);
  const peakKw = Math.max(...hourly);
  const coincidentKw = hourly[settings.peakHour] ?? peakKw;
  const dailyKwh = hourly.reduce((a, b) => a + b, 0);
  const annualMwh = (dailyKwh * 365) / 1000;
  const np = nameplateKw(site);
  const assets: AssetStatus[] = [];
  const wantsHighVoltage = np >= 150 || Object.entries(site.chargers).some(([k, n]) => k.startsWith('DCFC') && n > 0);

  // --- Transformers ---
  const xf = ctx.transformers.features
    .map((f) => ({ f, d: turf.distance(pt, f as Feature<Point>, { units: 'meters' }) }))
    .filter((x) => x.d <= site.radiusM)
    .sort((a, b) => a.d - b.d);

  // choose primary: prefer 460V for DCFC if within radius, else nearest
  let ordered = xf;
  if (wantsHighVoltage) {
    const hv = xf.filter((x) => String(x.f.properties?.Voltage ?? '').includes('460'));
    if (hv.length) ordered = [...hv, ...xf.filter((x) => !hv.includes(x))];
  }
  const shares = site.sharing === 'grid' ? [0.6, 0.25, 0.15] : [1];
  ordered.forEach((x, i) => {
    const share = shares[i] ?? 0;
    const added = coincidentKw * share;
    const headroom = xfmrHeadroomKw(x.f.properties ?? {}, settings);
    const ratio = headroom ? added / headroom : null;
    assets.push({
      id: `xfmr-${x.f.properties?.OBJECTID ?? i}`,
      kind: 'transformer',
      name: `${x.f.properties?.Transformer ?? 'Transformer'} (${x.f.properties?.Voltage ?? '?'})`,
      distanceM: Math.round(x.d),
      headroomKw: headroom,
      addedKw: added,
      ratio: share > 0 ? ratio : null,
      status: share > 0 ? statusFor(ratio, settings.thresholds) : 'unknown',
      props: x.f.properties ?? {},
      geometry: x.f.geometry,
      note: share > 0 ? `Tap · takes ${(share * 100).toFixed(0)}% of this site's load` : 'Tap nearby · not used by this site',
    });
  });

  // --- Feeders --- group by FEEDER_ID, nearest first
  const feederMap = new Map<string, { f: Feature<LineString | MultiLineString>; d: number }>();
  for (const f of ctx.feeders.features) {
    const id = String(f.properties?.FEEDER_ID ?? f.properties?.OBJECTID);
    let d: number;
    try {
      d = turf.pointToLineDistance(pt, f as any, { units: 'meters' });
    } catch {
      continue;
    }
    if (d > site.radiusM) continue;
    const cur = feederMap.get(id);
    if (!cur || d < cur.d) feederMap.set(id, { f: f as any, d });
  }
  const feeders = [...feederMap.values()].sort((a, b) => a.d - b.d);
  feeders.forEach((x, i) => {
    const p = x.f.properties ?? {};
    const headroomMw = settings.season === 'winter' ? p.EV_HEADROOM : p.EV_HEADROOM; // both layers expose EV_HEADROOM
    const headroomKw = headroomMw != null ? +headroomMw * 1000 : null;
    const added = i === 0 ? coincidentKw : 0;
    const ratio = headroomKw != null && headroomKw > 0 ? added / headroomKw : headroomKw === 0 && added > 0 ? Infinity : null;
    assets.push({
      id: `feeder-${p.FEEDER_ID ?? i}`,
      kind: 'feeder',
      name: `Feeder ${p.FEEDER_ID ?? '?'} · ${p.SUBSTATION ?? ''} ${p.VOLTAGE_KV ? p.VOLTAGE_KV + ' kV' : ''}`.trim(),
      distanceM: Math.round(x.d),
      headroomKw,
      addedKw: added,
      ratio: i === 0 ? (ratio === Infinity ? 99 : ratio) : null,
      status: i === 0 ? statusFor(ratio === Infinity ? 99 : ratio, settings.thresholds) : 'unknown',
      props: p,
      geometry: x.f.geometry,
      note: i === 0 ? 'Street main · carries all of this site\'s load' : 'Another street main nearby · not used',
    });
  });

  // --- Containing M&S plate ---
  const plate = ctx.plates.features.find((f) => turf.booleanPointInPolygon(pt, f as any));
  if (plate) {
    const kva = plate.properties?.KVA as number | null;
    const headroom = kva != null ? kva * settings.powerFactor : null;
    const ratio = headroom ? coincidentKw / headroom : null;
    assets.push({
      id: `plate-${plate.properties?.MSPLATEID}`,
      kind: 'plate',
      name: `M&S Plate ${plate.properties?.MSPLATEID} (${plate.properties?.BORO_NAME ?? ''})`,
      distanceM: 0,
      headroomKw: headroom,
      addedKw: coincidentKw,
      ratio,
      status: statusFor(ratio, settings.thresholds),
      props: plate.properties ?? {},
      geometry: plate.geometry,
      note: 'Map sheet of the underground web · room left in kVA',
    });
  }

  // --- Containing network ---
  const network = ctx.networks.features.find((f) => turf.booleanPointInPolygon(pt, f as any));
  if (network) {
    const p = network.properties ?? {};
    const remaining = p.CapacityMW > 0 ? Math.max(0, (p.CapacityMW ?? 0) - (p.SubscribedMW ?? 0)) : null;
    const headroom = remaining != null ? remaining * 1000 : null;
    const ratio = headroom != null && headroom > 0 ? coincidentKw / headroom : headroom === 0 ? 99 : null;
    assets.push({
      id: `network-${p.NETWORK}`,
      kind: 'network',
      name: `${p.NETWORK} network (${p.BOROUGH})`,
      distanceM: 0,
      headroomKw: headroom,
      addedKw: coincidentKw,
      ratio,
      status: p.CapacityMW > 0 ? statusFor(ratio, settings.thresholds) : 'unknown',
      props: p,
      geometry: network.geometry,
      note: p.CapacityMW > 0 ? 'Grid zone · spare MW Con Edison is buying back (LSRV)' : 'Grid zone · Con Edison publishes no spare MW here',
    });
  }

  // --- Structures (optional, nearest 3 with KVA) ---
  if (ctx.structures) {
    ctx.structures.features
      .map((f) => ({ f, d: turf.distance(pt, f as Feature<Point>, { units: 'meters' }) }))
      .filter((x) => x.d <= Math.min(site.radiusM, 150))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .forEach((x, i) => {
        const kva = x.f.properties?.KVA as number | null;
        const headroom = kva != null ? kva * settings.powerFactor : null;
        const share = shares[i] ?? 0;
        const added = coincidentKw * share;
        const ratio = headroom && share > 0 ? added / headroom : null;
        assets.push({
          id: `struct-${x.f.properties?.STRUCT_NUMBER}`,
          kind: 'structure',
          name: `Structure ${x.f.properties?.STRUCT_NUMBER} · ${x.f.properties?.NETWORK_NAME ?? ''}`,
          distanceM: Math.round(x.d),
          headroomKw: headroom,
          addedKw: added,
          ratio,
          status: share > 0 ? statusFor(ratio, settings.thresholds) : 'unknown',
          props: x.f.properties ?? {},
          geometry: x.f.geometry,
          note: share > 0 ? `Underground vault · takes ${(share * 100).toFixed(0)}% of this site's load` : 'Vault nearby · not used by this site',
        });
      });
  }

  const tract = ctx.tracts.features.find((f) => turf.booleanPointInPolygon(pt, f as any));
  const inDac = !!tract?.properties?.dac;
  const worst = assets.reduce<Status>((w, a) => worstOf(w, a.status), 'unknown');
  const cost = estimateCost(site, assets, inDac, settings);
  const inNetworkArea = !!plate || !!network;
  const notes: string[] = [];
  if (inNetworkArea && feeders.length === 0)
    notes.push(
      'This is a "web" area (Con Edison: secondary network): many transformers share one underground grid, so Con Edison publishes room left per map sheet and per vault rather than per street main. That is why no street main is listed.',
    );
  if (!inNetworkArea && xf.length === 0 && feeders.length === 0) notes.push('No Con Edison equipment found in the search circle. Try a wider circle, or check the site is inside Con Edison\'s territory (NYC + Westchester).');

  return {
    siteId: site.id,
    inNetworkArea,
    notes,
    nameplateKw: np,
    peakKw,
    coincidentKw,
    hourly,
    hourlyUnmanaged: unmanaged,
    dailyKwh,
    annualMwh,
    assets,
    worst,
    inDac,
    tract: tract?.properties,
    network: network?.properties,
    cost,
  };
}

export function estimateCost(site: Site, assets: AssetStatus[], inDac: boolean, settings: Settings): CostBreakdown {
  const c = settings.cost;
  const chargers = (Object.keys(site.chargers) as Array<keyof typeof CHARGERS>).reduce((s, k) => s + (site.chargers[k] || 0) * c.portCost[k], 0);
  const np = effectiveKw(site); // the service is sized to what the plugs can actually draw
  const makeReady = np * c.makeReadyPerKw;
  const storage = site.storageKwh * c.storagePerKwh;
  let gridUpgrades = 0;
  for (const a of assets) {
    if (a.status !== 'crit') continue;
    if (a.kind === 'transformer') gridUpgrades += c.xfmrUpgrade;
    if (a.kind === 'feeder' && a.headroomKw != null) gridUpgrades += (Math.max(0, a.addedKw - a.headroomKw) / 1000) * c.feederPerMwOver;
  }
  const total = chargers + makeReady + storage + gridUpgrades;
  const share = inDac ? c.incentiveDac : c.incentiveBase;
  const incentive = Math.min(c.incentiveCap, (makeReady + gridUpgrades) * share);
  return {
    chargers,
    makeReady,
    storage,
    gridUpgrades,
    total,
    incentive,
    customerNet: total - incentive,
    perKw: np > 0 ? total / np : 0,
  };
}
