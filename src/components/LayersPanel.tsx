import { useStore } from '../state/store';
import { MIN_ZOOM } from '../config';
import { Check, Help } from './ui';
import type { LayerVisibility } from '../types';

const LAYER_DEFS: Array<{ key: keyof LayerVisibility; label: string; help: string; minZoom?: number; source: string }> = [
  { key: 'sites', label: 'Scenario sites & impact', help: 'Your charging sites, their search radius, and highlighted impacted assets.', source: 'Simulator' },
  { key: 'transformers', label: 'EV transformers (208 V / 460 V)', help: 'Con Edison EV hosting-capacity map: distribution transformers with available capacity range. 460 V units have a white ring.', minZoom: MIN_ZOOM.transformers, source: 'CECONY_EVM_Prod / _Winter_Prod' },
  { key: 'feeders', label: 'Primary feeders (EV headroom)', help: '3-phase primary feeders coloured by EV load headroom in MW (season follows Settings).', minZoom: MIN_ZOOM.feeders, source: 'CECONY_EVM_Feeders_Prod' },
  { key: 'feeders33kv', label: '33 kV sub-transmission feeders', help: 'Higher-voltage feeders supplying area substations.', minZoom: MIN_ZOOM.feeders33kv, source: 'CECONY_33Kv_Prod' },
  { key: 'structures', label: 'Network structures (kVA)', help: 'Manholes / vaults in secondary networks with hosting capacity in kVA. 155k points — only loads at high zoom.', minZoom: MIN_ZOOM.structures, source: 'CE_NwkHcv_StructureHCV_Prod' },
  { key: 'msplates', label: 'M&S plates (secondary network kVA)', help: 'Mains & Services plate polygons with hosting capacity in kVA for the low-voltage secondary grid.', source: 'CE_NwkHcv_MSPlateHCV_Prod' },
  { key: 'networks', label: 'Con Edison networks', help: 'The 89 distribution networks / load areas with LSRV (non-wires) capacity where published.', source: 'CECONY_NetworkLCSD_Prod' },
  { key: 'nws', label: 'Non-wires solution networks', help: 'Networks where Con Edison is procuring non-wires alternatives instead of traditional upgrades.', source: 'CE_NWS_Networks_Prod' },
  { key: 'dac', label: 'Disadvantaged communities', help: 'NY CLCPA Disadvantaged Community census tracts (Con Edison service territory).', source: 'CECONY_Disadvantaged_Communities_Prod' },
  { key: 'tracts', label: 'Census tracts (demographics)', help: 'ACS 5-year tract polygons. Choose a variable in Filters to colour them.', source: 'TIGERweb + Census Reporter (ACS)' },
  { key: 'buildings', label: 'Buildings (MapPLUTO + footprints)', help: 'NYC building footprints extruded by height and coloured by land use, joined to MapPLUTO lot attributes. Shift-click to add a site.', minZoom: MIN_ZOOM.buildings, source: 'NYC Open Data 5zhs-2jue + 64uk-42ks' },
  { key: 'areaStress', label: 'Area-scenario stress overlay', help: 'When the area scenario is on: tracts shaded by added EV kW/km² and networks by status.', source: 'Simulator' },
];

export function LayersPanel() {
  const layers = useStore((s) => s.layers);
  const setLayers = useStore((s) => s.setLayers);
  const zoom = useStore((s) => s.viewport.zoom);
  const meta = useStore((s) => s.staticData.meta);
  const live = useStore((s) => s.live);
  return (
    <div className="panel" id="tour-layers">
      <h2>Layers</h2>
      <p className="muted">Heavy layers load live from Con Edison / NYC Open Data when you zoom in. Current zoom: {zoom.toFixed(1)}</p>
      {LAYER_DEFS.map((d) => (
        <div key={d.key} className="row between" style={{ padding: '2px 0' }}>
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
        </div>
      ))}
      <h3>
        Live feature counts <Help text="Features currently loaded in the viewport (deduplicated)." />
      </h3>
      <div className="muted" style={{ fontSize: 12 }}>
        Transformers {live.transformers.features.length.toLocaleString()} · Feeder segments {live.feeders.features.length.toLocaleString()} · Structures {live.structures.features.length.toLocaleString()} · Buildings{' '}
        {live.buildings.features.length.toLocaleString()}
      </div>
      {meta && (
        <>
          <h3>Snapshot data</h3>
          <div className="muted" style={{ fontSize: 12 }}>
            Networks, plates, DAC and tract snapshots generated {new Date(meta.generated).toLocaleDateString()}. Refresh with <code>npm run snapshots</code>.
          </div>
        </>
      )}
    </div>
  );
}
