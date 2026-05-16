"use client";

/**
 * Admin WHT panel — V-A6 (ADR-0015).
 *
 * Shown on /admin/tax-invoices/[id]. Two states based on parent's existing
 * `withholding_tax_entries` row:
 *
 *   - **No row yet** → "Create WHT entry" form (3 fields: gross/base/rate).
 *     Submitting flips the parent into the WHT-gate path (issuance will
 *     refuse until cert flips to received/waived).
 *
 *   - **Row exists** → status card with:
 *       pending  → "อัพโหลด 50 ทวิ" (file picker → markCertReceived) + "ยกเว้นใบหัก"
 *       received → green "ใบรับรองครบ" + link to cert
 *       waived   → gray "ยกเว้น (โดย admin)" + reason
 *
 * The 4 server actions live in `actions/admin/wht.ts`:
 *   createWhtEntry · uploadWhtCert + markWhtCertReceived · waiveWhtCert · cancelWhtEntry
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createWhtEntry,
  uploadWhtCert,
  markWhtCertReceived,
  waiveWhtCert,
  cancelWhtEntry,
} from "@/actions/admin/wht";
import { WHT_RATES, computeWhtNumbers } from "@/lib/validators/withholding-tax";

export type WhtPanelEntry = {
  id:                 string;
  cert_status:        "pending" | "received" | "waived";
  gross_invoice_thb:  number;
  wht_base_thb:       number;
  wht_rate_pct:       number;
  wht_amount_thb:     number;
  net_expected_thb:   number;
  cert_number:        string | null;
  cert_storage_path:  string | null;
  cert_received_at:   string | null;
  waived_reason:      string | null;
  waived_at:          string | null;
};

type Props = {
  /** Parent tax-invoice id (used only for context display). */
  taxInvoiceId: string;
  /** Parent order pointer — exactly one of order_h_no / forwarder_f_no is set. */
  orderType:    "forwarder" | "service_order";
  orderId:      string;
  /** Suggested gross = tax_invoices.total_thb. Used as initial form value. */
  suggestedGross: number;
  /** Suggested rate based on service: cargo/forwarder → 1, pure service → 3. */
  suggestedRate:  1 | 3;
  /** Existing WHT row, if any. */
  entry: WhtPanelEntry | null;
};

const fmtThb = (n: number) =>
  `฿${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function WhtPanel(props: Props) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold text-sm">
          🧾 ภาษีหัก ณ ที่จ่าย (WHT)
          <span className="text-[10px] text-muted font-normal ml-2">— สำหรับลูกค้านิติบุคคล</span>
        </h2>
        {props.entry && (
          <StatusBadge status={props.entry.cert_status} />
        )}
      </div>
      {props.entry
        ? <ExistingEntry entry={props.entry} />
        : <CreateEntryForm {...props} />}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// CreateEntryForm — admin records a new WHT entry
// ────────────────────────────────────────────────────────────

function CreateEntryForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr]             = useState<string | null>(null);

  const [gross, setGross] = useState<string>(props.suggestedGross.toFixed(2));
  const [base, setBase]   = useState<string>(props.suggestedGross.toFixed(2));
  const [rate, setRate]   = useState<number>(props.suggestedRate);

  const grossN = Number(gross) || 0;
  const baseN  = Number(base)  || 0;
  const { wht_amount_thb, net_expected_thb } = computeWhtNumbers({
    gross_invoice_thb: grossN,
    wht_base_thb:      baseN,
    wht_rate_pct:      rate,
  });

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await createWhtEntry({
        order_type:        props.orderType,
        order_id:          props.orderId,
        gross_invoice_thb: grossN,
        wht_base_thb:      baseN,
        wht_rate_pct:      rate,
      });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-900">
        บันทึก WHT สำหรับออเดอร์นี้ — ลูกค้าจะโอน <strong>ยอดสุทธิ</strong> (net) มาแทน yard
        และต้องส่งใบ 50 ทวิให้ Pacred — ก่อนหน้านั้น<strong>ระบบจะกั้นการออกใบกำกับภาษี</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="ยอดเต็มในใบเสร็จ (Gross)">
          <input
            type="number"
            min={0}
            step={0.01}
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
        <Field label="ฐาน WHT (ค่าบริการล้วน)">
          <input
            type="number"
            min={0}
            step={0.01}
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
        <Field label="อัตรา (%)">
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          >
            {WHT_RATES.map((r) => (
              <option key={r} value={r}>
                {r}% {r === 1 ? "(ขนส่ง/freight — default)" : r === 3 ? "(บริการ — default)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">หักภาษี ณ ที่จ่าย</span>
          <span className="font-mono">{fmtThb(wht_amount_thb)}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-muted">ลูกค้าโอนจริง (Net)</span>
          <span className="font-mono font-bold text-primary-700">{fmtThb(net_expected_thb)}</span>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
      <button
        type="button"
        onClick={fire}
        disabled={pending || grossN <= 0 || baseN <= 0 || net_expected_thb <= 0}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : "📝 บันทึก WHT + เริ่ม gate"}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ExistingEntry — admin reads / mutates an existing WHT row
// ────────────────────────────────────────────────────────────

function ExistingEntry({ entry }: { entry: WhtPanelEntry }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <Stat label="Gross"       value={fmtThb(entry.gross_invoice_thb)} />
        <Stat label="ฐาน WHT"     value={fmtThb(entry.wht_base_thb)} />
        <Stat label={`อัตรา ${entry.wht_rate_pct}%`} value={fmtThb(entry.wht_amount_thb)} />
        <Stat label="ลูกค้าโอน (Net)" value={fmtThb(entry.net_expected_thb)} highlight />
      </div>
      {entry.cert_status === "pending"  && <PendingActions entry={entry} />}
      {entry.cert_status === "received" && <ReceivedDetail entry={entry} />}
      {entry.cert_status === "waived"   && <WaivedDetail   entry={entry} />}
    </div>
  );
}

function PendingActions({ entry }: { entry: WhtPanelEntry }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certNo, setCertNo] = useState("");
  const [err, setErr]       = useState<string | null>(null);
  const [showWaive, setShowWaive] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");

  function fireUpload() {
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("กรุณาเลือกไฟล์ใบ 50 ทวิ"); return; }
    startTransition(async () => {
      const upRes = await uploadWhtCert(entry.id, file);
      if (!upRes.ok) { setErr(translateError(upRes.error)); return; }
      const mkRes = await markWhtCertReceived({
        id:                entry.id,
        cert_number:       certNo.trim() || undefined,
        cert_storage_path: upRes.data!.storage_path,
      });
      if (mkRes.ok) router.refresh();
      else          setErr(translateError(mkRes.error));
    });
  }

  function fireWaive() {
    setErr(null);
    startTransition(async () => {
      const res = await waiveWhtCert({ id: entry.id, waived_reason: waiveReason });
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error));
    });
  }

  function fireCancel() {
    setErr(null);
    startTransition(async () => {
      const res = await cancelWhtEntry({ id: entry.id });
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error));
    });
  }

  return (
    <div className="space-y-3 border-t border-amber-200 pt-3">
      <div className="rounded-lg bg-white border border-amber-200 p-3 space-y-2">
        <p className="text-xs font-bold text-amber-900">📤 อัพโหลดใบ 50 ทวิ</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="text-xs"
          />
          <input
            type="text"
            placeholder="เลขที่ใบ 50 ทวิ (ถ้ามี)"
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs"
          />
        </div>
        <button
          type="button"
          onClick={fireUpload}
          disabled={pending}
          className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "กำลังอัพโหลด..." : "✓ บันทึกใบรับรอง"}
        </button>
      </div>

      {/* Waive */}
      {!showWaive && !showCancel && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowWaive(true)}
            className="text-xs text-amber-700 hover:underline"
          >
            ยกเว้นใบหัก (waive) →
          </button>
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="text-xs text-red-600 hover:underline"
          >
            ลบ WHT (สร้างผิด) →
          </button>
        </div>
      )}
      {showWaive && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 space-y-2">
          <p className="text-xs font-bold">ยืนยันยกเว้นใบ 50 ทวิ?</p>
          <p className="text-[11px] text-yellow-800">
            ระบบจะปลด gate ออกใบกำกับภาษี — โปรดระบุเหตุผลให้ชัดเจน (audit log).
          </p>
          <textarea
            placeholder="เหตุผล (เช่น ลูกค้าไม่ออกใบหัก, ตกลงรับเป็นค่าใช้จ่ายของ Pacred, ...)"
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fireWaive}
              disabled={pending || waiveReason.trim().length < 5}
              className="rounded-lg bg-yellow-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              ✓ ยกเว้นและปลด gate
            </button>
            <button
              type="button"
              onClick={() => { setShowWaive(false); setWaiveReason(""); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {showCancel && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2">
          <p className="text-xs font-bold text-red-900">ยืนยันลบ WHT entry?</p>
          <p className="text-[11px] text-red-800">
            ใช้กรณีที่บันทึก WHT ผิดออเดอร์/ผิดยอด — จะกลับสู่สถานะปกติ (ไม่มี gate).
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fireCancel}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✓ ลบ WHT
            </button>
            <button
              type="button"
              onClick={() => setShowCancel(false)}
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
    </div>
  );
}

function ReceivedDetail({ entry }: { entry: WhtPanelEntry }) {
  return (
    <div className="border-t border-amber-200 pt-3 space-y-1 text-xs">
      <p className="text-green-800 font-bold">✅ ได้รับใบ 50 ทวิ ครบแล้ว — gate ปลด</p>
      {entry.cert_received_at && (
        <p className="text-muted">
          รับเมื่อ {new Date(entry.cert_received_at).toLocaleString("th-TH")}
          {entry.cert_number && <> · เลขที่ <span className="font-mono">{entry.cert_number}</span></>}
        </p>
      )}
      {entry.cert_storage_path && (
        <p className="text-muted">
          ไฟล์: <span className="font-mono">{entry.cert_storage_path}</span>
        </p>
      )}
    </div>
  );
}

function WaivedDetail({ entry }: { entry: WhtPanelEntry }) {
  return (
    <div className="border-t border-amber-200 pt-3 space-y-1 text-xs">
      <p className="text-yellow-800 font-bold">⚠️ ยกเว้น (waived) — gate ปลด</p>
      {entry.waived_at && (
        <p className="text-muted">เมื่อ {new Date(entry.waived_at).toLocaleString("th-TH")}</p>
      )}
      {entry.waived_reason && (
        <p>เหตุผล: {entry.waived_reason}</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Small reusable bits
// ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border border-amber-200 p-2 ${highlight ? "bg-primary-50" : "bg-white"}`}>
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`font-mono ${highlight ? "font-bold text-primary-700" : ""}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "received" | "waived" }) {
  const cls =
    status === "received" ? "bg-green-50 text-green-700 border-green-200"
    : status === "waived" ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    :                       "bg-amber-50 text-amber-800 border-amber-200";
  const label =
    status === "received" ? "ได้รับใบหัก"
    : status === "waived" ? "ยกเว้น"
    :                       "รอใบหัก (gate ON)";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  );
}

function translateError(code: string): string {
  if (code.startsWith("insert_failed"))   return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("update_failed"))   return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("upload_failed"))   return `อัพโหลดไฟล์ล้มเหลว: ${code}`;
  if (code.startsWith("delete_failed"))   return `ลบล้มเหลว: ${code}`;
  switch (code) {
    case "wht_entry_exists":            return "มี WHT entry อยู่แล้วสำหรับออเดอร์นี้";
    case "forwarder_not_found":         return "ไม่พบเลขที่ forwarder";
    case "service_order_not_found":     return "ไม่พบเลขที่ service order";
    case "net_expected_non_positive":   return "ยอด Net ที่คำนวณ ≤ 0 — โปรดตรวจสอบ Gross/Base/Rate";
    case "no_file":                     return "ไม่ได้แนบไฟล์";
    case "file_too_large":              return "ไฟล์ใหญ่เกิน 10 MB";
    case "not_found":                   return "ไม่พบ WHT entry";
    case "already_received":            return "บันทึกใบรับแล้ว";
    case "already_waived":              return "ยกเว้นแล้ว";
    case "cannot_upload_after_settled": return "อัพโหลดไม่ได้ — สถานะไม่ใช่ pending";
    case "cannot_cancel_after_settled": return "ลบไม่ได้ — สถานะไม่ใช่ pending";
    default:                            return code;
  }
}
