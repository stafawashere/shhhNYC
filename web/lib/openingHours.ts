import type { OpeningHours } from "./api";

const MIN_PER_WEEK = 7 * 24 * 60;

function parseTime(t: string): number {
   return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2, 4), 10);
}

function openIntervals(oh: OpeningHours): [number, number][] {
   const out: [number, number][] = [];
   for (const p of oh.periods ?? []) {
      if (!p.open) continue;
      const start = p.open.day * 1440 + parseTime(p.open.time);
      if (!p.close) {
         return [[0, MIN_PER_WEEK]];
      }
      let end = p.close.day * 1440 + parseTime(p.close.time);
      if (end <= start) end += MIN_PER_WEEK;
      out.push([start, end]);
   }
   return out;
}

function pyDayToGoogle(py: number): number {
   return (py + 1) % 7;
}

function nycNow(): { googleDay: number; minute: number } {
   const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
   });
   const parts = fmt.formatToParts(new Date());
   const wd = parts.find(p => p.type === "weekday")?.value ?? "Sun";
   const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10) % 24;
   const min = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
   const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
   return { googleDay: map[wd] ?? 0, minute: hour * 60 + min };
}

export function openHoursForPyDay(oh: OpeningHours | null, pyDay: number): Set<number> {
   const result = new Set<number>();
   if (!oh) return result;
   const intervals = openIntervals(oh);
   const gDay = pyDayToGoogle(pyDay);
   for (let h = 0; h < 24; h++) {
      const m = gDay * 1440 + h * 60;
      const m2 = m + MIN_PER_WEEK;
      for (const [s, e] of intervals) {
         if ((m >= s && m < e) || (m2 >= s && m2 < e)) {
            result.add(h);
            break;
         }
      }
   }
   return result;
}

export function openNowStatus(oh: OpeningHours | null): {
   open: boolean;
   label: string;
} | null {
   if (!oh || !(oh.periods?.length)) return null;
   const intervals = openIntervals(oh);
   const { googleDay, minute } = nycNow();
   const nowMin = googleDay * 1440 + minute;

   for (const [s, e] of intervals) {
      const s2 = s;
      const e2 = e;
      const n = nowMin < s2 ? nowMin + MIN_PER_WEEK : nowMin;
      if (n >= s2 && n < e2) {
         const closeMin = e2 - s2 <= MIN_PER_WEEK ? e2 : e2;
         const minsLeft = closeMin - n;
         if (minsLeft >= MIN_PER_WEEK - 1) return { open: true, label: "Open 24 hours" };
         const closeClock = ((closeMin % MIN_PER_WEEK) % 1440);
         const ch = Math.floor(closeClock / 60);
         const cm = closeClock % 60;
         const h12 = ch === 0 ? 12 : ch > 12 ? ch - 12 : ch;
         const ampm = ch < 12 ? "AM" : "PM";
         const mm = cm === 0 ? "" : `:${cm.toString().padStart(2, "0")}`;
         return { open: true, label: `Closes ${h12}${mm} ${ampm}` };
      }
   }

   let nextOpen = Infinity;
   for (const [s] of intervals) {
      const diff = s >= nowMin ? s - nowMin : s + MIN_PER_WEEK - nowMin;
      if (diff < nextOpen) nextOpen = diff;
   }
   if (nextOpen === Infinity) return { open: false, label: "Closed" };
   if (nextOpen < 60) return { open: false, label: `Opens in ${nextOpen}m` };
   if (nextOpen < 12 * 60) return { open: false, label: `Opens in ${Math.round(nextOpen / 60)}h` };
   return { open: false, label: "Closed" };
}

export function todayWeekdayText(oh: OpeningHours | null): string | null {
   if (!oh || !oh.weekday_text?.length) return null;
   const { googleDay } = nycNow();
   const mondayFirstIdx = (googleDay + 6) % 7;
   const line = oh.weekday_text[mondayFirstIdx];
   if (!line) return null;
   const colon = line.indexOf(":");
   return colon > -1 ? line.slice(colon + 1).trim() : line;
}
