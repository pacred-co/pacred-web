"use client";

/**
 * Mark-ordered form (hstatus '3' → '4') · P0-13 Phase 1.
 *
 * Mounted in legacy-view.tsx ONLY when hstatus = '3' (สั่งสินค้าแล้ว →
 * รอจีนจัดส่ง). Calls `adminMarkShopOrderOrdered` to:
 *   - UPDATE tb_order.cshippingnumber for every line (legacy update3 per-shop)
 *   - UPDATE tb_header_order: hstatus='4', hdate4=now, hdateupdate, adminidupdate,
 *     hnote appended with "[ORDERED] cshippingnumber=…"
 *   - Notify (3-CH: in-app + LINE OA + email)
 *
 * Admin pastes the China shop order # (cshippingnumber) — that gets written
 * across all tb_order lines for this hNo so they're queryable in legacy
 * reports. The flag transition gates auto-spawn (Phase 1 #3) which only
 * fires when hstatus=4.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import {
  adminMarkShopOrderOrdered,
  adminSpawnForwarderFromShopOrder,
} from "@/actions/admin/service-orders-shop-workflow";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function AdminMarkShopOrderOrderedForm({ hNo }: { hNo: string }) {
  const router = useRouter();
  const [cShippingNumber, setCShippingNumber] = useState<string>("");
  const [chnNote, setChnNote] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);

    const ship = cShippingNumber.trim();

    startTransition(async () => {
      if (
        !(await confirm(
          ship.length > 0
            ? `ยืนยันสั่งซื้อ + เปลี่ยนสถานะเป็น "รอจีนจัดส่ง" (3→4)?\nจะเขียนเลขสั่งซื้อ "${ship}" ลงทุกรายการ + แจ้งลูกค้า`
            : `ยืนยันสั่งซื้อครบทุกร้าน + เปลี่ยนสถานะเป็น "รอจีนจัดส่ง" (3→4)?\nใช้เลขสั่งซื้อ ราย ร้าน ที่กรอกไว้ด้านบน + แจ้งลูกค้า`,
        ))
      )
        return;
      const res = await adminMarkShopOrderOrdered({
        hNo,
        cshippingnumber: ship,   // "" → flip-only (per-shop numbers kept)
        hnotechn:        chnNote.trim().length > 0 ? chnNote : undefined,
      });
      if (res.ok) {
        const rows = res.data?.rows_updated ?? 0;
        setMsg(
          ship.length > 0
            ? `✅ บันทึกเลขสั่งซื้อจีน — อัพเดท ${rows} รายการ · เปลี่ยนเป็น "รอจีนจัดส่ง" · แจ้งลูกค้าแล้ว`
            : `✅ เปลี่ยนสถานะเป็น "รอจีนจัดส่ง" (ใช้เลขสั่งซื้อ ราย ร้าน) · แจ้งลูกค้าแล้ว`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-sm space-y-3"
    >
      <div>
        <h3 className="font-bold text-sm">ยืนยันสั่งซื้อครบ → รอจีนจัดส่ง (3→4)</h3>
        <p className="text-xs text-muted mt-0.5">
          กรอกเลขสั่งซื้อ + tracking ราย ร้าน ที่แผง &ldquo;ข้อมูลร้านค้าจีน&rdquo; ด้านบนก่อน
          แล้วกดปุ่มนี้เพื่อเปลี่ยนสถานะเป็น &ldquo;รอจีนจัดส่ง&rdquo; + แจ้งลูกค้า 3 ช่องทาง
          (ช่องด้านล่างใช้กรณีอยากใส่เลขเดียวกันทุกร้านแบบเร็ว ๆ)
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium">เลขสั่งซื้อร้านจีน (ใช้ค่าเดียวทุกร้าน · ไม่บังคับ)</span>
        <input
          type="text"
          value={cShippingNumber}
          onChange={(e) => setCShippingNumber(e.target.value)}
          className={inputCls}
          placeholder="เว้นว่างถ้ากรอกราย ร้านด้านบนแล้ว"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ จีน (optional)</span>
        <textarea
          rows={2}
          value={chnNote}
          onChange={(e) => setChnNote(e.target.value)}
          className={inputCls}
          placeholder="เช่น สีไม่ตรง · ขาดของบางรายการ — เพื่อบันทึกใน hnote"
        />
      </label>

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "กำลังบันทึก..." : "📦 ยืนยันสั่งซื้อครบ → รอจีนจัดส่ง + แจ้งลูกค้า"}
      </Button>

      <p className="text-[11px] text-muted leading-relaxed">
        ✅ UPDATE tb_order.cshippingnumber (ทุกแถว) · UPDATE tb_header_order: hstatus=4 · hdate4 · adminidupdate
        · 3-CH NOTIFY (in-app + LINE OA + email)
      </p>
    </form>
  );
}

/**
 * Spawn-to-completed button (hstatus '4' → '5') · P0-13 Phase 1.
 *
 * Mounted in legacy-view.tsx ONLY when hstatus = '4' (รอจีนจัดส่ง →
 * สำเร็จ + เปิดใบฝากนำเข้า). Calls `adminSpawnForwarderFromShopOrder` to:
 *   - Expand tb_order tracking lines (cnameshop, cshippingnumber, ctrackingnumber)
 *     into per-shop tb_forwarder rows (delegates to spawn-form's underlying
 *     `spawnForwardersFromShopOrder` action)
 *   - Carry tb_promotion rows: for every existing tb_promotion (promoid, hno)
 *     INSERT new (promoid, fid=newFno, hno) idempotently
 *   - UPDATE tb_header_order: hstatus='5', hdate5=now
 *   - Notify (2-CH wired: in-app + LINE OA + email · SMS flagged P1-11)
 *
 * Admin presses ONE button after goods physically arrive at the China
 * warehouse and tracking is all filled in — closes the customer's shop
 * order + opens parallel fwd order(s) for the import-leg.
 */

export function AdminSpawnToCompletedButton({ hNo }: { hNo: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSpawn() {
    setMsg(null);
    setError(null);
    if (
      !(await confirm(
        `ส่งเข้าโกดังจีน + สร้างใบฝากนำเข้าจาก ${hNo}?\nจะ:\n` +
          `- สร้าง tb_forwarder ทุก tracking ใน tb_order\n` +
          `- ถ่ายโอน tb_promotion (ถ้ามีโปรค้างไว้บนออเดอร์)\n` +
          `- ปิดออเดอร์ → "สำเร็จ" (hstatus=5)\n` +
          `- แจ้งลูกค้า in-app + LINE OA + email`,
      ))
    ) {
      return;
    }
    startTransition(async () => {
      const res = await adminSpawnForwarderFromShopOrder({ hNo });
      if (res.ok) {
        const created = res.data?.created ?? 0;
        const skipped = res.data?.skipped ?? 0;
        const promo = res.data?.promo_rows_carried ?? 0;
        const flipped = res.data?.status_flipped ?? false;
        const fnos = (res.data?.spawned_fnos ?? []).map((id) => `#${id}`).join(", ");
        setMsg(
          `✅ เปิดใบฝากนำเข้าเรียบร้อย — สร้าง ${created} ใหม่ · ข้าม ${skipped} (มีอยู่แล้ว) · ` +
            `ถ่ายโอนโปรโม ${promo} แถว · ${flipped ? "ปิดออเดอร์ → สำเร็จ" : "เปลี่ยนสถานะค้าง"}` +
            (fnos ? ` · ${fnos}` : ""),
        );
        router.refresh();
        setTimeout(() => setMsg(null), 8000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 shadow-sm space-y-3">
      <div>
        <h3 className="font-bold text-sm">ส่งเข้าโกดังจีน + สร้างใบฝากนำเข้า (Tab 5 · 4→5)</h3>
        <p className="text-xs text-muted mt-0.5">
          เมื่อสินค้าถึงโกดังจีนทุกรายการ — กดเพื่อเปิดใบฝากนำเข้า + ปิดออเดอร์ฝากสั่ง
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      <button
        type="button"
        onClick={onSpawn}
        disabled={pending}
        className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 w-full"
      >
        {pending ? "กำลังประมวลผล..." : "📦 ส่งเข้าโกดังจีน + สร้างใบฝากนำเข้า"}
      </button>

      <p className="text-[11px] text-muted leading-relaxed">
        ✅ INSERT tb_forwarder (idempotent) · INSERT tb_promotion carry · UPDATE tb_header_order: hstatus=5 · hdate5
        · 2-3 CH NOTIFY (in-app + LINE OA + email · SMS flagged P1-11)
      </p>
    </div>
  );
}
