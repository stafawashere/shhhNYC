"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { VenueWithScore } from "@/lib/api";

interface Props {
   data: VenueWithScore;
   onClose: () => void;
}

const labelColors: Record<string, { badge: string; bar: string }> = {
   "Very Quiet": { badge: "bg-emerald-900/50 text-emerald-300", bar: "bg-emerald-500" },
   Quiet:        { badge: "bg-green-900/50 text-green-300",     bar: "bg-green-400" },
   Moderate:     { badge: "bg-yellow-900/50 text-yellow-300",   bar: "bg-yellow-400" },
   Loud:         { badge: "bg-orange-900/50 text-orange-300",   bar: "bg-orange-400" },
   "Very Loud":  { badge: "bg-red-900/50 text-red-300",         bar: "bg-red-500" },
};

const BREAKDOWN_LABELS = [
   { key: "venue_traits" as const,    label: "Space traits", max: 40 },
   { key: "time_pattern" as const,    label: "Time pattern", max: 50 },
   { key: "live_adjustment" as const, label: "Live signal",  max: 15 },
];

export default function VenueCard({ data, onClose }: Props) {
   const { venue, score } = data;
   const colors = labelColors[score.label] ?? { badge: "bg-zinc-700 text-zinc-300", bar: "bg-zinc-400" };

   return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 z-10">
         <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Close"
         >
            <X size={16} />
         </button>

         <div className="flex items-start justify-between gap-4 pr-4">
            <div className="min-w-0">
               <h2 className="text-base font-semibold text-zinc-50 truncate">{venue.name}</h2>
               <p className="text-xs text-zinc-500 mt-0.5">{venue.neighborhood} · {venue.borough}</p>
            </div>
            <div className="text-center shrink-0">
               <div className="text-3xl font-extrabold text-zinc-50 leading-none">{score.quiet_score}</div>
               <span className={`mt-1 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {score.label}
               </span>
            </div>
         </div>

         {/* score bar */}
         <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${score.quiet_score}%` }} />
         </div>

         {/* breakdown */}
         <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center">
            {BREAKDOWN_LABELS.map(({ key, label, max }) => {
               const val = score.breakdown[key];
               const pct = Math.round((val / max) * 100);
               return (
                  <div key={key} className="bg-zinc-800 rounded-lg p-2">
                     <div className="font-bold text-zinc-100">{val.toFixed(0)}<span className="text-zinc-500 font-normal">/{max}</span></div>
                     <div className="text-zinc-500 mt-0.5">{label}</div>
                     <div className="mt-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
                        <div className="h-full rounded-full bg-zinc-400" style={{ width: `${pct}%` }} />
                     </div>
                  </div>
               );
            })}
         </div>

         <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-2 text-xs flex-wrap">
               {venue.wifi_quality && <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">WiFi: {venue.wifi_quality}</span>}
               {venue.has_outlets && <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">Outlets</span>}
               {venue.serves_food && <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">Food</span>}
               {venue.price_tier && <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{"$".repeat(venue.price_tier)}</span>}
            </div>
            <Link
               href={`/venue/${venue.id}`}
               className="shrink-0 ml-2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-xs font-semibold text-zinc-100 transition-colors"
            >
               Details →
            </Link>
         </div>
      </div>
   );
}
