/**
 * /admin/accounting/ap/new — create an AP disbursement REQUEST (ขอเบิก).
 *
 * Spec §4 + §5 (Slice 2 request path): writes ONLY the ap_disbursement row as
 * transfer_status='requested' — a record of intent, no money moves. Reachable
 * §0d from the list page header ("+ เพิ่มคำขอเบิก").
 *
 * Auth — finance-only: accounting + super + ultra (RLS mirror mig 0239).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { ApCreateForm } from "./ap-create-form";

export const dynamic = "force-dynamic";

export default async function NewApRequestPage() {
  await requireAdmin(["accounting"]); // super + ultra admitted via isGodRole

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/ap" />
      <main className="space-y-5 p-6 lg:p-8">
        <PageHeader
          eyebrow="ADMIN · ACCOUNTING · AP"
          title="เพิ่มคำขอเบิก (ขอเบิก)"
          subtitle="บันทึกคำขอเบิกเงิน (money-OUT) — เป็นการบันทึกเจตนา ยังไม่ตัดจ่าย"
          actions={
            <Link
              href="/admin/accounting/ap"
              className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ← กลับรายการ
            </Link>
          }
        />
        <ApCreateForm />
      </main>
    </>
  );
}
