"use client";

import { useEffect, useRef, useState } from "react";
import {
   ChevronDown, X, Check,
   MapPin, DollarSign, Volume2,
   Utensils, Sun, Clock,
} from "lucide-react";


export interface Filters {
   food: boolean;
   outdoor_seating: boolean;
   open_now: boolean;
   max_price: number;
   neighborhood: string;
   min_score: number;
}

interface Props {
   filters: Filters;
   neighborhoods: string[];
   matchCount: number;
   totalCount: number;
   onChange: (filters: Filters) => void;
   dropdownDirection?: "up" | "down";
}

export const DEFAULT_FILTERS: Filters = {
   food: false,
   outdoor_seating: false,
   open_now: false,
   max_price: 0,
   neighborhood: "",
   min_score: 0,
};

function hasActiveFilters(f: Filters) {
   return f.food || f.outdoor_seating || f.open_now || f.max_price > 0 || !!f.neighborhood || f.min_score > 0;
}

interface DropdownProps {
   value: string;
   placeholder: string;
   icon: React.ReactNode;
   options: { label: string; value: string }[];
   onChange: (v: string) => void;
   direction?: "up" | "down";
}

function Dropdown({ value, placeholder, icon, options, onChange, direction = "down" }: DropdownProps) {
   const [open, setOpen] = useState(false);
   const ref = useRef<HTMLDivElement>(null);
   const label = options.find((o) => o.value === value)?.label ?? placeholder;
   const active = !!value;

   useEffect(() => {
      function onOutside(e: MouseEvent) {
         if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      }
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
   }, []);

   const menuClass = direction === "up"
      ? "absolute bottom-full left-0 right-0 mb-1.5 z-50"
      : "absolute top-full left-0 right-0 mt-1.5 z-50";

   return (
      <div ref={ref} className="relative w-full">
         <button
            onClick={() => setOpen((o) => !o)}
            className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
               active
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-zinc-800/40 text-zinc-400 border-zinc-700/60 hover:border-zinc-500/60 hover:text-zinc-300"
            }`}
         >
            <span className={`shrink-0 ${active ? "text-emerald-400" : ""}`}>{icon}</span>
            <span className="flex-1 text-left truncate">{label}</span>
            <ChevronDown size={11} className={`shrink-0 transition-transform text-zinc-600 ${open ? "rotate-180" : ""}`} />
         </button>

         {open && (
            <div className={`${menuClass} rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden`}>
               {[{ label: placeholder, value: "" }, ...options].map((opt) => {
                  const selected = opt.value === value;
                  return (
                     <button
                        key={opt.value}
                        onClick={() => { onChange(opt.value); setOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                           selected ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-300 hover:bg-zinc-800"
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

function Toggle({
   active,
   onClick,
   icon,
   label,
}: {
   active: boolean;
   onClick: () => void;
   icon: React.ReactNode;
   label: string;
}) {
   return (
      <button
         onClick={onClick}
         className={`flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-lg text-[11px] font-medium border transition-colors focus:outline-none ${
            active
               ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
               : "bg-zinc-800/40 text-zinc-400 border-zinc-700/60 hover:border-zinc-500/60 hover:text-zinc-300"
         }`}
      >
         <span className={`shrink-0 ${active ? "text-emerald-400" : ""}`}>{icon}</span>
         <span className="truncate">{label}</span>
      </button>
   );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
   return (
      <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 px-0.5">
         {children}
      </div>
   );
}

export default function FilterBar({ filters, neighborhoods, onChange, dropdownDirection = "down" }: Props) {
   const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

   const neighborhoodOptions = neighborhoods.map((n) => ({ label: n, value: n }));
   const priceOptions = [
      { label: "$ only", value: "1" },
      { label: "$$ or less", value: "2" },
      { label: "$$$ or less", value: "3" },
   ];
   const scoreOptions = [
      { label: "Moderate+ (50+)", value: "50" },
      { label: "Quiet+ (65+)", value: "65" },
      { label: "Very Quiet (80+)", value: "80" },
   ];

   return (
      <div className="flex flex-col">
         <SectionLabel>Refine</SectionLabel>
         <div className="grid grid-cols-3 gap-1.5">
            <Dropdown
               value={filters.neighborhood}
               placeholder="Area"
               icon={<MapPin size={12} className="text-zinc-400" />}
               options={neighborhoodOptions}
               onChange={(v) => set({ neighborhood: v })}
               direction={dropdownDirection}
            />
            <Dropdown
               value={filters.max_price > 0 ? String(filters.max_price) : ""}
               placeholder="Price"
               icon={<DollarSign size={12} className="text-emerald-400" />}
               options={priceOptions}
               onChange={(v) => set({ max_price: v ? Number(v) : 0 })}
               direction={dropdownDirection}
            />
            <Dropdown
               value={filters.min_score > 0 ? String(filters.min_score) : ""}
               placeholder="Noise"
               icon={<Volume2 size={12} className="text-zinc-400" />}
               options={scoreOptions}
               onChange={(v) => set({ min_score: v ? Number(v) : 0 })}
               direction={dropdownDirection}
            />
         </div>

         <div className="mt-4">
            <SectionLabel>Amenities</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
               <Toggle active={filters.open_now}        onClick={() => set({ open_now: !filters.open_now })}               icon={<Clock size={12} className="text-sky-400" />}       label="Open Now" />
               <Toggle active={filters.food}            onClick={() => set({ food: !filters.food })}                       icon={<Utensils size={12} className="text-orange-400" />} label="Food" />
               <Toggle active={filters.outdoor_seating} onClick={() => set({ outdoor_seating: !filters.outdoor_seating })} icon={<Sun size={12} className="text-emerald-400" />}     label="Outdoor" />
            </div>
         </div>

         {hasActiveFilters(filters) && (
            <button
               onClick={() => onChange(DEFAULT_FILTERS)}
               className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-400/70 border border-red-900/30 hover:bg-red-950/30 hover:text-red-400 transition-colors w-full mt-3"
            >
               <X size={11} />
               Clear all filters
            </button>
         )}
      </div>
   );
}
