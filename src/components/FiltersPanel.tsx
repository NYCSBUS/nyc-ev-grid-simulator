import { useStore } from '../state/store';
import { LAND_USE_CODES } from '../lib/socrata';
import { ACS_VARS } from './MapView';
import { Check, Chips, Help, Select, Slider } from './ui';
import type { AcsVariable } from '../types';

const BUCKETS = ['< 200 kVA', '200 kVA to 499 kVA', '500 kVA to 1000 kVA', '> 1000 kVA', 'N/A'];
const BOROUGHS = ['Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island', 'Westchester'];
const FEEDER_KV = ['4', '13', '27', '33'];

export function FiltersPanel() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const setLayers = useStore((s) => s.setLayers);
  return (
    <div className="panel" id="tour-filters">
      <h2>
        Filters
        <button className="btn small" onClick={resetFilters}>
          Reset
        </button>
      </h2>

      <h3>
        Transformers <Help text="Show only transformers at these service voltages and available-capacity ranges. Use it to hunt for > 1000 kVA 460 V units for DC fast charging." />
      </h3>
      <Chips options={[{ value: '208' as const, label: '208 V (L2 / small)' }, { value: '460' as const, label: '460 V (DCFC)' }]} value={filters.xfmrVoltage} onChange={(xfmrVoltage) => setFilters({ xfmrVoltage })} />
      <div style={{ height: 6 }} />
      <Chips options={BUCKETS.map((b) => ({ value: b, label: b }))} value={filters.xfmrBuckets} onChange={(xfmrBuckets) => setFilters({ xfmrBuckets })} />

      <h3>Feeders</h3>
      <Slider label="Minimum EV headroom" value={filters.feederMinHeadroom} min={0} max={10} step={0.25} format={(v) => `${v} MW`} onChange={(feederMinHeadroom) => setFilters({ feederMinHeadroom })} help="Hide feeders with less EV load headroom than this." />
      <Chips options={FEEDER_KV.map((v) => ({ value: v, label: `${v} kV` }))} value={filters.feederVoltages} onChange={(feederVoltages) => setFilters({ feederVoltages })} />

      <h3>Networks & plates</h3>
      <Chips options={BOROUGHS.map((b) => ({ value: b, label: b }))} value={filters.boroughs} onChange={(boroughs) => setFilters({ boroughs })} />
      <Slider label="Min network LSRV remaining" value={filters.networkMinRemaining} min={0} max={20} step={0.5} format={(v) => `${v} MW`} onChange={(networkMinRemaining) => setFilters({ networkMinRemaining })} help="Only networks with at least this much remaining non-wires (LSRV) capacity. Most networks publish 0." />
      <Slider label="Min M&S plate capacity" value={filters.plateMinKva} min={0} max={5000} step={100} format={(v) => `${v} kVA`} onChange={(plateMinKva) => setFilters({ plateMinKva })} />

      <h3>
        Demographics <Help text="Colour census tracts by an ACS variable. Turns on the tract layer." />
      </h3>
      <Select
        label="Colour tracts by"
        value={filters.acsVariable}
        options={(Object.keys(ACS_VARS) as AcsVariable[]).map((k) => ({ value: k, label: ACS_VARS[k].label }))}
        onChange={(acsVariable) => {
          setFilters({ acsVariable });
          if (acsVariable !== 'none') setLayers({ tracts: true });
        }}
        help={filters.acsVariable !== 'none' ? ACS_VARS[filters.acsVariable].help : 'Pick a variable to see its definition.'}
      />
      <Check label="Disadvantaged community tracts only" checked={filters.dacOnly} onChange={(dacOnly) => setFilters({ dacOnly })} />

      <h3>
        Buildings (MapPLUTO) <Help text="Filter building footprints by MapPLUTO land use and residential unit count — e.g. find multifamily buildings with 50+ units for garage L2 programs." />
      </h3>
      <Slider label="Min residential units" value={filters.minUnits} min={0} max={300} step={5} onChange={(minUnits) => setFilters({ minUnits })} />
      <Chips options={LAND_USE_CODES.map(([code, name]) => ({ value: code, label: name }))} value={filters.plutoLandUse} onChange={(plutoLandUse) => setFilters({ plutoLandUse })} />
    </div>
  );
}
