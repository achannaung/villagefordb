/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { VillageRecord } from "../types";
import { MapPin, Info, Compass, Globe } from "lucide-react";

interface MyanmarMapProps {
  filteredRecords: VillageRecord[];
  activeVillage: VillageRecord | null;
  onSelectVillage: (village: VillageRecord) => void;
}

export function MyanmarMap({ filteredRecords, activeVillage, onSelectVillage }: MyanmarMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const activeMarkerRef = useRef<L.Marker | L.CircleMarker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Safe limit for rendering interactive markers cleanly
  const RENDER_LIMIT = 2000;
  const validRecords = filteredRecords.filter((record) => {
    const lat = parseFloat(record.latitude);
    const lng = parseFloat(record.longitude);
    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
  });

  const displayedRecords = validRecords.slice(0, RENDER_LIMIT);
  const hasMoreThanLimit = validRecords.length > RENDER_LIMIT;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create Leaflet map instance
    const leafletMap = L.map(mapContainerRef.current, {
      center: [21.9162, 95.9560], // Center of Myanmar
      zoom: 6,
      zoomControl: true,
      preferCanvas: true, // Crucial for ultra-smooth rendering of circle markers
    });

    // Feature group for managing markers
    const markersLayer = L.featureGroup().addTo(leafletMap);

    setMap(leafletMap);
    markersLayerRef.current = markersLayer;

    // Clean up map instance on unmount
    return () => {
      leafletMap.remove();
    };
  }, []);

  // Sync Map Tile Layer
  useEffect(() => {
    if (!map) return;

    // Remove previous tile layer if it exists
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    let url = "";
    let options = {};

    if (mapType === "standard") {
      url = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      options = {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      };
    } else {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      options = {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
      };
    }

    const newTileLayer = L.tileLayer(url, options).addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [map, mapType]);

  // Sync Markers and Bounds
  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Clear previous markers
    markersLayer.clearLayers();
    activeMarkerRef.current = null;

    if (displayedRecords.length === 0) {
      // Reset view to default Myanmar center if no results
      map.setView([21.9162, 95.9560], 6);
      return;
    }

    const bounds = L.latLngBounds([]);

    displayedRecords.forEach((record) => {
      const lat = parseFloat(record.latitude);
      const lng = parseFloat(record.longitude);

      // Create a clean, elegant circle marker
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        fillColor: "#4f46e5", // Indigo-600
        color: "#ffffff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85,
        renderer: L.canvas(), // High-speed rendering
      });

      // Simple HTML Popup
      const popupContent = `
        <div class="p-1 font-sans text-xs" style="min-width: 180px;">
          <span class="inline-block bg-indigo-50 text-indigo-600 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-1.5 border border-indigo-100">
            ${record.sr}
          </span>
          <h4 class="font-bold text-slate-900 text-sm leading-tight">${record.village}</h4>
          <h5 class="text-xs text-indigo-600 font-display font-medium mt-0.5">${record.villageMm || "—"}</h5>
          
          <div class="mt-2.5 space-y-1 text-slate-600 text-[11px] border-t border-slate-100 pt-2">
            <div><strong class="text-slate-400 uppercase text-[9px]">Township:</strong> ${record.township}</div>
            <div><strong class="text-slate-400 uppercase text-[9px]">Tract:</strong> ${record.villageTract}</div>
            <div><strong class="text-slate-400 uppercase text-[9px]">District:</strong> ${record.district}</div>
          </div>
          
          <div class="mt-2.5 font-mono text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex items-center justify-between">
            <span>${record.latitude}, ${record.longitude}</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: true,
        className: "custom-leaflet-popup",
      });

      // Click callback to update active village state
      marker.on("click", () => {
        onSelectVillage(record);
      });

      // Save marker reference if this is the active village
      const isCurrentlyActive = activeVillage &&
        activeVillage.latitude === record.latitude &&
        activeVillage.longitude === record.longitude &&
        activeVillage.village === record.village;

      if (isCurrentlyActive) {
        activeMarkerRef.current = marker;
      }

      markersLayer.addLayer(marker);
      bounds.extend([lat, lng]);
    });

    // Pan/Zoom to fit all displayed records dynamically
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 13,
        animate: true,
        duration: 1.2,
      });
    }
  }, [map, displayedRecords, onSelectVillage]);

  // Sync Active Village (Highlight & Open Popup)
  useEffect(() => {
    if (!map || !activeVillage) return;

    const lat = parseFloat(activeVillage.latitude);
    const lng = parseFloat(activeVillage.longitude);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

    // Pan to active village with animation
    map.setView([lat, lng], 14, {
      animate: true,
      duration: 1.0,
    });

    // Find and trigger popup on the layer matching active coordinates
    const markersLayer = markersLayerRef.current;
    if (markersLayer) {
      markersLayer.eachLayer((layer: any) => {
        const latlng = layer.getLatLng();
        if (
          Math.abs(latlng.lat - lat) < 0.0001 &&
          Math.abs(latlng.lng - lng) < 0.0001
        ) {
          // Temporarily highlight the active marker
          layer.setStyle({
            radius: 9,
            fillColor: "#ec4899", // Pink-500
            fillOpacity: 1,
            weight: 3,
            color: "#ffffff",
          });

          layer.openPopup();
          activeMarkerRef.current = layer;
        } else {
          // Reset style for others
          layer.setStyle({
            radius: 6,
            fillColor: "#4f46e5", // Indigo-600
            color: "#ffffff",
            weight: 1.5,
            fillOpacity: 0.85,
          });
        }
      });
    }
  }, [map, activeVillage]);

  return (
    <div className="flex-1 flex flex-col min-h-[450px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm relative">
      {/* Map Element */}
      <div id="myanmar-leaflet-map" ref={mapContainerRef} className="flex-1 w-full h-full z-10" />

      {/* Map Layer Switcher (Standard vs. Satellite) */}
      <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-1 pointer-events-auto">
        <button
          onClick={() => setMapType("standard")}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            mapType === "standard"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Standard
        </button>
        <button
          onClick={() => setMapType("satellite")}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            mapType === "satellite"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Satellite
        </button>
      </div>

      {/* Floating Info Banner */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 max-w-[280px] sm:max-w-xs pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-md border border-slate-200/80 pointer-events-auto">
          <div className="flex items-start gap-2">
            <Compass className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 animate-spin-slow" />
            <div>
              <p className="text-xs font-bold text-slate-800">Map Mode Viewport</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">
                Showing <strong className="text-slate-700">{displayedRecords.length.toLocaleString()}</strong> of{" "}
                <strong className="text-slate-700">{validRecords.length.toLocaleString()}</strong> mapped records.
              </p>
            </div>
          </div>
        </div>

        {hasMoreThanLimit && (
          <div className="bg-amber-50/95 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-md border border-amber-200 text-amber-900 pointer-events-auto">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold">Safe Performance Cap</p>
                <p className="text-[9px] text-amber-700 mt-0.5 leading-normal">
                  Capped at {RENDER_LIMIT.toLocaleString()} markers for buttery-smooth performance. Refine search filters to narrow down the view!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Embedded style override to fix Leaflet popups inside our Tailwind slate UI */}
      <style>{`
        .custom-leaflet-popup .leaflet-popup-content-wrapper {
          background: rgba(255, 255, 255, 0.98);
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          padding: 2px;
        }
        .custom-leaflet-popup .leaflet-popup-tip {
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid #e2e8f0;
        }
        .leaflet-container {
          font-family: inherit !important;
        }
      `}</style>
    </div>
  );
}
