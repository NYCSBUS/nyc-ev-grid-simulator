# NYC EV Load Growth Simulator

A map-based, static (GitHub Pages) simulator for testing where new EV charging load can land on Con Edison's distribution system. Built around the kind of analysis the **EV Program Strategy & Performance Analytics** role does: site screening, hosting-capacity headroom, equity (DAC) targeting, EV load forecasting, and budget/incentive trade-offs.

## What it does

- **Map** (Mapbox GL) of the Con Edison territory with live layers from Con Edison's public hosting-capacity ArcGIS services: EV transformers (summer/winter), EV feeders, 33 kV feeders, network structures, M&S plates, networks (LSRV), NWS networks, disadvantaged communities; NYC **MapPLUTO** attributes joined to **Building Footprints**; **Census tracts** with ACS demographics.
- **Site simulation**: search an address (or click the map / shift-click a building), set charger mix (L2 7–19 kW, DCFC 50–350 kW), use profile, utilization, diversity, managed charging and storage. Nearby transformers, feeders, M&S plates, structures and the network get a green / amber / red status against published headroom.
- **Area-wide adoption**: EV fleet share by year (2024–2045) on policy / moderate / slow / custom curves, converted to coincident peak kW per tract and aggregated to networks.
- **Analytics tab**: hourly load, asset loading, cost & incentive breakdown, adoption curves, network stress table, scenario comparison, CSV/PNG export.
- **Missions**, a **guided tour**, hover **tooltips** on every control, and an illustrated **Help** tab.
- Scenarios persist in the browser and can be shared as a URL.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/
```

## Refresh snapshot data

Small reference layers (networks, M&S plates, DAC tracts, NWS networks, Census tracts + ACS) are snapshotted into `public/data/` so the app loads fast and works even if a service is slow. Large layers (transformers, feeders, structures, buildings) are always fetched live for the viewport.

```bash
npm run snapshots            # only fetches files that are missing
node scripts/fetch-snapshots.mjs --force   # refresh everything
```

The Layers panel shows the snapshot date.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to `main`. The site will be at `https://<user>.github.io/<repo>/`.

`vite.config.ts` uses `base: './'`, so the build works from any sub-path.

## Configuration

- `src/config.ts` — Mapbox token, ArcGIS service URLs, Socrata endpoints (optional app token), zoom thresholds.
- The Mapbox token is a public token and will be visible in the deployed bundle. Restrict it to your Pages URL in the Mapbox dashboard (Tokens → URL restrictions).

## Model notes

- Transformer capacity on Con Edison's EV map is a **range**; the simulator converts it to a point kVA estimate (editable in Settings).
- Feeder `EV_HEADROOM` is published only for **radial** areas. In secondary-network areas (most of Manhattan and dense parts of the boroughs) capacity is read from M&S plates and structures instead; the site panel says so.
- Which transformer actually serves an address is unknown; the model uses proximity with a 60/25/15 % split across the nearest three (secondary grid) or 100 % on the nearest (radial). Both are user-selectable.
- Costs and incentives are illustrative planning assumptions and fully editable.

All results are screening-level and do not replace a Con Edison service determination.
