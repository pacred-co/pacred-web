"use client";

/**
 * 🪵 ราคาลังไม้ (ตีลังไม้) — a DEDICATED, prominent crate-price box (ภูม 2026-07-01).
 *
 * THE problem it fixes: when a customer chose ตีลังไม้ (crate === "1"), the only
 * place to enter the crate cost was buried in the left-column "การตีลังไม้"
 * inline-edit row — so staff instead folded the crate cost into ค่าส่งจีน
 * (cshippingchn) on the items, mixing two different charges. This box sits right
 * BELOW the รายการสินค้า section so staff enter the crate price SEPARATELY.
 *
 * Writes ONLY tb_header_order.pricecrate via the existing `adminUpdateOrderCrate`
 * (a COST/charge field carried to tb_forwarder.pricecrate on spawn — NOT part of
 * the ฝากสั่งซื้อ SELL total, so it never moves the customer's charge). Explicit
 * บันทึก button (edit-mode · §0f) · no status gate (legacy update_crate had none).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { adminUpdateOrderCrate } from "@/actions/admin/service-orders-header-edits";

export function CratePriceBox({
  hNo,
  pricecrate,
}: {
  hNo: string;
  pricecrate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(String(pricecrate ?? 0));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const saved = Number(pricecrate ?? 0);
  const current = Number(val) || 0;
  const dirty = current !== saved;

  function save() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminUpdateOrderCrate({ h_no: hNo, crate: "1", pricecrate: current });
      if (res.ok) {
        setMsg("บันทึกราคาลังไม้แล้ว");
        router.refresh();
      } else {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-200 text-amber-800">
          <Package className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-bold text-sm text-foreground">🪵 ราคาลังไม้ (ตีลังไม้)</h2>
          <p className="text-[11px] text-amber-800">
            ลูกค้าเลือก “ตีลังไม้” — ใส่ค่าลังไม้แยกตรงนี้ ไม่ต้องรวมในค่าส่งจีน
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-[11px] text-muted">ราคาค่าลังไม้ (บาท) · ไม่กระทบยอดที่ลูกค้าจ่าย</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            disabled={pending}
            className="w-40 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-right text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-60"
            placeholder="0.00"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกราคาลังไม้"}
        </button>
        <span className="text-xs text-muted">
          ปัจจุบัน: <span className="font-mono tabular-nums font-semibold text-foreground">฿{saved.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
      </div>

      {msg && <p className="text-xs text-emerald-700">✓ {msg}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </section>
  );
}
