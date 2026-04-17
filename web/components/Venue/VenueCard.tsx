"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Music2, DollarSign, Utensils, Clock, Sun, Award } from "lucide-react";
import { API_BASE, VenueWithScore } from "@/lib/api";
import { googleMapsVenueUrl } from "@/lib/googleMaps";
import { openNowStatus } from "@/lib/openingHours";
import { noiseColors, PILL_VALUES, GLASS_CARD, GLASS_SUBSURFACE, ICON_COLORS } from "@/lib/theme";

function useCountUp(target: number, duration = 700): number {
   const [value, setValue] = useState(0);
   const rafRef = useRef<number | null>(null);
   useEffect(() => {
      let start: number | null = null;
      const step = (ts: number) => {
         if (!start) start = ts;
         const progress = Math.min((ts - start) / duration, 1);
         setValue(Math.round(progress * target));
         if (progress < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
   }, [target, duration]);
   return value;
}

interface Props {
   data: VenueWithScore;
   onClose: () => void;
}

function humanize(val: string | null | undefined): string | null {
   if (!val) return null;
   return val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function CardValue({ value }: { value: string }) {
   if (value === "?")   return <span className="text-zinc-600 text-xs">?</span>;
   if (value === "Yes") return <span className="text-emerald-400 font-semibold text-xs">✓</span>;
   if (value === "No")  return <span className="text-red-500 font-semibold text-xs">✕</span>;
   const pillClass = PILL_VALUES[value];
   if (pillClass) return <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${pillClass}`}>{value}</span>;
   return <span className="text-zinc-300 font-medium">{value}</span>;
}

type DetailRow = { icon: React.ReactNode; iconColor: string; label: string; value: string };

function buildRows(venue: VenueWithScore["venue"]): DetailRow[] {
   const rows: DetailRow[] = [];

   const status = openNowStatus(venue.opening_hours);
   const hoursValue = status ? (status.open ? "Open" : "Closed") : "?";

   rows.push({ icon: <Music2 size={13} />,     iconColor: venue.music_policy         ? ICON_COLORS.music         : "text-zinc-700", label: "Music",    value: humanize(venue.music_policy) ?? "?" });
   rows.push({ icon: <DollarSign size={13} />, iconColor: venue.price_tier           ? ICON_COLORS.price         : "text-zinc-700", label: "Price",    value: venue.price_tier ? "$".repeat(venue.price_tier) : "?" });
   rows.push({ icon: <Utensils size={13} />,   iconColor: venue.serves_food          ? ICON_COLORS.food          : "text-zinc-700", label: "Food",     value: venue.serves_food    == null ? "?" : venue.serves_food    ? "Yes" : "No" });
   rows.push({ icon: <Clock size={13} />,      iconColor: status                     ? ICON_COLORS.hours         : "text-zinc-700", label: "Hours",    value: hoursValue });
   rows.push({ icon: <Sun size={13} />,        iconColor: venue.has_outdoor_seating  ? ICON_COLORS.outdoorSeating: "text-zinc-700", label: "Outdoor",  value: venue.has_outdoor_seating == null ? "?" : venue.has_outdoor_seating ? "Yes" : "No" });
   rows.push({ icon: <Award size={13} />,      iconColor: venue.health_grade         ? ICON_COLORS.healthGrade   : "text-zinc-700", label: "Grade",    value: venue.health_grade ?? "?" });

   return rows;
}

export default function VenueCard({ data, onClose }: Props) {
   const { venue, score } = data;
   const colors = noiseColors(score.label);
   const animatedScore = useCountUp(score.quiet_score, 700);
   const rows = buildRows(venue);

   // pair rows into [left, right] columns
   const pairs: [DetailRow, DetailRow | null][] = [];
   for (let i = 0; i < rows.length; i += 2) {
      pairs.push([rows[i], rows[i + 1] ?? null]);
   }

   return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm rounded-2xl p-5 z-10"
         style={GLASS_CARD}
      >
         <button
            onClick={onClose}
            className="absolute top-3 right-3 w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-400 transition-colors shadow-md"
            style={{ zIndex: 9999 }}
            aria-label="Close"
         />

         {venue.photos && venue.photos.length > 0 && (
            <div className="relative -mx-5 -mt-5 mb-4 h-[88px] overflow-hidden rounded-t-2xl">
               <div className="flex h-full overflow-x-auto scrollbar-none">
                  {venue.photos.map((_, i) => (
                     // eslint-disable-next-line @next/next/no-img-element
                     <img
                        key={i}
                        src={`${API_BASE}/venues/${venue.id}/photo/${i}`}
                        alt={`${venue.name} photo ${i + 1}`}
                        draggable={false}
                        className="h-full flex-1 object-cover shrink-0 select-none opacity-55"
                        style={{ minWidth: 0 }}
                     />
                  ))}
               </div>
            </div>
         )}

         {/* Name + score */}
         <div className="flex items-start justify-between gap-4 pr-4">
            <div className="min-w-0">
               <h2 className="text-base font-semibold min-w-0">
                  <a
                     href={googleMapsVenueUrl(venue)}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="group inline-flex items-center gap-1 min-w-0 max-w-full cursor-pointer text-zinc-50 visited:text-zinc-50 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-500 rounded-sm"
                     onClick={(e) => e.stopPropagation()}
                     aria-label={`Open ${venue.name} in Google Maps`}
                  >
                     <span className="truncate min-w-0">{venue.name}</span>
                     <ExternalLink
                        className="block shrink-0 self-center text-zinc-500 transition-colors group-hover:text-zinc-300"
                        size={14}
                        strokeWidth={2}
                        aria-hidden
                     />
                  </a>
               </h2>
               <p className="text-xs text-zinc-500 mt-0.5">{venue.neighborhood} · {venue.borough}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 -mr-4 mt-2">
               <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {score.label}
               </span>
               <div className="flex items-baseline gap-0.5">
                  <div className={`text-3xl font-extrabold leading-none ${colors.num}`}>{animatedScore}</div>
                  <span className="text-zinc-600 text-[11px] font-medium">/115</span>
               </div>
            </div>
         </div>

         {/* score bar */}
         <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all bar-grow ${colors.bar}`} style={{ width: `${Math.min((score.quiet_score / 115) * 100, 100)}%` }} />
         </div>

         {/* venue details mini grid */}
         {pairs.length > 0 && (
            <div className="mt-5 rounded-xl mb-5 px-3 py-0.5" style={GLASS_SUBSURFACE}>
               <dl className="flex flex-col text-xs">
                  {pairs.map(([left, right], i) => (
                     <div key={i} className={`relative grid ${right ? "grid-cols-2" : "grid-cols-1"} py-2 gap-x-6 ${i < pairs.length - 1 ? "border-b border-zinc-800/60" : ""}`}>
                        {right && <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-700/70 -translate-x-1/2 opacity-50" />}
                        {[left, right].filter(Boolean).map((row) => {
                           const r = row as DetailRow;
                           return (
                              <div key={r.label} className="flex items-center justify-between gap-1.5">
                                 <dt className="flex items-center gap-2 text-zinc-500 shrink-0">
                                    <span className={`inline-flex items-center ${r.iconColor}`}>{r.icon}</span>
                                    {r.label}
                                 </dt>
                                 <dd className="text-right"><CardValue value={r.value} /></dd>
                              </div>
                           );
                        })}
                     </div>
                  ))}
               </dl>
            </div>
         )}

         {/* details strip */}
         <Link
            href={`/venue/${venue.id}`}
            className="mt-3 -mx-5 -mb-5 flex items-center justify-center gap-1.5 py-3 rounded-b-2xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors border-t border-zinc-700/50"
         >
            More details →
         </Link>
      </div>
   );
}
