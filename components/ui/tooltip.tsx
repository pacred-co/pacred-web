/**
 * U4-3 · Lightweight glossary tooltip — no library, no JS.
 *
 * Wraps a Thai shorthand term (e.g. "WHT 50-ทวิ", "Form-E", "D/O", "CBM",
 * "F-no") in an underline + native `<abbr title>` for accessibility, plus
 * a custom pure-CSS popover for desktop/touch via the `group` pattern.
 *
 * Why not a library:
 *   - Tailwind v4 + a custom `group-hover` + `peer` setup gives us the
 *     hover/focus popover with zero JS.
 *   - Mobile users get the native `title` long-press too.
 *   - Bundle stays cold (server component compatible).
 *
 * Usage:
 *   <Glossary term="WHT 50-ทวิ" definition="ใบรับรองหักภาษี ณ ที่จ่าย — ลูกค้านิติบุคคลต้องส่งให้ Pacred ก่อนออกใบกำกับ" />
 */

import type { ReactNode } from "react";
import { Info } from "lucide-react";

type GlossaryProps = {
  /** The short term as it appears in copy. */
  term:        ReactNode;
  /** Plain-language definition shown on hover/focus. Keep to one short line. */
  definition:  string;
  /** Optional extra className applied to the wrapping span. */
  className?:  string;
};

export function Glossary({ term, definition, className = "" }: GlossaryProps) {
  return (
    <span className={`relative inline-flex group ${className}`}>
      <abbr
        title={definition}
        tabIndex={0}
        className="cursor-help underline decoration-dotted decoration-muted underline-offset-2 hover:decoration-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300 rounded-sm"
      >
        {term}
      </abbr>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-max max-w-xs -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] font-normal text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {definition}
      </span>
    </span>
  );
}

/**
 * Explain — the "เพื่อนคู่ซี้" in-system guide hint (owner 2026-06-25).
 *
 * Drop a small ⓘ next to ANY label, number, or status — hover/focus/tap shows a
 * plain-language explanation. Same zero-JS pure-CSS popover as <Glossary>, but
 * the trigger is an icon (not the term itself), so it never changes the copy or
 * the layout of what it annotates. Use this when you want to keep the label
 * clean but offer "what is this / what do I do" on demand — for customers AND
 * staff alike.
 *
 *   <Explain def={GUIDE.wht_1pct_bill} />                     // bare ⓘ
 *   <Explain def="..." label="หัก ณ ที่จ่าย 1%" />            // label + ⓘ together
 *   <Explain def="..." align="right" />                        // tooltip right-anchored (for right-aligned cells)
 *
 * Server-component compatible (no client state). Prefer a key from GUIDE so the
 * wording stays consistent + edits propagate everywhere it's used.
 */
export function Explain({
  def,
  label,
  align = "center",
  className = "",
}: {
  /** Plain-language explanation. Prefer a GUIDE[...] key. */
  def:        string;
  /** Optional text shown before the ⓘ (the thing being explained). */
  label?:     ReactNode;
  /** Tooltip horizontal anchor — "right" keeps it on-screen in right-aligned cells. */
  align?:     "center" | "left" | "right";
  className?: string;
}) {
  const pos =
    align === "right"
      ? "right-0"
      : align === "left"
        ? "left-0"
        : "left-1/2 -translate-x-1/2";
  return (
    <span className={`relative inline-flex items-center gap-1 group align-middle ${className}`}>
      {label}
      <span
        tabIndex={0}
        role="button"
        aria-label="ดูคำอธิบาย"
        className="cursor-help inline-flex shrink-0 text-muted hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-300 rounded-full"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-1 w-max max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-[11px] font-normal leading-snug text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${pos}`}
      >
        {def}
      </span>
    </span>
  );
}

/**
 * Convenience presets for the most-asked-about Pacred terms + concepts. Define
 * here once → reuse across customer + admin surfaces without re-typing. Edits to
 * a definition propagate to every callsite. This is the content registry for the
 * in-system guide (the "คู่มือในตัวระบบ"). Keep each one ONE plain-language line.
 *
 * Alias `GUIDE` is the preferred name going forward (terms + concepts, not just
 * a glossary); GLOSSARY_DEFS stays as a back-compat export.
 */
export const GLOSSARY_DEFS = {
  /** Thai-Form 50-ทวิ — withholding tax certificate from juristic customers. */
  wht_50_thawi: "ใบรับรองหักภาษี ณ ที่จ่าย (มาตรา 50 ทวิ) — ลูกค้านิติบุคคลต้องส่งให้ Pacred ก่อนออกใบกำกับภาษีได้",
  /** Form E — Certificate of Origin for ASEAN-China FTA tariff preference. */
  form_e:       "Form E (Certificate of Origin) — ใบรับรองแหล่งกำเนิดสำหรับสิทธิ์ภาษีศุลกากร ASEAN-จีน (ACFTA)",
  /** D/O — Delivery Order (สั่งปล่อยสินค้าจากท่าเรือ/คลังศุลกากร) */
  do_delivery_order: "D/O (Delivery Order) — ใบสั่งปล่อยสินค้าออกจากท่าเรือ/คลังศุลกากร — ต้องมีก่อนจึงรับของได้",
  /** CBM — Cubic Meter (ปริมาตรหน่วยลูกบาศก์เมตร) */
  cbm:          "CBM (Cubic Meter) — ปริมาตรหน่วยลูกบาศก์เมตร = กว้าง × ยาว × สูง (เมตร) ใช้คิดค่าขนส่งทางเรือ/อากาศ",
  /** F-no — internal Pacred number for ฝากนำเข้า orders. */
  f_no:         "F-no — เลขที่ฝากนำเข้า (forwarder) ขึ้นต้นด้วย F — ใช้ติดตามทุกขั้นตอนของการนำเข้า",
  /** H-no — internal Pacred number for ฝากสั่ง orders. */
  h_no:         "H-no — เลขที่ฝากสั่งซื้อ (service order) ขึ้นต้นด้วย H — ใช้ติดตามออเดอร์ซื้อสินค้าจีนแทนลูกค้า",
  /** Job-no — internal Pacred container/freight job code. */
  job_no:       "Job-no — เลขที่งานขนส่ง (job) ของตู้คอนเทนเนอร์ — ใช้ผูกหลายฝากนำเข้าที่ขนตู้เดียวกัน",

  // ── เงิน / บิล / ภาษี ────────────────────────────────────────────────
  /** WHT 1% บนใบวางบิล — what the หัก ณ ที่จ่าย line means + why net < total. */
  wht_1pct_bill:
    "หัก ณ ที่จ่าย 1% — ลูกค้านิติบุคคล (ยอดบิล ≥ ฿1,000) หักภาษีไว้ 1% นำส่งสรรพากรแทนเรา แล้วจ่ายเรา “ยอดสุทธิ” (= ยอดรวม − 1%). เราได้ 1% คืนเป็นเครดิตภาษีเมื่อลูกค้าส่งใบ 50 ทวิ มาให้ · ใบบิลจึงโชว์ ยอดรวม → หัก 1% → ยอดชำระสุทธิ",
  /** ยอดรวมทั้งสิ้น (gross) on the bill. */
  bill_gross:
    "ยอดรวมทั้งสิ้น (ก่อนหักภาษี) = ยอดที่ลูกค้าเป็นหนี้จริง · ใบกำกับไทยต้องโชว์ยอดเต็มนี้ แล้วค่อยหัก ณ ที่จ่ายเป็นบรรทัดแยก",
  /** ยอดชำระสุทธิ (net) — what the customer actually remits. */
  bill_net_payable:
    "ยอดชำระสุทธิ = เงินสดที่ลูกค้าโอนจริง (ยอดรวม − หัก ณ ที่จ่าย 1%) · ส่วน 1% ลูกค้านำส่งสรรพากรแล้วส่งใบ 50 ทวิ มาให้เรา",
  /** ยอดค้างชำระ / ยอดเก็บจริง (net outstanding) vs the bill face. */
  outstanding_net:
    "ยอดเก็บจริง = เงินสดที่เราจะได้รับ (หักภาษี ณ ที่จ่ายของนิติบุคคลแล้ว) · ต่างจาก “ยอดบิล” ที่เป็นยอดเต็มก่อนหัก ~1% — ส่วนต่างคือภาษีหัก ณ ที่จ่าย ไม่ใช่ยอดหาย",
  /** เหมาๆ (PRF flat fee — Pacred-own delivery · rebrand จาก PCSF). */
  mao_fee:
    "ค่าส่งเหมาๆ (PRF) ฿100/ชิปเมนต์ — ค่าจัดส่งในไทยแบบเหมา (คนขับ Pacred) คิดครั้งเดียวต่อชิปเมนต์ (ไม่ใช่ต่อกล่อง) · แก้ได้ถ้าลูกค้ามีหลายออเดอร์รอบเดียว",
  /** ใบ 50 ทวิ (WHT certificate). */
  cert_50_thawi:
    "ใบ 50 ทวิ = หนังสือรับรองหักภาษี ณ ที่จ่าย ที่ลูกค้านิติบุคคลต้องส่งกลับมา หลังหัก 1% ไป — เราใช้ขอคืนภาษี 1% นั้น · ออกใบเสร็จ/ใบกำกับเต็มได้เมื่อได้ใบนี้",

  // ── กระเป๋าเงิน / wallet ─────────────────────────────────────────────
  /** wallet ติดลบ — owner 2026-06-25: ลูกค้าจ่ายแล้ว ต้องแก้ได้ในระบบ (ไม่ใช่ปล่อยรอบัญชี). */
  wallet_negative:
    "กระเป๋าเงินติดลบ = ลูกค้าจ่ายเงินมาแล้ว แต่ระบบยังไม่ได้บันทึกเข้ายอด → กด “บันทึกการชำระ + แนบสลิป” แล้วตรวจ/ยืนยัน เพื่อเคลียร์ยอดให้กลับมาถูกต้อง · อย่าปล่อยติดลบไว้",
} as const;

/**
 * GUIDE — preferred alias for the in-system content registry (terms + concepts).
 * Same object as GLOSSARY_DEFS; use this name in new code.
 */
export const GUIDE = GLOSSARY_DEFS;
