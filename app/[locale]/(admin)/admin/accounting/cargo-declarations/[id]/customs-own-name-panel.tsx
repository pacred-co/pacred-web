"use client";

/**
 * <CustomsOwnNamePanel> — ใบขนพ่วง admin controls (#17).
 *
 * Toggle "ออกใบขนในชื่อลูกค้าเอง" + capture the customer's consignee snapshot +
 * ค่าบริการ → ส่ง draft ให้ลูกค้ายืนยัน (LINE) → after the customer confirms,
 * เก็บเงิน (service-fee + อากร + VAT) เข้าบัญชี SERVICE.
 *
 * Mirrors the report-cnt/shop-order admin UX. §0f confirm-before-mutate on every
 * write. All mutations route through actions/admin/cargo-declarations.ts — money
 * routing via the 3-account SOT, never hardcoded.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, BadgeCheck, Coins } from "lucide-react";
import {
  adminSetCustomsOwnName,
  adminSendCustomsDraftToCustomer,
  adminCollectConfirmedCustomsDraft,
} from "@/actions/admin/cargo-declarations";
import { PACRED_BANK_ACCOUNTS } from "@/lib/payment/bank-accounts";

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ConfirmStatus = "none" | "sent" | "confirmed" | "rejected";

const CONFIRM_LABEL: Record<ConfirmStatus, { text: string; cls: string }> = {
  none:      { text: "ยังไม่ส่งให้ลูกค้า", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  sent:      { text: "ส่งแล้ว · รอลูกค้ายืนยัน", cls: "bg-blue-100 text-blue-700 border-blue-300" },
  confirmed: { text: "ลูกค้ายืนยันยอดแล้ว", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejected:  { text: "ลูกค้าขอแก้ไข", cls: "bg-rose-100 text-rose-700 border-rose-300" },
};

export function CustomsOwnNamePanel({
  declarationId,
  isDraft,
  canEdit,
  initial,
  totalDutyThb,
  totalVatThb,
  defaultServiceFee,
}: {
  declarationId: string;
  isDraft: boolean;
  /** true = cost/Docs role AND draft (the server action re-checks). */
  canEdit: boolean;
  initial: {
    issueInCustomerName: boolean;
    consigneeName: string | null;
    consigneeTaxId: string | null;
    consigneeAddress: string | null;
    serviceFeeThb: number | null;
    confirmStatus: ConfirmStatus;
    confirmedAt: string | null;
    collected: boolean;
  };
  totalDutyThb: number;
  totalVatThb: number;
  /** computeDeclarationFee default (ขาประจำ) — prefill for a fresh own-name decl. */
  defaultServiceFee: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [own, setOwn] = useState(initial.issueInCustomerName);
  const [name, setName] = useState(initial.consigneeName ?? "");
  const [taxId, setTaxId] = useState(initial.consigneeTaxId ?? "");
  const [address, setAddress] = useState(initial.consigneeAddress ?? "");
  const [fee, setFee] = useState<string>(
    initial.serviceFeeThb != null ? String(initial.serviceFeeThb) : String(defaultServiceFee),
  );

  const status = initial.confirmStatus;
  const feeNum = Number(fee || 0);
  const collectable = (Number.isFinite(feeNum) ? feeNum : 0) + totalDutyThb + totalVatThb;
  // After the draft is sent/confirmed the own-name fields lock (the customer
  // already saw them) — only the pre-send draft is editable here.
  const fieldsLocked = !canEdit || !isDraft || status !== "none";

  function save() {
    if (pending) return;
    if (!window.confirm("บันทึกข้อมูลผู้นำเข้า + ค่าบริการ ของใบขนพ่วงนี้?")) return;
    setErr(null);
    startTransition(async () => {
      const r = await adminSetCustomsOwnName({
        declarationId,
        issueInCustomerName: own ? "true" : "false",
        consigneeName: name,
        consigneeTaxId: taxId,
        consigneeAddress: address,
        serviceFeeThb: fee,
      });
      if (r.ok) router.refresh();
      else setErr(human(r.error));
    });
  }

  function send() {
    if (pending) return;
    if (
      !window.confirm(
        `ส่งร่างใบขน + อินวอยซ์ + แพคกิ้ง ให้ลูกค้ายืนยันยอด ฿${fmt(collectable)} ทาง LINE?\n\n` +
          `(ค่าบริการ ฿${fmt(Number(initial.serviceFeeThb ?? feeNum))} + อากร ฿${fmt(totalDutyThb)} + VAT ฿${fmt(totalVatThb)})`,
      )
    )
      return;
    setErr(null);
    startTransition(async () => {
      const r = await adminSendCustomsDraftToCustomer({ declarationId });
      if (r.ok) router.refresh();
      else setErr(human(r.error));
    });
  }

  function collect() {
    if (pending) return;
    if (
      !window.confirm(
        `บันทึกการเก็บเงิน ฿${fmt(collectable)} (ค่าบริการ + อากร + VAT) เข้าบัญชี ${PACRED_BANK_ACCOUNTS.service.label} (${PACRED_BANK_ACCOUNTS.service.accountNo})?\n\n` +
          `ทำได้หลังลูกค้ายืนยันยอดแล้ว · บันทึกครั้งเดียวต่อใบขน`,
      )
    )
      return;
    setErr(null);
    startTransition(async () => {
      const r = await adminCollectConfirmedCustomsDraft({ declarationId });
      if (r.ok) router.refresh();
      else setErr(human(r.error));
    });
  }

  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/30 dark:bg-surface p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-sm">📑 ใบขนพ่วง — ออกในชื่อลูกค้าเอง</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CONFIRM_LABEL[status].cls}`}>
          {CONFIRM_LABEL[status].text}
        </span>
        {initial.collected && (
          <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            เก็บเงินแล้ว → บัญชี Service
          </span>
        )}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={own}
          disabled={fieldsLocked}
          onChange={(e) => setOwn(e.target.checked)}
        />
        ออกใบขนในชื่อลูกค้าเอง (เราเป็นตัวแทนออกของ ไม่ใช่ผู้นำเข้า)
      </label>

      {own && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="text-muted">ชื่อผู้นำเข้า (ตามใบขน)</span>
            <input
              value={name}
              disabled={fieldsLocked}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm disabled:opacity-60"
              placeholder="บจก. ... / ชื่อ-สกุล"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted">เลขประจำตัวผู้เสียภาษี</span>
            <input
              value={taxId}
              disabled={fieldsLocked}
              onChange={(e) => setTaxId(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm font-mono disabled:opacity-60"
              placeholder="0-0000-00000-00-0"
            />
          </label>
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="text-muted">ที่อยู่ผู้นำเข้า</span>
            <textarea
              value={address}
              disabled={fieldsLocked}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm disabled:opacity-60"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted">ค่าบริการออกใบขน (฿)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={fee}
              disabled={fieldsLocked}
              onChange={(e) => setFee(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm font-mono disabled:opacity-60"
            />
          </label>
          <div className="text-xs flex items-end pb-1.5 text-muted">
            ยอดเก็บลูกค้า = ค่าบริการ ฿{fmt(Number.isFinite(feeNum) ? feeNum : 0)} + อากร ฿{fmt(totalDutyThb)} + VAT ฿{fmt(totalVatThb)} ={" "}
            <b className="ml-1 text-primary-700">฿{fmt(collectable)}</b>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-rose-600">⚠️ {err}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        {!fieldsLocked && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-400 bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            บันทึก
          </button>
        )}
        {/* Send draft → only an own-name draft not yet confirmed. */}
        {own && canEdit && isDraft && (status === "none" || status === "rejected") && (
          <button
            type="button"
            onClick={send}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400 bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> ส่งให้ลูกค้ายืนยัน (LINE)
          </button>
        )}
        {/* Collect → only after the customer confirmed + not yet collected. */}
        {own && canEdit && status === "confirmed" && !initial.collected && (
          <button
            type="button"
            onClick={collect}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Coins className="h-3.5 w-3.5" /> เก็บเงิน → บัญชี Service
          </button>
        )}
        {status === "confirmed" && initial.confirmedAt && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" /> ลูกค้ายืนยันเมื่อ {new Date(initial.confirmedAt).toLocaleString("th-TH")}
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted">
        อากร + VAT = ภาษีศุลกากรของลูกค้า บริษัทเก็บแล้วนำส่ง (pass-through · ไม่ใช่ VAT ของบริษัท · ไม่ออกใบกำกับ) → เข้าบัญชี Service
      </p>
    </section>
  );
}

function human(code: string): string {
  switch (code) {
    case "not_draft":                 return "แก้ได้เฉพาะใบขนสถานะร่าง";
    case "already_sent_to_customer":  return "ส่งให้ลูกค้าแล้ว แก้ข้อมูลผู้นำเข้าไม่ได้";
    case "not_own_name_declaration":  return "ต้องเปิด \"ออกในชื่อลูกค้า\" ก่อน";
    case "forwarder_has_no_customer": return "ออเดอร์นี้ไม่มีลูกค้าผูกไว้";
    case "not_confirmed":             return "ต้องรอลูกค้ายืนยันยอดก่อนเก็บเงิน";
    case "already_collected":         return "เก็บเงินใบขนนี้ไปแล้ว";
    case "already_confirmed":         return "ลูกค้ายืนยันแล้ว";
    default:                          return code.startsWith("บันทึก") || code.startsWith("ส่ง") ? code : "ทำรายการไม่สำเร็จ";
  }
}
