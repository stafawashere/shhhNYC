export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export interface Venue {
   id: string;
   name: string;
   address: string;
   neighborhood: string | null;
   borough: string | null;
   sq_ft: number | null;
   seating_type: string[] | null;
   google_noise_estimate: string | null;
   music_policy: string | null;
   serves_food: boolean | null;
   serves_alcohol: boolean | null;
   price_tier: number | null;
   nearest_subway_m: number | null;
   google_place_id: string | null;
   photos: string[] | null;
   opening_hours: OpeningHours | null;
   phone_number: string | null;
   website_url: string | null;
   venue_types: string[] | null;
   subway_lines_served: string[] | null;
   pedestrian_volume: number | null;
   google_review_count: number | null;
   has_outdoor_seating: boolean | null;
   is_cabaret: boolean | null;
   liquor_license_type: string | null;
   health_grade: string | null;
   lat: number | null;
   lng: number | null;
}

export interface OpeningHoursPeriod {
   open: { day: number; time: string };
   close?: { day: number; time: string };
}

export interface OpeningHours {
   weekday_text: string[];
   periods: OpeningHoursPeriod[];
}

export interface ScoreBreakdown {
   venue_traits: number;
   time_pattern: number;
   live_adjustment: number;
   traffic_penalty: number;
}

export interface ScoreModelInfo {
   version: string | null;
   max_noise: number;
   calibrated: boolean;
   n_train: number | null;
}

export interface Score {
   quiet_score: number | null;
   label: string;
   confidence: number;
   breakdown: ScoreBreakdown;
   traffic_congestion: number | null;
   closed?: boolean;
   model?: ScoreModelInfo | null;
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
   filing_date: string | null;
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

export interface SubwayStation {
   name: string;
   lat: number;
   lng: number;
   lines: string[];
}

export async function getSubwayStations(): Promise<SubwayStation[]> {
   const res = await fetch(`${API_BASE}/subway-stations`);
   if (!res.ok) return [];
   return res.json();
}
