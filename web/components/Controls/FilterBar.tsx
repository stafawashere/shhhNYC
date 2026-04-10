"use client";

import { X } from "lucide-react";

export interface Filters {
   wifi: string;
   outlets: boolean;
   food: boolean;
   neighborhood: string;
}

interface Props {
   filters: Filters;
   neighborhoods: string[];
   matchCount: number;
   totalCount: number;
   onChange: (filters: Filters) => void;
}

const DEFAULT_FILTERS: Filters = { wifi: "", outlets: false, food: false, neighborhood: "" };

function hasActiveFilters(f: Filters) {
   return f.wifi || f.outlets || f.food || f.neighborhood;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
   return (
      <button
         onClick={onClick}
         className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
            active
               ? "bg-zinc-100 text-zinc-900 border-zinc-100"
               : "bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:border-zinc-500"
         }`}
      >
         {children}
      </button>
   );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
   return (
      <select
         className={`w-full px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            value
               ? "bg-zinc-100 text-zinc-900 border-zinc-100"
               : "bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:border-zinc-500"
         }`}
         value={value}
         onChange={(e) => onChange(e.target.value)}
      >
         {children}
      </select>
   );
}

export default function FilterBar({ filters, neighborhoods, matchCount, totalCount, onChange }: Props) {
   const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

   return (
      <div className="flex flex-col gap-2">
         <Select value={filters.neighborhood} onChange={(v) => set({ neighborhood: v })}>
            <option value="">All neighborhoods</option>
            {neighborhoods.map((n) => <option key={n} value={n}>{n}</option>)}
         </Select>

         <Select value={filters.wifi} onChange={(v) => set({ wifi: v })}>
            <option value="">Any WiFi</option>
            <option value="fair">Fair+</option>
            <option value="good">Good+</option>
            <option value="excellent">Excellent</option>
         </Select>

         <div className="flex gap-2">
            <Pill active={filters.outlets} onClick={() => set({ outlets: !filters.outlets })}>Outlets</Pill>
            <Pill active={filters.food} onClick={() => set({ food: !filters.food })}>Food</Pill>
         </div>

         {hasActiveFilters(filters) && (
            <button
               onClick={() => onChange(DEFAULT_FILTERS)}
               className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-red-400 border border-red-900 hover:bg-red-950 transition-colors w-full"
            >
               <X size={11} />
               Clear filters
            </button>
         )}

         {matchCount !== totalCount && (
            <p className="text-xs text-zinc-500 text-center">{matchCount} of {totalCount} venues</p>
         )}
      </div>
   );
}
