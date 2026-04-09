"use client";

import { Marker } from "react-map-gl/mapbox";
import { VenueWithScore } from "@/lib/api";

interface Props {
   data: VenueWithScore;
   lat: number;
   lng: number;
   onClick: () => void;
}

const scoreColor = (score: number) => {
   if (score >= 80) return "bg-emerald-500";
   if (score >= 60) return "bg-green-400";
   if (score >= 40) return "bg-yellow-400";
   if (score >= 20) return "bg-orange-400";
   return "bg-red-500";
};

export default function VenueMarker({ data, lat, lng, onClick }: Props) {
   return (
      <Marker latitude={lat} longitude={lng} onClick={onClick}>
         <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md cursor-pointer hover:scale-110 transition-transform ${scoreColor(data.score.quiet_score)}`}
         >
            {data.score.quiet_score}
         </div>
      </Marker>
   );
}
