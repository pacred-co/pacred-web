"use client";

/**
 * "ย้อนการชำระ" button (owner 2026-07-15 · PR178 → ยกเครื่อง 2026-07-28 · PR189).
 *
 * เดิมปุ่มนี้เรียกได้แต่ตัวเดี่ยว (adminReverseForwarderPayment) ซึ่ง REFUSE ชุดรวมสลิป
 * โดยดีไซน์ → เจ้าหน้าที่เจอทางตัน "ต้องให้บัญชีย้อนทั้งชุด" แต่**ไม่มีปุ่มย้อนทั้งชุดอยู่จริง**
 * (เคส PR189: ต้องเรียกเทคนิครันสคริปต์). ตอนนี้ปุ่มฉลาดขึ้น:
 *   1. กด → previewReversePaymentGroup (READ-ONLY) ดูว่าออเดอร์นี้อยู่ชุดรวมไหม
 *   2. ชุดเดี่ยว → confirm + ย้อนตัวเดี่ยว (พฤติกรรมเดิมเป๊ะ)
 *   3. ชุดรวม → confirm โชว์ **สมาชิกทุกออเดอร์ + ยอดรวมทั้งชุด** → ย้อนทั้งชุด
 * §0f: confirm ก่อน mutate เสมอ · เงิน → try/catch + รายงาน incidents (จอห้ามแตก).
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Undo2 } from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminReverseForwarderPayment } from "@/actions/admin/pay-user";
import {
  previewReversePaymentGroup,
  adminReverseForwarderPaymentGroup,
} from "@/actions/admin/pay-user-group-reverse";
import { describeActionDispatchError } from "@/lib/observability/action-dispatch-error";
import { isNextControlFlowError } from "@/lib/observability/next-control-flow";
import { reportClientIncident } from "@/lib/observability/client-report";

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

export function PayUserReverseButton({ fid }: { fid: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function reverseSingle() {
    const ok = await confirm(
      `ย้อนการชำระออเดอร์ฝากนำเข้า #${fid}?\n\n` +
        `• ยกเลิกการตัดจ่าย (สถานะการชำระ → ไม่สำเร็จ)\n` +
        `• ถอยสถานะออเดอร์กลับเป็น "รอชำระ/ใบแจ้งหนี้"\n` +
        `• คืนเงินเข้ากระเป๋าลูกค้า เฉพาะกรณีที่ตัดจากกระเป๋า (สลิปโอนตรงธนาคารจะไม่คืน)\n` +
        `• ยกเลิกใบเสร็จที่ออกให้ออเดอร์นี้ (เฉพาะใบที่ออกให้ออเดอร์นี้ใบเดียว)\n\n` +
        `ทำแล้วออเดอร์จะกลับมาเรียกเก็บเงินได้ใหม่`,
    );
    if (!ok) return;
    const res = await adminReverseForwarderPayment({ fid, reason: `ย้อนการชำระ #${fid} (จากหน้าจ่ายเงินแทนลูกค้า)` });
    if (!res.ok) {
      await alert(`ย้อนการชำระไม่สำเร็จ: ${res.error}`);
      return;
    }
    const d = res.data!;
    setDone(true);
    await alert(
      `ย้อนการชำระ #${fid} สำเร็จ\n` +
        (d.refunded > 0 ? `• คืนเงินเข้ากระเป๋า ฿${fmt(d.refunded)}\n` : `• ไม่มีการคืนเงิน (โอนตรงธนาคาร)\n`) +
        (d.forwarderReverted ? `• สถานะออเดอร์ถอยเป็น "รอชำระ/ใบแจ้งหนี้" แล้ว\n` : `• ออเดอร์อยู่สถานะรอชำระอยู่แล้ว\n`) +
        (d.receiptVoided ? `• ยกเลิกใบเสร็จ ${d.receiptVoided} แล้ว` : `• ไม่มีใบเสร็จให้ยกเลิก (หรือเป็นใบร่วมหลายออเดอร์)`),
    );
    router.refresh();
  }

  async function reverseGroup(p: {
    headerId: number;
    headerAmount: number;
    members: Array<{ fid: number; amount: number; tracking: string }>;
  }) {
    const lines = p.members
      .map((m) => `   • #${m.fid} (${m.tracking}) ฿${fmt(m.amount)}`)
      .join("\n");
    const ok = await confirm(
      `ออเดอร์ #${fid} ชำระรวมสลิปเดียวกับรายการอื่น — ต้องย้อน "ทั้งชุด" พร้อมกัน\n\n` +
        `ชุดเลขที่ #${p.headerId} · ยอดสลิปรวม ฿${fmt(p.headerAmount)}\n${lines}\n\n` +
        `• ยกเลิกการบันทึกชำระทุกออเดอร์ในชุด (เงินในบัญชีบริษัทไม่ขยับ — สลิปโอนตรงธนาคาร)\n` +
        `• ทุกออเดอร์ถอยกลับ "รอชำระ/ใบแจ้งหนี้" → บันทึกใหม่รวมสลิปใบเดียวได้\n` +
        `• ยกเลิกใบเสร็จที่ครอบเฉพาะออเดอร์ในชุดนี้\n\n` +
        `ยืนยันย้อนทั้งชุด?`,
    );
    if (!ok) return;
    const res = await adminReverseForwarderPaymentGroup({
      headerId: p.headerId,
      reason: `ย้อนทั้งชุด #${p.headerId} (จากหน้าจ่ายเงินแทนลูกค้า · ออเดอร์ #${fid})`,
    });
    if (!res.ok) {
      await alert(`ย้อนทั้งชุดไม่สำเร็จ: ${res.error}`);
      return;
    }
    const d = res.data!;
    setDone(true);
    await alert(
      `ย้อนทั้งชุด #${p.headerId} สำเร็จ\n` +
        `• ยกเลิกการบันทึกชำระ ${d.reversedPayRows} รายการ (ออเดอร์ ${d.fids.map((f) => `#${f}`).join(", ")})\n` +
        `• ทุกออเดอร์กลับมา "รอชำระ/ใบแจ้งหนี้" — บันทึกใหม่รวมสลิปใบเดียวได้เลย\n` +
        (d.receiptsVoided.length > 0 ? `• ยกเลิกใบเสร็จ ${d.receiptsVoided.join(", ")} แล้ว` : `• ไม่มีใบเสร็จให้ยกเลิก`),
    );
    router.refresh();
  }

  function onClick() {
    startTransition(async () => {
      // 🔴 เงิน: จับทุก throw — จอห้ามแตก + ต้องมีใบใน incidents เสมอ (คลาส reforder2
      // ที่ทำจอแตกทั้งหน้าเมื่อคืน 27/07 — ห้ามเกิดอีกไม่ว่า action พังด้วยอะไร)
      try {
        const preview = await previewReversePaymentGroup({ fid });
        if (!preview.ok) {
          await alert(`ย้อนการชำระไม่สำเร็จ: ${preview.error}`);
          return;
        }
        const p = preview.data!;
        if (p.kind === "single") {
          await reverseSingle();
          return;
        }
        if (p.blockReason) {
          await alert(`ย้อนไม่ได้: ${p.blockReason}`);
          return;
        }
        await reverseGroup({
          headerId: p.headerId!,
          headerAmount: p.headerAmount ?? 0,
          members: p.members ?? [],
        });
      } catch (e) {
        if (isNextControlFlowError(e)) throw e;
        await alert(describeActionDispatchError(e, { mutating: true }));
        void reportClientIncident(e as Error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || done}
        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="ย้อนการชำระ + ถอยสถานะ (ชุดรวมสลิป = ย้อนทั้งชุด)"
      >
        <Undo2 className="h-3 w-3" />
        {pending ? "กำลังย้อน…" : done ? "ย้อนแล้ว" : "ย้อนการชำระ"}
      </button>
      {dialogs}
    </>
  );
}
