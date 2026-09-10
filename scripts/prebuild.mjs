// Rebuilds public/data/*.json from the GAD villages CSV at build time.
// Runs via `npm run prebuild`. Skips download if data already exists (keeps deploys fast).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'data');
const CSV_URL = 'https://raw.githubusercontent.com/achannaung/Datasets/refs/heads/main/villages.csv';

const CANON = {
  'ayeyarwady': 'Ayeyarwady Region',
  'bago (east)': 'Bago Region', 'bago (west)': 'Bago Region', 'bago': 'Bago Region',
  'chin': 'Chin State', 'kachin': 'Kachin State', 'kayah': 'Kayah State', 'kayin': 'Kayin State',
  'magway': 'Magway Region', 'mandalay': 'Mandalay Region', 'mon': 'Mon State',
  'nay pyi taw': 'Naypyidaw Union Territory', 'naypyidaw': 'Naypyidaw Union Territory',
  'rakhine': 'Rakhine State', 'sagaing': 'Sagaing Region',
  'shan (east)': 'Shan State', 'shan (north)': 'Shan State', 'shan (south)': 'Shan State', 'shan': 'Shan State',
  'tanintharyi': 'Tanintharyi Region', 'yangon': 'Yangon Region',
};

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const num = (s) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
// Display-ready string: round to min(original decimals, 8), keep trailing zeros.
const fmt8 = (raw) => {
  const s = String(raw || '').trim();
  if (!s.includes('.')) return s || '0';
  const [i, dRaw] = s.split('.');
  const d = dRaw.replace(/[^0-9]/g, '');
  if (d.length <= 8) return d ? `${i}.${d}` : i;
  return (Math.round(num(s) * 1e8) / 1e8).toFixed(8);
};

function parseLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

// Township → state fallback for rows with an empty SR (e.g. Bokpyin → Tanintharyi)
const TOWNSHIP_STATE = { 'bokpyin': 'Tanintharyi Region', 'kawthoung': 'Tanintharyi Region' };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (fs.existsSync(path.join(OUT, 'manifest.json')) && fs.existsSync(path.join(OUT, 'shan-state.json'))) {
    console.log('[prebuild] public/data already present, skipping download.');
    return;
  }
  console.log('[prebuild] downloading CSV…');
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`CSV download failed: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const groups = new Map();
  const towns = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const p = parseLine(line);
    if (p.length < 8) continue;
    // SR_Pcode, SR, District, Township, Village_Tract, Village, Village_MM, Latitude, Longitude, Source
    const [pcode, srRaw, dist, tw, tract, ven, vmm, lat, lng, src] = [
      p[0] || '', p[1] || '', p[2] || '', p[3] || '', p[4] || '',
      p[5] || '', p[6] || '', p[7] || '', p[8] || '', p[9] || '',
    ];
    if (!ven && !vmm) continue;
    let state = CANON[srRaw.toLowerCase().trim()];
    if (!state) state = TOWNSHIP_STATE[tw.toLowerCase().trim()] || srRaw || 'Unknown';
    if (!groups.has(state)) groups.set(state, []);
    const la = fmt8(lat), ln = fmt8(lng);
    groups.get(state).push([tw, tract, ven, vmm, num(la), num(ln), dist, srRaw, pcode, src, la, ln]);
    const k = state + '||' + tw;
    towns.set(k, (towns.get(k) || 0) + 1);
  }
  const manifest = [];
  for (const [state, rows] of groups) {
    const fn = slug(state) + '.json';
    const fp = path.join(OUT, fn);
    fs.writeFileSync(fp, JSON.stringify({ state, count: rows.length, fields: ['tw', 'tract', 'ven', 'vmm', 'lat', 'lng', 'dist', 'sr', 'pcode', 'src', 'latT', 'lngT'], rows }));
    manifest.push({ stateEn: state, file: 'data/' + fn, count: rows.length, bytes: fs.statSync(fp).size });
  }
  const total = [...groups.values()].reduce((a, r) => a + r.length, 0);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ total, states: manifest.sort((a, b) => a.stateEn.localeCompare(b.stateEn)) }, null, 1));
  const twIndex = [...towns.entries()].map(([k, count]) => {
    const [stateEn, township] = k.split('||');
    return { stateEn, township, count };
  }).sort((a, b) => a.stateEn.localeCompare(b.stateEn) || a.township.localeCompare(b.township));
  fs.writeFileSync(path.join(OUT, 'townships.json'), JSON.stringify(twIndex));
  console.log(`[prebuild] done: ${total} rows, ${manifest.length} states.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
