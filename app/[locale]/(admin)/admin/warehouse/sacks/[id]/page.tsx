/**
 * /admin/warehouse/sacks/[id] — กระสอบรวม detail (READ-ONLY).
 *
 * `[id]` = the URL-encoded momo_sack_no (a sack has no numeric id — it's a group of
 * momo_import_tracks rows). Renders the sack header (container / transport / physical
 * totals / status) + the parcels inside (tracking · PR · CG · weight/cbm/qty · status).
 * MIRROR-ONLY — no add/remove/edit (Pacred mirrors MOMO, does not originate sacks).
 *
 * 🔒 Role-gated: super / warehouse / ops.
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSack } from "@/actions/admin/sack";
import { SackDetailClient } from "./sack-detail-client";

export const dynamic = "force-dynamic";

export default async function SackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "warehouse", "ops"]);
  const { id } = await params;
  const sackNo = decodeURIComponent(id ?? "").trim();
  if (!sackNo) notFound();

  const res = await getSack(sackNo);
  if (!res.ok || !res.data) notFound();

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="text-[11px] text-gray-400">
        <Link href="/admin/warehouse/sacks" className="hover:underline">
          กระสอบรวม
        </Link>{" "}
        / {res.data.sack.sack_no}
      </div>
      <SackDetailClient sack={res.data.sack} parcels={res.data.parcels} />
    </main>
  );
}
