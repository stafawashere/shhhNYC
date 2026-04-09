"use client";

import { useEffect, useState, useMemo } from "react";
import { getNearbyVenues, VenueWithScore } from "@/lib/api";
import MapView from "@/components/Map/MapView";
import FilterBar, { Filters } from "@/components/Controls/FilterBar";

const DEFAULT_LAT = 40.7282;
const DEFAULT_LNG = -73.9973;

const WIFI_RANK: Record<string, number> = {
   poor: 0,
   fair: 1,
   good: 2,
   excellent: 3,
};

const DEFAULT_FILTERS: Filters = {
   wifi: "",
   outlets: false,
   food: false,
   neighborhood: "",
};

export default function Home() {
   const [venues, setVenues] = useState<VenueWithScore[]>([]);
   const [error, setError] = useState<string | null>(null);
   const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

   useEffect(() => {
      getNearbyVenues(DEFAULT_LAT, DEFAULT_LNG, 5)
         .then(setVenues)
         .catch(() => setError("Could not load venues"));
   }, []);

   const neighborhoods = useMemo(
      () =>
         Array.from(
            new Set(venues.map((v) => v.venue.neighborhood).filter(Boolean)),
         ) as string[],
      [venues],
   );

   const filtered = useMemo(() => {
      return venues.filter((v) => {
         const { venue } = v;
         if (filters.neighborhood && venue.neighborhood !== filters.neighborhood)
            return false;
         if (filters.outlets && !venue.has_outlets) return false;
         if (filters.food && !venue.serves_food) return false;
         if (filters.wifi && venue.wifi_quality) {
            if (WIFI_RANK[venue.wifi_quality] < WIFI_RANK[filters.wifi])
               return false;
         }
         return true;
      });
   }, [venues, filters]);

   return (
      <div className="w-screen h-screen flex flex-col">
         <header className="px-5 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
               ShhhNYC
            </h1>
            <span className="text-sm text-gray-400">
               Quiet workspaces in New York City
            </span>
         </header>

         <FilterBar
            filters={filters}
            neighborhoods={neighborhoods}
            onChange={setFilters}
         />

         <div className="flex-1 relative">
            {error ? (
               <div className="flex items-center justify-center h-full text-gray-500">
                  {error}
               </div>
            ) : (
               <MapView
                  venues={filtered}
                  centerLat={DEFAULT_LAT}
                  centerLng={DEFAULT_LNG}
               />
            )}
         </div>
      </div>
   );
}
