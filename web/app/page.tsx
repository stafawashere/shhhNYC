"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getNearbyVenues, VenueWithScore } from "@/lib/api";
import { openNowStatus } from "@/lib/openingHours";
import MapView from "@/components/Map/MapView";
import FilterBar, { Filters, DEFAULT_FILTERS } from "@/components/Controls/FilterBar";

const DEFAULT_LAT = 40.7282;
const DEFAULT_LNG = -73.9973;


function Logo() {
   return (
      <img src="/icon.png" alt="ShhhNYC" width={45} height={45} className="shrink-0" />
   );
}

const REFRESH_MS = 2 * 60 * 1000; // 2 minutes — matches backend live-signal cadence

export default function Home() {
   const [venues, setVenues] = useState<VenueWithScore[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
   const [mobileOpen, setMobileOpen] = useState(false);
   const [selected, setSelected] = useState<VenueWithScore | null>(null);
   const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
   const [refreshing, setRefreshing] = useState(false);

   const fetchVenues = useCallback((silent = false) => {
      if (!silent) return; // initial load handled separately
      setRefreshing(true);
      getNearbyVenues(DEFAULT_LAT, DEFAULT_LNG, 5)
         .then(data => { setVenues(data); setLastUpdated(new Date()); })
         .catch(() => null)
         .finally(() => setRefreshing(false));
   }, []);

   useEffect(() => {
      getNearbyVenues(DEFAULT_LAT, DEFAULT_LNG, 5)
         .then(data => { setVenues(data); setLastUpdated(new Date()); })
         .catch(() => setError("Could not load venues"))
         .finally(() => setLoading(false));
   }, []);

   useEffect(() => {
      const id = setInterval(() => fetchVenues(true), REFRESH_MS);
      return () => clearInterval(id);
   }, [fetchVenues]);

   const neighborhoods = useMemo(
      () => Array.from(new Set(venues.map((v) => v.venue.neighborhood).filter(Boolean))) as string[],
      [venues],
   );

   const filtered = useMemo(() => {
      return venues.filter((v) => {
         const { venue } = v;
         if (filters.neighborhood && venue.neighborhood !== filters.neighborhood) return false;
         if (filters.food && !venue.serves_food) return false;
         if (filters.outdoor_seating && !venue.has_outdoor_seating) return false;
         if (filters.max_price > 0 && venue.price_tier && venue.price_tier > filters.max_price) return false;
         if (filters.min_score > 0 && v.score.quiet_score < filters.min_score) return false;
         if (filters.open_now) {
            const status = openNowStatus(venue.opening_hours);
            if (!status || !status.open) return false;
         }
         return true;
      });
   }, [venues, filters]);

   function handleSelect(venue: VenueWithScore | null) {
      setSelected(venue);
      if (venue) setMobileOpen(false); // opening a venue closes the filter sheet
   }

   function handleMobileOpen(open: boolean) {
      setMobileOpen(open);
      if (open) setSelected(null);
   }

   return (
      <div className="w-full h-screen overflow-hidden relative bg-zinc-950">
         {error ? (
            <div className="flex items-center justify-center h-full text-zinc-500">{error}</div>
         ) : (
            <MapView
               venues={filtered}
               loading={loading}
               centerLat={DEFAULT_LAT}
               centerLng={DEFAULT_LNG}
               selected={selected}
               onSelect={handleSelect}
            />
         )}

         {/* desktop: floating glass panel top-left */}
         <div className="hidden md:block absolute top-4 left-4 z-20 w-84 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-zinc-700/50 shadow-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
               <Logo />
               <div className="ml-auto flex items-center gap-1.5">
                  {refreshing && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  <span className="text-xs text-zinc-500">
                     {filtered.length < venues.length ? `${filtered.length} of ${venues.length} venues` : `${venues.length} venues`}
                  </span>
               </div>
            </div>
            <FilterBar
               filters={filters}
               neighborhoods={neighborhoods}
               matchCount={filtered.length}
               totalCount={venues.length}
               onChange={setFilters}
               dropdownDirection="down"
            />
         </div>

         {/* mobile: top strip */}
         <div className="md:hidden absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 py-3 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800">
            <Logo />
            <span className="text-xs text-zinc-500 ml-1">
               {filtered.length < venues.length ? `${filtered.length} of ${venues.length} venues` : `${venues.length} venues`}
            </span>
            <button
               onClick={() => handleMobileOpen(!mobileOpen)}
               className={`ml-auto px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  mobileOpen
                     ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                     : "bg-zinc-800 text-zinc-300 border-zinc-700"
               }`}
            >
               Filters
            </button>
         </div>

         {/* mobile: bottom sheet — dropdowns open upward so nothing clips */}
         {mobileOpen && (
            <div className="md:hidden absolute bottom-0 left-0 right-0 z-30 rounded-t-2xl bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 p-5 shadow-2xl">
               <div className="w-8 h-1 rounded-full bg-zinc-700 mx-auto mb-4" />
               <FilterBar
                  filters={filters}
                  neighborhoods={neighborhoods}
                  matchCount={filtered.length}
                  totalCount={venues.length}
                  onChange={setFilters}
                  dropdownDirection="up"
               />
            </div>
         )}
      </div>
   );
}
