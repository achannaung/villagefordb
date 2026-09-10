import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { MOCK_VILLAGES } from './data/villages';
import { Village, FlaggedVillage, MonitorNote } from './types';
import FilterBar from './components/FilterBar';
import VillageTable from './components/VillageTable';
import { Database, Search, CheckCircle2, SlidersHorizontal, Loader2, Wifi, AlertTriangle, Moon, Sun } from 'lucide-react';
import { getManifest, getTownshipIndex, loadRelevantStates } from './utils/dataLoader';
import type { TownshipEntry } from './utils/dataLoader';

const VillageDetailPanel = React.lazy(() => import('./components/VillageDetailPanel'));

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('villagefinder_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (theme === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    try {
      localStorage.setItem('villagefinder_theme', theme);
    } catch (e) {
      console.error(e);
    }
  }, [theme]);

  // Dataset state — starts with tiny fallback, loads real data only on demand
  const [allVillages, setAllVillages] = useState<Village[]>(MOCK_VILLAGES);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [totalRecords, setTotalRecords] = useState<number>(MOCK_VILLAGES.length);
  const [loadProgress, setLoadProgress] = useState<string>('');
  const [townshipOptions, setTownshipOptions] = useState<TownshipEntry[]>([]);

  const [selectedState, setSelectedState] = useState('');
  const [townshipQuery, setTownshipQuery] = useState('');
  const [villageQuery, setVillageQuery] = useState('');
  const [villageEnQuery, setVillageEnQuery] = useState('');

  const [appliedFilters, setAppliedFilters] = useState({ state: '', township: '', village: '', villageEn: '' });
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const townshipInputRef = useRef<HTMLInputElement | null>(null);

  const [flaggedStates, setFlaggedStates] = useState<Record<string, FlaggedVillage>>(() => {
    try {
      const saved = localStorage.getItem('villagefinder_flags');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [noteStates, setNoteStates] = useState<Record<string, MonitorNote>>(() => {
    try {
      const saved = localStorage.getItem('villagefinder_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [pcodeCopied, setPcodeCopied] = useState(false);

  // Instant tiny index load (~20KB): manifest + township list. No 8.5MB download.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [manifest, towns] = await Promise.all([getManifest(), getTownshipIndex()]);
        if (cancelled) return;
        setTotalRecords(manifest.total);
        setTownshipOptions(towns);
      } catch (e) {
        if (!cancelled) setDownloadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateStatus = (villageId: string, status: FlaggedVillage['status']) => {
    const updated = { ...flaggedStates, [villageId]: { villageId, flaggedAt: new Date().toISOString(), status } };
    setFlaggedStates(updated);
    try {
      localStorage.setItem('villagefinder_flags', JSON.stringify(updated));
    } catch {}
  };

  const handleUpdateNote = (villageId: string, note: string) => {
    const updated = { ...noteStates, [villageId]: { villageId, note, updatedAt: new Date().toISOString() } };
    setNoteStates(updated);
    try {
      localStorage.setItem('villagefinder_notes', JSON.stringify(updated));
    } catch {}
  };

  // Merge helper (dedupe by id) — keeps previously loaded states in the pool
  const mergeIntoPool = (incoming: Village[]) => {
    setAllVillages((prev) => {
      const base = prev.length > MOCK_VILLAGES.length ? prev : [];
      if (base.length === 0) return incoming;
      const map = new Map<string, Village>();
      for (const v of base) map.set(v.id, v);
      for (const v of incoming) map.set(v.id, v);
      return Array.from(map.values());
    });
  };

  // Recent searches (persisted, max 6)
  interface RecentSearch {
    state: string;
    township: string;
    village: string;
    villageEn: string;
  }
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => {
    try {
      const saved = localStorage.getItem('villagefinder_recent');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const saveRecent = (r: RecentSearch) => {
    if (!r.state && !r.township && !r.village && !r.villageEn) return;
    setRecentSearches((prev) => {
      const next = [
        r,
        ...prev.filter(
          (p) =>
            !(p.state === r.state && p.township === r.township && p.village === r.village && p.villageEn === r.villageEn)
        ),
      ].slice(0, 6);
      try {
        localStorage.setItem('villagefinder_recent', JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const formatRecent = (r: RecentSearch) =>
    [r.state, r.township, r.villageEn || r.village].filter(Boolean).join(' • ') || 'All records';

  // Core search with explicit params (loader caches files, repeats are instant)
  const runSearch = async (s: string, ts: string, v: string, ve: string) => {
    setIsLoading(true);
    setDownloadError(null);
    try {
      const filters = { state: s, township: ts };
      setLoadProgress(s ? `Loading ${s}…` : 'Finding matching townships…');
      const villages = await loadRelevantStates(filters, '', (done, total) => {
        if (total > 1) setLoadProgress(`Loading datasets ${done}/${total}…`);
      });
      mergeIntoPool(villages);
      setRegistryLoaded(true);
      const applied = { state: s, township: ts, village: v, villageEn: ve };
      setAppliedFilters(applied);
      setHasSearched(true);
      saveRecent(applied);
    } catch (err) {
      console.error(err);
      setDownloadError(err instanceof Error ? err.message : String(err));
      setAppliedFilters({ state: s, township: ts, village: v, villageEn: ve });
      setHasSearched(true);
    } finally {
      setIsLoading(false);
      setLoadProgress('');
    }
  };

  const handleSearch = () => runSearch(selectedState, townshipQuery, villageQuery, villageEnQuery);

  const applyRecent = (r: RecentSearch) => {
    setSelectedState(r.state);
    setTownshipQuery(r.township);
    setVillageQuery(r.village);
    setVillageEnQuery(r.villageEn);
    runSearch(r.state, r.township, r.village, r.villageEn);
  };

  const handleClear = () => {
    setSelectedState('');
    setTownshipQuery('');
    setVillageQuery('');
    setVillageEnQuery('');
    setAppliedFilters({ state: '', township: '', village: '', villageEn: '' });
    setHasSearched(false);
  };

  // Global keyboard shortcuts: "/" focuses township, "Enter" searches, "Esc" clears/closes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        townshipInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (selectedVillage) setSelectedVillage(null);
        else handleClear();
      } else if (e.key === 'Enter' && !typing) {
        handleSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Unique village names from the loaded pool → autocomplete suggestions
  const villageEnOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of allVillages) {
      if (v.nameEn) set.add(v.nameEn);
      if (set.size >= 3000) break;
    }
    return [...set].sort();
  }, [allVillages]);
  const villageMmOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of allVillages) {
      if (v.nameMm) set.add(v.nameMm);
      if (set.size >= 3000) break;
    }
    return [...set].sort();
  }, [allVillages]);

  // Memoized filtering (fast even for 19k rows)
  const filteredVillages = useMemo(() => {
    const fState = appliedFilters.state;
    const fTs = appliedFilters.township.toLowerCase().trim();
    const fV = appliedFilters.village.toLowerCase().trim();
    const fVE = appliedFilters.villageEn.toLowerCase().trim();
    if (!fState && !fTs && !fV && !fVE) return hasSearched ? allVillages.slice(0, 5000) : [];
    const out: Village[] = [];
    for (let i = 0; i < allVillages.length; i++) {
      const v = allVillages[i];
      if (fState && v.stateEn !== fState) continue;
      if (fTs && !(v.townshipEn.toLowerCase().includes(fTs) || v.townshipMm.toLowerCase().includes(fTs))) continue;
      if (fV && !(v.nameEn.toLowerCase().includes(fV) || v.nameMm.toLowerCase().includes(fV))) continue;
      if (fVE && !v.nameEn.toLowerCase().includes(fVE)) continue;
      out.push(v);
      if (out.length >= 20000) break;
    }
    return out;
  }, [allVillages, appliedFilters, hasSearched]);

  const handleCopyAllPCodes = () => {
    if (filteredVillages.length === 0) return;
    const codes = filteredVillages.slice(0, 5000).map((v) => v.pcode).join('\n');
    navigator.clipboard.writeText(codes);
    setPcodeCopied(true);
    setTimeout(() => setPcodeCopied(false), 2000);
  };

  const handleExportCSV = () => {
    if (filteredVillages.length === 0) return;
    const headers = ['PCode', 'Village (MM)', 'Village (EN)', 'Village Tract', 'Township', 'State/Region', 'District', 'Latitude', 'Longitude', 'Source', 'Note'];
    const rows = filteredVillages.slice(0, 20000).map((v) => {
      const note = noteStates[v.id]?.note || '';
      const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
      return [v.pcode, q(v.nameMm), q(v.nameEn), q(v.tractEn), q(v.townshipEn), q(v.stateEn), q(v.districtEn), v.latitude, v.longitude, q(v.source), q(note)].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `village_finder_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen py-10 px-4 md:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-end items-center mb-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 shadow-xl"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (<><Sun size={13} className="text-amber-400" /><span>Light Mode</span></>) : (<><Moon size={13} className="text-indigo-400" /><span>Dark Mode</span></>)}
          </button>
        </div>

        <header id="header-section" className="text-center space-y-3 py-6 relative">
          <div className="mx-auto w-16 h-16 bg-white/5 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center mb-2 shadow-2xl">
            <Database className="text-indigo-400" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white font-serif tracking-tight drop-shadow-lg">Village Finder</h1>
          <p className="text-sm md:text-base text-slate-300 font-sans uppercase tracking-[0.2em] font-semibold max-w-md mx-auto">
            GAD Coordinate Database • <span className="text-indigo-300 font-extrabold">ACA</span>
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent mx-auto mt-4 rounded-full"></div>
        </header>

        <div id="registry-status-banner" className="w-full">
          {isDownloading || isLoading ? (
            <div className="glass-panel border-amber-500/30 bg-amber-500/5 text-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><Loader2 className="animate-spin" size={18} /></div>
                <div>
                  <div className="text-sm font-semibold">{loadProgress || 'Searching…'}</div>
                  <div className="text-xs text-amber-300/70 mt-0.5">Only matching state files are loaded, not the full 8.5MB.</div>
                </div>
              </div>
              <div className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20">Fast index active</div>
            </div>
          ) : registryLoaded ? (
            <div className="glass-panel border-emerald-500/30 bg-emerald-500/5 text-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Wifi size={18} /></div>
                <div>
                  <div className="text-sm font-semibold">Fast Registry Active — {allVillages.length.toLocaleString()} villages loaded</div>
                  <div className="text-xs text-emerald-300/70 mt-0.5">Total available {totalRecords.toLocaleString()} across 15 states. Township index: {townshipOptions.length} names.</div>
                </div>
              </div>
              <div className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">{allVillages.length.toLocaleString()} in memory</div>
            </div>
          ) : (
            <div className="glass-panel border-indigo-500/30 bg-indigo-500/5 text-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><Database size={18} /></div>
                <div>
                  <div className="text-sm font-semibold">Instant-ready — {totalRecords.toLocaleString()} records indexed</div>
                  <div className="text-xs text-indigo-300/70 mt-0.5">Search loads only the matching state file. No more 8.5MB wait on page open.</div>
                </div>
              </div>
              <div className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/20">~20KB initial load</div>
            </div>
          )}

          {downloadError && (
            <div className="glass-panel border-rose-500/30 bg-rose-500/5 text-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border mt-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400"><AlertTriangle size={18} /></div>
                <div>
                  <div className="text-sm font-semibold">Load issue — showing local fallback</div>
                  <div className="text-xs text-rose-300/70 mt-0.5">{downloadError}</div>
                </div>
              </div>
              <div className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">Offline Safe Mode</div>
            </div>
          )}
        </div>

        <FilterBar
          selectedState={selectedState}
          setSelectedState={setSelectedState}
          townshipQuery={townshipQuery}
          setTownshipQuery={setTownshipQuery}
          villageQuery={villageQuery}
          setVillageQuery={setVillageQuery}
          villageEnQuery={villageEnQuery}
          setVillageEnQuery={setVillageEnQuery}
          townshipInputRef={townshipInputRef}
          townshipOptions={townshipOptions}
          villageEnOptions={villageEnOptions}
          villageMmOptions={villageMmOptions}
          onSearch={handleSearch}
          onClear={handleClear}
          totalCount={totalRecords}
          filteredCount={filteredVillages.length}
          hasSearched={hasSearched}
        />

        {isLoading ? (
          <div id="loading-indicator" className="glass-panel rounded-2xl p-16 text-center shadow-2xl border border-slate-800 flex flex-col items-center justify-center gap-4">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-400 animate-spin"></div>
              <Database size={24} className="absolute text-indigo-400 animate-bounce" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white font-serif">{loadProgress || 'Searching…'}</h4>
              <p className="text-xs text-slate-400 mt-1">Loading only matching datasets…</p>
            </div>
          </div>
        ) : !hasSearched ? (
          <div id="search-placeholder" className="glass-panel rounded-2xl p-12 sm:p-16 text-center shadow-2xl border border-slate-800 flex flex-col items-center justify-center gap-6">
            <div className="p-4 bg-indigo-500/10 rounded-full text-indigo-400 border border-indigo-500/20 shadow-inner animate-bounce"><Search size={36} /></div>
            <div className="max-w-md mx-auto space-y-2">
              <h4 className="text-xl font-bold text-white font-serif">GAD Village Search</h4>
              <p className="text-sm text-slate-400 leading-relaxed">Select a State/Region or enter a Township/Village name and click <strong className="text-indigo-400 font-semibold">Search</strong>.</p>
            </div>
            <div className="flex flex-col items-center gap-3 max-w-lg">
              <span className="text-xs text-slate-500 font-medium select-none">Or click a shortcut:</span>
              <div className="flex flex-wrap justify-center gap-2">
                {['Ayeyarwady Region', 'Shan State'].map((s) => (
                  <button key={s} onClick={() => { setSelectedState(s); setTownshipQuery(''); setVillageQuery(''); setVillageEnQuery(''); runSearch(s, '', '', ''); }}
                    className="px-3.5 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-300 border border-slate-800 hover:border-indigo-500/40 hover:text-indigo-300 transition cursor-pointer">{s}</button>
                ))}
                <button onClick={() => { setTownshipQuery('Bogale'); setSelectedState('Ayeyarwady Region'); setVillageQuery(''); setVillageEnQuery(''); runSearch('Ayeyarwady Region', 'Bogale', '', ''); }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-300 border border-slate-800 hover:border-indigo-500/40 hover:text-indigo-300 transition cursor-pointer">Bogale Township</button>
              </div>
            </div>
            {recentSearches.length > 0 && (
              <div className="flex flex-col items-center gap-3 max-w-lg">
                <span className="text-xs text-slate-500 font-medium select-none">Recent searches:</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {recentSearches.map((r, i) => (
                    <button key={i} onClick={() => applyRecent(r)} title="Repeat this search"
                      className="max-w-[220px] truncate px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-xs text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 transition cursor-pointer">
                      {formatRecent(r)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <VillageTable villages={filteredVillages} flaggedStates={flaggedStates} onSelectVillage={setSelectedVillage} onCopyAllPCodes={handleCopyAllPCodes} pcodeCopied={pcodeCopied} onExportCSV={handleExportCSV} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div id="about-card" className="glass-panel rounded-2xl p-6 shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
            <h3 className="text-xl font-bold text-white font-serif mb-4 flex items-center gap-2"><CheckCircle2 size={18} className="text-indigo-400" /><span>About This Tool</span></h3>
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
              <p className="flex gap-3"><span className="text-indigo-400 font-bold text-lg select-none">♦</span><span>Search {totalRecords.toLocaleString()} villages with precise GAD coordinates across Myanmar.</span></p>
              <p className="flex gap-3"><span className="text-indigo-400 font-bold text-lg select-none">♦</span><span>Data is split by state for instant loading, with real P-Codes, tracts, districts and sources.</span></p>
            </div>
            <div className="mt-6"><span className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/10 text-indigo-300 font-semibold py-1.5 px-3 rounded-lg border border-indigo-500/20"><Database size={12} /><span>Data Source: GAD Coordinate Database</span></span></div>
          </div>
          <div id="features-card" className="glass-panel rounded-2xl p-6 shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
            <h3 className="text-xl font-bold text-white font-serif mb-4 flex items-center gap-2"><SlidersHorizontal size={18} className="text-indigo-400" /><span>Key Features</span></h3>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex items-start gap-3"><span className="text-emerald-400 font-bold mt-0.5 select-none">✔</span><div><strong className="text-white">Instant State-split Loading:</strong><p className="text-xs text-slate-400 mt-0.5">Only matching state files load. No full 8.5MB download on open.</p></div></li>
              <li className="flex items-start gap-3"><span className="text-emerald-400 font-bold mt-0.5 select-none">✔</span><div><strong className="text-white">Autocomplete + Recent:</strong><p className="text-xs text-slate-400 mt-0.5">Type-ahead suggestions and one-click repeat searches.</p></div></li>
              <li className="flex items-start gap-3"><span className="text-emerald-400 font-bold mt-0.5 select-none">✔</span><div><strong className="text-white">Lazy Interactive Map:</strong><p className="text-xs text-slate-400 mt-0.5">Key-free Esri/OSM maps load only when a village is opened.</p></div></li>
              <li className="flex items-start gap-3"><span className="text-emerald-400 font-bold mt-0.5 select-none">✔</span><div><strong className="text-white">Copy &amp; Export:</strong><p className="text-xs text-slate-400 mt-0.5">Copy P-Codes/coords or export results to CSV.</p></div></li>
            </ul>
          </div>
        </div>

        <footer id="footer-section" className="text-center py-10 text-xs text-slate-500 border-t border-slate-800/60 mt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-serif">ACA© 2026 Village Finder • GAD Coordinate Database |</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500 border border-slate-700/30">v1.0-Pro</span>
            <span>GAD Conformant</span>
          </div>
        </footer>

        {selectedVillage && (
          <Suspense fallback={null}>
            <VillageDetailPanel village={selectedVillage} onClose={() => setSelectedVillage(null)}
              flaggedState={selectedVillage ? flaggedStates[selectedVillage.id] : undefined}
              noteState={selectedVillage ? noteStates[selectedVillage.id] : undefined}
              onUpdateStatus={handleUpdateStatus} onUpdateNote={handleUpdateNote} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
