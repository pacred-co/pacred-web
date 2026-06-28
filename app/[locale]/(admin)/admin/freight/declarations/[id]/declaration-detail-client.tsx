"use client";

/**
 * V-E11 — admin client for customs declaration: editable header fields
 * (draft only), inline-edit line items (draft only), status-aware action
 * buttons (submit / mark accepted / mark released / cancel).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import {
  adminUpdateDeclarationHeader,
  adminAddDeclarationLine,
  adminUpdateDeclarationLine,
  adminDeleteDeclarationLine,
  adminSubmitDeclaration,
  adminMarkAccepted,
  adminMarkReleased,
  adminCancelDeclaration,
  adminAddDeclarationLineImage,
  adminRemoveDeclarationLineImage,
} from "@/actions/admin/customs-declarations";
import {
  CUSTOMS_OFFICES,
  CUSTOMS_OFFICE_LABEL,
  CUSTOMS_LINE_UNITS,
  computeLineTaxes,
  type CustomsDeclarationStatus,
  type CustomsDeclarationType,
  type CustomsLineUnit,
  type CustomsOffice,
} from "@/lib/validators/customs-declaration";

export type DeclarationLineData = {
  id:                 string;
  position:           number;
  hs_code:            string | null;
  description:        string;
  country_of_origin:  string;
  qty:                number;
  unit:               string;
  gross_weight_kg:    number | null;
  net_weight_kg:      number | null;
  declared_value_thb: number;
  duty_rate_pct:      number;
  duty_thb:           number;
  vat_thb:            number;
  fta_applied:        boolean;
  notes:              string | null;
  /** declared-value justification images (mig 0222) — keys + resolved signed URLs. */
  declared_value_images?: string[];
  evidence?:          { key: string; url: string | null }[];
  /** Form-E semi-auto (mig 0180): this HS qualifies for ACFTA + the preferential rate. */
  formEEligible?:     boolean;
  formEDutyPct?:      number;
};

export type DeclarationDetailData = {
  id:                         string;
  declaration_no:             string | null;
  status:                     CustomsDeclarationStatus;
  declaration_type:           CustomsDeclarationType;
  freight_shipment_id:        string;
  customs_office:             string | null;
  customs_control_no:         string | null;
  broker_name:                string | null;
  broker_license_no:          string | null;
  ship_or_truck_arrival_date: string | null;
  port_of_entry:              string | null;
  paid_through_promptpay:     boolean;
  total_other_taxes_thb:      number | null;
  notes:                      string | null;
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function DeclarationDetailClient({
  data, lines,
}: {
  data:  DeclarationDetailData;
  lines: DeclarationLineData[];
}) {
  const isDraft = data.status === "draft";
  return (
    <div className="space-y-4">
      <HeaderPanel data={data} editable={isDraft} />
      <LinesPanel
        declarationId={data.id}
        lines={lines}
        editable={isDraft}
      />
      <StatusActions data={data} hasLines={lines.length > 0} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Header panel (editable in draft)
// ────────────────────────────────────────────────────────────

function HeaderPanel({ data, editable }: { data: DeclarationDetailData; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const [office,    setOffice]    = useState(data.customs_office ?? "");
  const [broker,    setBroker]    = useState(data.broker_name ?? "");
  const [brokerLic, setBrokerLic] = useState(data.broker_license_no ?? "");
  const [arrival,   setArrival]   = useState(data.ship_or_truck_arrival_date ?? "");
  const [portEntry, setPortEntry] = useState(data.port_of_entry ?? "");
  const [pp,        setPp]        = useState(data.paid_through_promptpay);
  const [otherTax,  setOtherTax]  = useState<number | "">(data.total_other_taxes_thb ?? "");
  const [notes,     setNotes]     = useState(data.notes ?? "");
  const [err,       setErr]       = useState<string | null>(null);

  function save() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateDeclarationHeader({
        id: data.id,
        customs_office:             office.trim()    || null,
        broker_name:                broker.trim()    || null,
        broker_license_no:          brokerLic.trim() || null,
        ship_or_truck_arrival_date: arrival          || null,
        port_of_entry:              portEntry.trim() || null,
        paid_through_promptpay:     pp,
        total_other_taxes_thb:      otherTax === "" ? null : Number(otherTax),
        notes:                      notes.trim() || null,
      });
      if (res.ok) { setEditing(false); router.refresh(); }
      else        setErr(res.error);
    });
  }

  if (!editing) {
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">🏛 ด่านศุลฯ + ตัวแทนออกของ</h2>
          {editable && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary-500 hover:underline">
              แก้ไข
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
          <p>ด่านศุลกากร: <span className="font-medium">{officeLabel(data.customs_office)}</span></p>
          <p>สถานที่ตรวจ: {data.port_of_entry ?? "—"}</p>
          <p>วันที่เรือ/รถเข้า: <span className="font-mono">{data.ship_or_truck_arrival_date ?? "—"}</span></p>
          <p>Broker: {data.broker_name ?? "—"}{data.broker_license_no && ` (#${data.broker_license_no})`}</p>
          <p>Control no ศุลฯ: <span className="font-mono">{data.customs_control_no ?? "—"}</span></p>
          <p>ชำระ PromptPay: {data.paid_through_promptpay ? "✓ ใช้" : "—"}</p>
          <p>ภาษีอื่นๆ: <span className="font-mono">{thb(data.total_other_taxes_thb)}</span></p>
        </div>
        {data.notes && <p className="mt-2 italic">📝 {data.notes}</p>}
      </section>
    );
  }

  return (
    <form
      className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3 text-xs"
      onSubmit={(e) => { e.preventDefault(); save(); }}
    >
      <h2 className="font-bold text-sm">🏛 แก้ไข header (draft)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="font-medium text-muted">ด่านศุลกากร</span>
          <select value={office} onChange={(e) => setOffice(e.target.value)} className="w-full rounded border border-border bg-white px-2 py-1.5">
            <option value="">— เลือกด่าน —</option>
            {CUSTOMS_OFFICES.map((o) => (
              <option key={o} value={o}>{CUSTOMS_OFFICE_LABEL[o]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-medium text-muted">สถานที่ตรวจ (port of entry)</span>
          <input type="text" value={portEntry} onChange={(e) => setPortEntry(e.target.value)} maxLength={200} className="w-full rounded border border-border bg-white px-2 py-1.5" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-muted">วันที่เรือ/รถเข้า</span>
          <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} className="w-full rounded border border-border bg-white px-2 py-1.5 font-mono" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-muted">ภาษีอื่นๆ (THB)</span>
          <input
            type="number" min={0} step={0.01} value={otherTax}
            onChange={(e) => setOtherTax(e.target.value === "" ? "" : Number(e.target.value) || 0)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 font-mono text-right"
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-muted">ตัวแทนออกของ (broker)</span>
          <input type="text" value={broker} onChange={(e) => setBroker(e.target.value)} maxLength={300} className="w-full rounded border border-border bg-white px-2 py-1.5" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-muted">เลขใบอนุญาต broker</span>
          <input type="text" value={brokerLic} onChange={(e) => setBrokerLic(e.target.value)} maxLength={50} className="w-full rounded border border-border bg-white px-2 py-1.5 font-mono" />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={pp} onChange={(e) => setPp(e.target.checked)} />
          <span>ชำระภาษีผ่าน PromptPay</span>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="font-medium text-muted">หมายเหตุ</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="w-full rounded border border-border bg-white px-2 py-1.5" />
        </label>
      </div>
      {err && <p className="text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "..." : "✓ บันทึก"}</button>
        <button type="button" onClick={() => { setEditing(false); setErr(null); }} disabled={pending} className="rounded border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
      </div>
    </form>
  );
}

function officeLabel(o: string | null): string {
  if (!o) return "—";
  return CUSTOMS_OFFICE_LABEL[o as CustomsOffice] ?? o;
}

// ────────────────────────────────────────────────────────────
// Lines panel
// ────────────────────────────────────────────────────────────

function LinesPanel({
  declarationId, lines, editable,
}: {
  declarationId: string;
  lines:         DeclarationLineData[];
  editable:      boolean;
}) {
  const totals = lines.reduce(
    (s, l) => ({
      declared: s.declared + Number(l.declared_value_thb ?? 0),
      duty:     s.duty     + Number(l.duty_thb ?? 0),
      vat:      s.vat      + Number(l.vat_thb ?? 0),
    }),
    { declared: 0, duty: 0, vat: 0 },
  );

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-sm">📦 รายการสินค้า (per HS code)</h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted">{lines.length} บรรทัด</span>
          {lines.length > 0 && (
            // owner 2026-06-28 #4 — กด export เป็น Excel (CSV เปิดด้วย Excel ได้ · BOM-safe).
            <CsvButton
              filename={`ใบขน-${declarationId.slice(0, 8)}.csv`}
              cols={[
                { key: "pos", label: "#" }, { key: "hs", label: "พิกัด HS" }, { key: "desc", label: "รายการสินค้า" },
                { key: "co", label: "ประเทศกำเนิด" }, { key: "qty", label: "จำนวน" }, { key: "unit", label: "หน่วย" },
                { key: "kg", label: "น้ำหนัก(กก.)" }, { key: "declared", label: "มูลค่าสำแดง(บาท)" }, { key: "dutyPct", label: "อากร%" },
                { key: "duty", label: "อากร(บาท)" }, { key: "vat", label: "VAT(บาท)" }, { key: "fta", label: "FTA" }, { key: "notes", label: "หมายเหตุ" },
              ]}
              rows={lines.map((l): CsvRow => ({
                pos: l.position, hs: l.hs_code ?? "", desc: l.description, co: l.country_of_origin,
                qty: l.qty, unit: l.unit, kg: l.gross_weight_kg ?? "", declared: Number(l.declared_value_thb).toFixed(2),
                dutyPct: Number(l.duty_rate_pct).toFixed(2), duty: Number(l.duty_thb).toFixed(2), vat: Number(l.vat_thb).toFixed(2),
                fta: l.fta_applied ? "ใช่" : "", notes: l.notes ?? "",
              }))}
            />
          )}
        </div>
      </div>
      {lines.length === 0 && editable && (
        <p className="px-5 py-3 text-xs text-muted">ยังไม่มี line — เพิ่ม line ด้านล่าง หรือสร้างจาก freight invoice ก่อน</p>
      )}
      {lines.length === 0 && !editable && (
        <p className="px-5 py-3 text-xs text-muted">ไม่มีรายการสินค้าในใบขนฯ นี้</p>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-2 w-10">#</th>
                <th className="px-2 py-2 w-24">HS code</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 w-14">CO</th>
                <th className="px-2 py-2 text-right w-16">Qty</th>
                <th className="px-2 py-2 w-14">Unit</th>
                <th className="px-2 py-2 text-right w-20">นน. kg</th>
                <th className="px-2 py-2 text-right w-28">Declared THB</th>
                <th className="px-2 py-2 text-right w-16">Duty %</th>
                <th className="px-2 py-2 text-right w-24">Duty THB</th>
                <th className="px-2 py-2 text-right w-24">VAT THB</th>
                <th className="px-2 py-2 w-14">FTA</th>
                {editable && <th className="px-2 py-2 w-28"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.id} item={l} editable={editable} />
              ))}
            </tbody>
            <tfoot className="bg-surface-alt/30 font-bold">
              <tr className="border-t-2 border-border">
                <td colSpan={7} className="px-2 py-2 text-right">รวม</td>
                <td className="px-2 py-2 text-right font-mono text-primary-700">{thb(totals.declared)}</td>
                <td></td>
                <td className="px-2 py-2 text-right font-mono">{thb(totals.duty)}</td>
                <td className="px-2 py-2 text-right font-mono">{thb(totals.vat)}</td>
                <td colSpan={editable ? 2 : 1}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editable && <AddLineRow declarationId={declarationId} />}
    </section>
  );
}

function LineRow({ item, editable }: { item: DeclarationLineData; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [hs,   setHs]   = useState(item.hs_code ?? "");
  const [desc, setDesc] = useState(item.description);
  const [co,   setCo]   = useState(item.country_of_origin ?? "CN");
  const [qty,  setQty]  = useState<number>(item.qty);
  const [unit, setUnit] = useState<CustomsLineUnit>((item.unit as CustomsLineUnit) ?? "PCS");
  const [kg,   setKg]   = useState<number | "">(item.gross_weight_kg ?? "");
  const [declared, setDeclared] = useState<number>(item.declared_value_thb);
  const [dutyPct, setDutyPct]   = useState<number>(item.duty_rate_pct);
  const [fta, setFta] = useState(item.fta_applied);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const evidenceCount = (item.evidence?.length ?? item.declared_value_images?.length ?? 0);

  const previewTaxes = computeLineTaxes({ declared_value_thb: declared, duty_rate_pct: dutyPct });

  function fireUpdate() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateDeclarationLine({
        id: item.id,
        hs_code:            hs.trim() || null,
        description:        desc.trim(),
        country_of_origin:  co.toUpperCase(),
        qty,
        unit,
        gross_weight_kg:    kg === "" ? null : Number(kg),
        declared_value_thb: declared,
        duty_rate_pct:      dutyPct,
        fta_applied:        fta,
      });
      if (res.ok) { setEditing(false); router.refresh(); }
      else        setErr(res.error);
    });
  }

  function fireDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await adminDeleteDeclarationLine({ id: item.id });
      if (res.ok) router.refresh();
      else        setErr(res.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-border bg-amber-50/40">
        <td className="px-2 py-2 text-xs">{item.position}</td>
        <td className="px-2 py-2"><input type="text" value={hs} onChange={(e) => setHs(e.target.value)} maxLength={20} className="w-full rounded border border-border bg-white px-1.5 py-1 text-xs font-mono" /></td>
        <td className="px-2 py-2"><input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded border border-border bg-white px-1.5 py-1 text-xs" /></td>
        <td className="px-2 py-2"><input type="text" value={co} onChange={(e) => setCo(e.target.value.toUpperCase().slice(0,2))} maxLength={2} className="w-12 rounded border border-border bg-white px-1.5 py-1 text-xs font-mono uppercase" /></td>
        <td className="px-2 py-2"><input type="number" min={0} step={0.001} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="w-16 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value as CustomsLineUnit)} className="w-full rounded border border-border bg-white px-1 py-1 text-xs">
            {CUSTOMS_LINE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td className="px-2 py-2"><input type="number" min={0} step={0.001} value={kg} onChange={(e) => setKg(e.target.value === "" ? "" : Number(e.target.value) || 0)} className="w-20 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2"><input type="number" min={0} step={0.01} value={declared} onChange={(e) => setDeclared(Number(e.target.value) || 0)} className="w-28 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2">
          <input type="number" min={0} max={100} step={0.001} value={dutyPct} onChange={(e) => setDutyPct(Number(e.target.value) || 0)} className="w-16 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" />
          {item.formEEligible && item.formEDutyPct !== undefined && (
            <button type="button" onClick={() => { setDutyPct(item.formEDutyPct!); setFta(true); }} className="mt-1 block w-full rounded bg-emerald-50 px-1 text-[10px] text-emerald-700 hover:bg-emerald-100" title="ใช้เรท Form-E (ACFTA) + ติ๊ก FTA — กดบันทึกเพื่อยืนยัน">✨ Form-E {item.formEDutyPct}%</button>
          )}
        </td>
        <td className="px-2 py-2 text-right font-mono text-xs">{thb(previewTaxes.duty_thb)}</td>
        <td className="px-2 py-2 text-right font-mono text-xs">{thb(previewTaxes.vat_thb)}</td>
        <td className="px-2 py-2 text-center"><input type="checkbox" checked={fta} onChange={(e) => setFta(e.target.checked)} /></td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <button type="button" onClick={fireUpdate} disabled={pending || !desc.trim()} className="rounded bg-primary-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50">✓</button>
          <button type="button" onClick={() => { setEditing(false); setErr(null); }} disabled={pending} className="ml-1 rounded border border-border bg-white px-2 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50">×</button>
          {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
        </td>
      </tr>
    );
  }

  return (
    <>
    <tr className="border-t border-border">
      <td className="px-2 py-2 text-xs">{item.position}</td>
      <td className="px-2 py-2 font-mono text-xs">{item.hs_code ?? "—"}</td>
      <td className="px-2 py-2 text-sm">
        {item.description}
        {item.fta_applied && <span className="ml-1 text-[11px] text-primary-600">(FTA)</span>}
        {item.formEEligible && !item.fta_applied && (
          <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-700" title={`พิกัดนี้เข้าเงื่อนไข Form-E (ACFTA) อากร ${item.formEDutyPct}% — ติ๊ก FTA + ใช้เรทได้`}>✨ Form-E ได้</span>
        )}
      </td>
      <td className="px-2 py-2 text-xs">{item.country_of_origin}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{item.qty}</td>
      <td className="px-2 py-2 text-xs">{item.unit}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{item.gross_weight_kg ?? "—"}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{thb(item.declared_value_thb)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{Number(item.duty_rate_pct).toFixed(2)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{thb(item.duty_thb)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{thb(item.vat_thb)}</td>
      <td className="px-2 py-2 text-center text-xs">{item.fta_applied ? "✓" : "—"}</td>
      {editable && (
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary-500 hover:underline">แก้</button>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-1 text-xs text-red-600 hover:underline">ลบ</button>
          ) : (
            <span className="ml-1">
              <button type="button" onClick={fireDelete} disabled={pending} className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50">✓</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="ml-0.5 text-[11px] text-muted hover:underline">×</button>
            </span>
          )}
          <br />
          <button type="button" onClick={() => setShowEvidence((v) => !v)} className="mt-1 text-[11px] text-indigo-600 hover:underline">📎 หลักฐานมูลค่า{evidenceCount > 0 ? ` (${evidenceCount})` : ""}</button>
          {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
        </td>
      )}
    </tr>
    {showEvidence && (
      <tr className="border-t border-border bg-indigo-50/30">
        <td colSpan={13} className="px-3 py-3">
          <LineEvidence item={item} editable={editable} />
        </td>
      </tr>
    )}
    </>
  );
}

/** Declared-value justification panel (owner 2026-06-28 #2): หมายเหตุ (basis · the
 *  line's notes) + multi-image evidence. Editable while the declaration is draft. */
function LineEvidence({ item, editable }: { item: DeclarationLineData; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [basis, setBasis] = useState(item.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const evidence = item.evidence ?? [];

  function saveBasis() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateDeclarationLine({ id: item.id, notes: basis.trim() || null });
      if (res.ok) router.refresh(); else setErr(res.error);
    });
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    const fd = new FormData();
    fd.set("lineId", item.id);
    fd.set("file", file);
    startTransition(async () => {
      const res = await adminAddDeclarationLineImage(fd);
      if (res.ok) router.refresh(); else setErr(res.error);
    });
    e.target.value = "";
  }
  function removeImg(key: string) {
    setErr(null);
    startTransition(async () => {
      const res = await adminRemoveDeclarationLineImage({ lineId: item.id, imageKey: key });
      if (res.ok) router.refresh(); else setErr(res.error);
    });
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold text-indigo-900">มูลค่าสำแดง — หมายเหตุ + หลักฐาน (รายการ #{item.position})</p>
      <div className="flex flex-wrap items-start gap-2">
        <textarea rows={2} value={basis} onChange={(e) => setBasis(e.target.value)} disabled={!editable || pending} maxLength={2000}
          placeholder="หมายเหตุ/เหตุผลของมูลค่าสำแดง (เช่น อ้างอิงใบกำกับซัพพลายเออร์)"
          className="min-w-[260px] flex-1 rounded border border-border bg-white px-2 py-1.5" />
        {editable && <button type="button" onClick={saveBasis} disabled={pending} className="rounded bg-primary-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50">บันทึกหมายเหตุ</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {evidence.map((e) => (
          <div key={e.key} className="relative">
            {e.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={e.url} target="_blank" rel="noopener noreferrer"><img src={e.url} alt="หลักฐาน" className="h-16 w-16 rounded border border-border object-cover" /></a>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded border border-border bg-surface-alt text-[10px] text-muted">รูป</div>
            )}
            {editable && <button type="button" onClick={() => removeImg(e.key)} disabled={pending} className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1 text-[10px] font-bold text-white hover:bg-red-700">×</button>}
          </div>
        ))}
        {evidence.length === 0 && <span className="text-muted">ยังไม่มีรูปหลักฐาน</span>}
        {editable && (
          <label className="cursor-pointer rounded border border-dashed border-indigo-300 bg-white px-3 py-2 text-[11px] text-indigo-700 hover:bg-indigo-50">
            + แนบรูป
            <input type="file" accept="image/*" onChange={onFile} disabled={pending} className="hidden" />
          </label>
        )}
      </div>
      {!editable && <p className="text-muted">แก้ไข/แนบได้เฉพาะตอนเอกสารเป็นร่าง (draft)</p>}
      {err && <p className="text-red-700">{err}</p>}
    </div>
  );
}

function AddLineRow({ declarationId }: { declarationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [hs,   setHs]   = useState("");
  const [desc, setDesc] = useState("");
  const [co,   setCo]   = useState("CN");
  const [qty,  setQty]  = useState<number>(1);
  const [unit, setUnit] = useState<CustomsLineUnit>("PCS");
  const [kg,   setKg]   = useState<number | "">("");
  const [declared, setDeclared] = useState<number>(0);
  const [dutyPct, setDutyPct]   = useState<number>(0);
  const [fta, setFta] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const previewTaxes = computeLineTaxes({ declared_value_thb: declared, duty_rate_pct: dutyPct });

  function reset() {
    setHs(""); setDesc(""); setCo("CN"); setQty(1); setUnit("PCS");
    setKg(""); setDeclared(0); setDutyPct(0); setFta(false); setErr(null);
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminAddDeclarationLine({
        declaration_id: declarationId,
        hs_code:            hs.trim() || null,
        description:        desc.trim(),
        country_of_origin:  co.toUpperCase(),
        qty,
        unit,
        gross_weight_kg:    kg === "" ? undefined : Number(kg),
        declared_value_thb: declared,
        duty_rate_pct:      dutyPct,
        fta_applied:        fta,
      });
      if (res.ok) { reset(); setOpen(false); router.refresh(); }
      else        setErr(res.error);
    });
  }

  if (!open) {
    return (
      <div className="px-5 py-3 border-t border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-dashed border-border bg-surface-alt/40 px-4 py-2 text-sm text-primary-600 hover:bg-surface-alt"
        >
          ➕ เพิ่ม line item
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 border-t border-border bg-surface-alt/30 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <input type="text" placeholder="HS code" value={hs} onChange={(e) => setHs(e.target.value)} maxLength={20} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <input type="text" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} className="rounded border border-border bg-white px-2 py-1.5 text-xs lg:col-span-2" />
        <input type="text" placeholder="กำเนิด (CN)" value={co} onChange={(e) => setCo(e.target.value.toUpperCase().slice(0,2))} maxLength={2} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono uppercase" />
        <input type="number" min={0} step={0.001} placeholder="Qty" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <select value={unit} onChange={(e) => setUnit(e.target.value as CustomsLineUnit)} className="rounded border border-border bg-white px-2 py-1.5 text-xs">
          {CUSTOMS_LINE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" min={0} step={0.001} placeholder="นน. kg" value={kg} onChange={(e) => setKg(e.target.value === "" ? "" : Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <input type="number" min={0} step={0.01} placeholder="Declared THB" value={declared} onChange={(e) => setDeclared(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <input type="number" min={0} max={100} step={0.001} placeholder="Duty %" value={dutyPct} onChange={(e) => setDutyPct(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={fta} onChange={(e) => setFta(e.target.checked)} /> FTA</label>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          ค่า preview: duty <span className="font-mono">{thb(previewTaxes.duty_thb)}</span> ·
          VAT <span className="font-mono">{thb(previewTaxes.vat_thb)}</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={fire} disabled={pending || !desc.trim() || qty < 0} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "..." : "✓ เพิ่ม"}</button>
          <button type="button" onClick={() => { reset(); setOpen(false); }} disabled={pending} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
        </div>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Status actions
// ────────────────────────────────────────────────────────────

function StatusActions({ data, hasLines }: { data: DeclarationDetailData; hasLines: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // submit-state local form
  const [submitOpen, setSubmitOpen]   = useState(false);
  const [submitOffice, setSubmitOffice] = useState(data.customs_office ?? "");
  const [submitBroker, setSubmitBroker] = useState(data.broker_name ?? "");

  // accept-state local form
  const [acceptOpen, setAcceptOpen]   = useState(false);
  const [acceptCtrlNo, setAcceptCtrlNo] = useState(data.customs_control_no ?? "");

  // cancel-state local form
  const [cancelOpen, setCancelOpen]   = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  function call(fn: () => Promise<{ ok: boolean; error?: string }>, afterOk?: () => void) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        afterOk?.();
        router.refresh();
      } else {
        setErr(translateError(res.error ?? "unknown"));
      }
    });
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm">การดำเนินการ</h2>

      <div className="flex flex-wrap gap-2">
        {data.status === "draft" && (
          <button
            type="button"
            onClick={() => setSubmitOpen(true)}
            disabled={pending || !hasLines}
            title={!hasLines ? "ต้องมี line อย่างน้อย 1" : ""}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            📨 ยื่นที่ด่านศุลฯ (submit)
          </button>
        )}
        {data.status === "submitted" && (
          <button
            type="button"
            onClick={() => setAcceptOpen(true)}
            disabled={pending}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            ✓ ศุลฯ ตรวจรับแล้ว
          </button>
        )}
        {data.status === "accepted" && (
          <button
            type="button"
            onClick={() => call(() => adminMarkReleased({ id: data.id }))}
            disabled={pending}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            🚚 ตรวจปล่อย (released)
          </button>
        )}
        {!["released", "cancelled"].includes(data.status) && !cancelOpen && (
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            ✗ ยกเลิก
          </button>
        )}
      </div>

      {/* Submit form */}
      {submitOpen && data.status === "draft" && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 space-y-2">
          <p className="text-xs font-bold text-blue-900">ยื่นที่ด่านศุลฯ — กรอกข้อมูลขั้นต่ำ</p>
          <label className="block text-xs space-y-1">
            <span className="font-medium text-muted">ด่านศุลกากร (จำเป็น)</span>
            <select value={submitOffice} onChange={(e) => setSubmitOffice(e.target.value)} className="w-full rounded border border-border bg-white px-2 py-1.5">
              <option value="">— เลือกด่าน —</option>
              {CUSTOMS_OFFICES.map((o) => (
                <option key={o} value={o}>{CUSTOMS_OFFICE_LABEL[o]}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs space-y-1">
            <span className="font-medium text-muted">Broker (เลือกก็ได้)</span>
            <input type="text" value={submitBroker} onChange={(e) => setSubmitBroker(e.target.value)} maxLength={300} className="w-full rounded border border-border bg-white px-2 py-1.5" />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => call(
                () => adminSubmitDeclaration({
                  id: data.id,
                  customs_office: submitOffice,
                  broker_name:    submitBroker.trim() || null,
                }),
                () => setSubmitOpen(false),
              )}
              disabled={pending || !submitOffice.trim()}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              ✓ ยื่น
            </button>
            <button type="button" onClick={() => { setSubmitOpen(false); }} disabled={pending} className="rounded border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">×</button>
          </div>
        </div>
      )}

      {/* Accept form */}
      {acceptOpen && data.status === "submitted" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-bold text-amber-900">ศุลฯ ตรวจรับ — กรอก control no ที่ได้รับจาก broker (เลือกก็ได้)</p>
          <input
            type="text"
            placeholder="customs_control_no"
            value={acceptCtrlNo}
            onChange={(e) => setAcceptCtrlNo(e.target.value)}
            maxLength={100}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => call(
                () => adminMarkAccepted({
                  id: data.id,
                  customs_control_no: acceptCtrlNo.trim() || null,
                }),
                () => setAcceptOpen(false),
              )}
              disabled={pending}
              className="rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              ✓ ตรวจรับ
            </button>
            <button type="button" onClick={() => setAcceptOpen(false)} disabled={pending} className="rounded border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">×</button>
          </div>
        </div>
      )}

      {/* Cancel form */}
      {cancelOpen && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-bold text-red-900">เหตุผลที่ยกเลิก (≥3 ตัวอักษร)</p>
          <textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => call(
                () => adminCancelDeclaration({
                  id: data.id,
                  cancelled_reason: cancelReason.trim(),
                }),
                () => setCancelOpen(false),
              )}
              disabled={pending || cancelReason.trim().length < 3}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✓ ยืนยัน
            </button>
            <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); }} disabled={pending} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">×</button>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed"))         return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("insert_failed"))         return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("delete_failed"))         return `ลบล้มเหลว: ${code}`;
  if (code.startsWith("existing_declaration"))  return `มีใบขนสินค้าอยู่แล้ว (${code})`;
  if (code.startsWith("serial_reserve_failed")) return `รับเลขที่ใบขนฯ ไม่ได้: ${code}`;
  switch (code) {
    case "not_found":        return "ไม่พบ";
    case "not_draft":        return "ไม่ใช่สถานะ draft";
    case "not_submitted":    return "ไม่ใช่สถานะ submitted";
    case "not_accepted":     return "ไม่ใช่สถานะ accepted";
    case "no_lines":         return "ต้องมี line อย่างน้อย 1";
    case "shipment_not_found":    return "ไม่พบ shipment";
    case "shipment_cancelled":    return "shipment ถูกยกเลิกแล้ว";
    case "already_released":      return "ตรวจปล่อยแล้ว ยกเลิกไม่ได้";
    case "already_cancelled":     return "ยกเลิกอยู่แล้ว";
    case "parent_not_found":      return "ไม่พบ declaration หลัก";
    case "invalid_input":         return "ข้อมูลไม่ถูกต้อง";
    default:                      return code;
  }
}
