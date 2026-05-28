import TrackingPage from "../_tracking/tracking-page";

export const dynamic = "force-dynamic";

/** /service-import/air — แอร์. Filters tb_forwarder by container code
 *  prefix `GZA%`. Currently no live customer data (ปอน 2026-05-28 —
 *  "มีแต่คือยังไม่มีลูกค้าใช้บริการ"); the empty-state UI handles that
 *  cleanly. Container-code prefix may evolve later — adjust MODE_META.air
 *  in `_tracking/tracking-page.tsx` if so. */
export default function ServiceImportAirPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  return <TrackingPage mode="air" searchParams={searchParams} />;
}
