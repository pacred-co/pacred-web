/**
 * Shared ใบเสนอราคา render + serializers (owner ภูม 2026-06-22).
 *
 * EXTRACTED from quote-tab.tsx so the admin tool AND the public share-link page
 * (`/q/[token]`) render BYTE-IDENTICALLY from the same `QuoteModel` — exactly how
 * `components/receipt/receipt-paper.tsx` is shared by the admin reprint and the
 * public `/r/[token]` receipt. The admin tab still owns the inputs/calc; it
 * imports `QuoteCard` from here to render the preview. The public page deserializes
 * a stored `QuoteModel` (jsonb payload) and renders the SAME `QuoteCard` — no
 * recompute, so the customer sees the same numbers the admin saw.
 *
 * `QuoteModel` is fully JSON-serializable (every field is a primitive / array /
 * the plain `QuoteTotals` object) so it round-trips through the DB jsonb column
 * losslessly. NO hooks here → this is a Server Component (also usable in the
 * client tab).
 */

import type { ReactNode } from "react";
import {
  CONTACT, SOCIAL, ADDRESSES, BANK, SITE_LEGAL_NAME_TH, SITE_LEGAL_NAME, TAX_ID, SITE_URL,
} from "@/components/seo/site";
import { Phone, Mail, Globe, User } from "lucide-react";
import { round2, type QuoteTotals } from "@/lib/quote/cargo-quote-calc";
import { readThaiBaht } from "@/lib/utils/thai-number";
import {
  CUSTOMS_ADDON, QUOTE_HEADER, QUOTE_HOW_TO, type PackageRate,
} from "@/lib/quote/cargo-promo-packages";

export const QUOTE_LOGO = "/images/pacred-logo-red.png";

const SELLER = {
  nameTh: SITE_LEGAL_NAME_TH, nameEn: SITE_LEGAL_NAME, address: ADDRESSES.office.full,
  taxId: TAX_ID, phone: CONTACT.phoneCompanyDisplay, email: CONTACT.email,
};

const THB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BAHT = (n: number) => n.toLocaleString("th-TH");
const QTY = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

export type View = "compare" | "calc";
export type DisplayLine = { desc: string; qtyLabel: string; price: number; amount: number; vat: boolean; whtApplicable: boolean };
export type CompareRow = { warehouse: string; isYiwu: boolean; truck: PackageRate; ship: PackageRate };

/**
 * The complete render model — serialized into `customer_quotations.payload`.
 * Every field is JSON-safe (no Date, no function): the public page reads this
 * straight from jsonb and renders QuoteCard with no further computation.
 */
export type QuoteModel = {
  view: View;
  refNo: string; customerCode: string; dateLabel: string; validUntil: string;
  buyerName: string; buyerTaxId: string; buyerAddress: string; buyerPhone: string;
  salesName: string; salesTel: string;
  packageLabel: string; juristic: boolean;
  compareRows: CompareRow[];
  routeLabel: string; density: number | null; basisLabel: string; comparison: number;
  lines: DisplayLine[]; totals: QuoteTotals;
  showCustomsInfo: boolean;
  conditions: string[]; notes: string[]; extraNote: string;
};

// ── ใบเสนอราคา (Pacred) — 1:1 clone of the Peak "QO" PDF export (ปอน 2026-07-03).
//    Header (logo · หน้า/ต้นฉบับ · indigo title) · ผู้ขาย/ลูกค้า blocks + contact
//    icons + lavender meta-box + ติดต่อกลับที่ · 7-col items table · สรุป + a
//    highlighted จำนวนเงินที่ชำระ box · KBank payment · รับรอง signature row.
//    Shared by the admin preview + public /q. `qrDataUrl` optional (the /q QR).
// Palette sampled from the PDF (inline-styled — the theme's `primary` is red):
const ACCENT = "#B30000";   // dark red (Pacred) — title + accent numbers
const TINT = "#FBEAEA";     // light red tint — meta-box · table header · amount box
const TINT_BD = "#EFD1D1";  // light red border
export function QuoteCard({ model, qrDataUrl }: { model: QuoteModel; qrDataUrl?: string }) {
  const t = model.totals;
  const isCalc = model.view === "calc";
  return (
    <div className="mx-auto max-w-[860px] overflow-hidden rounded border border-slate-200 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-4 p-4 sm:p-8">

        {/* Header — logo · หน้า/ต้นฉบับ + indigo title */}
        <div className="flex items-start justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={QUOTE_LOGO} alt="Pacred" className="h-20 w-auto sm:h-28" />
          <div className="text-right leading-tight">
            <div className="text-[11px] text-slate-500">หน้า 1/1</div>
            <div className="text-[10px] text-slate-400">(ต้นฉบับ)</div>
            <div className="mt-1 text-[26px] font-black sm:text-[34px]" style={{ color: ACCENT }}>{isCalc ? "ใบเสนอราคา" : "ใบประเมินราคา"}</div>
            <div className="text-[11px] tracking-wide text-slate-400">Quotation</div>
          </div>
        </div>

        {/* Info row — ผู้ขาย/ลูกค้า (left) · meta-box + ติดต่อกลับที่ (right) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="min-w-0 flex-1 space-y-2.5">
            <PartyBlock role="ผู้ขาย" name={SELLER.nameTh} address={SELLER.address} taxId={`${SELLER.taxId} (สำนักงานใหญ่)`} phone={SELLER.phone} email="admin@pacred.co" web="pacred.co.th" />
            <div className="border-t border-slate-200" />
            <PartyBlock role="ลูกค้า" name={`${model.buyerName || "—"}${model.juristic ? " (นิติบุคคล)" : ""}`} address={model.buyerAddress || "—"} taxId={model.buyerTaxId || "—"} phone={model.buyerPhone || "-"} email="-" web="-" />
          </div>
          <div className="shrink-0 space-y-2.5 sm:w-[38%] sm:max-w-[300px]">
            <div className="rounded border" style={{ background: TINT, borderColor: TINT_BD }}>
              <MetaRow k="เลขที่เอกสาร" v={<span className="font-bold" style={{ color: ACCENT }}>{model.refNo}</span>} />
              <MetaRow k="วันที่ออก" v={model.dateLabel} />
              <MetaRow k="วันที่ตอบรับ" v={model.dateLabel} />
              <MetaRow k="ใช้ได้ถึง" v={model.validUntil} />
              <MetaRow k="อ้างอิง" v={model.customerCode || "-"} last />
            </div>
            <div className="px-0.5">
              <p className="mb-0.5 text-[10px] font-bold text-slate-500">ติดต่อกลับที่ :</p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-700"><User className="h-3 w-3 shrink-0 text-slate-900" /> {model.salesName || "Sales Pacred"}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-700"><Phone className="h-3 w-3 shrink-0 text-slate-900" /> {model.salesTel || CONTACT.phoneDisplay}</p>
            </div>
          </div>
        </div>

        {model.packageLabel ? <p className="text-[11px] font-bold" style={{ color: ACCENT }}>{model.packageLabel}</p> : null}

        {isCalc ? <LineItems model={model} /> : <CompareTable model={model} />}

        {/* Customs add-on info (compare mode) */}
        {!isCalc && model.showCustomsInfo && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-[12px] font-bold">📦 {CUSTOMS_ADDON.title}</p>
            <table className="w-full text-[11.5px]">
              <tbody>
                {CUSTOMS_ADDON.costs.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="py-1">{c.label}</td><td className="py-1 text-right font-mono font-semibold whitespace-nowrap">฿{BAHT(c.amount)}</td><td className="py-1 pl-2 text-[11px] text-slate-400 whitespace-nowrap">{c.note}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] font-bold" style={{ color: ACCENT }}>✅ {CUSTOMS_ADDON.summary}</p>
          </div>
        )}

        {/* Summary (calc mode) */}
        {isCalc && model.lines.length > 0 && <Summary t={t} />}

        {model.juristic && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[12px] text-blue-900">
            ลูกค้านิติบุคคล — <b>หัก ณ ที่จ่าย 1%</b> จากค่าบริการ{isCalc ? " (คำนวณในยอดสุทธิแล้ว)" : ""}
          </div>
        )}

        {model.conditions.length > 0 && <Section title="เงื่อนไขแพ็คเกจ">{model.conditions.map((c, i) => <li key={i}>{c}</li>)}</Section>}
        <Section title="📌 หมายเหตุ">{model.notes.map((n, i) => <li key={i}>{n}</li>)}</Section>
        <Section title="วิธีการใช้บริการ">{QUOTE_HOW_TO.map((s, i) => <li key={i}>{s.text}{s.link && <span className="ml-1 break-all" style={{ color: ACCENT }}>{s.link}</span>}</li>)}</Section>
        {model.extraNote && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 whitespace-pre-wrap">{model.extraNote}</div>}

        {/* Payment (KBank) */}
        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-start gap-2 text-[11px] text-slate-700">
            <span className="whitespace-nowrap font-bold text-slate-800">💳 ชำระเงิน</span>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[10px] font-black text-white">K</span>
              <div>
                <p className="font-semibold text-slate-800">{BANK.name}</p>
                <p className="font-mono">{BANK.accountType} {BANK.accountNumber}</p>
                <p className="text-slate-500">{BANK.accountName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Certified — รับรอง signature/stamp row */}
        <CertifiedRow customerName={model.buyerName} dateLabel={model.dateLabel} salesName={model.salesName} refNo={model.refNo} qrDataUrl={qrDataUrl} />
      </div>
    </div>
  );
}

function PartyBlock({ role, name, address, taxId, phone, email, web }: { role: string; name: string; address: string; taxId: string; phone: string; email: string; web: string }) {
  return (
    <div className="flex items-start gap-x-4">
      <div className="min-w-0 shrink-0 space-y-0.5" style={{ width: "60%" }}>
        <DocRow label={role} strong>{name}</DocRow>
        <DocRow label="ที่อยู่">{address}</DocRow>
        <DocRow label="เลขที่ภาษี">{taxId}</DocRow>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 text-[10.5px] text-slate-600">
        <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0 text-slate-900" /> {phone}</p>
        <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0 text-slate-900" /> {email}</p>
        <p className="flex items-center gap-1.5"><Globe className="h-3 w-3 shrink-0 text-slate-900" /> {web}</p>
      </div>
    </div>
  );
}

function CompareTable({ model }: { model: QuoteModel }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-[11px] sm:text-[12px]">
        <thead className="border-b text-[11px] text-slate-700" style={{ background: TINT, borderColor: TINT_BD }}>
          <tr><th className="px-2 sm:px-3 py-1.5 text-left font-semibold">โกดัง</th><th className="px-2 sm:px-3 py-1.5 text-left font-semibold">ทางรถ 🚛</th><th className="px-2 sm:px-3 py-1.5 text-left font-semibold">ทางเรือ 🚢</th></tr>
        </thead>
        <tbody>
          {model.compareRows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="px-2 sm:px-3 py-2 font-semibold whitespace-nowrap">{r.warehouse}</td>
              <td className="px-2 sm:px-3 py-2"><RateCell r={r.truck} extraDays={r.isYiwu ? "+2–3 วัน" : undefined} /></td>
              <td className="px-2 sm:px-3 py-2"><RateCell r={r.ship} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RateCell({ r, extraDays }: { r: PackageRate; extraDays?: string }) {
  return (
    <div>
      <div className="font-mono font-bold" style={{ color: ACCENT }}>฿{BAHT(r.cbm)}<span className="text-[11px] font-normal text-slate-500">/คิว</span></div>
      <div className="font-mono text-[11px]">฿{BAHT(r.kg)}<span className="text-[11px] text-slate-500">/กก.</span></div>
      <div className="text-[11px] text-slate-500">{r.days}{extraDays ? ` ${extraDays}` : ""}</div>
    </div>
  );
}

// 7-col items table matching the PDF (คำอธิบาย·จำนวน·ราคา·ส่วนลด·VAT·มูลค่ารวมภาษี·WHT).
function LineItems({ model }: { model: QuoteModel }) {
  const thL = "px-2 py-2 text-left text-[10.5px] font-semibold whitespace-nowrap";
  const thR = "px-2 py-2 text-right text-[10.5px] font-semibold whitespace-nowrap";
  const thC = "px-2 py-2 text-center text-[10.5px] font-semibold whitespace-nowrap";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[660px] text-[11px]">
        <thead className="border-b text-slate-700" style={{ background: TINT, borderColor: TINT_BD }}>
          <tr>
            <th className={thL}>คำอธิบาย</th>
            <th className={thR}>จำนวน</th>
            <th className={thR}>ราคา</th>
            <th className={thR}>ส่วนลด</th>
            <th className={thC}>VAT</th>
            <th className={thR}>มูลค่ารวมภาษี</th>
            <th className={thC}>WHT</th>
          </tr>
        </thead>
        <tbody>
          {model.routeLabel ? (
            <tr><td colSpan={7} className="px-2 pt-2 text-[10.5px] text-slate-500">{model.routeLabel}{model.density != null ? ` · คิดตาม ${model.basisLabel}` : ""}</td></tr>
          ) : null}
          {model.lines.map((l, i) => {
            const inclVat = round2(l.amount + (l.vat ? l.amount * 0.07 : 0));
            return (
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5">{i + 1}. {l.desc}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-500 whitespace-nowrap">{l.qtyLabel}</td>
                <td className="px-2 py-1.5 text-right font-mono">{THB(l.price)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-500">0.00</td>
                <td className="px-2 py-1.5 text-center text-[10.5px] text-slate-500">{l.vat ? "7%" : "ไม่มี"}</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">{THB(inclVat)}</td>
                <td className="px-2 py-1.5 text-center text-[10.5px] text-slate-400">{model.juristic && l.whtApplicable ? "1%" : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// สรุป — breakdown (left · incl. Thai-baht words) + highlighted จำนวนเงินที่ชำระ box (right).
function Summary({ t }: { t: QuoteTotals }) {
  const netPaid = t.whtAmount > 0 ? t.netPayable : t.grandTotal;
  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 pt-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-2">
        <p className="whitespace-nowrap text-[12px] font-bold text-slate-800">📋 สรุป</p>
        <div className="min-w-0 space-y-0.5 text-[11px]">
          <SumLine k="มูลค่าไม่มีหรือยกเว้นภาษี" v={`${THB(t.subtotalNoVat)} บาท`} />
          <SumLine k="มูลค่าที่คำนวณภาษี 7%" v={`${THB(t.subtotalVat)} บาท`} />
          <SumLine k="ภาษีมูลค่าเพิ่ม 7%" v={`${THB(t.vatAmount)} บาท`} />
          <div className="flex flex-wrap justify-between gap-x-6 border-t border-slate-100 pt-0.5">
            <span className="text-slate-500">จำนวนเงินทั้งสิ้น</span>
            <span className="text-slate-600">{readThaiBaht(t.grandTotal)}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 space-y-1 sm:w-[290px]">
        <div className="flex items-center justify-between rounded border px-3 py-2" style={{ background: TINT, borderColor: TINT_BD }}>
          <span className="text-[11px] font-bold text-slate-600">จำนวนเงินที่ชำระ</span>
          <span className="font-mono text-[20px] font-black" style={{ color: ACCENT }}>{THB(netPaid)}<span className="ml-1 text-[12px]">บาท</span></span>
        </div>
        <div className="flex justify-between px-1 text-[11px]"><span className="text-slate-500">จำนวนเงินที่ถูกหัก ณ ที่จ่าย</span><span className="font-mono text-slate-700">{THB(t.whtAmount)} บาท</span></div>
        <div className="flex justify-between px-1 text-[11px]"><span className="text-slate-500">จำนวนเงินทั้งสิ้น</span><span className="font-mono text-slate-700">{THB(t.grandTotal)} บาท</span></div>
      </div>
    </div>
  );
}

function SumLine({ k, v }: { k: string; v: string }) {
  return <div className="flex flex-wrap justify-between gap-x-6"><span className="text-slate-500">{k}</span><span className="font-mono text-slate-700">{v}</span></div>;
}

// ── Peak document helpers (label rows · meta-box · certified signatures) ──
function DocRow({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex gap-1.5 leading-[1.5]">
      <span className="w-[58px] shrink-0 text-[10px] font-bold text-slate-500">{label} :</span>
      <span className={`min-w-0 flex-1 text-[10.5px] ${strong ? "font-bold text-slate-800" : "text-slate-600"}`}>{children}</span>
    </div>
  );
}

function MetaRow({ k, v, last }: { k: string; v: ReactNode; last?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 px-2.5 py-1.5" style={last ? undefined : { borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
      <span className="shrink-0 text-[10px] font-bold text-slate-500">{k} :</span>
      <span className="text-right text-[10.5px] text-slate-800">{v}</span>
    </div>
  );
}

function CertifiedRow({ customerName, dateLabel, salesName, refNo, qrDataUrl }: { customerName: string; dateLabel: string; salesName: string; refNo: string; qrDataUrl?: string }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="mb-2 text-[11px] font-bold text-slate-800">✍ รับรอง</p>
      <div className={`grid grid-cols-2 gap-3 ${qrDataUrl ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        {qrDataUrl && (
          <CertBox title="สแกนเพื่อเปิดด้วยเว็บไซต์">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt={`QR ${refNo}`} className="h-12 w-12 object-contain" />
          </CertBox>
        )}
        <CertBox title="ผู้ออกเอกสาร (ผู้ขาย)" name={salesName || "Sales Pacred"} date={dateLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/legacy/pcs/assets/images/theme/sin-wandee.jpg" alt="ลายเซ็น" className="h-8 w-auto object-contain" />
        </CertBox>
        <CertBox title="ผู้อนุมัติเอกสาร (ผู้ขาย)" name="Account Pacred" date={dateLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/pacred-stamp-tight.png" alt="ตราประทับ" className="h-11 w-auto object-contain opacity-90" />
        </CertBox>
        <CertBox title="ผู้รับเอกสาร (ลูกค้า)" name={customerName || " "} dashedLine />
        <CertBox title="ตราประทับ (ลูกค้า)"><div className="h-11 w-full rounded border border-dashed border-slate-300" /></CertBox>
      </div>
    </div>
  );
}

function CertBox({ title, name, date, dashedLine, children }: { title: string; name?: string; date?: string; dashedLine?: boolean; children?: ReactNode }) {
  return (
    <div className="min-w-0 text-center">
      <p className="mb-1 text-[9px] font-bold text-slate-600">{title}</p>
      <div className="flex h-12 items-end justify-center">{children}</div>
      <div className={`pt-1 ${dashedLine ? "border-t border-dashed border-slate-400" : "border-t border-slate-400"}`}>
        <p className="truncate text-[9px] font-bold text-slate-800">{name || " "}</p>
        {date ? <p className="text-[8px] text-slate-500">{date}</p> : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><p className="text-[12px] font-bold text-slate-900 mb-1">{title}</p><ul className="list-disc pl-5 text-[12px] text-slate-700 space-y-0.5">{children}</ul></div>;
}

// ── plain text (คัดลอก) ───────────────────────────────────────────────────
export function buildQuoteText(m: QuoteModel): string {
  const L: string[] = [];
  L.push(`🚛🚢 ${QUOTE_HEADER}`);
  L.push(`ใบเสนอราคา — PACRED (${m.refNo}) · วันที่ ${m.dateLabel} · ใช้ได้ถึง ${m.validUntil}`);
  L.push(`เรียน: ${m.buyerName || "ลูกค้า"}${m.juristic ? " (นิติบุคคล)" : ""}`);
  if (m.customerCode) L.push(`รหัสลูกค้า: ${m.customerCode}`);
  L.push(m.packageLabel);
  L.push("");
  if (m.view === "compare") {
    L.push("เทียบราคา (บาท/คิว · บาท/กก. · ระยะเวลา):");
    m.compareRows.forEach((r) => {
      L.push(` • ${r.warehouse} · รถ ฿${BAHT(r.truck.cbm)}/คิว ฿${BAHT(r.truck.kg)}/กก. (${r.truck.days}${r.isYiwu ? " +2–3 วัน" : ""})`);
      L.push(`            เรือ ฿${BAHT(r.ship.cbm)}/คิว ฿${BAHT(r.ship.kg)}/กก. (${r.ship.days})`);
    });
    if (m.showCustomsInfo) {
      L.push("");
      L.push(`📦 ${CUSTOMS_ADDON.title}`);
      CUSTOMS_ADDON.costs.forEach((c) => L.push(` • ${c.label}: ฿${BAHT(c.amount)} ${c.note ?? ""}`.trimEnd()));
      L.push(` ✅ ${CUSTOMS_ADDON.summary}`);
    }
  } else {
    if (m.density != null) L.push(`ความหนาแน่น ${QTY(round2(m.density))} กก./คิว (ค่าเทียบ ${m.comparison}) → บิลตาม ${m.basisLabel}`);
    m.lines.forEach((l, i) => L.push(`${i + 1}. ${l.desc} [${l.qtyLabel} × ฿${THB(l.price)}] = ฿${THB(l.amount)}${l.vat ? " (VAT)" : ""}`));
    L.push("");
    L.push(`รวมเป็นเงิน ฿${THB(m.totals.grandTotal)}`);
    if (m.totals.whtAmount > 0) { L.push(`หัก ณ ที่จ่าย 1% ฿${THB(m.totals.whtAmount)}`); L.push(`ยอดชำระสุทธิ ฿${THB(m.totals.netPayable)}`); }
  }
  if (m.juristic && m.view === "compare") L.push("• ลูกค้านิติบุคคล: หัก ณ ที่จ่าย 1% จากค่าบริการ");
  if (m.conditions.length) { L.push(""); L.push("เงื่อนไขแพ็คเกจ:"); m.conditions.forEach((c) => L.push(` • ${c}`)); }
  L.push("");
  L.push("📌 หมายเหตุ:");
  m.notes.forEach((n) => L.push(` • ${n}`));
  if (m.extraNote) { L.push(""); L.push(m.extraNote); }
  L.push("");
  L.push(`💳 ${BANK.name} (${BANK.accountType}) ${BANK.accountNumber} · ${BANK.accountName}`);
  L.push(`📞 CS ${CONTACT.phoneCsDisplay} · ☎️ ${SELLER.phone} · ✉️ ${SELLER.email} · LINE ${SOCIAL.line}`);
  return L.join("\n");
}

// ── Peak A4 print HTML ────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildPrintHtml(m: QuoteModel): string {
  // Browser → real origin (so the logo <img src> resolves); server/SSR → SITE_URL.
  const origin = typeof window !== "undefined" ? window.location.origin : SITE_URL;
  const t = m.totals;
  const li = (items: string[]) => items.map((i) => `<li>${esc(i)}</li>`).join("");

  let body = "";
  if (m.view === "compare") {
    const rows = m.compareRows
      .map((r) => `<tr><td class="b">${esc(r.warehouse)}</td>
        <td>${BAHT(r.truck.cbm)}<small>/คิว</small> · ${BAHT(r.truck.kg)}<small>/กก.</small><br><span class="mut">${esc(r.truck.days)}${r.isYiwu ? " +2–3 วัน" : ""}</span></td>
        <td>${BAHT(r.ship.cbm)}<small>/คิว</small> · ${BAHT(r.ship.kg)}<small>/กก.</small><br><span class="mut">${esc(r.ship.days)}</span></td></tr>`)
      .join("");
    body = `<table class="items"><thead><tr><th>โกดัง</th><th>ทางรถ 🚛</th><th>ทางเรือ 🚢</th></tr></thead><tbody>${rows}</tbody></table>`;
    if (m.showCustomsInfo) {
      body += `<div class="box" style="margin-top:8px"><p class="b">📦 ${esc(CUSTOMS_ADDON.title)}</p><table class="cost">${CUSTOMS_ADDON.costs.map((c) => `<tr><td>${esc(c.label)}</td><td class="r b">${BAHT(c.amount)}</td><td class="mut">${esc(c.note ?? "")}</td></tr>`).join("")}</table><p class="b red">✅ ${esc(CUSTOMS_ADDON.summary)}</p></div>`;
    }
  } else {
    const rows = m.lines.map((l, i) => `<tr><td>${i + 1}. ${esc(l.desc)}</td><td class="c">${esc(l.qtyLabel)}</td><td class="r">${THB(l.price)}</td><td class="r b">${THB(l.amount)}</td><td class="c mut">${l.vat ? "7%" : "-"}</td></tr>`).join("");
    const whtRows = t.whtAmount > 0 ? `<tr><td>หัก ณ ที่จ่าย 1%</td><td class="r">${THB(t.whtAmount)}</td></tr><tr class="net"><td>ยอดชำระสุทธิ</td><td class="r">${THB(t.netPayable)} บาท</td></tr>` : "";
    body = `<div class="mut" style="font-size:9px;margin-bottom:4px">${esc(m.routeLabel)}${m.density != null ? ` · ความหนาแน่น ${QTY(round2(m.density))} กก./คิว → บิลตาม ${esc(m.basisLabel)}` : ""}</div>
      <table class="items"><thead><tr><th>รายการ</th><th class="c" style="width:80px">จำนวน</th><th class="r" style="width:80px">ราคา/หน่วย</th><th class="r" style="width:90px">จำนวนเงิน</th><th class="c" style="width:34px">VAT</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="sum"><tr><td class="mut">มูลค่าไม่มี/ยกเว้นภาษี</td><td class="r">${THB(t.subtotalNoVat)}</td></tr>
        <tr><td class="mut">มูลค่าที่คำนวณภาษี</td><td class="r">${THB(t.subtotalVat)}</td></tr>
        <tr><td class="mut">ภาษีมูลค่าเพิ่ม 7%</td><td class="r">${THB(t.vatAmount)}</td></tr>
        <tr class="gt"><td>รวมเป็นเงิน</td><td class="r">${THB(t.grandTotal)} บาท</td></tr>${whtRows}</table>`;
  }

  const juristicNote = m.juristic ? `<div class="blue">ลูกค้านิติบุคคล — หัก ณ ที่จ่าย 1% จากค่าบริการ${m.view === "calc" ? " (คำนวณในยอดสุทธิแล้ว)" : ""}</div>` : "";
  const conditions = m.conditions.length ? `<p class="h">เงื่อนไขแพ็คเกจ</p><ul>${li(m.conditions)}</ul>` : "";
  const howTo = `<p class="h">วิธีการใช้บริการ</p><ul>${QUOTE_HOW_TO.map((s) => `<li>${esc(s.text)}${s.link ? ` <span class="lk">${esc(s.link)}</span>` : ""}</li>`).join("")}</ul>`;
  const extra = m.extraNote ? `<div class="amber">${esc(m.extraNote)}</div>` : "";

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสนอราคา ${esc(m.refNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'Sarabun','Prompt',sans-serif}
body{font-size:11px;color:#1a1a1a;padding:24px}.doc{max-width:760px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b30000;padding-bottom:10px;margin-bottom:12px}
.top img{height:44px}.ti{font-size:22px;font-weight:800;color:#b30000;text-align:right}.bs{font-size:9px;color:#666}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.box{border:0.5px solid #ccc;border-radius:4px;padding:7px 9px;line-height:1.5}.box .t{font-weight:700;color:#333}
.mut{color:#777}.mono{font-family:monospace}.b{font-weight:700}.r{text-align:right}.c{text-align:center}.red{color:#b30000}
table{width:100%;border-collapse:collapse}small{font-size:8px;color:#777}
.items{margin:6px 0;font-size:10.5px}.items th{background:#1a1a1a;color:#fff;padding:5px 8px;text-align:left;font-size:9.5px}.items td{border:0.5px solid #ddd;padding:5px 8px;vertical-align:top}
.cost td{padding:4px 0;border-top:0.5px solid #eee;font-size:10px}
.sum{width:300px;margin-left:auto;font-size:11px;margin-top:6px}.sum td{padding:4px 8px;border:0.5px solid #eee}
.sum .gt td{border-top:1px solid #999;font-weight:800;color:#b30000;font-size:14px}.sum .net td{background:#1a1a1a;color:#fff;font-weight:800;font-size:13px}
.h{font-size:11px;font-weight:800;margin:10px 0 3px}ul{padding-left:18px;margin:3px 0}li{margin:1.5px 0}.lk{color:#b30000}
.amber{background:#fffbeb;border:0.5px solid #fde68a;border-radius:4px;padding:7px 9px;margin:8px 0;white-space:pre-wrap}
.blue{background:#eff6ff;border:0.5px solid #bfdbfe;border-radius:4px;padding:6px 9px;margin:8px 0;font-weight:600}
.pay{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid #eee;margin-top:10px;padding-top:8px;font-size:10px;color:#555}
.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px}.sign .s{border:0.5px solid #ccc;border-radius:4px;min-height:54px;padding:5px;text-align:center;font-size:8px;color:#888;display:flex;flex-direction:column;justify-content:flex-end}
@page{size:A4;margin:12mm}@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="doc">
  <div class="top"><img src="${origin}${QUOTE_LOGO}" alt="Pacred"><div><div class="ti">ใบเสนอราคา</div><div class="bs r">Quotation</div></div></div>
  <div class="grid">
    <div class="box"><div class="t">ผู้ขาย</div>${esc(SELLER.nameTh)}<br><span class="mut">${esc(SELLER.address)}</span><br><span class="mut mono">เลขภาษี ${esc(SELLER.taxId)}</span><br><span class="mut">โทร ${esc(SELLER.phone)} · ${esc(SELLER.email)}</span></div>
    <div class="box"><table><tr><td class="mut" style="width:34%">เลขที่</td><td class="b" style="color:#b30000">${esc(m.refNo)}</td></tr>
      <tr><td class="mut">วันที่</td><td>${esc(m.dateLabel)}</td></tr><tr><td class="mut">ใช้ได้ถึง</td><td>${esc(m.validUntil)}</td></tr>
      <tr><td class="mut">ลูกค้า</td><td class="b">${esc(m.buyerName || "—")}${m.juristic ? " (นิติบุคคล)" : ""}</td></tr>
      ${m.customerCode ? `<tr><td class="mut">รหัสลูกค้า</td><td class="mono b">${esc(m.customerCode)}</td></tr>` : ""}
      <tr><td class="mut">ติดต่อ</td><td>${esc(m.salesName || "—")} ${m.salesTel ? "· " + esc(m.salesTel) : ""}</td></tr></table></div>
  </div>
  <div class="mut" style="font-size:10px;font-weight:700;color:#b30000;margin-bottom:4px">${esc(m.packageLabel)}</div>
  ${body}
  ${juristicNote}
  ${conditions}
  <p class="h">📌 หมายเหตุ</p><ul>${li(m.notes)}</ul>
  ${howTo}
  ${extra}
  <div class="pay"><div><b>💳 ชำระเงิน</b><br>${esc(BANK.name)} (${esc(BANK.accountType)})<br><span class="mono b">${esc(BANK.accountNumber)}</span><br>${esc(BANK.accountName)}</div>
    <div class="r">📞 CS ${esc(CONTACT.phoneCsDisplay)} · ☎️ ${esc(SELLER.phone)}<br>✉️ ${esc(SELLER.email)}<br><span class="lk">LINE ${esc(SOCIAL.line)}</span></div></div>
  <div class="sign"><div class="s">ผู้ออกเอกสาร<br>(ผู้ขาย)</div><div class="s">ผู้อนุมัติ<br>(ผู้ขาย)</div><div class="s">ผู้รับเอกสาร<br>(ลูกค้า)</div></div>
</div>
<script>(function(){var p=false;function go(){if(p)return;p=true;window.focus();window.print();}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go);}setTimeout(go,1200);})();</script>
</body></html>`;
}
