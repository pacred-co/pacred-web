import TrackingPage from "../_tracking/tracking-page";

export const dynamic = "force-dynamic";

/** /service-import/sea — เรือ. Filters tb_forwarder by container code
 *  prefix `GZS%`. */
export default function ServiceImportSeaPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  return <TrackingPage mode="sea" searchParams={searchParams} />;
}
