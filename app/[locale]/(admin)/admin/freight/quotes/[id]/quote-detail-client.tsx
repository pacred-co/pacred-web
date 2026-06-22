"use client";

/**
 * V-E6 — admin client for line-item CRUD + status flips on the detail page.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAddQuoteItem, adminUpdateQuoteItem, adminDeleteQuoteItem,
  adminComposeQuoteFromRateCard,
  adminSubmitQuoteForApproval, adminApproveQuote, adminRejectQuote,
  adminSendQuote, adminMarkQuoteAccepted, adminMarkQuoteExpired,
  adminConvertQuoteToShipment,
} from "@/actions/admin/freight-quotes";
import {
  QUOTE_UNITS, TRANSPORT_MODES, TRANSPORT_MODE_LABEL, INCOTERMS,
  type QuoteStatus, type TransportMode, type QuoteUnit, type Incoterm,
} from "@/lib/validators/freight-quote";
import { confirm } from "@/components/ui/confirm";
import { RateCardGuide } from "@/components/admin/freight/rate-card-guide";

export type LineItem = {
  id:             string;
  position:       number;
  description:    string;
  quantity:       number;
  unit:           string;
  unit_price_thb: number;
  line_total_thb: number;
  note:           string | null;
};

export type QuoteDetailData = {
  id:                       string;
  quote_no:                 string;
  status:                   QuoteStatus;
  transport_mode:           TransportMode;
  vat_pct:                  number;
  subtotal:                 number;
  vat_amount:               number;
  total:                    number;
  converted_to_shipment_id: string | null;
  isSuper:                  boolean;
};

type Props = {
  data:  QuoteDetailData;
  items: LineItem[];
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function QuoteDetailClient({ data, items }: Props) {
  const isDraft = data.status === "draft";
  return (
    <div className="space-y-4">
      {isDraft && (
        <RateCardAutoFill
          quoteId={data.id}
          defaultMode={data.transport_mode}
          itemCount={items.length}
        />
      )}
      <RateCardGuide />
      <ItemsTable quoteId={data.id} items={items} editable={isDraft} />
      <StatusActions data={data} hasItems={items.length > 0} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Rate-card auto-fill (Phase D rate engine)
// ────────────────────────────────────────────────────────────
// Prices the in-scope line items from the real AXELRA cards (server action
// composeFreightQuote) so sales don't hand-type each charge. Confirm-before-
// mutate per the product-quality bar (กันคนลั่น). Internal only — no comms.

const TIER_OPTIONS: { value: "retail" | "regular" | "wholesale"; label: string }[] = [
  { value: "retail",    label: "ปลีก" },
  { value: "regular",   label: "ลูกค้าประจำ" },
  { value: "wholesale", label: "ส่ง" },
];

function RateCardAutoFill({
  quoteId, defaultMode, itemCount,
}: {
  quoteId:     string;
  defaultMode: TransportMode;
  itemCount:   number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TransportMode>(defaultMode);
  const [incoterm, setIncoterm] = useState<Incoterm>("CIF");
  const [truck, setTruck] = useState<"4W" | "6W">("4W");
  const [tier, setTier] = useState<"retail" | "regular" | "wholesale">("regular");
  const [cbm, setCbm] = useState<number>(0);
  const [kgm, setKgm] = useState<number>(0);
  const [containers, setContainers] = useState<number>(1);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function fire() {
    setErr(null);
    setDone(null);
    startTransition(async () => {
      const ok = await confirm(
        replaceExisting && itemCount > 0
          ? `จะ "ล้าง" รายการเดิม ${itemCount} รายการ แล้วเติมราคาใหม่จาก rate card (${incoterm} · ${TRANSPORT_MODE_LABEL[mode]}) — ยืนยัน?`
          : `เติม line items จาก rate card (${incoterm} · ${TRANSPORT_MODE_LABEL[mode]}) เข้าใบเสนอราคานี้?`,
        { title: "เติมราคาจาก rate card", confirmLabel: "เติมราคา", cancelLabel: "ยกเลิก" },
      );
      if (!ok) return;
      const res = await adminComposeQuoteFromRateCard({
        freight_quote_id: quoteId,
        mode, incoterm, deliveryTruck: truck, tier,
        cbm:        mode === "sea_lcl" ? cbm : undefined,
        kgm:        mode === "air" ? kgm : undefined,
        containers: mode === "sea_fcl" ? containers : undefined,
        replaceExisting,
      });
      if (res.ok) {
        const d = res.data;
        if (d) {
          const profitLabel = d.freightCostPending ? "กำไรขั้นต้น" : "กำไร";
          setDone(
            `เติม ${d.count} รายการ · ยอดขาย ฿${d.subtotalSell.toLocaleString("th-TH")} · ${profitLabel} ฿${d.profit.toLocaleString("th-TH")}` +
            (d.marginExceedsCap ? ` ⚠️ ${profitLabel}เกินเพดาน ฿${d.marginCapThb.toLocaleString("th-TH")}/ตู้` : "") +
            (d.freightCostPending ? " · หมายเหตุ: ยังไม่รวมต้นทุนค่าเฟรท/ต้นทางจีน (อยู่ระหว่างทำตาราง cost)" : ""),
          );
        }
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <section className="rounded-2xl border border-dashed border-primary-300 bg-primary-50/40 dark:bg-primary-950/10 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-bold text-primary-700 hover:underline"
        >
          🧮 เติมราคาอัตโนมัติจาก rate card (AXELRA)
        </button>
        {done && <p className="mt-2 text-xs text-emerald-700">{done}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-primary-300 bg-primary-50/40 dark:bg-primary-950/10 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary-800 dark:text-primary-300">🧮 เติมราคาจาก rate card (AXELRA IMPORT)</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">ปิด</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <label className="text-xs space-y-1">
          <span className="text-muted">รูปแบบขนส่ง</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as TransportMode)} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
            {TRANSPORT_MODES.map((m) => <option key={m} value={m}>{TRANSPORT_MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted">Incoterm</span>
          <select value={incoterm} onChange={(e) => setIncoterm(e.target.value as Incoterm)} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
            {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted">รถส่งในไทย</span>
          <select value={truck} onChange={(e) => setTruck(e.target.value as "4W" | "6W")} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
            <option value="4W">4 ล้อ</option>
            <option value="6W">6 ล้อ</option>
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted">เรทขาย</span>
          <select value={tier} onChange={(e) => setTier(e.target.value as typeof tier)} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm">
            {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {mode === "sea_lcl" && (
          <label className="text-xs space-y-1">
            <span className="text-muted">ปริมาตร (CBM)</span>
            <input type="number" min={0} step={0.001} value={cbm} onChange={(e) => setCbm(Number(e.target.value) || 0)} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" />
          </label>
        )}
        {mode === "air" && (
          <label className="text-xs space-y-1">
            <span className="text-muted">น้ำหนักคิดราคา (KG)</span>
            <input type="number" min={0} step={0.01} value={kgm} onChange={(e) => setKgm(Number(e.target.value) || 0)} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" />
          </label>
        )}
        {mode === "sea_fcl" && (
          <label className="text-xs space-y-1">
            <span className="text-muted">จำนวนตู้</span>
            <input type="number" min={1} step={1} value={containers} onChange={(e) => setContainers(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono" />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} className="rounded border-border" />
          ล้างรายการเดิมก่อน ({itemCount} รายการ)
        </label>
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังเติม…" : "🧮 เติมราคา"}
        </button>
      </div>
      <p className="text-[11px] text-muted">ราคาอ้างอิงจาก rate card จริง (AXELRA IMPORT) · ตรวจ/แก้ไขได้ก่อนส่งอนุมัติ · ไม่มีการแจ้งลูกค้า</p>
      {done && <p className="text-xs text-emerald-700">{done}</p>}
      {err && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Items table (inline add + edit + delete)
// ────────────────────────────────────────────────────────────

function ItemsTable({
  quoteId, items, editable,
}: {
  quoteId:  string;
  items:    LineItem[];
  editable: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="font-bold text-sm">รายการ (line items)</h2>
        {!editable && <span className="text-[11px] text-muted">read-only — สถานะไม่ใช่ draft</span>}
      </div>
      {items.length === 0 && !editable && (
        <p className="p-12 text-center text-sm text-muted">ไม่มี line items</p>
      )}
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 w-12">#</th>
              <th className="px-3 py-2">รายละเอียด</th>
              <th className="px-3 py-2 text-right w-24">qty</th>
              <th className="px-3 py-2 w-20">unit</th>
              <th className="px-3 py-2 text-right w-28">ราคา/หน่วย</th>
              <th className="px-3 py-2 text-right w-28">รวม</th>
              {editable && <th className="px-3 py-2 w-28"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <ItemRow key={it.id} item={it} editable={editable} />
            ))}
          </tbody>
        </table>
      )}
      {editable && <AddItemRow quoteId={quoteId} />}
    </section>
  );
}

function ItemRow({ item, editable }: { item: LineItem; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(item.description);
  const [qty, setQty] = useState<number>(item.quantity);
  const [unit, setUnit] = useState<QuoteUnit>((item.unit as QuoteUnit) ?? "JOB");
  const [price, setPrice] = useState<number>(item.unit_price_thb);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function fireUpdate() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateQuoteItem({
        id:             item.id,
        description:    desc,
        quantity:       qty,
        unit,
        unit_price_thb: price,
      });
      if (res.ok) { setEditing(false); router.refresh(); }
      else        setErr(res.error);
    });
  }

  function fireDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await adminDeleteQuoteItem({ id: item.id });
      if (res.ok) router.refresh();
      else        setErr(res.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-border bg-amber-50/40">
        <td className="px-3 py-2 text-xs">{item.position}</td>
        <td className="px-3 py-2"><input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded border border-border bg-white px-2 py-1 text-xs" /></td>
        <td className="px-3 py-2"><input type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="w-20 rounded border border-border bg-white px-2 py-1 text-xs text-right font-mono" /></td>
        <td className="px-3 py-2">
          <select value={unit} onChange={(e) => setUnit(e.target.value as QuoteUnit)} className="w-full rounded border border-border bg-white px-1 py-1 text-xs">
            {QUOTE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td className="px-3 py-2"><input type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="w-24 rounded border border-border bg-white px-2 py-1 text-xs text-right font-mono" /></td>
        <td className="px-3 py-2 text-right font-mono text-xs">{thb(qty * price)}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button type="button" onClick={fireUpdate} disabled={pending || !desc.trim()} className="rounded bg-primary-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50">✓</button>
          <button type="button" onClick={() => { setEditing(false); setDesc(item.description); setQty(item.quantity); setUnit((item.unit as QuoteUnit)); setPrice(item.unit_price_thb); setErr(null); }} disabled={pending} className="ml-1 rounded border border-border bg-white px-2 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50">×</button>
          {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 text-xs">{item.position}</td>
      <td className="px-3 py-2">
        <p className="text-sm">{item.description}</p>
        {item.note && <p className="text-[11px] text-muted">{item.note}</p>}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{item.quantity}</td>
      <td className="px-3 py-2 text-xs">{item.unit}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{thb(item.unit_price_thb)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(item.line_total_thb)}</td>
      {editable && (
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary-500 hover:underline">แก้</button>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-2 text-xs text-red-600 hover:underline">ลบ</button>
          ) : (
            <span className="ml-2">
              <button type="button" onClick={fireDelete} disabled={pending} className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50">✓ ลบ</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="ml-1 text-[11px] text-muted hover:underline">×</button>
            </span>
          )}
          {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
        </td>
      )}
    </tr>
  );
}

function AddItemRow({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [unit, setUnit] = useState<QuoteUnit>("JOB");
  const [price, setPrice] = useState<number>(0);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function reset() { setDesc(""); setQty(1); setUnit("JOB"); setPrice(0); setNote(""); setErr(null); }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminAddQuoteItem({
        freight_quote_id: quoteId,
        description:      desc,
        quantity:         qty,
        unit,
        unit_price_thb:   price,
        note:             note.trim() || undefined,
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input type="text" placeholder="รายละเอียด" value={desc} onChange={(e) => setDesc(e.target.value)} className="rounded border border-border bg-white px-2 py-1.5 text-sm lg:col-span-2" />
        <input type="number" min={0.001} step={0.001} placeholder="qty" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-sm font-mono" />
        <select value={unit} onChange={(e) => setUnit(e.target.value as QuoteUnit)} className="rounded border border-border bg-white px-2 py-1.5 text-sm">
          {QUOTE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" min={0} step={0.01} placeholder="ราคา/หน่วย" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="rounded border border-border bg-white px-2 py-1.5 text-sm font-mono lg:col-span-2" />
        <input type="text" placeholder="หมายเหตุ (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="rounded border border-border bg-white px-2 py-1.5 text-sm lg:col-span-2" />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">รวม: <span className="font-mono font-bold">{thb(qty * price)}</span></p>
        <div className="flex gap-2">
          <button type="button" onClick={fire} disabled={pending || !desc.trim() || qty <= 0 || price < 0} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "..." : "✓ เพิ่ม"}</button>
          <button type="button" onClick={() => { reset(); setOpen(false); }} disabled={pending} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">ยกเลิก</button>
        </div>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Status action buttons
// ────────────────────────────────────────────────────────────

function StatusActions({ data, hasItems }: { data: QuoteDetailData; hasItems: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

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
      <h2 className="font-bold text-sm">การดำเนินการ</h2>

      <div className="flex flex-wrap gap-2">
        {s === "draft" && (
          <button
            type="button"
            disabled={pending || !hasItems}
            onClick={() => call(() => adminSubmitQuoteForApproval({ id: data.id }))}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? "..." : "📤 ส่งให้ super อนุมัติ"}
          </button>
        )}

        {s === "pending_approval" && data.isSuper && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={async () => { if (await confirm("ยืนยันอนุมัติใบเสนอราคานี้?")) call(() => adminApproveQuote({ id: data.id })); }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ อนุมัติ
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowReject(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✗ ปฏิเสธ
            </button>
          </>
        )}

        {s === "pending_approval" && !data.isSuper && (
          <p className="text-xs text-muted italic">รอ super อนุมัติ (คุณไม่มี permission)</p>
        )}

        {s === "approved" && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => { if (await confirm("ยืนยันส่งใบเสนอราคานี้ให้ลูกค้า? (ลูกค้าจะได้รับการแจ้งเตือน)")) call(() => adminSendQuote({ id: data.id })); }}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            📨 ส่งให้ลูกค้า
          </button>
        )}

        {s === "sent" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={async () => { if (await confirm("ยืนยันว่าลูกค้าตอบรับใบเสนอราคานี้แล้ว?")) call(() => adminMarkQuoteAccepted({ id: data.id })); }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ ลูกค้าตอบรับ
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => call(() => adminMarkQuoteExpired({ id: data.id }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              ⏰ หมดอายุ
            </button>
          </>
        )}

        {s === "accepted" && !data.converted_to_shipment_id && data.isSuper && (
          <button
            type="button"
            disabled={pending}
            onClick={() => call(() => adminConvertQuoteToShipment({ id: data.id }))}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            🚚 แปลงเป็น freight shipment
          </button>
        )}

        {s === "accepted" && data.converted_to_shipment_id && (
          <p className="text-xs text-green-700">
            ✅ แปลงเป็น shipment แล้ว (ID: <span className="font-mono">{data.converted_to_shipment_id}</span>)
          </p>
        )}

        {(s === "rejected" || s === "expired") && (
          <p className="text-xs text-muted italic">
            สถานะ terminal — สร้างใบใหม่หากต้องการดำเนินการต่อ
          </p>
        )}
      </div>

      {showReject && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-bold text-red-900">เหตุผลที่ปฏิเสธ (≥3 ตัวอักษร)</p>
          <textarea
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
            placeholder="เช่น ราคาสูงกว่าตลาด, ปริมาณไม่ตรง, ลูกค้าขอ revise"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => call(() => adminRejectQuote({ id: data.id, rejected_reason: rejectReason }))}
              disabled={pending || rejectReason.trim().length < 3}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✓ ยืนยันปฏิเสธ
            </button>
            <button
              type="button"
              onClick={() => { setShowReject(false); setRejectReason(""); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed")) return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("insert_failed")) return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("delete_failed")) return `ลบล้มเหลว: ${code}`;
  if (code.startsWith("bad_status"))    return `สถานะไม่ถูกต้อง: ${code}`;
  switch (code) {
    case "not_found":             return "ไม่พบใบ";
    case "parent_not_found":      return "ไม่พบใบแม่";
    case "not_draft":             return "ใบนี้ไม่ได้อยู่สถานะ draft";
    case "no_items":              return "ต้องมี line item อย่างน้อย 1 รายการ";
    case "not_accepted":           return "ใบนี้ยังไม่ได้สถานะ accepted";
    case "quote_has_no_profile":   return "ใบนี้เป็น cold quote (ไม่มี profile_id) — ไม่สามารถแปลงเป็น shipment ได้";
    default:                      return code;
  }
}
