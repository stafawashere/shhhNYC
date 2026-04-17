"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Share2, RefreshCw, ExternalLink, Music2, Armchair, DollarSign, Utensils, Wine, HardHat, Volume2, VolumeX, CalendarDays, Info, Train, Maximize2, ChevronDown, Clock, Phone, Globe, Sun, Award, Mic2, GlassWater } from "lucide-react";
import { openHoursForPyDay, openNowStatus, todayWeekdayText } from "@/lib/openingHours";
import { API_BASE, Venue, VenueWithScore, getVenue, getVenueDebug, getVenueHourly } from "@/lib/api";
import { noiseColors, HEALTH, BREAKDOWN_COLORS, GLASS_TOOLTIP, PILL_VALUES, ICON_COLORS, type Health } from "@/lib/theme";
import { googleMapsVenueUrl } from "@/lib/googleMaps";
import HourlyChart from "./HourlyChart";
import Tooltip from "../common/Tooltip";

const COLLAPSE_KEY = "shhh_section_collapse";

// easeOutCubic — gentle deceleration so the final ticks are visible rather than snapping home
function easeOutExpo(t: number): number {
   return 1 - Math.pow(1 - t, 3);
}

// Scale duration by magnitude: 0→3 finishes ~500ms, 0→100 ~1400ms — avoids the
// "forever to count three ticks" feel while keeping larger values visibly smooth.
function scaleDuration(target: number): number {
   return 450 + Math.min(1, Math.abs(target) / 100) * 950;
}

function useCountUp(target: number, duration?: number, enabled = true): number {
   const [value, setValue] = useState(0);
   const rafRef = useRef<number | null>(null);
   const effectiveDuration = duration ?? scaleDuration(target);
   useEffect(() => {
      if (!enabled) return;
      let start: number | null = null;
      const step = (ts: number) => {
         if (!start) start = ts;
         const progress = Math.min((ts - start) / effectiveDuration, 1);
         setValue(progress < 1 ? Math.round(easeOutExpo(progress) * target) : target);
         if (progress < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
   }, [target, effectiveDuration, enabled]);
   return value;
}

// The numeric value is animated via useCountUp; render plainly so per-frame digit
// changes don't re-trigger and stack a CSS slide animation (which looked glitchy).
function OdometerNumber({ value }: { value: number | string }) {
   return <span className="tabular-nums">{value}</span>;
}

function useCollapse(id: string): [boolean, () => void] {
   // Always start true so server and client first render match (no hydration mismatch).
   // After mount, sync from localStorage.
   const [open, setOpen] = useState<boolean>(true);
   useEffect(() => {
      try {
         const stored = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}");
         if (stored[id] === false) setOpen(false);
      } catch {}
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);
   const toggle = () => setOpen(prev => {
      const next = !prev;
      try {
         const stored = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}");
         localStorage.setItem(COLLAPSE_KEY, JSON.stringify({ ...stored, [id]: next }));
      } catch {}
      return next;
   });
   return [open, toggle];
}

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
   return (
      <button
         onClick={onToggle}
         className="flex items-center justify-between w-full group mb-3"
      >
         <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{label}</h2>
         <ChevronDown
            size={14}
            className={`text-zinc-600 group-hover:text-zinc-400 transition-all duration-200 ${open ? "" : "-rotate-90"}`}
         />
      </button>
   );
}


/** Shared panel for Overview column tooltips (padding and alignment). */
function TooltipPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
   return (
      <div
         className={`p-3 rounded-xl text-zinc-300 text-left text-sm leading-snug shadow-2xl border border-zinc-700/60 ${className}`}
         style={GLASS_TOOLTIP}
      >
         {children}
      </div>
   );
}

function humanize(val: string | null | undefined): string | null {
   if (!val) return null;
   return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreLabelCardStyles(label: string) {
   const p = noiseColors(label);
   return { border: p.cardBorder, bg: p.cardBg, pill: p.cardPill, num: p.num, dot: p.dot };
}

const BREAKDOWN_CONFIG = [
   {
      key: "venue_traits" as const,
      label: "Space",
      max: 40,
      color: BREAKDOWN_COLORS.space,
      tooltip: (
         <>
            How noisy we expect this <span className="text-zinc-200">place</span> to be on its own—layout, music policy, seating, and review hints.
            <div className="mt-2 text-zinc-400">
               A <span className="text-zinc-300">higher</span> number here means a calmer space (less noise from this factor).
            </div>
         </>
      ),
   },
   {
      key: "time_pattern" as const,
      label: "Time",
      max: 50,
      color: BREAKDOWN_COLORS.time,
      tooltip: (
         <>
            How busy and loud it <span className="text-zinc-200">usually</span> is at this day and time, from typical crowd patterns.
            <div className="mt-2 text-zinc-400">
               A <span className="text-zinc-300">higher</span> number means this hour tends to be quieter.
            </div>
         </>
      ),
   },
   {
      key: "live_adjustment" as const,
      label: "Live signal",
      max: 15,
      color: BREAKDOWN_COLORS.live,
      isModifier: true,
      tooltip: (
         <>
            What’s <span className="text-zinc-200">happening right now</span> compared to normal—weather, crowd vs usual, construction, complaints, trains, and street noise.
            <div className="mt-2 text-zinc-400">
               <span className="text-zinc-300">+</span> pulls things quieter; <span className="text-zinc-300">−</span> means louder than the baseline.
            </div>
         </>
      ),
   },
   {
      key: "traffic_penalty" as const,
      label: "Traffic",
      max: 10,
      color: BREAKDOWN_COLORS.traffic,
      tooltip: (
         <>
            Extra noise from <span className="text-zinc-200">cars on nearby roads</span> (heavy, slow traffic often means more honking).
            <div className="mt-2 text-zinc-400">
               A <span className="text-zinc-300">higher</span> number means traffic is lighter or moving better—less honking risk.
            </div>
         </>
      ),
   },
];

/** Help text for Overview sidebar cards (paired with OVERVIEW_TOOLTIP_PANEL). */
const OT = {
   quiet: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">Quiet score</p>
         <p>Your overall score (0–100) and total noise relative to the calibrated noise ceiling. The bars show how space, time, live signal, and traffic each add to that noise.</p>
      </>
   ),
   confidence: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">Confidence</p>
         <p>How strong the evidence was when we computed this score. Each row is one data source (profiles, reviews, live feeds, user ratings, etc.) and how much it added to confidence.</p>
      </>
   ),
   google: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">Google Places</p>
         <p>Review count, noise hints from text, and popular-times coverage from Google.</p>
      </>
   ),
   realtime: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">Realtime</p>
         <p>Per-source age of each live signal. Each source has its own TTL — signals older than their limit are automatically excluded from scoring.</p>
      </>
   ),
   mta: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">MTA</p>
         <p>Nearby subway and rail disruption that can add crowding or platform noise.</p>
      </>
   ),
   tomtom: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">TomTom</p>
         <p>Road traffic vs speed when there’s no traffic, nearby incidents, and how that feeds the traffic part of the score.</p>
      </>
   ),
   dep: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">DEP noise</p>
         <p>City environmental noise level near this location when a reading is available.</p>
      </>
   ),
   nyc311: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">NYC 311 and events</p>
         <p>Noise complaints, events, and construction-style flags from NYC data near this area.</p>
      </>
   ),
   static: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">Venue static</p>
         <p>Core facts in our database: size, policies, seating, and review metadata used for scoring.</p>
      </>
   ),
   services: (
      <>
         <p className="font-medium text-zinc-200 mb-1.5">Data feeds</p>
         <p>
            Whether each integration returned usable data for this venue at the time shown above. Green means the feed is up and we got a value; yellow means partial or stale; red means missing something important. This is pipeline health, not whether the subway has delays.
         </p>
      </>
   ),
};

type FeedStatus = "ok" | "warn" | "bad" | "unknown";

interface FeedRow {
   key: string;
   label: string;
   status: FeedStatus;
   detail: string;
}

const FEED_DOT: Record<FeedStatus, string> = {
   ok: "bg-emerald-500",
   warn: "bg-yellow-400",
   bad: "bg-red-500",
   unknown: "bg-zinc-600",
};


/** Per-signal TTLs (minutes) — must match backend SIGNAL_TTLS. */
const SIGNAL_TTLS: Record<string, number> = {
   weather:          120,
   events:           120,
   noise_complaints: 120,
   construction:     240,
   tomtom:           120,
   mta:              60,
   dep_noise:        20160,
};

function fmtAge(minutes: number): string {
   if (minutes < 60) return `${Math.round(minutes)}m`;
   if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
   return `${Math.round(minutes / 1440)}d`;
}

function sigStatus(entry: Record<string, unknown> | undefined, sig: string): FeedStatus {
   if (!entry) return "unknown";
   if (!entry.active) return "bad";
   const age = entry.age_minutes as number | undefined;
   const ttl = SIGNAL_TTLS[sig] ?? 120;
   if (age == null) return "unknown";
   if (age <= ttl * 0.5) return "ok";
   if (age <= ttl)       return "warn";
   return "bad";
}

/** Per-integration status built from the new live_signals structure. */
function buildServiceFeedStatus(debug: Record<string, unknown> | null, venue: Venue): FeedRow[] {
   if (!debug) return [];

   const gp = debug.google_places as Record<string, unknown> | undefined;
   const ls = debug.live_signals  as Record<string, Record<string, unknown>> | undefined;
   const cs = debug.computed_score as Record<string, unknown> | undefined;
   const placeId = venue.google_place_id || gp?.place_id;

   const rows: FeedRow[] = [];

   // MTA
   const mtaSig = ls?.mta;
   if (!mtaSig) {
      rows.push({ key: "mta", label: "MTA", status: "unknown", detail: "No signal yet" });
   } else if (!mtaSig.active) {
      rows.push({ key: "mta", label: "MTA", status: "bad", detail: `Stale (${fmtAge(mtaSig.age_minutes as number)} old)` });
   } else {
      const lbl = (mtaSig.severity_label as string) ?? `sev ${((mtaSig.value as Record<string,unknown>)?.severity ?? 0)}`;
      rows.push({ key: "mta", label: "MTA", status: sigStatus(mtaSig, "mta"), detail: lbl });
   }

   // Weather
   const wSig = ls?.weather;
   if (!wSig) {
      rows.push({ key: "weather", label: "Weather", status: "unknown", detail: "No signal yet" });
   } else {
      const mod = (wSig.value as Record<string,unknown>)?.modifier;
      rows.push({ key: "weather", label: "Weather", status: sigStatus(wSig, "weather"),
         detail: wSig.active ? `mod ${mod ?? 0} · ${fmtAge(wSig.age_minutes as number)} old` : `Stale (${fmtAge(wSig.age_minutes as number)})` });
   }

   // Events + complaints
   const evSig = ls?.events;
   const cpSig = ls?.noise_complaints;
   if (!evSig && !cpSig) {
      rows.push({ key: "nyc", label: "NYC Open Data", status: "unknown", detail: "No signal yet" });
   } else {
      const evAge = evSig?.age_minutes as number | undefined;
      const status = sigStatus(evSig, "events");
      rows.push({ key: "nyc", label: "NYC Open Data", status,
         detail: evAge != null ? `${fmtAge(evAge)} old` : "Events & complaints" });
   }

   // Google Places
   if (placeId) {
      rows.push({ key: "gp", label: "Google Places", status: "ok", detail: "Place linked" });
   } else {
      rows.push({ key: "gp", label: "Google Places", status: "bad", detail: "No place ID" });
   }

   // Popular times (hourly profile)
   const temporalSrc = cs?.temporal_source as string | undefined;
   const totalSlots = (gp?.popular_times_coverage as Record<string, unknown> | undefined)?.total_slots as number | undefined;
   if (temporalSrc === "profile") {
      rows.push({ key: "besttime", label: "Popular times", status: "ok",
         detail: totalSlots != null ? `${totalSlots} hourly slots` : "Hourly profile" });
   } else if (temporalSrc === "fallback") {
      rows.push({ key: "besttime", label: "Popular times", status: "warn", detail: "Fallback (no profile)" });
   } else {
      rows.push({ key: "besttime", label: "Popular times", status: "unknown", detail: "—" });
   }

   // TomTom
   const ttSig = ls?.tomtom;
   if (!ttSig) {
      rows.push({ key: "tomtom", label: "TomTom", status: "unknown", detail: "—" });
   } else {
      rows.push({ key: "tomtom", label: "TomTom", status: sigStatus(ttSig, "tomtom"),
         detail: ttSig.active ? `${fmtAge(ttSig.age_minutes as number)} old` : `Stale (${fmtAge(ttSig.age_minutes as number)})` });
   }

   // DEP noise
   const depSig = ls?.dep_noise;
   if (!depSig) {
      rows.push({ key: "dep", label: "DEP noise", status: "unknown", detail: "No signal yet" });
   } else {
      const lvl = (depSig.value as Record<string,unknown>)?.level;
      rows.push({ key: "dep", label: "DEP noise", status: sigStatus(depSig, "dep_noise"),
         detail: lvl != null ? `${lvl} idx · ${fmtAge(depSig.age_minutes as number)} old` : `Stale (${fmtAge(depSig.age_minutes as number)})` });
   }

   return rows;
}


const H = HEALTH;

function DbCard({ title, health = "neutral", scoreLabel, tooltip, tooltipPosition = "left", children, full }: {
   title: string; health?: Health;
   scoreLabel?: string;
   tooltip?: React.ReactNode;
   tooltipPosition?: "left" | "right";
   children: React.ReactNode; full?: boolean;
}) {
   const [open, setOpen] = useState(true);
   const sc = scoreLabel ? scoreLabelCardStyles(scoreLabel) : null;
   const h = H[health];
   const border = sc?.border ?? h.border;
   const bg = sc?.bg ?? h.bg;
   const dot = sc?.dot ?? (
      health === "good" ? "bg-emerald-500" : health === "warn" ? "bg-yellow-400" : health === "bad" ? "bg-red-500" : "bg-zinc-600"
   );
   return (
      <div className={`rounded-xl border p-3 ${border} ${bg} ${full ? "col-span-2" : ""} ${!open ? "self-start" : ""}`}>
         <div className={`flex w-full min-w-0 items-center gap-2 ${open ? "mb-2.5" : ""}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full self-start mt-[3px] ${dot}`} aria-hidden />
            {tooltip != null ? (
               <Tooltip
                  className="min-w-0 flex-1 !justify-start"
                  content={<TooltipPanel className="w-56 max-w-[min(18rem,calc(100vw-2rem))] text-[11px]">{tooltip}</TooltipPanel>}
                  position={tooltipPosition}
                  crossAlign="start"
                  offset={10}
               >
                  <span className="text-[12px] font-bold uppercase tracking-widest leading-snug text-zinc-500 break-words cursor-default">
                     {title}
                  </span>
               </Tooltip>
            ) : (
               <span className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-widest leading-snug text-zinc-500 break-words">
                  {title}
               </span>
            )}
            <button
               onClick={() => setOpen(o => !o)}
               className="shrink-0 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors"
               aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            >
               <ChevronDown size={13} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
            </button>
         </div>
         <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 350ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
            <div style={{ overflow: "hidden" }}>
               {children}
            </div>
         </div>
      </div>
   );
}


function Pill({ label, health }: { label: string; health: Health }) {
   return (
      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${H[health].pill}`}>{label}</span>
   );
}

function Row({ k, v }: { k: string; v: unknown }) {
   const hasValue = v !== null && v !== undefined && v !== "" && v !== "no";
   const display = v === null || v === undefined ? "—" : String(v);
   return (
      <div className="flex justify-between items-center gap-1.5 text-[11px] leading-snug">
         <span className={`uppercase tracking-wide shrink-0 ${hasValue ? "text-zinc-400" : "text-zinc-600"}`}>{k}</span>
         <span className={`font-medium text-right truncate max-w-[60%] ${hasValue ? "text-zinc-200" : "text-zinc-600"}`} title={display}>{display}</span>
      </div>
   );
}

function ScoreRing({ score, color, enabled = true }: { score: number; color: string; enabled?: boolean }) {
   const animated = useCountUp(score, undefined, enabled);
   const r = 44;
   const circ = 2 * Math.PI * r;
   // Ref-driven arc: bypasses React re-renders so the CSS transition is never interrupted
   const arcRef = useRef<SVGCircleElement>(null);
   useEffect(() => {
      if (!enabled || !arcRef.current) return;
      const el = arcRef.current;
      // Reset to empty without transition, then on next frame kick off the smooth fill
      el.style.transition = "none";
      el.style.strokeDashoffset = String(circ);
      let id2: number;
      const id = requestAnimationFrame(() => {
         id2 = requestAnimationFrame(() => {
            el.style.transition = `stroke-dashoffset ${scaleDuration(score)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            el.style.strokeDashoffset = String(circ * (1 - score / 100));
         });
      });
      return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
   }, [score, enabled, circ]);
   return (
      <svg width={104} height={104} className="rotate-[-90deg]">
         <circle cx={52} cy={52} r={r} fill="none" stroke="#27272a" strokeWidth={10} />
         <circle ref={arcRef} cx={52} cy={52} r={r} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={circ} strokeDashoffset={circ} strokeLinecap="round" />
         <text x={52} y={55} textAnchor="middle" dominantBaseline="middle"
            transform="rotate(90, 52, 52)"
            style={{ fill: "#f4f4f5", fontSize: 26, fontWeight: 800 }}>{animated}</text>
      </svg>
   );
}

// Per-label icon color, with value-aware dimming for "none"/absent states
function detailIconColor(label: string, value: string): string {
   const isNone = value === "None" || value === "No" || value === "—";
   if (isNone) return "text-zinc-600";
   switch (label) {
      case "Music":           return "text-zinc-400";
      case "Price":           return "text-emerald-400";
      case "Food":            return "text-orange-400";
      case "Seating":         return "text-zinc-300";
      case "Alcohol":         return "text-purple-400";
      case "Outdoor seating": return "text-emerald-400";
      case "Health grade":    return "text-blue-400";
      case "Liquor license":  return "text-purple-400";
      case "Cabaret":         return "text-pink-400";
      case "Phone":           return "text-zinc-400";
      case "Website":         return "text-blue-400";
      default:                return "text-zinc-500";
   }
}

const SUBWAY_LINE_COLORS: Record<string, { bg: string; text: string }> = {
   "1": { bg: "#EE352E", text: "#fff" }, "2": { bg: "#EE352E", text: "#fff" }, "3": { bg: "#EE352E", text: "#fff" },
   "4": { bg: "#00933C", text: "#fff" }, "5": { bg: "#00933C", text: "#fff" }, "6": { bg: "#00933C", text: "#fff" },
   "7": { bg: "#B933AD", text: "#fff" },
   "A": { bg: "#0039A6", text: "#fff" }, "C": { bg: "#0039A6", text: "#fff" }, "E": { bg: "#0039A6", text: "#fff" },
   "B": { bg: "#FF6319", text: "#fff" }, "D": { bg: "#FF6319", text: "#fff" }, "F": { bg: "#FF6319", text: "#fff" }, "M": { bg: "#FF6319", text: "#fff" },
   "G": { bg: "#6CBE45", text: "#fff" },
   "J": { bg: "#996633", text: "#fff" }, "Z": { bg: "#996633", text: "#fff" },
   "L": { bg: "#A7A9AC", text: "#000" },
   "N": { bg: "#FCCC0A", text: "#000" }, "Q": { bg: "#FCCC0A", text: "#000" }, "R": { bg: "#FCCC0A", text: "#000" }, "W": { bg: "#FCCC0A", text: "#000" },
   "S": { bg: "#808183", text: "#fff" },
};

const DETAIL_ICONS: Record<string, React.ReactNode> = {
   "Music":           <Music2 size={15} />,
   "Seating":         <Armchair size={15} />,
   "Price":           <DollarSign size={15} />,
   "Food":            <Utensils size={15} />,
   "Alcohol":         <Wine size={15} />,
   "Outdoor seating": <Sun size={15} />,
   "Health grade":    <Award size={15} />,
   "Liquor license":  <GlassWater size={15} />,
   "Cabaret":         <Mic2 size={15} />,
   "Noise level":     <Volume2 size={15} />,
   "Subway":          <Train size={15} />,
   "Size":            <Maximize2 size={15} />,
   "Hours":           <Clock size={15} />,
   "Phone":           <Phone size={15} />,
   "Website":         <Globe size={15} />,
};


// Values rendered as colored pills

function DetailValue({ label, value }: { label: string; value: string }) {
   // Yes / No → icon
   if (value === "Yes") return <span className="text-emerald-400 font-semibold text-sm">✓</span>;
   if (value === "No")  return <span className="text-red-500 font-semibold text-sm">✕</span>;
   // Pill values
   const pillClass = PILL_VALUES[value];
   if (pillClass) {
      return <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${pillClass}`}>{value}</span>;
   }
   return <span className="text-zinc-400 text-right">{value}</span>;
}

interface Props { data: VenueWithScore }

const SCORE_REFRESH_MS  = 2 * 60 * 1000; // 2 min — live signals update this often
const HOURLY_REFRESH_MS = 5 * 60 * 1000; // 5 min — busyness slots are hour-resolution

export default function VenueDetail({ data }: Props) {
   const { venue } = data;
   // Live score — starts from server-rendered value, refreshes in background
   const [liveScore, setLiveScore] = useState(data.score);
   const score = liveScore;
   const isClosed = score.closed === true || score.quiet_score == null;
   const colors = noiseColors(isClosed ? "Closed" : score.label);

   const [debug, setDebug] = useState<Record<string, unknown> | null>(null);
   const [hourly, setHourly] = useState<{ day_of_week: number; current_hour: number; slots: { hour: number; busyness: number }[] } | null>(null);
   const [selectedDay, setSelectedDay] = useState<number | null>(null);
   const [todayDay, setTodayDay] = useState<number | null>(null);
   const [copiedLink, setCopiedLink] = useState(false);
   const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
   const [refreshing, setRefreshing] = useState(false);
   // Entry animation gate — inner animations fire after the panel reveal completes
   const [ready, setReady] = useState(false);
   useEffect(() => {
      const t = setTimeout(() => setReady(true), 420);
      return () => clearTimeout(t);
   }, []);

   useEffect(() => {
      getVenueHourly(venue.id).then(d => {
         setHourly(d);
         setTodayDay(d.day_of_week);
         setSelectedDay(d.day_of_week);
      }).catch(() => null);
      getVenueDebug(venue.id).then(d => { setDebug(d); setLastUpdated(new Date()); }).catch(() => null);
   }, [venue.id]);

   // Refresh score + debug every 2 min
   useEffect(() => {
      const id = setInterval(() => {
         setRefreshing(true);
         Promise.all([
            getVenue(venue.id).catch(() => null),
            getVenueDebug(venue.id).catch(() => null),
         ]).then(([fresh, freshDebug]) => {
            if (fresh) setLiveScore(fresh.score);
            if (freshDebug) setDebug(freshDebug);
            setLastUpdated(new Date());
         }).finally(() => setRefreshing(false));
      }, SCORE_REFRESH_MS);
      return () => clearInterval(id);
   }, [venue.id]);

   // Refresh hourly every 5 min, but only when viewing today
   useEffect(() => {
      const id = setInterval(() => {
         if (selectedDay === todayDay) {
            getVenueHourly(venue.id).then(setHourly).catch(() => null);
         }
      }, HOURLY_REFRESH_MS);
      return () => clearInterval(id);
   }, [venue.id, selectedDay, todayDay]);

   function handleDaySelect(day: number) {
      if (day === selectedDay) return;
      setSelectedDay(day);
      getVenueHourly(venue.id, day).then(setHourly).catch(() => null);
   }

   function handleCopyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
         setCopiedLink(true);
         setTimeout(() => setCopiedLink(false), 2000);
      }).catch(() => null);
   }

   const [openBreakdown,  toggleBreakdown]  = useCollapse("score_breakdown");
   const [openVenue,      toggleVenue]      = useCollapse("venue_details");
   const [openBusyness,   toggleBusyness]   = useCollapse("busyness_today");
   const [openNoise,      toggleNoise]      = useCollapse("noise_signal");
   const [openTraffic,    toggleTraffic]    = useCollapse("traffic_congestion");

   const updatedAt = debug
      ? (() => { try { return formatDistanceToNow(new Date(debug.evaluated_at as string), { addSuffix: true }); } catch { return null; } })()
      : null;

   const bd = score.breakdown;
   const noiseRaw = bd.venue_traits + bd.time_pattern + bd.live_adjustment + bd.traffic_penalty;

   // typed overview payload sub-objects
   const gp  = debug?.google_places  as Record<string, unknown> | undefined;
   const ls  = debug?.live_signals   as Record<string, Record<string, unknown>> | undefined;
   const vs  = debug?.venue_static   as Record<string, unknown> | undefined;
   const cs  = debug?.computed_score as Record<string, unknown> | undefined;

   // Per-signal value helpers
   function sigVal(sig: string): Record<string, unknown> | undefined {
      const entry = ls?.[sig];
      return entry?.active ? (entry.value as Record<string, unknown>) : undefined;
   }

   const mtaSev    = sigVal("mta")?.severity          as number | null | undefined;
   const congestion = sigVal("tomtom")?.congestion     as number | null | undefined;
   const depLevel  = sigVal("dep_noise")?.level        as number | null | undefined;
   const depComplaintCount = sigVal("dep_noise")?.complaint_count as number | null | undefined;
   const depSevereCount    = sigVal("dep_noise")?.severe_count    as number | null | undefined;
   const eventCount    = (sigVal("events")?.count           as number) ?? 0;
   const complaintCount = (sigVal("noise_complaints")?.count as number) ?? 0;
   const construction  = sigVal("construction")?.nearby       as boolean | undefined;

   const quietScoreCard = scoreLabelCardStyles(isClosed ? "Closed" : score.label);
   const animatedConfidence = useCountUp(Math.round(score.confidence * 100), undefined, ready);
   // Overview card main numbers
   const animatedQuietScore  = useCountUp(score.quiet_score ?? 0, undefined, ready);
   const animatedNoiseRaw    = useCountUp(Math.round(noiseRaw * 10), undefined, ready);
   const animatedTomTom      = useCountUp(congestion != null ? Math.round(congestion * 100) : 0, undefined, ready);
   const animatedTcPct       = useCountUp(score.traffic_congestion != null ? Math.round(score.traffic_congestion * 100) : 0, undefined, ready);
   const animatedDep         = useCountUp(depLevel ?? 0, undefined, ready);
   // Score breakdown count-up values (4 fixed entries matching BREAKDOWN_CONFIG order)
   const animBdSpace   = useCountUp(Math.round(40 - score.breakdown.venue_traits), undefined, ready);
   const animBdTime    = useCountUp(Math.round(50 - score.breakdown.time_pattern), undefined, ready);
   const animBdLive    = useCountUp(Math.round(-score.breakdown.live_adjustment), undefined, ready);
   const animBdTraffic = useCountUp(Math.round(10 - score.breakdown.traffic_penalty), undefined, ready);
   const animBdMap: Record<string, number> = {
      venue_traits: animBdSpace,
      time_pattern: animBdTime,
      live_adjustment: animBdLive,
      traffic_penalty: animBdTraffic,
   };
   const animatedEvents      = useCountUp(eventCount, undefined, ready);
   const animatedComplaints  = useCountUp(complaintCount, undefined, ready);
   const reviewSignalNum     = gp?.review_signal != null ? parseFloat(String(gp.review_signal)) : null;
   const animatedReviewSignal = useCountUp(reviewSignalNum != null ? Math.round(reviewSignalNum * 10) : 0, undefined, ready);

   const feedRows = useMemo(() => buildServiceFeedStatus(debug, venue), [debug, venue]);

   // health derivations (data-source cards; quiet score uses score.label via quietScoreCard / DbCard scoreLabel)
   const gpHealth: Health     = gp?.place_id ? (gp?.review_count ? "good" : "warn") : "bad";
   const CORE_SIGNALS = ["mta", "weather", "events", "tomtom"] as const;
   const activeCount = ls ? CORE_SIGNALS.filter(s => ls[s]?.active).length : 0;
   const rtHealth: Health = ls == null ? "neutral" : activeCount >= 4 ? "good" : activeCount >= 2 ? "warn" : "bad";
   const mtaHealth: Health    = mtaSev == null ? "neutral" : mtaSev < 0.5 ? "good" : mtaSev < 2.5 ? "warn" : "bad";
   const ttHealth: Health     = congestion == null ? "neutral" : congestion >= 0.8 ? "good" : congestion >= 0.5 ? "warn" : "bad";
   const depHealth: Health    = depLevel == null ? "neutral" : depLevel < 60 ? "good" : depLevel < 80 ? "warn" : "bad";
   const odHealth: Health     = (eventCount > 10 || complaintCount > 3 || construction) ? "bad" : (eventCount > 0 || complaintCount > 0) ? "warn" : "good";


   return (
      <div
         style={{
            animation: "venueReveal 0.4s cubic-bezier(0.22,1,0.36,1) both",
         }}

         className="max-w-5xl mx-auto px-5 py-8 text-zinc-100 venue-reveal"
      >

         {/* ── top bar: back link + logo + actions ── */}
         <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-50 transition-colors py-1">
               <ArrowLeft size={15} />Back
            </Link>
            <Link href="/" className="absolute left-1/2 -translate-x-1/2">
               <img src="/icon.png" alt="ShhhNYC" width={60} height={60} className="shrink-0" />
            </Link>
            <div className="flex items-center gap-3">
               <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
               >
                  <RefreshCw size={14} /><span>Refresh</span>
               </button>
               <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
               >
                  {copiedLink
                     ? <span className="text-emerald-400 font-medium">Copied!</span>
                     : <><Share2 size={14} /><span>Share</span></>}
               </button>
            </div>
         </div>

         {/* ── photos (full width) ── */}
         {venue.photos && venue.photos.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1" style={{ overflowY: "hidden" }}>
               {venue.photos.map((_, i) => (
                  <img
                     key={i}
                     src={`${API_BASE}/venues/${venue.id}/photo/${i}`}
                     alt={`${venue.name} photo ${i + 1}`}
                     className="h-40 w-auto rounded-xl object-cover shrink-0 flex-1 min-w-0"
                     style={{ maxWidth: "60vw", opacity: 0, transform: "scale(0.08)", transition: "none", overflow: "hidden", contain: "paint" }}
                     onLoad={(e) => {
                        const el = e.currentTarget;
                        el.style.transition = "none";
                        el.style.opacity = "0";
                        el.style.transform = "scale(0.08)";
                        setTimeout(() => {
                           el.style.transition = "opacity 0.4s cubic-bezier(0.34,1.56,0.64,1), transform 0.4s cubic-bezier(0.34,1.56,0.64,1)";
                           el.style.opacity = "1";
                           el.style.transform = "scale(1)";
                        }, i * 80);
                     }}
                  />
               ))}
            </div>
         )}

         <div className="mt-8 flex gap-8 items-start">
            {/* ── main content ── */}
            <div className="flex-1 min-w-0">

               <div className="flex items-start gap-5 -mt-1">
                  <div className="flex-1 min-w-0">
                     <h1 className="text-2xl font-bold text-zinc-50 leading-tight">
                        <a
                           href={googleMapsVenueUrl(venue)}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="group inline-flex items-center gap-2 flex-wrap cursor-pointer text-zinc-50 visited:text-zinc-50 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-500 rounded-sm"
                           aria-label={`Open ${venue.name} in Google Maps`}
                        >
                           <span className="">{venue.name}</span>
                           <ExternalLink
                              className="block shrink-0 self-center text-zinc-500 transition-colors group-hover:text-zinc-300"
                              size={20}
                              strokeWidth={2}
                              aria-hidden
                           />
                        </a>
                     </h1>
                     <p className="text-sm text-zinc-400 mt-1">{venue.address}</p>
                     <p className="text-xs text-zinc-500">{venue.neighborhood} · {venue.borough}</p>
                     <div className="mt-6 flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-3.5 py-1 rounded-full ${colors.badge}`}>{isClosed ? "Closed" : score.label}</span>
                        {(() => {
                           const st = openNowStatus(venue.opening_hours);
                           if (!st) return null;
                           const cls = st.open
                              ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/40"
                              : "bg-zinc-800/70 text-zinc-400 border-zinc-700/40";
                           return (
                              <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${cls}`}>
                                 <Clock size={11} />
                                 {st.open ? "Open · " : ""}{st.label}
                              </span>
                           );
                        })()}
                        <span className="text-xs font-medium px-3.5 py-1 rounded-full bg-zinc-800/70 text-zinc-400 border border-zinc-700/40"><OdometerNumber value={animatedConfidence} />% Confidence</span>
                        {lastUpdated && (
                           <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                              {refreshing
                                 ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                 : <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                              {refreshing ? "updating…" : `updated at ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                           </span>
                        )}
                     </div>
                  </div>
                  <div className="mt-1"><ScoreRing score={score.quiet_score ?? 0} color={colors.solid} enabled={ready && !isClosed} /></div>
               </div>

               <div className="mt-4 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${ready && !isClosed ? "bar-grow" : ""} ${colors.bar}`} style={{ width: ready && !isClosed ? `${score.quiet_score ?? 0}%` : "0%", ["--bar-dur" as string]: `${scaleDuration(score.quiet_score ?? 0)}ms` }} />
               </div>
               <div className="flex justify-between mt-1.5 text-[11px] text-zinc-600">
                  <span>Noisiest</span>
                  <span>Quietest</span>
               </div>

               {Math.abs(bd.live_adjustment) > 3 && (
                  <div className={`mt-4 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm border ${
                     bd.live_adjustment < 0
                        ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-300"
                        : "bg-orange-950/50 border-orange-800/40 text-orange-300"
                  }`}>
                     {bd.live_adjustment < 0
                        ? <VolumeX size={15} className="shrink-0" />
                        : <Volume2 size={15} className="shrink-0" />}
                     <span className="font-medium">
                        {bd.live_adjustment < 0 ? "Quieter than usual right now" : "Louder than usual right now"}
                     </span>
                     <span className="text-[11px] opacity-50 ml-auto tabular-nums">
                        {bd.live_adjustment > 0 ? "+" : ""}{bd.live_adjustment.toFixed(1)} live
                     </span>
                  </div>
               )}

               <div className="mt-8">
                  <SectionHeader label="Score breakdown" open={openBreakdown} onToggle={toggleBreakdown} />
                  <div style={{ display: "grid", gridTemplateRows: openBreakdown ? "1fr" : "0fr", transition: "grid-template-rows 350ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                  <div style={{ overflow: "hidden" }}>
                     <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {BREAKDOWN_CONFIG.map(({ key, label, max, color, isModifier, tooltip }) => {
                           const raw = score.breakdown[key];
                           const val = isModifier ? -raw : max - raw;
                           const pct = isModifier ? ((max - raw) / (max * 2)) * 100 : ((max - raw) / max) * 100;
                           const sign = isModifier && val > 0 ? "+" : "";
                           const animVal = animBdMap[key];
                           return (
                              <div key={key} className="bg-zinc-900 rounded-xl p-4 text-center border border-zinc-800/60">
                                 <div className="text-xl font-extrabold text-zinc-50">
                                    <OdometerNumber value={`${sign}${animVal}`} /><span className="text-xs text-zinc-600 font-normal">/{max}</span>
                                 </div>
                                 <Tooltip
                                    content={
                                       <TooltipPanel className="w-48 text-[11px] z-30">
                                          {tooltip}
                                       </TooltipPanel>
                                    }
                                 >
                                    <div className="text-xs text-zinc-500 mt-1 flex justify-center items-center gap-1 cursor-default">
                                       {label}
                                       <Info size={11} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                    </div>
                                 </Tooltip>
                                 <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                    <div className={`h-full rounded-full ${ready ? "bar-grow" : ""} ${color}`} style={{ width: ready ? `${pct}%` : "0%", ["--bar-dur" as string]: `${scaleDuration(pct)}ms` }} />
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
                  </div>
               </div>

               <div className="mt-8">
                  <SectionHeader label="Venue details" open={openVenue} onToggle={toggleVenue} />
                  <div style={{ display: "grid", gridTemplateRows: openVenue ? "1fr" : "0fr", transition: "grid-template-rows 350ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                  <div style={{ overflow: "hidden" }}>
                     <div className="bg-zinc-900 rounded-xl px-4 py-1 border border-zinc-800/60">
                        <dl className="flex flex-col text-sm">
                           {([
                              [["Phone",           venue.phone_number ?? null], ["Website", venue.website_url ? "Visit site" : null]],
                              [["Price",           venue.price_tier ? "$".repeat(venue.price_tier) : null], ["Music", humanize(venue.music_policy)]],
                              [["Food",            venue.serves_food    == null ? null : venue.serves_food    ? "Yes" : "No"], ["Alcohol", venue.serves_alcohol == null ? null : venue.serves_alcohol ? "Yes" : "No"]],
                              [["Outdoor seating", venue.has_outdoor_seating == null ? null : venue.has_outdoor_seating ? "Yes" : "No"], ["Health grade", venue.health_grade ?? null]],
                              [["Liquor license",  venue.liquor_license_type ?? null], ["Cabaret", venue.is_cabaret == null ? null : venue.is_cabaret ? "Yes" : "No"]],
                              [["Size",            venue.sq_ft != null ? `${venue.sq_ft.toLocaleString()} sq ft` : null], ["Seating", venue.seating_type?.map(humanize).join(", ") ?? null]],
                              [["Subway",          venue.nearest_subway_m != null ? (venue.nearest_subway_m < 1000 ? `${venue.nearest_subway_m}m` : `${(venue.nearest_subway_m / 1000).toFixed(1)}km`) : null], ["Hours", todayWeekdayText(venue.opening_hours)]],
                           ] as [[string, string | null | undefined], [string, string | null | undefined] | null][])
                              .filter(pair => {
                                 // Hide Phone/Website row if both are null
                                 const [left, right] = pair;
                                 if (left[0] === "Phone" && left[1] == null && (right == null || right[1] == null)) return false;
                                 return true;
                              })
                              .map((pair, rowIdx, rows) => {
                                 const [left, right] = pair;
                                 const isLastRow = rowIdx === rows.length - 1;
                                 const Cell = ({ label, value }: { label: string; value: string | null | undefined }) => (
                                    <div className="flex justify-between items-center w-full">
                                       <dt className="flex items-center gap-2.5 text-zinc-500 shrink-0">
                                          <span className={`inline-flex items-center ${value == null ? "text-zinc-700" : detailIconColor(label, value)}`}>{DETAIL_ICONS[label]}</span>
                                          {label}
                                       </dt>
                                       <dd className="text-right ml-2">
                                          {value == null ? (
                                             <span className="text-s text-zinc-600">?</span>
                                          ) : label === "Website" && venue.website_url ? (
                                             <a href={venue.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors"><ExternalLink size={20} strokeWidth={2} /></a>
                                          ) : label === "Phone" ? (
                                             <a href={`tel:${value}`} className="text-zinc-400 text-[12px] hover:text-zinc-200 transition-colors">{value}</a>
                                          ) : (
                                             <DetailValue label={label} value={value} />
                                          )}
                                       </dd>
                                    </div>
                                 );
                                 return (
                                    <div key={rowIdx}>
                                       <div className={`relative grid ${right ? "grid-cols-2 gap-x-8" : "grid-cols-1"} py-2.5 ${isLastRow ? "" : "border-b border-zinc-800/60"}`}>
                                          {right && <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-700/70 -translate-x-1/2 opacity-20" />}
                                          <Cell label={left[0]} value={left[1]} />
                                          {right && <Cell label={right[0]} value={right[1]} />}
                                       </div>
                                    </div>
                                 );
                              })}
                           {venue.subway_lines_served && venue.subway_lines_served.length > 0 && (
                              <div className="py-2.5 border-t border-zinc-800/60">
                                 <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className="flex items-center gap-2 text-zinc-500 text-sm shrink-0">
                                       <Train size={15} className="text-zinc-500" />
                                       Lines
                                    </span>
                                    <div className="flex gap-1.5 flex-wrap">
                                       {venue.subway_lines_served.map(line => {
                                          const lc = SUBWAY_LINE_COLORS[line.toUpperCase()];
                                          return (
                                             <span
                                                key={line}
                                                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold leading-none"
                                                style={lc ? { backgroundColor: lc.bg, color: lc.text } : { backgroundColor: "#3f3f46", color: "#f4f4f5" }}
                                             >{line}</span>
                                          );
                                       })}
                                    </div>
                                 </div>
                              </div>
                           )}
                        </dl>
                     </div>
                  </div>
                  </div>
               </div>

               <div className="mt-8">
                  <SectionHeader label="Busyness" open={openBusyness} onToggle={toggleBusyness} />
                  <div style={{ display: "grid", gridTemplateRows: openBusyness ? "1fr" : "0fr", transition: "grid-template-rows 350ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                  <div style={{ overflow: "hidden" }}>
                     <div className="bg-zinc-900 rounded-xl border border-zinc-800/60 overflow-hidden">
                        <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-zinc-800/40 flex-wrap">
                           {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label, day) => (
                              <button
                                 key={day}
                                 onClick={() => handleDaySelect(day)}
                                 disabled={!hourly}
                                 className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                    selectedDay === day
                                       ? "bg-zinc-700 text-zinc-100 ring-1 ring-zinc-600"
                                       : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                                 }`}
                              >
                                 {label}
                              </button>
                           ))}
                        </div>
                        <div className="pt-3 pb-1">
                           {hourly && hourly.slots.length > 0 ? (
                              <HourlyChart
                                 key={selectedDay ?? 0}
                                 data={hourly.slots}
                                 currentHour={selectedDay === todayDay ? hourly.current_hour : undefined}
                                 animationBegin={ready ? 0 : 9999}
                                 openHours={openHoursForPyDay(venue.opening_hours, selectedDay ?? todayDay ?? 0)}
                              />
                           ) : (
                              <div className="flex items-end gap-[3px] px-3 pb-4 pt-2 h-[130px]">
                                 {Array.from({ length: 24 }, (_, i) => (
                                    <div key={i} className="flex-1 rounded-sm bg-zinc-800/60 animate-pulse" style={{ height: `${20 + Math.sin(i * 0.6) * 15 + Math.sin(i * 1.7) * 5}%` }} />
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
                  </div>
               </div>

               {(venue.google_noise_estimate || venue.music_policy || venue.is_cabaret || venue.liquor_license_type || eventCount > 0 || complaintCount > 0 || construction || (gp?.review_signal != null && Number(gp.review_signal) > 0) || venue.pedestrian_volume != null) && (
                  <div className="mt-8">
                     <SectionHeader label="Noise indicators" open={openNoise && !!debug} onToggle={toggleNoise} />
                     <div style={{ display: "grid", gridTemplateRows: openNoise ? "1fr" : "0fr", transition: "grid-template-rows 350ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                     <div style={{ overflow: "hidden" }}>
                        <div className="bg-zinc-900 rounded-xl divide-y divide-zinc-800/60 border border-zinc-800/60 overflow-hidden">

                           {/* ── Venue-level static signals ── */}
                           {venue.music_policy && venue.music_policy !== "none" && (() => {
                              const mp = venue.music_policy;
                              const color = mp === "quiet" ? "#10b981" : mp === "moderate" ? "#eab308" : "#ef4444";
                              const label = mp === "quiet" ? "Background music only" : mp === "moderate" ? "Moderate music" : "Loud music";
                              return (
                                 <div className="flex items-center gap-3 px-4 py-3">
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ backgroundColor: `${color}18` }}>
                                       <Music2 size={14} style={{ color }} />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                       <div className="text-sm text-zinc-200">{label}</div>
                                       <div className="text-xs text-zinc-500">Venue music policy</div>
                                    </div>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0" style={{ color, borderColor: `${color}40`, backgroundColor: `${color}12` }}>
                                       Policy
                                    </span>
                                 </div>
                              );
                           })()}

                           {venue.is_cabaret && (
                              <div className="flex items-center gap-3 px-4 py-3">
                                 <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-pink-950/50 shrink-0">
                                    <Mic2 size={14} className="text-pink-400" />
                                 </span>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-200">Licensed cabaret venue</div>
                                    <div className="text-xs text-zinc-500">NYC DCWP · permitted for live entertainment & dancing</div>
                                 </div>
                                 <span className="text-xs text-pink-400 font-medium shrink-0">Loud</span>
                              </div>
                           )}

                           {venue.liquor_license_type && (() => {
                              const lt = venue.liquor_license_type;
                              const isFullBar = lt.toLowerCase().includes("liquor") || lt.toLowerCase().includes("cocktail");
                              const isBeerOnly = lt.toLowerCase().includes("beer") || lt.toLowerCase() === "tavern wine";
                              const color = isFullBar ? "#f97316" : isBeerOnly ? "#10b981" : "#a1a1aa";
                              return (
                                 <div className="flex items-center gap-3 px-4 py-3">
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ backgroundColor: `${color}18` }}>
                                       <GlassWater size={14} style={{ color }} />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                       <div className="text-sm text-zinc-200">{lt}</div>
                                       <div className="text-xs text-zinc-500">NYS SLA liquor license · {isFullBar ? "full bar tends to be louder" : isBeerOnly ? "beer/wine only tends to be quieter" : "on file"}</div>
                                    </div>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0" style={{ color, borderColor: `${color}40`, backgroundColor: `${color}12` }}>
                                       SLA
                                    </span>
                                 </div>
                              );
                           })()}

                           {/* ── Review-derived signals (NLP estimate + signal count + total reviews grouped) ── */}
                           {(venue.google_noise_estimate || (gp?.review_signal != null && Number(gp.review_signal) > 0)) && (() => {
                              const est = venue.google_noise_estimate;
                              const sigCount = gp?.review_signal != null ? Number(gp.review_signal) : 0;
                              const totalReviews = venue.google_review_count;
                              const color = est === "quiet" ? "#10b981" : est === "loud" ? "#ef4444" : "#eab308";
                              const nlpLabel = est === "quiet" ? "Generally quiet" : est === "loud" ? "Tends to be loud" : "Moderate noise";
                              const nlpSub = est === "quiet" ? "Reviewers frequently describe this as a quiet spot" : est === "loud" ? "Reviewers often mention it being noisy" : "Reviewers report mixed noise levels";
                              return (
                                 <div className="px-4 py-3 space-y-2">
                                    {/* NLP headline */}
                                    {est && (
                                       <div className="flex items-center gap-3">
                                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ backgroundColor: `${color}18` }}>
                                             <Volume2 size={14} style={{ color }} />
                                          </span>
                                          <div className="flex-1 min-w-0">
                                             <div className="text-sm text-zinc-200">{nlpLabel}</div>
                                             <div className="text-xs text-zinc-500">{nlpSub}</div>
                                          </div>
                                          <span className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0" style={{ color, borderColor: `${color}40`, backgroundColor: `${color}12` }}>
                                             Reviews
                                          </span>
                                       </div>
                                    )}
                                    {/* Sub-details: signal count + total */}
                                    {(sigCount > 0 || totalReviews != null) && (
                                       <div className="ml-10 pl-3 border-l border-zinc-800 space-y-1.5">
                                          {sigCount > 0 && (
                                             <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs text-zinc-500">
                                                   {sigCount} review{sigCount !== 1 ? "s" : ""} explicitly mention quiet
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2  rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 shrink-0">
                                                   Quiet Signal
                                                </span>
                                             </div>
                                          )}
                                          {totalReviews != null && (
                                             <p className="text-[11px] text-zinc-500">
                                                from {totalReviews.toLocaleString()} total Google reviews
                                             </p>
                                          )}
                                       </div>
                                    )}
                                 </div>
                              );
                           })()}

                           {/* ── Live / environmental signals ── */}
                           {construction && (
                              <div className="flex items-center gap-3 px-4 py-3">
                                 <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-orange-950/50 shrink-0">
                                    <HardHat size={14} className="text-orange-400" />
                                 </span>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-200">Construction nearby</div>
                                    <div className="text-xs text-zinc-500">Active DOB permits within 150m</div>
                                 </div>
                                 <span className="text-xs text-orange-400 font-medium shrink-0">Active</span>
                              </div>
                           )}

                           {complaintCount > 0 && (
                              <div className="flex items-center gap-3 px-4 py-3">
                                 <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-red-950/50 shrink-0">
                                    <Volume2 size={14} className="text-red-400" />
                                 </span>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-200">Noise complaints this week</div>
                                    <div className="text-xs text-zinc-500">NYC 311 · within 300m</div>
                                 </div>
                                 <span className="text-xs text-red-400 font-medium tabular-nums shrink-0">{complaintCount}</span>
                              </div>
                           )}

                           {eventCount > 0 && (
                              <div className="flex items-center gap-3 px-4 py-3">
                                 <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-950/50 shrink-0">
                                    <CalendarDays size={14} className="text-blue-400" />
                                 </span>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-200">Permitted events nearby</div>
                                    <div className="text-xs text-zinc-500">NYC Open Data · street events today</div>
                                 </div>
                                 <span className="text-xs text-blue-400 font-medium tabular-nums shrink-0">{eventCount}</span>
                              </div>
                           )}

                           {venue.pedestrian_volume != null && (
                              <div className="flex items-center gap-3 px-4 py-3">
                                 <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-zinc-800 shrink-0">
                                    <span className="text-zinc-400 text-[13px]">🚶</span>
                                 </span>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-200">Pedestrian volume</div>
                                    <div className="text-xs text-zinc-500">NYC DOT peak hourly foot traffic near this block</div>
                                 </div>
                                 <span className="text-xs text-zinc-400 font-medium tabular-nums shrink-0">{venue.pedestrian_volume.toLocaleString()}</span>
                              </div>
                           )}

                        </div>
                     </div>
                     </div>
                  </div>
               )}

               {score.traffic_congestion !== null && (() => {
                  const tc = score.traffic_congestion!;
                  const tcColor = tc >= 0.8 ? "#10b981" : tc >= 0.5 ? "#eab308" : tc >= 0.3 ? "#f97316" : "#ef4444";
                  const tcLabel = tc >= 0.8 ? "No traffic" : tc >= 0.5 ? "Moderate traffic" : tc >= 0.3 ? "Heavy traffic" : "Severe congestion";
                  return (
                     <div className="mt-8">
                        <SectionHeader label="Traffic congestion" open={openTraffic && !!debug} onToggle={toggleTraffic} />
                        <div style={{ display: "grid", gridTemplateRows: openTraffic ? "1fr" : "0fr", transition: "grid-template-rows 350ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
                        <div style={{ overflow: "hidden" }}>
                           <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800/60">
                              <div className="flex items-center gap-3 mb-4">
                                 <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: `${tcColor}18` }}>
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tcColor }} />
                                 </span>
                                 <div>
                                    <div className="text-sm font-semibold text-zinc-100 leading-tight">{tcLabel}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">moving at <OdometerNumber value={animatedTcPct} />% of free-flow speed</div>
                                 </div>
                                 <span className="ml-auto text-2xl font-black tabular-nums" style={{ color: tcColor }}><OdometerNumber value={animatedTcPct} />%</span>
                              </div>
                              <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden">
                                 <div className={`h-full rounded-full transition-all duration-500 ${ready ? "bar-grow" : ""}`} style={{ backgroundColor: tcColor, width: ready ? `${Math.round(tc * 100)}%` : "0%", ["--bar-dur" as string]: `${scaleDuration(Math.round(tc * 100))}ms` }} />
                              </div>
                              <div className="flex justify-between mt-1.5 text-[10px] text-zinc-600">
                                 <span>Standstill</span>
                                 <span>Free flow</span>
                              </div>
                           </div>
                        </div>
                        </div>
                     </div>
                  );
               })()}

            </div>

            {/* ── Overview: score breakdown + data sources ── */}
            <div className="hidden md:block w-80 shrink-0 sticky top-8 space-y-2">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Overview</h2>

                  {/* Score */}
                  <DbCard title="Quiet Score" health="neutral" scoreLabel={score.label} tooltip={OT.quiet} full>
                     <div className="flex items-center gap-3 mb-4">
                        <span className={`text-4xl font-black leading-none ${quietScoreCard.num}`}><OdometerNumber value={animatedQuietScore} /></span>
                        <div className="space-y-1">
                           <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border border-emerald-800/40 ${quietScoreCard.pill}`}>{score.label}</span>
                        </div>
                        <div className="ml-auto text-right">
                           <p className={`text-xl font-black ${quietScoreCard.num}`}><OdometerNumber value={(animatedNoiseRaw / 10).toFixed(1)} /></p>
                           <p className="text-[11px] text-zinc-500 uppercase tracking-wide">noise / {score.model ? Math.round(score.model.max_noise) : 60}</p>
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
                              <span className="text-[11px] text-zinc-500 uppercase tracking-wide w-14 shrink-0">{label}</span>
                              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                 <div className={`h-full rounded-full bar-grow ${color}`} style={{ width: `${Math.max(0, Math.min(100, (Math.abs(value) / max) * 100))}%`, ["--bar-dur" as string]: `${scaleDuration(Math.max(0, Math.min(100, (Math.abs(value) / max) * 100)))}ms` }} />
                              </div>
                              <span className="text-[11px] text-zinc-300 w-14 text-right shrink-0">
                                 {mod && value > 0 ? "+" : ""}{value.toFixed(1)}<span className="text-zinc-700">/{mod ? `±${max}` : max}</span>
                              </span>
                           </div>
                        ))}
                     </div>
                     {score.model && (
                        <p className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-600 uppercase tracking-wider">
                           {score.model.calibrated ? "Calibrated" : "Defaults"}
                           {score.model.version && ` · ${score.model.version.slice(0, 10)}`}
                           {score.model.n_train != null && ` · n=${score.model.n_train}`}
                        </p>
                     )}
                  </DbCard>

                  {/* Confidence breakdown */}
                  {(() => {
                     const cb = cs?.confidence_breakdown as Record<string, number> | undefined;
                     if (!cb) return null;
                     const rows: [string, number, number][] = [
                        ["profile",      cb.profile_coverage,        0.30],
                        ["hour hit",     cb.profile_current_hour,    0.05],
                        ["google nlp",   cb.google_nlp,              0.07],
                        ["mta",          cb.sig_mta,                 0.04],
                        ["weather",      cb.sig_weather,             0.03],
                        ["events",       cb.sig_events,              0.03],
                        ["complaints",   cb.sig_noise_complaints,    0.03],
                        ["construction", cb.sig_construction,        0.01],
                        ["tomtom",       cb.sig_tomtom,              0.07],
                        ["dep noise",    cb.sig_dep_noise,           0.10],
                     ];
                     const total = cb.total as number;
                     const totalMax = rows.reduce((s, [,, m]) => s + m, 0);
                     const confHealth: Health = total >= 0.8 ? "good" : total >= 0.5 ? "warn" : "bad";
                     return (
                        <DbCard title="Confidence" health={confHealth} tooltip={OT.confidence} full>
                           <div className="flex items-baseline gap-0.5 mb-4">
                              <span className={`text-4xl font-black leading-none ${H[confHealth].num}`}><OdometerNumber value={animatedConfidence} />%</span>
                           </div>
                           <div className="space-y-1.5">
                              {rows.map(([label, val]) => {
                                 // Bar = signal's share of achievable total, scaled so all bars
                                 // together fill 100% when every signal is at its max.
                                 // This way profile (~41%) looks prominent and small signals
                                 // like construction (~1.4%) look appropriately small.
                                 const pct = Math.min(100, (val / totalMax) * 100);
                                 const active = val > 0;
                                 return (
                                    <div key={label} className="flex items-center gap-2">
                                       <span className={`text-[11px] uppercase tracking-wide w-28 shrink-0 ${active ? "text-zinc-400" : "text-zinc-600"}`}>{label}</span>
                                       <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${active ? "bg-zinc-800" : "bg-zinc-800"}`}>
                                          <div className={`h-full rounded-full bar-grow ${active ? BREAKDOWN_COLORS.confidence : "bg-zinc-600"}`} style={{ width: `${pct}%`, ["--bar-dur" as string]: `${scaleDuration(pct)}ms` }} />
                                       </div>
                                       <span className={`text-[11px] w-10 text-right shrink-0 font-medium ${active ? "text-zinc-300" : "text-zinc-600"}`}>
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
                     <DbCard title="Google" health={gpHealth} tooltip={OT.google}>
                        <div className="h-12 flex flex-col justify-start">
                           <span className={`text-3xl font-black leading-none ${H[gpHealth].num}`}>
                              {reviewSignalNum != null ? <OdometerNumber value={(animatedReviewSignal / 10).toFixed(1)} /> : "—"}
                           </span>
                           <p className="text-[11px] text-zinc-500 uppercase tracking-wide mt-0.5">QUIET SIGNALS</p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1">
                           <Row k="total reviews" v={gp?.review_count} />
                           <Row k="nlp" v={gp?.noise_estimate_nlp} />
                           <Row k="pt slots" v={(gp?.popular_times_coverage as Record<string,unknown>)?.total_slots} />
                        </div>
                     </DbCard>

                     {/* TomTom */}
                     <DbCard title="TomTom" health={ttHealth} tooltip={OT.tomtom} tooltipPosition="right">
                        <div className="h-12 flex flex-col justify-start">
                           <span className={`text-3xl font-black leading-none ${H[ttHealth].num}`}>
                              {congestion != null ? <OdometerNumber value={`${animatedTomTom}%`} /> : "—"}
                           </span>
                           <p className="text-[11px] text-zinc-500 uppercase tracking-wide mt-0.5">flow speed</p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1">
                           <Row k="label"     v={ls?.tomtom?.congestion_label as string | undefined} />
                           <Row k="incidents" v={(sigVal("tomtom") as Record<string,unknown> | undefined)?.incidents as number | undefined} />
                           <Row k="penalty"   v={ls?.tomtom?.traffic_penalty as number | undefined} />
                        </div>
                     </DbCard>

                     {/* DEP */}
                     <DbCard title="DEP" health={depHealth} tooltip={OT.dep}>
                        <div className="h-12 flex flex-col justify-start">
                           <div className="flex items-baseline gap-0.5">
                              <div className={`text-3xl font-black leading-none ${H[depHealth].num}`}>{depLevel != null ? <OdometerNumber value={animatedDep} /> : "—"}</div>
                              <span className="text-zinc-600 text-[11px] font-medium">/100</span>
                           </div>
                           <p className="text-[11px] text-zinc-500 uppercase tracking-wide mt-0.5">complaint index</p>
                        </div>

                        <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1">
                           <Row k="complaints" v={depComplaintCount} />
                           <Row k="severe"     v={depSevereCount} />
                           <Row k="age"        v={ls?.dep_noise?.age_minutes != null ? fmtAge(ls.dep_noise.age_minutes as number) : undefined} />
                           <Row k="lookback"   v="30 days" />
                           <Row k="radius"     v="300 m" />
                           <Row k="impact"     v={ls?.dep_noise?.score_impact as number | undefined} />
                        </div>
                     </DbCard>

                     {/* NYC 311 */}
                     <DbCard title="NYC 311" health={odHealth} tooltip={OT.nyc311} tooltipPosition="right">
                        <div className="h-12 flex gap-4 items-start">
                           <div>
                              <p className={`text-3xl font-black leading-none ${H[odHealth].num}`}><OdometerNumber value={animatedEvents} /></p>
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide mt-0.5">events</p>
                           </div>
                           <div>
                              <p className={`text-3xl font-black leading-none ${H[odHealth].num}`}><OdometerNumber value={animatedComplaints} /></p>
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide mt-0.5">complaints</p>
                           </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1">
                           <Row k="construction" v={construction ? "true" : "false"} />
                           <Row k="baseline/wk"  v={debug?.complaint_baseline_weekly as number | undefined} />
                           <Row k="event"        v={sigVal("events")?.description as string | undefined} />
                        </div>
                     </DbCard>

                     {/* Realtime freshness — per-signal */}
                     <DbCard title="Realtime" health={rtHealth} tooltip={OT.realtime}>
                        <div className="space-y-1 mt-1">
                           {(["mta", "weather", "events", "tomtom", "dep_noise"] as const).map(sig => {
                              const entry = ls?.[sig];
                              const age   = entry?.age_minutes as number | undefined;
                              const active = entry?.active as boolean | undefined;
                              const dot = entry == null ? "bg-zinc-700"
                                 : active ? "bg-emerald-500" : "bg-red-500";
                              return (
                                 <div key={sig} className="flex items-center gap-2 text-[11px]">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                                    <span className="text-zinc-500 uppercase tracking-wide w-20 shrink-0">
                                       {sig.replace("_", " ")}
                                    </span>
                                    <span className={`ml-auto font-medium tabular-nums ${active ? "text-zinc-300" : "text-zinc-600"}`}>
                                       {age != null ? fmtAge(age) : "—"}
                                    </span>
                                 </div>
                              );
                           })}
                        </div>
                     </DbCard>

                     {/* MTA */}
                     <DbCard title="MTA" health={mtaHealth} tooltip={OT.mta} tooltipPosition="right">
                        <div className="mt-4 space-y-1">
                           <Row k="severity" v={mtaSev} />
                           <Row k="label"    v={ls?.mta?.severity_label as string | undefined} />
                           <Row k="impact"   v={ls?.mta?.score_impact as number | undefined} />
                        </div>
                     </DbCard>
                  </div>

                  {/* Venue Static */}
                  <DbCard title="Venue" health="neutral" tooltip={OT.static} full>
                     <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <Row k="sq_ft"        v={vs?.sq_ft} />
                        <Row k="music"        v={vs?.music_policy} />
                        <Row k="seating"      v={vs?.seating_type} />
                        <Row k="serves_food"  v={vs?.serves_food} />
                        <Row k="serves_alc"   v={vs?.serves_alcohol} />
                        <Row k="subway m"     v={vs?.nearest_subway_m} />
                        <Row k="pedestrian"   v={vs?.pedestrian_volume} />
                        <Row k="reviews"      v={vs?.google_review_count} />
                        <Row k="google nlp"   v={vs?.google_noise_estimate} />
                     </div>
                  </DbCard>


                  <DbCard title="Data feeds" health="neutral" tooltip={OT.services} full>
                     {feedRows.length === 0 ? (
                        <p className="text-[11px] text-zinc-500 py-0.5">Loading feed status…</p>
                     ) : (
                        <div className="space-y-2">
                           {feedRows.map((row) => (
                              <div key={row.key} className="flex items-center gap-2.5 text-[11px] leading-snug">
                                 <span className={`w-2 h-2 rounded-full shrink-0 ${FEED_DOT[row.status]}`} aria-hidden />
                                 <span className="text-zinc-500 uppercase tracking-wide w-[100px] shrink-0">{row.label}</span>
                                 <span className="text-zinc-300 font-medium lowercase text-right flex-1 min-w-0 truncate tracking-wide" title={row.detail}>
                                    {row.detail}
                                 </span>
                              </div>
                           ))}
                        </div>
                     )}
                  </DbCard>

                  {!debug && (
                     <div className="text-center py-6 text-zinc-500 text-sm">Loading overview…</div>
                  )}

            </div>

         </div>
      </div>
   );
}
