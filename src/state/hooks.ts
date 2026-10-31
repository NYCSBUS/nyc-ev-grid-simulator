import { useEffect, useMemo, useRef } from 'react';
import { useStore } from './store';
import { DATA_BASE, LIVE_LAYERS, MIN_ZOOM } from '../config';
import { queryArcGISBBox, type BBox } from '../lib/arcgis';
import { fetchBuildings } from '../lib/socrata';
import { assessSite, type SiteContext } from '../sim/model';
import { buildAreaIndex, runArea, type AreaIndex } from '../sim/area';
import type { AreaResult, Scenario, SiteAssessment } from '../types';

/** Load the build-time snapshots once. */
export function useStaticData() {
  const setStatic = useStore((s) => s.setStatic);
  useEffect(() => {
    const files: Array<[keyof ReturnType<typeof useStore.getState>['staticData'], string]> = [
      ['networks', 'networks.geojson'],
      ['plates', 'msplates.geojson'],
      ['dac', 'dac.geojson'],
      ['nws', 'nws.geojson'],
      ['tracts', 'tracts_acs.geojson'],
      ['meta', 'meta.json'],
    ];
    for (const [key, file] of files) {
      fetch(DATA_BASE + file)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${file} ${r.status}`))))
        .then((d) => setStatic({ [key]: d }))
        .catch((e) => console.warn('static load failed', file, e));
    }
  }, [setStatic]);
}

export function bboxFromViewport(center: [number, number], zoom: number, aspect = 1.6): BBox {
  // approximate degrees spanned by the viewport
  const latSpan = (360 / Math.pow(2, zoom)) * 0.9;
  const lngSpan = latSpan * aspect;
  return { west: center[0] - lngSpan / 2, east: center[0] + lngSpan / 2, south: center[1] - latSpan / 2, north: center[1] + latSpan / 2 };
}

/** Expand a bbox by a factor so slight pans don't trigger refetch. */
function pad(b: BBox, f = 0.3): BBox {
  const dx = (b.east - b.west) * f;
  const dy = (b.north - b.south) * f;
  return { west: b.west - dx, east: b.east + dx, south: b.south - dy, north: b.north + dy };
}

/** Fetch live Con Ed and NYC layers for the current viewport (debounced). */
export function useLiveData() {
  const viewport = useStore((s) => s.viewport);
  const layers = useStore((s) => s.layers);
  const season = useStore((s) => s.scenario.settings.season);
  const sites = useStore((s) => s.scenario.sites);
  const setLive = useStore((s) => s.setLive);
  const timer = useRef<number>();
  const abort = useRef<AbortController>();

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      const { center, zoom } = viewport;
      const vb = pad(bboxFromViewport(center, zoom));
      const setLoading = (k: string, v: boolean) => setLive({ loading: { ...useStore.getState().live.loading, [k]: v } });
      const setError = (k: string, v?: string) => setLive({ errors: { ...useStore.getState().live.errors, [k]: v } });

      // Always fetch assets around sites so assessments work regardless of viewport
      const siteBoxes: BBox[] = sites.map((s) => {
        const r = (s.radiusM / 111_000) * 1.2;
        return { west: s.lng - r / Math.cos((s.lat * Math.PI) / 180), east: s.lng + r / Math.cos((s.lat * Math.PI) / 180), south: s.lat - r, north: s.lat + r };
      });

      const merge = <T extends { features: any[] }>(parts: T[]): T => {
        const seen = new Set<string>();
        const features: any[] = [];
        for (const p of parts)
          for (const f of p.features) {
            const id = String(f.id ?? f.properties?.OBJECTID ?? f.properties?.OBJECTID_1 ?? JSON.stringify(f.geometry.coordinates[0]));
            if (seen.has(id)) continue;
            seen.add(id);
            features.push(f);
          }
        return { type: 'FeatureCollection', features } as unknown as T;
      };

      // Transformers
      {
        const boxes = [...siteBoxes, ...(zoom >= MIN_ZOOM.transformers && layers.transformers ? [vb] : [])];
        if (boxes.length) {
          setLoading('transformers', true);
          try {
            const urls = season === 'winter' ? [LIVE_LAYERS.xfmr208Winter, LIVE_LAYERS.xfmr460Winter] : [LIVE_LAYERS.xfmr208Summer, LIVE_LAYERS.xfmr460Summer];
            const parts = await Promise.all(boxes.flatMap((b) => urls.map((u) => queryArcGISBBox(u, b, { signal: ctl.signal, maxFeatures: 8000 }))));
            if (!ctl.signal.aborted) {
              setLive({ transformers: merge(parts) as any });
              setError('transformers', undefined);
            }
          } catch (e: any) {
            if (!ctl.signal.aborted) setError('transformers', e.message);
          } finally {
            if (!ctl.signal.aborted) setLoading('transformers', false);
          }
        }
      }

      // Feeders
      {
        const boxes = [...siteBoxes, ...(zoom >= MIN_ZOOM.feeders && layers.feeders ? [vb] : [])];
        if (boxes.length) {
          setLoading('feeders', true);
          try {
            const url = season === 'winter' ? LIVE_LAYERS.feedersWinter : LIVE_LAYERS.feedersSummer;
            const parts = await Promise.all(boxes.map((b) => queryArcGISBBox(url, b, { signal: ctl.signal, maxFeatures: 8000 })));
            if (!ctl.signal.aborted) {
              setLive({ feeders: merge(parts) as any });
              setError('feeders', undefined);
            }
          } catch (e: any) {
            if (!ctl.signal.aborted) setError('feeders', e.message);
          } finally {
            if (!ctl.signal.aborted) setLoading('feeders', false);
          }
        }
      }

      // Structures: always around sites (secondary-network capacity lives here), plus viewport when the layer is on
      {
        const boxes = [...siteBoxes, ...(layers.structures && zoom >= MIN_ZOOM.structures ? [vb] : [])];
        if (boxes.length) {
          setLoading('structures', true);
          try {
            const parts = await Promise.all(
              boxes.map((b) => queryArcGISBBox(LIVE_LAYERS.structures, b, { signal: ctl.signal, maxFeatures: 6000, outFields: 'OBJECTID_1,NETWORK_NAME,STRUCT_NUMBER,KVA,UPDATED_DATE' })),
            );
            if (!ctl.signal.aborted) {
              setLive({ structures: merge(parts) as any });
              setError('structures', undefined);
            }
          } catch (e: any) {
            if (!ctl.signal.aborted) setError('structures', e.message);
          } finally {
            if (!ctl.signal.aborted) setLoading('structures', false);
          }
        }
      }

      // 33 kV feeders
      if (layers.feeders33kv && zoom >= MIN_ZOOM.feeders33kv) {
        setLoading('feeders33kv', true);
        try {
          const fc = await queryArcGISBBox(LIVE_LAYERS.feeders33kv, vb, { signal: ctl.signal, maxFeatures: 4000, precision: 5 });
          if (!ctl.signal.aborted) setLive({ feeders33kv: fc as any });
        } catch (e: any) {
          if (!ctl.signal.aborted) setError('feeders33kv', e.message);
        } finally {
          if (!ctl.signal.aborted) setLoading('feeders33kv', false);
        }
      }

      // Buildings (PLUTO + footprints)
      if (layers.buildings && zoom >= MIN_ZOOM.buildings) {
        setLoading('buildings', true);
        try {
          const fc = await fetchBuildings(bboxFromViewport(center, zoom), ctl.signal);
          if (!ctl.signal.aborted) {
            setLive({ buildings: fc as any });
            setError('buildings', undefined);
          }
        } catch (e: any) {
          if (!ctl.signal.aborted) setError('buildings', e.message);
        } finally {
          if (!ctl.signal.aborted) setLoading('buildings', false);
        }
      }
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [viewport, layers.transformers, layers.feeders, layers.structures, layers.buildings, layers.feeders33kv, season, sites, setLive]);
}

const emptyFC = { type: 'FeatureCollection', features: [] } as any;

export function useSiteContext(): SiteContext | null {
  const st = useStore((s) => s.staticData);
  const live = useStore((s) => s.live);
  return useMemo(() => {
    if (!st.networks || !st.plates || !st.tracts) return null;
    return {
      transformers: live.transformers,
      feeders: live.feeders,
      plates: st.plates,
      networks: st.networks,
      tracts: st.tracts,
      structures: live.structures.features.length ? live.structures : undefined,
    };
  }, [st.networks, st.plates, st.tracts, live.transformers, live.feeders, live.structures]);
}

export function assessScenario(sc: Scenario, ctx: SiteContext | null): Map<string, SiteAssessment> {
  const m = new Map<string, SiteAssessment>();
  if (!ctx) return m;
  for (const s of sc.sites) m.set(s.id, assessSite(s, ctx, sc.settings));
  return m;
}

export function useAssessments(): Map<string, SiteAssessment> {
  const scenario = useStore((s) => s.scenario);
  const ctx = useSiteContext();
  return useMemo(() => assessScenario(scenario, ctx), [scenario, ctx]);
}

export function useAreaIndex(): AreaIndex | null {
  const st = useStore((s) => s.staticData);
  return useMemo(() => {
    if (!st.tracts || !st.networks || !st.plates) return null;
    return buildAreaIndex(st.tracts, st.networks, st.plates);
  }, [st.tracts, st.networks, st.plates]);
}

export function useAreaResult(scenario?: Scenario): AreaResult | null {
  const active = useStore((s) => s.scenario);
  const sc = scenario ?? active;
  const st = useStore((s) => s.staticData);
  const idx = useAreaIndex();
  return useMemo(() => {
    if (!sc.area.enabled || !idx || !st.tracts || !st.networks) return null;
    return runArea(sc.area, st.tracts, st.networks, idx, sc.settings);
  }, [sc.area, sc.settings, idx, st.tracts, st.networks]);
}

export function useToastAutoClear() {
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast, setToast]);
}
