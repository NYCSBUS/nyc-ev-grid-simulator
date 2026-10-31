import { MAPBOX_TOKEN, NYC_BOUNDS } from '../config';

export interface GeocodeResult {
  name: string;
  lng: number;
  lat: number;
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];
  const bbox = `${NYC_BOUNDS[0][0]},${NYC_BOUNDS[0][1]},${NYC_BOUNDS[1][0]},${NYC_BOUNDS[1][1]}`;
  const p = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    bbox,
    proximity: '-73.95,40.75',
    country: 'us',
    types: 'address,poi,place,neighborhood,postcode',
    limit: '6',
    autocomplete: 'true',
  });
  const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${p}`, { signal });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.features ?? []).map((f: any) => ({ name: f.place_name, lng: f.center[0], lat: f.center[1] }));
}

export async function reverseGeocode(lng: number, lat: number): Promise<string | undefined> {
  const p = new URLSearchParams({ access_token: MAPBOX_TOKEN, types: 'address', limit: '1' });
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${p}`);
    const j = await r.json();
    return j.features?.[0]?.place_name?.replace(', United States', '');
  } catch {
    return undefined;
  }
}
