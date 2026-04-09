"use client";

import Link from "next/link";
import { VenueWithScore } from "@/lib/api";

interface Props {
   data: VenueWithScore;
   onClose: () => void;
}

const labelColors: Record<string, string> = {
   "Very Quiet": "bg-emerald-100 text-emerald-800",
   Quiet: "bg-green-100 text-green-800",
   Moderate: "bg-yellow-100 text-yellow-800",
   Loud: "bg-orange-100 text-orange-800",
   "Very Loud": "bg-red-100 text-red-800",
};

export default function VenueCard({ data, onClose }: Props) {
   const { venue, score } = data;

   return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 z-10">
         <button
            onClick={onClose}
            className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-lg"
         >
            ✕
         </button>

         <div className="flex items-start justify-between gap-4">
            <div>
               <h2 className="text-lg font-semibold text-gray-900">
                  {venue.name}
               </h2>
               <p className="text-sm text-gray-500">
                  {venue.neighborhood} · {venue.borough}
               </p>
            </div>
            <div className="text-center shrink-0">
               <div className="text-3xl font-bold text-gray-900">
                  {score.quiet_score}
               </div>
               <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${labelColors[score.label] ?? "bg-gray-100 text-gray-600"}`}
               >
                  {score.label}
               </span>
            </div>
         </div>

         <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-500 text-center">
            <div className="bg-gray-50 rounded-lg p-2">
               <div className="font-medium text-gray-800">
                  {score.breakdown.venue_traits.toFixed(0)}
               </div>
               <div>Venue</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
               <div className="font-medium text-gray-800">
                  {score.breakdown.time_pattern.toFixed(0)}
               </div>
               <div>Time</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
               <div className="font-medium text-gray-800">
                  {score.breakdown.live_adjustment.toFixed(0)}
               </div>
               <div>Live</div>
            </div>
         </div>

         <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-3 text-xs text-gray-500">
               {venue.wifi_quality && <span>WiFi: {venue.wifi_quality}</span>}
               {venue.has_outlets && <span>· Outlets</span>}
               {venue.serves_food && <span>· Food</span>}
               {venue.price_tier && (
                  <span>· {"$".repeat(venue.price_tier)}</span>
               )}
            </div>
            <Link
               href={`/venue/${venue.id}`}
               className="text-xs font-medium text-gray-900 hover:underline shrink-0"
            >
               View details →
            </Link>
         </div>
      </div>
   );
}
