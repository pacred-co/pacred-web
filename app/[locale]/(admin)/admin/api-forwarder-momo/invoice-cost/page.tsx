/**
 * /admin/api-forwarder-momo/invoice-cost — MOMO supplier-invoice → cost ingestion.
 *
 * Upload a MOMO (ฮุย ไท่ต๋า) invoice PDF — or paste its text — → set
 * tb_forwarder.fcosttotalprice from the actual bill (the per-tracking "รวม (Total)" is
 * the real cost). Gated to the cost-visibility roles (ultra/accounting/pricing — NOT
 * super) since it edits money internals. Preview-before-apply; the action re-derives
 * from the uploaded bytes / pasted text server-side and writes cost only.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { Link } from "@/i18n/navigation";
import { MomoInvoiceCostClient } from "./invoice-cost-client";

export const dynamic = "force-dynamic";

export default async function MomoInvoiceCostPage() {
  const { roles } = await requireAdmin();
  if (!canViewCostProfit(roles)) notFound();

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/momo-containers" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">บิลต้นทุน MOMO</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · MOMO · บิลต้นทุน</p>
          <h1 className="mt-1 text-2xl font-bold">บิลต้นทุน MOMO — ตรวจ · บันทึกต้นทุน · ตัดจ่าย</h1>
          <p className="mt-1.5 text-sm text-muted">
            อัปไฟล์ PDF จาก MOMO → ตรวจเทียบกับระบบ → บันทึกต้นทุน → ตัดจ่ายบิล
          </p>
        </div>
        <Link
          href="/admin/api-forwarder-momo/invoice-cost/history"
          className="shrink-0 rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface-alt"
        >
          📜 ประวัติการตัดจ่าย
        </Link>
      </header>

      <MomoInvoiceCostClient />
    </main>
  );
}
