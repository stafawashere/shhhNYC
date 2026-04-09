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
   google_place_id: string | null;
   lat: number | null;
   lng: number | null;
}

export interface ScoreBreakdown {
   venue_traits: number;
   time_pattern: number;
   live_adjustment: number;
}

export interface Score {
   quiet_score: number;
   label: string;
   confidence: number;
   breakdown: ScoreBreakdown;
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
