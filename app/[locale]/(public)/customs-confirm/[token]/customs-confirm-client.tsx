"use client";

/**
 * <CustomsConfirmClient> — the customer-facing confirm/reject + pay-destination
 * block on the public ใบขนพ่วง page (#17).
 *
 * Mirrors the shop-order pay-modal UX: shows the SERVICE destination account +
 * QR (3-account SOT), then a เฟิมยอด (confirm) action with §0f confirm-before-
 * mutate. Confirm/reject are the ONLY mutations and they only flip
 * customer_confirm_status (actions/customs-confirm.ts) — never money.
 *
 * After confirm, the customer pays into the shown SERVICE account + the team
 * verifies + collects (admin side) — the slip/verify loop is unchanged here.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";
import type { PacredBankAccount } from "@/lib/payment/bank-accounts";
import { PayDestination } from "@/components/payment/pay-destination";
import {
  customerConfirmCustomsDraft,
  customerRejectCustomsDraft,
} from "@/actions/customs-confirm";

export function CustomsConfirmClient({
  token,
  declarationId,
  isCargo,
  status,
  confirmedAt,
  account,
  collectable,
  serviceQrDataUrl,
}: {
  token: string;
  declarationId: string;
  isCargo: boolean;
  status: "sent" | "confirmed" | "rejected";
  confirmedAt: string | null;
  account: PacredBankAccount;
  collectable: number;
  serviceQrDataUrl: string | null;
}) {
  const [state, setState] = useState<"sent" | "confirmed" | "rejected">(status);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Token-scoped PUBLIC PDF links (#17) — the logged-out customer opens the
  // prepared docs to review before เฟิมยอด. Each route validates token↔id↔status
  // server-side; a wrong/absent token 404s.
  const enc = encodeURIComponent(token);
  const docLinks: { href: string; label: string }[] = [
    { href: `/api/customs-declaration/${declarationId}?token=${enc}`, label: "ดูใบขนสินค้า" },
    ...(isCargo
      ? [
          { href: `/api/customs-declaration/${declarationId}/invoice?token=${enc}`, label: "ดูใบแจ้งหนี้ (Invoice)" },
          { href: `/api/customs-declaration/${declarationId}/packing-list?token=${enc}`, label: "ดู Packing List" },
        ]
      : []),
  ];

  function onConfirm() {
    if (pending) return;
    if (!window.confirm(`ยืนยันยอดที่ต้องชำระ ฿${collectable.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ?\n\nหลังยืนยัน บริษัทจะดำเนินการออกใบขนในนามของท่านและแจ้งช่องทางชำระเงิน`)) return;
    setErr(null);
    startTransition(async () => {
      const r = await customerConfirmCustomsDraft(token);
      if (r.ok) setState("confirmed");
      else setErr(humanError(r.error));
    });
  }

  function onReject() {
    if (pending) return;
    if (!window.confirm("ขอแก้ไข/ยังไม่ยืนยันยอดนี้?\n\nทีมงานจะติดต่อกลับเพื่อปรับรายละเอียด")) return;
    setErr(null);
    startTransition(async () => {
      const r = await customerRejectCustomsDraft(token);
      if (r.ok) setState("rejected");
      else setErr(humanError(r.error));
    });
  }

  const docButtons = (
    <section className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">เอกสารที่เตรียมไว้</p>
      <div className="flex flex-col gap-1.5">
        {docLinks.map((d) => (
          <a
            key={d.href}
            href={d.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border bg-white dark:bg-surface px-3 py-2.5 text-[14px] font-medium text-foreground hover:bg-surface-alt"
          >
            <FileText className="h-4 w-4 text-primary-600" />
            <span>📄 {d.label}</span>
          </a>
        ))}
      </div>
    </section>
  );

  if (state === "confirmed") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50 py-5 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <p className="mt-2 text-base font-bold text-emerald-800">ยืนยันยอดเรียบร้อย 🎉</p>
          <p className="mt-1 text-xs text-emerald-700">
            กรุณาชำระเงินตามช่องทางด้านล่าง แล้วแจ้งสลิปกับทีมงาน
            {confirmedAt && ` · ยืนยันเมื่อ ${new Date(confirmedAt).toLocaleString("th-TH")}`}
          </p>
        </div>
        {docButtons}
        {/* SERVICE destination — pay here after confirming */}
        <PayDestination account={account} amountThb={collectable} serviceQrDataUrl={serviceQrDataUrl} />
      </div>
    );
  }

  if (state === "rejected") {
    // No doc links: a rejected draft is no longer 'sent'/'confirmed' so the
    // token routes 404 it (server-side). The team will re-send after revising.
    return (
      <div className="flex flex-col items-center rounded-xl border border-rose-200 bg-rose-50 py-5 text-center">
        <XCircle className="h-10 w-10 text-rose-500" />
        <p className="mt-2 text-sm font-bold text-rose-800">ส่งคำขอแก้ไขแล้ว</p>
        <p className="mt-1 text-xs text-rose-700">ทีมงานจะติดต่อกลับเพื่อปรับรายละเอียดใบขน</p>
      </div>
    );
  }

  // status === "sent" → awaiting the customer's decision.
  return (
    <div className="space-y-3">
      {/* Prepared docs — open to review before confirming */}
      {docButtons}

      {/* Destination preview (shown before confirm so the customer sees where to pay) */}
      <PayDestination account={account} amountThb={collectable} serviceQrDataUrl={serviceQrDataUrl} />

      {err && <p className="text-xs text-rose-600">⚠️ {err}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          เฟิมยอด (ยืนยัน)
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          className="rounded-2xl border border-border bg-white dark:bg-surface px-4 py-3 text-[14px] font-medium text-muted hover:bg-surface-alt disabled:opacity-50"
        >
          ขอแก้ไข
        </button>
      </div>
    </div>
  );
}

function humanError(code: string): string {
  switch (code) {
    case "not_found":        return "ไม่พบใบขนนี้ (ลิงก์อาจหมดอายุ)";
    case "not_pending":      return "ใบขนนี้ไม่อยู่ในสถานะรอยืนยันแล้ว";
    case "already_confirmed":return "ยืนยันยอดไปแล้ว";
    case "invalid_token":    return "ลิงก์ไม่ถูกต้อง";
    default:                 return "ทำรายการไม่สำเร็จ กรุณาลองใหม่";
  }
}
