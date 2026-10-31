import { useStore } from '../state/store';
import { useAssessments, useAreaResult } from '../state/hooks';
import { CHARGERS, CURVE_LABELS, PROFILES, evShare } from '../sim/profiles';
import { nameplateKw, portCount } from '../sim/model';
import type { ChargerType, Site } from '../types';
import { Check, Chips, Help, Select, Slider, StatusDot, StatusPill, Tip, fmt } from './ui';
import { kwPerEv } from '../sim/area';

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
        <input
          type="text"
          value={scenario.name}
          onChange={(e) => setScenarioName(e.target.value)}
          style={{ background: 'transparent', border: 0, fontWeight: 600, fontSize: 15, width: '100%', outline: 'none' }}
          title="Scenario name"
        />
      </h2>

      <h3>
        Sites ({scenario.sites.length}) <Help text="Each site is a charging project at a specific address. The simulator assigns its coincident peak load to the nearest transformer(s), feeder, M&S plate and network and compares it with published hosting capacity." />
      </h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <button id="tour-add-site" className={`btn primary ${placing ? 'active' : ''}`} onClick={() => setPlacing(!placing)}>
          {placing ? 'Cancel placing' : '+ Add site on map'}
        </button>
        <span className="muted">or search an address above, or shift-click a building</span>
      </div>
      {scenario.sites.map((s) => {
        const a = assessments.get(s.id);
        return (
          <div key={s.id} className={`site-card ${s.id === selectedSiteId ? 'selected' : ''}`} onClick={() => selectSite(s.id === selectedSiteId ? null : s.id)}>
            <div className="title">
              <span className="row" style={{ gap: 6 }}>
                <StatusDot status={a?.worst ?? 'unknown'} /> {s.name}
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
              {portCount(s)} ports · {fmt.kw(nameplateKw(s))} nameplate · {PROFILES[s.profile].label}
              {a && (
                <>
                  {' '}
                  · coincident {fmt.kw(a.coincidentKw)} {a.inDac && <span className="pill warn">DAC</span>}
                </>
              )}
            </div>
          </div>
        );
      })}
      {!scenario.sites.length && <div className="empty">No sites yet. Add one on the map.</div>}

      {selected && <SiteEditor site={selected} />}

      <AreaEditor />
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
      <h3 style={{ marginTop: 0 }}>Edit site</h3>
      <div className="field">
        <input type="text" className="wide" value={site.name} onChange={(e) => set({ name: e.target.value })} placeholder="Site name" />
      </div>

      <h3>
        Chargers <Help text="Port counts by charger type. Nameplate kW = Σ ports × kW. DC fast ports usually need a 460/480 V service, so the simulator prefers a 460 V transformer when one is within the radius." />
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
        <span className="muted">Nameplate</span>
        <b>{fmt.kw(nameplateKw(site))}</b>
      </div>

      <h3>Load shape</h3>
      <Select
        label="Use profile"
        value={site.profile}
        options={(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((p) => ({ value: p, label: PROFILES[p].label }))}
        onChange={(profile) => set({ profile })}
        help={PROFILES[site.profile].desc}
      />
      <Slider
        label="Peak utilization"
        value={site.utilization}
        min={0.1}
        max={1}
        step={0.05}
        format={(v) => fmt.pct(v)}
        onChange={(utilization) => set({ utilization })}
        help="Share of ports drawing power at the busiest hour. Public DCFC hubs rarely exceed 60–80%; depots can hit 100%."
      />
      <Slider
        label="Diversity factor"
        value={site.diversity}
        min={0.3}
        max={1}
        step={0.05}
        format={(v) => fmt.pct(v)}
        onChange={(diversity) => set({ diversity })}
        help="Vehicles taper power as batteries fill, so average draw per active port is below nameplate. 1.0 = no diversity."
      />
      <Check
        label="Managed charging"
        checked={site.managed}
        onChange={(managed) => set({ managed })}
        help="Shifts and flattens charging away from the 5–6 PM system peak (e.g. via Con Edison SmartCharge / load management). Changes the hourly shape; nameplate is unchanged."
      />
      <Slider label="Battery storage power" value={site.storageKw} min={0} max={2000} step={50} format={(v) => fmt.kw(v)} onChange={(storageKw) => set({ storageKw })} help="On-site battery that discharges to shave site peak." />
      <Slider
        label="Battery storage energy"
        value={site.storageKwh}
        min={0}
        max={8000}
        step={100}
        format={(v) => `${v} kWh`}
        onChange={(storageKwh) => set({ storageKwh })}
        help="Energy available for peak shaving per day. Peak reduction is limited by both kW and kWh."
      />

      <h3>Grid connection</h3>
      <Slider label="Asset search radius" value={site.radiusM} min={50} max={800} step={25} format={fmt.m} onChange={(radiusM) => set({ radiusM })} help="Transformers and feeders within this distance are considered. Secondary-network areas in Manhattan can tolerate a wider radius." />
      <Select
        label="Load sharing"
        value={site.sharing}
        options={[
          { value: 'grid', label: 'Secondary grid: 60/25/15% across nearest 3' },
          { value: 'single', label: 'Radial: 100% on nearest transformer' },
        ]}
        onChange={(sharing) => set({ sharing })}
        help="In Con Edison's secondary networks several transformers feed a meshed low-voltage grid, so new load is shared. Radial / outer-borough services typically hang off a single transformer."
      />

      <h3>
        Impact at system peak{' '}
        <Help text="Traffic lights compare the load this site adds at the system peak hour to the headroom published on Con Edison's hosting-capacity maps. Transformer ranges are converted to kVA using the settings." />
      </h3>
      {!a && <div className="muted">Loading grid data around the site…</div>}
      {a && (
        <>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span>
              Peak {fmt.kw(a.peakKw)} · at system peak <b>{fmt.kw(a.coincidentKw)}</b>
            </span>
            <StatusPill status={a.worst} />
          </div>
          {live.loading.transformers || live.loading.feeders || live.loading.structures ? <div className="muted">Refreshing assets…</div> : null}
          {a.notes.map((n) => (
            <div key={n} className="callout" style={{ fontSize: 12 }}>
              {n}
            </div>
          ))}
          {a.assets.length === 0 && !a.notes.length && <div className="muted">No Con Edison assets found within {site.radiusM} m. Try widening the radius.</div>}
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
              + {a.assets.filter((x) => x.ratio == null).length - 6} more assets within the radius with no load allocated (all shown on the map).
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AreaEditor() {
  const area = useStore((s) => s.scenario.area);
  const setArea = useStore((s) => s.setArea);
  const result = useAreaResult();
  return (
    <div className="section" id="tour-area">
      <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between' }}>
        <span>
          Area-wide EV adoption <Help text="Simulates organic EV growth across every census tract: EVs = tract vehicles × adoption share; peak kW = EVs × home-charging share × charger kW × coincidence, less managed-charging savings. Results aggregate to Con Edison networks." />
        </span>
        <Check label="Enable" checked={area.enabled} onChange={(enabled) => setArea({ enabled })} />
      </h3>
      <Slider label="Scenario year" value={area.year} min={2024} max={2045} onChange={(year) => setArea({ year })} />
      <Select label="Adoption curve" value={area.curve} options={(Object.keys(CURVE_LABELS) as Array<keyof typeof CURVE_LABELS>).map((k) => ({ value: k, label: CURVE_LABELS[k] }))} onChange={(curve) => setArea({ curve })} help="Share of light-duty vehicles that are plug-in EVs. 'Policy' follows the NY Advanced Clean Cars II trajectory (100% ZEV sales by 2035)." />
      {area.curve === 'custom' && <Slider label="EV share in 2035" value={area.custom2035} min={0.05} max={0.8} step={0.01} format={(v) => fmt.pct(v)} onChange={(custom2035) => setArea({ custom2035 })} />}
      <div className="row between muted" style={{ fontSize: 12 }}>
        <span>EV fleet share in {area.year}</span>
        <b style={{ color: 'var(--accent)' }}>{fmt.pct(evShare(area.curve, area.year, area.custom2035), 1)}</b>
      </div>
      <Slider label="Home charging share" value={area.homeShare} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(homeShare) => setArea({ homeShare })} help="Share of EVs with a dedicated home/garage charger. Lower in renter-heavy tracts; the remainder is covered by the public kW/EV term." />
      <Slider label="Home charger kW" value={area.evKw} min={1.4} max={19.2} step={0.1} format={(v) => `${v} kW`} onChange={(evKw) => setArea({ evKw })} />
      <Slider label="Peak coincidence" value={area.coincidence} min={0.05} max={0.6} step={0.01} format={(v) => fmt.pct(v)} onChange={(coincidence) => setArea({ coincidence })} help="Fraction of home chargers drawing at the system peak hour if unmanaged. Utility studies put this at 15–30%." />
      <Slider label="Managed charging enrolment" value={area.managedShare} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(managedShare) => setArea({ managedShare })} />
      <Slider label="Managed peak reduction" value={area.managedReduction} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(managedReduction) => setArea({ managedReduction })} help="How much an enrolled charger's peak contribution falls (e.g. 60% for a delay-to-midnight program)." />
      <Slider label="Public / fleet kW per EV" value={area.publicKwPerEv} min={0} max={1} step={0.01} format={(v) => `${v.toFixed(2)} kW`} onChange={(publicKwPerEv) => setArea({ publicKwPerEv })} help="Coincident public & fleet charging load attributed to each EV in the tract." />
      <div className="row between muted" style={{ fontSize: 12 }}>
        <span>Coincident kW per EV</span>
        <b style={{ color: 'var(--accent)' }}>{kwPerEv(area).toFixed(2)} kW</b>
      </div>
      <h3>Scope</h3>
      <Chips options={BOROUGHS.map((b) => ({ value: b, label: b }))} value={area.boroughs} onChange={(boroughs) => setArea({ boroughs })} />
      <Check label="Disadvantaged communities only" checked={area.dacOnly} onChange={(dacOnly) => setArea({ dacOnly })} />
      {result && (
        <div className="section" style={{ marginTop: 10, background: 'var(--bg)' }}>
          <div className="row between">
            <span className="muted">EVs in scope</span>
            <b>{fmt.int(result.totalEvs)}</b>
          </div>
          <div className="row between">
            <span className="muted">Added coincident load</span>
            <b>{fmt.mw(result.totalAddedMw)}</b>
          </div>
          <div className="row between">
            <span className="muted">Networks critical / watch</span>
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
