import { useStore } from '../state/store';
import { MIN_ZOOM } from '../config';
import { Check, Help } from './ui';
import type { LayerVisibility } from '../types';

const LAYER_DEFS: Array<{ key: keyof LayerVisibility; label: string; help: string; minZoom?: number; source: string }> = [
  { key: 'sites', label: 'My charging sites', help: 'Your sites, their search circle, and the grid equipment they draw from, coloured by traffic light.', source: 'Simulator' },
  { key: 'transformers', label: 'Transformers (the "taps")', help: 'Con Edison\'s transformers, coloured like a fuel gauge by how much room they have left (green = lots, red = nearly full). A white ring marks the 460 V type that fast chargers need.', minZoom: MIN_ZOOM.transformers, source: 'CECONY_EVM_Prod / _Winter_Prod' },
  { key: 'feeders', label: 'Street mains (feeders)', help: 'The cables under the street that supply the transformers, coloured by how many MW of room they have left for EVs. Only published outside the dense "web" areas.', minZoom: MIN_ZOOM.feeders, source: 'CECONY_EVM_Feeders_Prod' },
  { key: 'feeders33kv', label: 'High-voltage trunk lines (33 kV)', help: 'The bigger lines that feed the substations. For orientation only.', minZoom: MIN_ZOOM.feeders33kv, source: 'CECONY_33Kv_Prod' },
  { key: 'structures', label: 'Underground vaults (structures)', help: 'The rooms under manhole covers where cables join, each with its own room-left figure. 155,000 of them — only shown when zoomed in close.', minZoom: MIN_ZOOM.structures, source: 'CE_NwkHcv_StructureHCV_Prod' },
  { key: 'msplates', label: 'Underground map sheets (M&S plates)', help: 'Pages of Con Edison\'s underground atlas. In the dense "web" areas, room left is published per page.', source: 'CE_NwkHcv_MSPlateHCV_Prod' },
  { key: 'networks', label: 'Grid zones (networks)', help: 'Con Edison\'s 89 neighbourhood-sized grid zones. Some publish spare MW Con Edison will pay customers to free up (LSRV).', source: 'CECONY_NetworkLCSD_Prod' },
  { key: 'nws', label: 'Zones buying load relief (non-wires)', help: 'Grid zones where Con Edison is paying customers to use less at peak instead of building new equipment.', source: 'CE_NWS_Networks_Prod' },
  { key: 'dac', label: 'Disadvantaged communities (DAC)', help: 'Neighbourhoods New York State has flagged as Disadvantaged Communities under its climate law. Charging grants are larger here.', source: 'CECONY_Disadvantaged_Communities_Prod' },
  { key: 'tracts', label: 'Neighbourhood statistics (Census)', help: 'Census neighbourhoods (tracts). Pick what to colour them by in Filters: income, renters, car ownership and so on.', source: 'TIGERweb + Census Reporter (ACS)' },
  { key: 'buildings', label: 'Buildings', help: 'NYC buildings in 3-D, coloured by what they are used for (homes, shops, factories, parking). Shift-click one to put a site there.', minZoom: MIN_ZOOM.buildings, source: 'NYC Open Data 5zhs-2jue + 64uk-42ks' },
  { key: 'areaStress', label: 'Borough-wide growth heat map', help: 'When borough-wide growth is on: neighbourhoods shaded by how much new EV load lands there, and grid zones coloured by traffic light.', source: 'Simulator' },
];

const SITES_KEYS: Array<keyof LayerVisibility> = ['sites', 'transformers', 'feeders', 'structures', 'msplates', 'buildings', 'networks', 'dac', 'tracts', 'feeders33kv', 'nws'];
const OUTLOOK_KEYS: Array<keyof LayerVisibility> = ['areaStress', 'dac', 'tracts', 'nws', 'sites'];

export function LayersPanel({ mode }: { mode: 'sites' | 'outlook' }) {
  const layers = useStore((s) => s.layers);
  const setLayersRaw = useStore((s) => s.setLayers);
  const opacity = useStore((s) => s.layerOpacity);
  const setOpacity = useStore((s) => s.setLayerOpacity);
  const exclusive = useStore((s) => s.exclusiveLayers);
  const setExclusive = useStore((s) => s.setExclusiveLayers);
  const keys = mode === 'sites' ? SITES_KEYS : OUTLOOK_KEYS;
  // "One at a time": switching a layer on switches the other optional layers (everything but your sites) off
  const setLayers = (patch: Partial<LayerVisibility>) => {
    const [key, on] = Object.entries(patch)[0] as [keyof LayerVisibility, boolean];
    if (exclusive && on && key !== 'sites') {
      const off: Partial<LayerVisibility> = {};
      for (const k of keys) if (k !== 'sites' && k !== key) off[k] = false;
      setLayersRaw({ ...off, [key]: true });
    } else setLayersRaw(patch);
  };
  const zoom = useStore((s) => s.viewport.zoom);
  const live = useStore((s) => s.live);
  return (
    <div className="panel" id="tour-layers">
      <p className="muted" style={{ marginTop: 0 }}>
        {mode === 'sites' ? 'Equipment layers stream in as you zoom in.' : 'Grid zones are always outlined in Outlook.'} Zoom: {zoom.toFixed(1)}
      </p>
      <Check label="One layer at a time (less clutter)" checked={exclusive} onChange={setExclusive} help="When on, turning a layer on turns the others off, so you look at one thing at a time. Your sites always stay visible." />
      <div className="muted" style={{ fontSize: 11, margin: '2px 0 6px' }}>
        Tick a layer to show it; drag its slider to fade it.
      </div>
      {LAYER_DEFS.filter((d) => keys.includes(d.key)).map((d) => (
        <div key={d.key} className="layer-row">
          <Check
            label={
              <span>
                {d.label}
                {d.minZoom && zoom < d.minZoom && layers[d.key] && <span className="muted"> · zoom ≥ {d.minZoom}</span>}
              </span>
            }
            checked={layers[d.key]}
            onChange={(v) => setLayers({ [d.key]: v })}
            help={
              <span>
                {d.help}
                <br />
                <span className="muted">Source: {d.source}</span>
              </span>
            }
          />
          {live.loading[d.key] && <span className="muted">…</span>}
          {layers[d.key] && d.key !== 'sites' && (
            <input
              type="range"
              className="opacity"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity[d.key] ?? 1}
              onChange={(e) => setOpacity(d.key, +e.target.value)}
              title={`Strength: ${Math.round((opacity[d.key] ?? 1) * 100)}%`}
            />
          )}
        </div>
      ))}
      {mode === 'sites' && (
        <>
          <h3>
            Loaded right now <Help text="How many pieces of equipment and buildings are loaded for the area on screen." />
          </h3>
          <div className="muted" style={{ fontSize: 12 }}>
            Transformers {live.transformers.features.length.toLocaleString()} · Street-main segments {live.feeders.features.length.toLocaleString()} · Vaults {live.structures.features.length.toLocaleString()} · Buildings{' '}
            {live.buildings.features.length.toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}
