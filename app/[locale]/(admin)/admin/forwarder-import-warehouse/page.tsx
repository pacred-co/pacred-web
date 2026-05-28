import { redirect } from "next/navigation";

/**
 * /admin/forwarder-import-warehouse — legacy URL redirect
 *
 * The Wave 1 stub at this path duplicated the full Wave 12 faithful port
 * at /admin/forwarders/warehouse-history (date range filter, orphan +
 * matched dual-table, relink modal, etc.). Wave 16 P0-4 collapsed the
 * stub into this server-side redirect so legacy PHP links + old
 * bookmarks (`pcs-admin/forwarder-import-warehouse.php`) land on the
 * faithful page. Internal Pacred navigation now links directly to
 * /admin/forwarders/warehouse-history.
 *
 * Preserves any incoming search params (e.g. `?date=YYYY-MM-DD`).
 */

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function ForwarderImportWarehouseRedirect({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    } else {
      qs.set(k, v);
    }
  }
  const tail = qs.toString();
  redirect(`/admin/forwarders/warehouse-history${tail ? `?${tail}` : ""}`);
}
