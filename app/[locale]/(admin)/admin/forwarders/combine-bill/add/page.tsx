/**
 * /admin/forwarders/combine-bill/add — "เพิ่มรายการรวมบิล"
 *
 * Wave 20 P1 (2026-05-26): UI rewrite ONLY — drop `.pcs-legacy` scope +
 * `<link>` to admin-base.css + Bootstrap-4 markup → Pacred Tailwind v4
 * (chrome modeled on `/admin/customers/transfer-rep/page.tsx`).
 *
 * Legacy source: `pcs-admin/forwarder-bill.php?page=add` (L393-541) —
 * ONE simple form: comma-separated list of `tb_forwarder.id` values +
 * submit button. POST fires `adminCreateCombineBill` (already wired in
 * `add-form.tsx` client island).
 *
 * Existing wired functionality preserved:
 *   - CombineBillAddForm — controlled input + adminCreateCombineBill +
 *     success window.alert + redirect-to-list. The form's Bootstrap-4
 *     class chrome renders unstyled here (no `.pcs-legacy` scope) but
 *     is fully functional; Wave 21 will restyle that island in Tailwind.
 *
 * Status:
 *   ✅ Tailwind chrome (breadcrumb + page header + card)
 *   ✅ requireAdmin role gate (super / ops / warehouse / accounting)
 *   ✅ Form wired to server action (existing — preserved as-is)
 *   ⏳ Wave 21: Tailwind restyle of the inner form island
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CombineBillAddForm } from "./add-form";

export const dynamic = "force-dynamic";

export default async function CombineBillAddPage() {
  // Legacy mutation gate — mirrors `canMutate` on the list page +
  // the legacy departmentKey gate at forwarder-bill.php L94.
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>/</span>
        <Link href="/admin/forwarders/combine-bill" className="hover:text-primary-600">
          ประวัติรายการรวมบิล
        </Link>
        <span>/</span>
        <span className="text-foreground">เพิ่มรายการ</span>
      </nav>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ฝากนำเข้า</p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการรวมบิล</h1>
        <p className="mt-1 text-sm text-muted">
          กรอกเลขที่ออเดอร์นำเข้าของลูกค้าคนเดียวกัน (คอมมาคั่น) เพื่อรวมเป็นบิลค่าส่งเดียว
        </p>
      </div>

      {/* Wave 20 status banner */}
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 20 P1 status:</span>{" "}
          ✅ Tailwind page chrome · breadcrumb · role gate · form wired ·{" "}
          <span className="opacity-75">
            ⏳ Wave 21: restyle form island (Bootstrap-4 → Tailwind), SweetAlert lift
          </span>
        </div>
      </div>

      {/* Form card — wraps the existing wired client island */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="text-center mb-4 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">กรอกเลขที่ออเดอร์</h2>
          <p className="text-xs text-muted">ตัวอย่าง: <span className="font-mono">1,5,6</span></p>
        </div>
        {/* Functional form lives in the existing client island.
            Wave 21 will restyle this island in Tailwind. */}
        <CombineBillAddForm />
      </div>

      {/* Help text */}
      <div className="max-w-2xl mx-auto text-xs text-muted space-y-1.5">
        <p className="font-medium text-foreground">หมายเหตุ:</p>
        <ul className="list-disc list-inside space-y-0.5 pl-2">
          <li>เลขที่ออเดอร์ที่ใส่ต้องเป็นของลูกค้าคนเดียวกัน (ระบบจะรวมบิลและคำนวณค่าส่งครั้งเดียว)</li>
          <li>คั่นแต่ละเลขด้วยเครื่องหมายคอมมา <span className="font-mono">,</span> โดยไม่ต้องเว้นวรรค</li>
          <li>เมื่อกดสร้างแล้วจะย้อนกลับมาที่หน้ารายการ พร้อมรายการใหม่อยู่ด้านบน</li>
        </ul>
      </div>
    </main>
  );
}
