"use client";

import { useState } from "react";
import { Marker } from "react-map-gl/mapbox";
import { ConstructionIncident } from "@/lib/api";

function daysAgo(dateStr: string | null): string | null {
   if (!dateStr) return null;
   try {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
      if (diff === 0) return "today";
      if (diff === 1) return "1 day ago";
      return `${diff} days ago`;
   } catch {
      return null;
   }
}

function markerScale(zoom: number): number {
   if (zoom >= 16) return 1.0;
   if (zoom >= 15) return 0.85;
   if (zoom >= 14) return 0.7;
   if (zoom >= 13) return 0.55;
   if (zoom >= 12) return 0.4;
   return 0.3;
}

function Tooltip({ children }: { children: React.ReactNode }) {
   return (
      <div
         className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-48 rounded-xl px-3 py-2.5 text-xs pointer-events-none"
         style={{
            backgroundColor: "rgba(24,24,27,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(63,63,70,0.7)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
         }}
      >
         {children}
         <p className="text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-800">NYC Open Data · ~5 day lag</p>
      </div>
   );
}

export function ConstructionMarker({ incident, zoom = 14 }: { incident: ConstructionIncident; zoom?: number }) {
   const [hovered, setHovered] = useState(false);
   const age = daysAgo(incident.filing_date);
   const scale = markerScale(zoom);

   return (
      <Marker latitude={incident.lat} longitude={incident.lng} anchor="center">
         <div
            className="relative cursor-pointer"
            style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
         >
            <div
               className="w-2.5 h-2.5 transition-transform hover:scale-125"
               style={{
                  backgroundColor: "rgba(234,179,8,0.4)",
                  border: "1px solid rgba(253,224,71,0.45)",
                  transform: "rotate(45deg)",
                  boxShadow: "0 0 4px rgba(234,179,8,0.25)",
               }}
            />
            {hovered && (
               <Tooltip>
                  <p className="font-semibold text-yellow-300 leading-snug">{incident.job_type}</p>
                  <p className="text-zinc-400 mt-0.5">{incident.filing_status}</p>
                  {incident.borough && <p className="text-zinc-500 mt-0.5">{incident.borough}</p>}
                  {age && <p className="text-zinc-500 mt-0.5">Filed {age}</p>}
               </Tooltip>
            )}
         </div>
      </Marker>
   );
}
