import { getVenue } from "@/lib/api";
import VenueDetail from "@/components/Venue/VenueDetail";
import { notFound } from "next/navigation";

interface Props {
   params: Promise<{ id: string }>;
}

export default async function VenuePage({ params }: Props) {
   const { id } = await params;

   let data;
   try {
      data = await getVenue(id);
   } catch {
      notFound();
   }

   return <VenueDetail data={data} />;
}
