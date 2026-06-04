"use client";

/**
 * 📋 Freight rate-card GUIDE — a read-only reference panel for the human who
 * prices + confirms a freight quote. Per owner directive (2026-06-04): the rate
 * engine only proposes a starting price; a person always reviews + confirms it,
 * then the customer confirms + pays again. So this puts the real AXELRA rate-card
 * reference (incoterm scope · Thai-local charges · China freight 3-tier · markup
 * tiers · FX · policy) right beside the pricing UI so the pricer can check it.
 *
 * Pure reference — reads lib/freight/rate-model (no IO, no mutation, no comms).
 */

import { useState } from "react";
import {
  THAI_LOCAL_LINES, FREIGHT_LINES, INCOTERM_SCOPE,
  SCOPE_LABEL, INCOTERM_LABEL, SELL_TIER_LABEL,
  FREIGHT_VAT_PCT, FREIGHT_MARGIN_CAP_PER_CONTAINER,
  FREIGHT_COMMISSION, FREIGHT_MARKUP_TIERS_PCT, FREIGHT_FX_REFERENCE,
  type DeliveryTruck, type SellTier,
} from "@/lib/freight/rate-model";
import {
  INCOTERMS, TRANSPORT_MODES, TRANSPORT_MODE_LABEL, type TransportMode,
} from "@/lib/validators/freight-quote";

const baht = (n: number) => "฿" + n.toLocaleString("th-TH");

function sellText(sell: number | Record<DeliveryTruck, number>): string {
  return typeof sell === "number" ? baht(sell) : `4ล้อ ${baht(sell["4W"])} / 6ล้อ ${baht(sell["6W"])}`;
}

const TIERS: SellTier[] = ["retail", "regular", "wholesale"];

export function RateCardGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <section className="rounded-2xl border border-border bg-surface-alt/30 px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-bold text-primary-700 hover:underline">
          📋 เปิดไกด์อ้างอิงราคา (AXELRA rate card)
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface-alt/40">
        <h2 className="font-bold text-sm">📋 ไกด์อ้างอิงราคาเฟรท (AXELRA rate card)</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">ย่อ</button>
      </div>

      <div className="p-5 space-y-5 text-sm">
        <p className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          ⚠️ ราคานี้เป็น <b>ค่าตั้งต้นอ้างอิง</b> — ฝ่ายราคา <b>ตรวจ + ยืนยัน</b> ก่อนเสมอ
          แล้วส่งให้ลูกค้า <b>ยืนยัน + ชำระ</b> อีกที. ปรับตามงานจริง/ระยะทาง/เรทเดือนได้.
        </p>

        {/* 1) Incoterm scope */}
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wide text-muted mb-2">1. เงื่อนไขการส่ง (Incoterm) — เราเก็บอะไรบ้าง</h3>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr><th className="py-1 pr-3 w-16">Term</th><th className="py-1 pr-3">ขอบเขตที่เราเก็บ</th><th className="py-1">ขา (scope)</th></tr>
              </thead>
              <tbody>
                {INCOTERMS.map((ic) => (
                  <tr key={ic} className="border-t border-border/60">
                    <td className="py-1 pr-3 font-mono font-bold">{ic}</td>
                    <td className="py-1 pr-3">{INCOTERM_LABEL[ic]}</td>
                    <td className="py-1">
                      <span className="flex flex-wrap gap-1">
                        {INCOTERM_SCOPE[ic].map((s) => (
                          <span key={s} className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted">{SCOPE_LABEL[s]}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2) Thai-local charges */}
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wide text-muted mb-2">2. ค่าบริการฝั่งไทย (พิธีการ + ขนส่ง) — ราคาขายอ้างอิง</h3>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr><th className="py-1 pr-3">รายการ</th><th className="py-1 pr-3">ขา</th><th className="py-1 pr-3">โหมด</th><th className="py-1 text-right">ขายอ้างอิง</th></tr>
              </thead>
              <tbody>
                {THAI_LOCAL_LINES.map((l) => (
                  <tr key={l.key} className="border-t border-border/60">
                    <td className="py-1 pr-3">{l.labelTh}</td>
                    <td className="py-1 pr-3 text-muted">{SCOPE_LABEL[l.scope]}</td>
                    <td className="py-1 pr-3 text-muted">{l.modes === "all" ? "ทุกโหมด" : l.modes.map((m) => TRANSPORT_MODE_LABEL[m].replace(/^[^\s]+\s/, "")).join("/")}</td>
                    <td className="py-1 text-right font-mono">{sellText(l.sell)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3) China freight + origin (3-tier) */}
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wide text-muted mb-2">3. ค่าเฟรทจีน + เอกสารต้นทาง — ขาย 3 เรท (ปลีก / ประจำ / ส่ง)</h3>
          {TRANSPORT_MODES.map((mode: TransportMode) => {
            const lines = FREIGHT_LINES[mode] ?? [];
            if (lines.length === 0) return null;
            return (
              <div key={mode} className="mb-3">
                <p className="text-[11px] font-bold text-primary-700 mb-1">{TRANSPORT_MODE_LABEL[mode]}</p>
                <div className="overflow-x-auto scrollbar-x-visible">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted">
                      <tr><th className="py-1 pr-3">รายการ</th><th className="py-1 pr-3">ต่อ</th><th className="py-1 pr-3">ขา</th><th className="py-1 text-right">ปลีก / ประจำ / ส่ง</th></tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key} className="border-t border-border/60">
                          <td className="py-1 pr-3">{l.labelTh}</td>
                          <td className="py-1 pr-3 text-muted uppercase">{l.per}</td>
                          <td className="py-1 pr-3 text-muted">{SCOPE_LABEL[l.scope]}</td>
                          <td className="py-1 text-right font-mono">{TIERS.map((t) => baht(l.sell[t])).join(" / ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-muted">{SELL_TIER_LABEL.retail} = ลูกค้าใหม่/รายย่อย · {SELL_TIER_LABEL.regular} = ลูกค้าประจำ · {SELL_TIER_LABEL.wholesale} = ลูกค้าส่ง/ปริมาณมาก</p>
        </div>

        {/* 4) Policy */}
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wide text-muted mb-2">4. นโยบาย + ต้นทุน (ใช้ตอนตรวจ/ยืนยันราคา)</h3>
          <ul className="space-y-1 text-xs text-foreground/90">
            <li>• <b>VAT</b> {FREIGHT_VAT_PCT}% (ขาต่างประเทศ 0%)</li>
            <li>• <b>เพดานกำไร</b> ≤ {baht(FREIGHT_MARGIN_CAP_PER_CONTAINER)}/ตู้ (CEO) — เกินจะมีธงเตือน</li>
            <li>• <b>คอมมิชชั่นเซล</b> เฟรท {FREIGHT_COMMISSION.salesFreightPct}% · พิธีการ {FREIGHT_COMMISSION.salesCustomsPct}% · เอกสาร {FREIGHT_COMMISSION.salesDocPct}% (หัก WHT {FREIGHT_COMMISSION.whtPct}%)</li>
            <li>• <b>Markup เฟรท</b> {FREIGHT_MARKUP_TIERS_PCT.join("% / ")}% — เลือกชั้นตามปริมาณ/ลูกค้าตอนคิดราคา</li>
            <li>• <b>ต้นทุนเฟรทจีน</b> = เมทริกซ์ USD รายเดือน ต่อท่า×สายเรือ (ดูชีต cost) · FX อ้างอิง <b>{FREIGHT_FX_REFERENCE.thbPerUsd} ฿/USD</b> — {FREIGHT_FX_REFERENCE.note}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
