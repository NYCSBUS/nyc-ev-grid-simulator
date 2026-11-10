import { useMemo, useRef, useState, type ReactNode } from 'react';
import type * as echarts from 'echarts';
import { useStore } from '../state/store';
import { assessScenario, useAreaResult, useAssessments, useSiteContext, useAreaIndex } from '../state/hooks';
import { CURVE_LABELS, PROFILES, YEARS, evShare } from '../sim/profiles';
import { nameplateKw, portCount } from '../sim/model';
import { runArea } from '../sim/area';
import type { AreaResult, Scenario, SiteAssessment, Status } from '../types';
import { Chart, downloadCsv, downloadPng } from './Chart';
import { Help, STATUS_COLOR, StatusDot, StatusPill, Tip, fmt } from './ui';
import { VERDICT_WORD, friendlyAsset, roomPhrase, verdictFor } from '../sim/verdict';

const HOURS = Array.from({ length: 24 }, (_, h) => `${h}:00`);
const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "120 kW lower" / "$0.20M higher" / "the same" — b is the baseline being compared against. */
function delta(now: number, base: number, f: (v: number) => string, tiny = 0.5) {
  const d = now - base;
  return Math.abs(d) < tiny ? 'the same' : `${f(Math.abs(d))} ${d > 0 ? 'higher' : 'lower'}`;
}

function summarize(sc: Scenario, as: Map<string, SiteAssessment>) {
  const sites = sc.sites;
  const nameplate = sites.reduce((s, x) => s + nameplateKw(x), 0);
  const ports = sites.reduce((s, x) => s + portCount(x), 0);
  const hourly = Array.from({ length: 24 }, (_, h) => sites.reduce((s, x) => s + (as.get(x.id)?.hourly[h] ?? 0), 0));
  const unmanaged = Array.from({ length: 24 }, (_, h) => sites.reduce((s, x) => s + (as.get(x.id)?.hourlyUnmanaged[h] ?? 0), 0));
  const coincident = hourly[sc.settings.peakHour] ?? 0;
  const peak = Math.max(0, ...hourly);
  const annualMwh = sites.reduce((s, x) => s + (as.get(x.id)?.annualMwh ?? 0), 0);
  // a site whose surrounding equipment has not loaded yet has no lights to count
  const checked = sites.filter((x) => as.get(x.id) && !as.get(x.id)!.provisional);
  const pending = sites.length - checked.length;
  const assets = checked.flatMap((x) => as.get(x.id)!.assets);
  const crit = assets.filter((a) => a.status === 'crit').length;
  const warn = assets.filter((a) => a.status === 'warn').length;
  const cost = sites.reduce((s, x) => s + (as.get(x.id)?.cost.total ?? 0), 0);
  const incentive = sites.reduce((s, x) => s + (as.get(x.id)?.cost.incentive ?? 0), 0);
  const dacSites = sites.filter((x) => as.get(x.id)?.inDac).length;
  const levels = { fits: 0, tight: 0, nofit: 0, nodata: 0 };
  let tightest: { site: string; asset: SiteAssessment['assets'][number] } | null = null;
  for (const x of checked) {
    const v = verdictFor(as.get(x.id));
    if (v.level !== 'unknown') levels[v.level]++;
    if (v.tightest && (v.tightest.ratio ?? 0) > (tightest?.asset.ratio ?? -1)) tightest = { site: x.name, asset: v.tightest };
  }
  return { nameplate, ports, hourly, unmanaged, coincident, peak, annualMwh, crit, warn, cost, incentive, dacSites, assets, pending, levels, tightest };
}

export function AnalyticsTab() {
  const scenario = useStore((s) => s.scenario);
  const saved = useStore((s) => s.saved);
  const compareId = useStore((s) => s.compareId);
  const setCompare = useStore((s) => s.setCompare);
  const pinBaseline = useStore((s) => s.pinBaseline);
  const setSettings = useStore((s) => s.setSettings);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const setTab = useStore((s) => s.setTab);
  const selectSite = useStore((s) => s.selectSite);
  const staticData = useStore((s) => s.staticData);
  const ctx = useSiteContext();
  const idx = useAreaIndex();
  const assessments = useAssessments();
  const area = useAreaResult();
  const compare = saved.find((s) => s.id === compareId) ?? null;
  const compareAs = useMemo(() => (compare ? assessScenario(compare, ctx) : null), [compare, ctx]);
  const compareArea = useMemo<AreaResult | null>(() => {
    if (!compare || !compare.area.enabled || !idx || !staticData.tracts || !staticData.networks) return null;
    return runArea(compare.area, staticData.tracts, staticData.networks, idx, compare.settings);
  }, [compare, idx, staticData.tracts, staticData.networks]);

  const sum = useMemo(() => summarize(scenario, assessments), [scenario, assessments]);
  const sumB = useMemo(() => (compare && compareAs ? summarize(compare, compareAs) : null), [compare, compareAs]);
  const peakHour = scenario.settings.peakHour;

  const charts = useRef<Record<string, echarts.ECharts>>({});
  const [netSort, setNetSort] = useState<'ratio' | 'addedMw' | 'evs'>('ratio');

  // ---------- chart options ----------
  const loadOpt = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.kw(v as number) },
      legend: { top: 0, textStyle: { color: '#9aa7b4' } },
      grid: { left: 60, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: HOURS, axisLabel: { color: '#9aa7b4' } },
      yAxis: { type: 'value', name: 'kW', axisLabel: { color: '#9aa7b4' }, splitLine: { lineStyle: { color: '#2b3542' } } },
      series: [
        ...scenario.sites.map((s) => ({
          name: s.name,
          type: 'line' as const,
          stack: 'sites',
          areaStyle: { opacity: 0.35 },
          smooth: true,
          showSymbol: false,
          data: assessments.get(s.id)?.hourly.map((v) => Math.round(v)) ?? [],
        })),
        {
          name: 'Unmanaged (no storage) total',
          type: 'line',
          lineStyle: { type: 'dashed', color: '#f87171' },
          itemStyle: { color: '#f87171' },
          showSymbol: false,
          data: sum.unmanaged.map((v) => Math.round(v)),
        },
        {
          name: 'System peak hour',
          type: 'line',
          data: [],
          markLine: { symbol: 'none', data: [{ xAxis: peakHour }], lineStyle: { color: '#38bdf8' }, label: { formatter: 'System peak', color: '#38bdf8' } },
        },
        ...(sumB
          ? [
              {
                name: `Compare: ${compare!.name}`,
                type: 'line' as const,
                lineStyle: { type: 'dotted' as const, color: '#e879f9', width: 2 },
                itemStyle: { color: '#e879f9' },
                showSymbol: false,
                data: sumB.hourly.map((v) => Math.round(v)),
              },
            ]
          : []),
      ],
    }),
    [scenario.sites, assessments, sum, sumB, compare, peakHour],
  );

  const assetRows = useMemo(
    () =>
      scenario.sites.flatMap((s) =>
        (assessments.get(s.id)?.provisional ? [] : assessments.get(s.id)?.assets ?? [])
          .filter((a) => a.ratio != null)
          .map((a) => ({ site: s.name, siteId: s.id, ...a })),
      ),
    [scenario.sites, assessments],
  );
  const assetOpt = useMemo<echarts.EChartsOption>(() => {
    const narrow = window.innerWidth < 760;
    const rows = [...assetRows].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 20);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: any) => `${p[0].name}<br/>uses ${fmt.fill(rows[p[0].dataIndex]?.ratio)} of its room` },
      grid: { left: narrow ? 120 : 240, right: 40, top: 10, bottom: 40 },
      xAxis: { type: 'value', name: '% of room used', nameLocation: 'middle', nameGap: 22, max: 150, axisLabel: { color: '#9aa7b4' }, splitLine: { lineStyle: { color: '#2b3542' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => (narrow ? r.name.slice(0, 18) : `${r.site} → ${r.name}`.slice(0, 48))), axisLabel: { color: '#cbd5e1', fontSize: 11 } },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => ({ value: Math.min(150, Math.round((r.ratio ?? 0) * 100)), itemStyle: { color: STATUS_COLOR[r.status] } })),
          markLine: {
            symbol: 'none',
            data: [
              { xAxis: scenario.settings.thresholds.warn * 100, lineStyle: { color: '#f59e0b' }, label: { formatter: 'tight', color: '#f59e0b' } },
              { xAxis: scenario.settings.thresholds.crit * 100, lineStyle: { color: '#ef4444' }, label: { formatter: "doesn't fit", color: '#ef4444' } },
            ],
          },
        },
      ],
    };
  }, [assetRows, scenario.settings.thresholds]);

  const adoptionOpt = useMemo<echarts.EChartsOption>(() => {
    const a = scenario.area;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.pct(v as number, 1) },
      legend: { top: 0, textStyle: { color: '#9aa7b4' } },
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: YEARS.map(String), axisLabel: { color: '#9aa7b4' } },
      yAxis: { type: 'value', axisLabel: { color: '#9aa7b4', formatter: (v: number) => `${Math.round(v * 100)}%` }, splitLine: { lineStyle: { color: '#2b3542' } } },
      series: (['policy', 'moderate', 'slow', 'custom'] as const).map((c) => ({
        name: CURVE_LABELS[c],
        type: 'line' as const,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: c === a.curve ? 3 : 1, opacity: c === a.curve ? 1 : 0.5 },
        data: YEARS.map((y) => +evShare(c, y, a.custom2035).toFixed(3)),
        markPoint: c === a.curve ? { data: [{ coord: [String(a.year), +evShare(c, a.year, a.custom2035).toFixed(3)], name: 'Scenario year' }], symbolSize: 40, label: { formatter: String(a.year), color: '#fff' } } : undefined,
      })),
    };
  }, [scenario.area]);

  const networkOpt = useMemo<echarts.EChartsOption>(() => {
    if (!area) return {};
    const rows = [...area.networkStats].filter((n) => n.addedMw > 0).sort((a, b) => b.addedMw - a.addedMw).slice(0, 20);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p: any) => {
          const r = rows[p[0].dataIndex];
          return `<b>${r.network}</b> (${r.borough})<br/>Added EV load: ${fmt.mw(r.addedMw)}<br/>Network capacity range: ${r.capacityRange ?? '—'} MW (mid ${r.capacityMw ?? '—'})<br/>EVs: ${fmt.int(r.evs)}<br/>How full: ${fmt.fill(r.ratio)}`;
        },
      },
      legend: { top: 0, textStyle: { color: '#9aa7b4' } },
      grid: { left: 130, right: 30, top: 30, bottom: 30 },
      xAxis: { type: 'value', name: 'MW', axisLabel: { color: '#9aa7b4' }, splitLine: { lineStyle: { color: '#2b3542' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.network), axisLabel: { color: '#cbd5e1', fontSize: 11 } },
      series: [
        { name: 'Added EV load (MW)', type: 'bar', data: rows.map((r) => ({ value: +r.addedMw.toFixed(2), itemStyle: { color: STATUS_COLOR[r.status] } })) },
        { name: 'Network capacity (range midpoint, MW)', type: 'bar', data: rows.map((r) => r.capacityMw ?? 0), itemStyle: { color: '#334155' } },
      ],
    };
  }, [area]);

  const boroughOpt = useMemo<echarts.EChartsOption>(() => {
    if (!area || !staticData.tracts || !idx) return {};
    const agg = new Map<string, { evs: number; kw: number }>();
    for (const [geoid, t] of area.tractStats) {
      const b = idx.tractBorough.get(geoid) ?? 'Other';
      const cur = agg.get(b) ?? { evs: 0, kw: 0 };
      cur.evs += t.evs;
      cur.kw += t.addedKw;
      agg.set(b, cur);
    }
    const rows = [...agg.entries()].sort((a, b) => b[1].kw - a[1].kw);
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: '#9aa7b4' } },
      grid: { left: 60, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: rows.map((r) => r[0]), axisLabel: { color: '#9aa7b4' } },
      yAxis: [
        { type: 'value', name: 'EVs', axisLabel: { color: '#9aa7b4' }, splitLine: { lineStyle: { color: '#2b3542' } } },
        { type: 'value', name: 'MW', axisLabel: { color: '#9aa7b4' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'EVs', type: 'bar', data: rows.map((r) => Math.round(r[1].evs)), itemStyle: { color: '#38bdf8' } },
        { name: 'Added coincident MW', type: 'line', yAxisIndex: 1, data: rows.map((r) => +(r[1].kw / 1000).toFixed(2)), itemStyle: { color: '#f59e0b' } },
      ],
    };
  }, [area, staticData.tracts, idx]);

  const costOpt = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt.usd(v as number) },
      legend: { top: 0, textStyle: { color: '#9aa7b4' } },
      grid: { left: 70, right: 20, top: 40, bottom: 60 },
      xAxis: { type: 'category', data: scenario.sites.map((s) => s.name), axisLabel: { color: '#9aa7b4', rotate: 20, fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#9aa7b4', formatter: (v: number) => fmt.usd(v) }, splitLine: { lineStyle: { color: '#2b3542' } } },
      series: (['chargers', 'makeReady', 'storage', 'gridUpgrades'] as const).map((k, i) => ({
        name: { chargers: 'Chargers', makeReady: 'Make-ready', storage: 'Storage', gridUpgrades: 'Grid upgrades' }[k],
        type: 'bar' as const,
        stack: 'cost',
        itemStyle: { color: ['#38bdf8', '#818cf8', '#34d399', '#ef4444'][i] },
        data: scenario.sites.map((s) => Math.round(assessments.get(s.id)?.cost[k] ?? 0)),
      })),
    }),
    [scenario.sites, assessments],
  );

  const netRows = useMemo(() => (area ? [...area.networkStats].sort((a, b) => ((b as any)[netSort] ?? -1) - ((a as any)[netSort] ?? -1)) : []), [area, netSort]);

  // ---------- the answer, in sentences ----------
  const lines = useMemo(() => {
    const out: Array<{ k: string; tone?: Status; body: ReactNode }> = [];
    const n = scenario.sites.length;
    if (n) {
      out.push({
        k: 'Load',
        body: (
          <>
            {n === 1 ? 'Your site' : `Your ${n} sites`} ({plural(sum.ports, 'plug')}) add <b>{fmt.kw(sum.coincident)}</b> at the {hourLabel(peakHour)} grid rush — {fmt.pct(sum.coincident / Math.max(1, sum.nameplate))} of the {fmt.kw(sum.nameplate)} sticker rating.
          </>
        ),
      });
      const { fits, tight, nofit, nodata } = sum.levels;
      const parts = [fits && `${fits} fit${fits === 1 ? 's' : ''}`, tight && `${tight} ${tight === 1 ? 'is' : 'are'} tight`, nofit && `${nofit} ${nofit === 1 ? "doesn't" : "don't"} fit`, nodata && `${nodata} ${nodata === 1 ? 'has' : 'have'} no grid data nearby`].filter(Boolean) as string[];
      out.push({
        k: 'Grid',
        tone: nofit ? 'crit' : tight ? 'warn' : fits ? 'ok' : 'unknown',
        body: (
          <>
            {parts.length ? <b>{parts.join(', ')}.</b> : null}{' '}
            {sum.tightest && (
              <>
                Tightest spot: {sum.tightest.site} → {friendlyAsset(sum.tightest.asset)}, where the site uses {roomPhrase(sum.tightest.asset)}.{' '}
              </>
            )}
            {sum.pending > 0 && <span className="muted">{plural(sum.pending, 'site')} still being checked — open {sum.pending === 1 ? 'it' : 'them'} on the map so the grid around {sum.pending === 1 ? 'it' : 'them'} loads.</span>}
          </>
        ),
      });
      const net = sum.cost - sum.incentive;
      const budget = scenario.settings.budget;
      out.push({
        k: 'Cost',
        tone: budget ? (net > budget ? 'crit' : 'ok') : undefined,
        body: (
          <>
            About <b>{fmt.usd(sum.cost)}</b> to build; grants cover {fmt.usd(sum.incentive)} ({fmt.pct(sum.cost ? sum.incentive / sum.cost : 0)}), leaving <b>{fmt.usd(net)}</b> to pay.{' '}
            {budget ? (
              <b>
                That is {fmt.usd(Math.abs(budget - net))} {net > budget ? 'over' : 'under'} your {fmt.usd(budget)} budget.
              </b>
            ) : (
              <span className="muted">Enter a budget above to check it.</span>
            )}
          </>
        ),
      });
      const share = sum.dacSites / n;
      out.push({
        k: 'Equity',
        tone: share >= 0.35 ? 'ok' : 'warn',
        body:
          n === 1 ? (
            <>Your site is {sum.dacSites ? '' : 'not '}in a Disadvantaged Community{sum.dacSites ? ', so it gets the larger grant rate' : ''}.</>
          ) : (
            <>
              <b>
                {sum.dacSites} of {n}
              </b>{' '}
              sites ({fmt.pct(share)}) are in Disadvantaged Communities — {share >= 0.35 ? 'at or above' : 'short of'} the State’s 35 % goal.
            </>
          ),
      });
    } else {
      out.push({ k: 'Sites', body: <>No charging sites yet. Add one on the Sites tab and the answer appears here.</> });
    }
    if (area) {
      const zones = area.networkStats.filter((z) => z.evs > 0);
      const over = zones.filter((z) => z.status === 'crit');
      const top = [...zones].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0];
      out.push({
        k: `Outlook ${area.year}`,
        tone: over.length ? 'crit' : zones.some((z) => z.status === 'warn') ? 'warn' : 'ok',
        body: (
          <>
            About {fmt.int(area.totalEvs)} EVs ({fmt.pct(area.evShare, 1)} of cars) add <b>{fmt.mw(area.totalAddedMw)}</b> at rush hour.{' '}
            <b>
              {over.length} of {plural(zones.length, 'grid zone')} {over.length === 1 ? 'goes' : 'go'} over capacity
            </b>
            {top ? ` — most stretched: ${top.network} (${fmt.fill(top.ratio)} of its published capacity).` : '.'}
          </>
        ),
      });
    }
    if (compare && sumB) {
      const redNow = sum.crit;
      const redWas = sumB.crit;
      out.push({
        k: 'Change',
        body: (
          <>
            Against “{compare.name}”: rush-hour load is <b>{delta(sum.coincident, sumB.coincident, fmt.kw)}</b>, what you pay is <b>{delta(sum.cost - sum.incentive, sumB.cost - sumB.incentive, fmt.usd, 500)}</b>, and {redNow === redWas ? 'the same number of' : <b>{plural(Math.abs(redNow - redWas), redNow > redWas ? 'more' : 'fewer', redNow > redWas ? 'more' : 'fewer')}</b>} pieces of equipment are in the red ({redWas} → {redNow}).
          </>
        ),
      });
    }
    return out;
  }, [scenario.sites.length, scenario.settings.budget, sum, sumB, area, compare, peakHour]);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const Kpi = ({ label, value, sub, help, b }: { label: string; value: string; sub?: string; help?: string; b?: string }) => (
    <div className="kpi">
      <div className="label">
        {label} {help && <Help text={help} />}
      </div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {b != null && <div className="sub" style={{ color: '#e879f9' }}>Compare: {b}</div>}
    </div>
  );

  return (
    <div className="analytics" id="tour-analytics">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 18 }}>
          Results · {scenario.name}
          {compare && <span className="muted" style={{ fontSize: 13 }}> vs {compare.name}</span>}
        </h2>
        <div className="row wrap">
          <Tip text="Freezes today's numbers as a saved snapshot and compares against it. Then go and change something — smart charging, a battery, a different corner — and every figure here shows before and after.">
            <button className="btn primary" id="tour-snapshot" onClick={pinBaseline}>
              Snapshot &amp; compare
            </button>
          </Tip>
          <select value={compareId ?? ''} onChange={(e) => setCompare(e.target.value || null)} aria-label="Compare with a saved scenario" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', maxWidth: 240 }} title="Compare with a saved scenario">
            <option value="">{compareId ? 'Stop comparing' : 'Compare with a saved scenario…'}</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => downloadCsv(scenario.sites.map((s) => ({ site: s.name, address: s.address ?? '', lng: s.lng, lat: s.lat, profile: s.profile, ports: portCount(s), nameplate_kw: nameplateKw(s), peak_kw: Math.round(assessments.get(s.id)?.peakKw ?? 0), coincident_kw: Math.round(assessments.get(s.id)?.coincidentKw ?? 0), annual_mwh: Math.round(assessments.get(s.id)?.annualMwh ?? 0), worst_status: assessments.get(s.id)?.worst ?? '', in_dac: assessments.get(s.id)?.inDac ? 1 : 0, total_cost: Math.round(assessments.get(s.id)?.cost.total ?? 0), incentive: Math.round(assessments.get(s.id)?.cost.incentive ?? 0) })), 'sites')}>
            CSV: sites
          </button>
          <button className="btn" onClick={() => downloadCsv(assetRows.map((r) => ({ site: r.site, asset: r.name, kind: r.kind, distance_m: r.distanceM, added_kw: Math.round(r.addedKw), headroom_kw: r.headroomKw != null ? Math.round(r.headroomKw) : '', ratio: r.ratio?.toFixed(3) ?? '', status: r.status })), 'assets')}>
            CSV: equipment
          </button>
          {area && (
            <button className="btn" onClick={() => downloadCsv(area.networkStats.map((n) => ({ network: n.network, borough: n.borough, evs: Math.round(n.evs), added_mw: n.addedMw.toFixed(3), plate_headroom_mw: n.plateHeadroomMw?.toFixed(2) ?? '', lsrv_remaining_mw: n.remainingMw?.toFixed(2) ?? '', ratio: n.ratio?.toFixed(3) ?? '', status: n.status, dac_share: n.dacShare.toFixed(3) })), `networks_${area.year}`)}>
              CSV: grid zones
            </button>
          )}
        </div>
      </div>

      <div className="card bottom-line" id="tour-summary">
        <h3>
          <span>Bottom line</span>
          <label className="row budget" htmlFor="budget">
            <span className="muted">Budget (what you can pay) $</span>
            <input
              id="budget"
              type="number"
              min={0}
              step={50000}
              placeholder="none"
              value={scenario.settings.budget ?? ''}
              onChange={(e) => setSettings({ budget: e.target.value === '' || +e.target.value <= 0 ? undefined : +e.target.value })}
            />
          </label>
        </h3>
        <ul>
          {lines.map((l) => (
            <li key={l.k}>
              <span className={`tag ${l.tone ?? ''}`}>{l.k}</span>
              <span>{l.body}</span>
            </li>
          ))}
        </ul>
        <div className="row wrap jump">
          <span className="muted">Jump to:</span>
          <button className="btn small" onClick={() => jump('tour-hourly')}>
            Load through the day
          </button>
          <button className="btn small" onClick={() => jump('tour-sitetable')}>
            Site by site
          </button>
          <button className="btn small" onClick={() => jump('tour-cost')}>
            Cost
          </button>
          {area && (
            <button className="btn small" onClick={() => jump('tour-networktable')}>
              Grid zones
            </button>
          )}
        </div>
      </div>

      <div className="kpis" id="tour-kpis">
        <Kpi label="Sites / plugs" value={`${scenario.sites.length} / ${sum.ports}`} b={sumB ? `${compare!.sites.length} / ${sumB.ports}` : undefined} />
        <Kpi label="Sticker rating" value={fmt.kw(sum.nameplate)} help="All plugs' maximum power added up (nameplate). Almost never drawn in practice." b={sumB ? fmt.kw(sumB.nameplate) : undefined} />
        <Kpi label="Load at grid rush hour" value={fmt.kw(sum.coincident)} sub={`at ${peakHour}:00 · sites' own busiest moment ${fmt.kw(sum.peak)}`} help="What all sites together draw at the grid's rush hour, after allowing for who is plugged in, charging taper, smart charging and batteries. This is the number that matters to Con Edison." b={sumB ? fmt.kw(sumB.coincident) : undefined} />
        <Kpi label="Energy per year" value={`${fmt.int(sum.annualMwh)} MWh`} b={sumB ? `${fmt.int(sumB.annualMwh)} MWh` : undefined} />
        <Kpi label="Equipment in the red / amber" value={`${sum.crit} / ${sum.warn}`} help="How many pieces of nearby grid equipment (transformers, street mains, vaults, map sheets, grid zones) your sites push over the amber or red line." b={sumB ? `${sumB.crit} / ${sumB.warn}` : undefined} />
        <Kpi label="Estimated cost" value={fmt.usd(sum.cost)} sub={`grants ${fmt.usd(sum.incentive)} · you pay ${fmt.usd(sum.cost - sum.incentive)}`} b={sumB ? fmt.usd(sumB.cost) : undefined} />
        <Kpi label="Sites in DACs" value={`${sum.dacSites} / ${scenario.sites.length}`} help="New York's climate law aims for at least 35 % of clean-energy benefits to reach disadvantaged communities." b={sumB ? `${sumB.dacSites} / ${compare!.sites.length}` : undefined} />
        {area && <Kpi label={`EVs on the road (${area.year})`} value={fmt.int(area.totalEvs)} sub={`${fmt.pct(area.evShare, 1)} of ${fmt.int(area.totalVehicles)} cars`} b={compareArea ? `${fmt.int(compareArea.totalEvs)} (${compareArea.year})` : undefined} />}
        {area && <Kpi label="Borough-wide extra load at rush hour" value={fmt.mw(area.totalAddedMw)} sub={`${area.networkStats.filter((n) => n.status === 'crit').length} grid zones in the red`} b={compareArea ? fmt.mw(compareArea.totalAddedMw) : undefined} />}
      </div>

      <div className="grid-2">
        <div className="card" id="tour-hourly">
          <h3>
            <span>
              Load through the day <Help text="Each site's hour-by-hour draw, stacked. Dashed red = the same sites without smart charging or batteries. Blue line = the grid's rush hour every light is judged on." />
            </span>
            <button className="btn small" onClick={() => downloadPng(charts.current.load, 'hourly_load')}>
              PNG
            </button>
          </h3>
          <Chart option={loadOpt} height={300} onReady={(c) => (charts.current.load = c)} />
        </div>
        <div className="card" id="tour-assetchart">
          <h3>
            <span>
              How full each piece of equipment gets <Help text="Your sites' rush-hour load as a share of the room left on each piece of grid equipment. Bars are capped at 150 % so the chart stays readable." />
            </span>
            <button className="btn small" onClick={() => downloadPng(charts.current.assets, 'asset_loading')}>
              PNG
            </button>
          </h3>
          {assetRows.length ? <Chart option={assetOpt} height={300} onReady={(c) => (charts.current.assets = c)} /> : <div className="empty">Nothing checked yet — zoom to a site on the map so the grid equipment loads.</div>}
        </div>
      </div>

      <div className="card" id="tour-sitetable">
        <h3>
          <span>Site detail</span>
        </h3>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Site</th>
                <th>Kind of place</th>
                <th className="num">Plugs</th>
                <th className="num">Sticker</th>
                <th className="num">At rush hour</th>
                <th className="num">Rush / sticker</th>
                <th className="num">MWh/yr</th>
                <th>Status</th>
                <th>Tightest spot</th>
                <th className="num">Cost</th>
                <th className="num">Grant</th>
                <th>DAC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scenario.sites.map((s) => {
                const a = assessments.get(s.id);
                const v = verdictFor(a);
                const binding = v.tightest;
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{PROFILES[s.profile].label}</td>
                    <td className="num">{portCount(s)}</td>
                    <td className="num">{fmt.kw(nameplateKw(s))}</td>
                    <td className="num">{fmt.kw(a?.coincidentKw)}</td>
                    <td className="num">{a ? fmt.pct(a.coincidentKw / Math.max(1, a.nameplateKw)) : '—'}</td>
                    <td className="num">{fmt.int(a?.annualMwh)}</td>
                    <td>
                      <StatusPill status={v.status} label={VERDICT_WORD[v.level]} />
                    </td>
                    <td>
                      {binding ? (
                        <span className="row" style={{ gap: 6 }}>
                          <StatusDot status={binding.status} /> {binding.name} ({fmt.fill(binding.ratio)})
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">{a ? fmt.usd(a.cost.total) : '—'}</td>
                    <td className="num">{a ? fmt.usd(a.cost.incentive) : '—'}</td>
                    <td>{a?.inDac ? 'Yes' : 'No'}</td>
                    <td>
                      <button
                        className="btn small"
                        onClick={() => {
                          selectSite(s.id);
                          requestFlyTo([s.lng, s.lat], 16);
                          setTab('sites');
                        }}
                      >
                        Map
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card" id="tour-cost">
          <h3>
            <span>
              Where the money goes <Help text="Rough numbers: chargers + wiring to the parking spot (make-ready) + battery + grid upgrades wherever a light is red. Change the prices in Settings." />
            </span>
            <button className="btn small" onClick={() => downloadPng(charts.current.cost, 'cost')}>
              PNG
            </button>
          </h3>
          <Chart option={costOpt} height={280} onReady={(c) => (charts.current.cost = c)} />
        </div>
        <div className="card">
          <h3>
            <span>
              How fast cars go electric <Help text="Share of cars on the road that are electric, by year, under each assumption. The bold line is the one the borough-wide model uses; the marker is the chosen year." />
            </span>
            <button className="btn small" onClick={() => downloadPng(charts.current.adopt, 'adoption')}>
              PNG
            </button>
          </h3>
          <Chart option={adoptionOpt} height={280} onReady={(c) => (charts.current.adopt = c)} />
        </div>
      </div>

      {area ? (
        <>
          <div className="grid-2">
            <div className="card" id="tour-networkchart">
              <h3>
                <span>
                  Grid zones gaining the most EV load ({area.year}) <Help text="Coloured by traffic light against the capacity range Con Edison publishes for each zone (we use the mid-point of 0–25 / 25–50 / 50–100 / 100+ MW). Grey bars show that mid-point." />
                </span>
                <button className="btn small" onClick={() => downloadPng(charts.current.net, 'networks')}>
                  PNG
                </button>
              </h3>
              <Chart option={networkOpt} height={420} onReady={(c) => (charts.current.net = c)} />
            </div>
            <div className="card">
              <h3>
                <span>EVs and extra load by borough</span>
                <button className="btn small" onClick={() => downloadPng(charts.current.boro, 'boroughs')}>
                  PNG
                </button>
              </h3>
              <Chart option={boroughOpt} height={420} onReady={(c) => (charts.current.boro = c)} />
            </div>
          </div>
          <div className="card" id="tour-networktable">
            <h3>
              <span>Grid zones: who needs work first</span>
              <span className="row">
                <span className="muted">Sort:</span>
                {(['ratio', 'addedMw', 'evs'] as const).map((k) => (
                  <button key={k} className={`btn small ${netSort === k ? 'active' : ''}`} onClick={() => setNetSort(k)}>
                    {{ ratio: 'How full', addedMw: 'Extra MW', evs: 'EVs' }[k]}
                  </button>
                ))}
              </span>
            </h3>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Grid zone</th>
                    <th>Borough</th>
                    <th className="num">EVs</th>
                    <th className="num">Extra MW</th>
                    <th>Published capacity MW</th>
                    <th className="num">Map-sheet room (MW)</th>
                    <th className="num">Spare MW (LSRV)</th>
                    <th className="num">How full</th>
                    <th>Status</th>
                    <th className="num">DAC share</th>
                    {compareArea && <th className="num">Compare MW</th>}
                  </tr>
                </thead>
                <tbody>
                  {netRows.map((n) => (
                    <tr key={n.network}>
                      <td>{n.network}</td>
                      <td>{n.borough}</td>
                      <td className="num">{fmt.int(n.evs)}</td>
                      <td className="num">{n.addedMw.toFixed(2)}</td>
                      <td>{n.capacityRange ?? '—'}</td>
                      <td className="num">{n.plateHeadroomMw != null ? n.plateHeadroomMw.toFixed(1) : '—'}</td>
                      <td className="num">{n.remainingMw != null ? n.remainingMw.toFixed(1) : '—'}</td>
                      <td className="num">{fmt.fill(n.ratio)}</td>
                      <td>
                        <StatusPill status={n.status as Status} />
                      </td>
                      <td className="num">{fmt.pct(n.dacShare)}</td>
                      {compareArea && <td className="num">{compareArea.networkStats.find((x) => x.network === n.network)?.addedMw.toFixed(2) ?? '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <h3>Area-wide adoption</h3>
          <div className="empty">Open the Outlook tab to switch on borough-wide EV growth; the grid-zone charts and table will appear here.</div>
        </div>
      )}
    </div>
  );
}
