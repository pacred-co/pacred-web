"use client";

/**
 * <DeclarationFeePanel> — ค่าบริการออกใบขน quote (owner-confirmed AXELRA card · 2026-06-30).
 * Default tier = ขาประจำ (what we charge most); toggle to ราคาแรก for a new customer.
 * Form E + ลงทะเบียน(ครั้งเดียว) toggle on/off. Pure display/quote — no mutation;
 * the actual charge is issued through the existing billing paths.
 */

import { useState } from "react";
import {
  computeDeclarationFee,
  DECLARATION_FEE_TIER_LABEL,
  type DeclarationFeeTier,
} from "@/lib/customs/declaration-fees";

const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DeclarationFeePanel({
  defaultTier = "regular",
  defaultFormE = true,
}: {
  defaultTier?: DeclarationFeeTier;
  defaultFormE?: boolean;
}) {
  const [tier, setTier] = useState<DeclarationFeeTier>(defaultTier);
  const [withFormE, setWithFormE] = useState(defaultFormE);
  const [withReg, setWithReg] = useState(true);
  const quote = computeDeclarationFee(tier, { withFormE, withRegistration: withReg });

  return (
    <details className="group rounded-2xl border border-orange-200 bg-orange-50/30 dark:bg-surface shadow-sm">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 p-3.5 list-none">
        <span className="flex items-center gap-2 text-sm font-bold text-orange-800 dark:text-orange-300">
          <span className="text-muted transition-transform group-open:rotate-90">▶</span>
          🧾 ค่าบริการออกใบขน
          <span className="rounded-full bg-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
            ฿{baht(quote.total)}
          </span>
        </span>
        <span className="text-[11px] text-muted">{DECLARATION_FEE_TIER_LABEL[tier]}</span>
      </summary>

      <div className="px-3.5 pb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted">เรท:</span>
          {(["regular", "retail"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`rounded-full border px-2.5 py-1 font-medium ${
                tier === t ? "border-orange-500 bg-orange-500 text-white" : "border-border bg-white hover:bg-surface-alt"
              }`}
            >
              {DECLARATION_FEE_TIER_LABEL[t]}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={withFormE} onChange={(e) => setWithFormE(e.target.checked)} /> Form E
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={withReg} onChange={(e) => setWithReg(e.target.checked)} /> ลงทะเบียน
          </label>
        </div>

        <table className="w-full text-sm">
          <tbody>
            {quote.lines.map((l) => (
              <tr key={l.key} className="border-b border-border/50">
                <td className="py-1.5 text-foreground">{l.label}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">฿{baht(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-orange-300">
              <td className="py-2 font-bold">รวมค่าบริการออกใบขน</td>
              <td className="py-2 text-right font-mono tabular-nums font-bold text-orange-700">฿{baht(quote.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[11px] text-muted">
          อ้างอิงตาราง AXELRA · เก็บ <b>ขาประจำ</b> เป็นหลัก · ลูกค้าใหม่เสนอ <b>ราคาแรก</b> ก่อน · ลงทะเบียนเก็บครั้งเดียวต่อลูกค้า
        </p>
      </div>
    </details>
  );
}
