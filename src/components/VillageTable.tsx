import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Village } from '../types';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  Eye, 
  Bookmark, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles
} from 'lucide-react';

interface VillageTableProps {
  villages: Village[];
  onSelectVillage: (village: Village) => void;
  onCopyAllPCodes: () => void;
  pcodeCopied: boolean;
  onExportCSV: () => void;
}

type SortField = 'nameMm' | 'nameEn' | 'townshipEn' | 'stateEn' | 'pcode' | 'tractEn';

export default function VillageTable({
  villages,
  onSelectVillage,
  onCopyAllPCodes,
  pcodeCopied,
  onExportCSV,
}: VillageTableProps) {
  // Sort State
  const [sortField, setSortField] = useState<SortField>('nameMm');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Copy Feedback State
  const [copiedVillageId, setCopiedVillageId] = useState<string | null>(null);

  // Toast notification for copy confirmation (visible on desktop and mobile)
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showCopyToast = (message: string) => {
    setCopyToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setCopyToast(null), 1800);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [villages]);

  // Group-by-Tract state. Defaults ON when the result set is a single township
  // with many villages (the township-first flow), until the user toggles it.
  const [groupByTract, setGroupByTract] = useState(false);
  const [groupTouched, setGroupTouched] = useState(false);
  const [collapsedTracts, setCollapsedTracts] = useState<Set<string>>(new Set());

  const isSingleTownship = useMemo(() => {
    if (villages.length === 0) return false;
    const keys = new Set(villages.map((v) => `${v.stateEn}|${v.townshipEn}`));
    return keys.size === 1;
  }, [villages]);

  useEffect(() => {
    setCollapsedTracts(new Set());
    if (!groupTouched) setGroupByTract(isSingleTownship && villages.length > 50);
  }, [villages, isSingleTownship, groupTouched]);

  // Village count per tract across the whole filtered set (for group headers)
  const tractCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of villages) m.set(v.tractEn, (m.get(v.tractEn) || 0) + 1);
    return m;
  }, [villages]);

  const toggleTract = (tract: string) => {
    setCollapsedTracts((prev) => {
      const next = new Set(prev);
      if (next.has(tract)) next.delete(tract);
      else next.add(tract);
      return next;
    });
  };

  // Cached collator: creating Intl.Collator per comparison was a major slowdown for 19k rows
  const collator = useMemo(() => new Intl.Collator('my', { sensitivity: 'base', numeric: true }), []);

  // Sorting Logic
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset page on sort
  };

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="sort-indicator text-slate-400 hover:text-slate-300 transition-colors" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp size={14} className="sort-indicator text-accent-400" />
      : <ArrowDown size={14} className="sort-indicator text-accent-400" />;
  };

  const sortedVillages = useMemo(() => {
    const arr = [...villages];
    arr.sort((a, b) => {
      // When grouping, tract is the primary key so each tract's villages stay together
      if (groupByTract) {
        const tc = collator.compare(a.tractEn, b.tractEn);
        if (tc !== 0) return tc;
      }
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') {
        const c = collator.compare(valA, valB);
        return sortDirection === 'asc' ? c : -c;
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });
    return arr;
  }, [villages, sortField, sortDirection, collator, groupByTract]);

  // Pagination calculations
  const totalItems = sortedVillages.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedVillages = sortedVillages.slice(startIndex, startIndex + itemsPerPage);

  // Display rows for the current page: village rows, with a tract group header
  // inserted whenever the tract changes (when grouping is on). A header gets
  // "(continued)" when the same tract already started on the previous page.
  type PageRow =
    | { type: 'header'; tract: string; count: number; continued: boolean; collapsed: boolean }
    | { type: 'village'; village: Village };
  const pageRows = useMemo<PageRow[]>(() => {
    if (!groupByTract) return paginatedVillages.map((village) => ({ type: 'village' as const, village }));
    const rows: PageRow[] = [];
    const prevPageTract = startIndex > 0 ? sortedVillages[startIndex - 1]?.tractEn ?? null : null;
    let lastTract: string | null = null;
    paginatedVillages.forEach((village, i) => {
      if (village.tractEn !== lastTract) {
        rows.push({
          type: 'header',
          tract: village.tractEn,
          count: tractCounts.get(village.tractEn) || 0,
          continued: i === 0 && prevPageTract === village.tractEn,
          collapsed: collapsedTracts.has(village.tractEn),
        });
        lastTract = village.tractEn;
      }
      if (!collapsedTracts.has(village.tractEn)) rows.push({ type: 'village', village });
    });
    return rows;
  }, [groupByTract, paginatedVillages, sortedVillages, startIndex, tractCounts, collapsedTracts]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleCopyName = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!name || name === '—') return;
    const label = name.length > 32 ? `${name.slice(0, 32)}…` : name;
    navigator.clipboard
      .writeText(name)
      .then(() => {
        setCopiedVillageId(id);
        setTimeout(() => setCopiedVillageId((prev) => (prev === id ? null : prev)), 2000);
        showCopyToast(`Copied "${label}"`);
      })
      .catch(() => {
        showCopyToast('Copy failed — clipboard blocked');
      });
  };

  const handleCopyCoords = (e: React.MouseEvent, village: Village) => {
    e.stopPropagation();
    if (village.latitude === 0 && village.longitude === 0) return;
    const text = `${village.latDisplay}, ${village.lngDisplay}`;
    navigator.clipboard
      .writeText(text)
      .then(() => showCopyToast(`Copied "${text}"`))
      .catch(() => showCopyToast('Copy failed — clipboard blocked'));
  };

  // Smart Pagination generator for large datasets (handles 72,000+ rows / 7,200+ pages)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxNeighbours = 1; // Number of page buttons on either side of active page
    
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      const startNeighbour = Math.max(2, currentPage - maxNeighbours);
      const endNeighbour = Math.min(totalPages - 1, currentPage + maxNeighbours);
      
      if (startNeighbour > 2) {
        pages.push('...');
      }
      
      for (let i = startNeighbour; i <= endNeighbour; i++) {
        pages.push(i);
      }
      
      if (endNeighbour < totalPages - 1) {
        pages.push('...');
      }
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div id="table-container" className="glass-panel rounded-2xl shadow-2xl overflow-hidden mb-8 border border-slate-800">
      {/* Table Action Bar */}
      <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white font-display">Village Registry</h3>
          <p className="text-xs text-slate-400 mt-0.5">Click column headers to sort. Click a row to view full details.</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
          <button
            onClick={() => {
              setGroupTouched(true);
              setGroupByTract((g) => !g);
            }}
            disabled={villages.length === 0}
            aria-pressed={groupByTract}
            className={`flex-1 sm:flex-none border font-medium py-2 px-4 rounded-xl text-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
              groupByTract
                ? 'border-accent-500 bg-accent-500/15 text-white'
                : 'border-slate-700 hover:border-accent-500 hover:bg-accent-500/10 text-slate-300 hover:text-white'
            }`}
            title="Group villages by village tract"
          >
            <Layers size={16} />
            <span>Group by Tract</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${groupByTract ? 'bg-accent-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {groupByTract ? 'ON' : 'OFF'}
            </span>
          </button>

          {groupByTract && villages.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setCollapsedTracts(new Set())}
                className="text-accent-300 hover:text-white transition cursor-pointer"
              >
                Expand all
              </button>
              <span className="text-slate-600">|</span>
              <button
                onClick={() => setCollapsedTracts(new Set(tractCounts.keys()))}
                className="text-accent-300 hover:text-white transition cursor-pointer"
              >
                Collapse all
              </button>
            </div>
          )}

          <button
            onClick={onCopyAllPCodes}
            disabled={villages.length === 0}
            className="flex-1 sm:flex-none border border-slate-700 hover:border-accent-500 hover:bg-accent-500/10 disabled:opacity-50 disabled:pointer-events-none text-slate-300 hover:text-white font-medium py-2 px-4 rounded-xl text-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
            title="Copy all matching MIMU P-Codes to clipboard"
          >
            {pcodeCopied ? (
              <>
                <Check size={16} className="text-emerald-400" />
                <span>P-Codes Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copy P-Codes</span>
              </>
            )}
          </button>

          <button
            onClick={onExportCSV}
            disabled={villages.length === 0}
            className="flex-1 sm:flex-none bg-accent-600/20 hover:bg-accent-600/30 border border-accent-500/30 hover:border-accent-500 text-accent-300 hover:text-white font-medium py-2 px-4 rounded-xl text-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
            title="Export current selection to CSV"
          >
            <FileSpreadsheet size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Table Wrapper */}
      <div className="overflow-x-auto max-h-[550px]">
        {villages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-4 border border-slate-700/50">
              <Sparkles size={28} />
            </div>
            <h4 className="text-lg font-semibold text-white font-display">No Villages Matched</h4>
            <p className="text-sm text-slate-400 max-w-md mt-1">
              No records found matching your active search criteria. Try selecting another state, refining the township spelling, or clearing parameters.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse table-auto min-w-[880px]">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                <th 
                  className="px-3 py-3 sm:px-6 sm:py-4 font-sans cursor-pointer hover:bg-slate-900/60 transition hidden sm:table-cell"
                  onClick={() => handleSort('stateEn')}
                >
                  <div className="flex items-center">
                    <span>State / Region</span>
                    {getSortIndicator('stateEn')}
                  </div>
                </th>
                <th 
                  className="px-3 py-3 sm:px-6 sm:py-4 font-sans cursor-pointer hover:bg-slate-900/60 transition"
                  onClick={() => handleSort('townshipEn')}
                >
                  <div className="flex items-center">
                    <span>Township</span>
                    {getSortIndicator('townshipEn')}
                  </div>
                </th>
                <th 
                  className="px-3 py-3 sm:px-6 sm:py-4 font-sans cursor-pointer hover:bg-slate-900/60 transition"
                  onClick={() => handleSort('tractEn')}
                >
                  <div className="flex items-center">
                    <span>Village Tract</span>
                    {getSortIndicator('tractEn')}
                  </div>
                </th>
                <th 
                  className="px-3 py-3 sm:px-6 sm:py-4 font-sans cursor-pointer hover:bg-slate-900/60 transition"
                  onClick={() => handleSort('nameEn')}
                >
                  <div className="flex items-center">
                    <span>English Name</span>
                    {getSortIndicator('nameEn')}
                  </div>
                </th>
                <th 
                  className="px-3 py-3 sm:px-6 sm:py-4 font-sans cursor-pointer hover:bg-slate-900/60 transition"
                  onClick={() => handleSort('nameMm')}
                >
                  <div className="flex items-center">
                    <span>Burmese Name</span>
                    {getSortIndicator('nameMm')}
                  </div>
                </th>
                <th className="px-3 py-3 sm:px-6 sm:py-4 font-sans hidden md:table-cell">
                  <div className="flex items-center">
                    <span>Coordinates</span>
                  </div>
                </th>
                <th                   className="px-3 py-3 sm:px-6 sm:py-4 font-sans text-center w-[80px] sm:w-[100px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {pageRows.map((row) => {
                if (row.type === 'header') {
                  return (
                    <tr
                      key={`tract-${row.tract}`}
                      onClick={() => toggleTract(row.tract)}
                      className="bg-accent-950/40 hover:bg-accent-950/60 cursor-pointer transition"
                      title={row.collapsed ? 'Expand tract' : 'Collapse tract'}
                    >
                      <td colSpan={7} className="px-3 py-2 sm:px-6 sm:py-2.5">
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          {row.collapsed ? (
                            <ChevronRight size={14} className="text-accent-300 shrink-0" />
                          ) : (
                            <ChevronDown size={14} className="text-accent-300 shrink-0" />
                          )}
                          <span className="font-semibold text-accent-200">{row.tract}</span>
                          {row.continued && <span className="text-[11px] text-slate-400">(continued)</span>}
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 border border-accent-500/20">
                            {row.count} {row.count === 1 ? 'village' : 'villages'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const village = row.village;
                return (
                <tr
                  key={village.id}
                  onClick={() => onSelectVillage(village)}
                  onMouseEnter={() => {
                    // Preload the details chunk so Eye opens instantly, even on slow networks
                    void import('./VillageDetailPanel');
                  }}
                  className="glass-table-row hover:bg-slate-800/30 cursor-pointer transition text-sm group"
                >
                  {/* State / Region */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-300 font-sans text-xs sm:text-sm hidden sm:table-cell">
                    {village.stateEn}
                  </td>

                  {/* Township (Mm sub-line only when it differs from En) */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-300 font-sans text-xs sm:text-sm">
                    <span className="font-medium">{village.townshipEn}</span>
                    {village.townshipMm && village.townshipMm !== village.townshipEn && (
                      <span className="text-slate-400 text-xs block mt-0.5">{village.townshipMm}</span>
                    )}
                  </td>

                  {/* Village Tract */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-300 font-sans text-xs sm:text-sm">
                    {village.tractEn}
                  </td>

                  {/* English Name */}
                  <td 
                    className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-200 font-sans text-xs sm:text-sm cursor-pointer group/copy"
                    onClick={(e) => handleCopyName(e, village.id, village.nameEn)}
                    title="Click to copy English name"
                  >
                    <div className="flex items-center gap-1.5 hover:text-accent-300 transition-colors">
                      <span className="font-medium underline decoration-dotted decoration-slate-600 group-hover/copy:decoration-accent-400">
                        {village.nameEn}
                      </span>
                      {copiedVillageId === village.id ? (
                        <Check size={12} className="text-emerald-400 shrink-0" />
                      ) : (
                        <Copy size={12} className="text-slate-400 opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Burmese Name (click-to-copy, "—" when missing) */}
                  <td
                    className="px-3 py-3 sm:px-6 sm:py-3.5 font-sans font-medium text-white text-sm sm:text-base cursor-pointer group/copy"
                    onClick={(e) => handleCopyName(e, village.id, village.nameMm)}
                    title={village.nameMm === '—' ? 'No Burmese name' : 'Click to copy Burmese name'}
                  >
                    <div className="flex items-center gap-1.5 hover:text-accent-300 transition-colors">
                      <span className="underline decoration-dotted decoration-slate-600 group-hover/copy:decoration-accent-400">
                        {village.nameMm}
                      </span>
                      {village.nameMm !== '—' &&
                        (copiedVillageId === village.id ? (
                          <Check size={12} className="text-emerald-400 shrink-0" />
                        ) : (
                          <Copy size={12} className="text-slate-400 opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0" />
                        ))}
                    </div>
                  </td>

                  {/* Coordinates (click to copy full precision; "—" when 0,0) */}
                  <td
                    className="px-3 py-3 sm:px-6 sm:py-3.5 font-mono text-[11px] sm:text-xs text-slate-300 hidden md:table-cell"
                    onClick={(e) => handleCopyCoords(e, village)}
                    title={
                      village.latitude === 0 && village.longitude === 0
                        ? 'No coordinates for this village'
                        : 'Click to copy coordinates'
                    }
                  >
                    {village.latitude === 0 && village.longitude === 0 ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <span className="underline decoration-dotted decoration-slate-600 hover:text-accent-300 transition-colors cursor-pointer">
                        {village.latitude.toFixed(4)}, {village.longitude.toFixed(4)}
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVillage(village);
                      }}
                      className="p-1.5 rounded-lg bg-accent-500/10 text-accent-300 hover:bg-accent-500/20 hover:text-white transition group-hover:scale-105 cursor-pointer"
                      title="View full monitoring records"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination & Display Controls */}
      {villages.length > 0 && (
        <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none focus:border-accent-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>entries per page</span>
            <span className="mx-2 text-slate-600">|</span>
            <span>
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems} entries
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            
            {getPageNumbers().map((page, index) => {
              if (page === '...') {
                return (
                  <span key={`dots-${index}`} className="px-2 text-slate-400 font-semibold select-none text-xs">
                    ...
                  </span>
                );
              }
              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(Number(page))}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    currentPage === page
                      ? 'bg-accent-600 text-white shadow-lg shadow-accent-600/30'
                      : 'border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {/* Copy confirmation toast */}
      {copyToast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-900 text-white pl-3 pr-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 border border-slate-700 animate-fade-in max-w-[calc(100vw-3rem)]">
          <span className="p-1 rounded-full bg-emerald-500/20">
            <Check size={13} className="text-emerald-400" />
          </span>
          <span className="text-xs font-medium truncate">{copyToast}</span>
        </div>
      )}
    </div>
  );
}
