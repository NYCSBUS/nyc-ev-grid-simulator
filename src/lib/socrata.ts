import { SOCRATA } from '../config';
import type { BBox } from './arcgis';
import type { FC } from '../types';

const LAND_USE: Record<string, string> = {
  '01': 'One & Two Family',
  '02': 'Multi-Family Walk-Up',
  '03': 'Multi-Family Elevator',
  '04': 'Mixed Residential & Commercial',
  '05': 'Commercial & Office',
  '06': 'Industrial & Manufacturing',
  '07': 'Transportation & Utility',
  '08': 'Public Facilities & Institutions',
  '09': 'Open Space & Outdoor Recreation',
  '10': 'Parking Facilities',
  '11': 'Vacant Land',
};
export const landUseName = (code?: string) => (code ? LAND_USE[code.padStart(2, '0')] ?? code : 'Unknown');
export const LAND_USE_CODES = Object.entries(LAND_USE);

const headers = (): HeadersInit => (SOCRATA.appToken ? { 'X-App-Token': SOCRATA.appToken } : {});

const cache = new Map<string, Promise<FC>>();

/**
 * Building footprints (geometry) joined to MapPLUTO attributes by BBL.
 * Limited to a viewport at high zoom.
 */
export async function fetchBuildings(bbox: BBox, signal?: AbortSignal): Promise<FC> {
  const key = [bbox.west, bbox.south, bbox.east, bbox.north].map((n) => n.toFixed(4)).join(',');
  if (cache.has(key)) return cache.get(key)!;
  const run = (async () => {
    const fpParams = new URLSearchParams({
      $select: 'the_geom,bin,mappluto_bbl,height_roof,construction_year,feature_code',
      $where: `within_box(the_geom,${bbox.north},${bbox.west},${bbox.south},${bbox.east})`,
      $limit: '1500',
    });
    const fpRes = await fetch(`${SOCRATA.footprints}?${fpParams}`, { headers: headers(), signal });
    if (!fpRes.ok) throw new Error(`Footprints ${fpRes.status}`);
    const fps: any[] = await fpRes.json();

    const bbls = Array.from(new Set(fps.map((f) => f.mappluto_bbl).filter(Boolean))).slice(0, 1200);
    const plutoByBbl = new Map<string, any>();
    // Socrata URL length limit: chunk the IN clause
    const chunks: string[][] = [];
    for (let i = 0; i < bbls.length; i += 200) chunks.push(bbls.slice(i, i + 200));
    await Promise.all(
      chunks.map(async (chunk) => {
        const p = new URLSearchParams({
          $select:
            'bbl,address,zipcode,landuse,bldgclass,numfloors,unitsres,unitstotal,bldgarea,lotarea,resarea,comarea,garagearea,yearbuilt,zonedist1,ownername,numbldgs,bct2020',
          $where: `bbl in(${chunk.join(',')})`,
          $limit: '1000',
        });
        const r = await fetch(`${SOCRATA.pluto}?${p}`, { headers: headers(), signal });
        if (!r.ok) return;
        const rows: any[] = await r.json();
        for (const row of rows) plutoByBbl.set(String(Math.round(+row.bbl)), row);
      }),
    );

    const features = fps
      .filter((f) => f.the_geom)
      .map((f) => {
        const pl = plutoByBbl.get(String(f.mappluto_bbl)) ?? {};
        return {
          type: 'Feature' as const,
          geometry: f.the_geom,
          properties: {
            bin: f.bin,
            bbl: f.mappluto_bbl,
            height_ft: f.height_roof ? +(+f.height_roof).toFixed(0) : null,
            built: pl.yearbuilt ? +pl.yearbuilt : f.construction_year ? +f.construction_year : null,
            address: pl.address ?? null,
            zipcode: pl.zipcode ?? null,
            landuse: pl.landuse ? String(pl.landuse).padStart(2, '0') : null,
            landuse_name: landUseName(pl.landuse),
            bldgclass: pl.bldgclass ?? null,
            floors: pl.numfloors ? +pl.numfloors : null,
            unitsres: pl.unitsres ? +pl.unitsres : 0,
            unitstotal: pl.unitstotal ? +pl.unitstotal : 0,
            bldgarea: pl.bldgarea ? +pl.bldgarea : null,
            lotarea: pl.lotarea ? +pl.lotarea : null,
            garagearea: pl.garagearea ? +pl.garagearea : 0,
            zoning: pl.zonedist1 ?? null,
            owner: pl.ownername ?? null,
            tract: pl.bct2020 ?? null,
          },
        };
      });
    return { type: 'FeatureCollection', features } as FC;
  })();
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}
