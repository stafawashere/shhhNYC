"use client";

import { Marker } from "react-map-gl/mapbox";
import { VenueWithScore } from "@/lib/api";

interface Props {
   data: VenueWithScore;
   lat: number;
   lng: number;
   onClick: () => void;
}

function scoreStyle(score: number): { bg: string; text: string; ring: string } {
   if (score >= 80) return { bg: "#10b981", text: "#ffffff", ring: "#6ee7b7" };
   if (score >= 65) return { bg: "#22c55e", text: "#ffffff", ring: "#86efac" };
   if (score >= 50) return { bg: "#eab308", text: "#ffffff", ring: "#fde047" };
   if (score >= 35) return { bg: "#f97316", text: "#ffffff", ring: "#fdba74" };
   return { bg: "#ef4444", text: "#ffffff", ring: "#fca5a5" };
}

function scoreLabel(score: number): string {
   if (score >= 80) return "Very Quiet";
   if (score >= 60) return "Quiet";
   if (score >= 40) return "Moderate";
   if (score >= 20) return "Loud";
   return "Very Loud";
}

export default function VenueMarker({ data, lat, lng, onClick }: Props) {
   const { quiet_score } = data.score;
   const { bg, text, ring } = scoreStyle(quiet_score);
   const hasLive = data.score.breakdown.live_adjustment !== 0;

   return (
      <Marker latitude={lat} longitude={lng} onClick={onClick} anchor="bottom">
         <div className="group cursor-pointer flex flex-col items-center" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" }}>
            <div
               className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-transform group-hover:scale-110"
               style={{ backgroundColor: bg, color: text }}
            >
               <span className="text-sm font-extrabold leading-none">{quiet_score}</span>
               <span className="opacity-90 font-medium leading-none hidden sm:inline">{scoreLabel(quiet_score)}</span>
            </div>
            <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `6px solid ${bg}` }} />
            {hasLive && (
               <span
                  className="absolute rounded-full animate-ping opacity-30 pointer-events-none"
                  style={{ width: 36, height: 36, backgroundColor: ring, top: -4, left: -4 }}
               />
            )}
         </div>
      </Marker>
   );
}
