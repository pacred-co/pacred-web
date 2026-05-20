/**
 * /admin/warehouse/containers — TOMBSTONE (Option C, ภูม 2026-05-20 ค่ำ).
 *
 * The "spine" page (formerly T-P2 / CT-4 redesign of the container list
 * with status enum packing/sealed/in_transit/arrived/unloading/closed
 * and the cargo_containers/cargo_shipments tables) was rejected by ภูม
 * on 2026-05-20 ค่ำ for diverging from legacy `report-cnt.php` — no
 * 11-button top menu, no รอเข้าโกดังไทย/เข้าโกดังไทยแล้ว split,
 * no ต้นทุน/ราคาขาย/กำไร columns, no ทำรายการจ่ายเงินตู้ flow.
 *
 * Per Option C ("replace spine wholesale with faithful port"), the
 * canonical รายการตู้ page now lives at `/admin/report-cnt` — a
 * faithful port of legacy `member/pcs-admin/report-cnt.php` (2487 LOC)
 * reading `tb_forwarder` directly with GROUP BY fCabinetNumber.
 *
 * The old spine table (`cargo_containers`/`cargo_shipments` from
 * migration 0033) still exists for the in-flight scan/sack/shipment
 * workflows that depend on it; the routes `/admin/warehouse/containers/[code]/*`
 * remain functional during transition but no longer reachable via the
 * sidebar. Final retirement of those routes lands in Wave 2 after
 * พี่เดฟ confirms which scan flows depend on the spine tables.
 *
 * Notify: see `docs/runbook/faithful-port-plan.md` for the Option C
 * decision record and the spine retirement plan.
 */

import { redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminWarehouseContainersTombstone() {
  // Same gate as the new home, so unauthenticated/non-admin still bounce.
  await requireAdmin(["super", "ops", "warehouse"]);
  const locale = await getLocale();
  redirect({ href: "/admin/report-cnt", locale });
}
