"use client";

/**
 * Phase C QoL #3 — slip-vs-amount overlay modal.
 *
 * Today admin approving a deposit eyeballs the slip image against the
 * customer-typed amount in a tiny cramped <img> tile. This modal opens
 * a side-by-side overlay:
 *   left  = full-size slip (image or PDF, signed URL via
 *           adminGetWalletTxSlipSignedUrl, lazily fetched on open)
 *   right = panel with the customer-typed amount + bank + slip_date +
 *           account number + reference + member info, plus two big
 *           buttons:
 *             ✓ ตรงกัน — Approve  (status='completed')
 *             ✗ ไม่ตรง — Reject   (status='cancelled' + reason required)
 *
 * Approve / reject reuse the existing adminUpdateWalletTransaction
 * action — no schema change. Cancelled is the wallet-tx status used for
 * "rejected" deposits in the existing UX (not 'failed', which is for
 * post-approval bank failures).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminUpdateWalletTransaction,
  adminGetWalletTxSlipSignedUrl,
} from "@/actions/admin/wallet";

type Props = {
  open:    boolean;
  onClose: () => void;
  tx: {
    id:             string;
    amount:         number;
    bank_name:      string | null;
    account_name:   string | null;
    account_number: string | null;
    note:           string | null;
    slip_url:       string | null;
    slip_transferred_at: string | null;
    created_at:     string;
    member_code:    string | null;
    customer_name:  string;
    phone:          string | null;
  };
};

export function SlipReviewModal({ open, onClose, tx }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr]                 = useState<string | null>(null);
  const [signed, setSigned]           = useState<{ url: string | null; mime: string | null } | null>(null);
  const [signedErr, setSignedErr]     = useState<string | null>(null);
  const [signedLoading, setSignedLoading] = useState(false);
  const [rejectMode, setRejectMode]   = useState(false);
  const [reason, setReason]           = useState("");

  // Lazily fetch the signed URL only when the modal opens. Saves a
  // round-trip per row on the wallet page. React 19 forbids synchronous
  // setState in the effect body, so the loading flag is flipped inside a
  // queueMicrotask + the actual reset on close is moved into onClose
  // (which the parent calls) plus a defensive sync below.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSignedLoading(true);
      setSignedErr(null);
    });
    void adminGetWalletTxSlipSignedUrl({ id: tx.id }).then((res) => {
      if (cancelled) return;
      setSignedLoading(false);
      if (res.ok && res.data) {
        setSigned(res.data);
      } else {
        setSignedErr(res.ok ? null : res.error);
      }
    });
    return () => { cancelled = true; };
  }, [open, tx.id]);

  // Reset transient state on close. Defer the writes off the effect body
  // (React 19 set-state-in-effect rule). The values feed only the next
  // open of the modal, so a microtask delay is invisible to users.
  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setErr(null);
      setRejectMode(false);
      setReason("");
    });
  }, [open]);

  // Esc key closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  function approve() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateWalletTransaction({
        id:     tx.id,
        status: "completed",
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setErr(res.error);
      }
    });
  }

  function reject() {
    setErr(null);
    if (reason.trim().length < 3) {
      setErr("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateWalletTransaction({
        id:     tx.id,
        status: "cancelled",
        note:   reason.trim(),
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ตรวจสลิปเทียบยอดเงินฝาก"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        // Click on backdrop closes — but not while a write is in-flight.
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="grid w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-0 overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-2xl max-h-[90vh]">
        {/* Slip pane (left) */}
        <div className="flex flex-col bg-black/5 dark:bg-black/30 min-h-[300px]">
          <div className="flex items-center justify-between border-b border-border bg-white dark:bg-surface px-4 py-2 text-xs">
            <span className="font-medium">หลักฐานการโอน</span>
            {signed?.url && (
              <a
                href={signed.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                เปิดเต็มจอ ↗
              </a>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto p-3">
            {signedLoading && <p className="text-xs text-muted">กำลังโหลดสลิป…</p>}
            {!signedLoading && signedErr && (
              <p className="text-xs text-red-700">โหลดสลิปไม่สำเร็จ: {signedErr}</p>
            )}
            {!signedLoading && !signedErr && !signed?.url && (
              <p className="text-xs text-muted italic">ลูกค้าไม่ได้อัพโหลดสลิป</p>
            )}
            {!signedLoading && signed?.url && signed.mime === "application/pdf" && (
              <embed
                src={signed.url}
                type="application/pdf"
                className="w-full h-[70vh] rounded border border-border"
              />
            )}
            {!signedLoading && signed?.url && signed.mime !== "application/pdf" && (
              // eslint-disable-next-line @next/next/no-img-element -- supabase-signed URL, admin preview only
              <img
                src={signed.url}
                alt="สลิป"
                className="max-h-[75vh] max-w-full object-contain"
              />
            )}
          </div>
        </div>

        {/* Detail + actions pane (right) */}
        <div className="flex flex-col bg-white dark:bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h3 className="font-bold text-sm">ตรวจยอด vs สลิป</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded text-sm text-muted hover:text-foreground disabled:opacity-50"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Customer */}
            <div className="space-y-1 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted">ลูกค้า</p>
              <p className="font-medium">{tx.customer_name}</p>
              <p className="text-xs text-muted">
                <span className="font-mono">{tx.member_code ?? "—"}</span>
                {tx.phone && <> · {tx.phone}</>}
              </p>
            </div>

            {/* Big amount — what the customer typed */}
            <div className="rounded-xl border-2 border-primary-300 bg-primary-50 p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-primary-700">ลูกค้ากรอกยอด</p>
              <p className="mt-1 text-3xl font-bold font-mono text-primary-800">
                ฿{Number(tx.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-[10px] text-muted">
                ⚠️ ต้องตรงกับยอดในสลิปก่อนอนุมัติ
              </p>
            </div>

            {/* Bank + ref details */}
            <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
              <Field label="ธนาคารปลายทาง" value={tx.bank_name ?? "—"} />
              <Field label="ชื่อบัญชี"     value={tx.account_name ?? "—"} />
              <Field label="เลขบัญชี"      value={tx.account_number ?? "—"} mono />
              <Field
                label="วันโอนตามสลิป"
                value={tx.slip_transferred_at
                  ? new Date(tx.slip_transferred_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
                  : "—"}
              />
              <Field
                label="วันที่ส่งคำขอ"
                value={new Date(tx.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
              />
              <Field label="หมายเหตุลูกค้า" value={tx.note ?? "—"} />
            </dl>

            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {err}
              </div>
            )}

            {rejectMode && (
              <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3">
                <p className="text-xs font-bold text-red-900">เหตุผลที่ปฏิเสธ (≥3 ตัวอักษร)</p>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
                  placeholder="เช่น ยอดในสลิปไม่ตรงกับที่กรอก / สลิปอ่านไม่ออก / เลขที่อ้างอิงไม่ตรง"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={reject}
                    disabled={pending || reason.trim().length < 3}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {pending ? "กำลังปฏิเสธ…" : "✓ ยืนยันปฏิเสธ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectMode(false); setReason(""); setErr(null); }}
                    disabled={pending}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky action bar */}
          {!rejectMode && (
            <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface-alt/40 p-3">
              <button
                type="button"
                onClick={approve}
                disabled={pending}
                className="rounded-lg bg-green-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {pending ? "กำลังอนุมัติ…" : "✓ ตรงกัน — Approve"}
              </button>
              <button
                type="button"
                onClick={() => setRejectMode(true)}
                disabled={pending}
                className="rounded-lg border border-red-500 bg-white px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                ✗ ไม่ตรง — Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted col-span-1">{label}</dt>
      <dd className={`col-span-2 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}
