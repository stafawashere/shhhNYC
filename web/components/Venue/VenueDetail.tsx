"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Wifi, Music2, ChevronsUp, Coffee, Armchair, DollarSign, Zap, Utensils, Wine, Baby, Lock, HardHat, Volume2, CalendarDays } from "lucide-react";
import { VenueWithScore, VenueWarning, getVenueDebug, getVenueHourly, getVenueWarnings } from "@/lib/api";
import HourlyChart from "./HourlyChart";

const IS_DEV = process.env.NODE_ENV !== "production";

function humanize(val: string | null | undefined): string | null {
   if (!val) return null;
   return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SCORE_COLORS: Record<string, { ring: string; badge: string; bar: string }> = {
   "Very Quiet": { ring: "#10b981", badge: "bg-emerald-900/40 text-emerald-300", bar: "bg-emerald-500" },
   Quiet:        { ring: "#22c55e", badge: "bg-green-900/40 text-green-300",     bar: "bg-green-400" },
   Moderate:     { ring: "#eab308", badge: "bg-yellow-900/40 text-yellow-300",   bar: "bg-yellow-400" },
   Loud:         { ring: "#f97316", badge: "bg-orange-900/40 text-orange-300",   bar: "bg-orange-400" },
   "Very Loud":  { ring: "#ef4444", badge: "bg-red-900/40 text-red-300",         bar: "bg-red-500" },
};

// breakdown values are noise penalties — invert to show quiet contribution
const BREAKDOWN_CONFIG = [
   { key: "venue_traits" as const,    label: "Space",       max: 40, color: "bg-violet-500" },
   { key: "time_pattern" as const,    label: "Time",        max: 50, color: "bg-blue-500" },
   { key: "live_adjustment" as const, label: "Live signal", max: 15, color: "bg-cyan-500", isModifier: true },
];

function ScoreRing({ score, color }: { score: number; color: string }) {
   const r = 44;
   const circ = 2 * Math.PI * r;
   const offset = circ * (1 - score / 100);
   return (
      <svg width={104} height={104} className="rotate-[-90deg]">
         <circle cx={52} cy={52} r={r} fill="none" stroke="#27272a" strokeWidth={10} />
         <circle
            cx={52} cy={52} r={r}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
         />
         <text x={52} y={57} textAnchor="middle" dominantBaseline="middle"
            transform="rotate(90, 52, 52)"
            style={{ fill: "#f4f4f5", fontSize: 26, fontWeight: 800 }}>
            {score}
         </text>
      </svg>
   );
}

function DebugRow({ k, v }: { k: string; v: unknown }) {
   const display = v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
   return (
      <div className="flex gap-2 border-b border-yellow-900/40 py-0.5">
         <span className="text-yellow-600 shrink-0 w-56">{k}</span>
         <span className="text-yellow-300 font-bold truncate" title={display}>{display}</span>
      </div>
   );
}

const DETAIL_ICONS: Record<string, React.ReactNode> = {
   "WiFi":        <Wifi size={13} />,
   "WiFi policy": <Lock size={13} />,
   "Music":       <Music2 size={13} />,
   "Ceiling":     <ChevronsUp size={13} />,
   "Espresso bar":<Coffee size={13} />,
   "Seating":     <Armchair size={13} />,
   "Price":       <DollarSign size={13} />,
   "Outlets":     <Zap size={13} />,
   "Food":        <Utensils size={13} />,
   "Alcohol":     <Wine size={13} />,
   "Kid friendly":<Baby size={13} />,
};

interface Props { data: VenueWithScore }

export default function VenueDetail({ data }: Props) {
   const { venue, score } = data;
   const colors = SCORE_COLORS[score.label] ?? SCORE_COLORS["Moderate"];

   const [debug, setDebug] = useState<Record<string, unknown> | null>(null);
   const [hourly, setHourly] = useState<{ day_of_week: number; current_hour: number; slots: { hour: number; busyness: number }[] } | null>(null);
   const [warnings, setWarnings] = useState<VenueWarning[]>([]);

   useEffect(() => {
      getVenueHourly(venue.id).then(setHourly).catch(() => null);
      getVenueWarnings(venue.id).then(setWarnings).catch(() => null);
      if (IS_DEV) getVenueDebug(venue.id).then(setDebug).catch(() => null);
   }, [venue.id]);

   const updatedAt = debug
      ? (() => { try { return formatDistanceToNow(new Date(debug.evaluated_at as string), { addSuffix: true }); } catch { return null; } })()
      : null;

   return (
      <div className={`${IS_DEV ? "max-w-5xl" : "max-w-xl"} mx-auto px-5 py-8 text-zinc-100`}>
         <div className={IS_DEV ? "flex flex-col md:flex-row gap-8 md:items-start" : ""}>

            {/* main content */}
            <div className="flex-1 min-w-0">
               <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-50 transition-colors py-1"
               >
                  <ArrowLeft size={15} />
                  Back to map
               </Link>

               {/* warnings */}
               {warnings.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                     {warnings.map((w, i) => {
                        const styles = {
                           high:   { wrap: "bg-orange-950/60 border-orange-700/50 text-orange-200", icon: <HardHat size={14} className="text-orange-400 shrink-0 mt-0.5" /> },
                           medium: { wrap: "bg-yellow-950/60 border-yellow-700/50 text-yellow-200", icon: <Volume2 size={14} className="text-yellow-400 shrink-0 mt-0.5" /> },
                           low:    { wrap: "bg-blue-950/60 border-blue-700/50 text-blue-200",       icon: <CalendarDays size={14} className="text-blue-400 shrink-0 mt-0.5" /> },
                        }[w.severity];
                        return (
                           <div key={i} className={`flex gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs ${styles.wrap}`}>
                              {styles.icon}
                              <div>
                                 <p className="font-semibold leading-snug">{w.title}</p>
                                 <p className="opacity-75 mt-0.5 leading-snug">{w.detail}</p>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}

               {/* header */}
               <div className="mt-6 flex items-start gap-5">
                  <div className="flex-1 min-w-0">
                     <h1 className="text-2xl font-bold text-zinc-50 leading-tight">{venue.name}</h1>
                     <p className="text-sm text-zinc-400 mt-1">{venue.address}</p>
                     <p className="text-xs text-zinc-500">{venue.neighborhood} · {venue.borough}</p>
                     <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${colors.badge}`}>{score.label}</span>
                        <span className="text-xs text-zinc-500">{Math.round(score.confidence * 100)}% confidence</span>
                        {updatedAt && <span className="text-xs text-zinc-600">· updated {updatedAt}</span>}
                     </div>
                  </div>
                  <ScoreRing score={score.quiet_score} color={colors.ring} />
               </div>

               {/* score bar */}
               <div className="mt-4 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${score.quiet_score}%` }} />
               </div>

               {/* breakdown — values inverted so higher = quieter */}
               <div className="mt-6">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Score breakdown</h2>
                  <div className="grid grid-cols-3 gap-3">
                     {BREAKDOWN_CONFIG.map(({ key, label, max, color, isModifier }) => {
                        const raw = score.breakdown[key];
                        // for modifiers (live_adjustment) show signed value; for penalties invert
                        const display = isModifier ? raw : max - raw;
                        const pct = isModifier
                           ? ((raw + max) / (max * 2)) * 100  // center 0 in the bar
                           : ((max - raw) / max) * 100;
                        const sign = isModifier && raw > 0 ? "+" : "";
                        return (
                           <div key={key} className="bg-zinc-900 rounded-xl p-4 text-center">
                              <div className="text-xl font-extrabold text-zinc-50">
                                 {sign}{display.toFixed(0)}<span className="text-xs text-zinc-600 font-normal">/{max}</span>
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">{label}</div>
                              <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                 <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                              </div>
                           </div>
                        );
                     })}
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">Higher = quieter · Live signal is a ±15 modifier</p>
               </div>

               {/* hourly chart */}
               {hourly && hourly.slots.length > 0 && (
                  <div className="mt-6">
                     <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Busyness today</h2>
                     <div className="bg-zinc-900 rounded-xl px-3 pt-3 pb-1">
                        <HourlyChart data={hourly.slots} currentHour={hourly.current_hour} />
                     </div>
                  </div>
               )}

               {/* venue details */}
               <div className="mt-6">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Venue details</h2>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                     {([
                        ["WiFi", humanize(venue.wifi_quality)],
                        ["WiFi policy", humanize(venue.wifi_policy)],
                        ["Music", humanize(venue.music_policy)],
                        ["Ceiling", humanize(venue.ceiling_type)],
                        ["Espresso bar", humanize(venue.espresso_position)],
                        ["Seating", venue.seating_type?.map(humanize).join(", ")],
                        ["Price", venue.price_tier ? "$".repeat(venue.price_tier) : null],
                        ["Outlets", venue.has_outlets ? "Yes" : "No"],
                        ["Food", venue.serves_food ? "Yes" : "No"],
                        ["Alcohol", venue.serves_alcohol ? "Yes" : "No"],
                        ["Kid friendly", venue.kid_friendly ? "Yes" : "No"],
                     ] as [string, string | null | undefined][])
                        .filter(([, v]) => v != null)
                        .map(([label, value]) => (
                           <div key={label} className="flex justify-between items-center border-b border-zinc-800 pb-2">
                              <dt className="flex items-center gap-1.5 text-zinc-500">
                                 <span className="text-zinc-600">{DETAIL_ICONS[label]}</span>
                                 {label}
                              </dt>
                              <dd className="text-zinc-200 font-medium text-right">{value}</dd>
                           </div>
                        ))}
                  </dl>
               </div>
            </div>

            {/* dev debug — desktop only, pinned right */}
            {IS_DEV && (
               <div className="hidden md:block w-80 shrink-0 sticky top-8">
                  <div className="border border-dashed border-yellow-700/60 rounded-xl p-4 bg-yellow-950/30">
                     <h2 className="text-xs font-mono font-bold text-yellow-600 uppercase tracking-wide mb-3">Dev Debug</h2>
                     <div className="text-xs font-mono space-y-0.5">
                        <p className="text-yellow-700 uppercase tracking-widest pt-1 pb-0.5">scoring</p>
                        <DebugRow k="evaluated_at" v={debug?.evaluated_at} />
                        <DebugRow k="day_of_week" v={debug?.day_of_week} />
                        <DebugRow k="hour" v={debug?.hour} />
                        <DebugRow k="score.quiet_score" v={score.quiet_score} />
                        <DebugRow k="score.noise_score" v={100 - score.quiet_score} />
                        <DebugRow k="score.label" v={score.label} />
                        <DebugRow k="score.confidence" v={score.confidence} />
                        <DebugRow k="breakdown.venue_traits" v={`${score.breakdown.venue_traits} / 40 (${((score.breakdown.venue_traits / 40) * 100).toFixed(1)}%)`} />
                        <DebugRow k="breakdown.time_pattern" v={`${score.breakdown.time_pattern} / 50 (${((score.breakdown.time_pattern / 50) * 100).toFixed(1)}%)`} />
                        <DebugRow k="breakdown.live_adjustment" v={`${score.breakdown.live_adjustment} / ±15`} />
                        <DebugRow k="breakdown.sum_noise" v={score.breakdown.venue_traits + score.breakdown.time_pattern + score.breakdown.live_adjustment} />

                        <p className="text-yellow-700 uppercase tracking-widest pt-2 pb-0.5">google places</p>
                        <DebugRow k="place_id" v={(debug?.google_places as Record<string,unknown>)?.place_id} />
                        <DebugRow k="live_busyness" v={(debug?.google_places as Record<string,unknown>)?.live_busyness} />
                        <DebugRow k="popular_times.busyness_avg" v={(debug?.google_places as Record<string,unknown> & { popular_times_current_hour: Record<string,unknown> })?.popular_times_current_hour?.busyness_avg} />
                        <DebugRow k="popular_times.slots_total" v={(debug?.google_places as Record<string,unknown> & { popular_times_coverage: Record<string,unknown> })?.popular_times_coverage?.total_slots} />

                        <p className="text-yellow-700 uppercase tracking-widest pt-2 pb-0.5">openweather</p>
                        <DebugRow k="weather_modifier" v={(debug?.openweather as Record<string,unknown>)?.weather_modifier} />
                        <DebugRow k="modifier_recorded_at" v={(debug?.openweather as Record<string,unknown>)?.modifier_recorded_at} />

                        <p className="text-yellow-700 uppercase tracking-widest pt-2 pb-0.5">nyc open data / 311</p>
                        <DebugRow k="nearby_event" v={String((debug?.nyc_open_data as Record<string,unknown>)?.nearby_event)} />
                        <DebugRow k="event_description" v={(debug?.nyc_open_data as Record<string,unknown>)?.event_description} />
                        <DebugRow k="construction_nearby" v={String((debug?.nyc_open_data as Record<string,unknown>)?.construction_nearby)} />

                        <p className="text-yellow-700 uppercase tracking-widest pt-2 pb-0.5">realtime snapshot</p>
                        <DebugRow k="modifier_id" v={(debug?.realtime_snapshot as Record<string,unknown>)?.modifier_id} />
                        <DebugRow k="timestamp" v={(debug?.realtime_snapshot as Record<string,unknown>)?.timestamp} />

                        <p className="text-yellow-700 uppercase tracking-widest pt-2 pb-0.5">user signals (last 5)</p>
                        {debug && (debug.user_signals as unknown[])?.length
                           ? (debug.user_signals as Record<string,unknown>[]).map((s, i) => (
                              <DebugRow key={i} k={`signal[${i}]`} v={`rating=${s.noise_rating} headcount=${s.headcount_est} @ ${String(s.timestamp).slice(0,19)}`} />
                           ))
                           : <DebugRow k="user_signals" v="none" />
                        }
                        {!debug && <p className="text-yellow-600 italic">loading...</p>}
                     </div>
                  </div>
               </div>
            )}

         </div>
      </div>
   );
}
