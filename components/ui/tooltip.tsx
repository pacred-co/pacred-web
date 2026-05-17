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
 * Convenience presets for the most-asked-about Pacred terms. Define here
 * once → reuse across admin pages without re-typing the definition.
 * Edits to a definition propagate to every callsite.
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
} as const;
