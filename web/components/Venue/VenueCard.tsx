"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { API_BASE, VenueWithScore } from "@/lib/api";

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
   { key: "venue_traits" as const,    label: "Space", max: 40 },
   { key: "time_pattern" as const,    label: "Time", max: 50 },
   { key: "live_adjustment" as const, label: "Live",  max: 15, isModifier: true },
   { key: "traffic_penalty" as const, label: "Traffic", max: 10 },
];

export default function VenueCard({ data, onClose }: Props) {
   const { venue, score } = data;
   const colors = labelColors[score.label] ?? { badge: "bg-zinc-700 text-zinc-300", bar: "bg-zinc-400" };

   return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm rounded-2xl p-5 z-10"
         style={{
            backgroundColor: "rgba(24,24,27,0.75)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(63,63,70,0.6)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
         }}
      >
         <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Close"
         >
            <X size={16} />
         </button>

         {venue.photos && venue.photos.length > 0 && (
            <div className="relative -mx-5 -mt-5 mb-4 h-[88px] overflow-hidden rounded-t-2xl">
               <div className="flex h-full gap-px overflow-x-auto scrollbar-none">
                  {venue.photos.map((_, i) => (
                     // eslint-disable-next-line @next/next/no-img-element
                     <img
                        key={i}
                        src={`${API_BASE}/venues/${venue.id}/photo/${i}`}
                        alt={`${venue.name} photo ${i + 1}`}
                        draggable={false}
                        className="h-full flex-1 object-cover shrink-0 select-none opacity-60"
                        style={{ minWidth: 0 }}
                     />
                  ))}
               </div>
            </div>
         )}

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
         <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-center">
            {BREAKDOWN_LABELS.map(({ key, label, max, isModifier }) => {
               const raw = score.breakdown[key];
               const val = isModifier ? -raw : max - raw;
               const pct = isModifier 
                  ? ((max - raw) / (max * 2)) * 100 // center 0
                  : ((max - raw) / max) * 100;
               const sign = isModifier && val > 0 ? "+" : "";

               return (
                  <div key={key} className="rounded-lg p-2 flex flex-col justify-between" style={{ backgroundColor: "rgba(39,39,42,0.6)", border: "1px solid rgba(63,63,70,0.4)" }}>
                     <div className="font-bold text-zinc-100">{sign}{val.toFixed(0)}<span className="text-zinc-500 font-normal">/{max}</span></div>
                     <div className="text-zinc-500 my-0.5">{label}</div>
                     <div className="mt-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
                        <div className="h-full rounded-full bg-zinc-400" style={{ width: `${pct}%` }} />
                     </div>
                  </div>
               );
            })}
         </div>

         {score.traffic_congestion !== null && (
            <div className="mt-3 flex items-center gap-2 text-xs rounded-lg p-2" style={{ backgroundColor: "rgba(39,39,42,0.6)", border: "1px solid rgba(63,63,70,0.4)" }}>
               <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: score.traffic_congestion >= 0.8 ? "#10b981" : score.traffic_congestion >= 0.5 ? "#eab308" : score.traffic_congestion >= 0.3 ? "#f97316" : "#ef4444" }}
               />
               <span className="text-zinc-400">Traffic</span>
               <span className="text-zinc-200 font-semibold">
                  {score.traffic_congestion >= 0.8 ? "Free flow" : score.traffic_congestion >= 0.5 ? "Moderate" : score.traffic_congestion >= 0.3 ? "Heavy" : "Severe"}
               </span>
               <span className="text-zinc-500 ml-auto">{Math.round(score.traffic_congestion * 100)}% speed</span>
            </div>
         )}

         <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-2 text-xs flex-wrap">
               {venue.wifi_quality && <span className="text-zinc-400 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,39,42,0.6)", border: "1px solid rgba(63,63,70,0.4)" }}>WiFi: {venue.wifi_quality}</span>}
               {venue.has_outlets && <span className="text-zinc-400 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,39,42,0.6)", border: "1px solid rgba(63,63,70,0.4)" }}>Outlets</span>}
               {venue.serves_food && <span className="text-zinc-400 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,39,42,0.6)", border: "1px solid rgba(63,63,70,0.4)" }}>Food</span>}
               {venue.price_tier && <span className="text-zinc-400 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(39,39,42,0.6)", border: "1px solid rgba(63,63,70,0.4)" }}>{"$".repeat(venue.price_tier)}</span>}
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
