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
  latDisplay?: string;
  lngDisplay?: string;
  villageName: string;
  townshipEn: string;
  stateEn: string;
}

// Round to 8 decimals, trailing zeros stripped (no zero-padding).
// e.g. 95.3609313964844 -> "95.3609314", 16.16144 -> "16.16144"
function formatCoord(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return String(parseFloat(val.toFixed(8)));
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
  latDisplay,
  lngDisplay,
  villageName,
  townshipEn,
  stateEn,
}: LocationMapProps) {
  const [copied, setCopied] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'street' | 'sat'>('dark');
  const [mapZoom, setMapZoom] = useState(12);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const tileErrorCount = useRef(0);
  const tilesLoadedCount = useRef(0);
  const loadTimer = useRef<number | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerStyleRef = useRef<typeof mapStyle>('dark');

  const dmsLat = useMemo(() => toDMS(latitude, true), [latitude]);
  const dmsLng = useMemo(() => toDMS(longitude, false), [longitude]);

  // Display strings preserve original precision (fallback: format numbers)
  const dispLat = useMemo(
    () => latDisplay || formatCoord(latitude),
    [latDisplay, latitude]
  );
  const dispLng = useMemo(
    () => lngDisplay || formatCoord(longitude),
    [lngDisplay, longitude]
  );

  // Copy Lat, Lng to Clipboard
  const copyCoordinates = () => {
    navigator.clipboard.writeText(`${dispLat}, ${dispLng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Key-free tile providers (no API key needed, reliable worldwide):
  // dark   = Esri World Dark Gray Canvas
  // street = OpenStreetMap Standard
  // sat    = Esri World Imagery (satellite)
  const TILE_URLS = {
    dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    street: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  } as const;
  const STYLE_LABEL: Record<typeof mapStyle, string> = { dark: 'Dark', street: 'Street', sat: 'Satellite' };
  const STYLE_ATTR: Record<typeof mapStyle, string> = {
    dark: 'Esri • OpenStreetMap contributors',
    street: '© OpenStreetMap contributors',
    sat: 'Imagery © Esri, Maxar, Earthstar Geographics',
  };
  // Highest zoom with real tiles per provider (verified). Beyond this Leaflet
  // upscales (overzoom) instead of showing "data not available" placeholder tiles.
  const STYLE_NATIVE_ZOOM: Record<typeof mapStyle, number> = { dark: 16, street: 19, sat: 18 };

  // (Re)create the tile layer for a style, with loading + fallback handling
  const addLayer = (map: L.Map, style: typeof mapStyle) => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    tileErrorCount.current = 0;
    tilesLoadedCount.current = 0;
    setTilesFailed(false);
    setMapLoading(true);
    // If nothing loads within 8s (blocked/slow network), say so instead of staying black
    if (loadTimer.current) window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => {
      if (tilesLoadedCount.current === 0) {
        setTilesFailed(true);
        setMapLoading(false);
      }
    }, 8000);
    const tiles = L.tileLayer(TILE_URLS[style], {
      maxZoom: 19,
      maxNativeZoom: STYLE_NATIVE_ZOOM[style],
    }).addTo(map);
    // If the network blocks tiles, show a fallback notice instead of a broken map
    tiles.on('tileerror', () => {
      tileErrorCount.current += 1;
      if (tileErrorCount.current >= 8) {
        setTilesFailed(true);
        setMapLoading(false);
      }
    });
    tiles.on('tileload', () => {
      tileErrorCount.current = 0;
      tilesLoadedCount.current += 1;
      // Guarded updates: avoid a re-render storm (one per tile otherwise)
      setMapLoading((prev) => (prev ? false : prev));
      setTilesFailed((prev) => (prev ? false : prev));
    });
    tileLayerRef.current = tiles;
    layerStyleRef.current = style;
  };

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
    addLayer(map, 'dark');
    mapRef.current = map;

    // Scale Control
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    // Sync zoom state
    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    return () => {
      if (loadTimer.current) window.clearTimeout(loadTimer.current);
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

    // Swap the tile layer only when the style changed (new layer carries
    // the correct maxNativeZoom so deep zoom upscales instead of blanking)
    if (layerStyleRef.current !== mapStyle) {
      addLayer(map, mapStyle);
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
  }, [latitude, longitude, mapStyle]);

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

  // Cycle Dark -> Street -> Satellite -> Dark
  const handleToggleStyle = () => {
    setMapStyle((s) => (s === 'dark' ? 'street' : s === 'street' ? 'sat' : 'dark'));
  };
  const nextStyleLabel = mapStyle === 'dark' ? 'Street View' : mapStyle === 'street' ? 'Satellite View' : 'Dark View';

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
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Latitude (Y)</span>
          <div className="text-sm font-extrabold text-white font-mono tracking-tight">{dispLat}°</div>
          <div className="text-[11px] text-indigo-300 font-mono">{dmsLat}</div>
        </div>
        <div className="space-y-1 bg-slate-950/40 border border-slate-900 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Longitude (X)</span>
          <div className="text-sm font-extrabold text-white font-mono tracking-tight">{dispLng}°</div>
          <div className="text-[11px] text-cyan-300 font-mono">{dmsLng}</div>
        </div>
      </div>

      {/* Actual Interactive Map Container */}
      <div className="relative h-64 bg-slate-950 overflow-hidden">
        
        {/* Leaflet container ref */}
        <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />

        {/* Loading spinner while first tiles arrive (never a silent black box) */}
        {mapLoading && !tilesFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 pointer-events-none" style={{ zIndex: 500 }}>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full border-4 border-indigo-500/20 border-t-indigo-400 animate-spin"></div>
              <span className="text-[11px] text-slate-300 font-medium">Loading map…</span>
            </div>
          </div>
        )}

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

          {/* Style Toggle (cycles Dark / Street / Satellite) */}
          <button
            onClick={handleToggleStyle}
            className={`w-8 h-8 rounded-lg border text-slate-300 hover:text-white transition flex items-center justify-center shadow-lg cursor-pointer ${
              mapStyle === 'dark'
                ? 'bg-slate-950/90 border-slate-800'
                : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
            }`}
            title={`Switch to ${nextStyleLabel} (now: ${STYLE_LABEL[mapStyle]})`}
          >
            <Layers size={14} />
          </button>
        </div>

        {/* Small floating HUD banner for village identity */}
        <div className="absolute bottom-3 right-3 z-10 bg-slate-950/90 border border-slate-800/80 text-[10px] px-2.5 py-1 rounded-lg shadow-xl flex items-center gap-1.5 backdrop-blur-sm pointer-events-none" style={{ zIndex: 1000 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-slate-200">{villageName}</span>
          <span className="text-indigo-300 font-semibold">{STYLE_LABEL[mapStyle]}</span>
          <span className="text-slate-400 font-mono">Zoom: {mapZoom}</span>
        </div>

        {/* Tile fallback notice: network block OR no imagery at this zoom.
            Coordinates stay usable; try another view or zoom out. */}
        {tilesFailed && (
          <div className="absolute inset-x-3 top-3 z-10 bg-amber-500/90 text-slate-950 text-[11px] font-semibold px-3 py-2 rounded-lg shadow-xl flex items-center justify-between gap-2" style={{ zIndex: 1000 }}>
            <span>Tiles unavailable here — try another view, zoom out, or use “Open Maps”.</span>
            <button onClick={() => setTilesFailed(false)} className="underline shrink-0" title="Dismiss">Hide</button>
          </div>
        )}
      </div>

      {/* Metadata Footer bar */}
      <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/40 text-[10px] text-slate-400 flex justify-between items-center">
        <span className="flex items-center gap-1">
          <Globe size={11} className="text-slate-600" />
          <span>Regional Context: {townshipEn} • {stateEn}</span>
        </span>
        <span className="font-mono text-indigo-400/80">{STYLE_ATTR[mapStyle]}</span>
      </div>
    </div>
  );
}
