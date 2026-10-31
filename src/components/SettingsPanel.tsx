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
      <p className="muted">These assumptions are saved with the scenario, so two scenarios can be compared on different assumptions.</p>

      <h3>System</h3>
      <Select
        label="Season"
        value={settings.season}
        options={[
          { value: 'summer', label: 'Summer (system peak)' },
          { value: 'winter', label: 'Winter' },
        ]}
        onChange={(season) => setSettings({ season })}
        help="Switches to Con Edison's winter transformer and feeder capacity layers. Con Edison is summer-peaking today, but electrified heat is pushing some networks toward winter peaks."
      />
      <Slider label="System peak hour" value={settings.peakHour} min={0} max={23} format={(v) => `${v}:00`} onChange={(peakHour) => setSettings({ peakHour })} help="Hour used to read the coincident load from each site's hourly profile. Con Edison's summer peak is typically 5–6 PM." />
      <Slider label="Power factor" value={settings.powerFactor} min={0.8} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(powerFactor) => setSettings({ powerFactor })} help="Converts kVA hosting capacity to kW." />
      <Slider label="Assumed existing transformer loading" value={settings.xfmrBaseLoading} min={0} max={0.8} step={0.05} format={(v) => fmt.pct(v)} onChange={(xfmrBaseLoading) => setSettings({ xfmrBaseLoading })} help="Con Edison's ranges are already 'available' capacity, so the default is 0. Raise it for a conservative view." />

      <h3>
        Status thresholds <Help text="Added load ÷ headroom. Below 'watch' is green; at or above 'critical' is red." />
      </h3>
      <Slider label="Watch threshold" value={t.warn} min={0.2} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(warn) => setSettings({ thresholds: { ...t, warn } })} />
      <Slider label="Critical threshold" value={t.crit} min={0.5} max={1.5} step={0.05} format={(v) => fmt.pct(v)} onChange={(crit) => setSettings({ thresholds: { ...t, crit } })} />

      <h3>
        Transformer kVA per map range <Help text="Con Edison publishes ranges, not exact values. These point estimates are used as headroom. Adjust to be conservative (lower) or optimistic." />
      </h3>
      {Object.keys(settings.xfmrKvaEstimate).map((k) => (
        <NumberField key={k} label={k} value={settings.xfmrKvaEstimate[k]} step={50} min={0} suffix="kVA" onChange={(v) => setSettings({ xfmrKvaEstimate: { ...settings.xfmrKvaEstimate, [k]: v } })} />
      ))}

      <h3>
        Cost & incentive assumptions <Help text="Illustrative planning numbers, editable. Make-ready incentives mirror the structure of Con Edison's PowerReady program (higher share in disadvantaged communities, capped per site)." />
      </h3>
      {(Object.keys(CHARGERS) as ChargerType[]).map((k) => (
        <NumberField key={k} label={`${CHARGERS[k].label} / port`} value={settings.cost.portCost[k]} step={500} min={0} suffix="$" onChange={(v) => setCost({ portCost: { ...settings.cost.portCost, [k]: v } })} />
      ))}
      <NumberField label="Make-ready $/kW" value={settings.cost.makeReadyPerKw} step={25} min={0} suffix="$/kW" onChange={(makeReadyPerKw) => setCost({ makeReadyPerKw })} help="Customer- and utility-side infrastructure: service, switchgear, trenching, metering." />
      <NumberField label="Transformer upgrade" value={settings.cost.xfmrUpgrade} step={10000} min={0} suffix="$" onChange={(xfmrUpgrade) => setCost({ xfmrUpgrade })} help="Added when a transformer goes critical." />
      <NumberField label="Feeder reinforcement $/MW over" value={settings.cost.feederPerMwOver} step={50000} min={0} suffix="$" onChange={(feederPerMwOver) => setCost({ feederPerMwOver })} />
      <NumberField label="Storage $/kWh" value={settings.cost.storagePerKwh} step={25} min={0} suffix="$" onChange={(storagePerKwh) => setCost({ storagePerKwh })} />
      <Slider label="Incentive share (base)" value={settings.cost.incentiveBase} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(incentiveBase) => setCost({ incentiveBase })} />
      <Slider label="Incentive share (DAC)" value={settings.cost.incentiveDac} min={0} max={1} step={0.05} format={(v) => fmt.pct(v)} onChange={(incentiveDac) => setCost({ incentiveDac })} />
      <NumberField label="Incentive cap / site" value={settings.cost.incentiveCap} step={100000} min={0} suffix="$" onChange={(incentiveCap) => setCost({ incentiveCap })} />
    </div>
  );
}
