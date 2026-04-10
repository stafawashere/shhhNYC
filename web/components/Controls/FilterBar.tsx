"use client";

import { useEffect, useRef, useState } from "react";
import {
   ChevronDown, X, Check,
   MapPin, Wifi, DollarSign, Volume2,
   Zap, Utensils, Wine, Baby,
} from "lucide-react";

export interface Filters {
   wifi: string;
   outlets: boolean;
   food: boolean;
   alcohol: boolean;
   kid_friendly: boolean;
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
   wifi: "",
   outlets: false,
   food: false,
   alcohol: false,
   kid_friendly: false,
   max_price: 0,
   neighborhood: "",
   min_score: 0,
};

function hasActiveFilters(f: Filters) {
   return f.wifi || f.outlets || f.food || f.alcohol || f.kid_friendly || f.max_price > 0 || f.neighborhood || f.min_score > 0;
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
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
               active
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:border-zinc-500"
            }`}
         >
            <span className={active ? "text-emerald-400" : "text-zinc-500"}>{icon}</span>
            <span className="flex-1 text-left truncate">{label}</span>
            <ChevronDown size={12} className={`shrink-0 transition-transform text-zinc-500 ${open ? "rotate-180" : ""}`} />
         </button>

         {open && (
            <div className={`${menuClass} rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden`}>
               {[{ label: placeholder, value: "" }, ...options].map((opt) => {
                  const selected = opt.value === value;
                  return (
                     <button
                        key={opt.value}
                        onClick={() => { onChange(opt.value); setOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
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
         className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors focus:outline-none ${
            active
               ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
               : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:border-zinc-500"
         }`}
      >
         {/* checkbox */}
         <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
            active ? "bg-emerald-500 border-emerald-500" : "bg-transparent border-zinc-600"
         }`}>
            {active && <Check size={10} className="text-white" strokeWidth={3} />}
         </span>
         <span className={active ? "text-emerald-400" : "text-zinc-500"}>{icon}</span>
         <span>{label}</span>
      </button>
   );
}

export default function FilterBar({ filters, neighborhoods, matchCount, totalCount, onChange, dropdownDirection = "down" }: Props) {
   const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

   const neighborhoodOptions = neighborhoods.map((n) => ({ label: n, value: n }));
   const wifiOptions = [
      { label: "Fair+", value: "fair" },
      { label: "Good+", value: "good" },
      { label: "Excellent", value: "excellent" },
   ];
   const priceOptions = [
      { label: "$ only", value: "1" },
      { label: "$$ or less", value: "2" },
      { label: "$$$ or less", value: "3" },
   ];
   const scoreOptions = [
      { label: "Moderate+ (50+)", value: "50" },
      { label: "Quiet+ (65+)", value: "65" },
      { label: "Very Quiet only (80+)", value: "80" },
   ];

   return (
      <div className="flex flex-col gap-1.5">
         <Dropdown
            value={filters.neighborhood}
            placeholder="All neighborhoods"
            icon={<MapPin size={13} />}
            options={neighborhoodOptions}
            onChange={(v) => set({ neighborhood: v })}
            direction={dropdownDirection}
         />

         <Dropdown
            value={filters.wifi}
            placeholder="Any WiFi"
            icon={<Wifi size={13} />}
            options={wifiOptions}
            onChange={(v) => set({ wifi: v })}
            direction={dropdownDirection}
         />

         <Dropdown
            value={filters.max_price > 0 ? String(filters.max_price) : ""}
            placeholder="Any price"
            icon={<DollarSign size={13} />}
            options={priceOptions}
            onChange={(v) => set({ max_price: v ? Number(v) : 0 })}
            direction={dropdownDirection}
         />

         <Dropdown
            value={filters.min_score > 0 ? String(filters.min_score) : ""}
            placeholder="Any noise level"
            icon={<Volume2 size={13} />}
            options={scoreOptions}
            onChange={(v) => set({ min_score: v ? Number(v) : 0 })}
            direction={dropdownDirection}
         />

         <div className="grid grid-cols-2 gap-1.5 mt-0.5">
            <Toggle active={filters.outlets}     onClick={() => set({ outlets: !filters.outlets })}         icon={<Zap size={12} />}      label="Outlets" />
            <Toggle active={filters.food}        onClick={() => set({ food: !filters.food })}               icon={<Utensils size={12} />}  label="Food" />
            <Toggle active={filters.alcohol}     onClick={() => set({ alcohol: !filters.alcohol })}         icon={<Wine size={12} />}      label="Alcohol" />
            <Toggle active={filters.kid_friendly} onClick={() => set({ kid_friendly: !filters.kid_friendly })} icon={<Baby size={12} />}  label="Kid friendly" />
         </div>

         {hasActiveFilters(filters) && (
            <button
               onClick={() => onChange(DEFAULT_FILTERS)}
               className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-red-400 border border-red-900/60 hover:bg-red-950/50 transition-colors w-full mt-0.5"
            >
               <X size={11} />
               Clear all filters
            </button>
         )}

         {matchCount !== totalCount && (
            <p className="text-xs text-zinc-500 text-center pt-0.5">{matchCount} of {totalCount} venues</p>
         )}
      </div>
   );
}
