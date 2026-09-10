import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Compass, 
  MapPin, 
  Navigation, 
  Globe, 
  Copy, 
  Check, 
  Plus, 
  Minus, 
  Maximize2, 
  Layers 
} from 'lucide-react';

interface LocationMapProps {
  latitude: number;
  longitude: number;
  villageName: string;
  townshipEn: string;
  stateEn: string;
}

// Convert Decimal Degrees to Degrees Minutes Seconds
function toDMS(val: number, isLat: boolean): string {
  const direction = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  const absolute = Math.abs(val);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Math.round((minutesNotTruncated - minutes) * 60);
  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
}

export default function LocationMap({
  latitude,
  longitude,
  villageName,
  townshipEn,
  stateEn,
}: LocationMapProps) {
  const [copied, setCopied] = useState(false);
  const [isDarkMap, setIsDarkMap] = useState(true);
  const [mapZoom, setMapZoom] = useState(12);
  const [tilesFailed, setTilesFailed] = useState(false);
  const tileErrorCount = useRef(0);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const dmsLat = useMemo(() => toDMS(latitude, true), [latitude]);
  const dmsLng = useMemo(() => toDMS(longitude, false), [longitude]);

  // Copy Lat, Lng to Clipboard
  const copyCoordinates = () => {
    navigator.clipboard.writeText(`${latitude.toFixed(8)}, ${longitude.toFixed(8)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Key-free tile providers (no API key needed, reliable worldwide):
  // dark  = Esri World Dark Gray Canvas, light = OpenStreetMap Standard
  const DARK_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
  const LIGHT_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  // 1. Initialize Leaflet Map once on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create Map Instance
    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark Esri layer default (no API key required)
    const tiles = L.tileLayer(DARK_URL, {
      maxZoom: 19,
    }).addTo(map);

    // If the network blocks tiles, show a fallback notice instead of a broken map
    tileErrorCount.current = 0;
    tiles.on('tileerror', () => {
      tileErrorCount.current += 1;
      if (tileErrorCount.current >= 8) setTilesFailed(true);
    });
    tiles.on('tileload', () => {
      tileErrorCount.current = 0;
      setTilesFailed(false);
    });

    mapRef.current = map;
    tileLayerRef.current = tiles;

    // Scale Control
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    // Sync zoom state
    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // 3. Keep Map synchronized with coordinates & map styles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Center map smoothly on coords
    map.setView([latitude, longitude], map.getZoom());

    // Update tile layer url based on mode
    if (tileLayerRef.current) {
      const tileUrl = isDarkMap ? DARK_URL : LIGHT_URL;
      tileErrorCount.current = 0;
      setTilesFailed(false);
      tileLayerRef.current.setUrl(tileUrl);
    }

    // Update or create custom marker
    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    } else {
      const markerHtml = `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-indigo-500/40 rounded-full animate-ping"></div>
          <div class="absolute w-5 h-5 bg-cyan-500/20 rounded-full"></div>
          <div class="relative w-3.5 h-3.5 bg-indigo-600 rounded-full border border-white shadow-lg flex items-center justify-center">
            <div class="w-1 h-1 bg-white rounded-full"></div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-leaflet-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(map);
      markerRef.current = marker;
    }
  }, [latitude, longitude, isDarkMap]);

  // Custom Controls
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    mapRef.current?.setView([latitude, longitude], 13);
  };

  const handleToggleStyle = () => {
    setIsDarkMap(!isDarkMap);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Header Panel */}
      <div className="p-4 border-b border-slate-800/60 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-indigo-400 animate-spin-slow" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Interactive GIS Map
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={copyCoordinates}
            className="text-[10px] bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 px-2 py-1 rounded border border-slate-700/80 transition flex items-center gap-1 cursor-pointer"
            title="Copy Latitude, Longitude"
          >
            {copied ? (
              <>
                <Check size={10} className="text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={10} />
                <span>Copy GPS</span>
              </>
            )}
          </button>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-medium transition"
          >
            <span>Open Maps</span>
            <Navigation size={10} className="transform rotate-45" />
          </a>
        </div>
      </div>

      {/* Main Coordinate Display Panel */}
      <div className="p-4 bg-slate-950/20 grid grid-cols-2 gap-4 border-b border-slate-800/40">
        <div className="space-y-1 bg-slate-950/40 border border-slate-900 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Latitude (Y)</span>
          <div className="text-sm font-extrabold text-white font-mono tracking-tight">{latitude.toFixed(8)}°</div>
          <div className="text-[11px] text-indigo-300 font-mono">{dmsLat}</div>
        </div>
        <div className="space-y-1 bg-slate-950/40 border border-slate-900 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Longitude (X)</span>
          <div className="text-sm font-extrabold text-white font-mono tracking-tight">{longitude.toFixed(8)}°</div>
          <div className="text-[11px] text-cyan-300 font-mono">{dmsLng}</div>
        </div>
      </div>

      {/* Actual Interactive Map Container */}
      <div className="relative h-64 bg-slate-950 overflow-hidden">
        
        {/* Leaflet container ref */}
        <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />

        {/* Floating Custom HUD Controls overlay */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5" style={{ zIndex: 1000 }}>
          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-slate-950/90 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 transition flex items-center justify-center shadow-lg cursor-pointer font-bold"
            title="Zoom In"
          >
            <Plus size={16} />
          </button>
          
          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-lg bg-slate-950/90 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 transition flex items-center justify-center shadow-lg cursor-pointer font-bold"
            title="Zoom Out"
          >
            <Minus size={16} />
          </button>

          {/* Recenter */}
          <button
            onClick={handleRecenter}
            className="w-8 h-8 rounded-lg bg-indigo-600/90 border border-indigo-500/40 text-white hover:bg-indigo-500 transition flex items-center justify-center shadow-lg cursor-pointer"
            title="Recenter Map"
          >
            <Maximize2 size={13} />
          </button>

          {/* Style Toggle */}
          <button
            onClick={handleToggleStyle}
            className={`w-8 h-8 rounded-lg border text-slate-300 hover:text-white transition flex items-center justify-center shadow-lg cursor-pointer ${
              isDarkMap 
                ? 'bg-slate-950/90 border-slate-800' 
                : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
            }`}
            title={isDarkMap ? "Switch to Street View" : "Switch to Dark View"}
          >
            <Layers size={14} />
          </button>
        </div>

        {/* Small floating HUD banner for village identity */}
        <div className="absolute bottom-3 right-3 z-10 bg-slate-950/90 border border-slate-800/80 text-[10px] px-2.5 py-1 rounded-lg shadow-xl flex items-center gap-1.5 backdrop-blur-sm pointer-events-none" style={{ zIndex: 1000 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-slate-200">{villageName}</span>
          <span className="text-slate-500 font-mono">Zoom: {mapZoom}</span>
        </div>

        {/* Tile-blocked fallback notice (no API key needed by these providers,
            but some networks block map servers — coordinates stay usable) */}
        {tilesFailed && (
          <div className="absolute inset-x-3 top-3 z-10 bg-amber-500/90 text-slate-950 text-[11px] font-semibold px-3 py-2 rounded-lg shadow-xl flex items-center justify-between gap-2" style={{ zIndex: 1000 }}>
            <span>Map tiles blocked on your network. Use “Open Maps” above for location.</span>
            <button onClick={() => setTilesFailed(false)} className="underline shrink-0" title="Dismiss">Hide</button>
          </div>
        )}
      </div>

      {/* Metadata Footer bar */}
      <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/40 text-[10px] text-slate-500 flex justify-between items-center">
        <span className="flex items-center gap-1">
          <Globe size={11} className="text-slate-600" />
          <span>Regional Context: {townshipEn} • {stateEn}</span>
        </span>
        <span className="font-mono text-indigo-400/80">{isDarkMap ? 'Esri • OpenStreetMap contributors' : '© OpenStreetMap contributors'}</span>
      </div>
    </div>
  );
}
