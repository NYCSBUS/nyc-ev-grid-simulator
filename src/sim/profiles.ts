import type { AdoptionCurve, ChargerType, ProfileType } from '../types';

export const CHARGERS: Record<ChargerType, { label: string; kw: number; group: 'L2' | 'DCFC'; desc: string }> = {
  L2_7: { label: 'Level 2 · 7.2 kW', kw: 7.2, group: 'L2', desc: 'Overnight charger, like a clothes-dryer outlet. Home garages and apartment buildings.' },
  L2_11: { label: 'Level 2 · 11 kW', kw: 11, group: 'L2', desc: 'Faster overnight/daytime charger for workplaces, curbside posts and shops. Adds ~40 miles an hour.' },
  L2_19: { label: 'Level 2 · 19.2 kW', kw: 19.2, group: 'L2', desc: 'The most powerful "slow" charger — used for van fleets that park for several hours.' },
  DCFC_50: { label: 'DC Fast · 50 kW', kw: 50, group: 'DCFC', desc: 'Older fast charger: ~1 hour for a full charge. Needs the higher-voltage 460 V service.' },
  DCFC_150: { label: 'DC Fast · 150 kW', kw: 150, group: 'DCFC', desc: 'Today\'s standard highway/urban fast charger: 20–30 minutes for most cars.' },
  DCFC_350: { label: 'DC Fast · 350 kW', kw: 350, group: 'DCFC', desc: 'Ultra-fast: 10–15 minute charging, or for trucks and buses. One plug draws as much as ~100 homes.' },
};

export const PROFILES: Record<ProfileType, { label: string; desc: string; shape: number[]; managedShape: number[] }> = {
  residential: {
    label: 'Home / apartment building',
    desc: 'People plug in when they get home from work, so charging peaks 7–10 PM — right on top of the grid\'s evening rush.',
    shape: [0.45, 0.3, 0.2, 0.12, 0.1, 0.12, 0.2, 0.22, 0.18, 0.15, 0.15, 0.16, 0.18, 0.2, 0.25, 0.35, 0.55, 0.78, 0.92, 1.0, 0.98, 0.9, 0.78, 0.6],
    managedShape: [0.95, 1.0, 1.0, 0.98, 0.85, 0.5, 0.2, 0.15, 0.12, 0.1, 0.1, 0.1, 0.12, 0.12, 0.15, 0.18, 0.2, 0.22, 0.25, 0.3, 0.35, 0.5, 0.75, 0.9],
  },
  workplace: {
    label: 'Workplace',
    desc: 'Cars arrive at 9 and charge through the morning; mostly done by 5 PM, so it barely touches the grid\'s rush hour.',
    shape: [0.02, 0.02, 0.02, 0.02, 0.03, 0.1, 0.4, 0.8, 1.0, 0.95, 0.8, 0.65, 0.55, 0.5, 0.42, 0.32, 0.22, 0.12, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02],
    managedShape: [0.02, 0.02, 0.02, 0.02, 0.03, 0.08, 0.3, 0.55, 0.7, 0.75, 0.78, 0.78, 0.75, 0.7, 0.6, 0.45, 0.3, 0.15, 0.06, 0.04, 0.03, 0.02, 0.02, 0.02],
  },
  public: {
    label: 'Public fast-charging station / shops',
    desc: 'Follows traffic and errands: busy from midday through early evening, so it lands squarely on the 5–6 PM rush.',
    shape: [0.12, 0.08, 0.06, 0.05, 0.06, 0.12, 0.25, 0.45, 0.6, 0.7, 0.78, 0.85, 0.9, 0.9, 0.92, 0.96, 1.0, 1.0, 0.95, 0.85, 0.7, 0.5, 0.35, 0.2],
    managedShape: [0.12, 0.08, 0.06, 0.05, 0.06, 0.12, 0.25, 0.45, 0.6, 0.7, 0.78, 0.85, 0.9, 0.9, 0.92, 0.9, 0.85, 0.85, 0.85, 0.82, 0.7, 0.5, 0.35, 0.2],
  },
  fleet: {
    label: 'Delivery-van / truck depot',
    desc: 'Vans come back in the evening and all plug in at once; without smart charging the depot can hit its full sticker rating at 8–11 PM.',
    shape: [0.9, 0.85, 0.75, 0.6, 0.4, 0.15, 0.05, 0.03, 0.03, 0.05, 0.08, 0.1, 0.12, 0.12, 0.15, 0.25, 0.5, 0.8, 0.95, 1.0, 1.0, 0.98, 0.95, 0.92],
    managedShape: [0.85, 0.85, 0.85, 0.85, 0.8, 0.4, 0.05, 0.03, 0.03, 0.05, 0.08, 0.1, 0.12, 0.12, 0.15, 0.2, 0.25, 0.3, 0.35, 0.5, 0.7, 0.85, 0.85, 0.85],
  },
  transit: {
    label: 'Bus depot',
    desc: 'Buses charge overnight after evening service, with a smaller top-up between the morning and afternoon shifts.',
    shape: [1.0, 1.0, 0.95, 0.85, 0.6, 0.2, 0.08, 0.1, 0.3, 0.5, 0.55, 0.55, 0.5, 0.4, 0.25, 0.15, 0.1, 0.15, 0.4, 0.7, 0.9, 0.98, 1.0, 1.0],
    managedShape: [0.85, 0.85, 0.85, 0.85, 0.7, 0.25, 0.08, 0.1, 0.3, 0.5, 0.55, 0.55, 0.5, 0.4, 0.25, 0.15, 0.1, 0.12, 0.2, 0.35, 0.55, 0.75, 0.85, 0.85],
  },
};

/** EV share of the light-duty fleet by year, piecewise-linear anchors. */
const CURVES: Record<Exclude<AdoptionCurve, 'custom'>, Array<[number, number]>> = {
  policy: [
    [2024, 0.025],
    [2027, 0.06],
    [2030, 0.15],
    [2035, 0.38],
    [2040, 0.62],
    [2045, 0.8],
  ],
  moderate: [
    [2024, 0.025],
    [2027, 0.045],
    [2030, 0.1],
    [2035, 0.25],
    [2040, 0.42],
    [2045, 0.58],
  ],
  slow: [
    [2024, 0.025],
    [2027, 0.035],
    [2030, 0.06],
    [2035, 0.14],
    [2040, 0.25],
    [2045, 0.36],
  ],
};

export const CURVE_LABELS: Record<AdoptionCurve, string> = {
  policy: 'Policy (NY: all new cars electric by 2035)',
  moderate: 'Moderate (slower than the rule)',
  slow: 'Slow (rule not met)',
  custom: 'Custom (I\'ll set the 2035 share)',
};

function interp(anchors: Array<[number, number]>, year: number) {
  if (year <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (year <= anchors[i][0]) {
      const [x0, y0] = anchors[i - 1];
      const [x1, y1] = anchors[i];
      return y0 + ((y1 - y0) * (year - x0)) / (x1 - x0);
    }
  }
  return anchors[anchors.length - 1][1];
}

export function evShare(curve: AdoptionCurve, year: number, custom2035 = 0.3): number {
  if (curve !== 'custom') return interp(CURVES[curve], year);
  // scale policy shape so that 2035 hits the custom target
  const base = interp(CURVES.policy, year);
  const k = custom2035 / interp(CURVES.policy, 2035);
  return Math.min(0.95, base * k);
}

export const YEARS = Array.from({ length: 2045 - 2024 + 1 }, (_, i) => 2024 + i);
