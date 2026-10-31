import type { FC } from '../types';

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const cache = new Map<string, Promise<FC>>();

/**
 * Query an ArcGIS FeatureServer layer by bounding box, returning GeoJSON.
 * Pages until the server's transfer limit is exhausted or `maxFeatures` reached.
 */
export async function queryArcGISBBox(
  layerUrl: string,
  bbox: BBox,
  opts: { where?: string; outFields?: string; maxFeatures?: number; precision?: number; signal?: AbortSignal } = {},
): Promise<FC> {
  const { where = '1=1', outFields = '*', maxFeatures = 6000, precision = 6, signal } = opts;
  const key = `${layerUrl}|${bbox.west.toFixed(4)},${bbox.south.toFixed(4)},${bbox.east.toFixed(4)},${bbox.north.toFixed(4)}|${where}`;
  if (cache.has(key)) return cache.get(key)!;

  const run = (async () => {
    const features: FC['features'] = [];
    let offset = 0;
    for (;;) {
      const p = new URLSearchParams({
        where,
        outFields,
        f: 'geojson',
        outSR: '4326',
        inSR: '4326',
        geometry: JSON.stringify({ xmin: bbox.west, ymin: bbox.south, xmax: bbox.east, ymax: bbox.north, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        geometryPrecision: String(precision),
        resultOffset: String(offset),
        resultRecordCount: '2000',
      });
      const r = await fetch(`${layerUrl}/query?${p}`, { signal });
      if (!r.ok) throw new Error(`ArcGIS ${r.status}`);
      const fc = (await r.json()) as FC & { error?: unknown; properties?: { exceededTransferLimit?: boolean } };
      if ((fc as any).error) throw new Error(JSON.stringify((fc as any).error));
      features.push(...fc.features);
      const exceeded = fc.properties?.exceededTransferLimit || fc.features.length >= 2000;
      if (!exceeded || features.length >= maxFeatures) break;
      offset += fc.features.length;
    }
    return { type: 'FeatureCollection', features } as FC;
  })();
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}

export function clearArcCache() {
  cache.clear();
}
