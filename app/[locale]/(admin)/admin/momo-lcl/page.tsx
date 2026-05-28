import { requireAdmin } from "@/lib/auth/require-admin";
import { SackCheckForm } from "./search-form";

/**
 * D1 Gap #6 — admin tool for looking up a MOMO LCL sack.
 *
 * Legacy ground truth:
 *   backoffice.pcscargo.co.th/app/Controllers/Api/Routes/import-lcl-momo/check-tracks.php
 *
 * A warehouse / ops staffer pastes a MOMO sack code; we hit MOMO's sack API,
 * join the returned track list against tb_tmp_forwarder_item_momo, and
 * surface the matched cargo items with totals (CBM + weight) plus the raw
 * sack-info payload. Drives MOMO LCL receipt entry + invoice prep.
 *
 * The server action (`adminCheckMomoSack`) runs the auth + MOMO call + DB
 * join inside `withAdmin(["ops", "accounting"])`; this page just gates page-
 * level read access.
 */
export const dynamic = "force-dynamic";

export default async function AdminMomoLclPage() {
  // Page-level guard — any admin role can VIEW the form; the action enforces
  // ops/accounting before doing real work.
  await requireAdmin();

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ตรวจสอบ MOMO LCL Sack</h1>
        <p className="mt-1 text-sm text-muted">
          ดึงรายการ tracking ใน sack จาก MOMO + รวมยอด CBM / น้ำหนัก
          (จับคู่กับ <code className="font-mono text-xs">tb_tmp_forwarder_item_momo</code>)
        </p>
      </div>

      <SackCheckForm />
    </main>
  );
}
