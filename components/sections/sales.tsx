import { SalesCarousel } from "@/components/ui/sales-carousel";
import { getActiveSalesReps } from "@/lib/admin/sales-roster";

// Server component — fetches the LIVE sales roster (SOT) and hands it to the
// client carousel. Adding/removing a rep is a toggle in
// /admin/admins/sales-team; this surface updates automatically (owner
// 2026-06-15 "ผูกกันหมดออโต้").
export async function Sales() {
  const reps = await getActiveSalesReps();
  if (reps.length === 0) return null;

  return (
    <section id="sales" className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <div className="mx-auto w-full max-w-[1120px]">
          <SalesCarousel reps={reps} />
        </div>
      </div>
    </section>
  );
}
