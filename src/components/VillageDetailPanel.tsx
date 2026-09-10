import React, { useState, useEffect, Suspense } from 'react';
import { Village, FlaggedVillage, MonitorNote } from '../types';
const LocationMap = React.lazy(() => import('./LocationMap'));
import {
  X,
  MapPin,
  FileText,
  Activity,
  CheckCircle,
  ExternalLink,
  Clipboard,
  Check,
  Copy,
  Database
} from 'lucide-react';

interface VillageDetailPanelProps {
  village: Village | null;
  onClose: () => void;
  flaggedState: FlaggedVillage | undefined;
  noteState: MonitorNote | undefined;
  onUpdateStatus: (villageId: string, status: FlaggedVillage['status']) => void;
  onUpdateNote: (villageId: string, note: string) => void;
}

export default function VillageDetailPanel({
  village,
  onClose,
  noteState,
  onUpdateNote,
}: VillageDetailPanelProps) {
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [pcodeCopied, setPcodeCopied] = useState(false);
  const [detailsCopied, setDetailsCopied] = useState(false);

  // Update text box if selected village changes
  useEffect(() => {
    if (village) {
      setNoteText(noteState?.note || '');
      setNoteSaved(false);
    }
  }, [village, noteState]);

  if (!village) return null;

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateNote(village.id, noteText);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const copyPCode = () => {
    navigator.clipboard.writeText(village.pcode);
    setPcodeCopied(true);
    setTimeout(() => setPcodeCopied(false), 2000);
  };

  const copyFullDetails = () => {
    const details =
`Village Name (English): ${village.nameEn}
Village Name (Burmese): ${village.nameMm}
Village Tract: ${village.tractEn}
Township: ${village.townshipEn}
District: ${village.districtEn}
State/Region: ${village.stateEn}
P-Code: ${village.pcode}
Latitude: ${village.latitude}
Longitude: ${village.longitude}
Source: ${village.source}`;
    navigator.clipboard.writeText(details);
    setDetailsCopied(true);
    setTimeout(() => setDetailsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      {/* Backdrop overlay closer */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Slide-over panel */}
      <div className="relative w-full max-w-lg h-full glass-panel border-l border-slate-800 shadow-2xl flex flex-col z-10 animate-slide-in">

        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
              <Activity size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-serif">Village Details</h3>
              <p className="text-xs text-slate-400 font-mono">P-Code: {village.pcode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">

          {/* Main Titles */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-extrabold text-white font-serif tracking-tight">{village.nameMm}</h1>
              <span className="text-lg font-medium text-slate-400 font-sans">/ {village.nameEn}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400 font-sans flex-wrap">
              <span>{village.stateEn}</span>
              <span>•</span>
              <span>{village.districtEn} District</span>
              <span>•</span>
              <span>{village.townshipEn} Township</span>
            </div>
          </div>

          {/* P-Code & Source */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/20 border border-slate-800/80 rounded-xl p-3.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">GAD P-Code</span>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-indigo-300 font-bold">{village.pcode}</span>
                <button
                  onClick={copyPCode}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Copy P-Code"
                >
                  {pcodeCopied ? <Check size={12} className="text-emerald-400" /> : <Clipboard size={12} />}
                </button>
              </div>
            </div>

            <div className="bg-slate-900/20 border border-slate-800/80 rounded-xl p-3.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Data Source</span>
              <span className="font-mono text-sm text-slate-300 block font-bold">{village.source}</span>
            </div>
          </div>

          {/* Village Tract */}
          <div className="bg-slate-900/20 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Village Tract</span>
            <div className="flex items-center gap-1.5 text-sm text-slate-200 font-medium">
              <MapPin size={14} className="text-indigo-400 shrink-0" />
              <span className="truncate">{village.tractEn}</span>
            </div>
          </div>

          {/* Geographic Map (lazy: Leaflet loads only on open) */}
          <Suspense fallback={<div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">Loading map…</div>}>
            <LocationMap
              latitude={village.latitude}
              longitude={village.longitude}
              villageName={village.nameEn}
              townshipEn={village.townshipEn}
              stateEn={village.stateEn}
            />
          </Suspense>

          {/* Copy + Google Maps actions */}
          <div className="flex gap-2">
            <button
              onClick={copyFullDetails}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700"
            >
              {detailsCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{detailsCopied ? 'Details Copied!' : 'Copy Full Details'}</span>
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${village.latitude},${village.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ExternalLink size={14} />
              <span>Open in Google Maps</span>
            </a>
          </div>

          {/* Field Notes Form */}
          <form onSubmit={handleSaveNote} className="space-y-3">
            <label htmlFor="observations-note" className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <FileText size={12} className="text-indigo-400" />
              <span>Field Notes</span>
            </label>
            <textarea
              id="observations-note"
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Record field observations about this village here…"
              className="w-full glass-input rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none"
            />
            <div className="flex items-center justify-end">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition duration-150 flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20"
              >
                {noteSaved ? (
                  <>
                    <CheckCircle size={14} className="text-emerald-400" />
                    <span>Note Saved!</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    <span>Save Note</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 justify-center pt-1">
            <Database size={11} />
            <span>GAD Coordinate Database Registry</span>
          </div>

        </div>
      </div>
    </div>
  );
}
