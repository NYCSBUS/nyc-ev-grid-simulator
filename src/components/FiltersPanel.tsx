import { useStore } from '../state/store';
import { LAND_USE_CODES } from '../lib/socrata';
import { ACS_VARS } from './MapView';
import { Check, Chips, Help, Select, Slider } from './ui';
import type { AcsVariable } from '../types';

const BUCKETS = ['< 200 kVA', '200 kVA to 499 kVA', '500 kVA to 1000 kVA', '> 1000 kVA', 'N/A'];
const BOROUGHS = ['Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island', 'Westchester'];
const FEEDER_KV = ['4', '13', '27', '33'];

export function FiltersPanel({ mode }: { mode: 'sites' | 'outlook' }) {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const setLayers = useStore((s) => s.setLayers);
  return (
    <div className="panel" id="tour-filters">
      <div className="row between" style={{ marginBottom: 4 }}>
        <span className="muted">Narrow down what the map shows</span>
        <button className="btn small" onClick={resetFilters}>
          Reset
        </button>
      </div>

      {mode === 'sites' && (
      <>
      <h3>
        Transformers (the taps) <Help text="Show only transformers of a certain type and with a certain amount of room left. Typical use: find the big 460 V ones (over 1000 kVA) that a fast-charging station needs." />
      </h3>
      <Chips options={[{ value: '208' as const, label: '208 V · most buildings, slow chargers' }, { value: '460' as const, label: '460 V · what fast chargers need' }]} value={filters.xfmrVoltage} onChange={(xfmrVoltage) => setFilters({ xfmrVoltage })} />
      <div style={{ height: 6 }} />
      <Chips options={BUCKETS.map((b) => ({ value: b, label: b }))} value={filters.xfmrBuckets} onChange={(xfmrBuckets) => setFilters({ xfmrBuckets })} />

      <h3>Street mains (feeders)</h3>
      <Slider label="Minimum room left for EVs" value={filters.feederMinHeadroom} min={0} max={10} step={0.25} format={(v) => `${v} MW`} onChange={(feederMinHeadroom) => setFilters({ feederMinHeadroom })} help="Hide street mains that have less than this much room left for new EV load." />
      <Chips options={FEEDER_KV.map((v) => ({ value: v, label: `${v} kV` }))} value={filters.feederVoltages} onChange={(feederVoltages) => setFilters({ feederVoltages })} />

      <h3>Grid zones & map sheets</h3>
      <Chips options={BOROUGHS.map((b) => ({ value: b, label: b }))} value={filters.boroughs} onChange={(boroughs) => setFilters({ boroughs })} />
      <Slider label="Min spare MW Con Ed is buying back" value={filters.networkMinRemaining} min={0} max={20} step={0.5} format={(v) => `${v} MW`} onChange={(networkMinRemaining) => setFilters({ networkMinRemaining })} help="Show only grid zones where Con Edison still has at least this much load relief to buy (its LSRV program). Most zones publish 0." />
      <Slider label="Min room left per map sheet" value={filters.plateMinKva} min={0} max={5000} step={100} format={(v) => `${v} kVA`} onChange={(plateMinKva) => setFilters({ plateMinKva })} />
      </>
      )}
      {mode === 'outlook' && (
        <>
          <h3>Grid zones</h3>
          <Chips options={BOROUGHS.map((b) => ({ value: b, label: b }))} value={filters.boroughs} onChange={(boroughs) => setFilters({ boroughs })} />
        </>
      )}

      <h3>
        Neighbourhood statistics <Help text="Shade every Census neighbourhood by one statistic — income, renters, car ownership and so on. Turns the neighbourhood layer on." />
      </h3>
      <Select
        label="Shade neighbourhoods by"
        value={filters.acsVariable}
        options={(Object.keys(ACS_VARS) as AcsVariable[]).map((k) => ({ value: k, label: ACS_VARS[k].label }))}
        onChange={(acsVariable) => {
          setFilters({ acsVariable });
          if (acsVariable !== 'none') setLayers({ tracts: true });
        }}
        help={filters.acsVariable !== 'none' ? ACS_VARS[filters.acsVariable].help : 'Pick a statistic to see what it means.'}
      />
      <Check label="Disadvantaged communities only" checked={filters.dacOnly} onChange={(dacOnly) => setFilters({ dacOnly })} />

      {mode === 'sites' && (
      <>
      <h3>
        Buildings <Help text="Show only certain kinds of buildings — for example apartment buildings with 50+ homes, which are good candidates for garage chargers." />
      </h3>
      <Slider label="Minimum homes in the building" value={filters.minUnits} min={0} max={300} step={5} onChange={(minUnits) => setFilters({ minUnits })} />
      <Chips options={LAND_USE_CODES.map(([code, name]) => ({ value: code, label: name }))} value={filters.plutoLandUse} onChange={(plutoLandUse) => setFilters({ plutoLandUse })} />
      </>
      )}
    </div>
  );
}
