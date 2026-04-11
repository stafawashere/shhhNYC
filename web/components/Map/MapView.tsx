"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { MapRef, Source, Layer, MapMouseEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { VenueWithScore, Incidents, getIncidents } from "@/lib/api";
import VenueMarker from "./VenueMarker";
import VenueCard from "@/components/Venue/VenueCard";
import { ConstructionMarker } from "./IncidentMarker";

interface Props {
   venues: VenueWithScore[];
   loading?: boolean;
   centerLat?: number;
   centerLng?: number;
   selected: VenueWithScore | null;
   onSelect: (v: VenueWithScore | null) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const CARD_HEIGHT_DEG = 0.008;

function markerScale(zoom: number): number {
   if (zoom >= 15) return 1.1;
   if (zoom >= 13) return 1.0;
   if (zoom >= 11) return 0.75;
   if (zoom >= 9)  return 0.55;
   return 0.4;
}

function congestionHex(ratio: number): string {
   if (ratio >= 0.8) return "#10b981";
   if (ratio >= 0.5) return "#eab308";
   if (ratio >= 0.3) return "#f97316";
   return "#ef4444";
}

function congestionLabel(ratio: number): string {
   if (ratio >= 0.8) return "Free flow";
   if (ratio >= 0.5) return "Moderate";
   if (ratio >= 0.3) return "Heavy";
   return "Severe";
}

function geoCircle(lat: number, lng: number, radiusM = 100, segments = 48): number[][] {
   const ring: number[][] = [];
   const rLat = radiusM / 111_320;
   const rLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
   for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * 2 * Math.PI;
      ring.push([lng + rLng * Math.cos(a), lat + rLat * Math.sin(a)]);
   }
   return ring;
}

export default function MapView({
   venues,
   loading = false,
   centerLat = 40.7282,
   centerLng = -73.9973,
   selected,
   onSelect,
}: Props) {
   const mapRef = useRef<MapRef>(null);
   const [zoom, setZoom] = useState(14);
   const [incidents, setIncidents] = useState<Incidents>({ construction: [], noise: [], events: [] });
   const [showTraffic, setShowTraffic] = useState(true);
   const [hoveredVenueId, setHoveredVenueId] = useState<string | null>(null);
   const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
   const scale = markerScale(zoom);

   useEffect(() => {
      getIncidents().then(setIncidents).catch(() => null);
   }, []);

   const handleMarkerClick = useCallback((venue: VenueWithScore) => {
      onSelect(venue);
      const lat = venue.venue.lat;
      const lng = venue.venue.lng;
      if (lat && lng && mapRef.current) {
         mapRef.current.easeTo({ center: [lng, lat - CARD_HEIGHT_DEG], duration: 350 });
      }
   }, [onSelect]);

   const showIncidents = zoom >= 12;
   const hasTrafficData = venues.some((v) => v.score.traffic_congestion !== null);

   const INCIDENT_RADIUS_DEG = 0.003;
   const nearbyConstruction = useMemo(() => {
      if (!showIncidents) return [];
      const venueLocs = venues.filter((v) => v.venue.lat && v.venue.lng).map((v) => ({ lat: v.venue.lat!, lng: v.venue.lng! }));
      return incidents.construction.filter((inc) =>
         venueLocs.some((v) => Math.abs(inc.lat - v.lat) < INCIDENT_RADIUS_DEG && Math.abs(inc.lng - v.lng) < INCIDENT_RADIUS_DEG)
      );
   }, [venues, incidents.construction, showIncidents]);

   const trafficVenues = useMemo(() =>
      venues.filter((v) => v.venue.lat && v.venue.lng && v.score.traffic_congestion !== null),
      [venues]
   );

   const trafficGeoJson = useMemo(() => ({
      type: "FeatureCollection" as const,
      features: trafficVenues.map((v) => ({
         type: "Feature" as const,
         properties: {
            color: congestionHex(v.score.traffic_congestion!),
            venueId: v.venue.id,
         },
         geometry: {
            type: "Polygon" as const,
            coordinates: [geoCircle(v.venue.lat!, v.venue.lng!, 100)],
         },
      })),
   }), [trafficVenues]);

   const handleMapMouseMove = useCallback((e: MapMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      setMousePos({ x: e.point.x, y: e.point.y });
      if (!map.getLayer("traffic-halo-fill")) {
         setHoveredVenueId(null);
         return;
      }
      try {
         const features = map.queryRenderedFeatures(e.point, { layers: ["traffic-halo-fill"] });
         if (features.length > 0) {
            const vid = features[0].properties?.venueId as string | undefined;
            setHoveredVenueId(vid ?? null);
            map.getCanvas().style.cursor = "pointer";
         } else {
            setHoveredVenueId(null);
            map.getCanvas().style.cursor = "";
         }
      } catch {
         setHoveredVenueId(null);
      }
   }, []);

   const handleMapMouseLeave = useCallback(() => {
      setHoveredVenueId(null);
      setMousePos(null);
      const canvas = mapRef.current?.getMap()?.getCanvas();
      if (canvas) canvas.style.cursor = "";
   }, []);

   const hoveredVenue = useMemo(
      () => trafficVenues.find((v) => v.venue.id === hoveredVenueId) ?? null,
      [trafficVenues, hoveredVenueId]
   );

   return (
      <div className="relative w-full h-full">
         <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: 14 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onZoom={(e) => setZoom(e.viewState.zoom)}
            onMouseMove={handleMapMouseMove}
            onMouseLeave={handleMapMouseLeave}
         >
            {showTraffic && showIncidents && trafficGeoJson.features.length > 0 && (
               <Source id="traffic-halos" type="geojson" data={trafficGeoJson}>
                  <Layer
                     id="traffic-halo-fill"
                     type="fill"
                     paint={{
                        "fill-color": ["get", "color"],
                        "fill-opacity": 0.18,
                     }}
                  />
                  <Layer
                     id="traffic-halo-stroke"
                     type="line"
                     paint={{
                        "line-color": ["get", "color"],
                        "line-width": 1.5,
                        "line-opacity": 0.55,
                        "line-dasharray": [3, 3],
                     }}
                  />
               </Source>
            )}

            {venues.map((v) => {
               if (!v.venue.lat || !v.venue.lng) return null;
               return (
                  <VenueMarker
                     key={v.venue.id}
                     data={v}
                     lat={v.venue.lat}
                     lng={v.venue.lng}
                     scale={scale}
                     onClick={() => handleMarkerClick(v)}
                  />
               );
            })}

            {nearbyConstruction.map((inc, i) => (
               <ConstructionMarker key={`c-${i}`} incident={inc} zoom={zoom} />
            ))}
         </Map>

         {hoveredVenue && mousePos && (
            <div
               className="fixed z-50 pointer-events-none"
               style={{ left: mousePos.x + 14, top: mousePos.y - 14, transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
               <div
                  className="rounded-lg px-2 py-1.5"
                  style={{
                     backgroundColor: "rgba(24,24,27,0.85)",
                     backdropFilter: "blur(16px)",
                     WebkitBackdropFilter: "blur(16px)",
                     border: "1px solid rgba(63,63,70,0.6)",
                     boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                     fontSize: 10,
                     whiteSpace: "nowrap",
                  }}
               >
                  <div className="text-zinc-500 font-medium" style={{ fontSize: 9 }}>Traffic Congestion</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                     <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: congestionHex(hoveredVenue.score.traffic_congestion!) }}
                     />
                     <span className="text-zinc-300 font-medium">
                        {congestionLabel(hoveredVenue.score.traffic_congestion!)}
                     </span>
                     <span className="text-zinc-500">
                        {Math.round(hoveredVenue.score.traffic_congestion! * 100)}%
                     </span>
                  </div>
               </div>
            </div>
         )}

         {loading && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-20">
               <div className="flex flex-col items-center gap-3 text-white">
                  <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span className="text-sm font-medium tracking-wide">Finding quiet spots…</span>
               </div>
            </div>
         )}

         {!loading && venues.length === 0 && (
            <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none z-10">
               <div className="bg-zinc-900/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg text-center border border-zinc-700">
                  <p className="text-sm font-semibold text-zinc-100">No venues match your filters</p>
                  <p className="text-xs text-zinc-500 mt-1">Try clearing a filter or zooming out</p>
               </div>
            </div>
         )}

         {selected && (
            <VenueCard data={selected} onClose={() => onSelect(null)} />
         )}

         {showIncidents && (nearbyConstruction.length > 0 || hasTrafficData) && (
            <div
               className="absolute bottom-6 right-4 z-10 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl text-xs"
               style={{
                  backgroundColor: "rgba(24,24,27,0.8)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(63,63,70,0.5)",
               }}
            >
               {hasTrafficData && (
                  <button
                     onClick={() => setShowTraffic((t) => !t)}
                     className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-left"
                  >
                     <span
                        className="w-8 h-2 shrink-0 rounded-sm inline-block"
                        style={{ background: "linear-gradient(to right, #10b981, #eab308, #ef4444)", opacity: showTraffic ? 1 : 0.35 }}
                     />
                     <span className={showTraffic ? "" : "line-through opacity-40"}>Traffic congestion</span>
                  </button>
               )}
               {nearbyConstruction.length > 0 && (
                  <div className="flex items-center gap-2 text-zinc-400">
                     <span
                        className="w-3 h-3 shrink-0 inline-block"
                        style={{
                           backgroundColor: "rgba(234,179,8,0.45)",
                           transform: "rotate(45deg)",
                           border: "1px solid rgba(253,224,71,0.5)",
                        }}
                     />
                     Construction ({nearbyConstruction.length})
                  </div>
               )}
               <p className="text-zinc-600 pt-1 border-t border-zinc-800">Live data</p>
            </div>
         )}
      </div>
   );
}
