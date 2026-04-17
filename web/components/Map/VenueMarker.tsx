"use client";

import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";
import { VenueWithScore } from "@/lib/api";
import { noiseColorsByScore, GLASS_MARKER_SHADOW } from "@/lib/theme";

interface Props {
   data: VenueWithScore;
   lat: number;
   lng: number;
   scale?: number;
   onClick: () => void;
}

function VenueMarker({ data, lat, lng, scale = 1, onClick }: Props) {
   const { quiet_score, label, closed } = data.score;
   const isClosed = closed === true || quiet_score == null;
   const displayLabel = isClosed ? "Closed" : label;
   const { solid, bright, alpha, borderAlpha } = noiseColorsByScore(quiet_score ?? 0);
   const hasLive = !isClosed && data.score.breakdown.live_adjustment !== 0;

   const glassStyle: React.CSSProperties = isClosed
      ? {
           backgroundColor: "rgba(39,39,42,0.55)",
           color: "#a1a1aa",
           border: "1px dashed rgba(113,113,122,0.45)",
           backdropFilter: "blur(8px)",
           WebkitBackdropFilter: "blur(8px)",
           boxShadow: GLASS_MARKER_SHADOW,
        }
      : {
           backgroundColor: alpha,
           color: "#ffffff",
           border: `1px solid ${borderAlpha}`,
           backdropFilter: "blur(8px)",
           WebkitBackdropFilter: "blur(8px)",
           boxShadow: `0 2px 10px ${alpha}, ${GLASS_MARKER_SHADOW}`,
        };

   return (
      <Marker latitude={lat} longitude={lng} onClick={onClick} anchor="bottom">

         <div className="group cursor-pointer flex flex-col items-center" style={{ transform: `scale(${scale})`, transformOrigin: "bottom center", zIndex: 10 }}>
            {/*
               Badge layout: pill is the layout anchor, score circle is
               absolutely positioned at its top-right corner like a notification
               badge. pt-2 pr-2 make room for the badge without shifting the pill.
            */}
            {/*
               Wrapper gives the badge room to overflow the pill's top-right corner.
               pt = half badge height, pr = half badge width, so badge sits centered
               on the corner without clipping or shifting the pill's layout.
            */}
            <div className="relative pt-[9px] transition-transform group-hover:scale-110 right-0.5">

               {/* Label pill — pl is normal, pr reserves space so text never slides under the badge */}
               <div
                  className="px-3 py-[5px] rounded-full text-[11px] font-medium leading-none tracking-wide whitespace-nowrap text-center"
                  style={glassStyle}
               >
                  {displayLabel}
               </div>

               {/* Score badge — 18px circle anchored to the pill's top-right corner */}
               {!isClosed && (
                  <div
                     className="absolute top-0 -right-1 w-[18px] h-[18px] flex justify-center items-center rounded-full text-[9px] font-black leading-none"
                     style={glassStyle}
                  >
                     {/* Ping ring — inset-0 mirrors the circle geometry exactly */}
                     {hasLive && (
                        <span
                           className="absolute inset-0 rounded-full animate-ping opacity-30 pointer-events-none"
                           style={{ backgroundColor: bright, animationDuration: "2s" }}
                        />
                     )}

                     <span style={hasLive ? {
                        animation: "scorePulse 2s cubic-bezier(0,0,0.2,1) infinite",
                        ["--pulse-color" as string]: bright,
                     } : undefined}>
                        {quiet_score}
                     </span>
                  </div>
               )}

            </div>

            {/* Pointer tip — offset by half the pr padding to stay centered under the pill */}
            <div style={{
               width: 0, height: 0,
               borderLeft: "5px solid transparent",
               borderRight: "5px solid transparent",
               borderTop: `6px solid ${isClosed ? "rgba(113,113,122,0.55)" : solid}`,
               opacity: 0.8,
            }} />
         </div>
      </Marker>
   );
}

export default memo(VenueMarker);