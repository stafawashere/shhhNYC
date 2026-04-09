"use client";

import { useState, useCallback } from "react";
import Map from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { VenueWithScore } from "@/lib/api";
import VenueMarker from "./VenueMarker";
import VenueCard from "@/components/Venue/VenueCard";

interface Props {
   venues: VenueWithScore[];
   centerLat?: number;
   centerLng?: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function MapView({
   venues,
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
            initialViewState={{
               longitude: centerLng,
               latitude: centerLat,
               zoom: 14,
            }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/light-v11"
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

         {selected && (
            <VenueCard data={selected} onClose={() => setSelected(null)} />
         )}
      </div>
   );
}
