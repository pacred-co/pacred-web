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
import { GuideNote } from "@/components/ui/guide-note";
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
            <strong>อัปไฟล์ PDF ใบแจ้งหนี้ที่ MOMO (ฮุย ไท่ต๋า) ส่งมาได้เลย</strong> →{" "}
            <strong>ตรวจเทียบกับระบบ</strong> → กด <strong>“บันทึกต้นทุน”</strong> (ทีละรายการ หรือทั้งหมด) →{" "}
            กด <strong>“ตัดจ่ายบิล”</strong> (ทีละรายการ หรือทั้งบิล) → ระบบออกเลขเอกสารตัดจ่าย + เก็บประวัติ + แนบสลิปย้อนหลังได้.
            MOMO วางบิลมาเป็น <strong>แทรคกิ้ง</strong> (บางบิลมีหลายตู้) — ระบบจึงตัดจ่ายเป็น <strong>บิล</strong> ไม่ใช่ทั้งตู้.
            เฉพาะสิทธิ์ ultra / accounting / pricing.
          </p>
        </div>
        <Link
          href="/admin/api-forwarder-momo/invoice-cost/history"
          className="shrink-0 rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-surface-alt"
        >
          📜 ประวัติการตัดจ่าย
        </Link>
      </header>

      {/* owner 2026-06-25 — กันงงเรื่อง "กดลงต้นทุนแล้วสถานะเด้งไปถึงโกดังจีน".
          อธิบายชัดว่าหน้านี้แตะแค่เงิน ไม่แตะสถานะ. */}
      <GuideNote variant="info" title="หน้านี้บันทึกแค่ “ต้นทุน” — ไม่เปลี่ยนสถานะ">
        ลงต้นทุนเฟรท = เงินที่เราจ่าย MOMO เท่านั้น · <strong>ไม่ทำให้สถานะรายการขยับ</strong>.
        สถานะ (เช่น “ถึงโกดังจีน”) <strong>อัปเดตอัตโนมัติจาก MOMO ทุก ~5 นาที</strong> เป็นคนละส่วนกัน —
        ถ้าเห็นสถานะขยับตอนลงต้นทุน คือ MOMO sync บังเอิญมาเวลาไล่เลี่ยกัน ไม่ใช่ผลจากการกดบันทึก.
      </GuideNote>

      {/* owner 2026-06-25 — เชื่อม flow: ลงต้นทุน (หน้านี้) → จ่าย MOMO (report-cnt).
          owner งงว่า "จ่ายตรงไหน" เพราะคนละหน้า.
          2026-07-17 — แก้ลิงก์ที่พาไป "ผิดแท็บ": ของเดิมส่ง `?actionPay=1` เฉยๆ → หน้ารายงานตู้
          default = แท็บ "รอเข้าโกดังไทย" แต่ตู้ที่ MOMO วางบิลมา **ถึงไทยแล้วเสมอ** (อยู่แท็บ
          "เข้าโกดังไทยแล้ว") → เปิดมาไม่เจอตู้ที่จะจ่าย (verified prod: ทั้ง 2 ตู้ของ
          INV-20260708-0002 อยู่แท็บ succeed). ตอนนี้ปุ่มต่อตู้ในตาราง "ตรวจต่อตู้" ด้านล่าง
          พาไปแท็บที่ถูก + ติ๊กตู้ให้เอง จึงชี้ให้ใช้ปุ่มนั้นแทนการไปไล่หาเอง. */}
      <GuideNote variant="tip" title="ขั้นต่อไป — ตัดจ่ายค่าตู้ (ใช้ปุ่มในตาราง “ตรวจต่อตู้”)">
        อัปใบแล้วเลื่อนลงไปที่ <strong>“ตรวจต่อตู้ — ใบนี้เรียกเก็บตู้ไหนบ้าง”</strong> → กด{" "}
        <strong>“→ ตัดจ่ายตู้นี้”</strong> ระบบจะเปิดหน้ารายการจ่ายเงินตู้ <strong>พร้อมติ๊กตู้ให้เลย</strong> →
        กด “💸 ทำรายการจ่ายเงินตู้” → แนบสลิป → อนุมัติที่{" "}
        <Link href="/admin/cnt-hs?q=1" className="font-semibold text-primary-600 underline hover:text-primary-700">
          /admin/cnt-hs
        </Link>.
        <br />
        ⚠️ <strong>ยอดที่ระบบเติมให้ในหน้าจ่าย = ต้นทุนที่ลงไว้ทั้งตู้</strong> ซึ่ง
        <strong>อาจมากกว่ายอดที่ใบรอบนี้เรียกเก็บ</strong> ถ้า MOMO ยังบิลตู้นั้นไม่ครบ —
        ให้ยึด <strong>“ใบรอบนี้เรียกเก็บ”</strong> ในตารางตรวจต่อตู้เป็นยอดจ่าย (ตารางบอกให้ทุกตู้แล้ว).
      </GuideNote>

      <MomoInvoiceCostClient />
    </main>
  );
}
