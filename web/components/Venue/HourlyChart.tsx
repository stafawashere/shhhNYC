"use client";

import {
   BarChart,
   Bar,
   XAxis,
   YAxis,
   Tooltip,
   ResponsiveContainer,
   Cell,
} from "recharts";

interface HourSlot {
   hour: number;
   busyness: number;
}

interface Props {
   data: HourSlot[];
   currentHour?: number;
}

function hourLabel(h: number): string {
   if (h === 0) return "12a";
   if (h === 12) return "12p";
   return h < 12 ? `${h}a` : `${h - 12}p`;
}

function busynessColor(v: number): string {
   if (v <= 20) return "#10b981";
   if (v <= 40) return "#22c55e";
   if (v <= 60) return "#eab308";
   if (v <= 75) return "#f97316";
   return "#ef4444";
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: number }) => {
   if (!active || !payload?.length) return null;
   const v = payload[0].value;
   return (
      <div className="bg-zinc-800 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg">
         <div className="font-semibold">{hourLabel(label ?? 0)}</div>
         <div className="text-zinc-300">Busyness {v}%</div>
      </div>
   );
};

export default function HourlyChart({ data, currentHour }: Props) {
   if (!data.length) return null;

   return (
      <ResponsiveContainer width="100%" height={100}>
         <BarChart data={data} barCategoryGap="20%" margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
            <XAxis
               dataKey="hour"
               tickFormatter={hourLabel}
               tick={{ fontSize: 10, fill: "#71717a" }}
               axisLine={false}
               tickLine={false}
               interval={2}
            />
            <YAxis hide domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="busyness" radius={[3, 3, 0, 0]}>
               {data.map((entry) => (
                  <Cell
                     key={entry.hour}
                     fill={busynessColor(entry.busyness)}
                     opacity={entry.hour === currentHour ? 1 : 0.55}
                     stroke={entry.hour === currentHour ? "#fff" : "none"}
                     strokeWidth={1}
                  />
               ))}
            </Bar>
         </BarChart>
      </ResponsiveContainer>
   );
}
