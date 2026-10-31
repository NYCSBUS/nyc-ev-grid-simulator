#!/usr/bin/env node
/**
 * Build-time snapshot of the "small" reference layers so the app loads fast
 * and works even when the live services are slow. Large layers (transformers,
 * feeders, structures, PLUTO, footprints) are always fetched live by viewport.
 *
 *   npm run snapshots
 *
 * Writes GeoJSON to public/data/. Re-run whenever you want fresh data; the
 * app shows the snapshot date in the Layers panel.
 */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'data');
const ARC = 'https://services.arcgis.com/ciPnsNFi1JLWVjva/arcgis/rest/services';

const CONED_COUNTIES = ['005', '047', '061', '081', '085', '119']; // Bronx, Kings, NY, Queens, Richmond, Westchester

async function getJSON(url, tries = 4, timeoutMs = 45000) {
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        signal: ctl.signal,
        headers: { 'User-Agent': 'coned-ev-load-simulator/0.1 (snapshot script)', Accept: 'application/json' },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.log(`    retry ${i + 1}: ${e.message}`);
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

const exists = async (name) => {
  try {
    await stat(path.join(OUT, name));
    return true;
  } catch {
    return false;
  }
};

/** Page through an ArcGIS FeatureServer layer and return a GeoJSON FeatureCollection. */
async function fetchArcLayer(service, layer, { where = '1=1', outFields = '*', precision = 6, offset = 0 } = {}) {
  const features = [];
  let resultOffset = 0;
  const pageSize = 1000;
  for (;;) {
    const p = new URLSearchParams({
      where,
      outFields,
      f: 'geojson',
      outSR: '4326',
      geometryPrecision: String(precision),
      resultOffset: String(resultOffset),
      resultRecordCount: String(pageSize),
    });
    if (offset) p.set('maxAllowableOffset', String(offset));
    const url = `${ARC}/${service}/FeatureServer/${layer}/query?${p}`;
    const fc = await getJSON(url);
    if (fc.error) throw new Error(JSON.stringify(fc.error));
    features.push(...fc.features);
    process.stdout.write(`  ${service}/${layer}: ${features.length}\r`);
    if (!fc.features.length || fc.features.length < pageSize) break;
    resultOffset += fc.features.length;
  }
  console.log(`  ${service}/${layer}: ${features.length} features`);
  return { type: 'FeatureCollection', features };
}

async function save(name, data) {
  const file = path.join(OUT, name);
  const txt = JSON.stringify(data);
  await writeFile(file, txt);
  console.log(`  -> ${name} (${(txt.length / 1e6).toFixed(2)} MB)`);
}

async function fetchTractsWithACS(dacGeoids) {
  // Geometry from TIGERweb (ACS2022 vintage tracts)
  const tiger = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/6/query';
  const where = `STATE='36' AND COUNTY IN (${CONED_COUNTIES.map((c) => `'${c}'`).join(',')})`;
  const p = new URLSearchParams({
    where,
    outFields: 'GEOID,COUNTY,TRACT,NAME,AREALAND,CENTLAT,CENTLON',
    f: 'geojson',
    outSR: '4326',
    geometryPrecision: '5',
    maxAllowableOffset: '0.00008',
  });
  console.log('  tracts: fetching TIGERweb geometry…');
  const fc = await getJSON(`${tiger}?${p}`);
  console.log(`  tracts: ${fc.features.length} polygons`);

  // Attributes from Census Reporter (ACS 5-year latest). Tables:
  // B01003 pop, B19013 median HH income, B25003 tenure, B08201 vehicles by household,
  // B25024 units in structure, B11001 households
  // Census Reporter stalls on multi-table requests, so fetch one table at a time.
  const tables = ['B01003', 'B19013', 'B25003', 'B08201', 'B25024', 'B11001'];
  const acs = {};
  await Promise.all(
    CONED_COUNTIES.map(async (c) => {
      for (const t of tables) {
        const url = `https://api.censusreporter.org/1.0/data/show/latest?table_ids=${t}&geo_ids=140|05000US36${c}`;
        const t0 = Date.now();
        const j = await getJSON(url, 4, 240000); // some tables take ~60 s server-side
        console.log(`  ACS county ${c} table ${t}: ${Object.keys(j.data).length} tracts in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        for (const [geo, v] of Object.entries(j.data)) {
          acs[geo] = Object.assign(acs[geo] ?? {}, v);
        }
      }
    }),
  );

  const n = (v) => (v == null || Number.isNaN(+v) ? null : +v);
  for (const f of fc.features) {
    const geoid = f.properties.GEOID;
    const d = acs[`14000US${geoid}`];
    const props = { GEOID: geoid, county: f.properties.COUNTY, name: f.properties.NAME, dac: dacGeoids.has(geoid) ? 1 : 0 };
    const areaKm2 = (f.properties.AREALAND || 0) / 1e6;
    if (d) {
      const e = (t, k) => n(d[t]?.estimate?.[k]);
      const pop = e('B01003', 'B01003001');
      const hh = e('B11001', 'B11001001');
      const tenTotal = e('B25003', 'B25003001');
      const renter = e('B25003', 'B25003003');
      const vTotal = e('B08201', 'B08201001');
      const v0 = e('B08201', 'B08201002');
      const v1 = e('B08201', 'B08201003');
      const v2 = e('B08201', 'B08201004');
      const v3 = e('B08201', 'B08201005');
      const v4 = e('B08201', 'B08201006');
      const uTotal = e('B25024', 'B25024001');
      const u5_9 = e('B25024', 'B25024006');
      const u10_19 = e('B25024', 'B25024007');
      const u20_49 = e('B25024', 'B25024008');
      const u50 = e('B25024', 'B25024009');
      const u1d = e('B25024', 'B25024002');
      const u1a = e('B25024', 'B25024003');
      const vehicles = v1 != null ? v1 * 1 + (v2 || 0) * 2 + (v3 || 0) * 3 + (v4 || 0) * 4.3 : null;
      Object.assign(props, {
        pop,
        hh,
        density: areaKm2 > 0 && pop != null ? Math.round(pop / areaKm2) : null,
        mhi: e('B19013', 'B19013001'),
        renter_share: tenTotal ? +(renter / tenTotal).toFixed(3) : null,
        vehicles,
        veh_per_hh: vTotal ? +(vehicles / vTotal).toFixed(2) : null,
        no_veh_share: vTotal ? +(v0 / vTotal).toFixed(3) : null,
        mf_share: uTotal ? +(((u5_9 || 0) + (u10_19 || 0) + (u20_49 || 0) + (u50 || 0)) / uTotal).toFixed(3) : null,
        sf_share: uTotal ? +(((u1d || 0) + (u1a || 0)) / uTotal).toFixed(3) : null,
        area_km2: +areaKm2.toFixed(3),
      });
    }
    f.properties = props;
  }
  // Drop water-only / empty tracts
  fc.features = fc.features.filter((f) => f.properties.pop != null && f.properties.pop > 0);
  return fc;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const meta = { generated: new Date().toISOString(), layers: {} };

  const force = process.argv.includes('--force');
  const layer = async (name, fetcher) => {
    if (!force && (await exists(name))) {
      console.log(`  ${name}: using existing file (pass --force to refresh)`);
      const data = JSON.parse(await readFile(path.join(OUT, name), 'utf8'));
      meta.layers[name.replace('.geojson', '')] = data.features.length;
      return data;
    }
    const data = await fetcher();
    await save(name, data);
    meta.layers[name.replace('.geojson', '')] = data.features.length;
    return data;
  };

  console.log('Con Edison reference layers');
  await layer('networks.geojson', () => fetchArcLayer('CECONY_NetworkLCSD_Prod', 0, { precision: 5, offset: 0.00005 }));
  await layer('msplates.geojson', () =>
    fetchArcLayer('CE_NwkHcv_MSPlateHCV_Prod', 0, { precision: 5, offset: 0.00003, outFields: 'MSPLATEID,BORO_NAME,KVA,UPDATED_DATE,NOTES' }),
  );
  const dac = await layer('dac.geojson', () => fetchArcLayer('CECONY_Disadvantaged_Communities_Prod', 0, { precision: 5, offset: 0.00008, outFields: 'GEOID' }));
  await layer('nws.geojson', () => fetchArcLayer('CE_NWS_Networks_Prod', 0, { precision: 5, offset: 0.00005 }));
  await layer('supplied_area.geojson', () => fetchArcLayer('CECONY_NwkSuppliedArea_Prod', 0, { precision: 5, offset: 0.00005 }));

  console.log('Census tracts + ACS');
  const dacGeoids = new Set(dac.features.map((f) => String(f.properties.GEOID)));
  await layer('tracts_acs.geojson', () => fetchTractsWithACS(dacGeoids));

  await save('meta.json', meta);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
