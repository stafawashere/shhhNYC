"use client";

import Link from "next/link";
import { VenueWithScore } from "@/lib/api";

const labelColors: Record<string, string> = {
   "Very Quiet": "bg-emerald-100 text-emerald-800",
   Quiet: "bg-green-100 text-green-800",
   Moderate: "bg-yellow-100 text-yellow-800",
   Loud: "bg-orange-100 text-orange-800",
   "Very Loud": "bg-red-100 text-red-800",
};

interface Props {
   data: VenueWithScore;
}

export default function VenueDetail({ data }: Props) {
   const { venue, score } = data;

   return (
      <div className="max-w-xl mx-auto px-6 py-10">
         <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to map
         </Link>

         <div className="mt-6 flex items-start justify-between gap-4">
            <div>
               <h1 className="text-2xl font-bold text-gray-900">
                  {venue.name}
               </h1>
               <p className="text-sm text-gray-500 mt-1">
                  {venue.address}
               </p>
               <p className="text-sm text-gray-400">
                  {venue.neighborhood} · {venue.borough}
               </p>
            </div>
            <div className="text-center shrink-0">
               <div className="text-5xl font-bold text-gray-900">
                  {score.quiet_score}
               </div>
               <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${labelColors[score.label] ?? "bg-gray-100 text-gray-600"}`}
               >
                  {score.label}
               </span>
               <p className="text-xs text-gray-400 mt-1">
                  {Math.round(score.confidence * 100)}% confidence
               </p>
            </div>
         </div>

         <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
               Score Breakdown
            </h2>
            <div className="grid grid-cols-3 gap-3">
               {[
                  { label: "Venue traits", value: score.breakdown.venue_traits, max: 40 },
                  { label: "Time pattern", value: score.breakdown.time_pattern, max: 50 },
                  { label: "Live adjustment", value: score.breakdown.live_adjustment, max: 15 },
               ].map(({ label, value, max }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-4 text-center">
                     <div className="text-2xl font-bold text-gray-900">
                        {value.toFixed(0)}
                     </div>
                     <div className="text-xs text-gray-500 mt-1">{label}</div>
                     <div className="text-xs text-gray-300">/ {max}</div>
                  </div>
               ))}
            </div>
         </div>

         <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
               Venue Details
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
               {[
                  ["WiFi", venue.wifi_quality],
                  ["WiFi policy", venue.wifi_policy],
                  ["Music", venue.music_policy],
                  ["Ceiling", venue.ceiling_type],
                  ["Espresso bar", venue.espresso_position],
                  ["Seating", venue.seating_type?.join(", ")],
                  ["Price", venue.price_tier ? "$".repeat(venue.price_tier) : null],
                  ["Outlets", venue.has_outlets ? "Yes" : "No"],
                  ["Food", venue.serves_food ? "Yes" : "No"],
                  ["Alcohol", venue.serves_alcohol ? "Yes" : "No"],
                  ["Kid friendly", venue.kid_friendly ? "Yes" : "No"],
               ]
                  .filter(([, v]) => v != null)
                  .map(([label, value]) => (
                     <div key={label as string} className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="text-gray-900 font-medium capitalize">{value}</dd>
                     </div>
                  ))}
            </dl>
         </div>
      </div>
   );
}
