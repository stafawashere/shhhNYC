const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export interface Venue {
   id: string;
   name: string;
   address: string;
   neighborhood: string | null;
   borough: string | null;
   sq_ft: number | null;
   ceiling_type: string | null;
   seating_type: string[] | null;
   music_policy: string | null;
   espresso_position: string | null;
   has_outlets: boolean | null;
   wifi_quality: string | null;
   wifi_policy: string | null;
   serves_food: boolean | null;
   serves_alcohol: boolean | null;
   kid_friendly: boolean | null;
   price_tier: number | null;
   noise_level_yelp: string | null;
   nearest_subway_m: number | null;
   google_place_id: string | null;
   photos: string[] | null;
   lat: number | null;
   lng: number | null;
}

export interface ScoreBreakdown {
   venue_traits: number;
   time_pattern: number;
   live_adjustment: number;
   traffic_penalty: number;
}

export interface Score {
   quiet_score: number;
   label: string;
   confidence: number;
   breakdown: ScoreBreakdown;
   traffic_congestion: number | null;
}

export interface VenueWithScore {
   venue: Venue;
   score: Score;
}

export async function getNearbyVenues(
   lat: number,
   lng: number,
   radius = 0.5,
): Promise<VenueWithScore[]> {
   const res = await fetch(
      `${API_BASE}/venues/nearby?lat=${lat}&lng=${lng}&radius=${radius}`,
   );
   if (!res.ok) throw new Error("Failed to fetch nearby venues");
   return res.json();
}

export async function getVenue(id: string): Promise<VenueWithScore> {
   const res = await fetch(`${API_BASE}/venues/${id}`);
   if (!res.ok) throw new Error("Venue not found");
   return res.json();
}

export async function getVenueHourly(id: string, day?: number): Promise<{ day_of_week: number; current_hour: number; slots: { hour: number; busyness: number }[] }> {
   const url = day !== undefined ? `${API_BASE}/venues/${id}/hourly?day=${day}` : `${API_BASE}/venues/${id}/hourly`;
   const res = await fetch(url);
   if (!res.ok) throw new Error("Hourly fetch failed");
   return res.json();
}

export async function getVenueDebug(id: string): Promise<Record<string, unknown>> {
   const res = await fetch(`${API_BASE}/venues/${id}/debug`);
   if (!res.ok) throw new Error("Debug fetch failed");
   return res.json();
}

export interface VenueWarning {
   type: "construction" | "noise_complaints" | "event";
   severity: "high" | "medium" | "low";
   title: string;
   detail: string;
}

export async function getVenueWarnings(id: string): Promise<VenueWarning[]> {
   const res = await fetch(`${API_BASE}/venues/${id}/warnings`);
   if (!res.ok) return [];
   const data = await res.json();
   return data.warnings ?? [];
}

export interface ConstructionIncident {
   lat: number;
   lng: number;
   job_type: string;
   filing_status: string;
   borough: string;
   filing_date: string | null;  // NYC DOB dataset has ~5 day publish lag
}

export interface NoiseIncident {
   lat: number;
   lng: number;
   complaint_type: string;
   descriptor: string;
   borough: string;
   created_date: string | null; 
}

export interface EventIncident {
   event_name: string;
   event_type: string;
   event_borough: string;
   event_location: string;
   street_closure_type: string;
   start_date_time: string;
}

export interface Incidents {
   construction: ConstructionIncident[];
   noise: NoiseIncident[];
   events: EventIncident[];
}

export async function getIncidents(): Promise<Incidents> {
   const res = await fetch(`${API_BASE}/incidents`);
   if (!res.ok) return { construction: [], noise: [], events: [] };
   return res.json();
}
