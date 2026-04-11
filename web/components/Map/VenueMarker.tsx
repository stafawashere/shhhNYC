"use client";

import { Marker } from "react-map-gl/mapbox";
import { VenueWithScore } from "@/lib/api";

interface Props {
   data: VenueWithScore;
   lat: number;
   lng: number;
   scale?: number;
   onClick: () => void;
}

function scoreStyle(score: number) {
   if (score >= 80) return { solid: "#10b981", alpha: "rgba(16,185,129,0.75)", border: "rgba(110,231,183,0.4)", ring: "#6ee7b7" };
   if (score >= 65) return { solid: "#22c55e", alpha: "rgba(34,197,94,0.75)",  border: "rgba(134,239,172,0.4)", ring: "#86efac" };
   if (score >= 50) return { solid: "#eab308", alpha: "rgba(234,179,8,0.75)",  border: "rgba(253,224,71,0.4)",  ring: "#fde047" };
   if (score >= 35) return { solid: "#f97316", alpha: "rgba(249,115,22,0.75)", border: "rgba(253,186,116,0.4)", ring: "#fdba74" };
   return            { solid: "#ef4444", alpha: "rgba(239,68,68,0.75)",   border: "rgba(252,165,165,0.4)", ring: "#fca5a5" };
}

function scoreLabel(score: number): string {
   if (score >= 80) return "Very Quiet";
   if (score >= 65) return "Quiet";
   if (score >= 50) return "Moderate";
   if (score >= 35) return "Loud";
   return "Very Loud";
}

export default function VenueMarker({ data, lat, lng, scale = 1, onClick }: Props) {
   const { quiet_score } = data.score;
   const { solid, alpha, border, ring } = scoreStyle(quiet_score);
   const hasLive = data.score.breakdown.live_adjustment !== 0;

   return (
      <Marker latitude={lat} longitude={lng} onClick={onClick} anchor="bottom">
         <div className="group cursor-pointer flex flex-col items-center relative" style={{ transform: `scale(${scale})`, transformOrigin: "bottom center", zIndex: 10 }}>
            {/* glass pill */}
            <div
               className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-transform group-hover:scale-110"
               style={{
                  backgroundColor: alpha,
                  color: "#ffffff",
                  border: `1px solid ${border}`,
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: `0 2px 10px ${alpha}, inset 0 1px 0 rgba(255,255,255,0.15)`,
               }}
            >
               <span className="text-sm font-extrabold leading-none">{quiet_score}</span>
               <span className="opacity-90 font-medium leading-none hidden sm:inline">{scoreLabel(quiet_score)}</span>
            </div>
            {/* pointer tip */}
            <div style={{
               width: 0, height: 0,
               borderLeft: "5px solid transparent",
               borderRight: "5px solid transparent",
               borderTop: `6px solid ${solid}`,
               opacity: 0.8,
            }} />
            {/* live pulse ring */}
            {hasLive && (
               <span
                  className="absolute rounded-full animate-ping opacity-25 pointer-events-none"
                  style={{ width: 36, height: 36, backgroundColor: ring, top: -4, left: -4 }}
               />
            )}
         </div>
      </Marker>
   );
}
