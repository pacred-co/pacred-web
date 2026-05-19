"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateDisbursement, type DisbursementKind } from "@/actions/admin/disbursements";

/**
 * U2-2: Create-disbursement form. Used on the AP list page sidebar AND
 * (in the future) the container detail page Cost & margin panel.
 *
 * Pre-fills container_id when defaultContainerCode is set (from URL).
 */

const KIND_OPTIONS: Array<{ value: DisbursementKind; label: string }> = [
  { value: "freight",         label: "ค่าระวาง (freight)" },
  { value: "customs_duty",    label: "ค่าภาษีศุลกากร (customs duty)" },
  { value: "handling",        label: "ค่า handling / THC" },
  { value: "fuel",            label: "ค่าเชื้อเพลิง (fuel)" },
  { value: "storage",         label: "ค่าเช่า / demurrage" },
  { value: "trucking",        label: "ค่ารถในประเทศ (trucking)" },
  { value: "container_lease", label: "ค่าตู้สินค้า (container lease)" },
  { value: "other",           label: "อื่นๆ (ระบุใน note)" },
];

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type ContainerOption = {
  id:    string;
  code:  string;
  route: string;
};

export function DisbursementForm({
  containers,
  defaultContainerCode,
  defaultContainerId,
  compact,
}: {
  containers: ContainerOption[];
  defaultContainerCode?: string;
  defaultContainerId?:   string;
  /** Compact = no card chrome (for embedding inside another panel). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [containerId, setContainerId] = useState(() => {
    if (defaultContainerId) return defaultContainerId;
    if (defaultContainerCode) {
      const m = containers.find((c) => c.code === defaultContainerCode);
      if (m) return m.id;
    }
    return containers[0]?.id ?? "";
  });
  const [kind, setKind]               = useState<DisbursementKind>("freight");
  const [amount, setAmount]           = useState("");
  const [vendor, setVendor]           = useState("");
  const [invoiceNo, setInvoiceNo]     = useState("");
  const [paidAt, setPaidAt]           = useState("");        // 'YYYY-MM-DD' from <input type="date">
  const [note, setNote]               = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("จำนวนเงินต้องมากกว่า 0");
      return;
    }
    if (!containerId) {
      setErr("กรุณาเลือกตู้");
      return;
    }
    if (!vendor.trim()) {
      setErr("กรุณาระบุชื่อ vendor");
      return;
    }
    if (kind === "other" && !note.trim()) {
      setErr("kind=other ต้องระบุ note");
      return;
    }

    startTransition(async () => {
      // Convert date-only input to a Bangkok-midnight ISO so the
      // datetime column gets a defined paid_at when staff doesn't care
      // about the time of day.
      let paidAtIso: string | undefined;
      if (paidAt) {
        const dt = new Date(paidAt + "T00:00:00+07:00");
        if (!Number.isNaN(dt.getTime())) paidAtIso = dt.toISOString();
      }

      const res = await adminCreateDisbursement({
        cargo_container_id: containerId,
        kind,
        amount_thb:         amt,
        vendor_name:        vendor.trim(),
        invoice_no:         invoiceNo.trim() || undefined,
        paid_at:            paidAtIso,
        note:               note.trim() || undefined,
      });
      if (res.ok) {
        setMsg(`บันทึกค่าใช้จ่ายแล้ว (฿${amt.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`);
        setAmount(""); setVendor(""); setInvoiceNo(""); setPaidAt(""); setNote("");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  const formBody = (
    <>
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <label className="block space-y-1">
        <span className="text-xs font-medium">ตู้ (cargo container)</span>
        <select
          value={containerId}
          onChange={(e) => setContainerId(e.target.value)}
          className={inputCls}
          disabled={pending || containers.length === 0}
          required
        >
          {containers.length === 0
            ? <option value="">— ไม่มีตู้ open —</option>
            : containers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} · {c.route}</option>
              ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">ประเภท</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DisbursementKind)}
          className={inputCls}
          disabled={pending}
          required
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">จำนวน (฿)</span>
          <input
            type="number" inputMode="decimal" step="0.01" min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls + " font-mono"}
            disabled={pending}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ชำระเมื่อ (optional)</span>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputCls}
            disabled={pending}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">vendor</span>
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className={inputCls}
          placeholder="COSCO / Pacred ทีมรถ / กรมศุลกากร"
          disabled={pending}
          required
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">เลขใบกำกับ (optional)</span>
        <input
          value={invoiceNo}
          onChange={(e) => setInvoiceNo(e.target.value)}
          className={inputCls + " font-mono"}
          placeholder="INV-2026-04-001"
          disabled={pending}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">
          หมายเหตุ {kind === "other" && <span className="text-red-700">*</span>}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls + " min-h-[60px]"}
          placeholder={kind === "other" ? "kind=other ต้องระบุว่าจ่ายค่าอะไร" : "optional"}
          disabled={pending}
        />
      </label>

      <button
        type="submit"
        disabled={pending || !containerId}
        className="w-full rounded-lg bg-primary-500 text-white px-3 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : "บันทึกค่าใช้จ่าย"}
      </button>
    </>
  );

  if (compact) {
    return (
      <form onSubmit={submit} className="space-y-3">
        {formBody}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">+ บันทึกค่าใช้จ่ายใหม่</h3>
      <p className="text-[11px] text-muted">U2-2 · super + accounting only</p>
      {formBody}
    </form>
  );
}
