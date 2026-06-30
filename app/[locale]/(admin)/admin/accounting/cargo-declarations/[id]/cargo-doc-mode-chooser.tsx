"use client";

/**
 * <CargoDocModeChooser> — pick the document mode for a CARGO ใบขน (task #16).
 *
 * ใบกำกับ(tax_invoice) / ใบขน(customs) / ไม่รับเอกสาร(none) — the choice decides
 * BOTH the customer document AND the destination Pacred account at issuance:
 *   - tax_invoice → goods imported in OUR name · VAT 7% on goods · TRADING acct
 *   - customs / none → no customer VAT line (ใบขน Non / margin-VAT internal) · SERVICE acct
 *
 * The destination is resolved via the 3-account SOT (resolvePaymentAccount) and
 * shown here so staff see where the customer will pay. §0f confirm-before-mutate.
 * Sets the mode on the linked tb_cargo_taxdoc_job (materialised if missing).
 * DISPLAY/ROUTE-CHOICE only — issuance stays a separate, gated step.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  TAX_DOC_MODES,
  TAX_DOC_MODE_META,
  type TaxDocMode,
} from "@/lib/tax/tax-doc-mode";
import { resolvePaymentAccount, OUTPUT_VAT_RATE } from "@/lib/payment/bank-accounts";
import { PayDestination } from "@/components/payment/pay-destination";
import { adminSetCargoTaxdocModeByForwarder } from "@/actions/admin/cargo-taxdoc-workspace";

function modeFromDocMode(raw: string | null | undefined): TaxDocMode {
  const p = (raw ?? "").trim();
  if (p === "tax_invoice") return "tax_invoice";
  if (p === "customs") return "customs";
  return "none"; // 'receipt' / '' / null → none
}

export function CargoDocModeChooser({
  fid,
  initialDocMode,
}: {
  fid: number;
  initialDocMode: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<TaxDocMode>(modeFromDocMode(initialDocMode));
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // The destination account for the currently-chosen mode (3-account SOT).
  const account = resolvePaymentAccount({ issuesTaxInvoice: mode === "tax_invoice" });

  function choose(next: TaxDocMode) {
    if (next === mode || pending) return;
    setErr(null);
    const meta = TAX_DOC_MODE_META[next];
    const nextAcct = resolvePaymentAccount({ issuesTaxInvoice: next === "tax_invoice" });
    if (
      !window.confirm(
        `ตั้งโหมดเอกสารเป็น "${meta.title}"?\n\n` +
          `• VAT: ${next === "tax_invoice" ? `บวก VAT ${Math.round(OUTPUT_VAT_RATE * 100)}% จากมูลค่าสินค้า` : "ไม่มี VAT ในบิลลูกค้า"}\n` +
          `• บัญชีรับเงิน: ${nextAcct.label} (${nextAcct.accountNo})\n\n` +
          `(เลือกโหมด/เส้นทางบัญชีเท่านั้น · ยังไม่ออกเอกสารจริง)`,
      )
    )
      return;
    startTransition(async () => {
      const res = await adminSetCargoTaxdocModeByForwarder({ fid, docMode: meta.pref });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMode(next);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-sm">🧾 โหมดเอกสาร + บัญชีรับเงิน</h2>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {TAX_DOC_MODES.map((m) => {
          const meta = TAX_DOC_MODE_META[m];
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => choose(m)}
              disabled={pending}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium disabled:opacity-60 ${
                active
                  ? "border-primary-600 bg-primary-600 text-white"
                  : "border-border bg-white dark:bg-surface hover:bg-surface-alt"
              }`}
              title={meta.hint}
            >
              {meta.title}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted">{TAX_DOC_MODE_META[mode].hint}</p>

      {/* Resolved destination account for the chosen mode (3-account SOT) —
         the same <PayDestination> the customer pay surfaces render, so the
         TRADING K-Shop QR shows when mode=ใบกำกับ. */}
      <PayDestination account={account} className="max-w-md" />
      {account.issuesTaxInvoice ? (
        <p className="text-[11px] font-medium text-rose-700">
          นำเข้าในนามเรา · บวก VAT {Math.round(OUTPUT_VAT_RATE * 100)}% → เข้าบัญชี Trading
        </p>
      ) : (
        <p className="text-[11px] text-muted">ไม่ออกใบกำกับ · ไม่มี VAT ในบิลลูกค้า → เข้าบัญชี Service</p>
      )}
      <p className="text-[11px] text-muted">ค่าขนส่งในไทย = คนละรายการ (เก็บแยกเข้าบัญชี Logistics)</p>

      {err && <p className="text-xs text-rose-600">⚠️ {err}</p>}
    </section>
  );
}
