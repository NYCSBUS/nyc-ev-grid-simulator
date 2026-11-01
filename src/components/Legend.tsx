import { useState } from 'react';
import { useStore } from '../state/store';
import { ACS_VARS } from './MapView';
import type { Thresholds } from '../types';

export function Legend({ thresholds, areaActive }: { thresholds: Thresholds; areaActive: boolean }) {
  const layers = useStore((s) => s.layers);
  const filters = useStore((s) => s.filters);
  const [open, setOpen] = useState(true);
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
        <button className="btn small" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      {layers.sites && (
        <>
          <div className="item">
            <span className="sw dot" style={{ background: '#22c55e' }} /> Green: uses &lt; {Math.round(thresholds.warn * 100)}% of room left
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#f59e0b' }} /> Amber: {Math.round(thresholds.warn * 100)}–{Math.round(thresholds.crit * 100)}%
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#ef4444' }} /> Red: ≥ {Math.round(thresholds.crit * 100)}% (over the line)
          </div>
        </>
      )}
      {layers.transformers && (
        <>
          <h4 style={{ marginTop: 8 }}>Transformers — room left</h4>
          <div className="item">
            <span className="sw dot" style={{ background: '#22c55e' }} /> &gt; 1000 kVA (lots)
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#84cc16' }} /> 500–1000 kVA
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#f59e0b' }} /> 200–499 kVA
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#ef4444' }} /> &lt; 200 kVA (nearly full)
          </div>
          <div className="item">
            <span className="sw dot" style={{ background: '#64748b', border: '2px solid #fff' }} /> white ring = 460 V (fast-charger type)
          </div>
        </>
      )}
      {layers.feeders && (
        <>
          <h4 style={{ marginTop: 8 }}>Street mains — room left for EVs</h4>
          <div className="item">
            <span className="sw line" style={{ background: '#22c55e' }} /> ≥ 5 MW
          </div>
          <div className="item">
            <span className="sw line" style={{ background: '#84cc16' }} /> 2–5 MW
          </div>
          <div className="item">
            <span className="sw line" style={{ background: '#f59e0b' }} /> 0.5–2 MW
          </div>
          <div className="item">
            <span className="sw line" style={{ background: '#ef4444' }} /> &lt; 0.5 MW
          </div>
        </>
      )}
      {layers.msplates && (
        <>
          <h4 style={{ marginTop: 8 }}>Underground map sheets — room left (kVA)</h4>
          <div className="ramp" style={{ background: 'linear-gradient(90deg,#ef4444,#f59e0b,#84cc16,#22c55e)' }} />
          <div className="row between muted">
            <span>0</span>
            <span>5,000+</span>
          </div>
        </>
      )}
      {layers.buildings && (
        <>
          <h4 style={{ marginTop: 8 }}>Buildings — what they are used for</h4>
          <div className="item">
            <span className="sw" style={{ background: '#fde68a' }} /> Houses (1–2 family)
          </div>
          <div className="item">
            <span className="sw" style={{ background: '#f59e0b' }} /> Apartment buildings
          </div>
          <div className="item">
            <span className="sw" style={{ background: '#f87171' }} /> Shops & offices
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
          <div className="ramp" style={{ background: 'linear-gradient(90deg,#1d4ed8,#0ea5e9,#facc15,#f97316,#ef4444)' }} />
          <div className="row between muted">
            <span>low</span>
            <span>high (quintiles)</span>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Grid-zone fill = traffic light vs published capacity
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
