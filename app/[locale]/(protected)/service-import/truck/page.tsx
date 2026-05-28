import TrackingPage from "../_tracking/tracking-page";

export const dynamic = "force-dynamic";

/** /service-import/truck — รถ. Filters tb_forwarder by container code
 *  prefix `GZE%`. The whole UI lives in `_tracking/tracking-page.tsx`
 *  (shared by all mode routes). */
export default function ServiceImportTruckPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  return <TrackingPage mode="truck" searchParams={searchParams} />;
}
