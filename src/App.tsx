/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { parseVillagesCSV } from "./csvParser";
import { VillageRecord, Stats } from "./types";
import { VirtualizedList } from "./components/VirtualizedList";
import { MyanmarMap } from "./components/MyanmarMap";
import { DebouncedSearchInput } from "./components/DebouncedSearchInput";
import { 
  Search, 
  X, 
  MapPin, 
  Copy, 
  ExternalLink, 
  Compass, 
  Keyboard, 
  Filter, 
  Check, 
  Loader2, 
  ChevronRight, 
  Layers, 
  BookOpen,
  SlidersHorizontal,
  Map,
  Clock,
  HelpCircle,
  TrendingUp,
  Globe,
  Table,
  List,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface SearchQuery {
  id: string;
  text: string;
  type: "township" | "villageEn" | "villageMm";
  timestamp: number;
}

interface ClickToCopyProps {
  text: string;
  label: string;
  children: React.ReactNode;
  className?: string;
  hoverBg?: string;
  iconColor?: string;
}

function ClickToCopy({ 
  text, 
  label, 
  children, 
  className = "", 
  hoverBg = "hover:bg-slate-100",
  iconColor = "text-slate-400 group-hover:text-indigo-600"
}: ClickToCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleCopy}
      className={`group relative inline-flex items-center gap-1.5 cursor-copy rounded px-1 -mx-1 transition-all ${hoverBg} ${className}`}
      title={`Click to copy ${label}`}
    >
      <span className="truncate">{children}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center justify-center">
        {copied ? (
          <Check className="w-3 h-3 text-emerald-500 animate-pulse" />
        ) : (
          <Copy className={`w-3 h-3 ${iconColor}`} />
        )}
      </span>
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md pointer-events-none z-30 whitespace-nowrap animate-fade-in border border-slate-800">
          Copied!
        </span>
      )}
    </div>
  );
}

export default function App() {
  // Loading and Progress States
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Data States
  const [allRecords, setAllRecords] = useState<VillageRecord[]>([]);
  const [selectedState, setSelectedState] = useState<string>("");
  const [searchTownship, setSearchTownship] = useState<string>("");
  const [searchVillageEn, setSearchVillageEn] = useState<string>("");
  const [searchVillageMm, setSearchVillageMm] = useState<string>("");
  const [sortField, setSortField] = useState<keyof VillageRecord | "default">("villageMm");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // UI States
  const [activeVillage, setActiveVillage] = useState<VillageRecord | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "list" | "map">("table");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  // Recent Searches States
  const [recentSearches, setRecentSearches] = useState<SearchQuery[]>(() => {
    try {
      const saved = localStorage.getItem("recent_searches");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Sync recent searches with localStorage
  useEffect(() => {
    try {
      localStorage.setItem("recent_searches", JSON.stringify(recentSearches));
    } catch (e) {
      console.error("Error writing recent searches to localStorage:", e);
    }
  }, [recentSearches]);

  // Helper to add queries to recent searches gracefully
  const addRecentSearch = (text: string, type: "township" | "villageEn" | "villageMm") => {
    const cleanText = text.trim();
    if (!cleanText || cleanText.length < 2) return;

    setRecentSearches(prev => {
      const now = Date.now();
      // Look for a match within the last 15 seconds that is a prefix/suffix of the current search to merge them
      const existingIndex = prev.findIndex(q => 
        q.type === type && 
        (cleanText.toLowerCase().startsWith(q.text.toLowerCase()) || q.text.toLowerCase().startsWith(cleanText.toLowerCase())) &&
        (now - q.timestamp < 15000)
      );

      let updated = [...prev];
      if (existingIndex !== -1) {
        // Replace with the newer/more complete text
        updated.splice(existingIndex, 1);
      } else {
        // Filter exact duplicate
        updated = updated.filter(q => !(q.text.toLowerCase() === cleanText.toLowerCase() && q.type === type));
      }

      const newQuery: SearchQuery = {
        id: Math.random().toString(36).substring(2, 9),
        text: cleanText,
        type,
        timestamp: now
      };

      return [newQuery, ...updated].slice(0, 5);
    });
  };

  // Debounced search save effects
  useEffect(() => {
    if (!searchTownship.trim()) return;
    const timer = setTimeout(() => {
      addRecentSearch(searchTownship, "township");
    }, 1500);
    return () => clearTimeout(timer);
  }, [searchTownship]);

  useEffect(() => {
    if (!searchVillageEn.trim()) return;
    const timer = setTimeout(() => {
      addRecentSearch(searchVillageEn, "villageEn");
    }, 1500);
    return () => clearTimeout(timer);
  }, [searchVillageEn]);

  useEffect(() => {
    if (!searchVillageMm.trim()) return;
    const timer = setTimeout(() => {
      addRecentSearch(searchVillageMm, "villageMm");
    }, 1500);
    return () => clearTimeout(timer);
  }, [searchVillageMm]);

  // Search input ref for focusing via shortcut
  const searchTownshipRef = useRef<HTMLInputElement>(null);

  // Fetch and parse the villages CSV on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const response = await fetch("https://raw.githubusercontent.com/achannaung/Datasets/refs/heads/main/villages.csv");
        if (!response.ok) {
          throw new Error(`Failed to load villages database (status: ${response.status})`);
        }
        const csvText = await response.text();
        const parsed = parseVillagesCSV(csvText);
        
        // Default sort is A-Z Village Name (Burmese) using highly optimized fast string operator comparison.
        // Bypassing slow localeCompare for 70k elements allows the app to load instantly.
        const sorted = [...parsed].sort((a, b) => {
          const valA = a.villageMm || "";
          const valB = b.villageMm || "";
          if (valA === valB) return 0;
          return valA < valB ? -1 : 1;
        });
        
        setAllRecords(sorted);
        setLoading(false);
      } catch (error: any) {
        console.error("Error loading CSV:", error);
        setLoadError(error?.message || "An unknown error occurred while loading the dataset.");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus Search Box with '/' key
      if (e.key === "/" && document.activeElement !== searchTownshipRef.current) {
        e.preventDefault();
        searchTownshipRef.current?.focus();
        searchTownshipRef.current?.select();
      }
      
      // Clear filters with 'Escape'
      if (e.key === "Escape") {
        setSearchTownship("");
        setSearchVillageEn("");
        setSearchVillageMm("");
        setSelectedState("");
        setActiveVillage(null);
        showToast("Search and filters cleared");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Toast trigger helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((prev) => (prev === message ? null : prev));
    }, 2500);
  };

  // Extract unique high-level parameters for Sidebar Filtering
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    allRecords.forEach(r => { if (r.sr) states.add(r.sr); });
    return Array.from(states).sort();
  }, [allRecords]);

  // Calculate static metadata stats
  const stats = useMemo<Stats>(() => {
    const townships = new Set<string>();
    const districts = new Set<string>();
    const states = new Set<string>();
    
    allRecords.forEach(r => {
      if (r.township) townships.add(r.township);
      if (r.district) districts.add(r.district);
      if (r.sr) states.add(r.sr);
    });

    return {
      totalVillages: allRecords.length,
      totalTownships: townships.size,
      totalDistricts: districts.size,
      totalStates: states.size
    };
  }, [allRecords]);

  // Main list filtering & sorting
  const filteredRecords = useMemo(() => {
    const hasActiveSearch = !!(searchTownship.trim() || searchVillageEn.trim() || searchVillageMm.trim());
    if (!hasActiveSearch && !selectedState) {
      return [];
    }

    let result = [...allRecords];

    // 1. Filter by State
    if (selectedState) {
      result = result.filter(r => r.sr === selectedState);
    }

    // 2. Filter by Township search input
    if (searchTownship.trim()) {
      const q = searchTownship.toLowerCase().trim();
      result = result.filter(r => r.township.toLowerCase().includes(q));
    }

    // 3. Filter by Village (EN) search input
    if (searchVillageEn.trim()) {
      const q = searchVillageEn.toLowerCase().trim();
      result = result.filter(r => r.village.toLowerCase().includes(q));
    }

    // 4. Filter by Village (MM) search input
    if (searchVillageMm.trim()) {
      const q = searchVillageMm.trim();
      result = result.filter(r => (r.villageMm || "").includes(q));
    }

    // 5. Dynamic Sort
    if (sortField && sortField !== "default") {
      if (sortField === "villageMm") {
        if (sortDirection === "desc") {
          result.reverse();
        }
        // If sortDirection is "asc", it's already pre-sorted on mount, so we do nothing!
      } else {
        result.sort((a, b) => {
          const valA = a[sortField] || "";
          const valB = b[sortField] || "";

          // Handle numeric values for coordinates
          if (sortField === "latitude" || sortField === "longitude") {
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            if (!isNaN(numA) && !isNaN(numB)) {
              return sortDirection === "asc" ? numA - numB : numB - numA;
            }
          }

          // Handle string comparison (highly optimized fast operators instead of slow localeCompare)
          const strA = String(valA);
          const strB = String(valB);

          if (strA === strB) return 0;
          return sortDirection === "asc" 
            ? (strA < strB ? -1 : 1) 
            : (strA > strB ? -1 : 1);
        });
      }
    }

    return result;
  }, [allRecords, selectedState, searchTownship, searchVillageEn, searchVillageMm, sortField, sortDirection]);

  // Click-to-sort logic for table column headers
  const handleHeaderClick = (field: keyof VillageRecord) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
        showToast(`Sorting by ${field} descending`);
      } else {
        setSortDirection("asc");
        showToast(`Sorting by ${field} ascending`);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
      showToast(`Sorting by ${field} ascending`);
    }
  };

  // Render sort indicators dynamically
  const renderSortIcon = (field: keyof VillageRecord) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600 animate-fade-in ml-1.5 shrink-0" />
      : <ArrowDown className="w-3.5 h-3.5 text-indigo-600 animate-fade-in ml-1.5 shrink-0" />;
  };

  // Handle Copy details action
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  };

  const copyFullDetails = (village: VillageRecord) => {
    const details = `Village Name (English): ${village.village}
Village Name (Burmese): ${village.villageMm}
Township: ${village.township}
Village Tract: ${village.villageTract}
District: ${village.district}
State/Region: ${village.sr}
Latitude: ${village.latitude}
Longitude: ${village.longitude}
Source: ${village.source}
Myanmar Pcode: ${village.srPcode}`;
    
    navigator.clipboard.writeText(details);
    showToast("Full village details copied!");
  };

  // Helper to highlight matched search text in UI elegantly
  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-indigo-100 text-indigo-950 font-medium px-0.5 rounded-xs">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const hasSearchActive = !!(searchTownship.trim() || searchVillageEn.trim() || searchVillageMm.trim());

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "140px 80px 125px 125px 145px 145px 145px 95px 95px 85px",
    gap: "16px"
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-slate-800"
          >
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-sm font-medium tracking-wide">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo and Branding */}
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md shadow-indigo-600/10 flex items-center justify-center">
                <Compass className="w-6 h-6 animate-spin-slow text-indigo-50" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display flex items-center gap-2">
                  Village Name Finder
                </h1>
                <p className="text-xs text-slate-500 hidden sm:block font-medium">
                  Myanmar Administrative Geographic Information System
                </p>
              </div>
            </div>

            {/* Quick Actions & Help */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelpModal(true)}
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold"
                title="Keyboard Shortcuts Guide"
              >
                <Keyboard className="w-4 h-4" />
                <span className="hidden md:inline">Shortcuts</span>
              </button>
              
              <div className="hidden lg:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-xs text-slate-600 font-medium border border-slate-200">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>Active Database</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Stats ribbon */}
      {!loading && !loadError && (
        <section className="bg-slate-900 text-slate-300 py-3 px-4 border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:border-r border-slate-800 last:border-0">
              <Globe className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">States / Regions</span>
                <span className="text-sm font-bold text-white font-mono">{stats.totalStates}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:border-r border-slate-800 last:border-0">
              <Layers className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Districts</span>
                <span className="text-sm font-bold text-white font-mono">{stats.totalDistricts}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:border-r border-slate-800 last:border-0">
              <Map className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Townships</span>
                <span className="text-sm font-bold text-white font-mono">{stats.totalTownships}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Total Villages</span>
                <span className="text-sm font-bold text-white font-mono">
                  {stats.totalVillages.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Content Section */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6 overflow-hidden">
        
        {/* Loading and Error states */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <p className="text-base font-semibold text-slate-800 animate-pulse">Loading Villages Database...</p>
            <p className="text-xs text-slate-400 mt-2 max-w-sm text-center px-4">
              Parsing and indexing 72,314 village records with coordinates for offline lightning-fast performance.
            </p>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="bg-red-50 text-red-700 p-4 rounded-full mb-4">
              <X className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Failed to load dataset</h2>
            <p className="text-sm text-slate-500 max-w-md mt-2">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition"
            >
              Retry Loading App
            </button>
          </div>
        ) : (
          <>
            {/* Left Column: Sidebar Filters */}
            <aside className="w-full lg:w-64 flex flex-col gap-5 shrink-0">
              
              {/* Region Filter Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-4">
                <div className="flex items-center gap-2 text-slate-800 pb-2 border-b border-slate-100">
                  <Filter className="w-4.5 h-4.5 text-indigo-600" />
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Administrative Scope</span>
                </div>

                {/* State/Region Select */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">State / Region</label>
                  <select
                    value={selectedState}
                    onChange={(e) => {
                      setSelectedState(e.target.value);
                      setActiveVillage(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                  >
                    <option value="">All States / Regions</option>
                    {uniqueStates.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Recent Searches Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between text-slate-800 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Recent Searches</span>
                  </div>
                  {recentSearches.length > 0 && (
                    <button
                      onClick={() => {
                        setRecentSearches([]);
                        showToast("Recent searches cleared");
                      }}
                      className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase cursor-pointer transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {recentSearches.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-1 text-center">No recent searches</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {recentSearches.map((q) => {
                      // Human readable field label
                      let typeLabel = "Township";
                      if (q.type === "villageEn") typeLabel = "Village (EN)";
                      if (q.type === "villageMm") typeLabel = "Village (MM)";

                      return (
                        <div
                          key={q.id}
                          className="group flex items-center justify-between text-xs p-2 rounded-xl hover:bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all cursor-pointer"
                          onClick={() => {
                            if (q.type === "township") {
                              setSearchTownship(q.text);
                            } else if (q.type === "villageEn") {
                              setSearchVillageEn(q.text);
                            } else if (q.type === "villageMm") {
                              setSearchVillageMm(q.text);
                            }
                            showToast(`Applied search: "${q.text}"`);
                          }}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="font-semibold text-slate-800 truncate">{q.text}</span>
                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">{typeLabel}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecentSearches(prev => prev.filter(item => item.id !== q.id));
                            }}
                            className="text-slate-300 hover:text-red-500 p-1 rounded-md transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Delete query"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            {/* Middle and Right Content */}
            <main className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
              
              {/* Village List Container */}
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[450px]">
                
                {/* Search Bar & Controls Header */}
                <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col gap-3.5">
                  
                  {/* Three Dedicated Search Inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Township Search Input */}
                    <DebouncedSearchInput
                      inputRef={searchTownshipRef}
                      label="Township"
                      placeholder="Search Township..."
                      value={searchTownship}
                      onChange={(val) => setSearchTownship(val)}
                      onEnter={(val) => addRecentSearch(val, "township")}
                      className="w-full px-3 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl text-xs placeholder:text-slate-400 shadow-2xs focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                      showKbd={true}
                    />

                    {/* Village EN Search Input */}
                    <DebouncedSearchInput
                      label="Village (EN)"
                      placeholder="Search English Name..."
                      value={searchVillageEn}
                      onChange={(val) => setSearchVillageEn(val)}
                      onEnter={(val) => addRecentSearch(val, "villageEn")}
                      className="w-full px-3 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl text-xs placeholder:text-slate-400 shadow-2xs focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                    />

                    {/* Village MM Search Input */}
                    <DebouncedSearchInput
                      label="Village (MM)"
                      labelClassName="text-indigo-600 font-display"
                      placeholder="Search Burmese Name..."
                      value={searchVillageMm}
                      onChange={(val) => setSearchVillageMm(val)}
                      onEnter={(val) => addRecentSearch(val, "villageMm")}
                      className="w-full px-3 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl text-xs placeholder:text-slate-400 shadow-2xs focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold font-display"
                    />
                  </div>

                  {/* Filter tags & Sorting option */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1">
                    
                    {/* Filter states badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Filters:</span>
                      
                      {selectedState && (
                        <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 px-2 py-1 rounded-md font-semibold">
                          State: {selectedState}
                          <button onClick={() => setSelectedState("")} className="hover:text-red-600 ml-0.5 cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {searchTownship && (
                        <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 px-2 py-1 rounded-md font-semibold">
                          Township: "{searchTownship}"
                          <button onClick={() => setSearchTownship("")} className="hover:text-red-600 ml-0.5 cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {searchVillageEn && (
                        <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 px-2 py-1 rounded-md font-semibold">
                          Village EN: "{searchVillageEn}"
                          <button onClick={() => setSearchVillageEn("")} className="hover:text-red-600 ml-0.5 cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {searchVillageMm && (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-950 px-2 py-1 rounded-md font-semibold font-display">
                          Village MM: "{searchVillageMm}"
                          <button onClick={() => setSearchVillageMm("")} className="hover:text-red-600 ml-0.5 cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {!selectedState && !searchTownship && !searchVillageEn && !searchVillageMm && (
                        <span className="text-slate-400 text-xs italic">No filters active (Showing all villages)</span>
                      )}
                    </div>

                    {/* View Switcher and Sorting Controller */}
                    <div className="flex items-center gap-4 border-l border-slate-200 pl-4">
                      {/* View Switcher */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          onClick={() => setViewMode("table")}
                          className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                            viewMode === "table"
                              ? "bg-white text-indigo-600 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                          title="Table View"
                        >
                          <Table className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Table View</span>
                        </button>
                        <button
                          onClick={() => setViewMode("list")}
                          className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                            viewMode === "list"
                              ? "bg-white text-indigo-600 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                          title="List View"
                        >
                          <List className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">List View</span>
                        </button>
                        <button
                          onClick={() => setViewMode("map")}
                          className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                            viewMode === "map"
                              ? "bg-white text-indigo-600 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                          title="Map View"
                        >
                          <Map className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Map View</span>
                        </button>
                      </div>

                      {/* Sorting */}
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-500">Sort:</span>
                        <select
                          value={`${sortField}-${sortDirection}`}
                          onChange={(e: any) => {
                            const [field, dir] = e.target.value.split("-");
                            setSortField(field as any);
                            setSortDirection((dir || "asc") as any);
                          }}
                          className="bg-transparent border-0 font-bold text-slate-800 hover:text-indigo-600 cursor-pointer focus:ring-0 focus:outline-hidden py-0 pr-6 text-xs"
                        >
                          <option value="villageMm-asc">Village (Burmese) A-Z</option>
                          <option value="villageMm-desc">Village (Burmese) Z-A</option>
                          <option value="village-asc">Village (English) A-Z</option>
                          <option value="village-desc">Village (English) Z-A</option>
                          <option value="township-asc">Township A-Z</option>
                          <option value="township-desc">Township Z-A</option>
                          <option value="latitude-asc">Latitude Low to High</option>
                          <option value="latitude-desc">Latitude High to Low</option>
                          <option value="longitude-asc">Longitude Low to High</option>
                          <option value="longitude-desc">Longitude High to Low</option>
                          <option value="default-asc">Natural CSV Order</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Onboarding / Results Display Conditional */}
                {!hasSearchActive ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/20 text-center min-h-[400px]">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5 text-indigo-600 shadow-sm border border-indigo-100">
                      <Search className="w-8 h-8 animate-pulse" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 tracking-tight">Begin Exploring Myanmar Village Database</h3>
                    <p className="text-slate-500 text-xs mt-1.5 max-w-md leading-relaxed">
                      Please enter a Township, Village Name (English), or Burmese Name in the search inputs above to search through all <strong className="text-slate-700">{stats.totalVillages.toLocaleString()}</strong> records.
                    </p>
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
                      <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-2xs text-left">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wide">Tip 1</span>
                        <p className="text-xs text-slate-600 mt-2.5 leading-normal">Use the <strong className="text-slate-800">Township</strong> field to search inside administrative townships.</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-2xs text-left">
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wide">Tip 2</span>
                        <p className="text-xs text-slate-600 mt-2.5 leading-normal">Type Burmese unicode inside <strong className="text-slate-800">Village (MM)</strong> for native name matches.</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-2xs text-left">
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wide">Tip 3</span>
                        <p className="text-xs text-slate-600 mt-2.5 leading-normal">Click on any <strong className="text-slate-800">column header</strong> once results are displayed to sort.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Subtitle / Counter list summary */}
                    <div className="px-4 py-2.5 border-b border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Showing <strong className="text-slate-800">{filteredRecords.length.toLocaleString()}</strong> villages
                      </span>
                      <span className="hidden sm:inline text-[10px] text-slate-400 italic">
                        Press <kbd className="bg-slate-100 px-1 py-0.5 rounded-sm font-mono border">Esc</kbd> to clear filters
                      </span>
                    </div>

                    {/* Virtualized Village List / Map Switcher */}
                    {viewMode === "map" ? (
                      <MyanmarMap
                        filteredRecords={filteredRecords}
                        activeVillage={activeVillage}
                        onSelectVillage={setActiveVillage}
                      />
                    ) : (
                      <div className={`flex-1 relative flex flex-col ${viewMode === "table" ? "overflow-x-auto" : ""}`}>
                        <div className={viewMode === "table" ? "min-w-[1220px] flex-1 flex flex-col" : "flex-1 flex flex-col"}>
                          {viewMode === "table" && (
                            <div style={gridStyle} className="bg-slate-50 border-b border-slate-200 py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-display shrink-0 select-none">
                              <button
                                onClick={() => handleHeaderClick("sr")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                State/Region
                                {renderSortIcon("sr")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("srPcode")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold font-mono"
                              >
                                Pcode
                                {renderSortIcon("srPcode")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("district")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                District
                                {renderSortIcon("district")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("township")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                Township
                                {renderSortIcon("township")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("villageTract")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                Tract
                                {renderSortIcon("villageTract")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("village")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                Village (EN)
                                {renderSortIcon("village")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("villageMm")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                Village (MM)
                                {renderSortIcon("villageMm")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("latitude")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold font-mono"
                              >
                                Latitude
                                {renderSortIcon("latitude")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("longitude")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold font-mono"
                              >
                                Longitude
                                {renderSortIcon("longitude")}
                              </button>
                              <button
                                onClick={() => handleHeaderClick("source")}
                                className="group flex items-center hover:text-indigo-600 transition text-left font-bold"
                              >
                                Source
                                {renderSortIcon("source")}
                              </button>
                            </div>
                          )}
                          <div className="flex-1 relative">
                            <VirtualizedList<VillageRecord>
                              items={filteredRecords}
                              itemHeight={viewMode === "table" ? 52 : 76}
                              className="h-full max-h-[600px] lg:max-h-none"
                              renderItem={(item, index, style) => {
                                const isActive = activeVillage?.srPcode === item.srPcode && activeVillage?.village === item.village;
                                
                                if (viewMode === "table") {
                                  return (
                                    <div
                                      key={`${item.srPcode}-${index}`}
                                      style={{ ...style, ...gridStyle }}
                                      onClick={() => setActiveVillage(item)}
                                      id={`village-row-${index}`}
                                      className={`px-6 py-3.5 border-b border-slate-100 items-center cursor-pointer transition-all text-left ${
                                        isActive 
                                          ? "bg-indigo-50/50 border-l-4 border-l-indigo-600 pl-5 animate-fade-in font-semibold" 
                                          : "hover:bg-slate-50/50"
                                      }`}
                                    >
                                      <div className="text-xs text-slate-600 truncate pr-2">
                                        {item.sr}
                                      </div>
                                      <div className="text-xs text-slate-500 font-mono truncate pr-2">
                                        {item.srPcode}
                                      </div>
                                      <div className="text-xs text-slate-600 truncate pr-2">
                                        {item.district}
                                      </div>
                                      <div className="text-xs text-slate-600 truncate pr-2">
                                        {highlightMatch(item.township, searchTownship)}
                                      </div>
                                      <div className="text-xs text-slate-600 truncate pr-2">
                                        {item.villageTract}
                                      </div>
                                      <div className="text-xs font-bold text-slate-900 truncate pr-2">
                                        <ClickToCopy text={item.village} label="English Village Name">
                                          {highlightMatch(item.village, searchVillageEn)}
                                        </ClickToCopy>
                                      </div>
                                      <div className="text-sm font-display font-medium text-slate-900 truncate pr-2">
                                        <ClickToCopy text={item.villageMm || ""} label="Burmese Village Name">
                                          {highlightMatch(item.villageMm || "—", searchVillageMm)}
                                        </ClickToCopy>
                                      </div>
                                      <div className="text-xs font-mono text-slate-500 truncate pr-2">
                                        <ClickToCopy text={item.latitude} label="Latitude">
                                          {item.latitude}
                                        </ClickToCopy>
                                      </div>
                                      <div className="text-xs font-mono text-slate-500 truncate pr-2">
                                        <ClickToCopy text={item.longitude} label="Longitude">
                                          {item.longitude}
                                        </ClickToCopy>
                                      </div>
                                      <div className="text-xs text-slate-400 truncate pr-2">
                                        {item.source}
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={`${item.srPcode}-${index}`}
                                    style={style}
                                    onClick={() => setActiveVillage(item)}
                                    id={`village-row-${index}`}
                                    className={`px-4 py-3 border-b border-slate-100 flex items-center justify-between cursor-pointer transition-all ${
                                      isActive 
                                        ? "bg-indigo-50/50 border-l-4 border-l-indigo-600 pl-3 animate-fade-in" 
                                        : "hover:bg-slate-50/50"
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      {/* Village names row */}
                                      <div className="flex items-baseline gap-2.5">
                                        <h3 className="font-semibold text-sm text-slate-900 truncate">
                                          <ClickToCopy text={item.village} label="English Village Name">
                                            {highlightMatch(item.village, searchVillageEn)}
                                          </ClickToCopy>
                                        </h3>
                                        <span className="text-xs text-slate-500 font-bold font-display tracking-wide">
                                          <ClickToCopy text={item.villageMm || ""} label="Burmese Village Name">
                                            {highlightMatch(item.villageMm || "—", searchVillageMm)}
                                          </ClickToCopy>
                                        </span>
                                      </div>

                                      {/* Location tract & township */}
                                      <p className="text-xs text-slate-500 mt-1 truncate">
                                        <span className="font-semibold text-slate-600">Tract:</span> {item.villageTract} •{" "}
                                        <span className="font-semibold text-slate-600">Township:</span> {highlightMatch(item.township, searchTownship)}
                                      </p>
                                    </div>

                                    {/* Coordinates / Map Badge */}
                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                      <div className="text-right hidden sm:block">
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">Coordinates</p>
                                        <div className="text-xs font-mono text-slate-600 mt-0.5 flex items-center gap-1 justify-end">
                                          <ClickToCopy text={item.latitude} label="Latitude">
                                            {item.latitude}
                                          </ClickToCopy>
                                          <span className="text-slate-300">,</span>
                                          <ClickToCopy text={item.longitude} label="Longitude">
                                            {item.longitude}
                                          </ClickToCopy>
                                        </div>
                                      </div>
                                      <div className={`p-2 rounded-lg transition-colors ${
                                        isActive ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                                      }`}>
                                        <ChevronRight className="w-4 h-4" />
                                      </div>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right Column: Detailed Coordinate Locator Info Panel */}
              <AnimatePresence mode="wait">
                {activeVillage ? (
                  <motion.div
                    key="details-pane"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 15 }}
                    className="w-full lg:w-96 bg-white rounded-2xl border border-slate-200 shadow-md p-5 flex flex-col shrink-0 overflow-y-auto"
                    id="village-details-panel"
                  >
                    {/* Panel Header */}
                    <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                      <div>
                        <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                          Village Details
                        </span>
                        <h2 className="text-lg font-bold text-slate-900 mt-2 font-display">
                          <ClickToCopy text={activeVillage.village} label="English Village Name">
                            {activeVillage.village}
                          </ClickToCopy>
                        </h2>
                        <h3 className="text-sm font-semibold text-slate-600 mt-0.5">
                          <ClickToCopy text={activeVillage.villageMm || ""} label="Burmese Village Name">
                            {activeVillage.villageMm}
                          </ClickToCopy>
                        </h3>
                      </div>
                      <button
                        onClick={() => setActiveVillage(null)}
                        className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Coordinates Display Card (IMPORTANT: No decimals changed, pure form used) */}
                    <div className="mt-5 bg-slate-900 rounded-xl p-4 text-white border border-slate-800 relative overflow-hidden shadow-inner">
                      <div className="absolute right-2 -bottom-2 text-slate-800 opacity-20 pointer-events-none">
                        <Compass className="w-24 h-24" />
                      </div>
                      
                      <div className="flex justify-between items-center text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                        <span>Precise Coordinates</span>
                        <span className="text-[10px] text-indigo-400 border border-indigo-500/30 px-1.5 py-0.2 rounded-md font-mono">
                          GAD Original Form
                        </span>
                      </div>

                      <div className="space-y-3 font-mono relative z-10">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-slate-400 text-xs">Latitude:</span>
                          <span className="text-sm font-semibold text-indigo-300 tracking-wide select-all">
                            <ClickToCopy 
                              text={activeVillage.latitude} 
                              label="Latitude"
                              hoverBg="hover:bg-slate-800"
                              iconColor="text-indigo-400 group-hover:text-indigo-300"
                            >
                              {activeVillage.latitude}
                            </ClickToCopy>
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-slate-400 text-xs">Longitude:</span>
                          <span className="text-sm font-semibold text-indigo-300 tracking-wide select-all">
                            <ClickToCopy 
                              text={activeVillage.longitude} 
                              label="Longitude"
                              hoverBg="hover:bg-slate-800"
                              iconColor="text-indigo-400 group-hover:text-indigo-300"
                            >
                              {activeVillage.longitude}
                            </ClickToCopy>
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => copyToClipboard(`${activeVillage.latitude}, ${activeVillage.longitude}`, "Coordinates")}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-700"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Coords
                        </button>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${activeVillage.latitude},${activeVillage.longitude}`}
                          target="_blank"
                          referrerPolicy="no-referrer"
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Map
                        </a>
                      </div>
                    </div>

                    {/* Metadata & Administrative Stack */}
                    <div className="mt-5 space-y-3 flex-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Administrative Profile</h4>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] block font-semibold text-slate-400 uppercase tracking-wider">Township</span>
                          <span className="text-xs font-bold text-slate-800 block mt-0.5">{activeVillage.township}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] block font-semibold text-slate-400 uppercase tracking-wider">Village Tract</span>
                          <span className="text-xs font-bold text-slate-800 block mt-0.5 truncate" title={activeVillage.villageTract}>
                            {activeVillage.villageTract}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] block font-semibold text-slate-400 uppercase tracking-wider">District</span>
                          <span className="text-xs font-bold text-slate-800 block mt-0.5">{activeVillage.district}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="text-[10px] block font-semibold text-slate-400 uppercase tracking-wider">State / Region</span>
                          <span className="text-xs font-bold text-slate-800 block mt-0.5">{activeVillage.sr}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2 mt-4 text-xs text-slate-600">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px]">Administrative P-Code</span>
                          <span className="font-mono text-slate-700 bg-slate-200/50 px-1.5 py-0.5 rounded font-medium">{activeVillage.srPcode}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px]">Data Source Reference</span>
                          <span className="text-slate-700 font-semibold">{activeVillage.source}</span>
                        </div>
                      </div>
                    </div>

                    {/* Copy All Button */}
                    <button
                      onClick={() => copyFullDetails(activeVillage)}
                      className="w-full mt-6 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-200"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Complete Village Details
                    </button>
                  </motion.div>
                ) : (
                  <div className="hidden lg:flex w-96 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex-col items-center justify-center text-center text-slate-400 shrink-0">
                    <Compass className="w-12 h-12 text-slate-300 animate-spin-slow mb-4" />
                    <h3 className="text-sm font-bold text-slate-800">No Village Selected</h3>
                    <p className="text-xs text-slate-400 mt-2 max-w-xs">
                      Click on any village row in the list to reveal full administrative details, copy precise latitude/longitude, and open in map views.
                    </p>
                    
                    <div className="mt-8 border-t border-slate-100 pt-6 w-full space-y-3.5 text-left text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg">
                          <Keyboard className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-700">Quick Search focus</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Press "/" anytime to focus township search.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg">
                          <X className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-700">Instant reset</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Press "Esc" to clear search filters instantly.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </main>
          </>
        )}
      </div>

      {/* Keyboard Shortcuts Help Modal Overlay */}
      <AnimatePresence>
        {showHelpModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 relative overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-bold text-slate-900 font-display">Keyboard Shortcuts</h3>
                </div>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-700">Focus Township Search Input</span>
                  <kbd className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold shadow-2xs">
                    /
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-700">Clear Search & All Filters</span>
                  <kbd className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold shadow-2xs">
                    Esc
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-700">Close Detail Panel / Modals</span>
                  <kbd className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold shadow-2xs">
                    Esc
                  </kbd>
                </div>
              </div>

              <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-xs text-indigo-800 leading-relaxed">
                <strong>💡 High Performance Tip:</strong> The application pre-sorts 72,000+ records alphabetically by Burmese village name in memory. Searches, drills, and filters run entirely offline at 60 FPS.
              </div>

              <button
                onClick={() => setShowHelpModal(false)}
                className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Dismiss Guide
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400 mt-auto">
        <p className="font-semibold text-slate-500">
          Village Name Finder • 2026 GAD Coordinate Database Registry
        </p>
      </footer>
    </div>
  );
}
