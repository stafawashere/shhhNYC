"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import Map, { MapRef, Source, Layer, MapMouseEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { VenueWithScore, Incidents, SubwayStation, getIncidents, getSubwayStations } from "@/lib/api";
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
   if (ratio >= 0.8) return "No traffic";
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

const MTA_COLORS: Record<string, string> = {
   "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
   "4": "#00933C", "5": "#00933C", "6": "#00933C",
   "7": "#B933AD",
   "A": "#0039A6", "C": "#0039A6", "E": "#0039A6",
   "B": "#FF6319", "D": "#FF6319", "F": "#FF6319", "M": "#FF6319",
   "G": "#6CBE45",
   "J": "#996633", "Z": "#996633",
   "L": "#A7A9AC",
   "N": "#FCCC0A", "Q": "#FCCC0A", "R": "#FCCC0A", "W": "#FCCC0A",
   "S": "#808183",
   "SIR": "#1D6363",
};

function lineColor(line: string): string {
   return MTA_COLORS[line.toUpperCase()] ?? "#808183";
}

// Stable wrapper so the per-venue onClick arrow doesn't change on every render,
// letting React.memo on VenueMarker actually skip re-renders.
const MemoMarker = memo(function MemoMarker({
   venue,
   scale,
   onMarkerClick,
}: {
   venue: VenueWithScore;
   scale: number;
   onMarkerClick: (v: VenueWithScore) => void;
}) {
   const handleClick = useCallback(() => onMarkerClick(venue), [onMarkerClick, venue]);
   return (
      <VenueMarker
         data={venue}
         lat={venue.venue.lat!}
         lng={venue.venue.lng!}
         scale={scale}
         onClick={handleClick}
      />
   );
});

const FADE_MS = 180;

function AnimatedVenueCard({
   selected,
   onClose,
   onHeightChange,
}: {
   selected: VenueWithScore | null;
   onClose: () => void;
   onHeightChange: (h: number) => void;
}) {
   const [displayed, setDisplayed] = useState<VenueWithScore | null>(selected);
   const [visible, setVisible] = useState(!!selected);
   const innerRef = useRef<HTMLDivElement>(null);

   // Report the card's rendered pixel height whenever it mounts or resizes
   useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => onHeightChange(el.offsetHeight));
      ro.observe(el);
      onHeightChange(el.offsetHeight);
      return () => ro.disconnect();
   }, [displayed, onHeightChange]);

   useEffect(() => {
      if (!selected) {
         // closing — fade out then unmount
         const t1 = setTimeout(() => setVisible(false), 0);
         const t2 = setTimeout(() => setDisplayed(null), FADE_MS);
         return () => { clearTimeout(t1); clearTimeout(t2); };
      }

      if (displayed && displayed.venue.id !== selected.venue.id) {
         // switching venues — fade out, swap, fade in after two frames (content is sync)
         const t1 = setTimeout(() => setVisible(false), 0);
         const t2 = setTimeout(() => {
            setDisplayed(selected);
            requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
         }, FADE_MS);
         return () => { clearTimeout(t1); clearTimeout(t2); };
      }

      // fresh open
      const t = setTimeout(() => {
         setDisplayed(selected);
         requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      }, 0);
      return () => clearTimeout(t);
   }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

   if (!displayed) return null;

   return (
      <div
         className="absolute inset-0 pointer-events-none overflow-hidden"
         style={{
            transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
         }}
      >
         <div ref={innerRef} className="pointer-events-auto">
            <VenueCard key={displayed.venue.id} data={displayed} onClose={onClose} />
         </div>
      </div>
   );
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
   const rafRef = useRef<number | null>(null);
   const [cardHeight, setCardHeight] = useState(0);
   const [incidents, setIncidents] = useState<Incidents>({ construction: [], noise: [], events: [] });
   const [subwayStations, setSubwayStations] = useState<SubwayStation[]>([]);
   const [showTraffic, setShowTraffic] = useState(true);
   const [showSubway, setShowSubway] = useState(true);
   const [showConstruction, setShowConstruction] = useState(true);
   const [spinnerVisible, setSpinnerVisible] = useState(loading);
   const [spinnerMounted, setSpinnerMounted] = useState(loading);
   const [hoveredVenueId, setHoveredVenueId] = useState<string | null>(null);

   useEffect(() => {
      if (loading) {
         const t = setTimeout(() => {
            setSpinnerMounted(true);
            requestAnimationFrame(() => setSpinnerVisible(true));
         }, 0);
         return () => clearTimeout(t);
      } else {
         const t1 = setTimeout(() => setSpinnerVisible(false), 0);
         const t2 = setTimeout(() => setSpinnerMounted(false), 300);
         return () => { clearTimeout(t1); clearTimeout(t2); };
      }
   }, [loading]);
   const [hoveredStation, setHoveredStation] = useState<SubwayStation | null>(null);
   const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
   const scale = markerScale(zoom);

   useEffect(() => {
      getIncidents().then(setIncidents).catch(() => null);
      getSubwayStations().then(setSubwayStations).catch(() => null);
   }, []);

   const handleMarkerClick = useCallback((venue: VenueWithScore) => {
      const lat = venue.venue.lat;
      const lng = venue.venue.lng;
      if (lat && lng && mapRef.current) {
         const bottomPad = cardHeight > 0 ? cardHeight + 24 : 320;
         mapRef.current.easeTo({
            center: [lng, lat],
            padding: { top: 0, bottom: bottomPad, left: 0, right: 0 },
            duration: 400,
         });
      }

      // Select immediately so any existing card starts fading out right away.
      // Photos load in the background and appear naturally in the card.
      onSelect(venue);
   }, [onSelect, cardHeight]);

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
            coordinates: [geoCircle(v.venue.lat!, v.venue.lng!, 50)],
         },
      })),
   }), [trafficVenues]);

   // Only stations within ~500 m of a displayed venue or the map center
   const SUBWAY_RADIUS_DEG = 0.005; // ≈ 500 m
   const nearbyStations = useMemo(() => {
      const anchors = [
         ...venues.filter((v) => v.venue.lat && v.venue.lng).map((v) => ({ lat: v.venue.lat!, lng: v.venue.lng! })),
         { lat: centerLat, lng: centerLng },
      ];
      return subwayStations.filter((s) =>
         anchors.some((a) => Math.abs(s.lat - a.lat) < SUBWAY_RADIUS_DEG && Math.abs(s.lng - a.lng) < SUBWAY_RADIUS_DEG)
      );
   }, [subwayStations, venues, centerLat, centerLng]);

   const subwayGeoJson = useMemo(() => ({
      type: "FeatureCollection" as const,
      features: nearbyStations.map((s) => {
         const first = s.lines[0] ?? "S";
         const color = lineColor(first);
         return {
            type: "Feature" as const,
            properties: {
               name: s.name,
               lines: s.lines.join(","),
               firstLine: first,
               color,
               textColor: "#ffffff",
            },
            geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
         };
      }),
   }), [nearbyStations]);

   const handleMapMouseMove = useCallback((e: MapMouseEvent) => {
      if (rafRef.current !== null) return; // skip frame if previous one pending
      rafRef.current = requestAnimationFrame(() => {
         rafRef.current = null;
         const map = mapRef.current?.getMap();
         if (!map) return;
         setMousePos({ x: e.point.x, y: e.point.y });

      // Check subway stations first (higher priority for cursor)
      if (map.getLayer("subway-dots")) {
         try {
            const sf = map.queryRenderedFeatures(e.point, { layers: ["subway-dots", "subway-glass-fill", "subway-labels"] });
            if (sf.length > 0) {
               const props = sf[0].properties;
               const name = props?.name as string;
               const lines = (props?.lines as string ?? "").split(",").filter(Boolean);
               const geo = sf[0].geometry as unknown as { coordinates: [number, number] };
               setHoveredStation({ name, lat: geo.coordinates[1], lng: geo.coordinates[0], lines });
               setHoveredVenueId(null);
               map.getCanvas().style.cursor = "pointer";
               return;
            }
         } catch { /* ignore */ }
      }
      setHoveredStation(null);

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
      }); // end requestAnimationFrame
   }, []);

   const handleMapMouseLeave = useCallback(() => {
      setHoveredVenueId(null);
      setHoveredStation(null);
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
            attributionControl={false}
            onZoom={(e) => {
               const next = e.viewState.zoom;
               setZoom((prev) => markerScale(next) !== markerScale(prev) ? next : prev);
            }}
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
                        "fill-opacity": 0.10,
                     }}
                  />
                  <Layer
                     id="traffic-halo-stroke"
                     type="line"
                     paint={{
                        "line-color": ["get", "color"],
                        "line-width": 1.5,
                        "line-opacity": 0.30,
                        "line-dasharray": [3, 3],
                     }}
                  />
               </Source>
            )}

            {showSubway && zoom >= 11 && subwayGeoJson.features.length > 0 && (
               <Source id="subway-stations" type="geojson" data={subwayGeoJson}>
                  {/* Frosted colored fill */}
                  <Layer
                     id="subway-glass-fill"
                     type="circle"
                     paint={{
                        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 5, 16, 7.5],
                        "circle-color": ["get", "color"],
                        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 14, 0.5],
                     }}
                  />
                  {/* Glass sheen overlay */}
                  <Layer
                     id="subway-dots"
                     type="circle"
                     paint={{
                        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 5, 16, 7.5],
                        "circle-color": "rgba(255,255,255,0.06)",
                        "circle-opacity": 1,
                        "circle-stroke-width": 0.75,
                        "circle-stroke-color": "rgba(255, 255, 255, 0.35)",
                        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 14, 0.7],
                     }}
                  />
                  {/* Line letter — only visible when large enough */}
                  <Layer
                     id="subway-labels"
                     type="symbol"
                     layout={{
                        "text-field": ["get", "firstLine"],
                        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
                        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 5.5, 16, 8],
                        "text-allow-overlap": true,
                        "text-ignore-placement": true,
                     }}
                     paint={{
                        "text-color": "#ffffff",
                        "text-halo-color": "rgba(0,0,0,0.2)",
                        "text-halo-width": 0.3,
                        "text-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 0.8],
                     }}
                  />
               </Source>
            )}

            {venues.map((v) => {
               if (!v.venue.lat || !v.venue.lng) return null;
               return (
                  <MemoMarker
                     key={v.venue.id}
                     venue={v}
                     scale={scale}
                     onMarkerClick={handleMarkerClick}
                  />
               );
            })}

            {showConstruction && nearbyConstruction.map((inc, i) => (
               <ConstructionMarker key={`c-${i}`} incident={inc} zoom={zoom} />
            ))}
         </Map>

         {hoveredStation && mousePos && (
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
                     whiteSpace: "nowrap",
                  }}
               >
                  <div className="text-zinc-200 font-medium" style={{ fontSize: 11 }}>{hoveredStation.name}</div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                     {hoveredStation.lines.map((line) => (
                        <span
                           key={line}
                           className="inline-flex items-center justify-center rounded font-bold"
                           style={{
                              backgroundColor: lineColor(line),
                              color: "#fff",
                              fontSize: 9,
                              width: 16,
                              height: 16,
                              lineHeight: 1,
                           }}
                        >
                           {line}
                        </span>
                     ))}
                  </div>
               </div>
            </div>
         )}

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

         {spinnerMounted && (
            <div
               className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-20"
               style={{ transition: "opacity 300ms ease", opacity: spinnerVisible ? 1 : 0, pointerEvents: spinnerVisible ? "auto" : "none" }}
            >
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

         <AnimatedVenueCard selected={selected} onClose={() => onSelect(null)} onHeightChange={setCardHeight} />

         {showIncidents && (nearbyConstruction.length > 0 || hasTrafficData || subwayStations.length > 0) && (
            <div
               className="absolute bottom-3 right-4 z-10 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl text-xs"
               style={{
                  backgroundColor: "rgba(24,24,27,0.8)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(63,63,70,0.5)",
                  position: "absolute",
               }}
            >
               {/* Live indicator badge — top-left corner, mirrors VenueMarker score badge style */}
               <div
                  className="absolute -top-[5px] -right-[5px] w-[12px] h-[12px] flex items-center justify-center rounded-full"
                  style={{
                     backgroundColor: "rgba(16,185,129,0.75)",
                     border: "1px solid rgba(110,231,183,0.4)",
                     backdropFilter: "blur(8px)",
                     WebkitBackdropFilter: "blur(8px)",
                     boxShadow: "0 2px 10px rgba(16,185,129,0.75), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
               >
                  <span
                     className="absolute inset-0 rounded-full animate-ping opacity-30 pointer-events-none"
                     style={{ backgroundColor: "#6ee7b7", animationDuration: "2s" }}
                  />
               </div>
               {hasTrafficData && (
                  <button
                     onClick={() => setShowTraffic((t) => !t)}
                     className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-left"
                  >
                     <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                        <span
                           className="w-3.5 h-3.5 rounded-full inline-block"
                           style={{
                              border: "2px dotted #6ee7b7",
                              opacity: showTraffic ? 1 : 0.35,
                           }}
                        />
                     </span>
                     <span className={showTraffic ? "" : "line-through opacity-40"}>Traffic congestion</span>
                  </button>
               )}
               {subwayStations.length > 0 && (
                  <button
                     onClick={() => setShowSubway((s) => !s)}
                     className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-left"
                  >
                     <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                        <span
                           className="inline-flex items-center justify-center rounded-full font-bold"
                           style={{
                              backgroundColor: "#FF6319",
                              color: "#fff",
                              fontSize: 8,
                              width: 14,
                              height: 14,
                              lineHeight: 1,
                              opacity: showSubway ? 1 : 0.35,
                           }}
                        >
                           F
                        </span>
                     </span>
                     <span className={showSubway ? "" : "line-through opacity-40"}>Subway stations</span>
                  </button>
               )}
               {nearbyConstruction.length > 0 && (
                  <button
                     onClick={() => setShowConstruction((c) => !c)}
                     className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors text-left"
                  >
                     <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                        <span
                           className="w-3 h-3 inline-block"
                           style={{
                              backgroundColor: "rgba(234,179,8,0.45)",
                              transform: "rotate(45deg)",
                              border: "1px solid rgba(253,224,71,0.5)",
                              opacity: showConstruction ? 1 : 0.35,
                           }}
                        />
                     </span>
                     <span className={showConstruction ? "" : "line-through opacity-40"}>
                        Construction ({nearbyConstruction.length})
                     </span>
                  </button>
               )}
            </div>
         )}
      </div>
   );
}
