/**
 * /admin/billing-run/add — สร้างใบวางบิลใหม่ (R-2)
 *
 * Faithful port of legacy `hs-forwarder-invoice/add.php` (355 LOC):
 *   1. Select customer (only those with ≥1 fStatus=5 forwarder)
 *   2. AJAX-load buyer info (address, tel, credit terms) + eligible forwarder list
 *   3. Tick the forwarders to bill on THIS invoice
 *   4. Adjust CHN/TH/Other/Discount totals + due date + note
 *   5. Submit → INSERT tb_forwarder_invoice + items → redirect to /[id]
 *
 * The legacy was print-only — no DB persistence. R-2 adds tb_forwarder_invoice
 * (migration 0138). date_due defaults to today + 7 days (legacy has no per-customer
 * credit-DAYS column — the term lives per-order on tb_forwarder.fcreditdate, ADR-0023;
 * userCreditValue is the baht LIMIT, not a day count — so 7d is the intentional default).
 *
 * UI = pure Tailwind (Pacred design philosophy §0a — match legacy WORKFLOW,
 * not legacy chrome).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { listEligibleCustomers, resolveCabinetBillingTarget } from "@/actions/admin/billing-run";
import { BillingRunAddClient } from "./billing-run-add-client";

export const dynamic = "force-dynamic";

export default async function BillingRunAddPage({
  searchParams,
}: {
  searchParams: Promise<{ cabinet?: string; userid?: string; fids?: string }>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles create the
  // billing doc (mark-paid stays accounting-only).
  // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
  await requireAdmin(["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"]);

  const res = await listEligibleCustomers();
  const customers = res.ok ? res.data!.rows : [];

  // ภูม flag 2026-06-10 — when arrived from the "ตู้พร้อมวางบิล" ทำใบวางบิล button
  // (?cabinet=...), pre-fill the customer + their billable forwarders so the form
  // opens ready to confirm (not a blank page).
  let preselectUserid = "";
  let preselectForwarderIds: number[] = [];
  let preselectNote: string | null = null;
  const sp = await searchParams;
  const cabinetParam = sp.cabinet;
  // pop-spec #3 — the consolidation view's "วางบิลเดี่ยว →" link opens this form
  // pre-selected on the customer (แบบ 1: combine ALL their ready containers into one
  // bill). The customer must be an eligible one; the client ticks all their unbilled
  // rows by default (no forwarder preselect → all-unbilled). Cabinet param wins if both.
  const useridParam = (sp.userid ?? "").trim();
  if (!cabinetParam && useridParam && customers.some((c) => c.userid === useridParam)) {
    preselectUserid = useridParam;
    // G1 combo-flow (2026-07-08) — arrived from the ตรวจตู้ detail "→ ออกใบวางบิล"
    // button carrying the EXACT ticked forwarder ids (?fids=1,2,3). Pass them through
    // so the create-form pre-ticks EXACTLY those rows (carry-not-rederive: the ตรวจตู้
    // selection → the bill). The client's usePreselect ladder consumes
    // preselectForwarderIds (priority above the check-queue auto-tick). Cabinet param
    // still wins if both are present.
    const fids = (sp.fids ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 500);
    if (fids.length > 0) {
      preselectForwarderIds = fids;
      preselectNote = `📦 มาจากหน้าตรวจตู้ — ติ๊ก ${fids.length} รายการที่เลือกให้อัตโนมัติแล้ว · ตรวจสอบแล้วกด "สร้างใบวางบิล"`;
    } else {
      preselectNote = `👤 ลูกค้า ${useridParam} — ติ๊กรายการที่ยังไม่ออกใบวางบิลให้อัตโนมัติแล้ว (รวมทุกตู้เป็นใบเดียว) · ตรวจสอบแล้วกด "สร้างใบวางบิล"`;
    }
  }
  if (cabinetParam) {
    const cabinets = cabinetParam.split(",").map((c) => c.trim()).filter(Boolean);
    const t = await resolveCabinetBillingTarget(cabinets);
    if (t.ok && t.data) {
      const cabLabel = cabinets.join(", ");
      if (t.data.userid && t.data.customerCount === 1) {
        preselectUserid = t.data.userid;
        preselectForwarderIds = t.data.forwarderIds;
        preselectNote = `📦 ตู้ ${cabLabel} — เลือกลูกค้า + ${t.data.forwarderIds.length} รายการให้อัตโนมัติแล้ว · ตรวจสอบแล้วกด "สร้างใบวางบิล"`;
      } else if (t.data.customerCount > 1) {
        preselectNote = `📦 ตู้ ${cabLabel} มี ${t.data.customerCount} ลูกค้า — เลือกลูกค้าทีละราย (ใบวางบิล = 1 ใบต่อ 1 ลูกค้า)`;
      } else {
        preselectNote = `📦 ตู้ ${cabLabel} ยังไม่มีรายการสถานะ "ตรวจตู้แล้ว (fStatus=4) / รอชำระเงิน (fStatus=5)" — เลือกลูกค้าจากรายการด้านล่าง`;
      }
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>สร้างใบวางบิลใหม่ | PR Admin</title>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">สร้างใบวางบิลใหม่ (เฉพาะเครดิต / นิติบุคคล)</h1>
          <p className="text-xs text-muted mt-0.5">
            เลือกลูกค้า → เลือกรายการฝากนำเข้า (ตรวจตู้แล้ว/รอชำระเงิน) → ตั้งวันครบกำหนด → ออกใบวางบิล · แสดงเฉพาะลูกค้าเครดิต/นิติบุคคล (ลูกค้าเงินสดชำระเองที่พอร์ทัล)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/billing-run/consolidate" className="text-sm text-primary-600 hover:text-primary-700 underline-offset-2 hover:underline">
            ← กลับไปหน้ารวมวางบิล
          </Link>
          <Link href="/admin/billing-run" className="text-sm text-muted hover:text-foreground underline-offset-2 hover:underline">
            หน้ารายการ
          </Link>
        </div>
      </header>

      {!res.ok && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          ไม่สามารถโหลดรายชื่อลูกค้าได้: {res.error}
        </div>
      )}

      {res.ok && customers.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-700">
          <p className="text-sm font-medium">ไม่มีลูกค้าที่มีรายการรอออกใบวางบิล</p>
          <p className="text-xs mt-1">
            ใบวางบิลออกได้เฉพาะ <strong>ลูกค้าเครดิตเทอม หรือ นิติบุคคล</strong> ที่มีรายการฝากนำเข้ารอชำระ (fStatus=5 หรือเครดิตค้างชำระ) เท่านั้น · ลูกค้าเงินสดชำระค่าฝากนำเข้าเองผ่านพอร์ทัล (ตรวจสลิปที่ <strong>/admin/wallet</strong>)
          </p>
        </div>
      )}

      {preselectNote && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          {preselectNote}
        </div>
      )}

      {res.ok && customers.length > 0 && (
        <BillingRunAddClient
          customers={customers}
          preselectUserid={preselectUserid}
          preselectForwarderIds={preselectForwarderIds}
        />
      )}
    </main>
  );
}
