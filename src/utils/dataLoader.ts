import { Village } from '../types';
import { MYANMAR_STATES_REGIONS } from '../data/villages';

const MM_NAME: Record<string, string> = Object.fromEntries(
  MYANMAR_STATES_REGIONS.map((s) => [s.en, s.mm])
);

export function stateSlug(stateEn: string): string {
  return stateEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface ManifestState {
  stateEn: string;
  file: string;
  count: number;
  bytes: number;
}
export interface Manifest {
  total: number;
  states: ManifestState[];
}
export interface TownshipEntry {
  stateEn: string;
  township: string;
  count: number;
}

let manifestCache: Manifest | null = null;
let townshipCache: TownshipEntry[] | null = null;
const stateCache = new Map<string, Village[]>();
const inflight = new Map<string, Promise<Village[]>>();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

// Absolute base so fetch works from any route (Vite base, default '/')
function absBase(base: string): string {
  if (base) return base.endsWith('/') ? base : base + '/';
  try {
    const b = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
    if (b) return b.endsWith('/') ? b : b + '/';
  } catch {}
  return '/';
}

export async function getManifest(base = ''): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  manifestCache = await fetchJSON<Manifest>(`${absBase(base)}data/manifest.json`);
  return manifestCache;
}

export async function getTownshipIndex(base = ''): Promise<TownshipEntry[]> {
  if (townshipCache) return townshipCache;
  townshipCache = await fetchJSON<TownshipEntry[]>(`${absBase(base)}data/townships.json`);
  return townshipCache;
}

// Compact rows: [tw, tract, ven, vmm, lat, lng, dist, sr, pcode, src, latT, lngT]
// latT/lngT are display-ready strings preserving original precision (max 8).
type CompactRow = [string, string, string, string, number, number, string, string, string, string, string, string];

interface CompactFile {
  state: string;
  count: number;
  fields: string[];
  rows: CompactRow[];
}

function toVillage(stateEn: string, idx: number, r: CompactRow): Village {
  const [tw, tract, ven, vmm, lat, lng, dist, , pcode, src, latT, lngT] = r;
  return {
    id: `v-${stateSlug(stateEn)}-${idx}`,
    pcode: pcode || '—',
    nameMm: vmm || ven || 'ရွာသစ်',
    nameEn: ven || vmm || 'Village New',
    tractMm: tract || 'ကျေးရွာအုပ်စု',
    tractEn: tract || 'Village Tract',
    townshipMm: tw,
    townshipEn: tw,
    stateMm: MM_NAME[stateEn] || stateEn,
    stateEn,
    districtEn: dist || '—',
    latitude: lat || 0,
    longitude: lng || 0,
    latDisplay: latT || String(lat || 0),
    lngDisplay: lngT || String(lng || 0),
    source: src || '—',
  };
}

export async function loadState(stateEn: string, base = ''): Promise<Village[]> {
  const hit = stateCache.get(stateEn);
  if (hit) return hit;
  const p = inflight.get(stateEn);
  if (p) return p;
  const task = (async () => {
    const file = await fetchJSON<CompactFile>(`${absBase(base)}data/${stateSlug(stateEn)}.json`);
    const villages = file.rows.map((r, i) => toVillage(file.state || stateEn, i, r));
    stateCache.set(stateEn, villages);
    inflight.delete(stateEn);
    return villages;
  })();
  inflight.set(stateEn, task);
  return task;
}

/** Decide which state files are needed for given filters (avoids downloading everything). */
export async function loadRelevantStates(
  filters: { state: string; township: string },
  base = '',
  onProgress?: (loaded: number, total: number) => void
): Promise<Village[]> {
  // 1) Specific state selected -> load only that file (fastest)
  if (filters.state) {
    const v = await loadState(filters.state, base);
    onProgress?.(1, 1);
    return v;
  }
  // 2) Township query -> look up candidate states from tiny index
  const tq = filters.township.toLowerCase().trim();
  if (tq) {
    const idx = await getTownshipIndex(base);
    const matched = new Set<string>();
    for (const t of idx) {
      if (t.township.toLowerCase().includes(tq)) matched.add(t.stateEn);
    }
    const states = [...matched];
    if (states.length > 0 && states.length <= 5) {
      const out: Village[] = [];
      let done = 0;
      await Promise.all(
        states.map(async (s) => {
          const v = await loadState(s, base);
          out.push(...v);
          done++;
          onProgress?.(done, states.length);
        })
      );
      return out;
    }
  }
  // 3) No filter (or very broad): load all progressively, smallest first
  const manifest = await getManifest(base);
  const ordered = [...manifest.states].sort((a, b) => a.count - b.count);
  const out: Village[] = [];
  let done = 0;
  const CONCURRENCY = 3;
  for (let i = 0; i < ordered.length; i += CONCURRENCY) {
    const batch = ordered.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((s) => loadState(s.stateEn, base)));
    for (const r of results) out.push(...r);
    done += batch.length;
    onProgress?.(done, ordered.length);
  }
  return out;
}
