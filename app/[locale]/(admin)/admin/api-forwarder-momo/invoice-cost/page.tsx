/**
 * /admin/api-forwarder-momo/invoice-cost — MOMO supplier-invoice → cost ingestion.
 *
 * Paste a MOMO (ฮุย ไท่ต๋า) invoice → set tb_forwarder.fcosttotalprice from the
 * actual bill (the per-tracking "รวม (Total)" is the real cost). Gated to the
 * cost-visibility roles (ultra/accounting/pricing — NOT super) since it edits
 * money internals. Preview-before-apply; the action re-derives + writes cost only.
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
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ต้นทุนจากใบแจ้งหนี้</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · MOMO · INVOICE COST</p>
        <h1 className="mt-1 text-2xl font-bold">ลงต้นทุนจากใบแจ้งหนี้ MOMO</h1>
        <p className="mt-1.5 text-sm text-muted">
          นำใบแจ้งหนี้ที่ MOMO (ฮุย ไท่ต๋า) เรียกเก็บ Pacred มาลงเป็น <strong>ต้นทุนจริง</strong> ต่อแทรคกิ้ง
          ในระบบ — ตรงตามบิลผู้ขาย (แม่นกว่าเรทตั้งต้น 2,500/คิว ที่บางบรรทัดต่างออกไป).
          ตรวจตัวอย่างก่อนบันทึกเสมอ · เฉพาะสิทธิ์ ultra / accounting / pricing.
        </p>
      </header>

      <MomoInvoiceCostClient />
    </main>
  );
}
