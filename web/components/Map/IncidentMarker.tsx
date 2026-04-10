"use client";

import { useState } from "react";
import { Marker } from "react-map-gl/mapbox";
import { ConstructionIncident, NoiseIncident } from "@/lib/api";

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

export function ConstructionMarker({ incident }: { incident: ConstructionIncident }) {
   const [hovered, setHovered] = useState(false);
   const age = daysAgo(incident.filing_date);

   return (
      <Marker latitude={incident.lat} longitude={incident.lng} anchor="center">
         <div
            className="relative cursor-pointer"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
         >
            <div
               className="w-4 h-4 transition-transform hover:scale-125"
               style={{
                  backgroundColor: "rgba(249,115,22,0.85)",
                  border: "1.5px solid rgba(253,186,116,0.7)",
                  transform: "rotate(45deg)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  boxShadow: "0 0 6px rgba(249,115,22,0.5)",
               }}
            />
            {hovered && (
               <Tooltip>
                  <p className="font-semibold text-orange-300 leading-snug">{incident.job_type}</p>
                  <p className="text-zinc-400 mt-0.5">{incident.filing_status}</p>
                  {incident.borough && <p className="text-zinc-500 mt-0.5">{incident.borough}</p>}
                  {age && <p className="text-zinc-500 mt-0.5">Filed {age}</p>}
               </Tooltip>
            )}
         </div>
      </Marker>
   );
}

export function NoiseMarker({ incident }: { incident: NoiseIncident }) {
   const [hovered, setHovered] = useState(false);
   const age = daysAgo(incident.created_date);

   return (
      <Marker latitude={incident.lat} longitude={incident.lng} anchor="center">
         <div
            className="relative cursor-pointer"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
         >
            <div
               className="w-3 h-3 rounded-full transition-transform hover:scale-125"
               style={{
                  backgroundColor: "rgba(239,68,68,0.7)",
                  border: "1.5px solid rgba(252,165,165,0.6)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  boxShadow: "0 0 5px rgba(239,68,68,0.4)",
               }}
            />
            {hovered && (
               <Tooltip>
                  <p className="font-semibold text-red-300 leading-snug">{incident.complaint_type}</p>
                  {incident.descriptor && <p className="text-zinc-400 mt-0.5">{incident.descriptor}</p>}
                  {incident.borough && <p className="text-zinc-500 mt-0.5">{incident.borough}</p>}
                  {age && <p className="text-zinc-500 mt-0.5">Reported {age}</p>}
               </Tooltip>
            )}
         </div>
      </Marker>
   );
}
