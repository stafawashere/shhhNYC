"use client";

import { useState } from "react";
import { Marker } from "react-map-gl/mapbox";
import { ConstructionIncident } from "@/lib/api";
import Tooltip from "../common/Tooltip";

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


export function ConstructionMarker({ incident, zoom = 14 }: { incident: ConstructionIncident; zoom?: number }) {
   const age = daysAgo(incident.filing_date);
   const scale = markerScale(zoom);

   const tooltipContent = (
      <div
         className="w-48 rounded-xl px-3 py-2.5 text-xs border border-zinc-700/70 shadow-2xl"
         style={{
            backgroundColor: "rgba(24,24,27,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
         }}
      >
         <p className="font-semibold text-yellow-300 leading-snug">{incident.job_type}</p>
         <p className="text-zinc-400 mt-0.5">{incident.filing_status}</p>
         {incident.borough && <p className="text-zinc-500 mt-0.5">{incident.borough}</p>}
         {age && <p className="text-zinc-500 mt-0.5">Filed {age}</p>}
         <p className="text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-800">NYC Open Data · ~5 day lag</p>
      </div>
   );

   return (
      <Marker latitude={incident.lat} longitude={incident.lng} anchor="center">
         <Tooltip content={tooltipContent} position="top" offset={10}>
            <div
               className="relative cursor-pointer"
               style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
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
            </div>
         </Tooltip>
      </Marker>
   );
}
