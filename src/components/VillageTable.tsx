import React, { useState, useMemo, useEffect } from 'react';
import { Village, FlaggedVillage } from '../types';
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
  Sparkles
} from 'lucide-react';

interface VillageTableProps {
  villages: Village[];
  flaggedStates: Record<string, FlaggedVillage>;
  onSelectVillage: (village: Village) => void;
  onCopyAllPCodes: () => void;
  pcodeCopied: boolean;
  onExportCSV: () => void;
}

type SortField = 'nameMm' | 'nameEn' | 'townshipEn' | 'stateEn' | 'pcode';

export default function VillageTable({
  villages,
  flaggedStates,
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

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [villages]);

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
      return <ArrowUpDown size={14} className="sort-indicator text-slate-500 hover:text-slate-300 transition-colors" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp size={14} className="sort-indicator text-indigo-400" />
      : <ArrowDown size={14} className="sort-indicator text-indigo-400" />;
  };

  const sortedVillages = useMemo(() => {
    const arr = [...villages];
    arr.sort((a, b) => {
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
  }, [villages, sortField, sortDirection, collator]);

  // Pagination calculations
  const totalItems = sortedVillages.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedVillages = sortedVillages.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleCopyName = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopiedVillageId(id);
    setTimeout(() => setCopiedVillageId(null), 2000);
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

  // Helper for status badge style
  const getStatusBadge = (villageId: string) => {
    const flag = flaggedStates[villageId];
    if (!flag) return null;

    switch (flag.status) {
      case 'monitored':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Monitored
          </span>
        );
      case 'alert':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            Alert
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            Inactive
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Pending
          </span>
        );
    }
  };

  return (
    <div id="table-container" className="glass-panel rounded-2xl shadow-2xl overflow-hidden mb-8 border border-slate-800">
      {/* Table Action Bar */}
      <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white font-serif">Village Registry</h3>
          <p className="text-xs text-slate-400 mt-0.5">Click column headers to sort. Click a row to view monitor panel.</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={onCopyAllPCodes}
            disabled={villages.length === 0}
            className="flex-1 sm:flex-none border border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 disabled:opacity-50 disabled:pointer-events-none text-slate-300 hover:text-white font-medium py-2 px-4 rounded-xl text-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
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
            className="flex-1 sm:flex-none bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white font-medium py-2 px-4 rounded-xl text-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
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
            <div className="w-16 h-16 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-500 mb-4 border border-slate-700/50">
              <Sparkles size={28} />
            </div>
            <h4 className="text-lg font-semibold text-white font-serif">No Villages Matched</h4>
            <p className="text-sm text-slate-400 max-w-md mt-1">
              No records found matching your active search criteria. Try selecting another state, refining the township spelling, or clearing parameters.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse table-auto min-w-[720px]">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                <th 
                  className="px-3 py-3 sm:px-6 sm:py-4 font-sans cursor-pointer hover:bg-slate-900/60 transition"
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
                <th                   className="px-3 py-3 sm:px-6 sm:py-4 font-sans text-center w-[80px] sm:w-[100px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginatedVillages.map((village) => (
                <tr 
                  key={village.id} 
                  onClick={() => onSelectVillage(village)}
                  className="glass-table-row hover:bg-slate-800/30 cursor-pointer transition text-sm group"
                >
                  {/* State / Region */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-300 font-sans text-xs sm:text-sm">
                    {village.stateEn}
                  </td>

                  {/* Township */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-300 font-sans text-xs sm:text-sm">
                    <span className="font-medium">{village.townshipEn}</span>
                    <span className="text-slate-500 text-xs block mt-0.5">{village.townshipMm}</span>
                  </td>

                  {/* English Name */}
                  <td 
                    className="px-3 py-3 sm:px-6 sm:py-3.5 text-slate-200 font-sans text-xs sm:text-sm cursor-pointer group/copy"
                    onClick={(e) => handleCopyName(e, village.id, village.nameEn)}
                    title="Click to copy English name"
                  >
                    <div className="flex items-center gap-1.5 hover:text-indigo-300 transition-colors">
                      <span className="font-medium underline decoration-dotted decoration-slate-600 group-hover/copy:decoration-indigo-400">
                        {village.nameEn}
                      </span>
                      {copiedVillageId === village.id ? (
                        <Check size={12} className="text-emerald-400 shrink-0" />
                      ) : (
                        <Copy size={12} className="text-slate-500 opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Burmese Name */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 font-sans font-medium text-white text-sm sm:text-base">
                    {village.nameMm}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-3 sm:px-6 sm:py-3.5 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVillage(village);
                      }}
                      className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:text-white transition group-hover:scale-105 cursor-pointer"
                      title="View full monitoring records"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
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
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
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
                  <span key={`dots-${index}`} className="px-2 text-slate-500 font-semibold select-none text-xs">
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
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
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
    </div>
  );
}
