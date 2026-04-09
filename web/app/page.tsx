"use client";

import { useEffect, useState } from "react";
import { getNearbyVenues, VenueWithScore } from "@/lib/api";
import MapView from "@/components/Map/MapView";

const DEFAULT_LAT = 40.7282;
const DEFAULT_LNG = -73.9973;

export default function Home() {
   const [venues, setVenues] = useState<VenueWithScore[]>([]);
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      getNearbyVenues(DEFAULT_LAT, DEFAULT_LNG, 2)
         .then(setVenues)
         .catch(() => setError("Could not load venues"));
   }, []);

   return (
      <div className="w-screen h-screen flex flex-col">
         <header className="px-5 py-3 bg-white border-b border-gray-100 flex items-center gap-3 z-10">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
               ShhhNYC
            </h1>
            <span className="text-sm text-gray-400">
               Quiet workspaces in New York City
            </span>
         </header>

         <div className="flex-1 relative">
            {error ? (
               <div className="flex items-center justify-center h-full text-gray-500">
                  {error}
               </div>
            ) : (
               <MapView
                  venues={venues}
                  centerLat={DEFAULT_LAT}
                  centerLng={DEFAULT_LNG}
               />
            )}
         </div>
      </div>
   );
}
