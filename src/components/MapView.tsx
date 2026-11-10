import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import { MAPBOX_TOKEN, MIN_ZOOM, NYC_BOUNDS } from '../config';
import { useStore } from '../state/store';
import { useAreaResult, useAssessments } from '../state/hooks';
import { newSite } from '../state/defaults';
import { reverseGeocode } from '../lib/geocode';
import { CHARGERS } from '../sim/profiles';
import { nameplateKw } from '../sim/model';
import { STATUS_COLOR, fmt } from './ui';
import type { AcsVariable, FC, Site } from '../types';
import type { Status } from '../types';
import { Legend } from './Legend';
import { verdictFor } from '../sim/verdict';
import { LayersPanel } from './LayersPanel';
import { FiltersPanel } from './FiltersPanel';
import type { LayerVisibility } from '../types';

mapboxgl.accessToken = MAPBOX_TOKEN;

const EMPTY: FC = { type: 'FeatureCollection', features: [] };

export const ACS_VARS: Record<AcsVariable, { label: string; fmt: (v: number) => string; ramp: string[]; help: string }> = {
  none: { label: 'None', fmt: String, ramp: [], help: '' },
  density: { label: 'Population density', fmt: (v) => `${fmt.int(v)} /km²`, ramp: ['#1e293b', '#0ea5e9', '#f0abfc'], help: 'How crowded the neighbourhood is: people per square kilometre (Census ACS).' },
  mhi: { label: 'Median household income', fmt: (v) => `$${fmt.int(v)}`, ramp: ['#1e293b', '#0d9488', '#99f6e4'], help: 'Typical household income in the neighbourhood (Census ACS).' },
  renter_share: { label: 'Renters', fmt: (v) => fmt.pct(v), ramp: ['#1e293b', '#a855f7'], help: 'Share of homes that are rented. Renters rarely have a driveway or garage to charge in, so they depend on public or building chargers.' },
  veh_per_hh: { label: 'Vehicles per household', fmt: (v) => v.toFixed(2), ramp: ['#1e293b', '#fb923c'], help: 'Average cars per household. More cars today means more EVs later in the borough-wide model.' },
  no_veh_share: { label: 'Households with no car', fmt: (v) => fmt.pct(v), ramp: ['#1e293b', '#38bdf8'], help: 'Share of households that own no car at all. High in transit-rich, apartment-heavy areas — a sign that shared chargers matter more than home ones.' },
  mf_share: { label: 'Apartment-building share', fmt: (v) => fmt.pct(v), ramp: ['#1e293b', '#e879f9'], help: 'Share of homes that are in apartment buildings of 5 or more units — where garage or curbside charging is the only option.' },
  dac: { label: 'Disadvantaged community', fmt: (v) => (v ? 'DAC' : 'Not DAC'), ramp: ['#1e293b', '#f97316'], help: 'Neighbourhoods New York State has flagged as Disadvantaged Communities — they qualify for larger charging grants.' },
};

function quantiles(values: number[], n = 5) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  return Array.from({ length: n + 1 }, (_, i) => v[Math.min(v.length - 1, Math.floor((i / n) * v.length))]);
}

function rampExpr(prop: string, stops: number[], colors: string[]): any {
  const out: any[] = ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', prop]], -1]];
  // fallthrough for null (-1)
  out.push(-1, 'rgba(0,0,0,0)');
  const uniq: number[] = [];
  stops.forEach((s) => {
    if (!uniq.length || s > uniq[uniq.length - 1]) uniq.push(s);
  });
  uniq.forEach((s, i) => {
    const t = uniq.length === 1 ? 0 : i / (uniq.length - 1);
    const ci = Math.min(colors.length - 1, Math.round(t * (colors.length - 1)));
    out.push(Math.max(s, uniq[0] === -1 ? 0 : s), colors[ci]);
  });
  return out;
}

/**
 * "Room left" on a piece of equipment, least → most. A cool single-direction scale (dull violet → pale cyan) on purpose:
 * green / amber / red is reserved for the traffic lights — what *your site* does to that equipment.
 */
export const ROOM_COLORS = ['#7c5cc4', '#6f8cf0', '#38bdf8', '#b6f3ff'] as const;
const ROOM_UNKNOWN = '#64748b';
/** Borough-wide growth per neighbourhood, low → high. Purple, so it cannot be mistaken for a traffic light. */
export const GROWTH_RAMP = ['#3b1d6e', '#6d28d9', '#a855f7', '#e879f9', '#fde7ff'] as const;

const XFMR_COLOR: any = ['match', ['get', 'CapacityRange'], '< 200 kVA', ROOM_COLORS[0], '200 kVA to 499 kVA', ROOM_COLORS[1], '500 kVA to 1000 kVA', ROOM_COLORS[2], '> 1000 kVA', ROOM_COLORS[3], ROOM_UNKNOWN];

const roomStep = (prop: string, stops: [number, number, number], toNumber = false): any => [
  'step',
  ['coalesce', toNumber ? ['to-number', ['get', prop]] : ['get', prop], -1],
  ROOM_UNKNOWN,
  0,
  ROOM_COLORS[0],
  stops[0],
  ROOM_COLORS[1],
  stops[1],
  ROOM_COLORS[2],
  stops[2],
  ROOM_COLORS[3],
];
const FEEDER_COLOR: any = roomStep('EV_HEADROOM', [0.5, 2, 5], true);

const LANDUSE_COLOR: any = [
  'match',
  ['get', 'landuse'],
  // earthy tones for homes, rose for shops: amber / red / green are left to the traffic lights
  '01',
  '#e9dcb8',
  '02',
  '#d9bf8f',
  '03',
  '#c8a27a',
  '04',
  '#b98a8a',
  '05',
  '#d98fb0',
  '06',
  '#a78bfa',
  '07',
  '#94a3b8',
  '08',
  '#60a5fa',
  '09',
  '#86b89a',
  '10',
  '#e879f9',
  '11',
  '#cbd5e1',
  '#475569',
];

function popupHtml(title: string, rows: Array<[string, unknown]>, hint?: string) {
  const body = rows
    .filter(([, v]) => v != null && v !== '' && v !== 'null')
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');
  return `<div class="popup"><h4>${title}</h4><table>${body}</table>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

const dateStr = (ms: unknown) => (typeof ms === 'number' ? new Date(ms).toLocaleDateString() : '');

/** Run `cb` once a GeoJSON source has finished loading (feature-state needs loaded tiles). */
function whenSourceLoaded(map: mapboxgl.Map, sourceId: string, cb: () => void): () => void {
  let cancelled = false;
  const tryRun = () => {
    if (cancelled) return true;
    const src = map.getSource(sourceId);
    if (src && map.isSourceLoaded(sourceId)) {
      try {
        cb();
      } catch (e) {
        console.warn('feature-state update failed', e);
      }
      return true;
    }
    return false;
  };
  if (tryRun()) return () => {};
  const handler = (e: mapboxgl.MapSourceDataEvent) => {
    if (e.sourceId !== sourceId) return;
    if (tryRun()) map.off('sourcedata', handler);
  };
  map.on('sourcedata', handler);
  return () => {
    cancelled = true;
    map.off('sourcedata', handler);
  };
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loaded = useRef(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const rawLayers = useStore((s) => s.layers);
  const layerOpacity = useStore((s) => s.layerOpacity);
  const filters = useStore((s) => s.filters);
  const mapMode = useStore((s) => s.mapMode);
  const drawer = useStore((s) => s.drawer);
  const setDrawer = useStore((s) => s.setDrawer);
  const selectedSiteIdForHint = useStore((s) => s.selectedSiteId);
  const mode: 'sites' | 'outlook' = mapMode;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Each map mode shows only what it needs: Sites = equipment around sites; Outlook = heat map + grid zones.
  const layers = useMemo<LayerVisibility>(
    () =>
      mode === 'outlook'
        ? { ...rawLayers, transformers: false, feeders: false, structures: false, buildings: false, msplates: false, feeders33kv: false, networks: true, areaStress: true }
        : { ...rawLayers, areaStress: false },
    [rawLayers, mode],
  );
  const staticData = useStore((s) => s.staticData);
  const live = useStore((s) => s.live);
  const sites = useStore((s) => s.scenario.sites);
  const selectedSiteId = useStore((s) => s.selectedSiteId);
  const placing = useStore((s) => s.placing);
  const flyTo = useStore((s) => s.flyTo);
  const setViewport = useStore((s) => s.setViewport);
  const addSite = useStore((s) => s.addSite);
  const updateSite = useStore((s) => s.updateSite);
  const selectSite = useStore((s) => s.selectSite);
  const setPlacing = useStore((s) => s.setPlacing);
  const setLayers = useStore((s) => s.setLayers);
  const thresholds = useStore((s) => s.scenario.settings.thresholds);
  const assessments = useAssessments();
  const area = useAreaResult();
  // popups are built inside a long-lived click handler, so read the latest outlook result through a ref
  const areaRef = useRef(area);
  areaRef.current = area;
  const areaBoroughs = useStore((s) => s.scenario.area.boroughs);
  const areaDacOnly = useStore((s) => s.scenario.area.dacOnly);
  /** A site pin being dragged: drawn at the pointer until it is dropped. */
  const [drag, setDrag] = useState<{ id: string; lng: number; lat: number } | null>(null);

  const placingRef = useRef(placing);
  placingRef.current = placing;
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const addLayersRef = useRef<() => void>(() => {});
  const [styleNonce, setStyleNonce] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  // ---------- init ----------
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    if (!mapboxgl.supported?.()) {
      setWebglError('This browser does not support WebGL, which Mapbox GL needs. Try Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
      return;
    }
    let map: mapboxgl.Map;
    try {
      map = createMap();
    } catch (e: any) {
      setWebglError(`Could not start the map: ${e?.message ?? e}`);
      return;
    }
    function createMap() {
      return new mapboxgl.Map({
      container: container.current!,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: useStore.getState().viewport.center,
      zoom: useStore.getState().viewport.zoom,
      maxBounds: [
        [NYC_BOUNDS[0][0] - 0.5, NYC_BOUNDS[0][1] - 0.3],
        [NYC_BOUNDS[1][0] + 0.5, NYC_BOUNDS[1][1] + 0.3],
      ],
      attributionControl: true,
      });
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const addLayers = () => {
      const src = (id: string, promoteId?: string) => map.addSource(id, { type: 'geojson', data: EMPTY, ...(promoteId ? { promoteId } : {}) });
      src('networks', 'NETWORK');
      src('msplates');
      src('dac');
      src('nws');
      src('tracts', 'GEOID');
      src('transformers');
      src('feeders');
      src('structures');
      src('buildings');
      src('feeders33kv');
      src('sites');
      src('site-radius');
      src('impact');

      // base polygons
      map.addLayer({ id: 'tracts-fill', type: 'fill', source: 'tracts', paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.65 } });
      map.addLayer({ id: 'tracts-line', type: 'line', source: 'tracts', paint: { 'line-color': '#334155', 'line-width': 0.4 } });
      map.addLayer({
        id: 'networks-fill',
        type: 'fill',
        source: 'networks',
        paint: {
          'fill-color': [
            'case',
            ['==', ['feature-state', 'status'], 'crit'],
            STATUS_COLOR.crit,
            ['==', ['feature-state', 'status'], 'warn'],
            STATUS_COLOR.warn,
            ['==', ['feature-state', 'status'], 'ok'],
            STATUS_COLOR.ok,
            '#0072ce',
          ],
          'fill-opacity': ['case', ['to-boolean', ['feature-state', 'status']], 0.18, 0.08],
        },
      });
      map.addLayer({
        id: 'networks-line',
        type: 'line',
        source: 'networks',
        paint: {
          'line-color': [
            'case',
            ['==', ['feature-state', 'status'], 'crit'],
            STATUS_COLOR.crit,
            ['==', ['feature-state', 'status'], 'warn'],
            STATUS_COLOR.warn,
            ['==', ['feature-state', 'status'], 'ok'],
            STATUS_COLOR.ok,
            '#3b82f6',
          ],
          'line-width': ['case', ['to-boolean', ['feature-state', 'status']], 2.5, 1.2],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'networks-label',
        type: 'symbol',
        source: 'networks',
        minzoom: 11,
        layout: { 'text-field': ['get', 'NETWORK'], 'text-size': 11, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'] },
        paint: { 'text-color': '#93c5fd', 'text-halo-color': '#0f1419', 'text-halo-width': 1 },
      });
      map.addLayer({
        id: 'msplates-fill',
        type: 'fill',
        source: 'msplates',
        paint: {
          'fill-color': roomStep('KVA', [500, 2000, 5000]),
          'fill-opacity': 0.35,
        },
      });
      map.addLayer({ id: 'msplates-line', type: 'line', source: 'msplates', paint: { 'line-color': '#e2e8f0', 'line-width': 0.5, 'line-opacity': 0.5 } });
      map.addLayer({ id: 'dac-fill', type: 'fill', source: 'dac', paint: { 'fill-color': '#f97316', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'dac-line', type: 'line', source: 'dac', paint: { 'line-color': '#f97316', 'line-width': 0.8, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'nws-line', type: 'line', source: 'nws', paint: { 'line-color': '#e879f9', 'line-width': 2, 'line-dasharray': [3, 2] } });

      // buildings
      map.addLayer({
        id: 'buildings-fill',
        type: 'fill-extrusion',
        source: 'buildings',
        paint: {
          'fill-extrusion-color': LANDUSE_COLOR,
          'fill-extrusion-height': ['*', ['coalesce', ['get', 'height_ft'], 20], 0.3048],
          'fill-extrusion-opacity': 0.75,
        },
      });

      // lines
      map.addLayer({ id: 'feeders33kv-line', type: 'line', source: 'feeders33kv', paint: { 'line-color': '#c084fc', 'line-width': 2.5, 'line-opacity': 0.8 } });
      map.addLayer({
        id: 'feeders-line',
        type: 'line',
        source: 'feeders',
        paint: { 'line-color': FEEDER_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.2, 17, 3.5], 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'structures-circle',
        type: 'circle',
        source: 'structures',
        paint: {
          'circle-radius': 3.5,
          'circle-color': roomStep('KVA', [100, 300, 600]),
          'circle-stroke-color': '#0f1419',
          'circle-stroke-width': 0.8,
        },
      });
      map.addLayer({
        id: 'transformers-circle',
        type: 'circle',
        source: 'transformers',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 17, 8],
          'circle-color': XFMR_COLOR,
          'circle-stroke-color': ['case', ['>=', ['index-of', '460', ['to-string', ['get', 'Voltage']]], 0], '#ffffff', '#0f1419'],
          'circle-stroke-width': ['case', ['>=', ['index-of', '460', ['to-string', ['get', 'Voltage']]], 0], 2, 1],
        },
      });

      // impact highlights
      map.addLayer({
        id: 'impact-line',
        type: 'line',
        source: 'impact',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'kind'], 'flow']],
        paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': 0.55, 'line-blur': 1 },
      });
      // thin dashed "where the load goes" lines from the site to each piece of equipment it draws from
      map.addLayer({
        id: 'impact-flow',
        type: 'line',
        source: 'impact',
        filter: ['==', ['get', 'kind'], 'flow'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'impact-fill',
        type: 'line',
        source: 'impact',
        filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'impact-point',
        type: 'circle',
        source: 'impact',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 },
      });
      // "% of room used" tag on each impacted piece of equipment
      map.addLayer({
        id: 'impact-label',
        type: 'symbol',
        source: 'impact',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'label']],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.7],
          'text-anchor': 'bottom',
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#0f1419', 'text-halo-width': 1.6 },
      });

      // sites
      map.addLayer({
        id: 'site-radius-fill',
        type: 'fill',
        source: 'site-radius',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'selected'], 0.12, 0.06] },
      });
      map.addLayer({
        id: 'site-radius-line',
        type: 'line',
        source: 'site-radius',
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 2, 1], 'line-dasharray': [3, 2] },
      });
      map.addLayer({
        id: 'sites-circle',
        type: 'circle',
        source: 'sites',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 13, 10],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 1.5],
        },
      });
      map.addLayer({
        id: 'sites-label',
        type: 'symbol',
        source: 'sites',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#fff', 'text-halo-color': '#0f1419', 'text-halo-width': 1.5 },
      });
      map.addLayer({
        id: 'sites-icon',
        type: 'symbol',
        source: 'sites',
        layout: { 'text-field': '⚡', 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#0f1419' },
      });

      loaded.current = true;
      setStyleNonce((n) => n + 1);
    };
    addLayersRef.current = addLayers;

    map.on('load', addLayers);
    map.on('moveend', () => setViewport({ center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() }));

    // ---------- interaction ----------
    const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' });
    popupRef.current = popup;
    const interactive = ['transformers-circle', 'feeders-line', 'structures-circle', 'buildings-fill', 'msplates-fill', 'networks-fill', 'tracts-fill', 'sites-circle', 'feeders33kv-line', 'dac-fill'];
    for (const id of interactive) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = placingRef.current ? 'crosshair' : 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = placingRef.current ? 'crosshair' : ''));
    }

    // ---------- drag a site pin to move it ----------
    // The pin follows the pointer; the site itself moves once, on drop, so the grid is re-checked once.
    let dragging: { id: string; moved: boolean } | null = null;
    const onDragMove = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      if (!dragging) return;
      dragging.moved = true;
      setDrag({ id: dragging.id, lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    const stopDrag = () => {
      map.off('mousemove', onDragMove);
      map.off('touchmove', onDragMove);
      map.getCanvas().style.cursor = '';
      const d = dragging;
      dragging = null;
      setDrag(null);
      return d;
    };
    const onDragEnd = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      const d = stopDrag();
      if (!d?.moved) return;
      const { lng, lat } = e.lngLat;
      useStore.getState().moveSite(d.id, lng, lat);
      reverseGeocode(lng, lat).then((a) => a && useStore.getState().updateSite(d.id, { address: a }));
    };
    const onDragStart = (e: (mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) & { features?: mapboxgl.GeoJSONFeature[] }) => {
      if (placingRef.current || modeRef.current !== 'sites') return;
      if ('touches' in e.originalEvent && e.originalEvent.touches.length > 1) return; // leave pinch-zoom alone
      const id = e.features?.[0]?.properties?.id;
      if (!id) return;
      e.preventDefault(); // keep the map from panning
      dragging = { id: String(id), moved: false };
      map.getCanvas().style.cursor = 'grabbing';
      if (e.type === 'touchstart') {
        map.on('touchmove', onDragMove);
        map.once('touchend', onDragEnd);
      } else {
        map.on('mousemove', onDragMove);
        map.once('mouseup', onDragEnd);
        // released outside the map: put the pin back
        window.addEventListener('mouseup', () => dragging && stopDrag(), { once: true });
      }
    };
    map.on('mousedown', 'sites-circle', onDragStart);
    map.on('touchstart', 'sites-circle', onDragStart);
    map.on('mouseenter', 'sites-circle', () => {
      if (!placingRef.current && !dragging && modeRef.current === 'sites') map.getCanvas().style.cursor = 'grab';
    });

    map.on('click', async (e) => {
      const st = useStore.getState();
      if (placingRef.current) {
        const site = newSite(e.lngLat.lng, e.lngLat.lat, { name: `Site ${sitesRef.current.length + 1}` });
        // try to attach building info
        const bld = map.queryRenderedFeatures(e.point, { layers: ['buildings-fill'] })[0];
        if (bld?.properties?.address) {
          site.address = `${bld.properties.address}${bld.properties.zipcode ? ', ' + bld.properties.zipcode : ''}`;
          site.bbl = String(bld.properties.bbl ?? '');
          site.name = String(bld.properties.address);
        }
        addSite(site);
        if (!site.address) reverseGeocode(site.lng, site.lat).then((a) => a && updateSite(site.id, { address: a, name: a.split(',')[0] }));
        return;
      }
      let feats = map.queryRenderedFeatures(e.point, { layers: interactive.filter((l) => map.getLayer(l)) });
      if (!feats.length) {
        popup.remove();
        return;
      }
      // In Outlook the grid-zone fill is drawn on top of the neighbourhoods; the user is usually after the neighbourhood.
      if (modeRef.current === 'outlook') {
        const prio = ['sites-circle', 'tracts-fill', 'networks-fill', 'dac-fill'];
        const rank = (id: string) => { const i = prio.indexOf(id); return i < 0 ? prio.length : i; };
        feats = feats.slice().sort((a, b) => rank(a.layer?.id ?? '') - rank(b.layer?.id ?? ''));
      }
      const f = feats[0];
      const p = f.properties ?? {};
      const layerId = f.layer?.id ?? '';
      let html = '';
      switch (layerId) {
        case 'sites-circle':
          st.selectSite(String(p.id));
          st.setTab('sites');
          return;
        case 'transformers-circle':
          html = popupHtml(`Transformer (tap) ${p.Transformer ?? ''}`, [
            ['Voltage', `${p.Voltage} V`],
            ['Room left', p.CapacityRange],
            ['Map sheet', p.MSPlate_1],
            ['Refreshed', dateStr(p.RefreshDate)],
          ], 'Con Edison publishes room left as a band, not a number. Settings decides the single value used for each band.');
          break;
        case 'feeders-line':
          html = popupHtml(`Street main (feeder) ${p.FEEDER_ID}`, [
            ['Substation', p.SUBSTATION],
            ['Voltage', `${p.VOLTAGE_KV} kV`],
            ['Room left for EVs', p.EV_HEADROOM != null ? `${(+p.EV_HEADROOM).toFixed(2)} MW` : '—'],
            ['Room left for all electrification', p.ELEC_HEADROOM != null ? `${(+p.ELEC_HEADROOM).toFixed(2)} MW` : '—'],
            ['Transformers on this main', p.TOTAL_XFMR_CAPACITY != null ? `${p.TOTAL_XFMR_CAPACITY} MVA` : '—'],
            ['Substation peak', p.SUBST_PEAK != null ? `${p.SUBST_PEAK} MW` : '—'],
            ['Notes', p.NOTES !== 'NONE' ? p.NOTES : null],
            ['Updated', dateStr(p.UPDATED_DATE)],
          ]);
          break;
        case 'feeders33kv-line':
          html = popupHtml('High-voltage trunk line (33 kV)', Object.entries(p).slice(0, 8) as any);
          break;
        case 'structures-circle':
          html = popupHtml(`Underground vault ${p.STRUCT_NUMBER}`, [
            ['Grid zone', p.NETWORK_NAME],
            ['Division', p.DIV_NAME],
            ['Room left', p.KVA != null ? `${(+p.KVA).toFixed(0)} kVA` : '—'],
            ['Updated', dateStr(p.UPDATED_DATE)],
          ]);
          break;
        case 'buildings-fill':
          html = popupHtml(p.address ?? 'Building', [
            ['BBL', p.bbl],
            ['Land use', p.landuse_name],
            ['Building class', p.bldgclass],
            ['Floors', p.floors],
            ['Residential units', p.unitsres],
            ['Total units', p.unitstotal],
            ['Building area', p.bldgarea ? `${fmt.int(p.bldgarea)} ft²` : null],
            ['Garage area', p.garagearea ? `${fmt.int(p.garagearea)} ft²` : null],
            ['Zoning', p.zoning],
            ['Built', p.built],
            ['Owner', p.owner],
            ['Height', p.height_ft ? `${p.height_ft} ft` : null],
          ], 'Shift+click a building to add a site there.');
          break;
        case 'msplates-fill':
          html = popupHtml(`Underground map sheet ${p.MSPLATEID}`, [
            ['Borough', p.BORO_NAME],
            ['Room left', p.KVA != null ? `${(+p.KVA).toFixed(0)} kVA` : '—'],
            ['Notes', p.NOTES],
            ['Updated', dateStr(p.UPDATED_DATE)],
          ]);
          break;
        case 'networks-fill': {
          const ns = areaRef.current?.networkStats.find((n) => n.network === p.NETWORK);
          html = popupHtml(`${p.NETWORK} grid zone`, [
            ['Borough', p.BOROUGH],
            ['Published capacity', p.CapacityRange ? `${p.CapacityRange} MW` : '—'],
            ['Load-relief program (LSRV)', p.LSRV_Status],
            ['Relief Con Ed is buying', p.CapacityMW ? `${p.CapacityMW} MW` : '—'],
            ['Already committed', p.SubscribedMW ? `${p.SubscribedMW} MW` : '—'],
            ['Your scenario adds', ns ? `${ns.addedMw.toFixed(2)} MW (${fmt.int(ns.evs)} EVs) · ${fmt.fill(ns.ratio)} of the mid-point` : null],
            ['Map-sheet room, total', ns?.plateHeadroomMw != null ? `${ns.plateHeadroomMw.toFixed(1)} MW` : null],
            ['Notes', p.Notes],
          ]);
          break;
        }
        case 'tracts-fill': {
          const ts = areaRef.current?.tractStats.get(String(p.GEOID));
          html = popupHtml(`Neighbourhood (${String(p.name).replace(/^Census Tract/, 'Census tract')})`, [
            ['GEOID', p.GEOID],
            ['Population', fmt.int(p.pop)],
            ['Households', fmt.int(p.hh)],
            ['Density', p.density ? `${fmt.int(p.density)} /km²` : null],
            ['Typical household income', p.mhi ? `$${fmt.int(p.mhi)}` : null],
            ['Renters', fmt.pct(p.renter_share)],
            ['Cars per household', p.veh_per_hh],
            ['Households with no car', fmt.pct(p.no_veh_share)],
            ['Homes in apartment buildings', fmt.pct(p.mf_share)],
            ['Disadvantaged community', p.dac ? 'Yes' : 'No'],
            ['EVs in your scenario', ts ? fmt.int(ts.evs) : null],
            ['Extra rush-hour load', ts ? fmt.kw(ts.addedKw) : null],
          ]);
          break;
        }
        case 'dac-fill':
          html = popupHtml('Disadvantaged community', [['GEOID', p.GEOID]]);
          break;
      }
      if (html) popup.setLngLat(e.lngLat).setHTML(html).addTo(map);

      // shift-click on building adds a site
      if (e.originalEvent.shiftKey && layerId === 'buildings-fill') {
        const site = newSite(e.lngLat.lng, e.lngLat.lat, {
          name: String(p.address ?? 'Building site'),
          address: `${p.address ?? ''}${p.zipcode ? ', ' + p.zipcode : ''}`,
          bbl: String(p.bbl ?? ''),
        });
        addSite(site);
        popup.remove();
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = () => loaded.current && mapRef.current;
  const setData = (id: string, data: FC | undefined) => {
    const map = mapRef.current;
    if (!ready() || !map) return;
    const s = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
    s?.setData((data ?? EMPTY) as any);
  };

  // ---------- data pushes (re-run after any style swap via styleNonce) ----------
  const viewport = useStore((s) => s.viewport);
  useEffect(() => setData('networks', staticData.networks), [staticData.networks, styleNonce]);
  useEffect(() => setData('msplates', staticData.plates), [staticData.plates, styleNonce]);
  useEffect(() => setData('dac', staticData.dac), [staticData.dac, styleNonce]);
  useEffect(() => setData('nws', staticData.nws), [staticData.nws, styleNonce]);
  useEffect(() => setData('tracts', staticData.tracts), [staticData.tracts, styleNonce]);
  useEffect(() => setData('transformers', live.transformers), [live.transformers, styleNonce]);
  useEffect(() => setData('feeders', live.feeders), [live.feeders, styleNonce]);
  useEffect(() => setData('structures', live.structures), [live.structures, styleNonce]);
  useEffect(() => setData('buildings', live.buildings), [live.buildings, styleNonce]);
  useEffect(() => setData('feeders33kv', live.feeders33kv), [live.feeders33kv, styleNonce]);

  // sites + radius + impact
  const siteFC = useMemo<FC>(() => {
    return {
      type: 'FeatureCollection',
      features: sites.map((s: Site) => {
        const a = assessments.get(s.id);
        const moving = drag?.id === s.id;
        const status: Status = moving ? 'unknown' : a?.worst ?? 'unknown';
        const word = moving ? 'drop to re-check' : !a || a.provisional ? 'checking…' : a.worst === 'crit' ? "doesn't fit" : a.worst === 'warn' ? 'tight' : a.worst === 'ok' ? 'fits' : 'no data';
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: moving ? [drag!.lng, drag!.lat] : [s.lng, s.lat] },
          properties: {
            id: s.id,
            label: `${s.name} · ${a ? fmt.kw(a.coincidentKw) + ' at 5 PM' : fmt.kw(nameplateKw(s))} · ${word}`,
            short: s.name,
            color: STATUS_COLOR[status],
            selected: s.id === selectedSiteId,
          },
        };
      }),
    };
  }, [sites, assessments, selectedSiteId, drag]);
  const radiusFC = useMemo<FC>(
    () => ({
      type: 'FeatureCollection',
      features: sites.map((s) => {
        const moving = drag?.id === s.id;
        const c = turf.circle(moving ? [drag!.lng, drag!.lat] : [s.lng, s.lat], s.radiusM / 1000, { steps: 48, units: 'kilometers' });
        const a = assessments.get(s.id);
        return { ...c, properties: { color: STATUS_COLOR[moving ? 'unknown' : a?.worst ?? 'unknown'], selected: s.id === selectedSiteId } } as FC['features'][number];
      }),
    }),
    [sites, assessments, selectedSiteId, drag],
  );
  const impactFC = useMemo<FC>(() => {
    const feats: any[] = [];
    const targets = selectedSiteId ? sites.filter((s) => s.id === selectedSiteId) : sites;
    for (const s of targets) {
      const a = assessments.get(s.id);
      // nothing to point at until the equipment around the site has loaded, or while the pin is in the air
      if (!a || a.provisional || drag?.id === s.id) continue;
      for (const asset of a.assets) {
        if (asset.status === 'unknown' || asset.kind === 'network') continue;
        const pct = asset.ratio != null ? fmt.fill(asset.ratio) : undefined;
        feats.push({ type: 'Feature', geometry: asset.geometry, properties: { color: STATUS_COLOR[asset.status], kind: asset.kind, label: pct } });
        if (asset.geometry.type === 'Point' && asset.ratio != null)
          feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], asset.geometry.coordinates] }, properties: { color: STATUS_COLOR[asset.status], kind: 'flow' } });
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }, [sites, assessments, selectedSiteId, drag]);
  useEffect(() => setData('sites', siteFC), [siteFC, styleNonce]);
  useEffect(() => setData('site-radius', radiusFC), [radiusFC, styleNonce]);
  useEffect(() => setData('impact', impactFC), [impactFC, styleNonce]);

  // ---------- visibility + filters ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready() || !map) return;
    const vis = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
    vis(['networks-fill', 'networks-line'], layers.networks);
    vis(['networks-label'], layers.networks && mode === 'outlook');
    vis(['msplates-fill', 'msplates-line'], layers.msplates);
    vis(['dac-fill', 'dac-line'], layers.dac);
    vis(['nws-line'], layers.nws);
    vis(['tracts-fill', 'tracts-line'], layers.tracts || (layers.areaStress && !!area));
    vis(['transformers-circle'], layers.transformers);
    vis(['feeders-line'], layers.feeders);
    vis(['structures-circle'], layers.structures);
    vis(['buildings-fill'], layers.buildings);
    vis(['feeders33kv-line'], layers.feeders33kv);
    vis(['sites-circle', 'sites-label', 'sites-icon'], layers.sites);
    vis(['site-radius-fill', 'site-radius-line', 'impact-line', 'impact-point', 'impact-fill', 'impact-flow', 'impact-label'], layers.sites && mode === 'sites');
    if (map.getLayer('sites-label')) {
      map.setLayoutProperty('sites-label', 'text-field', ['get', mode === 'outlook' ? 'short' : 'label']);
      map.setLayoutProperty('sites-label', 'text-allow-overlap', mode === 'sites');
    }
    // In Outlook the borough / DAC choices live in the left panel and drive both the numbers and the map.
    const boroughs = mode === 'outlook' ? areaBoroughs : filters.boroughs;
    const dacOnly = mode === 'outlook' ? areaDacOnly : filters.dacOnly;

    // transformer filter
    const xf: any[] = ['all'];
    // Voltage values look like "208v" / "460v"
    xf.push(['in', ['slice', ['to-string', ['get', 'Voltage']], 0, 3], ['literal', filters.xfmrVoltage]]);
    xf.push(['in', ['get', 'CapacityRange'], ['literal', filters.xfmrBuckets]]);
    map.setFilter('transformers-circle', xf);
    // feeder filter
    const ff: any[] = ['all', ['>=', ['coalesce', ['to-number', ['get', 'EV_HEADROOM']], 0], filters.feederMinHeadroom]];
    if (filters.feederVoltages.length) ff.push(['in', ['to-string', ['get', 'VOLTAGE_KV']], ['literal', filters.feederVoltages]]);
    map.setFilter('feeders-line', ff);
    // buildings filter
    const bf: any[] = ['all', ['>=', ['coalesce', ['get', 'unitsres'], 0], filters.minUnits]];
    if (filters.plutoLandUse.length) bf.push(['in', ['get', 'landuse'], ['literal', filters.plutoLandUse]]);
    map.setFilter('buildings-fill', bf);
    // networks
    const nf: any[] = ['all'];
    if (boroughs.length) nf.push(['in', ['get', 'BOROUGH'], ['literal', boroughs]]);
    if (filters.networkMinRemaining > 0) nf.push(['>=', ['-', ['coalesce', ['get', 'CapacityMW'], 0], ['coalesce', ['get', 'SubscribedMW'], 0]], filters.networkMinRemaining]);
    ['networks-fill', 'networks-line', 'networks-label'].forEach((id) => map.setFilter(id, nf));
    map.setFilter('msplates-fill', ['>=', ['coalesce', ['get', 'KVA'], 0], filters.plateMinKva]);
    map.setFilter('msplates-line', ['>=', ['coalesce', ['get', 'KVA'], 0], filters.plateMinKva]);
    // tracts filter (DAC only)
    const tf: any[] = ['all'];
    if (dacOnly) tf.push(['==', ['get', 'dac'], 1]);
    map.setFilter('tracts-fill', tf);
    map.setFilter('tracts-line', tf);
  }, [layers, filters, area, styleNonce, mode, areaBoroughs, areaDacOnly]);

  // ---------- per-layer opacity (user-adjustable in the Layers drawer) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready() || !map) return;
    const k = (key: keyof LayerVisibility) => layerOpacity[key] ?? 1;
    const setP = (id: string, prop: string, v: any) => map.getLayer(id) && map.setPaintProperty(id, prop as any, v);
    setP('transformers-circle', 'circle-opacity', k('transformers'));
    setP('transformers-circle', 'circle-stroke-opacity', k('transformers'));
    setP('feeders-line', 'line-opacity', 0.9 * k('feeders'));
    setP('feeders33kv-line', 'line-opacity', 0.8 * k('feeders33kv'));
    setP('structures-circle', 'circle-opacity', k('structures'));
    setP('structures-circle', 'circle-stroke-opacity', k('structures'));
    setP('buildings-fill', 'fill-extrusion-opacity', 0.75 * k('buildings'));
    setP('msplates-fill', 'fill-opacity', 0.35 * k('msplates'));
    setP('msplates-line', 'line-opacity', 0.5 * k('msplates'));
    setP('networks-fill', 'fill-opacity', ['*', ['case', ['to-boolean', ['feature-state', 'status']], 0.18, 0.08], k('networks')]);
    setP('networks-line', 'line-opacity', 0.9 * k('networks'));
    setP('networks-label', 'text-opacity', k('networks'));
    setP('dac-fill', 'fill-opacity', 0.12 * k('dac'));
    setP('dac-line', 'line-opacity', k('dac'));
    setP('nws-line', 'line-opacity', k('nws'));
    setP('tracts-fill', 'fill-opacity', 0.65 * k('tracts'));
    setP('tracts-line', 'line-opacity', k('tracts'));
  }, [layerOpacity, styleNonce]);

  // ---------- choropleth / area stress ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready() || !map || !staticData.tracts) return;
    const tracts = staticData.tracts;
    const networks = staticData.networks;
    const cancels: Array<() => void> = [];
    if (area && layers.areaStress) {
      // tract-level kW/km² via feature-state
      const vals = [...area.tractStats.values()].map((t) => t.kwPerKm2).filter((v) => v > 0);
      const q = quantiles(vals, 5);
      cancels.push(
        whenSourceLoaded(map, 'tracts', () => {
          for (const f of tracts.features) {
            const geoid = String(f.properties?.GEOID);
            const t = area.tractStats.get(geoid);
            map.setFeatureState({ source: 'tracts', id: geoid }, { kw: t?.kwPerKm2 ?? 0 });
          }
        }),
      );
      map.setPaintProperty('tracts-fill', 'fill-color', [
        'interpolate',
        ['linear'],
        ['coalesce', ['feature-state', 'kw'], 0],
        0,
        'rgba(0,0,0,0)',
        Math.max(1, q[1]),
        GROWTH_RAMP[0],
        Math.max(2, q[2]),
        GROWTH_RAMP[1],
        Math.max(3, q[3]),
        GROWTH_RAMP[2],
        Math.max(4, q[4]),
        GROWTH_RAMP[3],
        Math.max(5, q[5]),
        GROWTH_RAMP[4],
      ]);
      // network status
      cancels.push(
        whenSourceLoaded(map, 'networks', () => {
          for (const n of area.networkStats) map.setFeatureState({ source: 'networks', id: n.network }, { status: n.status === 'unknown' ? null : n.status });
        }),
      );
    } else {
      // reset to neutral states (removeFeatureState throws in mapbox-gl v3 when nothing was set yet)
      cancels.push(
        whenSourceLoaded(map, 'tracts', () => {
          for (const f of tracts.features) map.setFeatureState({ source: 'tracts', id: String(f.properties?.GEOID) }, { kw: 0 });
        }),
      );
      if (networks)
        cancels.push(
          whenSourceLoaded(map, 'networks', () => {
            for (const f of networks.features) map.setFeatureState({ source: 'networks', id: String(f.properties?.NETWORK) }, { status: null });
          }),
        );
      const v = filters.acsVariable;
      if (v === 'none') map.setPaintProperty('tracts-fill', 'fill-color', 'rgba(0,0,0,0)');
      else {
        const def = ACS_VARS[v];
        const vals = staticData.tracts.features.map((f) => +f.properties?.[v]).filter((x) => Number.isFinite(x));
        const q = quantiles(vals, def.ramp.length - 1);
        map.setPaintProperty('tracts-fill', 'fill-color', v === 'dac' ? ['case', ['==', ['get', 'dac'], 1], def.ramp[1], 'rgba(0,0,0,0)'] : rampExpr(v, q, def.ramp));
      }
    }
    return () => cancels.forEach((c) => c());
  }, [area, layers.areaStress, filters.acsVariable, staticData.tracts, staticData.networks, styleNonce]);

  // satellite toggle: sources/layers are style-scoped, so re-add them after the swap
  const satRef = useRef(layers.satellite);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || satRef.current === layers.satellite) return;
    satRef.current = layers.satellite;
    if (!loaded.current) return;
    loaded.current = false;
    map.setStyle(layers.satellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/dark-v11');
    map.once('style.load', () => addLayersRef.current());
  }, [layers.satellite]);

  // flyTo
  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: flyTo.center, zoom: flyTo.zoom, essential: true });
  }, [flyTo]);

  // keyboard: Esc backs out of placing, the open drawer and any popup
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPlacing(false);
      setDrawer(null);
      popupRef.current?.remove();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setPlacing, setDrawer]);

  const zoom = viewport.zoom;
  const loadingAny = Object.values(live.loading).some(Boolean);
  const gridFailed = !!(live.errors.transformers || live.errors.feeders || live.errors.structures);
  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const hints: string[] = [];
  if (mode === 'sites') {
    const wantsEquipment = layers.transformers || layers.feeders || layers.buildings || layers.structures;
    if (wantsEquipment && zoom < MIN_ZOOM.feeders) hints.push('Zoom in to see grid equipment (transformers at 14+, buildings at 15+) — or click ⌖ on a site');
    else if (!selectedSiteIdForHint && sites.length) hints.push('Click a site pin or card to see its traffic lights · click any dot for details');
    else if (selectedSiteIdForHint) hints.push('Drag the pin to try another spot — the verdict re-checks itself');
  } else if (!area) hints.push('Turn the outlook on in the left panel to see the heat map');
  const errs = Object.entries(live.errors).filter(([, v]) => v);

  return (
    <div className="map-wrap" id="tour-map">
      <div ref={container} className={`map ${placing ? 'placing' : ''}`} />
      {webglError && (
        <div className="map-overlay" style={{ inset: 0, display: 'grid', placeItems: 'center' }}>
          <div className="section" style={{ maxWidth: 420, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Map unavailable</h3>
            <p className="muted">{webglError}</p>
            <p className="muted">The Results and Learn tabs still work.</p>
          </div>
        </div>
      )}
      <div className="map-overlay map-status">
        {loadingAny && <div className="note loading">Loading live Con Edison / NYC data…</div>}
        {hints.map((h) => (
          <div className="note muted" key={h}>
            {h}
          </div>
        ))}
        {errs.map(([k, v]) => (
          <div className="note" key={k} style={{ color: 'var(--warn)' }}>
            {k}: {v}
          </div>
        ))}
      </div>
      {placing && <div className="map-overlay placing-banner">Click anywhere on the map to put chargers there · Esc to cancel</div>}
      {!placing && mode === 'sites' && selectedSite && <VerdictBanner site={selectedSite} a={drag?.id === selectedSite.id ? undefined : assessments.get(selectedSite.id)} loading={loadingAny} failed={gridFailed} moving={drag?.id === selectedSite.id} />}
      <Legend thresholds={thresholds} areaActive={!!area && layers.areaStress} layers={layers} zoom={zoom} />
      <div className="map-overlay map-tools">
        <button className={`btn small ${drawer === 'layers' ? 'active' : ''}`} onClick={() => setDrawer(drawer === 'layers' ? null : 'layers')} id="tour-layers-btn" aria-expanded={drawer === 'layers'}>
          ◧ Layers
        </button>
        {/* Outlook has no separate map filters: its borough / DAC choices are in the left panel */}
        {mode === 'sites' && (
          <button className={`btn small ${drawer === 'filters' ? 'active' : ''}`} onClick={() => setDrawer(drawer === 'filters' ? null : 'filters')} id="tour-filters-btn" aria-expanded={drawer === 'filters'}>
            ⚲ Filters
          </button>
        )}
        <button className={`btn small ${layers.satellite ? 'active' : ''}`} onClick={() => setLayers({ satellite: !layers.satellite })} title="Toggle satellite imagery">
          {layers.satellite ? 'Dark map' : 'Satellite'}
        </button>
      </div>
      {drawer && (
        <div className="map-overlay map-drawer" id="tour-drawer">
          <div className="row between" style={{ padding: '8px 12px 0' }}>
            <b>{drawer === 'layers' ? 'Map layers' : 'Filters'}</b>
            <button className="btn small" onClick={() => setDrawer(null)} aria-label="Close" title="Close (Esc)">
              ×
            </button>
          </div>
          {drawer === 'layers' ? <LayersPanel mode={mode} /> : <FiltersPanel />}
        </div>
      )}
    </div>
  );
}

/** Floating answer over the map for the selected site; re-mounts (and pulses) whenever the verdict changes. */
function VerdictBanner({ site, a, loading, failed, moving }: { site: Site; a?: import('../types').SiteAssessment; loading: boolean; failed: boolean; moving?: boolean }) {
  const base = verdictFor(a, loading, failed);
  // pin in the air: say what dropping it will do rather than "loading"
  const v = moving ? { ...base, title: 'Drop the pin to check this spot', summary: 'The traffic lights re-check as soon as you let go.' } : base;
  const key = `${site.id}-${v.level}-${Math.round(a?.coincidentKw ?? 0)}-${v.counts.crit}-${v.counts.warn}`;
  return (
    <div key={key} className={`map-overlay verdict-banner ${v.status}`} id="tour-map-verdict" role="status" onClick={() => document.getElementById('tour-verdict')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
      <span className={`status ${v.status}`} />
      <div>
        <div className="vb-title">
          {site.name}: <b>{v.title}</b>
          {v.level !== 'unknown' && v.level !== 'nodata' && (
            <span className="verdict-counts">
              <span style={{ color: 'var(--ok)' }}>{v.counts.ok} green</span> · <span style={{ color: 'var(--warn)' }}>{v.counts.warn} amber</span> · <span style={{ color: 'var(--crit)' }}>{v.counts.crit} red</span>
            </span>
          )}
        </div>
        <div className="vb-sub">{v.summary}</div>
      </div>
    </div>
  );
}
