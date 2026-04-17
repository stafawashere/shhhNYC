import type { Venue } from "./api";

export function googleMapsVenueUrl(venue: Pick<Venue, "google_place_id" | "name" | "address" | "lat" | "lng">): string {
   if (venue.google_place_id) {
      const q = encodeURIComponent(venue.name);
      const pid = encodeURIComponent(venue.google_place_id);
      return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${pid}`;
   }
   if (venue.lat != null && venue.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`;
   }
   return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${venue.address}`)}`;
}
