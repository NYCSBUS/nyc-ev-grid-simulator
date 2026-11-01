import { useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { useAssessments, useAreaResult } from '../state/hooks';
import { CHARGERS, CURVE_LABELS, PROFILES, evShare } from '../sim/profiles';
import { effectiveKw, nameplateKw, plugKw, portCount } from '../sim/model';
import type { ChargerType, Site, SiteAssessment } from '../types';
import { Check, Chips, Help, Select, Slider, StatusDot, StatusPill, Tip, fmt } from './ui';
import { kwPerEv } from '../sim/area';
import { VERDICT_WORD, verdictFor } from '../sim/verdict';

const BOROUGHS = ['Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island', 'Westchester'];

export function ScenarioPanel() {
  const scenario = useStore((s) => s.scenario);
  const setScenarioName = useStore((s) => s.setScenarioName);
  const selectedSiteId = useStore((s) => s.selectedSiteId);
  const selectSite = useStore((s) => s.selectSite);
  const placing = useStore((s) => s.placing);
  const setPlacing = useStore((s) => s.setPlacing);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const removeSite = useStore((s) => s.removeSite);
  const assessments = useAssessments();
  const selected = scenario.sites.find((s) => s.id === selectedSiteId);

  return (
    <div className="panel" id="tour-scenario">
      <h2>
        Charging sites ({scenario.sites.length}){' '}
        <Help text="A site is one charging project at one address. The simulator works out what it draws at the grid's 5 PM rush hour, sends that load to the nearest grid equipment (transformers, street mains, vaults, grid zone) and checks how much room each has left." />
      </h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <button id="tour-add-site" className={`btn primary ${placing ? 'active' : ''}`} onClick={() => setPlacing(!placing)}>
          {placing ? 'Cancel' : '+ Add a site'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          then click the map — or search an address above
        </span>
      </div>
      {scenario.sites.map((s) => {
        const a = assessments.get(s.id);
        return (
          <div key={s.id} className={`site-card ${s.id === selectedSiteId ? 'selected' : ''}`} onClick={() => selectSite(s.id === selectedSiteId ? null : s.id)}>
            <div className="title">
              <span className="row" style={{ gap: 6 }}>
                <StatusDot status={a?.worst ?? 'unknown'} /> {s.name}
                <span className={`pill ${a?.worst ?? 'unknown'}`}>{VERDICT_WORD[verdictFor(a).level]}</span>
              </span>
              <span className="row" style={{ gap: 4 }}>
                <button
                  className="btn small"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestFlyTo([s.lng, s.lat], 16);
                  }}
                  title="Zoom to site"
                >
                  ⌖
                </button>
                <button
                  className="btn small danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSite(s.id);
                  }}
                  title="Remove site"
                >
                  ×
                </button>
              </span>
            </div>
            <div className="meta">
              {s.address ?? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}
              <br />
              {portCount(s)} plugs · {fmt.kw(nameplateKw(s))} sticker · {PROFILES[s.profile].label}
              {a && (
                <>
                  {' '}
                  · {fmt.kw(a.coincidentKw)} at 5 PM rush {a.inDac && <span className="pill warn">DAC</span>}
                </>
              )}
            </div>
          </div>
        );
      })}
      {!scenario.sites.length && <div className="empty">No charging sites yet. Search an address above or click “Add site on map”.</div>}

      {selected && <SiteEditor site={selected} />}
      {!selected && scenario.sites.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Click a site above to edit it and see its traffic lights.</div>}

      <div className="row between" style={{ marginTop: 18, fontSize: 12 }}>
        <span className="muted">Scenario name</span>
        <input type="text" value={scenario.name} onChange={(e) => setScenarioName(e.target.value)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', width: 180 }} title="Scenario name" />
      </div>
    </div>
  );
}

function Fold({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fold">
      <button className="fold-head" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> {title}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}

/** The answer, up front: fits / tight / doesn't fit, with the one number that matters and what to try next. */
function VerdictCard({ a, loading }: { a?: SiteAssessment; loading: boolean }) {
  const v = verdictFor(a, loading);
  // re-trigger the pulse animation whenever the verdict changes
  const key = `${v.level}-${Math.round(a?.coincidentKw ?? 0)}-${v.counts.crit}-${v.counts.warn}`;
  return (
    <div key={key} className={`verdict ${v.status}`} id="tour-verdict">
      <div className="verdict-head">
        <StatusDot status={v.status} />
        <b>{v.title}</b>
        {a && (
          <span className="verdict-counts">
            <span style={{ color: 'var(--ok)' }}>{v.counts.ok}</span> / <span style={{ color: 'var(--warn)' }}>{v.counts.warn}</span> / <span style={{ color: 'var(--crit)' }}>{v.counts.crit}</span>
          </span>
        )}
      </div>
      <div className="verdict-body">{v.summary}</div>
      {v.advice && <div className="verdict-advice">{v.advice}</div>}
      {a && (
        <button className="btn small" style={{ marginTop: 6 }} onClick={() => document.getElementById('tour-impact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          See every traffic light ↓
        </button>
      )}
    </div>
  );
}

function SiteEditor({ site }: { site: Site }) {
  const updateSite = useStore((s) => s.updateSite);
  const assessments = useAssessments();
  const a = assessments.get(site.id);
  const live = useStore((s) => s.live);
  const set = (patch: Partial<Site>) => updateSite(site.id, patch);
  const setCharger = (k: ChargerType, n: number) => set({ chargers: { ...site.chargers, [k]: Math.max(0, Math.round(n)) } });

  return (
    <div className="section" id="tour-site-editor">
      <div className="field">
        <input type="text" className="wide" value={site.name} onChange={(e) => set({ name: e.target.value })} placeholder="Site name" />
      </div>
      <VerdictCard a={a} loading={!!(live.loading.transformers || live.loading.feeders || live.loading.structures)} />

      <h3 id="tour-chargers" style={{ marginTop: 6 }}>
        Chargers <Help text="How many plugs of each kind. Level 2 = overnight-speed (like a dryer outlet); DC fast = 20-minute charging. Adding them up gives the sticker rating (nameplate). Fast chargers need the higher-voltage 460 V type of transformer, so the simulator looks for one of those first." />
      </h3>
      <div className="charger-grid">
        {(Object.keys(CHARGERS) as ChargerType[]).map((k) => (
          <div key={k} style={{ display: 'contents' }}>
            <Tip text={CHARGERS[k].desc}>
              <span>{CHARGERS[k].label}</span>
            </Tip>
            <div className="stepper">
              <button onClick={() => setCharger(k, (site.chargers[k] || 0) - 1)}>−</button>
              <input type="number" min={0} value={site.chargers[k] || 0} onChange={(e) => setCharger(k, +e.target.value)} />
              <button onClick={() => setCharger(k, (site.chargers[k] || 0) + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="muted">Sticker rating (nameplate)</span>
        <b>{fmt.kw(nameplateKw(site))}</b>
      </div>
      {effectiveKw(site) < nameplateKw(site) - 0.01 && (
        <div className="row between">
          <span className="muted">After per-plug caps</span>
          <b style={{ color: 'var(--accent)' }}>{fmt.kw(effectiveKw(site))}</b>
        </div>
      )}
      <Fold title="Cap each plug (derating)" defaultOpen={!!site.derateKw && Object.values(site.derateKw).some((v) => v)}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Some charging systems hold plugs below their hardware rating — e.g. 19.2 kW plugs limited to 10 kW. Enter the cap per plug; leave blank for full power.
        </div>
        {(Object.keys(CHARGERS) as ChargerType[])
          .filter((k) => (site.chargers[k] || 0) > 0)
          .map((k) => (
            <div key={k} className="field">
              <label>
                {CHARGERS[k].label}
                <span className="muted" style={{ fontSize: 11 }}>→ {plugKw(site, k)} kW each</span>
              </label>
              <span className="row" style={{ gap: 4 }}>
                <input
                  type="number"
                  min={0}
                  max={CHARGERS[k].kw}
                  step={0.5}
                  placeholder={String(CHARGERS[k].kw)}
                  value={site.derateKw?.[k] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : Math.max(0, +e.target.value);
                    const next = { ...(site.derateKw ?? {}) };
                    if (v == null || v <= 0) delete next[k];
                    else next[k] = v;
                    set({ derateKw: next });
                  }}
                />
                <span className="muted">kW</span>
              </span>
            </div>
          ))}
        {portCount(site) === 0 && <div className="muted">Add some plugs first.</div>}
      </Fold>

      <Select
        label="What kind of place"
        value={site.profile}
        options={(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((p) => ({ value: p, label: PROFILES[p].label }))}
        onChange={(profile) => set({ profile })}
        help={PROFILES[site.profile].desc}
      />

      <h3 id="tour-loadshape">Ways to soften the load</h3>
      <Check
        label="Smart (managed) charging"
        checked={site.managed}
        onChange={(managed) => set({ managed })}
        help="Like running the dishwasher after 10 PM: charging is delayed or slowed to avoid the grid's 5–6 PM rush (Con Edison runs programs like SmartCharge for this). Same chargers, different timing."
      />
      <Slider label="On-site battery · power" value={site.storageKw} min={0} max={2000} step={50} format={(v) => fmt.kw(v)} onChange={(storageKw) => set({ storageKw, storageKwh: site.storageKwh || (storageKw ? storageKw * 4 : 0) })} help="A battery is a water tank for electricity: it fills overnight and tops up the station at rush hour. Power (kW) = how fast it can pour." />
      {site.storageKw > 0 && (
        <Slider
          label="On-site battery · size"
          value={site.storageKwh}
          min={0}
          max={8000}
          step={100}
          format={(v) => `${v} kWh`}
          onChange={(storageKwh) => set({ storageKwh })}
          help="How much the tank holds (kWh). The peak it can trim is limited by both how fast it pours and how much it holds."
        />
      )}

      <h3 id="tour-impact">
        Traffic lights at the 5 PM rush{' '}
        <Help text="Each row is a piece of nearby grid equipment. The percentage is how much of its remaining room this site would use at the grid's rush hour: green under 60 %, amber up to 100 %, red over. Numbers come from Con Edison's public capacity maps." />
      </h3>
      {!a && <div className="muted">Loading Con Edison equipment around the site…</div>}
      {a && (
        <>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span>
              Busiest moment {fmt.kw(a.peakKw)} · at the 5 PM rush <b>{fmt.kw(a.coincidentKw)}</b>
            </span>
            <StatusPill status={a.worst} />
          </div>
          {live.loading.transformers || live.loading.feeders || live.loading.structures ? <div className="muted">Refreshing equipment…</div> : null}
          {a.notes.map((n) => (
            <div key={n} className="callout" style={{ fontSize: 12 }}>
              {n}
            </div>
          ))}
          {a.assets.length === 0 && !a.notes.length && <div className="muted">No Con Edison equipment found within {site.radiusM} m. Try a wider search circle.</div>}
          {[...a.assets.filter((x) => x.ratio != null), ...a.assets.filter((x) => x.ratio == null).slice(0, 6)].map((x) => (
            <div className="asset" key={x.id}>
              <StatusDot status={x.status} />
              <div>
                <div className="name">{x.name}</div>
                <div className="sub">
                  {x.distanceM > 0 ? `${x.distanceM} m · ` : ''}
                  {x.note}
                </div>
              </div>
              <div className="num">
                <div>{x.ratio != null ? fmt.pct(Math.min(x.ratio, 9.99)) : '—'}</div>
                <div className="sub">
                  {fmt.kw(x.addedKw)} / {fmt.kw(x.headroomKw)}
                </div>
              </div>
            </div>
          ))}
          {a.assets.filter((x) => x.ratio == null).length > 6 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              + {a.assets.filter((x) => x.ratio == null).length - 6} more pieces of equipment nearby that this site does not draw from (all shown on the map).
            </div>
          )}
        </>
      )}

      <Fold title="More options (how busy, taper, grid connection)">
        <Slider
          label="Plugs in use at busiest hour"
          value={site.utilization}
          min={0.1}
          max={1}
          step={0.05}
          format={(v) => fmt.pct(v)}
          onChange={(utilization) => set({ utilization })}
          help="How many of the plugs have a car attached at the busiest moment (engineers: utilization). Public fast-charging stations rarely top 60–80 %; a truck depot at night can hit 100 %."
        />
        <Slider
          label="Charging taper"
          value={site.diversity}
          min={0.3}
          max={1}
          step={0.05}
          format={(v) => fmt.pct(v)}
          onChange={(diversity) => set({ diversity })}
          help="Like a phone, a car charges slowly once it is nearly full, so an occupied plug rarely draws its maximum (engineers: diversity). 100 % = every plug at full blast."
        />
        <Slider label="How far to look for grid equipment" value={site.radiusM} min={50} max={800} step={25} format={fmt.m} onChange={(radiusM) => set({ radiusM })} help="Only transformers, street mains and vaults inside this circle are checked. In dense 'web' areas like Manhattan the load can travel further, so a wider circle is reasonable." />
        <Select
          label="How the load spreads"
          value={site.sharing}
          options={[
            { value: 'grid', label: 'Web: 60 / 25 / 15 % over nearest 3 taps' },
            { value: 'single', label: 'Single pipe: 100 % on nearest tap' },
          ]}
          onChange={(sharing) => set({ sharing })}
          help="In dense parts of the city the grid is a web (Con Edison: secondary network): several transformers feed one shared underground grid, so new load spreads across neighbours. In the outer boroughs a building usually hangs off a single transformer, like a cul-de-sac with one road in."
        />
      </Fold>
    </div>
  );
}

export function OutlookPanel() {
  const area = useStore((s) => s.scenario.area);
  const setArea = useStore((s) => s.setArea);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="panel" id="tour-outlook">
      <h2>
        Borough-wide outlook{' '}
        <Help text="Zooms out from single sites to whole neighbourhoods. Recipe: count the cars in each Census neighbourhood, assume a share go electric by the chosen year, estimate how many are plugged in at 5 PM, and add it up for each Con Edison grid zone." />
      </h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        How much extra load will everyday EV adoption put on each grid zone, and which zones fill up first? Move the year slider and watch the map.
      </p>
      {!area.enabled && (
        <div className="callout" style={{ fontSize: 12 }}>
          The outlook is switched off.{' '}
          <button className="btn small primary" onClick={() => setArea({ enabled: true })}>
            Turn on
          </button>
        </div>
      )}
      <AreaEditor />
      <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => setTab('results')}>
        See the full grid-zone table in Results →
      </button>
    </div>
  );
}

function AreaEditor() {
  const area = useStore((s) => s.scenario.area);
  const setArea = useStore((s) => s.setArea);
  const result = useAreaResult();
  return (
    <div className="section" id="tour-area">
      <div className="row between" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Assumptions</h3>
        <Check label="On" checked={area.enabled} onChange={(enabled) => setArea({ enabled })} />
      </div>
      <Slider label="Year" value={area.year} min={2024} max={2045} onChange={(year) => setArea({ year })} />
      <Select label="How fast cars go electric" value={area.curve} options={(Object.keys(CURVE_LABELS) as Array<keyof typeof CURVE_LABELS>).map((k) => ({ value: k, label: CURVE_LABELS[k] }))} onChange={(curve) => setArea({ curve })} help="Share of cars on the road that are electric in the chosen year. 'Policy' follows New York's rule that all new cars sold are zero-emission by 2035 (the cars on the road lag new sales by about a decade)." />
      {area.curve === 'custom' && <Slider label="Share of cars electric in 2035" value={area.custom2035} min={0.05} max={0.8} step={0.01} format={(v) => fmt.pct(v)} onChange={(custom2035) => setArea({ custom2035 })} />}
      <div className="row between muted" style={{ fontSize: 12 }}>
        <span>Cars that are electric in {area.year}</span>
        <b style={{ color: 'var(--accent)' }}>{fmt.pct(evShare(area.curve, area.year, area.custom2035), 1)}</b>
      </div>
      <Fold title="Charging habits (home share, smart charging, public use)">
      <Slider label="EV drivers who can charge at home" value={area.homeShare} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(homeShare) => setArea({ homeShare })} help="Share of EV drivers who can charge at home or in their building's garage. Low where most people rent and park on the street; those drivers charge in public instead (next slider but one)." />
      <Slider label="Home charger power" value={area.evKw} min={1.4} max={19.2} step={0.1} format={(v) => `${v} kW`} onChange={(evKw) => setArea({ evKw })} />
      <Slider label="Home chargers busy at 5 PM" value={area.coincidence} min={0.05} max={0.6} step={0.01} format={(v) => fmt.pct(v)} onChange={(coincidence) => setArea({ coincidence })} help="Of all the home chargers, the share actually drawing power at the grid's 5 PM rush if nobody manages them. Utility studies find 15–30 %." />
      <Slider label="Share on smart charging" value={area.managedShare} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(managedShare) => setArea({ managedShare })} />
      <Slider label="Rush-hour cut from smart charging" value={area.managedReduction} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(managedReduction) => setArea({ managedReduction })} help="How much a smart-charging driver's 5 PM draw falls, e.g. 60 % for a program that delays charging to midnight." />
      <Slider label="Public & fleet charging per EV" value={area.publicKwPerEv} min={0} max={1} step={0.01} format={(v) => `${v.toFixed(2)} kW`} onChange={(publicKwPerEv) => setArea({ publicKwPerEv })} help="Extra 5 PM load per EV from public chargers, taxis, delivery vans and so on, spread across the neighbourhood." />
      <div className="row between muted" style={{ fontSize: 12 }}>
        <span>Rush-hour load per EV (all effects)</span>
        <b style={{ color: 'var(--accent)' }}>{kwPerEv(area).toFixed(2)} kW</b>
      </div>
      </Fold>
      <h3>Which boroughs</h3>
      <Chips options={BOROUGHS.map((b) => ({ value: b, label: b }))} value={area.boroughs} onChange={(boroughs) => setArea({ boroughs })} />
      <Check label="Disadvantaged communities only" checked={area.dacOnly} onChange={(dacOnly) => setArea({ dacOnly })} />
      {result && (
        <div className="section" style={{ marginTop: 10, background: 'var(--bg)' }}>
          <div className="row between">
            <span className="muted">EVs on the road in {area.year}</span>
            <b>{fmt.int(result.totalEvs)}</b>
          </div>
          <div className="row between">
            <span className="muted">Extra load at the 5 PM rush</span>
            <b>{fmt.mw(result.totalAddedMw)}</b>
          </div>
          <div className="row between">
            <span className="muted">Grid zones red / amber</span>
            <b>
              <span style={{ color: 'var(--crit)' }}>{result.networkStats.filter((n) => n.status === 'crit').length}</span> /{' '}
              <span style={{ color: 'var(--warn)' }}>{result.networkStats.filter((n) => n.status === 'warn').length}</span>
            </b>
          </div>
        </div>
      )}
    </div>
  );
}
