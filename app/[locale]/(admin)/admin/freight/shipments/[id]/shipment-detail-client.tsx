"use client";

/**
 * V-E1 — admin client for parties + invoice/lines CRUD + status flips.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminUpsertFreightParty,
  adminConfirmFreightShipment, adminMarkFreightInProgress,
  adminMarkFreightCleared, adminMarkFreightDelivered,
  adminCancelFreightShipment,
} from "@/actions/admin/freight-shipments";
import {
  adminCreateFreightInvoice, adminAddFreightInvoiceLine,
  adminUpdateFreightInvoiceLine, adminDeleteFreightInvoiceLine,
  adminIssueFreightInvoice, adminCancelFreightInvoice,
} from "@/actions/admin/freight-invoices";
import {
  recordFreightPayment, voidFreightPayment, uploadFreightPaymentSlip,
} from "@/actions/admin/freight-invoice-payments";
import {
  FREIGHT_LINE_UNITS, FREIGHT_INVOICE_STATUS_LABEL,
  type FreightShipmentStatus, type FreightLineUnit, type FreightInvoiceStatus,
} from "@/lib/validators/freight-shipment";
import {
  FREIGHT_PAYMENT_METHODS, FREIGHT_PAYMENT_METHOD_LABEL,
  FREIGHT_INVOICE_PAYMENT_STATUS_LABEL,
  type FreightPaymentMethod, type FreightInvoicePaymentStatus,
} from "@/lib/validators/freight-payment";

export type PartyData = {
  id:       string;
  role:     string;
  name:     string;
  address:  string;
  tax_id:   string | null;
  branch:   string | null;
};

export type LineItemData = {
  id:               string;
  position:         number;
  marks:            string | null;
  description:      string;
  qty:              number;
  unit:             string;
  unit_price_usd:   number;
  amount_usd:       number;
  cartons:          number | null;
  gross_weight_kg:  number | null;
  hs_code:          string | null;
};

export type InvoiceData = {
  id:                  string;
  status:              FreightInvoiceStatus;
  invoice_no:          string | null;
  issued_at:           string | null;
  cancelled_at:        string | null;
  cancellation_reason: string | null;
  notes:               string | null;
  /** V-E7 payment settlement axis — separate from `status` (document lifecycle). */
  payment_status:      FreightInvoicePaymentStatus;
  fully_paid_at:       string | null;
};

/** V-E7 — one ledger row in the payment panel. */
export type PaymentLedgerRow = {
  id:                   string;
  method:               string;
  amount_thb:           number;
  paid_at:              string;
  slip_storage_path:    string | null;
  bank_ref:             string | null;
  status:               "recorded" | "voided";
  void_reason:          string | null;
  recorded_by_admin_id: string;
  notes:                string | null;
  created_at:           string;
};

/** V-E7 — payment panel server-computed bundle for the active issued invoice. */
export type PaymentPanelData = {
  invoiceId:       string;
  invoiceNo:       string | null;
  payments:        PaymentLedgerRow[];
  paidThb:         number;
  totalThb:        number;
  outstandingThb:  number;
  paymentStatus:   FreightInvoicePaymentStatus;
};

export type ShipmentDetailData = {
  id:                          string;
  job_no:                      string | null;
  status:                      FreightShipmentStatus;
  isSuperOrAccounting:         boolean;
  commercial_value_usd:        number | null;
  exchange_rate:               number | null;
  declared_customs_value_thb:  number | null;
  declared_value_basis:        string | null;
  hs_code:                     string | null;
  duty_rate_pct:               number | null;
  vat_base_thb:                number | null;
  vat_plan_label:              string | null;
  form_e_applied:              boolean;
  rate_date:                   string | null;
};

type Props = {
  data:           ShipmentDetailData;
  parties:        PartyData[];
  activeInvoice:  InvoiceData | null;
  lines:          LineItemData[];
  allInvoices:    InvoiceData[];
  paymentPanel:   PaymentPanelData | null;
};

function usd(n: number | null): string {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function ShipmentDetailClient({ data, parties, activeInvoice, lines, allInvoices, paymentPanel }: Props) {
  const editable = !["delivered", "cancelled"].includes(data.status);
  void allInvoices; // shown in parent footer
  return (
    <div className="space-y-4">
      <PartiesPanel shipmentId={data.id} parties={parties} editable={editable} />
      <InvoicePanel shipmentId={data.id} activeInvoice={activeInvoice} lines={lines} shipmentEditable={editable} valueBlockReady={data.commercial_value_usd != null && data.exchange_rate != null} />
      {paymentPanel && <PaymentPanel panel={paymentPanel} />}
      <StatusActions data={data} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Parties (shipper + consignee)
// ────────────────────────────────────────────────────────────

function PartiesPanel({ shipmentId, parties, editable }: { shipmentId: string; parties: PartyData[]; editable: boolean }) {
  const shipper   = parties.find((p) => p.role === "shipper")   ?? null;
  const consignee = parties.find((p) => p.role === "consignee") ?? null;
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4">
      <h2 className="font-bold text-sm">📦 ผู้ส่ง + ผู้รับ</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <PartyForm shipmentId={shipmentId} role="shipper"   existing={shipper}   editable={editable} />
        <PartyForm shipmentId={shipmentId} role="consignee" existing={consignee} editable={editable} />
      </div>
    </section>
  );
}

function PartyForm({
  shipmentId, role, existing, editable,
}: {
  shipmentId: string; role: "shipper" | "consignee"; existing: PartyData | null; editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(existing?.name    ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [taxId,   setTaxId]   = useState(existing?.tax_id  ?? "");
  const [branch,  setBranch]  = useState(existing?.branch  ?? "");
  const [err,     setErr]     = useState<string | null>(null);

  const label = role === "shipper" ? "Shipper (ผู้ส่ง — จีน)" : "Consignee (ผู้รับ — ไทย)";

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpsertFreightParty({
        freight_shipment_id: shipmentId,
        role,
        name:    name.trim(),
        address: address.trim(),
        tax_id:  role === "consignee" ? (taxId.trim() || null) : null,
        branch:  role === "consignee" ? (branch.trim() || null) : null,
      });
      if (res.ok) { setEditing(false); router.refresh(); }
      else        setErr(res.error);
    });
  }

  if (!editing && existing) {
    return (
      <div className="rounded-lg border border-border bg-surface-alt/30 p-4 space-y-1">
        <p className="text-xs font-bold uppercase text-muted">{label}</p>
        <p className="font-medium">{existing.name}</p>
        <p className="text-xs whitespace-pre-line">{existing.address}</p>
        {existing.tax_id && <p className="text-xs">เลขผู้เสียภาษี: <span className="font-mono">{existing.tax_id}</span></p>}
        {existing.branch && <p className="text-xs">สาขา: {existing.branch}</p>}
        {editable && (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs text-primary-500 hover:underline">
            แก้ไข
          </button>
        )}
      </div>
    );
  }

  if (!editable && !existing) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-alt/30 p-4 text-xs text-muted">
        ยังไม่มีข้อมูล {label}
      </div>
    );
  }

  return (
    <form
      className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-2"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={300} className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm" required />
      <textarea rows={2} placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm" required />
      {role === "consignee" && (
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Tax ID (13)" value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))} maxLength={13} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
          <input type="text" placeholder="Branch (สำนักงานใหญ่)" value={branch} onChange={(e) => setBranch(e.target.value)} maxLength={100} className="rounded border border-border bg-white px-2 py-1.5 text-xs" />
        </div>
      )}
      {err && <p className="text-[11px] text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !name.trim() || !address.trim()} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "..." : "✓ บันทึก"}</button>
        {existing && (
          <button type="button" onClick={() => { setEditing(false); setName(existing.name); setAddress(existing.address); setTaxId(existing.tax_id ?? ""); setBranch(existing.branch ?? ""); setErr(null); }} disabled={pending} className="rounded border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
        )}
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Invoice + Lines panel
// ────────────────────────────────────────────────────────────

function InvoicePanel({
  shipmentId, activeInvoice, lines, shipmentEditable, valueBlockReady,
}: {
  shipmentId:        string;
  activeInvoice:     InvoiceData | null;
  lines:             LineItemData[];
  shipmentEditable:  boolean;
  valueBlockReady:   boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function createDraft() {
    setErr(null);
    startTransition(async () => {
      const res = await adminCreateFreightInvoice({ freight_shipment_id: shipmentId });
      if (res.ok) router.refresh();
      else        setErr(res.error);
    });
  }

  if (!activeInvoice) {
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">📄 Commercial Invoice</h2>
        <p className="text-xs text-muted">ยังไม่มี invoice — สร้าง draft เพื่อเพิ่ม line items + ออก invoice</p>
        {shipmentEditable && (
          <button
            type="button"
            onClick={createDraft}
            disabled={pending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "..." : "➕ สร้าง draft invoice"}
          </button>
        )}
        {err && <p className="text-xs text-red-700">{err}</p>}
      </section>
    );
  }

  const inv = activeInvoice;
  const isDraft = inv.status === "draft";

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-sm">
          📄 Commercial Invoice {inv.invoice_no ? <span className="font-mono">{inv.invoice_no}</span> : <span className="text-muted">(ร่าง)</span>}
          <span className="ml-2 text-[10px] font-normal text-muted">{FREIGHT_INVOICE_STATUS_LABEL[inv.status]}</span>
        </h2>
        <div className="flex items-center gap-2">
          {/* V-E1.1 PDF downloads — works for draft too (uses live shipment fallback) */}
          <a
            href={`/api/freight-invoice/${inv.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs text-primary-700 hover:bg-primary-50"
          >
            📥 CI (USD)
          </a>
          <a
            href={`/api/freight-invoice/${inv.id}/packing-list`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            📥 Packing List
          </a>
          <InvoiceActions invoice={inv} hasLines={lines.length > 0} valueBlockReady={valueBlockReady} />
        </div>
      </div>

      {lines.length === 0 && isDraft && (
        <p className="px-5 py-3 text-xs text-muted">ยังไม่มี line items — เพิ่ม line ด้านล่างก่อน issue</p>
      )}
      {lines.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 w-10">#</th>
              <th className="px-2 py-2 w-24">Marks</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2 text-right w-20">Qty</th>
              <th className="px-2 py-2 w-16">Unit</th>
              <th className="px-2 py-2 text-right w-28">U/Price USD</th>
              <th className="px-2 py-2 text-right w-28">Amount USD</th>
              <th className="px-2 py-2 text-right w-16">Cartons</th>
              <th className="px-2 py-2 text-right w-20">kg</th>
              <th className="px-2 py-2 w-24">HS</th>
              {isDraft && <th className="px-2 py-2 w-28"></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <LineRow key={l.id} item={l} editable={isDraft} />
            ))}
          </tbody>
          <tfoot className="bg-surface-alt/30 font-bold">
            <tr className="border-t-2 border-border">
              <td colSpan={6} className="px-2 py-2 text-right">รวม USD</td>
              <td className="px-2 py-2 text-right font-mono text-primary-700">{usd(lines.reduce((s, l) => s + Number(l.amount_usd), 0))}</td>
              <td className="px-2 py-2 text-right font-mono text-xs">{lines.reduce((s, l) => s + (l.cartons ?? 0), 0)}</td>
              <td className="px-2 py-2 text-right font-mono text-xs">{lines.reduce((s, l) => s + Number(l.gross_weight_kg ?? 0), 0).toFixed(2)}</td>
              <td colSpan={isDraft ? 2 : 1}></td>
            </tr>
          </tfoot>
        </table>
      )}

      {isDraft && shipmentEditable && <AddLineRow invoiceId={inv.id} />}

      {inv.cancellation_reason && (
        <div className="px-5 py-3 border-t border-red-200 bg-red-50 text-xs text-red-800">
          <strong>ยกเลิก:</strong> {inv.cancellation_reason}
        </div>
      )}
    </section>
  );
}

function LineRow({ item, editable }: { item: LineItemData; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(item.description);
  const [qty, setQty] = useState<number>(item.qty);
  const [unit, setUnit] = useState<FreightLineUnit>((item.unit as FreightLineUnit) ?? "PCS");
  const [price, setPrice] = useState<number>(item.unit_price_usd);
  const [marks, setMarks] = useState(item.marks ?? "");
  const [cartons, setCartons] = useState<number | "">(item.cartons ?? "");
  const [kg, setKg] = useState<number | "">(item.gross_weight_kg ?? "");
  const [hs, setHs] = useState(item.hs_code ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function fireUpdate() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateFreightInvoiceLine({
        id: item.id,
        description: desc, qty, unit, unit_price_usd: price,
        marks: marks.trim() || null,
        cartons: cartons === "" ? null : Number(cartons),
        gross_weight_kg: kg === "" ? null : Number(kg),
        hs_code: hs.trim() || null,
      });
      if (res.ok) { setEditing(false); router.refresh(); }
      else        setErr(res.error);
    });
  }

  function fireDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await adminDeleteFreightInvoiceLine({ id: item.id });
      if (res.ok) router.refresh();
      else        setErr(res.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-border bg-amber-50/40">
        <td className="px-2 py-2 text-xs">{item.position}</td>
        <td className="px-2 py-2"><input type="text" value={marks} onChange={(e) => setMarks(e.target.value)} className="w-full rounded border border-border bg-white px-1.5 py-1 text-xs" /></td>
        <td className="px-2 py-2"><input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded border border-border bg-white px-1.5 py-1 text-xs" /></td>
        <td className="px-2 py-2"><input type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="w-20 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value as FreightLineUnit)} className="w-full rounded border border-border bg-white px-1 py-1 text-xs">
            {FREIGHT_LINE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td className="px-2 py-2"><input type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="w-24 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2 text-right font-mono text-xs">{usd(qty * price)}</td>
        <td className="px-2 py-2"><input type="number" min={0} step={1} value={cartons} onChange={(e) => setCartons(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))} className="w-16 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2"><input type="number" min={0} step={0.001} value={kg} onChange={(e) => setKg(e.target.value === "" ? "" : Number(e.target.value) || 0)} className="w-20 rounded border border-border bg-white px-1.5 py-1 text-xs text-right font-mono" /></td>
        <td className="px-2 py-2"><input type="text" value={hs} onChange={(e) => setHs(e.target.value)} maxLength={20} className="w-24 rounded border border-border bg-white px-1.5 py-1 text-xs font-mono" /></td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <button type="button" onClick={fireUpdate} disabled={pending || !desc.trim()} className="rounded bg-primary-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-primary-700 disabled:opacity-50">✓</button>
          <button type="button" onClick={() => { setEditing(false); setErr(null); }} disabled={pending} className="ml-1 rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt disabled:opacity-50">×</button>
          {err && <p className="mt-1 text-[10px] text-red-700">{err}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border">
      <td className="px-2 py-2 text-xs">{item.position}</td>
      <td className="px-2 py-2 text-xs">{item.marks ?? "—"}</td>
      <td className="px-2 py-2 text-sm">{item.description}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{item.qty}</td>
      <td className="px-2 py-2 text-xs">{item.unit}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{usd(item.unit_price_usd)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs font-bold">{usd(item.amount_usd)}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{item.cartons ?? "—"}</td>
      <td className="px-2 py-2 text-right font-mono text-xs">{item.gross_weight_kg ?? "—"}</td>
      <td className="px-2 py-2 font-mono text-xs">{item.hs_code ?? "—"}</td>
      {editable && (
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary-500 hover:underline">แก้</button>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-1 text-xs text-red-600 hover:underline">ลบ</button>
          ) : (
            <span className="ml-1">
              <button type="button" onClick={fireDelete} disabled={pending} className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50">✓</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="ml-0.5 text-[10px] text-muted hover:underline">×</button>
            </span>
          )}
          {err && <p className="mt-1 text-[10px] text-red-700">{err}</p>}
        </td>
      )}
    </tr>
  );
}

function AddLineRow({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [unit, setUnit] = useState<FreightLineUnit>("PCS");
  const [price, setPrice] = useState<number>(0);
  const [marks, setMarks] = useState("");
  const [cartons, setCartons] = useState<number | "">("");
  const [kg, setKg] = useState<number | "">("");
  const [hs, setHs] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setDesc(""); setQty(1); setUnit("PCS"); setPrice(0); setMarks(""); setCartons(""); setKg(""); setHs(""); setErr(null);
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminAddFreightInvoiceLine({
        freight_invoice_id: invoiceId,
        description: desc, qty, unit, unit_price_usd: price,
        marks: marks.trim() || undefined,
        cartons: cartons === "" ? undefined : Number(cartons),
        gross_weight_kg: kg === "" ? undefined : Number(kg),
        hs_code: hs.trim() || undefined,
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
        <input type="text" placeholder="Marks (optional)" value={marks} onChange={(e) => setMarks(e.target.value)} maxLength={200} className="rounded border border-border bg-white px-2 py-1.5 text-xs" />
        <input type="text" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} className="rounded border border-border bg-white px-2 py-1.5 text-xs lg:col-span-2" />
        <input type="number" min={0.001} step={0.001} placeholder="Qty" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <select value={unit} onChange={(e) => setUnit(e.target.value as FreightLineUnit)} className="rounded border border-border bg-white px-2 py-1.5 text-xs">
          {FREIGHT_LINE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" min={0} step={0.01} placeholder="U/Price USD" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <input type="number" min={0} step={1} placeholder="Cartons" value={cartons} onChange={(e) => setCartons(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <input type="number" min={0} step={0.001} placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value === "" ? "" : Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
        <input type="text" placeholder="HS code" value={hs} onChange={(e) => setHs(e.target.value)} maxLength={20} className="rounded border border-border bg-white px-2 py-1.5 text-xs font-mono" />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">รวม: <span className="font-mono font-bold">{usd(qty * price)}</span></p>
        <div className="flex gap-2">
          <button type="button" onClick={fire} disabled={pending || !desc.trim() || qty <= 0 || price < 0} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "..." : "✓ เพิ่ม"}</button>
          <button type="button" onClick={() => { reset(); setOpen(false); }} disabled={pending} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
        </div>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </div>
  );
}

function InvoiceActions({
  invoice, hasLines, valueBlockReady,
}: {
  invoice: InvoiceData; hasLines: boolean; valueBlockReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  function fireIssue() {
    setErr(null);
    startTransition(async () => {
      const res = await adminIssueFreightInvoice({ id: invoice.id });
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error));
    });
  }

  function fireCancel() {
    setErr(null);
    startTransition(async () => {
      const res = await adminCancelFreightInvoice({ id: invoice.id, cancellation_reason: cancelReason });
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error));
    });
  }

  if (invoice.status === "draft") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={fireIssue}
          disabled={pending || !hasLines || !valueBlockReady}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
          title={!valueBlockReady ? "ต้องกรอก commercial_value_usd + exchange_rate ก่อน issue" : !hasLines ? "ต้องมี line อย่างน้อย 1" : ""}
        >
          📨 ออกใบ (issue)
        </button>
        {err && <p className="text-[11px] text-red-700">{err}</p>}
      </div>
    );
  }

  if (invoice.status === "issued") {
    return (
      <div className="space-y-2">
        {!showCancel ? (
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
          >
            ✗ ยกเลิก
          </button>
        ) : (
          <div className="rounded-lg border border-red-300 bg-red-50 p-2 space-y-1">
            <p className="text-[11px] font-bold">เหตุผล (≥3 ตัว)</p>
            <textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} className="w-full rounded border border-border bg-white px-2 py-1 text-xs" />
            <div className="flex gap-1">
              <button type="button" onClick={fireCancel} disabled={pending || cancelReason.trim().length < 3} className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50">✓ ยกเลิก</button>
              <button type="button" onClick={() => { setShowCancel(false); setCancelReason(""); }} disabled={pending} className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt disabled:opacity-50">×</button>
            </div>
            {err && <p className="text-[11px] text-red-700">{err}</p>}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// Payment panel (V-E7) — ledger + record-payment form + receipt
// ────────────────────────────────────────────────────────────

const PAYMENT_STATUS_BADGE: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "bg-gray-50 text-gray-600 border-gray-200",
  partial:  "bg-amber-50 text-amber-700 border-amber-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  overpaid: "bg-purple-50 text-purple-700 border-purple-200",
};

function PaymentPanel({ panel }: { panel: PaymentPanelData }) {
  const recorded = panel.payments.filter((p) => p.status === "recorded");
  const voided   = panel.payments.filter((p) => p.status === "voided");

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-sm">
          💰 การชำระเงิน (ใบเสร็จ)
          <span className={`ml-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${PAYMENT_STATUS_BADGE[panel.paymentStatus]}`}>
            {FREIGHT_INVOICE_PAYMENT_STATUS_LABEL[panel.paymentStatus]}
          </span>
        </h2>
        <a
          href={`/api/freight-receipt/${panel.invoiceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
        >
          📄 ดาวน์โหลดใบเสร็จ PDF
        </a>
      </div>

      {/* Totals summary */}
      <div className="grid grid-cols-3 gap-px bg-border text-center text-xs">
        <div className="bg-white dark:bg-surface px-3 py-3">
          <p className="text-muted">ยอดรวมที่ต้องชำระ</p>
          <p className="mt-1 font-mono font-bold">{thb(panel.totalThb)}</p>
        </div>
        <div className="bg-white dark:bg-surface px-3 py-3">
          <p className="text-muted">ชำระแล้ว</p>
          <p className="mt-1 font-mono font-bold text-green-700">{thb(panel.paidThb)}</p>
        </div>
        <div className="bg-white dark:bg-surface px-3 py-3">
          <p className="text-muted">คงค้าง</p>
          <p className={`mt-1 font-mono font-bold ${panel.outstandingThb > 0 ? "text-amber-700" : "text-muted"}`}>
            {thb(panel.outstandingThb)}
          </p>
        </div>
      </div>

      {panel.totalThb <= 0 && (
        <p className="px-5 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
          ⚠️ invoice นี้ยังไม่มียอดเงิน (value block ว่าง) — บันทึกการชำระไม่ได้จนกว่าจะมียอด
        </p>
      )}

      {/* Recorded payments table */}
      {recorded.length > 0 && (
        <table className="w-full text-sm border-t border-border">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">วันที่ชำระ</th>
              <th className="px-3 py-2">วิธีชำระ</th>
              <th className="px-3 py-2">อ้างอิงธนาคาร</th>
              <th className="px-3 py-2 text-right">จำนวนเงิน</th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {recorded.map((p) => (
              <PaymentRow key={p.id} row={p} />
            ))}
          </tbody>
        </table>
      )}
      {recorded.length === 0 && panel.totalThb > 0 && (
        <p className="px-5 py-3 text-xs text-muted border-t border-border">
          ยังไม่มีการบันทึกการชำระเงิน — เพิ่มรายการด้านล่าง
        </p>
      )}

      {/* Voided payments (audit visibility) */}
      {voided.length > 0 && (
        <div className="px-5 py-3 border-t border-border">
          <p className="text-[11px] font-bold uppercase text-muted mb-1">รายการที่ยกเลิก ({voided.length})</p>
          <ul className="space-y-1 text-xs">
            {voided.map((p) => (
              <li key={p.id} className="text-muted line-through decoration-red-400">
                {new Date(p.paid_at).toLocaleDateString("th-TH")} ·{" "}
                {FREIGHT_PAYMENT_METHOD_LABEL[p.method as FreightPaymentMethod] ?? p.method} ·{" "}
                {thb(p.amount_thb)}
                {p.void_reason && <span className="ml-1 no-underline">— {p.void_reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Record-payment form */}
      {panel.totalThb > 0 && (
        <RecordPaymentForm invoiceId={panel.invoiceId} outstandingThb={panel.outstandingThb} />
      )}
    </section>
  );
}

function PaymentRow({ row }: { row: PaymentLedgerRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function fireVoid() {
    setErr(null);
    startTransition(async () => {
      const res = await voidFreightPayment({ id: row.id, void_reason: reason.trim() });
      if (res.ok) { setConfirmVoid(false); router.refresh(); }
      else        setErr(translatePaymentError(res.error));
    });
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 text-xs">{new Date(row.paid_at).toLocaleDateString("th-TH")}</td>
      <td className="px-3 py-2 text-xs">{FREIGHT_PAYMENT_METHOD_LABEL[row.method as FreightPaymentMethod] ?? row.method}</td>
      <td className="px-3 py-2 text-xs font-mono">
        {row.bank_ref ?? "—"}
        {row.slip_storage_path && <span className="ml-1 text-primary-500" title="มีสลิปแนบ">📎</span>}
        {row.notes && <p className="text-[10px] text-muted not-italic">{row.notes}</p>}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(row.amount_thb)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {!confirmVoid ? (
          <button type="button" onClick={() => setConfirmVoid(true)} className="text-xs text-red-600 hover:underline">
            ยกเลิก
          </button>
        ) : (
          <div className="space-y-1">
            <input
              type="text"
              placeholder="เหตุผล (≥3)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="w-full rounded border border-border bg-white px-1.5 py-1 text-[10px]"
            />
            <div className="flex gap-1 justify-end">
              <button type="button" onClick={fireVoid} disabled={pending || reason.trim().length < 3} className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50">✓</button>
              <button type="button" onClick={() => { setConfirmVoid(false); setReason(""); setErr(null); }} disabled={pending} className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] hover:bg-surface-alt disabled:opacity-50">×</button>
            </div>
          </div>
        )}
        {err && <p className="mt-1 text-[10px] text-red-700">{err}</p>}
      </td>
    </tr>
  );
}

function RecordPaymentForm({ invoiceId, outstandingThb }: { invoiceId: string; outstandingThb: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<FreightPaymentMethod>("bank_transfer");
  const [amount, setAmount] = useState<number>(outstandingThb > 0 ? outstandingThb : 0);
  const [paidAt, setPaidAt] = useState("");           // empty → action defaults to now
  const [bankRef, setBankRef] = useState("");
  const [notes, setNotes] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setMethod("bank_transfer");
    setAmount(outstandingThb > 0 ? outstandingThb : 0);
    setPaidAt(""); setBankRef(""); setNotes(""); setSlip(null); setErr(null);
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      // bank_transfer: optionally upload the slip first, then record.
      let slipPath: string | null = null;
      if (slip && method === "bank_transfer") {
        const up = await uploadFreightPaymentSlip(invoiceId, slip);
        if (!up.ok) { setErr(translatePaymentError(up.error)); return; }
        slipPath = up.data?.storage_path ?? null;
      }
      const res = await recordFreightPayment({
        freight_invoice_id: invoiceId,
        method,
        amount_thb:         amount,
        // datetime-local gives "YYYY-MM-DDTHH:mm" (no zone) → append :00Z
        // so it parses as a valid offset datetime; blank → action default.
        paid_at:            paidAt ? `${paidAt}:00Z` : undefined,
        bank_ref:           method === "bank_transfer" ? (bankRef.trim() || null) : null,
        slip_storage_path:  slipPath,
        notes:              notes.trim() || null,
      });
      if (res.ok) { reset(); setOpen(false); router.refresh(); }
      else        setErr(translatePaymentError(res.error));
    });
  }

  if (!open) {
    return (
      <div className="px-5 py-3 border-t border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          ➕ บันทึกการชำระเงิน
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 border-t border-border bg-surface-alt/30 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs space-y-1">
          <span className="font-medium text-muted">วิธีชำระ</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as FreightPaymentMethod)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
          >
            {FREIGHT_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{FREIGHT_PAYMENT_METHOD_LABEL[m]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="font-medium text-muted">จำนวนเงิน (บาท)</span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-right font-mono"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="font-medium text-muted">วันที่ชำระ (เว้นว่าง = ตอนนี้)</span>
          <input
            type="datetime-local"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
          />
        </label>
        {method === "bank_transfer" && (
          <label className="text-xs space-y-1">
            <span className="font-medium text-muted">เลขอ้างอิงธนาคาร (ถ้ามี)</span>
            <input
              type="text"
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              maxLength={120}
              className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm font-mono"
            />
          </label>
        )}
        {method === "bank_transfer" && (
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="font-medium text-muted">สลิปโอนเงิน (ถ้ามี — PDF/รูป ≤10MB)</span>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
              className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs"
            />
          </label>
        )}
        <label className="text-xs space-y-1 sm:col-span-2">
          <span className="font-medium text-muted">หมายเหตุ</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          คงค้าง: <span className="font-mono font-bold">{thb(outstandingThb)}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fire}
            disabled={pending || amount <= 0}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "..." : "✓ บันทึก"}
          </button>
          <button
            type="button"
            onClick={() => { reset(); setOpen(false); }}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </div>
  );
}

function translatePaymentError(code: string): string {
  if (code.startsWith("invoice_not_issued")) return `invoice ยังไม่ได้ออก (${code})`;
  if (code.startsWith("insert_failed"))      return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("update_failed"))      return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("upload_failed"))      return `อัปโหลดสลิปล้มเหลว: ${code}`;
  switch (code) {
    case "invoice_not_found":          return "ไม่พบ invoice";
    case "invoice_total_zero":         return "invoice นี้ยังไม่มียอดเงิน — บันทึกไม่ได้";
    case "payment_not_found":          return "ไม่พบรายการชำระ";
    case "already_voided":             return "ยกเลิกอยู่แล้ว";
    case "no_file":                    return "ไม่พบไฟล์สลิป";
    case "file_too_large":             return "ไฟล์ใหญ่เกิน 10MB";
    case "invalid_input":              return "ข้อมูลไม่ถูกต้อง";
    default:                           return code;
  }
}

// ────────────────────────────────────────────────────────────
// Status actions (shipment lifecycle)
// ────────────────────────────────────────────────────────────

function StatusActions({ data }: { data: ShipmentDetailData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  function call(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error ?? "unknown"));
    });
  }

  const s = data.status;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm">การดำเนินการ (shipment)</h2>
      <div className="flex flex-wrap gap-2">
        {s === "draft" && (
          <button type="button" onClick={() => call(() => adminConfirmFreightShipment({ id: data.id }))} disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">✓ ยืนยัน</button>
        )}
        {s === "confirmed" && (
          <button type="button" onClick={() => call(() => adminMarkFreightInProgress({ id: data.id }))} disabled={pending} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">🚢 เริ่มขนส่ง</button>
        )}
        {s === "in_progress" && (
          <button type="button" onClick={() => call(() => adminMarkFreightCleared({ id: data.id }))} disabled={pending} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50">📋 ผ่านศุลกากร</button>
        )}
        {s === "cleared" && (
          <button type="button" onClick={() => call(() => adminMarkFreightDelivered({ id: data.id }))} disabled={pending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">📦 ส่งมอบแล้ว</button>
        )}
        {!["delivered", "cancelled"].includes(s) && !showCancel && (
          <button type="button" onClick={() => setShowCancel(true)} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50">✗ ยกเลิก</button>
        )}
      </div>

      {showCancel && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-bold text-red-900">เหตุผลที่ยกเลิก (≥3 ตัวอักษร)</p>
          <textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs" />
          <div className="flex gap-2">
            <button type="button" onClick={() => call(() => adminCancelFreightShipment({ id: data.id, cancelled_reason: cancelReason }))} disabled={pending || cancelReason.trim().length < 3} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">✓ ยืนยัน</button>
            <button type="button" onClick={() => { setShowCancel(false); setCancelReason(""); }} disabled={pending} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">×</button>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed"))  return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("insert_failed"))  return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("delete_failed"))  return `ลบล้มเหลว: ${code}`;
  if (code.startsWith("upsert_failed"))  return `อัพเซิร์ทล้มเหลว: ${code}`;
  if (code.startsWith("bad_status"))     return `สถานะไม่ถูกต้อง: ${code}`;
  if (code.startsWith("existing_invoice")) return `มี invoice อยู่แล้ว (${code})`;
  switch (code) {
    case "not_found":                      return "ไม่พบ";
    case "not_draft":                      return "สถานะไม่ใช่ draft";
    case "terminal_status":                return "สถานะ terminal — แก้ไม่ได้";
    case "no_lines":                       return "ต้องมี line อย่างน้อย 1";
    case "value_block_incomplete":         return "commercial_value_usd + exchange_rate ยังว่าง";
    case "parties_incomplete":             return "ต้องกรอก shipper + consignee ก่อน issue";
    case "shipment_missing":               return "ไม่พบ shipment";
    case "shipment_cancelled":             return "shipment ถูกยกเลิกแล้ว";
    case "already_cancelled":              return "ยกเลิกอยู่แล้ว";
    case "cannot_cancel_after_delivery":   return "ยกเลิกไม่ได้ — ส่งมอบแล้ว";
    case "declared_value_requires_super_or_accounting":
                                            return "แก้ declared customs value ต้องเป็น super หรือ accounting (ADR-0016 Q3)";
    case "declared_value_basis_required":  return "ระบุ declared customs value แล้ว ต้องระบุ basis ด้วย";
    default:                               return code;
  }
}
