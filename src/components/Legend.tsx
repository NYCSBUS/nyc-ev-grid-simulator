import { useState } from 'react';
import { useStore } from '../state/store';
import { ACS_VARS, GROWTH_RAMP, ROOM_COLORS } from './MapView';
import type { LayerVisibility, Thresholds } from '../types';
import { MIN_ZOOM } from '../config';

export function Legend({ thresholds, areaActive, layers: raw, zoom }: { thresholds: Thresholds; areaActive: boolean; layers: LayerVisibility; zoom: number }) {
  // only describe what is actually drawn at this zoom
  const layers: LayerVisibility = { ...raw, transformers: raw.transformers && zoom >= MIN_ZOOM.transformers, feeders: raw.feeders && zoom >= MIN_ZOOM.feeders, buildings: raw.buildings && zoom >= MIN_ZOOM.buildings };
  const filters = useStore((s) => s.filters);
  // on a phone the legend would cover the map, so it starts folded away
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  const anyAsset = layers.transformers || layers.feeders || layers.msplates || layers.buildings || layers.dac || layers.networks;
  if (!anyAsset && !areaActive && !layers.sites) return null;
  if (!open)
    return (
      <div className="map-overlay legend" style={{ padding: 6 }}>
        <button className="btn small" onClick={() => setOpen(true)}>
          Legend
        </button>
      </div>
    );
  return (
    <div className="map-overlay legend" id="tour-legend">
      <div className="row between">
        <h4>Legend</h4>
        <button className="btn small" onClick={() => setOpen(false)} aria-label="Hide legend">
          ×
        </button>
      </div>
      {layers.sites && (
        <>
          <h4>Your site’s effect (traffic lights)</h4>
          <div className="item">
            <span className="sw dot" style={{ background: '#22c55e' }} /> Fits — uses under {Math.round(thresholds.warn * 100)}% of the room left
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#f59e0b' }} /> Tight — {Math.round(thresholds.warn * 100)}–{Math.round(thresholds.crit * 100)}%
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#ef4444' }} /> Doesn’t fit — {Math.round(thresholds.crit * 100)}% or more
          </div>
        </>
      )}
      {(layers.transformers || layers.feeders || layers.msplates) && (
        <>
          <h4 style={{ marginTop: 8 }}>Room left on the grid today</h4>
          <div className="ramp" style={{ background: `linear-gradient(90deg,${ROOM_COLORS.join(',')})` }} />
          <div className="row between muted">
            <span>little</span>
            <span>lots</span>
          </div>
        </>
      )}
      {layers.transformers && (
        <div className="item">
          <span className="sw dot" style={{ background: ROOM_COLORS[0] }} />
          <span className="sw dot" style={{ background: ROOM_COLORS[1] }} />
          <span className="sw dot" style={{ background: ROOM_COLORS[2] }} />
          <span className="sw dot" style={{ background: ROOM_COLORS[3] }} /> Transformers, under 200 → over 1,000 kVA
        </div>
      )}
      {layers.transformers && (
        <div className="item">
          <span className="sw dot" style={{ background: ROOM_COLORS[2], border: '2px solid #fff' }} /> white ring = 460 V (fast-charger type)
        </div>
      )}
      {layers.feeders && (
        <div className="item">
          <span className="sw line" style={{ background: ROOM_COLORS[0] }} />
          <span className="sw line" style={{ background: ROOM_COLORS[3] }} /> Street mains, under 0.5 → over 5 MW
        </div>
      )}
      {layers.msplates && (
        <div className="item">
          <span className="sw" style={{ background: ROOM_COLORS[0] }} />
          <span className="sw" style={{ background: ROOM_COLORS[3] }} /> Map sheets, 0 → over 5,000 kVA
        </div>
      )}
      {layers.buildings && (
        <>
          <h4 style={{ marginTop: 8 }}>Buildings — what they are used for</h4>
          <div className="item">
            <span className="sw" style={{ background: '#e9dcb8' }} /> Houses (1–2 family)
          </div>
          <div className="item">
            <span className="sw" style={{ background: '#c8a27a' }} /> Apartment buildings
          </div>
          <div className="item">
            <span className="sw" style={{ background: '#d98fb0' }} /> Shops & offices
          </div>
          <div className="item">
            <span className="sw" style={{ background: '#a78bfa' }} /> Industrial
          </div>
          <div className="item">
            <span className="sw" style={{ background: '#e879f9' }} /> Parking
          </div>
        </>
      )}
      {layers.dac && (
        <div className="item" style={{ marginTop: 6 }}>
          <span className="sw" style={{ background: 'rgba(249,115,22,.4)', border: '1px dashed #f97316' }} /> Disadvantaged community
        </div>
      )}
      {layers.networks && (
        <div className="item">
          <span className="sw" style={{ background: 'rgba(0,114,206,.3)', border: '1px solid #3b82f6' }} /> Con Ed grid zone
        </div>
      )}
      {areaActive && (
        <>
          <h4 style={{ marginTop: 8 }}>Borough-wide growth: extra rush-hour kW per km²</h4>
          <div className="ramp" style={{ background: `linear-gradient(90deg,${GROWTH_RAMP.join(',')})` }} />
          <div className="row between muted">
            <span>low</span>
            <span>high (quintiles)</span>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Grid-zone outline and fill = traffic light: green fits, amber tight, red over the published capacity
          </div>
        </>
      )}
      {!areaActive && layers.tracts && filters.acsVariable !== 'none' && (
        <>
          <h4 style={{ marginTop: 8 }}>{ACS_VARS[filters.acsVariable].label}</h4>
          <div className="ramp" style={{ background: `linear-gradient(90deg,${ACS_VARS[filters.acsVariable].ramp.join(',')})` }} />
          <div className="row between muted">
            <span>low</span>
            <span>high (quintiles)</span>
          </div>
        </>
      )}
    </div>
  );
}
