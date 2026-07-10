"use client";

/**
 * EditableQuoteCard — the PEAK-style INLINE-EDITABLE twin of <QuoteCard> (ปอน 2026-07-04).
 *
 * <QuoteCard> (quote-paper.tsx) is the SHARED READ-ONLY render — used by the
 * public /q/[token] customer page + the print/copy serializers, so it must stay
 * display-only. This component renders the SAME document layout but every
 * per-quote text point is click-to-edit and the calc-mode line-items are a full
 * PEAK-style table (เพิ่ม/ลบ รายการ · กดแก้จำนวน·ราคา·ส่วนลด·VAT·WHT ได้เอง). The
 * ใบประเมิน (compare) เทียบราคา table is editable too.
 *
 * It is a CONTROLLED component: it never holds the document in its own state —
 * it renders `model` and reports every edit via `onChange(patch)`. The admin tab
 * (quote-tab.tsx) owns the merged model + persists it, so the customer sees the
 * edited numbers on the saved share-link. Company/legal constants (ผู้ขาย · KBank ·
 * วิธีใช้บริการ) + the derived totals stay read-only.
 */

import { useState, type ReactNode } from "react";
import { Phone, Mail, Globe, User, Plus, Trash2, Save } from "lucide-react";
import { CONTACT, ADDRESSES, BANK, SITE_LEGAL_NAME_TH, TAX_ID } from "@/components/seo/site";
import { round2, type QuoteTotals } from "@/lib/quote/cargo-quote-calc";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { CUSTOMS_ADDON, QUOTE_HOW_TO } from "@/lib/quote/cargo-promo-packages";
import { QUOTE_LOGO, type QuoteModel, type DisplayLine, type CompareRow } from "./quote-paper";

const SELLER = {
  nameTh: SITE_LEGAL_NAME_TH,
  address: ADDRESSES.office.full,
  taxId: TAX_ID,
  phone: CONTACT.phoneCompanyDisplay,
  email: "admin@pacred.co",
};

const THB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BAHT = (n: number) => n.toLocaleString("th-TH");
const QTY = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

// Palette — mirror quote-paper.tsx (theme `primary` is red; these are inline).
const ACCENT = "#B30000";
const TINT = "#FBEAEA";
const TINT_BD = "#EFD1D1";

// ── qty-label ↔ (number · unit) — the จำนวน cell edits a number + a unit label,
//    but the model stores a single `qtyLabel` string (so it round-trips through
//    the read-only card unchanged). Parse on read, rebuild on write.
function parseQty(qtyLabel: string): { num: number; unit: string } {
  const m = qtyLabel.trim().match(/^([\d.,]+)\s*(.*)$/);
  if (m) return { num: parseFloat(m[1].replace(/,/g, "")) || 0, unit: m[2].trim() };
  return { num: 0, unit: qtyLabel.trim() };
}
function buildQtyLabel(num: number, unit: string): string {
  if (num > 0) return `${QTY(num)}${unit ? ` ${unit}` : ""}`;
  return unit || "-";
}
// amount = (qty>0 ? qty : 1) × price − discount  — a flat line (no qty) bills once.
function lineAmount(qtyLabel: string, price: number, discount: number): number {
  const { num } = parseQty(qtyLabel);
  const eff = num > 0 ? num : 1;
  return round2(eff * (price || 0) - (discount || 0));
}

// ── inline-edit primitives ────────────────────────────────────────────────
// Borderless field that reads as text until hovered (dashed) / focused (ring).
// NOTE: no `w-full` here — TextInput/AreaInput add it (they fill their block),
// but NumInput keeps its explicit narrow width (w-12 etc.) so ฿[num]/unit stays
// tight instead of the input stretching full-cell (ปอน 2026-07-04).
const editBase =
  "min-w-0 rounded-sm border border-transparent bg-transparent px-1 -mx-1 outline-none transition-colors hover:bg-amber-50 hover:border-dashed hover:border-slate-300 focus:border-primary-400 focus:bg-white focus:ring-1 focus:ring-primary-300";

function TextInput({
  value, onChange, placeholder, className = "", mono = false, align,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  className?: string; mono?: boolean; align?: "right" | "center";
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${editBase} w-full ${mono ? "font-mono" : ""} ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""} ${className}`}
    />
  );
}

function AreaInput({
  value, onChange, placeholder, className = "",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={Math.max(1, value.split("\n").length)}
      onChange={(e) => onChange(e.target.value)}
      className={`${editBase} w-full resize-none ${className}`}
    />
  );
}

// Numeric field — keeps a local string while focused (so "1." / "" stay typable),
// re-syncs from the model on blur / external change (calc re-seed) via the
// adjust-state-during-render pattern (no effect → no cascading-render lint).
function NumInput({
  value, onChange, className = "", align = "right",
}: {
  value: number; onChange: (n: number) => void; className?: string; align?: "right" | "center";
}) {
  const [txt, setTxt] = useState(() => (value ? String(value) : ""));
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  // External value changed while not being edited → refresh the display.
  if (!focused && value !== seen) {
    setSeen(value);
    setTxt(value ? String(value) : "");
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={txt}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setSeen(value); setTxt(value ? String(value) : ""); }}
      onChange={(e) => {
        const t = e.target.value;
        setTxt(t);
        const n = parseFloat(t.replace(/,/g, ""));
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className={`${editBase} font-mono ${align === "right" ? "text-right" : "text-center"} ${className}`}
    />
  );
}

// ── the card ──────────────────────────────────────────────────────────────
export function EditableQuoteCard({
  model,
  onChange,
  onSaveToRates,
  savingToRates,
}: {
  model: QuoteModel;
  onChange: (patch: Partial<QuoteModel>) => void;
  /** Compare mode only — when provided, the เทียบราคา table shows a "บันทึกเข้าเรทลูกค้า"
   *  button that writes the edited rates back to the customer's configured rate. */
  onSaveToRates?: () => void;
  savingToRates?: boolean;
}) {
  const t = model.totals;
  const isCalc = model.view === "calc";

  return (
    <div className="mx-auto max-w-[860px] overflow-hidden rounded border border-slate-200 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-4 p-4 sm:p-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={QUOTE_LOGO} alt="Pacred" className="h-20 w-auto sm:h-28" />
          <div className="text-right leading-tight">
            <div className="text-[11px] text-slate-500">หน้า 1/1</div>
            <div className="text-[10px] text-slate-400">(ต้นฉบับ)</div>
            <div className="mt-1 text-[26px] font-black sm:text-[34px]" style={{ color: ACCENT }}>{isCalc ? "ใบประเมินราคา" : "ใบเสนอราคา"}</div>
            <div className="text-[11px] tracking-wide text-slate-400">{isCalc ? "Price Assessment" : "Quotation"}</div>
          </div>
        </div>

        {/* Info row — ผู้ขาย (read-only) / ลูกค้า (editable) + meta-box + ติดต่อกลับที่ */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="min-w-0 flex-1 space-y-2.5">
            <SellerBlock />
            <div className="border-t border-slate-200" />
            <BuyerBlock model={model} onChange={onChange} />
          </div>
          <div className="shrink-0 space-y-2.5 sm:w-[38%] sm:max-w-[300px]">
            <div className="rounded border" style={{ background: TINT, borderColor: TINT_BD }}>
              <MetaRow k="เลขที่เอกสาร" v={<TextInput value={model.refNo} onChange={(v) => onChange({ refNo: v })} className="font-bold text-right" mono align="right" />} accent />
              <MetaRow k="วันที่ออก" v={<TextInput value={model.dateLabel} onChange={(v) => onChange({ dateLabel: v })} align="right" />} />
              <MetaRow k="วันที่ตอบรับ" v={<span className="text-slate-800">{model.dateLabel}</span>} />
              <MetaRow k="ใช้ได้ถึง" v={<TextInput value={model.validUntil} onChange={(v) => onChange({ validUntil: v })} align="right" />} />
              <MetaRow k="อ้างอิง" v={<TextInput value={model.customerCode} onChange={(v) => onChange({ customerCode: v })} align="right" mono />} last />
            </div>
            <div className="px-0.5">
              <p className="mb-0.5 text-[10px] font-bold text-slate-500">ติดต่อกลับที่ :</p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-700"><User className="h-3 w-3 shrink-0 text-slate-900" /> <TextInput value={model.salesName} onChange={(v) => onChange({ salesName: v })} placeholder="ชื่อผู้ติดต่อ (Sales)" /></p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-700"><Phone className="h-3 w-3 shrink-0 text-slate-900" /> <TextInput value={model.salesTel} onChange={(v) => onChange({ salesTel: v })} placeholder="เบอร์ติดต่อ" mono /></p>
            </div>
          </div>
        </div>

        {/* Package label */}
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-[11px] font-bold text-slate-400">แพ็คเกจ :</span>
          <TextInput value={model.packageLabel} onChange={(v) => onChange({ packageLabel: v })} placeholder="ชื่อแพ็คเกจ" className="text-[11px] font-bold" />
        </div>

        {isCalc ? <LineItemsEditor model={model} onChange={onChange} /> : <CompareEditor model={model} onChange={onChange} onSaveToRates={onSaveToRates} savingToRates={savingToRates} />}

        {/* Customs add-on info (compare mode · read-only reference) */}
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

        {/* Summary (calc · derived, read-only) */}
        {isCalc && model.lines.length > 0 && <Summary t={t} />}

        {model.juristic && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[12px] text-blue-900">
            ลูกค้านิติบุคคล — <b>หัก ณ ที่จ่าย 1%</b> จากค่าบริการ{isCalc ? " (คำนวณในยอดสุทธิแล้ว)" : ""}
          </div>
        )}

        {/* เงื่อนไขแพ็คเกจ + หมายเหตุ — editable lists */}
        <ListEditor title="เงื่อนไขแพ็คเกจ" items={model.conditions} onChange={(v) => onChange({ conditions: v })} addLabel="เพิ่มเงื่อนไข" />
        <ListEditor title="📌 หมายเหตุ" items={model.notes} onChange={(v) => onChange({ notes: v })} addLabel="เพิ่มหมายเหตุ" />

        {/* วิธีการใช้บริการ — read-only constant */}
        <div>
          <p className="text-[12px] font-bold text-slate-900 mb-1">วิธีการใช้บริการ</p>
          <ul className="list-disc pl-5 text-[12px] text-slate-700 space-y-0.5">
            {QUOTE_HOW_TO.map((s, i) => <li key={i}>{s.text}{s.link && <span className="ml-1 break-all" style={{ color: ACCENT }}>{s.link}</span>}</li>)}
          </ul>
        </div>

        {/* หมายเหตุเพิ่มเติม — editable free text */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AreaInput value={model.extraNote} onChange={(v) => onChange({ extraNote: v })} placeholder="หมายเหตุเพิ่มเติม (เช่น โปรพิเศษ / เงื่อนไขเฉพาะลูกค้ารายนี้) — เว้นว่างได้" className="text-[12px] text-amber-900" />
        </div>

        {/* Payment (KBank · read-only) */}
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

        {/* Certified — read-only signatures (name mirrors ลูกค้า) */}
        <CertifiedRow customerName={model.buyerName} dateLabel={model.dateLabel} salesName={model.salesName} />
      </div>
    </div>
  );
}

function SellerBlock() {
  return (
    <div className="flex items-start gap-x-4">
      <div className="min-w-0 shrink-0 space-y-0.5" style={{ width: "60%" }}>
        <DocRow label="ผู้ขาย" strong>{SELLER.nameTh}</DocRow>
        <DocRow label="ที่อยู่">{SELLER.address}</DocRow>
        <DocRow label="เลขที่ภาษี">{`${SELLER.taxId} (สำนักงานใหญ่)`}</DocRow>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 text-[10.5px] text-slate-600">
        <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0 text-slate-900" /> {SELLER.phone}</p>
        <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0 text-slate-900" /> {SELLER.email}</p>
        <p className="flex items-center gap-1.5"><Globe className="h-3 w-3 shrink-0 text-slate-900" /> pacred.co.th</p>
      </div>
    </div>
  );
}

function BuyerBlock({ model, onChange }: { model: QuoteModel; onChange: (p: Partial<QuoteModel>) => void }) {
  return (
    <div className="flex items-start gap-x-4">
      <div className="min-w-0 shrink-0 space-y-0.5" style={{ width: "60%" }}>
        <div className="flex gap-1.5 leading-[1.5]">
          <span className="w-[58px] shrink-0 text-[10px] font-bold text-slate-500">ลูกค้า :</span>
          <div className="min-w-0 flex-1 text-[10.5px] font-bold text-slate-800">
            <TextInput value={model.buyerName} onChange={(v) => onChange({ buyerName: v })} placeholder="ชื่อลูกค้า / บริษัท" className="font-bold" />
            {model.juristic && <span className="text-slate-500"> (นิติบุคคล)</span>}
          </div>
        </div>
        <div className="flex gap-1.5 leading-[1.5]">
          <span className="w-[58px] shrink-0 text-[10px] font-bold text-slate-500">ที่อยู่ :</span>
          <div className="min-w-0 flex-1 text-[10.5px] text-slate-600"><AreaInput value={model.buyerAddress} onChange={(v) => onChange({ buyerAddress: v })} placeholder="ที่อยู่ลูกค้า" /></div>
        </div>
        <div className="flex gap-1.5 leading-[1.5]">
          <span className="w-[58px] shrink-0 text-[10px] font-bold text-slate-500">เลขที่ภาษี :</span>
          <div className="min-w-0 flex-1 text-[10.5px] text-slate-600"><TextInput value={model.buyerTaxId} onChange={(v) => onChange({ buyerTaxId: v })} placeholder="เลขผู้เสียภาษี" mono /></div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 text-[10.5px] text-slate-600">
        <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0 text-slate-900" /> <TextInput value={model.buyerPhone} onChange={(v) => onChange({ buyerPhone: v })} placeholder="เบอร์โทร" mono /></p>
        <p className="flex items-center gap-1.5 text-slate-400"><Mail className="h-3 w-3 shrink-0 text-slate-900" /> -</p>
        <p className="flex items-center gap-1.5 text-slate-400"><Globe className="h-3 w-3 shrink-0 text-slate-900" /> -</p>
      </div>
    </div>
  );
}

// ── calc line-items — the PEAK-style editable table ─────────────────────────
function LineItemsEditor({ model, onChange }: { model: QuoteModel; onChange: (p: Partial<QuoteModel>) => void }) {
  const lines = model.lines;
  const thL = "px-2 py-2 text-left text-[10.5px] font-semibold whitespace-nowrap";
  const thR = "px-2 py-2 text-right text-[10.5px] font-semibold whitespace-nowrap";
  const thC = "px-2 py-2 text-center text-[10.5px] font-semibold whitespace-nowrap";

  const setLines = (next: DisplayLine[]) => onChange({ lines: next });
  const patchLine = (i: number, changes: Partial<DisplayLine>) => {
    const merged: DisplayLine = { ...lines[i], ...changes };
    merged.amount = lineAmount(merged.qtyLabel, merged.price, merged.discount ?? 0);
    setLines(lines.map((l, idx) => (idx === i ? merged : l)));
  };
  const addLine = () =>
    setLines([...lines, { desc: "", qtyLabel: "1", price: 0, amount: 0, vat: model.lines[0]?.vat ?? true, whtApplicable: true, discount: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10.5px] font-semibold text-slate-400">เส้นทาง :</span>
        <TextInput value={model.routeLabel} onChange={(v) => onChange({ routeLabel: v })} placeholder="เส้นทาง / หมายเหตุรายการ" className="text-[10.5px] text-slate-500" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px] text-[11px]">
          <thead className="border-b text-slate-700" style={{ background: TINT, borderColor: TINT_BD }}>
            <tr>
              <th className={thL}>คำอธิบาย</th>
              <th className={thC}>จำนวน</th>
              <th className={thR}>ราคา</th>
              <th className={thR}>ส่วนลด</th>
              <th className={thC}>VAT</th>
              <th className={thR}>มูลค่ารวมภาษี</th>
              <th className={thC}>WHT</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const { num, unit } = parseQty(l.qtyLabel);
              const inclVat = round2(l.amount + (l.vat ? l.amount * 0.07 : 0));
              return (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <span className="pt-1 text-slate-400">{i + 1}.</span>
                      <AreaInput value={l.desc} onChange={(v) => patchLine(i, { desc: v })} placeholder="รายละเอียดรายการ" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <NumInput value={num} onChange={(n) => patchLine(i, { qtyLabel: buildQtyLabel(n, unit) })} className="w-16 text-slate-600" />
                      <TextInput value={unit} onChange={(u) => patchLine(i, { qtyLabel: buildQtyLabel(num, u) })} placeholder="หน่วย" className="w-14 text-[10.5px] text-slate-400" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><NumInput value={l.price} onChange={(p) => patchLine(i, { price: p })} className="w-20" /></td>
                  <td className="px-2 py-1.5"><NumInput value={l.discount ?? 0} onChange={(d) => patchLine(i, { discount: d })} className="w-16 text-slate-500" /></td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={l.vat} onChange={(e) => patchLine(i, { vat: e.target.checked })} className="accent-primary-600" title="VAT 7%" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold whitespace-nowrap">{THB(inclVat)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={l.whtApplicable} onChange={(e) => patchLine(i, { whtApplicable: e.target.checked })} className="accent-primary-600" title="อยู่ในฐานหัก ณ ที่จ่าย" disabled={!model.juristic} />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button type="button" onClick={() => removeLine(i)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" title="ลบรายการ"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-4 text-center text-[11px] text-slate-400">ยังไม่มีรายการ — กด “เพิ่มรายการ” ด้านล่าง หรือกรอก CBM/KG ด้านบนเพื่อสร้างอัตโนมัติ</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary-300 px-3 py-1.5 text-[12px] font-semibold text-primary-700 hover:bg-primary-50">
        <Plus className="h-3.5 w-3.5" /> เพิ่มรายการ
      </button>
    </div>
  );
}

// ── ใบประเมิน (compare) — editable เทียบราคา table ──────────────────────────
function CompareEditor({ model, onChange, onSaveToRates, savingToRates }: { model: QuoteModel; onChange: (p: Partial<QuoteModel>) => void; onSaveToRates?: () => void; savingToRates?: boolean }) {
  const rows = model.compareRows;
  const setRows = (next: CompareRow[]) => onChange({ compareRows: next });
  const patchRow = (i: number, changes: Partial<CompareRow>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  const patchRate = (i: number, key: "truck" | "ship", changes: Partial<CompareRow["truck"]>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [key]: { ...r[key], ...changes } } : r)));
  const addRow = () => setRows([...rows, { warehouse: "", isYiwu: false, truck: { cbm: 0, kg: 0, days: "" }, ship: { cbm: 0, kg: 0, days: "" } }]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {/* table-fixed → the two rate columns get EQUAL width (auto-layout gave ทางรถ
            more room b/c of the +2–3 hint, so ทางเรือ was too narrow & wrapped). */}
        <table className="w-full min-w-[600px] table-fixed text-[11px] sm:text-[12px]">
          <thead className="border-b text-[11px] text-slate-700" style={{ background: TINT, borderColor: TINT_BD }}>
            <tr>
              <th className="w-[92px] px-2 sm:px-3 py-1.5 text-left font-semibold">โกดัง</th>
              <th className="w-[88px] px-2 sm:px-3 py-1.5 text-left font-semibold">ประเภทสินค้า</th>
              <th className="px-2 sm:px-3 py-1.5 text-left font-semibold">ทางรถ 🚛</th>
              <th className="px-2 sm:px-3 py-1.5 text-left font-semibold">ทางเรือ 🚢</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="px-2 sm:px-3 py-2 font-semibold">
                  <TextInput value={r.warehouse} onChange={(v) => patchRow(i, { warehouse: v })} placeholder="ชื่อโกดัง" className="font-semibold" />
                </td>
                {/* ประเภท — read-only (it maps to the product columns for the write-back) */}
                <td className="px-2 sm:px-3 py-2 text-[11px] font-medium text-slate-600 whitespace-nowrap">{r.category ?? "—"}</td>
                <td className="px-2 sm:px-3 py-2"><RateCellEdit r={r.truck} onChange={(c) => patchRate(i, "truck", c)} /></td>
                <td className="px-2 sm:px-3 py-2"><RateCellEdit r={r.ship} onChange={(c) => patchRate(i, "ship", c)} /></td>
                <td className="px-1 py-2 text-center">
                  <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" title="ลบแถว"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-4 text-center text-[11px] text-slate-400">ยังไม่มีแถว — กด “เพิ่มแถว” ด้านล่าง</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary-300 px-3 py-1.5 text-[12px] font-semibold text-primary-700 hover:bg-primary-50">
          <Plus className="h-3.5 w-3.5" /> เพิ่มแถว
        </button>
        {onSaveToRates && (
          <button type="button" onClick={onSaveToRates} disabled={savingToRates} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
            <Save className="h-3.5 w-3.5" /> {savingToRates ? "กำลังบันทึก..." : "บันทึกเข้าเรทลูกค้า"}
          </button>
        )}
      </div>
      {onSaveToRates && (
        <p className="text-[11px] text-slate-400">
          แก้เรทในตารางนี้ แล้วกด “บันทึกเข้าเรทลูกค้า” เพื่ออัปเดตเรทตั้งค่าของลูกค้า (ทั่วไป·มอก. และ อย.·พิเศษ ตั้งเป็นราคาเดียวกันในกลุ่ม)
        </p>
      )}
    </div>
  );
}

// One tidy line: ฿cbm/คิว · ฿kg/กก. · ระยะเวลา (wraps gracefully only if the cell
// gets very narrow) — the stacked 3-row version read as bulky/แปลกๆ (ปอน 2026-07-04).
function RateCellEdit({ r, onChange }: { r: CompareRow["truck"]; onChange: (c: Partial<CompareRow["truck"]>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight">
      <span className="inline-flex items-center whitespace-nowrap font-mono font-bold" style={{ color: ACCENT }}>
        ฿<NumInput value={r.cbm} onChange={(n) => onChange({ cbm: n })} className="w-11" align="center" /><span className="text-[10px] font-normal text-slate-400">/คิว</span>
      </span>
      <span className="inline-flex items-center whitespace-nowrap font-mono text-slate-600">
        ฿<NumInput value={r.kg} onChange={(n) => onChange({ kg: n })} className="w-9" align="center" /><span className="text-[10px] text-slate-400">/กก.</span>
      </span>
      <span className="inline-flex items-center gap-0.5 text-slate-500">
        {/* fixed-width wrapper — TextInput is w-full, so this caps the days field */}
        <span className="inline-block w-[76px] shrink-0"><TextInput value={r.days} onChange={(v) => onChange({ days: v })} placeholder="ระยะเวลา" /></span>
      </span>
    </div>
  );
}

// ── editable bullet list (เงื่อนไข / หมายเหตุ) ──────────────────────────────
function ListEditor({ title, items, onChange, addLabel }: { title: string; items: string[]; onChange: (v: string[]) => void; addLabel: string }) {
  const setItem = (i: number, v: string) => onChange(items.map((it, idx) => (idx === i ? v : it)));
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const addItem = () => onChange([...items, ""]);
  return (
    <div>
      <p className="text-[12px] font-bold text-slate-900 mb-1">{title}</p>
      <ul className="space-y-0.5 text-[12px] text-slate-700">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="pt-1 text-slate-400">•</span>
            <AreaInput value={it} onChange={(v) => setItem(i, v)} placeholder="…" />
            <button type="button" onClick={() => removeItem(i)} className="mt-0.5 shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" title="ลบ"><Trash2 className="h-3 w-3" /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={addItem} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-700">
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
}

// ── read-only helpers (mirror quote-paper.tsx) ─────────────────────────────
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

function DocRow({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex gap-1.5 leading-[1.5]">
      <span className="w-[58px] shrink-0 text-[10px] font-bold text-slate-500">{label} :</span>
      <span className={`min-w-0 flex-1 text-[10.5px] ${strong ? "font-bold text-slate-800" : "text-slate-600"}`}>{children}</span>
    </div>
  );
}

function MetaRow({ k, v, last, accent }: { k: string; v: ReactNode; last?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1" style={last ? undefined : { borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
      <span className="shrink-0 text-[10px] font-bold text-slate-500">{k} :</span>
      <span className={`min-w-0 flex-1 text-right text-[10.5px] ${accent ? "" : "text-slate-800"}`} style={accent ? { color: ACCENT } : undefined}>{v}</span>
    </div>
  );
}

function CertifiedRow({ customerName, dateLabel, salesName }: { customerName: string; dateLabel: string; salesName: string }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="mb-2 text-[11px] font-bold text-slate-800">✍ รับรอง</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CertBox title="ผู้ออกเอกสาร (ผู้ขาย)" name={salesName || "Sales Pacred"} date={dateLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/legacy/pcs/assets/images/theme/sin-wandee.jpg" alt="ลายเซ็น" className="h-8 w-auto object-contain" />
        </CertBox>
        <CertBox title="ผู้อนุมัติเอกสาร (ผู้ขาย)" name="Account Pacred" date={dateLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/pacred-stamp-tight.png" alt="ตราประทับ" className="h-11 w-auto object-contain opacity-90" />
        </CertBox>
        <CertBox title="ผู้รับเอกสาร (ลูกค้า)" name={customerName || " "} dashedLine />
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
        <p className="truncate text-[9px] font-bold text-slate-800">{name || " "}</p>
        {date ? <p className="text-[8px] text-slate-500">{date}</p> : null}
      </div>
    </div>
  );
}
