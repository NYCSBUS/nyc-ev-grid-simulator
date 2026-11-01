import type { AssetStatus, SiteAssessment, Status } from '../types';
import { fmt } from '../components/ui';

export type VerdictLevel = 'fits' | 'tight' | 'nofit' | 'unknown';

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

export const VERDICT_WORD: Record<VerdictLevel, string> = { fits: 'Fits', tight: 'Tight', nofit: "Doesn't fit", unknown: 'Checking…' };

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

export function verdictFor(a?: SiteAssessment, loading = false): Verdict {
  const live = (a?.assets ?? []).filter((x) => x.ratio != null);
  const counts = {
    ok: live.filter((x) => x.status === 'ok').length,
    warn: live.filter((x) => x.status === 'warn').length,
    crit: live.filter((x) => x.status === 'crit').length,
  };
  if (!a || !live.length) {
    return {
      level: 'unknown',
      status: 'unknown',
      title: loading || !a ? 'Checking the grid…' : 'No grid data here',
      summary: loading || !a ? 'Loading Con Edison equipment around this site.' : 'No equipment with published room inside the search circle. Try a wider circle in More options.',
      advice: '',
      counts,
    };
  }
  const tightest = live.slice().sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
  const n = live.length;
  const where = `${friendlyAsset(tightest)} (${fmt.pct(Math.min(tightest.ratio!, 9.99))} of its ${fmt.kw(tightest.headroomKw)} room)`;
  if (a.worst === 'crit') {
    return {
      level: 'nofit',
      status: 'crit',
      title: "Doesn't fit as designed",
      summary: `${fmt.kw(a.coincidentKw)} at the 5 PM rush overfills ${counts.crit} of ${n} nearby pieces of equipment. Tightest: ${where}.`,
      advice: 'Try fewer fast plugs, smart charging or a battery — or drag the pin toward a green dot with a white ring.',
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
