"use client";

/**
 * U4-3a — Delivery acknowledgement panel (customer-self-serve).
 *
 * Renders on:
 *   /service-import/[fNo] when status='delivered' + acknowledged_at IS NULL
 *
 * NOTE (2026-05-30): the /service-order (ฝากสั่ง) ack flow was REMOVED — legacy
 * PCS has no customer-acknowledge-on-delivery for shop orders (admin flips
 * hStatus→'5' via pcs-admin shops/update5.php; customer never confirms receipt).
 * It was a Pacred-native enhancement writing the rebuilt empty `service_orders`
 * table — a silent dead-write (Potemkin). Deferred to Phase C.
 * ⚠️ The forwarder-side twin below is the SAME pattern (writes rebuilt
 * `forwarders`); flagged for the same removal once forwarder.ts is collision-free.
 *
 * Pressing the button calls the matching action (forwarder vs order) which
 * stamps acknowledged_at (now) + optional note. Idempotent — re-press returns
 * success with already_acked=true, UI then refreshes to read-only state.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { customerAcknowledgeForwarderDelivery } from "@/actions/forwarder";

type Props = {
  kind:   "forwarder";
  /** f_no for forwarder. */
  refNo:  string;
};

export function DeliveryAckPanel({ refNo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await customerAcknowledgeForwarderDelivery({
        f_no: refNo,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  return (
    <section className="rounded-2xl border-2 border-green-300 bg-green-50 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>✅</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-green-900 text-base">ของถึงครบแล้ว → กดยืนยันรับสินค้า</h3>
          <p className="text-sm text-green-800 mt-1">
            ตรวจสอบสินค้าที่ได้รับให้เรียบร้อย แล้วกด <strong>ยืนยันรับสินค้าครบถ้วน</strong> เพื่อปิดออเดอร์
            ถ้ามีอะไรไม่ครบหรือเสียหาย แจ้งทีมงานผ่าน LINE ก่อนกดได้ครับ
          </p>
        </div>
      </div>

      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>
      )}

      {open ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-green-900">โน้ตเพิ่มเติม (ถ้ามี)</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="เช่น ของครบดี / กล่อง 3 บุบเล็กน้อยแต่สินค้าครบ"
              className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
              disabled={pending}
            />
            <span className="text-[10px] text-green-700">{note.length}/500</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={fire} disabled={pending}>
              {pending ? "กำลังบันทึก..." : "📥 ยืนยันรับสินค้าครบถ้วน"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setOpen(false); setNote(""); setErr(null); }}
              disabled={pending}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)} disabled={pending}>
            📥 ยืนยันรับสินค้าครบถ้วน
          </Button>
        </div>
      )}
    </section>
  );
}

function translateError(code: string): string {
  switch (code) {
    case "not_signed_in":      return "กรุณาเข้าสู่ระบบใหม่";
    case "not_found":          return "ไม่พบรายการนี้";
    case "not_delivered_yet":  return "รายการนี้ยังไม่ถึงสถานะ ‘ส่งสำเร็จ’ — กดยืนยันไม่ได้";
    case "invalid_input":      return "ข้อมูลไม่ถูกต้อง — โน้ตยาวสูงสุด 500 ตัวอักษร";
    default:                   return code;
  }
}
