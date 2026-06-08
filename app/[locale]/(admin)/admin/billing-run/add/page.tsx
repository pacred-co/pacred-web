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
 * (migration 0138). Customer-side juristic-credit-line awareness preserved
 * (date_due defaults to today + tb_users.userCreditValue).
 *
 * UI = pure Tailwind (Pacred design philosophy §0a — match legacy WORKFLOW,
 * not legacy chrome).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { listEligibleCustomers } from "@/actions/admin/billing-run";
import { BillingRunAddClient } from "./billing-run-add-client";

export const dynamic = "force-dynamic";

export default async function BillingRunAddPage() {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles create the
  // billing doc (mark-paid stays accounting-only).
  // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
  await requireAdmin(["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"]);

  const res = await listEligibleCustomers();
  const customers = res.ok ? res.data!.rows : [];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>สร้างใบวางบิลใหม่ | PR Admin</title>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">สร้างใบวางบิลใหม่</h1>
          <p className="text-xs text-muted mt-0.5">
            เลือกลูกค้า → เลือกรายการฝากนำเข้า (fStatus=5) → ตั้งวันครบกำหนด → ออกใบวางบิล
          </p>
        </div>
        <Link href="/admin/billing-run" className="text-sm text-muted hover:text-foreground underline-offset-2 hover:underline">
          ← กลับหน้ารายการ
        </Link>
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
            ใบวางบิลออกได้เฉพาะรายการฝากนำเข้าที่อยู่ในสถานะ <strong>รอชำระเงิน (fStatus=5)</strong> เท่านั้น
          </p>
        </div>
      )}

      {res.ok && customers.length > 0 && (
        <BillingRunAddClient customers={customers} />
      )}
    </main>
  );
}
