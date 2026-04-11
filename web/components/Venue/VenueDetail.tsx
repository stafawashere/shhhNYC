"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Wifi, Music2, ChevronsUp, Coffee, Armchair, DollarSign, Zap, Utensils, Wine, Baby, Lock, HardHat, Volume2, CalendarDays, Car, Info, Train, Maximize2 } from "lucide-react";
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

const BREAKDOWN_CONFIG = [
   { key: "venue_traits" as const,    label: "Space",       max: 40, color: "bg-violet-500", tooltip: <>Acoustic baseline from the venue's physical architecture, seating, and music policy.<div className="mt-2 text-zinc-400"><strong className="text-zinc-300">Higher:</strong> Excellent acoustic dampening.<br/><strong className="text-zinc-300">Lower:</strong> Echo-heavy spaces with loud music.</div></> },
   { key: "time_pattern" as const,    label: "Time",        max: 50, color: "bg-blue-500",   tooltip: <>Historical busyness based on Google foot-traffic models for this specific day and hour.<div className="mt-2 text-zinc-400"><strong className="text-zinc-300">Higher:</strong> Historically empty right now.<br/><strong className="text-zinc-300">Lower:</strong> Historically swamped right now.</div></> },
   { key: "live_adjustment" as const, label: "Live signal", max: 15, color: "bg-cyan-500",   isModifier: true, tooltip: <>Live fluctuations in local weather, 311 noise complaints, construction, and foot traffic spikes.<div className="mt-2 text-zinc-400"><strong className="text-zinc-300">Positive (+):</strong> Quieter than normal (e.g. raining).<br/><strong className="text-zinc-300">Negative (-):</strong> Very noisy (e.g. active construction or large crowd).</div></> },
   { key: "traffic_penalty" as const, label: "Traffic",     max: 10, color: "bg-amber-500",  tooltip: <>A geographic penalty based on instantaneous traffic flow speeds mapped by TomTom.<div className="mt-2 text-zinc-400"><strong className="text-zinc-300">Higher:</strong> Traffic is smoothly flowing or empty.<br/><strong className="text-zinc-300">Lower:</strong> Cars are backed up with potential honking.</div></> },
];

// ── debug card system ────────────────────────────────────────────────────────

type Health = "good" | "warn" | "bad" | "neutral";

const H: Record<Health, { border: string; bg: string; pill: string; num: string }> = {
   good:    { border: "border-emerald-500/25", bg: "bg-emerald-500/5",  pill: "bg-emerald-900/70 text-emerald-300", num: "text-emerald-300" },
   warn:    { border: "border-yellow-500/25",  bg: "bg-yellow-500/5",   pill: "bg-yellow-900/70 text-yellow-300",   num: "text-yellow-300"  },
   bad:     { border: "border-red-500/25",     bg: "bg-red-500/5",      pill: "bg-red-900/70 text-red-300",         num: "text-red-400"     },
   neutral: { border: "border-zinc-700/40",    bg: "bg-zinc-800/20",    pill: "bg-zinc-800 text-zinc-400",           num: "text-zinc-100"    },
};

function DbCard({ title, health = "neutral", children, full }: {
   title: string; health?: Health; children: React.ReactNode; full?: boolean;
}) {
   const h = H[health];
   return (
      <div className={`rounded-xl border p-3 ${h.border} ${h.bg} ${full ? "col-span-2" : ""}`}>
         <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-2 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
               health === "good" ? "bg-emerald-500" : health === "warn" ? "bg-yellow-400" : health === "bad" ? "bg-red-500" : "bg-zinc-600"
            }`} />
            {title}
         </p>
         {children}
      </div>
   );
}

function BigNum({ value, suffix, health = "neutral" }: {
   value: string | number | null | undefined; suffix?: string; health?: Health;
}) {
   const h = H[health];
   if (value === null || value === undefined) {
      return <span className="text-3xl font-black text-zinc-700 leading-none">—</span>;
   }
   return (
      <p className="leading-none">
         <span className={`text-3xl font-black ${h.num}`}>{value}</span>
         {suffix && <span className="text-xs text-zinc-500 ml-1">{suffix}</span>}
      </p>
   );
}

function Pill({ label, health }: { label: string; health: Health }) {
   return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${H[health].pill}`}>{label}</span>
   );
}

function Row({ k, v }: { k: string; v: unknown }) {
   const display = v === null || v === undefined ? "—" : String(v);
   return (
      <div className="flex justify-between items-baseline gap-1 text-[10px]">
         <span className="text-zinc-600 uppercase tracking-wide shrink-0">{k}</span>
         <span className="text-zinc-400 font-medium text-right truncate max-w-[60%]" title={display}>{display}</span>
      </div>
   );
}

// ── main component ───────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
   const r = 44;
   const circ = 2 * Math.PI * r;
   const offset = circ * (1 - score / 100);
   return (
      <svg width={104} height={104} className="rotate-[-90deg]">
         <circle cx={52} cy={52} r={r} fill="none" stroke="#27272a" strokeWidth={10} />
         <circle cx={52} cy={52} r={r} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }} />
         <text x={52} y={57} textAnchor="middle" dominantBaseline="middle"
            transform="rotate(90, 52, 52)"
            style={{ fill: "#f4f4f5", fontSize: 26, fontWeight: 800 }}>{score}</text>
      </svg>
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
   "Noise level":  <Volume2 size={13} />,
   "Subway":       <Train size={13} />,
   "Size":         <Maximize2 size={13} />,
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

   const bd = score.breakdown;
   const noiseRaw = bd.venue_traits + bd.time_pattern + bd.live_adjustment + bd.traffic_penalty;

   // typed debug sub-objects
   const gp  = debug?.google_places         as Record<string, unknown> | undefined;
   const rt  = debug?.realtime_snapshot     as Record<string, unknown> | undefined;
   const mta = debug?.mta                   as Record<string, unknown> | undefined;
   const tt  = debug?.tomtom               as Record<string, unknown> | undefined;
   const dep = debug?.dep_noise             as Record<string, unknown> | undefined;
   const od  = debug?.nyc_open_data         as Record<string, unknown> | undefined;
   const vs  = debug?.venue_static          as Record<string, unknown> | undefined;
   const cs  = debug?.computed_score        as Record<string, unknown> | undefined;
   const usc = debug?.user_signals_computed as Record<string, unknown> | undefined;
   const signals = debug?.user_signals      as Record<string, unknown>[] | undefined;

   const ageMin    = rt?.age_minutes   as number | null | undefined;
   const mtaSev    = mta?.disruption_severity as number | null | undefined;
   const congestion = tt?.traffic_congestion  as number | null | undefined;
   const depLevel  = dep?.ambient_level       as number | null | undefined;
   const eventCount    = (od?.event_count    as number) ?? 0;
   const complaintCount = (od?.noise_complaint_count as number) ?? 0;
   const construction  = od?.construction_nearby as boolean;

   // health derivations
   const scoreHealth: Health  = score.quiet_score >= 60 ? "good" : score.quiet_score >= 40 ? "warn" : "bad";
   const gpHealth: Health     = gp?.place_id ? (gp?.review_count ? "good" : "warn") : "bad";
   const rtHealth: Health     = ageMin == null ? "neutral" : ageMin < 5 ? "good" : ageMin < 30 ? "warn" : "bad";
   const mtaHealth: Health    = mtaSev == null ? "neutral" : mtaSev < 0.5 ? "good" : mtaSev < 2.5 ? "warn" : "bad";
   const ttHealth: Health     = congestion == null ? "neutral" : congestion >= 0.8 ? "good" : congestion >= 0.5 ? "warn" : "bad";
   const depHealth: Health    = depLevel == null ? "neutral" : depLevel < 60 ? "good" : depLevel < 80 ? "warn" : "bad";
   const odHealth: Health     = (eventCount > 10 || complaintCount > 3 || construction) ? "bad" : (eventCount > 0 || complaintCount > 0) ? "warn" : "good";

   return (
      <div className={`${IS_DEV ? "max-w-5xl" : "max-w-xl"} mx-auto px-5 py-8 text-zinc-100`}>
         <div className={IS_DEV ? "flex flex-col md:flex-row gap-8 md:items-start" : ""}>

            {/* ── main content ── */}
            <div className="flex-1 min-w-0">
               <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-50 transition-colors py-1">
                  <ArrowLeft size={15} />Back to map
               </Link>

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

               <div className="mt-4 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${score.quiet_score}%` }} />
               </div>

               <div className="mt-6">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Score breakdown</h2>
                  <div className="grid grid-cols-4 gap-3">
                     {BREAKDOWN_CONFIG.map(({ key, label, max, color, isModifier, tooltip }) => {
                        const raw = score.breakdown[key];
                        const val = isModifier ? -raw : max - raw;
                        const pct = isModifier ? ((max - raw) / (max * 2)) * 100 : ((max - raw) / max) * 100;
                        const sign = isModifier && val > 0 ? "+" : "";
                        return (
                           <div key={key} className="bg-zinc-900 rounded-xl p-4 text-center">
                              <div className="text-xl font-extrabold text-zinc-50">
                                 {sign}{val.toFixed(0)}<span className="text-xs text-zinc-600 font-normal">/{max}</span>
                              </div>
                              <div className="text-xs text-zinc-500 mt-1 flex justify-center items-center gap-1 group relative">
                                 {label}
                                 <Info size={11} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-left text-[11px] leading-snug shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all border border-zinc-700 z-10 pointer-events-none">
                                    {tooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-[5px] border-transparent border-t-zinc-700" />
                                 </div>
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                 <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                              </div>
                           </div>
                        );
                     })}
                  </div>

                  {score.traffic_congestion !== null && (() => {
                     const tc = score.traffic_congestion!;
                     const tcColor = tc >= 0.8 ? "#10b981" : tc >= 0.5 ? "#eab308" : tc >= 0.3 ? "#f97316" : "#ef4444";
                     const tcLabel = tc >= 0.8 ? "Free flow" : tc >= 0.5 ? "Moderate traffic" : tc >= 0.3 ? "Heavy traffic" : "Severe congestion";
                     return (
                        <div className="mt-4 bg-zinc-900 rounded-xl p-4">
                           <div className="flex items-center gap-2 mb-2">
                              <Car size={14} className="text-zinc-500" />
                              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Traffic Congestion</span>
                           </div>
                           <div className="flex items-center gap-3">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tcColor }} />
                              <span className="text-lg font-semibold text-zinc-100">{tcLabel}</span>
                              <span className="text-sm text-zinc-500 ml-auto">{Math.round(tc * 100)}% of free-flow speed</span>
                           </div>
                           <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                              <div className="h-full rounded-full" style={{ backgroundColor: tcColor, width: `${Math.round(tc * 100)}%` }} />
                           </div>
                        </div>
                     );
                  })()}
               </div>

               {hourly && hourly.slots.length > 0 && (
                  <div className="mt-6">
                     <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Busyness today</h2>
                     <div className="bg-zinc-900 rounded-xl px-3 pt-3 pb-1">
                        <HourlyChart data={hourly.slots} currentHour={hourly.current_hour} />
                     </div>
                  </div>
               )}

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
                        ["Noise level", humanize(venue.noise_level_yelp)],
                        ["Subway", venue.nearest_subway_m != null ? `${venue.nearest_subway_m} m` : null],
                        ["Size", venue.sq_ft != null ? `${venue.sq_ft.toLocaleString()} sq ft` : null],
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

            {/* ── dev debug dashboard ── */}
            {IS_DEV && (
               <div className="hidden md:block w-80 shrink-0 sticky top-8 space-y-2">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Dev Debug</h2>

                  {/* Score */}
                  <DbCard title="Quiet Score" health={scoreHealth} full>
                     <div className="flex items-center gap-3 mb-3">
                        <span className={`text-5xl font-black leading-none ${H[scoreHealth].num}`}>{score.quiet_score}</span>
                        <div className="space-y-1">
                           <Pill label={score.label} health={scoreHealth} />
                           <p className="text-[10px] text-zinc-600">{Math.round(score.confidence * 100)}% confidence</p>
                        </div>
                        <div className="ml-auto text-right">
                           <p className={`text-xl font-black ${H[scoreHealth].num}`}>{noiseRaw.toFixed(1)}</p>
                           <p className="text-[9px] text-zinc-600 uppercase tracking-wide">noise / 115</p>
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        {[
                           { label: "space",   value: bd.venue_traits,    max: 40, color: "bg-violet-500" },
                           { label: "time",    value: bd.time_pattern,    max: 50, color: "bg-blue-500" },
                           { label: "live",    value: bd.live_adjustment, max: 15, color: "bg-cyan-500", mod: true },
                           { label: "traffic", value: bd.traffic_penalty, max: 10, color: "bg-amber-500" },
                        ].map(({ label, value, max, color, mod }) => (
                           <div key={label} className="flex items-center gap-2">
                              <span className="text-[9px] text-zinc-600 uppercase tracking-wide w-10 shrink-0">{label}</span>
                              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                 <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, (Math.abs(value) / max) * 100))}%` }} />
                              </div>
                              <span className="text-[10px] text-zinc-400 w-14 text-right shrink-0">
                                 {mod && value > 0 ? "+" : ""}{value.toFixed(1)}<span className="text-zinc-700">/{mod ? `±${max}` : max}</span>
                              </span>
                           </div>
                        ))}
                     </div>
                     <div className="mt-2 pt-2 border-t border-zinc-800 flex justify-between text-[10px]">
                        <span className="text-zinc-600">temporal src</span>
                        <span className={cs?.temporal_source === "fallback" ? "text-yellow-400 font-bold" : "text-zinc-400"}>{String(cs?.temporal_source ?? "—")}</span>
                     </div>
                     <div className="flex justify-between text-[10px] mt-1">
                        <span className="text-zinc-600">static completeness</span>
                        <span className="text-zinc-400">{cs?.static_completeness != null ? `${Math.round((cs.static_completeness as number) * 100)}%` : "—"}</span>
                     </div>
                  </DbCard>

                  {/* Confidence breakdown */}
                  {(() => {
                     const cb = cs?.confidence_breakdown as Record<string, number> | undefined;
                     if (!cb) return null;
                     const rows: [string, number, number][] = [
                        ["profile coverage",   cb.profile_coverage,      0.30],
                        ["profile this hour",  cb.profile_current_hour,  0.05],
                        ["yelp noise",         cb.yelp_noise,            0.08],
                        ["google nlp",         cb.google_nlp,            0.07],
                        ["rt freshness",       cb.rt_freshness,          0.18],
                        ["tomtom",             cb.tomtom,                0.07],
                        ["live busyness",      cb.live_busyness,         0.04],
                        ["dep noise",          cb.dep_noise,             0.10],
                        ["user signals",       cb.user_signals,          0.15],
                        ["consensus bonus",    cb.consensus_bonus,       0.15],
                     ];
                     const total = cb.total as number;
                     const confHealth: Health = total >= 0.8 ? "good" : total >= 0.5 ? "warn" : "bad";
                     return (
                        <DbCard title="Confidence Breakdown" health={confHealth} full>
                           <div className="flex items-end gap-2 mb-3">
                              <span className={`text-4xl font-black leading-none ${H[confHealth].num}`}>{Math.round(total * 100)}%</span>
                              <span className="text-zinc-600 text-xs mb-0.5">/ 100%</span>
                           </div>
                           <div className="space-y-1.5">
                              {rows.map(([label, val, max]) => {
                                 const pct = Math.min(100, (val / max) * 100);
                                 const active = val > 0;
                                 return (
                                    <div key={label} className="flex items-center gap-2">
                                       <span className={`text-[9px] uppercase tracking-wide w-28 shrink-0 ${active ? "text-zinc-400" : "text-zinc-700"}`}>{label}</span>
                                       <div className={`flex-1 h-1 rounded-full overflow-hidden ${active ? "bg-zinc-800" : "bg-zinc-900"}`}>
                                          <div className={`h-full rounded-full ${active ? "bg-indigo-500" : "bg-zinc-800"}`} style={{ width: `${pct}%` }} />
                                       </div>
                                       <span className={`text-[10px] w-10 text-right shrink-0 font-bold ${active ? "text-zinc-300" : "text-zinc-700"}`}>
                                          {val > 0 ? `+${(val * 100).toFixed(0)}` : "—"}
                                       </span>
                                    </div>
                                 );
                              })}
                           </div>
                        </DbCard>
                     );
                  })()}

                  {/* 2-col source cards */}
                  <div className="grid grid-cols-2 gap-2">

                     {/* Google Places */}
                     <DbCard title="Google Places" health={gpHealth}>
                        <BigNum value={gp?.review_count as number ?? null} suffix="reviews" health={gpHealth} />
                        <div className="mt-2 space-y-1">
                           <Row k="nlp" v={gp?.noise_estimate_nlp} />
                           <Row k="live" v={gp?.live_busyness} />
                           <Row k="pt slots" v={(gp?.popular_times_coverage as Record<string,unknown>)?.total_slots} />
                        </div>
                     </DbCard>

                     {/* Realtime freshness */}
                     <DbCard title="Realtime" health={rtHealth}>
                        <BigNum value={ageMin != null ? `${ageMin}m` : null} suffix="old" health={rtHealth} />
                        <div className="mt-2 space-y-1">
                           <Row k="id" v={rt?.modifier_id} />
                           <Row k="busyness" v={rt?.google_live_busyness} />
                           <Row k="weather" v={rt?.weather_modifier} />
                        </div>
                     </DbCard>

                     {/* MTA */}
                     <DbCard title="MTA" health={mtaHealth}>
                        <Pill label={(mta?.severity_label as string) ?? "—"} health={mtaHealth} />
                        <div className="mt-2 space-y-1">
                           <Row k="severity" v={mtaSev} />
                           <Row k="impact" v={mta?.score_impact} />
                        </div>
                     </DbCard>

                     {/* TomTom */}
                     <DbCard title="TomTom" health={ttHealth}>
                        <BigNum value={congestion != null ? `${Math.round(congestion * 100)}%` : null} health={ttHealth} />
                        <div className="mt-2 space-y-1">
                           <Row k="label" v={tt?.congestion_label} />
                           <Row k="incidents" v={tt?.incidents_nearby} />
                           <Row k="penalty" v={tt?.traffic_penalty} />
                        </div>
                     </DbCard>

                     {/* DEP */}
                     <DbCard title="DEP Noise" health={depHealth}>
                        <BigNum value={depLevel} suffix="/ 100" health={depHealth} />
                        <div className="mt-2 space-y-1">
                           <Row k="impact" v={dep?.score_impact} />
                        </div>
                     </DbCard>

                     {/* NYC 311 */}
                     <DbCard title="NYC 311" health={odHealth}>
                        <div className="flex gap-4">
                           <div>
                              <p className={`text-3xl font-black leading-none ${H[odHealth].num}`}>{eventCount}</p>
                              <p className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">events</p>
                           </div>
                           <div>
                              <p className={`text-3xl font-black leading-none ${H[odHealth].num}`}>{complaintCount}</p>
                              <p className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">complaints</p>
                           </div>
                        </div>
                        <div className="mt-2 space-y-1">
                           <Row k="construction" v={construction ? "yes" : "no"} />
                           <Row k="baseline/wk"  v={od?.complaint_baseline_weekly} />
                           <Row k="event" v={od?.event_description} />
                        </div>
                     </DbCard>

                  </div>

                  {/* Venue Static */}
                  <DbCard title="Venue Static" health={vs?.sq_ft ? "neutral" : "bad"} full>
                     <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <Row k="sq_ft"        v={vs?.sq_ft} />
                        <Row k="ceiling"      v={vs?.ceiling_type} />
                        <Row k="music"        v={vs?.music_policy} />
                        <Row k="espresso"     v={vs?.espresso_position} />
                        <Row k="seating"      v={vs?.seating_type} />
                        <Row k="serves_food"  v={vs?.serves_food} />
                        <Row k="serves_alc"   v={vs?.serves_alcohol} />
                        <Row k="yelp noise"   v={vs?.noise_level_yelp} />
                        <Row k="subway m"     v={vs?.nearest_subway_m} />
                        <Row k="pedestrian"   v={vs?.pedestrian_volume} />
                        <Row k="reviews"      v={vs?.google_review_count} />
                        <Row k="google nlp"   v={vs?.google_noise_estimate} />
                     </div>
                  </DbCard>

                  {/* User Signals Computed */}
                  <DbCard title="User Signals Computed" health={usc?.signal_count_72h ? "good" : "neutral"} full>
                     <div className="flex gap-6 mb-2">
                        <div>
                           <p className={`text-3xl font-black leading-none ${usc?.signal_count_72h ? H.good.num : H.neutral.num}`}>{String(usc?.signal_count_72h ?? 0)}</p>
                           <p className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">signals 72h</p>
                        </div>
                        <div>
                           <p className={`text-3xl font-black leading-none ${usc?.user_avg_weighted != null ? H.good.num : H.neutral.num}`}>{usc?.user_avg_weighted != null ? (usc.user_avg_weighted as number).toFixed(2) : "—"}</p>
                           <p className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">avg rating</p>
                        </div>
                     </div>
                     <Row k="sig_score (conf contrib)" v={usc?.sig_score} />
                  </DbCard>

                  {/* User Signals */}
                  <DbCard title={`User Signals (${signals?.length ?? 0})`} health={signals?.length ? "good" : "neutral"} full>
                     {signals?.length ? (
                        <div className="space-y-1.5">
                           {signals.map((s, i) => (
                              <div key={i} className="flex justify-between items-center text-[10px] border-b border-zinc-800/60 pb-1.5">
                                 <span className="text-zinc-600">{String(s.timestamp).slice(0, 16).replace("T", " ")}</span>
                                 <span className="text-zinc-200 font-bold">★ {s.noise_rating as number} / 5</span>
                              </div>
                           ))}
                        </div>
                     ) : (
                        <p className="text-zinc-600 text-xs">no signals yet</p>
                     )}
                  </DbCard>

                  {!debug && (
                     <div className="text-center py-6 text-zinc-600 text-xs">loading debug data…</div>
                  )}

               </div>
            )}

         </div>
      </div>
   );
}
