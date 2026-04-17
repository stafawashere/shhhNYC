/**
 * theme.ts — single source of truth for every color / glass / accent token.
 *
 * Edit here and all components pick up the change automatically.
 * Nothing in this file imports React — it's pure TS constants.
 */

// NOISE LEVEL PALETTE
export type NoiseLabel = "Very Quiet" | "Quiet" | "Moderate" | "Loud" | "Very Loud";

export interface NoisePalette {
   /** Solid hex — SVG ring, marker fill, pulse animation base */
   solid: string;
   /** Brighter hex — marker ring/ping, pulse animation highlight */
   bright: string;
   /** Glassmorphic rgba bg for markers */
   alpha: string;
   /** Glassmorphic rgba border for markers */
   borderAlpha: string;
   /** Tailwind bar fill class */
   bar: string;
   /** Tailwind badge pill (card / detail view) */
   badge: string;
   /** Tailwind number / score text */
   num: string;
   /** Overview DbCard border accent */
   cardBorder: string;
   /** Overview DbCard background tint */
   cardBg: string;
   /** Overview DbCard colored pill */
   cardPill: string;
   /** Overview DbCard dot indicator */
   dot: string;
}

export const NOISE: Record<NoiseLabel, NoisePalette> = {
   "Very Quiet": {
      solid:       "#10b981",
      bright:      "#6ee7b7",
      alpha:       "rgba(16,185,129,0.75)",
      borderAlpha: "rgba(110,231,183,0.4)",
      bar:         "bg-emerald-500",
      badge:       "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
      num:         "text-emerald-300",
      cardBorder:  "border-emerald-500/25",
      cardBg:      "bg-emerald-500/5",
      cardPill:    "bg-emerald-900/70 text-emerald-300 border border-emerald-700/40",
      dot:         "bg-emerald-500",
   },
   "Quiet": {
      solid:       "#22c55e",
      bright:      "#86efac",
      alpha:       "rgba(34,197,94,0.75)",
      borderAlpha: "rgba(134,239,172,0.4)",
      bar:         "bg-green-400",
      badge:       "bg-green-900/40 text-green-300 border border-green-700/40",
      num:         "text-green-300",
      cardBorder:  "border-green-500/25",
      cardBg:      "bg-green-500/5",
      cardPill:    "bg-green-900/70 text-green-300 border border-green-700/40",
      dot:         "bg-green-500",
   },
   "Moderate": {
      solid:       "#eab308",
      bright:      "#fde047",
      alpha:       "rgba(234,179,8,0.75)",
      borderAlpha: "rgba(253,224,71,0.4)",
      bar:         "bg-yellow-400",
      badge:       "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
      num:         "text-yellow-300",
      cardBorder:  "border-yellow-500/25",
      cardBg:      "bg-yellow-500/5",
      cardPill:    "bg-yellow-900/70 text-yellow-300 border border-yellow-700/40",
      dot:         "bg-yellow-400",
   },
   "Loud": {
      solid:       "#f97316",
      bright:      "#fdba74",
      alpha:       "rgba(249,115,22,0.75)",
      borderAlpha: "rgba(253,186,116,0.4)",
      bar:         "bg-orange-400",
      badge:       "bg-orange-900/40 text-orange-300 border border-orange-700/40",
      num:         "text-orange-400",
      cardBorder:  "border-orange-500/25",
      cardBg:      "bg-orange-500/5",
      cardPill:    "bg-orange-900/70 text-orange-300 border border-orange-700/40",
      dot:         "bg-orange-500",
   },
   "Very Loud": {
      solid:       "#ef4444",
      bright:      "#fca5a5",
      alpha:       "rgba(239,68,68,0.75)",
      borderAlpha: "rgba(252,165,165,0.4)",
      bar:         "bg-red-500",
      badge:       "bg-red-900/40 text-red-300 border border-red-700/40",
      num:         "text-red-400",
      cardBorder:  "border-red-500/25",
      cardBg:      "bg-red-500/5",
      cardPill:    "bg-red-900/70 text-red-300 border border-red-700/40",
      dot:         "bg-red-500",
   },
};

/** Fallback when label is unknown */
export const NOISE_FALLBACK: NoisePalette = NOISE["Moderate"];

/** Resolve a NoisePalette from any label string (with fallback). */
export function noiseColors(label: string): NoisePalette {
   return (NOISE as Record<string, NoisePalette>)[label] ?? NOISE_FALLBACK;
}

/**
 * Map a numeric quiet score (0–100) to the correct NoisePalette.
 * Mirrors the backend score → label mapping.
 */
export function noiseColorsByScore(score: number): NoisePalette {
   if (score >= 80) return NOISE["Very Quiet"];
   if (score >= 60) return NOISE["Quiet"];
   if (score >= 40) return NOISE["Moderate"];
   if (score >= 20) return NOISE["Loud"];
   return NOISE["Very Loud"];
}

// HEALTH / STATUS PALETTE
export type Health = "good" | "warn" | "bad" | "neutral";

export interface HealthPalette {
   border:  string;
   bg:      string;
   pill:    string;
   num:     string;
   dot:     string;
}

export const HEALTH: Record<Health, HealthPalette> = {
   good:    { border: "border-emerald-500/25", bg: "bg-emerald-500/5",  pill: "bg-emerald-900/70 text-emerald-300 border border-emerald-700/40", num: "text-emerald-300", dot: "bg-emerald-500" },
   warn:    { border: "border-yellow-500/25",  bg: "bg-yellow-500/5",   pill: "bg-yellow-900/70 text-yellow-300 border border-yellow-700/40",   num: "text-yellow-300",  dot: "bg-yellow-400" },
   bad:     { border: "border-red-500/25",     bg: "bg-red-500/5",      pill: "bg-red-900/70 text-red-300 border border-red-700/40",            num: "text-red-400",     dot: "bg-red-500"    },
   neutral: { border: "border-zinc-700/40",    bg: "bg-zinc-800/20",    pill: "bg-zinc-800 text-zinc-400 border border-zinc-700/40",            num: "text-zinc-100",    dot: "bg-zinc-600"   },
};

// SCORE BREAKDOWN BAR ACCENTS
export const BREAKDOWN_COLORS = {
   space:   "bg-violet-500",  // venue_traits
   time:    "bg-blue-500",    // time_pattern
   live:    "bg-cyan-500",    // live_adjustment
   traffic: "bg-amber-500",   // traffic_penalty
   confidence: "bg-indigo-500",
} as const;

// BUSYNESS / HOURLY CHART COLORS
export function busynessColor(v: number): string {
   if (v <= 20) return NOISE["Very Quiet"].solid;
   if (v <= 40) return NOISE["Quiet"].solid;
   if (v <= 60) return NOISE["Moderate"].solid;
   if (v <= 75) return NOISE["Loud"].solid;
   return NOISE["Very Loud"].solid;
}

// ICON ACCENT COLORS
export const ICON_COLORS = {
   music:         "text-zinc-400",
   price:         "text-emerald-400",
   food:          "text-orange-400",
   seating:       "text-zinc-300",
   alcohol:       "text-purple-400",
   outdoorSeating:"text-emerald-400",
   healthGrade:   "text-blue-400",
   hours:         "text-sky-400",
   liquorLicense: "text-purple-400",
   cabaret:       "text-pink-400",
   default:       "text-zinc-500",
} as const;

// PILL VALUE COLORS
export const PILL_VALUES: Record<string, string> = {
   "Good":       "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40",
   "Free":       "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40",
   "Very Quiet": "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40",
   "Quiet":      "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40",
   "Open":       "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40",
   "Paid":       "bg-zinc-800/60 text-zinc-400 border border-zinc-700/40",
   "Moderate":   "bg-yellow-950/60 text-yellow-500 border border-yellow-800/40",
   "Loud":       "bg-red-950/60 text-red-400 border border-red-800/40",
   "Very Loud":  "bg-red-950/60 text-red-400 border border-red-800/40",
   "Closed":     "bg-zinc-800/60 text-zinc-500 border border-zinc-700/40",
};

// GLASSMORPHISM SURFACES
/** Card-level glass — VenueCard, map tooltips */
export const GLASS_CARD = {
   backgroundColor:    "rgba(24,24,27,0.75)",
   backdropFilter:     "blur(16px)",
   WebkitBackdropFilter: "blur(16px)",
   border:             "1px solid rgba(63,63,70,0.6)",
   boxShadow:          "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
} as const;

/** Tooltip / overlay glass — slightly darker and smaller blur */
export const GLASS_TOOLTIP = {
   backgroundColor:    "rgba(24,24,27,0.82)",
   backdropFilter:     "blur(14px)",
   WebkitBackdropFilter: "blur(14px)",
} as const;

/** Map overlay glass — panels, live indicator, incident strip */
export const GLASS_OVERLAY = {
   backgroundColor:    "rgba(24,24,27,0.8)",
   backdropFilter:     "blur(12px)",
   WebkitBackdropFilter: "blur(12px)",
} as const;

/** Marker badge glass — per-score color injected separately */
export const GLASS_MARKER_SHADOW = "inset 0 1px 0 rgba(255,255,255,0.15)";

/** Grid / sub-section surface (slightly lighter than card) */
export const GLASS_SUBSURFACE = {
   backgroundColor: "rgba(39,39,42,0.6)",
   border:          "1px solid rgba(63,63,70,0.4)",
} as const;

// CONSTRUCTION / INCIDENT ACCENT
export const CONSTRUCTION = {
   bg:     "rgba(234,179,8,0.4)",
   border: "rgba(253,224,71,0.45)",
   shadow: "rgba(234,179,8,0.25)",
} as const;

// UI SURFACE TOKENS
export const UI = {
   pageBg:          "bg-zinc-950",
   sectionBg:       "bg-zinc-900",
   divider:         "border-zinc-800/60",
   dividerSubtle:   "border-zinc-800/40",
   textPrimary:     "text-zinc-100",
   textSecondary:   "text-zinc-400",
   textMuted:       "text-zinc-500",
   textFaint:       "text-zinc-600",
   filterActive:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
   filterInactive:  "bg-zinc-800/60 text-zinc-300 border-zinc-700",
   refreshDot:      "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse",
   refreshDotIdle:  "w-1.5 h-1.5 rounded-full bg-zinc-700",
} as const;
