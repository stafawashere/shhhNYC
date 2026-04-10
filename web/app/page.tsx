"use client";

import { useEffect, useState, useMemo } from "react";
import { getNearbyVenues, VenueWithScore } from "@/lib/api";
import MapView from "@/components/Map/MapView";
import FilterBar, { Filters, DEFAULT_FILTERS } from "@/components/Controls/FilterBar";

const DEFAULT_LAT = 40.7282;
const DEFAULT_LNG = -73.9973;

const WIFI_RANK: Record<string, number> = { poor: 0, fair: 1, good: 2, excellent: 3 };

function SoundIcon() {
   return (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-emerald-400 shrink-0">
         <rect x="1" y="7" width="2" height="6" rx="1" fill="currentColor" opacity="0.5"/>
         <rect x="5" y="4" width="2" height="12" rx="1" fill="currentColor" opacity="0.7"/>
         <rect x="9" y="2" width="2" height="16" rx="1" fill="currentColor"/>
         <rect x="13" y="4" width="2" height="12" rx="1" fill="currentColor" opacity="0.7"/>
         <rect x="17" y="7" width="2" height="6" rx="1" fill="currentColor" opacity="0.5"/>
      </svg>
   );
}

export default function Home() {
   const [venues, setVenues] = useState<VenueWithScore[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
   const [mobileOpen, setMobileOpen] = useState(false);
   const [selected, setSelected] = useState<VenueWithScore | null>(null);

   useEffect(() => {
      getNearbyVenues(DEFAULT_LAT, DEFAULT_LNG, 5)
         .then(setVenues)
         .catch(() => setError("Could not load venues"))
         .finally(() => setLoading(false));
   }, []);

   const neighborhoods = useMemo(
      () => Array.from(new Set(venues.map((v) => v.venue.neighborhood).filter(Boolean))) as string[],
      [venues],
   );

   const filtered = useMemo(() => {
      return venues.filter((v) => {
         const { venue } = v;
         if (filters.neighborhood && venue.neighborhood !== filters.neighborhood) return false;
         if (filters.outlets && !venue.has_outlets) return false;
         if (filters.food && !venue.serves_food) return false;
         if (filters.alcohol && !venue.serves_alcohol) return false;
         if (filters.kid_friendly && !venue.kid_friendly) return false;
         if (filters.max_price > 0 && venue.price_tier && venue.price_tier > filters.max_price) return false;
         if (filters.wifi && venue.wifi_quality) {
            if (WIFI_RANK[venue.wifi_quality] < WIFI_RANK[filters.wifi]) return false;
         }
         if (filters.min_score > 0 && v.score.quiet_score < filters.min_score) return false;
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
      <div className="w-screen h-screen relative bg-zinc-950">
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
               <SoundIcon />
               <span className="text-sm font-bold text-zinc-50 tracking-tight">ShhhNYC</span>
               <span className="text-xs text-zinc-500 ml-auto">{filtered.length} spots</span>
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
            <SoundIcon />
            <span className="text-sm font-bold text-zinc-50">ShhhNYC</span>
            <span className="text-xs text-zinc-500 ml-1">{filtered.length} spots</span>
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
