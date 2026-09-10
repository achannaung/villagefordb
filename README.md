# Village Finder — GAD Coordinate Database

Fast Myanmar village lookup across **72,313 GAD records** with precise coordinates.

## Why fast

- The 8.5MB national CSV is **split by state** into `public/data/*.json` at build time
- Page opens with only a ~20KB index (`manifest.json` + `townships.json`)
- Each search loads **only the matching state file(s)** (100KB–2.4MB), cached afterwards
- Memoized filtering/sorting, lazy-loaded map, code-split vendor chunks

## Run locally

Requires Node.js.

```bash
npm install
npm run dev        # prebuild regenerates public/data if missing, then vite build
npm run build
```

## Data

Source: GAD coordinate database (`SR_Pcode, SR, District, Township, Village_Tract,
Village, Village_MM, Latitude, Longitude, Source`), rebuilt via `scripts/prebuild.mjs`.
