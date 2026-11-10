import type { AssetStatus, SiteAssessment, Status } from '../types';
import { fmt } from '../components/ui';

/** `unknown` = still loading the grid around the site; `nodata` = loaded, but nothing published nearby. */
export type VerdictLevel = 'fits' | 'tight' | 'nofit' | 'unknown' | 'nodata';

export interface Verdict {
  level: VerdictLevel;
  status: Status;
  /** Short headline, e.g. "Doesn't fit as designed" */
  title: string;
  /** One sentence a non-engineer can act on */
  summary: string;
  /** What to try next */
  advice: string;
  counts: { ok: number; warn: number; crit: number };
  tightest?: AssetStatus;
}

/** The one vocabulary for a light, used on cards, pills, tables and the legend. */
export const VERDICT_WORD: Record<VerdictLevel, string> = { fits: 'Fits', tight: 'Tight', nofit: "Doesn't fit", unknown: 'Checking…', nodata: 'No data' };

/** Plain-English name for an asset kind. */
export function friendlyAsset(a: { kind: string; name: string }) {
  switch (a.kind) {
    case 'transformer':
      return `transformer ${a.name}`;
    case 'feeder':
      return `street main (${a.name})`;
    case 'structure':
      return `underground vault ${a.name.replace(/^Structure\s*/, '')}`;
    case 'plate':
      return `map sheet ${a.name.replace(/^M&S Plate\s*/, '')}`;
    default:
      return a.name;
  }
}

/** "62% of its 350 kW room" / "25 times its 24 kW room" — the same wording wherever a tightest spot is described. */
export function roomPhrase(a: AssetStatus) {
  const r = a.ratio ?? 0;
  return r >= 10 ? `${Math.round(r)} times its ${fmt.kw(a.headroomKw)} room` : `${fmt.pct(r)} of its ${fmt.kw(a.headroomKw)} room`;
}

/**
 * @param loading live grid layers are being fetched right now
 * @param failed  the last fetch of the grid layers errored
 */
export function verdictFor(a?: SiteAssessment, loading = false, failed = false): Verdict {
  const live = (a?.assets ?? []).filter((x) => x.ratio != null);
  const counts = {
    ok: live.filter((x) => x.status === 'ok').length,
    warn: live.filter((x) => x.status === 'warn').length,
    crit: live.filter((x) => x.status === 'crit').length,
  };
  // Never show a colour before the equipment around the site has arrived: a verdict from partial data is a guess.
  if (!a || a.provisional) {
    const stuck = failed && !loading;
    return {
      level: 'unknown',
      status: 'unknown',
      title: stuck ? "Couldn't load the grid data" : 'Checking the grid…',
      summary: stuck ? "Con Edison's map service didn't answer, so there is no verdict yet. Nudge the map or reload the page to try again." : 'Loading Con Edison equipment around this site.',
      advice: '',
      counts: { ok: 0, warn: 0, crit: 0 },
    };
  }
  if (!live.length) {
    return {
      level: 'nodata',
      status: 'unknown',
      title: 'No grid data here',
      summary: 'No equipment with published room inside the search circle. Try a wider circle in More options.',
      advice: '',
      counts,
    };
  }
  const tightest = live.slice().sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
  const n = live.length;
  const where = `${friendlyAsset(tightest)} (${roomPhrase(tightest)})`;
  if (a.worst === 'crit') {
    return {
      level: 'nofit',
      status: 'crit',
      title: "Doesn't fit as designed",
      summary: `${fmt.kw(a.coincidentKw)} at the 5 PM rush overfills ${counts.crit} of ${n} nearby pieces of equipment. Tightest: ${where}.`,
      advice: 'Try fewer fast plugs, smart charging or a battery — or drag the pin toward a pale-blue dot with a white ring (a roomy 460 V tap).',
      counts,
      tightest,
    };
  }
  if (a.worst === 'warn') {
    return {
      level: 'tight',
      status: 'warn',
      title: 'Fits, but tight',
      summary: `${fmt.kw(a.coincidentKw)} at the 5 PM rush uses most of the room on ${counts.warn} of ${n} nearby pieces of equipment. Tightest: ${where}.`,
      advice: 'Expect Con Edison to study it. Smart charging or a small battery would turn the amber lights green.',
      counts,
      tightest,
    };
  }
  return {
    level: 'fits',
    status: 'ok',
    title: 'Fits with room to spare',
    summary: `${fmt.kw(a.coincidentKw)} at the 5 PM rush — all ${n} nearby pieces of equipment stay green. Tightest: ${where}.`,
    advice: 'A routine connection is likely. You could add more plugs here.',
    counts,
    tightest,
  };
}
