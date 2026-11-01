import { create } from 'zustand';
import type { Point, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';
import type { AreaScenario, FC, Filters, LayerOpacity, LayerVisibility, Scenario, Settings, Site } from '../types';
import { DEFAULT_FILTERS, DEFAULT_LAYERS, DEFAULT_OPACITY, defaultScenario, uid } from './defaults';
import { readScenarioFromUrl } from './url';

export type Tab = 'sites' | 'outlook' | 'results' | 'scenarios' | 'settings' | 'learn';
/** Compact drawer over the map for layers / filters. */
export type Drawer = 'layers' | 'filters' | null;
export type MapMode = 'sites' | 'outlook';
/** Everything that makes one map view feel like its own place: layers, filters, opacity and camera. */
export interface MapUi {
  layers: LayerVisibility;
  filters: Filters;
  layerOpacity: LayerOpacity;
  camera: { center: [number, number]; zoom: number } | null;
}

const LS_SAVED = 'evsim.saved.v1';
const LS_UI = 'evsim.ui.v4';

const OUTLOOK_LAYERS: LayerVisibility = { ...DEFAULT_LAYERS, transformers: false, feeders: false, buildings: false, networks: true, dac: true, areaStress: true, tracts: false };
const DEFAULT_UI: Record<MapMode, MapUi> = {
  sites: { layers: DEFAULT_LAYERS, filters: DEFAULT_FILTERS, layerOpacity: DEFAULT_OPACITY, camera: null },
  outlook: { layers: OUTLOOK_LAYERS, filters: DEFAULT_FILTERS, layerOpacity: DEFAULT_OPACITY, camera: null },
};
function loadUi(): Record<MapMode, MapUi> {
  const raw = load<Partial<Record<MapMode, Partial<MapUi>>>>(LS_UI, {});
  const merge = (m: MapMode): MapUi => ({
    layers: { ...DEFAULT_UI[m].layers, ...(raw[m]?.layers ?? {}) },
    filters: { ...DEFAULT_UI[m].filters, ...(raw[m]?.filters ?? {}) },
    layerOpacity: { ...DEFAULT_UI[m].layerOpacity, ...(raw[m]?.layerOpacity ?? {}) },
    camera: raw[m]?.camera ?? null,
  });
  return { sites: merge('sites'), outlook: merge('outlook') };
}
const UI0 = loadUi();
const LS_ACTIVE = 'evsim.active.v1';
const LS_MISSIONS = 'evsim.missions.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

function loadList<T>(key: string): T[] {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

export interface StaticData {
  networks?: FC<Polygon | MultiPolygon>;
  plates?: FC<Polygon | MultiPolygon>;
  dac?: FC<Polygon | MultiPolygon>;
  nws?: FC<Polygon | MultiPolygon>;
  tracts?: FC<Polygon | MultiPolygon>;
  meta?: { generated: string; layers: Record<string, number> };
}

export interface LiveData {
  transformers: FC<Point>;
  feeders: FC<LineString | MultiLineString>;
  structures: FC<Point>;
  buildings: FC<Polygon | MultiPolygon>;
  feeders33kv: FC<LineString | MultiLineString>;
  loading: Record<string, boolean>;
  errors: Record<string, string | undefined>;
}

const emptyFC = <T,>() => ({ type: 'FeatureCollection', features: [] }) as unknown as T;

export interface AppState {
  scenario: Scenario;
  saved: Scenario[];
  compareId: string | null;
  tab: Tab;
  /** Which map experience is live (Sites or Outlook); the two keep separate layers, filters and cameras. */
  mapMode: MapMode;
  /** Saved UI for the map mode that is *not* currently active. */
  stash: Record<MapMode, MapUi>;
  drawer: Drawer;
  learnView: 'guide' | 'missions';
  selectedSiteId: string | null;
  placing: boolean;
  tourRequested: boolean;
  sidebarOpen: boolean;
  layers: LayerVisibility;
  layerOpacity: LayerOpacity;
  /** When on, switching a map layer on switches the other optional layers off. */
  exclusiveLayers: boolean;
  filters: Filters;
  staticData: StaticData;
  live: LiveData;
  viewport: { center: [number, number]; zoom: number };
  flyTo: { center: [number, number]; zoom: number; nonce: number } | null;
  missionsDone: string[];
  analyticsVisited: boolean;
  toast: string | null;

  // actions
  setTab: (t: Tab) => void;
  setDrawer: (d: Drawer) => void;
  setLearnView: (v: 'guide' | 'missions') => void;
  setSidebarOpen: (b: boolean) => void;
  setScenarioName: (n: string) => void;
  addSite: (s: Site) => void;
  updateSite: (id: string, patch: Partial<Site>) => void;
  removeSite: (id: string) => void;
  selectSite: (id: string | null) => void;
  setPlacing: (b: boolean) => void;
  setArea: (patch: Partial<AreaScenario>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setCostParams: (patch: Partial<Settings['cost']>) => void;
  setLayers: (patch: Partial<LayerVisibility>) => void;
  setLayerOpacity: (key: keyof LayerVisibility, v: number) => void;
  setExclusiveLayers: (b: boolean) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  saveScenario: (name?: string) => void;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  newScenario: () => void;
  resetToDefault: () => void;
  importScenario: (s: Scenario) => void;
  setCompare: (id: string | null) => void;
  setStatic: (d: Partial<StaticData>) => void;
  setLive: (patch: Partial<LiveData>) => void;
  setViewport: (v: { center: [number, number]; zoom: number }) => void;
  requestFlyTo: (center: [number, number], zoom: number) => void;
  requestTour: (b: boolean) => void;
  completeMission: (id: string) => void;
  resetMissions: () => void;
  setToast: (m: string | null) => void;
}

function initialScenario(): Scenario {
  const fromUrl = readScenarioFromUrl();
  if (fromUrl) return { ...fromUrl, id: fromUrl.id ?? uid() };
  const active = load<Scenario | null>(LS_ACTIVE, null as any);
  if (active && Array.isArray((active as any).sites)) return active;
  return defaultScenario();
}

export const useStore = create<AppState>((set, get) => ({
  scenario: initialScenario(),
  saved: loadList<Scenario>(LS_SAVED),
  compareId: null,
  tab: 'sites',
  mapMode: 'sites',
  stash: UI0,
  drawer: null,
  learnView: 'guide',
  selectedSiteId: null,
  placing: false,
  tourRequested: false,
  sidebarOpen: true,
  layers: UI0.sites.layers,
  layerOpacity: UI0.sites.layerOpacity,
  exclusiveLayers: load<{ exclusiveLayers: boolean }>(LS_UI, { exclusiveLayers: false }).exclusiveLayers,
  filters: UI0.sites.filters,
  staticData: {},
  live: { transformers: emptyFC(), feeders: emptyFC(), structures: emptyFC(), buildings: emptyFC(), feeders33kv: emptyFC(), loading: {}, errors: {} },
  viewport: { center: [-73.9, 40.75], zoom: 11 },
  flyTo: null,
  missionsDone: loadList<string>(LS_MISSIONS),
  analyticsVisited: false,
  toast: null,

  setTab: (tab) =>
    set((s) => {
      const base: Partial<AppState> = {
        tab,
        drawer: null,
        analyticsVisited: s.analyticsVisited || tab === 'results',
        // the Outlook tab *is* the borough-wide model, so switch it on when the user goes there
        scenario: tab === 'outlook' && !s.scenario.area.enabled ? { ...s.scenario, area: { ...s.scenario.area, enabled: true } } : s.scenario,
      };
      const to: MapMode | null = tab === 'sites' || tab === 'outlook' ? tab : null;
      if (!to || to === s.mapMode) return base;
      // Swap map experiences: park the current mode's layers/filters/camera, bring out the other's
      const stash = { ...s.stash, [s.mapMode]: { layers: s.layers, filters: s.filters, layerOpacity: s.layerOpacity, camera: s.viewport } };
      const next = stash[to];
      const camera = next.camera ?? (to === 'outlook' ? { center: [-73.93, 40.78] as [number, number], zoom: 10.6 } : s.viewport);
      return { ...base, mapMode: to, stash, layers: next.layers, filters: next.filters, layerOpacity: next.layerOpacity, flyTo: { ...camera, nonce: Date.now() } };
    }),
  setDrawer: (drawer) => set({ drawer }),
  setLearnView: (learnView) => set({ learnView }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setScenarioName: (name) => set((s) => ({ scenario: { ...s.scenario, name } })),
  addSite: (site) => set((s) => ({ scenario: { ...s.scenario, sites: [...s.scenario.sites, site] }, selectedSiteId: site.id, placing: false, tab: 'sites', sidebarOpen: true })),
  updateSite: (id, patch) =>
    set((s) => ({ scenario: { ...s.scenario, sites: s.scenario.sites.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })),
  removeSite: (id) =>
    set((s) => ({ scenario: { ...s.scenario, sites: s.scenario.sites.filter((x) => x.id !== id) }, selectedSiteId: s.selectedSiteId === id ? null : s.selectedSiteId })),
  selectSite: (selectedSiteId) => set({ selectedSiteId }),
  setPlacing: (placing) => set({ placing }),
  setArea: (patch) => set((s) => ({ scenario: { ...s.scenario, area: { ...s.scenario.area, ...patch } } })),
  setSettings: (patch) => set((s) => ({ scenario: { ...s.scenario, settings: { ...s.scenario.settings, ...patch } } })),
  setCostParams: (patch) => set((s) => ({ scenario: { ...s.scenario, settings: { ...s.scenario.settings, cost: { ...s.scenario.settings.cost, ...patch } } } })),
  setLayers: (patch) => set((s) => ({ layers: { ...s.layers, ...patch } })),
  setLayerOpacity: (key, v) => set((s) => ({ layerOpacity: { ...s.layerOpacity, [key]: v } })),
  setExclusiveLayers: (exclusiveLayers) => set({ exclusiveLayers }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set((s) => ({ filters: DEFAULT_UI[s.mapMode].filters })),
  saveScenario: (name) => {
    const s = get().scenario;
    const snapshot: Scenario = { ...structuredClone(s), name: name ?? s.name, createdAt: Date.now() };
    const saved = [...get().saved.filter((x) => x.id !== s.id), snapshot];
    set({ saved, toast: `Saved "${snapshot.name}"` });
  },
  loadScenario: (id) => {
    const found = get().saved.find((x) => x.id === id);
    if (found) set({ scenario: structuredClone(found), selectedSiteId: null, toast: `Loaded "${found.name}"` });
  },
  deleteScenario: (id) => set((s) => ({ saved: s.saved.filter((x) => x.id !== id), compareId: s.compareId === id ? null : s.compareId })),
  newScenario: () =>
    set((s) => ({
      scenario: { ...structuredClone(s.scenario), id: uid(), name: `${s.scenario.name} (copy)`, createdAt: Date.now() },
      toast: 'Duplicated scenario — edit freely',
    })),
  resetToDefault: () => set({ scenario: defaultScenario(), selectedSiteId: null, toast: 'Reset to baseline scenario' }),
  importScenario: (scenario) => set({ scenario, selectedSiteId: null }),
  setCompare: (compareId) => set({ compareId }),
  setStatic: (d) => set((s) => ({ staticData: { ...s.staticData, ...d } })),
  setLive: (patch) => set((s) => ({ live: { ...s.live, ...patch } })),
  setViewport: (viewport) => set({ viewport }),
  requestFlyTo: (center, zoom) => set({ flyTo: { center, zoom, nonce: Date.now() } }),
  requestTour: (tourRequested) => set({ tourRequested }),
  completeMission: (id) => set((s) => (s.missionsDone.includes(id) ? {} : { missionsDone: [...s.missionsDone, id], toast: `Mission complete: ${id}` })),
  resetMissions: () => set({ missionsDone: [] }),
  setToast: (toast) => set({ toast }),
}));

// Persist slices
useStore.subscribe((s, prev) => {
  if (s.saved !== prev.saved) localStorage.setItem(LS_SAVED, JSON.stringify(s.saved));
  if (s.layers !== prev.layers || s.filters !== prev.filters || s.layerOpacity !== prev.layerOpacity || s.exclusiveLayers !== prev.exclusiveLayers || s.stash !== prev.stash) {
    const ui = { ...s.stash, [s.mapMode]: { layers: s.layers, filters: s.filters, layerOpacity: s.layerOpacity, camera: s.stash[s.mapMode].camera } };
    localStorage.setItem(LS_UI, JSON.stringify({ ...ui, exclusiveLayers: s.exclusiveLayers }));
  }
  if (s.scenario !== prev.scenario) localStorage.setItem(LS_ACTIVE, JSON.stringify(s.scenario));
  if (s.missionsDone !== prev.missionsDone) localStorage.setItem(LS_MISSIONS, JSON.stringify(s.missionsDone));
});
