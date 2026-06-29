/**
 * /admin/accounting/hs-consult — G1: the ad-hoc PRE-ORDER HS/พิกัด consult queue.
 *
 * The #1 daily Doc-team loop: a Sale/CS posts a product PHOTO + Thai name → the
 * Doc role replies with HS / อากร% / ฟอร์มอี% / รหัสสถิติ / "ออกใบกำกับได้ไหม" +
 * the เลี่ยงพิกัด / license intel — BEFORE an order exists. Distinct from the
 * order-bound /admin/accounting/hs-triage queue (which assigns พิกัด onto
 * existing order lines).
 *
 * REUSE-SEARCH: submit + answer panels search the คลัง HS dictionary so a known
 * answer is found instantly. GROW-LIBRARY: an answer can be saved back into คลัง HS.
 * Reference/consult data only (§0e) — never a selling price / cost / order.
 *
 * Read-gated to the union of submit/answer/audit roles (the actions re-gate per
 * stage). §0c: the page tolerates a failed load with a banner.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { listHsConsultTickets } from "@/actions/admin/hs-consult";
import { HsConsultClient } from "./hs-consult-client";
import { Link } from "@/i18n/navigation";
import { ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HsConsultPage() {
  // READ = union of submit (sales/ops) + answer (doc/pricing/accounting) + audit
  // (manager). ultra/super are god via requireAdmin's isGodRole bypass.
  await requireAdmin([
    "super",
    "ultra",
    "manager",
    "sales",
    "sales_admin",
    "ops",
    "freight_import_doc",
    "freight_clearance_both",
    "pricing",
    "accounting",
  ]);

  const res = await listHsConsultTickets({ filter: "open", limit: 150 });
  const tickets = res.ok && res.data ? res.data : [];

  return (
    <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">ปรึกษาพิกัด HS (ก่อนออเดอร์)</h1>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            เซล/CS แนบ <b>รูปสินค้า + ชื่อไทย</b> → ฝ่ายเอกสารตอบ <b>HS · อากร% · ฟอร์มอี% · รหัสสถิติ ·
            ออกใบกำกับได้ไหม</b> + ข้อมูล <b>เลี่ยงพิกัด</b> (มอก/อย/ใบอนุญาต ฯลฯ) — ตอบ <b>ก่อนเปิดออเดอร์</b>.
            พิมพ์ชื่อ/เลข HS แล้วระบบดึงคำตอบเดิมจาก <b>คลัง HS</b> ให้ทันที. (สำหรับกรอกพิกัดในออเดอร์ที่มีแล้ว ดูที่ คิวกรอกพิกัด)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/accounting/hs-triage"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            <ClipboardList className="h-3.5 w-3.5" /> คิวกรอกพิกัด (ในออเดอร์)
          </Link>
          <Link
            href="/admin/accounting/hs-library"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            คลัง HS (อากร)
          </Link>
        </div>
      </header>

      {!res.ok && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          โหลดคิวไม่สำเร็จ: {res.error}
        </p>
      )}

      <HsConsultClient initialTickets={tickets} initialFilter="open" />
    </main>
  );
}
