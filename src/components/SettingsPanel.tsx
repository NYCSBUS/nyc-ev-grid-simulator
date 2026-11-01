import { useStore } from '../state/store';
import { CHARGERS } from '../sim/profiles';
import { DEFAULT_SETTINGS } from '../state/defaults';
import type { ChargerType } from '../types';
import { Help, NumberField, Select, Slider, fmt } from './ui';

export function SettingsPanel() {
  const settings = useStore((s) => s.scenario.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setCost = useStore((s) => s.setCostParams);
  const t = settings.thresholds;
  return (
    <div className="panel" id="tour-settings">
      <h2>
        Model settings
        <button className="btn small" onClick={() => setSettings(structuredClone(DEFAULT_SETTINGS))}>
          Reset
        </button>
      </h2>
      <p className="muted">The knobs behind the maths. They are saved with each scenario, so you can compare two scenarios built on different assumptions.</p>

      <h3>The grid</h3>
      <Select
        label="Season"
        value={settings.season}
        options={[
          { value: 'summer', label: 'Summer (the grid\'s busiest season)' },
          { value: 'winter', label: 'Winter' },
        ]}
        onChange={(season) => setSettings({ season })}
        help="Con Edison publishes room left separately for summer and winter. Summer is the busy season today (air conditioning), but as heating goes electric some areas are becoming winter-limited."
      />
      <Slider label="Grid rush hour" value={settings.peakHour} min={0} max={23} format={(v) => `${v}:00`} onChange={(peakHour) => setSettings({ peakHour })} help="The hour of day every traffic light is judged on. Con Edison's summer rush is 5–6 PM." />
      <Slider label="kVA → kW conversion (power factor)" value={settings.powerFactor} min={0.8} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(powerFactor) => setSettings({ powerFactor })} help="Con Edison states some room-left figures in kVA; chargers are rated in kW. kW = kVA × this number (0.95 is typical)." />
      <Slider label="Assume taps are already this full" value={settings.xfmrBaseLoading} min={0} max={0.8} step={0.05} format={(v) => fmt.pct(v)} onChange={(xfmrBaseLoading) => setSettings({ xfmrBaseLoading })} help="Con Edison's transformer figures already describe room left, so the default is 0 %. Raise it to be more cautious." />

      <h3>
        Where the lights change colour <Help text="A light is judged by how much of the remaining room your site uses. Below the amber line = green; at or above the red line = red." />
      </h3>
      <Slider label="Amber from" value={t.warn} min={0.2} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(warn) => setSettings({ thresholds: { ...t, warn } })} />
      <Slider label="Red from" value={t.crit} min={0.5} max={1.5} step={0.05} format={(v) => fmt.pct(v)} onChange={(crit) => setSettings({ thresholds: { ...t, crit } })} />

      <h3>
        Room per transformer size band <Help text="Con Edison publishes transformer room as a band (e.g. 500–1000 kVA), not a number. These are the single values the simulator uses for each band. Lower them to be cautious, raise them to be optimistic." />
      </h3>
      {Object.keys(settings.xfmrKvaEstimate).map((k) => (
        <NumberField key={k} label={k} value={settings.xfmrKvaEstimate[k]} step={50} min={0} suffix="kVA" onChange={(v) => setSettings({ xfmrKvaEstimate: { ...settings.xfmrKvaEstimate, [k]: v } })} />
      ))}

      <h3>
        Prices & grants <Help text="Rough planning numbers you can edit. The grant copies the shape of Con Edison's PowerReady program: a share of the wiring cost, higher in disadvantaged communities, capped per site." />
      </h3>
      {(Object.keys(CHARGERS) as ChargerType[]).map((k) => (
        <NumberField key={k} label={`${CHARGERS[k].label} · per plug`} value={settings.cost.portCost[k]} step={500} min={0} suffix="$" onChange={(v) => setCost({ portCost: { ...settings.cost.portCost, [k]: v } })} />
      ))}
      <NumberField label="Wiring to the parking spot (make-ready) $/kW" value={settings.cost.makeReadyPerKw} step={25} min={0} suffix="$/kW" onChange={(makeReadyPerKw) => setCost({ makeReadyPerKw })} help="Everything between the street and the charger: new service, switchgear, trenching, meters. Like plumbing before you buy the faucet." />
      <NumberField label="New transformer, if a tap goes red" value={settings.cost.xfmrUpgrade} step={10000} min={0} suffix="$" onChange={(xfmrUpgrade) => setCost({ xfmrUpgrade })} help="Added to a site's cost each time a transformer light turns red." />
      <NumberField label="Street-main upgrade, per MW over the line" value={settings.cost.feederPerMwOver} step={50000} min={0} suffix="$" onChange={(feederPerMwOver) => setCost({ feederPerMwOver })} />
      <NumberField label="Battery $/kWh" value={settings.cost.storagePerKwh} step={25} min={0} suffix="$" onChange={(storagePerKwh) => setCost({ storagePerKwh })} />
      <Slider label="Grant covers this share of wiring" value={settings.cost.incentiveBase} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(incentiveBase) => setCost({ incentiveBase })} />
      <Slider label="… in disadvantaged communities" value={settings.cost.incentiveDac} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(incentiveDac) => setCost({ incentiveDac })} />
      <NumberField label="Grant cap per site" value={settings.cost.incentiveCap} step={100000} min={0} suffix="$" onChange={(incentiveCap) => setCost({ incentiveCap })} />
    </div>
  );
}
