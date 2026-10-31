import { useMemo, useRef, useState } from 'react';
import type * as echarts from 'echarts';
import { useStore } from '../state/store';
import { assessScenario, useAreaResult, useAssessments, useSiteContext, useAreaIndex } from '../state/hooks';
import { CURVE_LABELS, PROFILES, YEARS, evShare } from '../sim/profiles';
import { nameplateKw, portCount } from '../sim/model';
import { runArea } from '../sim/area';
import type { AreaResult, Scenario, SiteAssessment, Status } from '../types';
import { Chart, downloadCsv, downloadPng } from './Chart';
import { Help, STATUS_COLOR, StatusDot, StatusPill, fmt } from './ui';

const HOURS = Array.from({ length: 24 }, (_, h) => `${h}:00`);

function summarize(sc: Scenario, as: Map<string, SiteAssessment>) {
  const sites = sc.sites;
  const nameplate = sites.reduce((s, x) => s + nameplateKw(x), 0);
  const ports = sites.reduce((s, x) => s + portCount(x), 0);
  const hourly = Array.from({ length: 24 }, (_, h) => sites.reduce((s, x) => s + (as.get(x.id)?.hourly[h] ?? 0), 0));
  const unmanaged = Array.from({ length: 24 }, (_, h) => sites.reduce((s, x) => s + (as.get(x.id)?.hourlyUnmanaged[h] ?? 0), 0));
  const coincident = hourly[sc.settings.peakHour] ?? 0;
  const peak = Math.max(0, ...hourly);
  const annualMwh = sites.reduce((s, x) => s + (as.get(x.id)?.annualMwh ?? 0), 0);
  const assets = sites.flatMap((x) => as.get(x.id)?.assets ?? []);
  const crit = assets.filter((a) => a.status === 'crit').length;
  const warn = assets.filter((a) => a.status === 'warn').length;
  const cost = sites.reduce((s, x) => s + (as.get(x.id)?.cost.total ?? 0), 0);
  const incentive = sites.reduce((s, x) => s + (as.get(x.id)?.cost.incentive ?? 0), 0);
  const dacSites = sites.filter((x) => as.get(x.id)?.inDac).length;
  return { nameplate, ports, hourly, unmanaged, coincident, peak, annualMwh, crit, warn, cost, incentive, dacSites, assets };
}

export function AnalyticsTab() {
  const scenario = useStore((s) => s.scenario);
  const saved = useStore((s) => s.saved);
  const compareId = useStore((s) => s.compareId);
  const setCompare = useStore((s) => s.setCompare);
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
        (assessments.get(s.id)?.assets ?? [])
          .filter((a) => a.ratio != null)
          .map((a) => ({ site: s.name, siteId: s.id, ...a })),
      ),
    [scenario.sites, assessments],
  );
  const assetOpt = useMemo<echarts.EChartsOption>(() => {
    const rows = [...assetRows].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 20);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: any) => `${p[0].name}<br/>${fmt.pct(p[0].value / 100)} of headroom` },
      grid: { left: 240, right: 40, top: 10, bottom: 30 },
      xAxis: { type: 'value', name: '% of headroom', max: 150, axisLabel: { color: '#9aa7b4' }, splitLine: { lineStyle: { color: '#2b3542' } } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => `${r.site} → ${r.name}`.slice(0, 48)), axisLabel: { color: '#cbd5e1', fontSize: 11 } },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => ({ value: Math.min(150, Math.round((r.ratio ?? 0) * 100)), itemStyle: { color: STATUS_COLOR[r.status] } })),
          markLine: {
            symbol: 'none',
            data: [
              { xAxis: scenario.settings.thresholds.warn * 100, lineStyle: { color: '#f59e0b' }, label: { formatter: 'watch' } },
              { xAxis: scenario.settings.thresholds.crit * 100, lineStyle: { color: '#ef4444' }, label: { formatter: 'critical' } },
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
          return `<b>${r.network}</b> (${r.borough})<br/>Added EV load: ${fmt.mw(r.addedMw)}<br/>Network capacity range: ${r.capacityRange ?? '—'} MW (mid ${r.capacityMw ?? '—'})<br/>EVs: ${fmt.int(r.evs)}<br/>Ratio: ${fmt.pct(r.ratio)}`;
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
          Analytics · {scenario.name}
          {compare && <span className="muted" style={{ fontSize: 13 }}> vs {compare.name}</span>}
        </h2>
        <div className="row">
          <select value={compareId ?? ''} onChange={(e) => setCompare(e.target.value || null)} style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }} title="Compare with a saved scenario">
            <option value="">Compare with saved scenario…</option>
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
            CSV: assets
          </button>
          {area && (
            <button className="btn" onClick={() => downloadCsv(area.networkStats.map((n) => ({ network: n.network, borough: n.borough, evs: Math.round(n.evs), added_mw: n.addedMw.toFixed(3), plate_headroom_mw: n.plateHeadroomMw?.toFixed(2) ?? '', lsrv_remaining_mw: n.remainingMw?.toFixed(2) ?? '', ratio: n.ratio?.toFixed(3) ?? '', status: n.status, dac_share: n.dacShare.toFixed(3) })), `networks_${area.year}`)}>
              CSV: networks
            </button>
          )}
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Sites / ports" value={`${scenario.sites.length} / ${sum.ports}`} b={sumB ? `${compare!.sites.length} / ${sumB.ports}` : undefined} />
        <Kpi label="Nameplate" value={fmt.kw(sum.nameplate)} help="Sum of port kW across all sites." b={sumB ? fmt.kw(sumB.nameplate) : undefined} />
        <Kpi label="Coincident peak" value={fmt.kw(sum.coincident)} sub={`at ${peakHour}:00 · site peak ${fmt.kw(sum.peak)}`} help="Total load at the system peak hour after profiles, diversity, managed charging and storage." b={sumB ? fmt.kw(sumB.coincident) : undefined} />
        <Kpi label="Annual energy" value={`${fmt.int(sum.annualMwh)} MWh`} b={sumB ? `${fmt.int(sumB.annualMwh)} MWh` : undefined} />
        <Kpi label="Assets critical / watch" value={`${sum.crit} / ${sum.warn}`} help="Count of transformers, feeders, plates and networks at or over thresholds." b={sumB ? `${sumB.crit} / ${sumB.warn}` : undefined} />
        <Kpi label="Est. total cost" value={fmt.usd(sum.cost)} sub={`incentive ${fmt.usd(sum.incentive)} · net ${fmt.usd(sum.cost - sum.incentive)}`} b={sumB ? fmt.usd(sumB.cost) : undefined} />
        <Kpi label="Sites in DACs" value={`${sum.dacSites} / ${scenario.sites.length}`} help="NY CLCPA target: ≥ 35% of benefits to disadvantaged communities." b={sumB ? `${sumB.dacSites} / ${compare!.sites.length}` : undefined} />
        {area && <Kpi label={`Area EVs (${area.year})`} value={fmt.int(area.totalEvs)} sub={`${fmt.pct(area.evShare, 1)} of ${fmt.int(area.totalVehicles)} vehicles`} b={compareArea ? `${fmt.int(compareArea.totalEvs)} (${compareArea.year})` : undefined} />}
        {area && <Kpi label="Area added peak" value={fmt.mw(area.totalAddedMw)} sub={`${area.networkStats.filter((n) => n.status === 'crit').length} networks critical`} b={compareArea ? fmt.mw(compareArea.totalAddedMw) : undefined} />}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>
            <span>
              Hourly load profile <Help text="Stacked by site. Dashed red = the same sites with no managed charging or storage. Blue line = system peak hour used for status." />
            </span>
            <button className="btn small" onClick={() => downloadPng(charts.current.load, 'hourly_load')}>
              PNG
            </button>
          </h3>
          <Chart option={loadOpt} height={300} onReady={(c) => (charts.current.load = c)} />
        </div>
        <div className="card">
          <h3>
            <span>
              Asset loading at system peak <Help text="Added site load as a percentage of each asset's published headroom. Capped at 150% for display." />
            </span>
            <button className="btn small" onClick={() => downloadPng(charts.current.assets, 'asset_loading')}>
              PNG
            </button>
          </h3>
          {assetRows.length ? <Chart option={assetOpt} height={300} onReady={(c) => (charts.current.assets = c)} /> : <div className="empty">No assessed assets yet — zoom to a site on the map to load grid data.</div>}
        </div>
      </div>

      <div className="card">
        <h3>
          <span>Site detail</span>
        </h3>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Site</th>
                <th>Profile</th>
                <th className="num">Ports</th>
                <th className="num">Nameplate</th>
                <th className="num">Coincident</th>
                <th className="num">Peak/NP</th>
                <th className="num">MWh/yr</th>
                <th>Status</th>
                <th>Binding asset</th>
                <th className="num">Cost</th>
                <th className="num">Incentive</th>
                <th>DAC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scenario.sites.map((s) => {
                const a = assessments.get(s.id);
                const binding = a?.assets.filter((x) => x.ratio != null).sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
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
                      <StatusPill status={a?.worst ?? 'unknown'} />
                    </td>
                    <td>
                      {binding ? (
                        <span className="row" style={{ gap: 6 }}>
                          <StatusDot status={binding.status} /> {binding.name} ({fmt.pct(binding.ratio)})
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
                          setTab('map');
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
        <div className="card">
          <h3>
            <span>
              Cost breakdown by site <Help text="Illustrative: port hardware + make-ready $/kW + storage + grid upgrades triggered by critical assets. Edit assumptions in Settings." />
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
              EV adoption curves <Help text="Share of light-duty vehicles that are plug-in EVs. The bold line is the curve used by the area scenario; the marker is the scenario year." />
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
            <div className="card">
              <h3>
                <span>
                  Top networks by added EV load ({area.year}) <Help text="Coloured by status against the network's published hosting-capacity range (midpoint of 0–25 / 25–50 / 50–100 / >100 MW). Grey bars show that midpoint." />
                </span>
                <button className="btn small" onClick={() => downloadPng(charts.current.net, 'networks')}>
                  PNG
                </button>
              </h3>
              <Chart option={networkOpt} height={420} onReady={(c) => (charts.current.net = c)} />
            </div>
            <div className="card">
              <h3>
                <span>EVs and added load by borough</span>
                <button className="btn small" onClick={() => downloadPng(charts.current.boro, 'boroughs')}>
                  PNG
                </button>
              </h3>
              <Chart option={boroughOpt} height={420} onReady={(c) => (charts.current.boro = c)} />
            </div>
          </div>
          <div className="card">
            <h3>
              <span>Network stress table</span>
              <span className="row">
                <span className="muted">Sort:</span>
                {(['ratio', 'addedMw', 'evs'] as const).map((k) => (
                  <button key={k} className={`btn small ${netSort === k ? 'active' : ''}`} onClick={() => setNetSort(k)}>
                    {{ ratio: 'Ratio', addedMw: 'Added MW', evs: 'EVs' }[k]}
                  </button>
                ))}
              </span>
            </h3>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Network</th>
                    <th>Borough</th>
                    <th className="num">EVs</th>
                    <th className="num">Added MW</th>
                    <th>Capacity range MW</th>
                    <th className="num">Plate kVA sum (MW)</th>
                    <th className="num">LSRV remaining MW</th>
                    <th className="num">Ratio</th>
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
                      <td className="num">{fmt.pct(n.ratio)}</td>
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
          <div className="empty">Enable the area-wide EV adoption scenario in the Scenario panel to see tract- and network-level load growth here.</div>
        </div>
      )}
    </div>
  );
}
