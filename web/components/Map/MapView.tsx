"use client";

import { useState, useCallback, useRef } from "react";
import Map, { MapRef } from "react-map-gl/mapbox";
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
const CARD_HEIGHT_DEG = 0.008; // approx degrees to pan down so marker stays above card

export default function MapView({
   venues,
   loading = false,
   centerLat = 40.7282,
   centerLng = -73.9973,
}: Props) {
   const mapRef = useRef<MapRef>(null);
   const [selected, setSelected] = useState<VenueWithScore | null>(null);

   const handleMarkerClick = useCallback((venue: VenueWithScore) => {
      setSelected(venue);
      const lat = venue.venue.lat;
      const lng = venue.venue.lng;
      if (lat && lng && mapRef.current) {
         mapRef.current.easeTo({
            center: [lng, lat - CARD_HEIGHT_DEG],
            duration: 350,
         });
      }
   }, []);

   return (
      <div className="relative w-full h-full">
         <Map
            ref={mapRef}
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
            <VenueCard data={selected} onClose={() => setSelected(null)} />
         )}
      </div>
   );
}
