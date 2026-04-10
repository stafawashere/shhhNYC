"use client";

import { useState, useCallback } from "react";
import Map from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { VenueWithScore } from "@/lib/api";
import VenueMarker from "./VenueMarker";
import VenueCard from "@/components/Venue/VenueCard";

interface Props {
   venues: VenueWithScore[];
   loading?: boolean;
   centerLat?: number;
   centerLng?: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function MapView({
   venues,
   loading = false,
   centerLat = 40.7282,
   centerLng = -73.9973,
}: Props) {
   const [selected, setSelected] = useState<VenueWithScore | null>(null);

   const handleMarkerClick = useCallback((venue: VenueWithScore) => {
      setSelected(venue);
   }, []);

   return (
      <div className="relative w-full h-full">
         <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: 14 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
         >
            {venues.map((v) => {
               if (!v.venue.lat || !v.venue.lng) return null;
               return (
                  <VenueMarker
                     key={v.venue.id}
                     data={v}
                     lat={v.venue.lat}
                     lng={v.venue.lng}
                     onClick={() => handleMarkerClick(v)}
                  />
               );
            })}
         </Map>

         {/* loading skeleton */}
         {loading && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-20">
               <div className="flex flex-col items-center gap-3 text-white">
                  <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span className="text-sm font-medium tracking-wide">Finding quiet spots…</span>
               </div>
            </div>
         )}

         {/* empty state */}
         {!loading && venues.length === 0 && (
            <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none z-10">
               <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg text-center">
                  <p className="text-sm font-semibold text-gray-800">No venues match your filters</p>
                  <p className="text-xs text-gray-500 mt-1">Try clearing a filter or zooming out</p>
               </div>
            </div>
         )}

         {selected && (
            <VenueCard data={selected} onClose={() => setSelected(null)} />
         )}
      </div>
   );
}
