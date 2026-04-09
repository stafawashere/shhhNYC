"use client";

export interface Filters {
   wifi: string;
   outlets: boolean;
   food: boolean;
   neighborhood: string;
}

interface Props {
   filters: Filters;
   neighborhoods: string[];
   onChange: (filters: Filters) => void;
}

export default function FilterBar({ filters, neighborhoods, onChange }: Props) {
   const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

   return (
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-100 text-sm flex-wrap">
         <select
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 bg-white"
            value={filters.neighborhood}
            onChange={(e) => set({ neighborhood: e.target.value })}
         >
            <option value="">All neighborhoods</option>
            {neighborhoods.map((n) => (
               <option key={n} value={n}>
                  {n}
               </option>
            ))}
         </select>

         <select
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 bg-white"
            value={filters.wifi}
            onChange={(e) => set({ wifi: e.target.value })}
         >
            <option value="">Any WiFi</option>
            <option value="fair">Fair+</option>
            <option value="good">Good+</option>
            <option value="excellent">Excellent</option>
         </select>

         <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer">
            <input
               type="checkbox"
               checked={filters.outlets}
               onChange={(e) => set({ outlets: e.target.checked })}
               className="rounded"
            />
            Outlets
         </label>

         <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer">
            <input
               type="checkbox"
               checked={filters.food}
               onChange={(e) => set({ food: e.target.checked })}
               className="rounded"
            />
            Food
         </label>
      </div>
   );
}
