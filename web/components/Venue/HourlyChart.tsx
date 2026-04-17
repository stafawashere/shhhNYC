"use client";

import {
   BarChart,
   Bar,
   XAxis,
   YAxis,
   ReferenceLine,
   Tooltip,
   ResponsiveContainer,
   Cell,
} from "recharts";
import { busynessColor } from "@/lib/theme";

interface HourSlot {
   hour: number;
   busyness: number;
}

interface Props {
   data: HourSlot[];
   currentHour?: number;
   animationBegin?: number;
   openHours?: Set<number>;
}

function hourLabel(h: number): string {
   if (h === 0) return "12a";
   if (h === 12) return "12p";
   return h < 12 ? `${h}a` : `${h - 12}p`;
}

function barOpacity(hour: number, currentHour: number | undefined, openHours?: Set<number>): number {
   if (openHours && openHours.size > 0 && !openHours.has(hour)) return 0.08;
   if (currentHour === undefined) return 0.6;
   if (hour === currentHour) return 1;
   if (hour < currentHour) return 0.25;
   return 0.6;
}

const LABEL_HOURS = new Set([6, 8, 10, 12, 14, 16, 18, 20, 22]);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) => {
   if (!active || !payload?.length) return null;
   const v = payload[0].value;
   const color = busynessColor(v);
   const text = v <= 20 ? "Very quiet" : v <= 40 ? "Quiet" : v <= 60 ? "Moderate" : v <= 75 ? "Busy" : "Very busy";
   return (
      <div className="bg-zinc-800 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg border border-zinc-700/60">
         <div className="font-semibold mb-0.5">{hourLabel(label ?? 0)}</div>
         <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
            <span style={{ color }}>{text}</span>
            <span className="text-zinc-500 ml-1">{v}%</span>
         </div>
      </div>
   );
};

const CurrentHourTick = (props: { x?: number; y?: number; payload?: { value: number }; currentHour?: number }) => {
   const { x, y, payload, currentHour } = props;
   if (!payload || !LABEL_HOURS.has(payload.value)) return null;
   const isCurrent = payload.value === currentHour;
   return (
      <g>
         <text
            x={x}
            y={(y ?? 0) + 8}
            textAnchor="middle"
            fill={isCurrent ? "#fff" : "#71717a"}
            fontSize={10}
            fontWeight={isCurrent ? 700 : 400}
         >
            {hourLabel(payload.value)}
         </text>
      </g>
   );
};

export default function HourlyChart({ data, currentHour, animationBegin = 0, openHours }: Props) {
   if (!data.length) return null;

   const peak = Math.max(...data.map(d => d.busyness));
   const showPeakLine = peak >= 70;

   return (
      <div>
         <ResponsiveContainer width="100%" height={130}>
            <BarChart data={data} barCategoryGap="22%" margin={{ top: 12, right: 0, left: 0, bottom: 4 }}>
               <XAxis
                  dataKey="hour"
                  tick={({ x, y, payload }) => <CurrentHourTick x={typeof x === "number" ? x : undefined} y={typeof y === "number" ? y : undefined} payload={payload} currentHour={currentHour} />}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={24}
               />
               <YAxis hide width={0} domain={[0, 100]} />
               <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
               {showPeakLine && (
                  <ReferenceLine
                     y={75}
                     stroke="#ef4444"
                     strokeDasharray="3 3"
                     strokeOpacity={0.3}
                     label={{ value: "busy", position: "insideTopRight", fontSize: 9, fill: "#71717a", dy: -2 }}
                  />
               )}
               <Tooltip content={<CustomTooltip />} cursor={false} />
               <Bar dataKey="busyness" radius={[4, 4, 0, 0]} isAnimationActive animationBegin={animationBegin} animationDuration={600} animationEasing="ease-out">
                  {data.map((entry) => (
                     <Cell
                        key={entry.hour}
                        fill={busynessColor(entry.busyness)}
                        opacity={barOpacity(entry.hour, currentHour, openHours)}
                        stroke={entry.hour === currentHour ? "#fff" : "none"}
                        strokeWidth={1.5}
                     />
                  ))}
               </Bar>
            </BarChart>
         </ResponsiveContainer>
      </div>
   );
}
