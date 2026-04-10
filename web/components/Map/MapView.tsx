"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { VenueWithScore, Incidents, getIncidents } from "@/lib/api";
import VenueMarker from "./VenueMarker";
import VenueCard from "@/components/Venue/VenueCard";
import { ConstructionMarker, NoiseMarker } from "./IncidentMarker";

interface Props {
   venues: VenueWithScore[];
   loading?: boolean;
   centerLat?: number;
   centerLng?: number;
   selected: VenueWithScore | null;
   onSelect: (v: VenueWithScore | null) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const CARD_HEIGHT_DEG = 0.008;

function markerScale(zoom: number): number {
   if (zoom >= 15) return 1.1;
   if (zoom >= 13) return 1.0;
   if (zoom >= 11) return 0.75;
   if (zoom >= 9)  return 0.55;
   return 0.4;
}

export default function MapView({
   venues,
   loading = false,
   centerLat = 40.7282,
   centerLng = -73.9973,
   selected,
   onSelect,
}: Props) {
   const mapRef = useRef<MapRef>(null);
   const [zoom, setZoom] = useState(14);
   const [incidents, setIncidents] = useState<Incidents>({ construction: [], noise: [], events: [] });
   const scale = markerScale(zoom);

   useEffect(() => {
      getIncidents().then(setIncidents).catch(() => null);
   }, []);

   const handleMarkerClick = useCallback((venue: VenueWithScore) => {
      onSelect(venue);
      const lat = venue.venue.lat;
      const lng = venue.venue.lng;
      if (lat && lng && mapRef.current) {
         mapRef.current.easeTo({ center: [lng, lat - CARD_HEIGHT_DEG], duration: 350 });
      }
   }, [onSelect]);

   // only render incident markers when zoomed in enough to be useful
   const showIncidents = zoom >= 12;

   return (
      <div className="relative w-full h-full">
         <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: 14 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onZoom={(e) => setZoom(e.viewState.zoom)}
         >
            {venues.map((v) => {
               if (!v.venue.lat || !v.venue.lng) return null;
               return (
                  <VenueMarker
                     key={v.venue.id}
                     data={v}
                     lat={v.venue.lat}
                     lng={v.venue.lng}
                     scale={scale}
                     onClick={() => handleMarkerClick(v)}
                  />
               );
            })}

            {showIncidents && incidents.construction.map((inc, i) => (
               <ConstructionMarker key={`c-${i}`} incident={inc} />
            ))}

            {showIncidents && incidents.noise.map((inc, i) => (
               <NoiseMarker key={`n-${i}`} incident={inc} />
            ))}
         </Map>

         {loading && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-20">
               <div className="flex flex-col items-center gap-3 text-white">
                  <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span className="text-sm font-medium tracking-wide">Finding quiet spots…</span>
               </div>
            </div>
         )}

         {!loading && venues.length === 0 && (
            <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none z-10">
               <div className="bg-zinc-900/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg text-center border border-zinc-700">
                  <p className="text-sm font-semibold text-zinc-100">No venues match your filters</p>
                  <p className="text-xs text-zinc-500 mt-1">Try clearing a filter or zooming out</p>
               </div>
            </div>
         )}

         {selected && (
            <VenueCard data={selected} onClose={() => onSelect(null)} />
         )}

         {/* incident legend — only when markers are visible */}
         {showIncidents && (incidents.construction.length > 0 || incidents.noise.length > 0) && (
            <div
               className="absolute bottom-6 right-4 z-10 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl text-xs"
               style={{
                  backgroundColor: "rgba(24,24,27,0.8)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(63,63,70,0.5)",
               }}
            >
               {incidents.construction.length > 0 && (
                  <div className="flex items-center gap-2 text-zinc-400">
                     <span className="w-3 h-3 shrink-0 inline-block" style={{ backgroundColor: "rgba(249,115,22,0.85)", transform: "rotate(45deg)", border: "1px solid rgba(253,186,116,0.7)" }} />
                     Construction ({incidents.construction.length})
                  </div>
               )}
               {incidents.noise.length > 0 && (
                  <div className="flex items-center gap-2 text-zinc-400">
                     <span className="w-3 h-3 shrink-0 rounded-full inline-block" style={{ backgroundColor: "rgba(239,68,68,0.7)", border: "1px solid rgba(252,165,165,0.6)" }} />
                     Noise reports ({incidents.noise.length})
                  </div>
               )}
               <p className="text-zinc-600 pt-1 border-t border-zinc-800">NYC Open Data · ~5 day lag</p>
            </div>
         )}
      </div>
   );
}
