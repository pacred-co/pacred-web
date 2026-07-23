/**
 * Shared paper chrome for the TWO documents that print from one driver run:
 *   • บิลหาสินค้า / Picking List  → `/admin/drivers/[id]/picking-list` (คลัง)
 *   • บิลจัดส่ง  / Delivery Note  → `/admin/drivers/[id]/print`        (คนขับ)
 *
 * They are handed out together for the same load, and each links to the other,
 * so they must LOOK like one set. Keeping the brand block / meta box / stat
 * cards / footer here means a change lands on both at once instead of the two
 * quietly drifting apart (the header on one page said something different from
 * the other for months before this).
 *
 * Design language is the same one the ใบเสนอราคา uses
 * (`components/quote/quote-paper.tsx`): a white A4 card on a grey desk, a
 * tinted meta box, a rounded table with a tinted head, and a page-number
 * footer.
 *
 * 🔴 2026-07-23 — เดิมใช้ทองแทนแดง "เพราะเป็นเอกสารโกดัง/คนขับ ต้องไม่ถูกมองผ่านๆ
 * ว่าเป็นเอกสารการเงิน". owner สั่งเปลี่ยนเป็นแดงแบรนด์ให้เข้าชุดกับใบส่งสินค้า
 * (รับทราบข้อแลกเปลี่ยนแล้ว) → ดูหมายเหตุที่ DOC_GOLD ด้านล่างสำหรับวิธีย้อนกลับ.
 *
 * PURE PRESENTATION — no data access, no client state (safe in a Server
 * Component).
 */

import { Mail, MapPin, Phone } from "lucide-react";
import { SITE_LEGAL_NAME_TH, ADDRESSES, CONTACT } from "@/components/seo/site";

// ── Tokens ───────────────────────────────────────────────────────────────
//
// 🔴 owner 2026-07-23: สั่งให้เอกสารคนขับ (บิลจัดส่ง · บิลหาสินค้า) ใช้ชุดสีเดียว
// กับใบส่งสินค้าที่เพิ่งปรับไป = **แดงแบรนด์ #B30000** (เดิมเป็นทอง #D99A2B).
//
// ⚠️ ทับเหตุผลเดิมที่จดไว้หัวไฟล์ ("ใช้ทองแทนแดง เพราะเป็นเอกสารโกดัง/คนขับ
// ต้องไม่ถูกมองผ่านๆ ว่าเป็นเอกสารการเงิน") — owner รับทราบข้อนี้แล้วและเลือก
// ความเป็นชุดเดียวกันของเอกสารมากกว่า. ถ้าจะย้อนกลับ: เปลี่ยน 3 ค่าข้างล่างนี้
// กลับเป็น #D99A2B / #FDF6EA / #F0E1C6 — จบในบรรทัดเดียว ไม่ต้องแก้หน้าไหน.
export const DOC_GOLD = "#B30000"; // title · footer rule · icons · accents
// Brand red (= `primary-600`). ปอน 2026-07-23: the headline counts read dark
// red so the number a picker/driver must match is the loudest thing on the
// page — gold sat too close to the cream chrome to pop.
export const DOC_RED = "#B30000";
// พื้นอ่อน + เส้น — ค่าเดียวกับใบส่งสินค้า/ใบแจ้งหนี้ (alpha .10 เพราะแดงเข้มกว่าทอง
// ถ้าใช้ความเข้มเท่าเดิมตัวหนังสือบนแถบจะอ่านยาก · เส้นใช้ hairline เทากลาง)
export const DOC_CREAM = "rgba(179,0,0,0.10)"; // meta box · table head · subtotal rows
export const DOC_CREAM_BD = "#e5e7eb";
export const DOC_PINK = "#FDECEC"; // group/section header rows
export const DOC_PINK_BD = "#F5D5D5";
export const DOC_PINK_TX = "#B91C1C";

/**
 * The wordmark.
 *
 * NOTE — `pacred-logo-red.png` is the SAME artwork on a 140×140 square, but
 * its ink is only 134×36 (26% of the canvas; 44px/60px of empty padding above
 * and below). Rendering that square makes the wordmark look tiny AND wastes
 * header height. This tight crop is the same pixels with the padding removed:
 * ~3.9× larger wordmark at the same box height, zero quality loss.
 * 134×36 is the ceiling of the source art — do not render far past it or the
 * logo blurs on paper.
 */
const LOGO = "/images/pacred-logo-tight.png";

/**
 * Print rules for both papers.
 *
 * `print-color-adjust: exact` is LOAD-BEARING, not cosmetic: browsers strip
 * background colours from print by default, and on these documents the tints
 * carry meaning (they separate shelves / sections). Without it the whole
 * document prints flat white and staff lose the grouping.
 */
export function DocPrintStyles() {
  return (
    <style>{`
      .print-area { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @media print {
        aside, .no-print { display: none !important; }
        html, body { background: #fff !important; }
        body { padding: 0 !important; margin: 0 !important; }
        .doc-desk { background: #fff !important; padding: 0 !important; }
        .print-area {
          box-shadow: none !important; border: none !important;
          border-radius: 0 !important; margin: 0 !important; max-width: none !important;
        }
        /* a long run flows onto page 2 with its header intact + no split rows */
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }
      @page { size: A4 portrait; margin: 1cm; }
    `}</style>
  );
}

/** Logo · legal name · office address · phone/email — identical on both. */
export function DocBrandBlock() {
  return (
    <div className="min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="Pacred" className="h-10 w-auto sm:h-12" />
      <p className="mt-3 text-sm font-bold">{SITE_LEGAL_NAME_TH}</p>
      <p className="mt-1 flex max-w-[320px] items-start gap-1.5 text-[12px] leading-relaxed text-slate-600">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: DOC_GOLD }} />
        <span>{ADDRESSES.office.full}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
        <span className="inline-flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: DOC_GOLD }} />
          {CONTACT.phoneCompanyDisplay}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: DOC_GOLD }} />
          {CONTACT.email}
        </span>
      </div>
    </div>
  );
}

/** Big gold document title + its English/audience subtitle. */
export function DocTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2
        className="text-right text-[30px] font-black leading-none"
        style={{ color: DOC_GOLD }}
      >
        {title}
      </h2>
      <p className="mt-1 text-right text-[12px] text-slate-500">{subtitle}</p>
    </>
  );
}

/** Cream `label : value` panel — wrap `DocMetaRow`s. */
export function DocMetaBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-3 rounded-lg border"
      style={{ background: DOC_CREAM, borderColor: DOC_CREAM_BD }}
    >
      {children}
    </div>
  );
}

export function DocMetaRow({
  k,
  v,
  last,
}: {
  k: string;
  v: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 px-3 py-1.5"
      style={last ? undefined : { borderBottom: `1px solid ${DOC_CREAM_BD}` }}
    >
      <span className="shrink-0 text-[11px] text-slate-500">{k}</span>
      <span className="min-w-0 break-words text-right text-[12px] font-semibold">
        {v}
      </span>
    </div>
  );
}

/**
 * One headline-number card — icon chip + label + value.
 *
 * Deliberately high-contrast (ปอน 2026-07-23): the LABEL is solid black rather
 * than muted grey, and the COUNT is brand red. These cards are read at arm's
 * length off a printed page in a warehouse, so grey-on-white lost the label
 * and a gold number blended into the cream chrome around it.
 */
export function DocStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: DOC_CREAM_BD }}
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: DOC_CREAM }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-black">{label}</div>
        <div
          className="text-2xl font-black leading-tight"
          style={{ color: DOC_RED }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/** Gold rule + optional document number (left) and page marker (right). */
export function DocFooter({
  left,
  right = "1/1",
}: {
  left?: React.ReactNode;
  right?: string;
}) {
  return (
    <div
      className="mt-1 flex items-center justify-between gap-3 border-t-2 pt-2 text-[11px] text-slate-400"
      style={{ borderColor: DOC_GOLD }}
    >
      <span className="min-w-0 break-words">{left}</span>
      <span className="shrink-0">{right}</span>
    </div>
  );
}
