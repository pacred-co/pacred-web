/**
 * /admin/billing-run/consolidate — รวมวางบิล — ตู้ที่ตรวจแล้ว (pop-spec #3)
 *
 * The accounting consolidation view (owner 2026-07-06 · SPEC §2 บัญชี
 * "consolidation view"). ONE page, two workflows:
 *   แบบ 1 (per-customer): combine ALL of a customer's ready containers into ONE
 *          bill → each row links to /admin/billing-run/add?userid=<uid> (the
 *          existing single-customer form does this — unchanged).
 *   แบบ 2 (batch): tick MANY fully-checked customers → issue one bill each, all
 *          at once, via createBatchBillingRunInvoices (which calls the money path
 *          createBillingRunInvoice — never re-implements the pricing).
 *
 * Owner rule: only containers "ตรวจมาแล้วอย่างดีจนครบ และ ทุกตู้ด้วย" (every cabinet
 * ครบ, no ขาด, no ฿0-transport, no missing ค่าส่งไทย) are auto-tickable; the rest are
 * shown but badged "ตรวจก่อน — วางบิลเดี่ยว".
 *
 * Server Component — loads the read-only rollup + hands it to the client island.
 * NO money math here; all ฿ come from listConsolidationCandidates (which rolls up
 * listEligibleForwarders' numbers).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { listConsolidationCandidates } from "@/actions/admin/billing-run";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { PageHeader } from "@/components/admin/page-header";

import { ConsolidateClient } from "./consolidate-client";

export const dynamic = "force-dynamic";

export default async function BillingRunConsolidatePage() {
  // Same gate as the billing-run list + /add (Doc roles can view + issue docs).
  await requireAdmin([
    "super",
    "accounting",
    "ops",
    "freight_export_doc",
    "freight_import_doc",
  ]);

  const res = await listConsolidationCandidates();
  const rows = res.ok ? res.data!.rows : [];

  return (
    <main className="space-y-5">
      <title>รวมวางบิล — ตู้ที่ตรวจแล้ว | PR Admin</title>

      <AccountingMenubar activeHref="/admin/billing-run" />

      <div className="px-4 md:px-6 lg:px-8 space-y-5">
        <div className="pt-4">
          <PageHeader
            eyebrow="ADMIN · รายรับ → ใบวางบิล"
            title="รวมวางบิล — ตู้ที่ตรวจแล้ว"
            subtitle="เลือกลูกค้าที่ตรวจตู้ครบทุกตู้แล้ว → วางบิลทีละหลายรายพร้อมกัน (แบบ 2) หรือกดวางบิลเดี่ยวเพื่อรวมทุกตู้ของลูกค้าเป็นใบเดียว (แบบ 1)"
            actions={
              <Link
                href="/admin/billing-run"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt"
              >
                ← กลับหน้ารายการใบวางบิล
              </Link>
            }
          />
        </div>

        {/* Help note — what "ตรวจแล้ว" means + the two workflows */}
        <section className="rounded-2xl border border-sky-200 bg-sky-50/40 dark:bg-sky-950/10 p-4 text-xs text-sky-800 space-y-1.5">
          <p>
            🧾 <strong>รวมวางบิล</strong> — หน้ารวมของบัญชี หลังตรวจตู้ทีละตู้แล้ว
            เลือกลูกค้าที่ <strong>สินค้าเข้าคลังไทยครบทุกตู้</strong> มาวางบิลพร้อมกัน (1 ใบต่อ 1 ลูกค้า).
          </p>
          <p>
            ✅ ลูกค้าที่ <strong>ตู้ครบทุกตู้ · มีค่าขนส่งครบ · มีค่าส่งไทยครบ</strong> จะติ๊กอัตโนมัติได้ ·
            ลูกค้าที่ยัง <strong className="text-amber-700">ขาด / ค่าขนส่ง ฿0 / ยังไม่กรอกค่าส่งไทย</strong> จะขึ้นป้าย
            <strong> “ตรวจก่อน — วางบิลเดี่ยว”</strong> → กดวางบิลเดี่ยวเพื่อแก้ทีละรายในฟอร์มปกติ.
          </p>
          <p>
            🔗 <Link href="/admin/report-cnt?page=succeed" className="text-sky-700 hover:underline">→ ดูตู้ที่ถึงไทยแล้ว (report-cnt)</Link>
          </p>
        </section>

        {!res.ok && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            ไม่สามารถโหลดข้อมูลได้: {res.error}
          </div>
        )}

        {res.ok && <ConsolidateClient rows={rows} />}
      </div>
    </main>
  );
}
