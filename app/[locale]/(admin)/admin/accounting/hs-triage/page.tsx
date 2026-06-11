/**
 * /admin/accounting/hs-triage — GAP 5 (owner 2026-06-12): the CS HS-triage
 * queue. Lists per-line items (forwarder + shop) with no HS code yet so CS
 * enters the HS BEFORE Pricing costs the order (the ground-truth cargo flow).
 *
 * CS-gated (super/sales/sales_admin/ops · the action re-checks). Writes ONLY
 * tb_*.hs_code (§0e); the Pricing cost editor + the cargo ใบขน read it downstream.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { listHsTriage } from "@/actions/admin/hs-triage";
import { HsTriageClient } from "./hs-triage-client";
import { Link } from "@/i18n/navigation";
import { BookMarked } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HsTriagePage() {
  await requireAdmin(["super", "sales", "sales_admin", "ops"]);
  const res = await listHsTriage(150);
  const data = res.ok && res.data ? res.data : { forwarderLines: [], shopLines: [] };

  return (
    <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">คิวกรอก HS Code (CS)</h1>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            รายการที่ <b>ยังไม่มี HS Code</b> — CS กรอกก่อน Pricing คิดต้นทุน · กรอกแล้วระบบนำไปใช้ใน
            ใบขน/ต้นทุนอัตโนมัติ (Pricing เห็นเลย). พิมพ์เลข HS แล้วระบบดึงอากรจาก <b>คลัง HS</b> ให้ดู.
          </p>
        </div>
        <Link
          href="/admin/accounting/hs-library"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
        >
          <BookMarked className="h-3.5 w-3.5" /> คลัง HS (อากร)
        </Link>
      </header>

      {!res.ok && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          โหลดคิวไม่สำเร็จ: {res.error}
        </p>
      )}

      <HsTriageClient forwarderLines={data.forwarderLines} shopLines={data.shopLines} />
    </main>
  );
}
