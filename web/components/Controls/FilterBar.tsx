"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X, Check } from "lucide-react";

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

interface DropdownProps {
   value: string;
   placeholder: string;
   options: { label: string; value: string }[];
   onChange: (v: string) => void;
}

function Dropdown({ value, placeholder, options, onChange }: DropdownProps) {
   const [open, setOpen] = useState(false);
   const ref = useRef<HTMLDivElement>(null);
   const active = !!value;
   const label = options.find((o) => o.value === value)?.label ?? placeholder;

   useEffect(() => {
      function onClickOutside(e: MouseEvent) {
         if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      }
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
   }, []);

   return (
      <div ref={ref} className="relative w-full">
         <button
            onClick={() => setOpen((o) => !o)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
               active
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                  : "bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:border-zinc-500"
            }`}
         >
            <span className="truncate">{label}</span>
            <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
         </button>

         {open && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
               {[{ label: placeholder, value: "" }, ...options].map((opt) => {
                  const selected = opt.value === value;
                  return (
                     <button
                        key={opt.value}
                        onClick={() => { onChange(opt.value); setOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                           selected
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "text-zinc-300 hover:bg-zinc-800"
                        }`}
                     >
                        <span>{opt.label}</span>
                        {selected && <Check size={11} className="text-emerald-400 shrink-0" />}
                     </button>
                  );
               })}
            </div>
         )}
      </div>
   );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
   return (
      <button
         onClick={onClick}
         className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
            active
               ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
               : "bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:border-zinc-500"
         }`}
      >
         {children}
      </button>
   );
}

export default function FilterBar({ filters, neighborhoods, matchCount, totalCount, onChange }: Props) {
   const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

   const neighborhoodOptions = neighborhoods.map((n) => ({ label: n, value: n }));
   const wifiOptions = [
      { label: "Fair+", value: "fair" },
      { label: "Good+", value: "good" },
      { label: "Excellent", value: "excellent" },
   ];

   return (
      <div className="flex flex-col gap-2">
         <Dropdown
            value={filters.neighborhood}
            placeholder="All neighborhoods"
            options={neighborhoodOptions}
            onChange={(v) => set({ neighborhood: v })}
         />

         <Dropdown
            value={filters.wifi}
            placeholder="Any WiFi"
            options={wifiOptions}
            onChange={(v) => set({ wifi: v })}
         />

         <div className="flex gap-2">
            <Pill active={filters.outlets} onClick={() => set({ outlets: !filters.outlets })}>Outlets</Pill>
            <Pill active={filters.food} onClick={() => set({ food: !filters.food })}>Food</Pill>
         </div>

         {hasActiveFilters(filters) && (
            <button
               onClick={() => onChange(DEFAULT_FILTERS)}
               className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-red-400 border border-red-900 hover:bg-red-950 transition-colors w-full focus:outline-none"
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
