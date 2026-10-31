export const MAPBOX_TOKEN =
  'pk.eyJ1IjoidnIwMG4tbnljc2J1cyIsImEiOiJjbDB5cHhoeHgxcmEyM2ptdXVkczk1M2xlIn0.qq6o-6TMurwke-t1eyetBw';

export const ARCGIS_BASE = 'https://services.arcgis.com/ciPnsNFi1JLWVjva/arcgis/rest/services';

/** Live Con Edison hosting-capacity layers (fetched by viewport). */
export const LIVE_LAYERS = {
  xfmr208Summer: `${ARCGIS_BASE}/CECONY_EVM_Prod/FeatureServer/1`,
  xfmr460Summer: `${ARCGIS_BASE}/CECONY_EVM_Prod/FeatureServer/0`,
  xfmr208Winter: `${ARCGIS_BASE}/CECONY_EVM_Winter_Prod/FeatureServer/1`,
  xfmr460Winter: `${ARCGIS_BASE}/CECONY_EVM_Winter_Prod/FeatureServer/0`,
  feedersSummer: `${ARCGIS_BASE}/CECONY_EVM_Feeders_Prod/FeatureServer/0`,
  feedersWinter: `${ARCGIS_BASE}/CECONY_EVM_Feeders_Prod/FeatureServer/1`,
  feeders1ph: `${ARCGIS_BASE}/CECONY_EVM_Feeders_Prod/FeatureServer/2`,
  substations: `${ARCGIS_BASE}/CECONY_EVM_Feeders_Prod/FeatureServer/3`,
  structures: `${ARCGIS_BASE}/CE_NwkHcv_StructureHCV_Prod/FeatureServer/0`,
  feeders33kv: `${ARCGIS_BASE}/CECONY_33Kv_Prod/FeatureServer/0`,
  evStorageCharge: `${ARCGIS_BASE}/CECONY_EV_Storage_Prod/FeatureServer/0`,
};

export const SOCRATA = {
  footprints: 'https://data.cityofnewyork.us/resource/5zhs-2jue.json',
  pluto: 'https://data.cityofnewyork.us/resource/64uk-42ks.json',
  /** Optional Socrata app token raises rate limits; leave empty if you don't have one. */
  appToken: '',
};

export const NYC_CENTER: [number, number] = [-73.96, 40.74];
export const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.3, 40.48],
  [-73.65, 41.35],
];

/** Minimum zoom at which heavy live layers load. */
export const MIN_ZOOM = {
  transformers: 14,
  feeders: 13,
  structures: 15,
  buildings: 15,
  feeders33kv: 11,
};

/** Hour of day Con Edison's system peak typically occurs (summer, ~5-6 PM). */
export const SYSTEM_PEAK_HOUR = 17;

export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
