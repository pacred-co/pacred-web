"use client";

/**
 * Cart tax-document preference (เดฟ 2026-05-30 · P1 of the tax-billing-flow
 * rebuild · 3-mode extension 2026-06-04 — Lane B / Global Trade Group §3).
 *
 * Owner directive at /cart: "เลือกไว้เลยว่าเอา VAT ออกใบกำกับภาษีอะไร
 * ประมาณนั้น." → at order time, the customer picks ONE of the 3 document
 * modes for THIS order (lib/tax/tax-doc-mode.ts is the SOT):
 *
 *   - tax_invoice → ใบกำกับภาษี · VAT 7% on the GOODS VALUE (we import under
 *                    our name). [default for juristic]
 *   - customs     → ใบขนสินค้า · VAT 7% on the SERVICE FEE only (customs-
 *                    brokerage; customer owns the goods).
 *   - receipt     → ไม่รับเอกสาร · ใบเสร็จรับเงิน, no VAT in the bill (margin
 *                    is Pacred's taxable profit). [default for personal]
 *
 * The choice + a snapshot of the 13-digit tax id + company address are
 * persisted on tb_header_order.tax_doc_pref so the billing/payment-land flow
 * knows what to issue. The 'customs' + 'tax_invoice' modes both require the
 * billing snapshot; 'receipt' needs nothing.
 */

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FileText, Receipt, FileCheck2 } from "lucide-react";
import {
  TAX_DOC_MODES,
  TAX_DOC_MODE_META,
  prefFromMode,
  modeRequiresBillingSnapshot,
  type TaxDocMode,
} from "@/lib/tax/tax-doc-mode";

export type TaxDocDefaults = {
  isJuristic: boolean;
  taxId: string;        // 13-digit
  companyName: string;
  companyAddress: string;
};

const MODE_ICON: Record<TaxDocMode, ReactNode> = {
  tax_invoice: <FileText className="w-4 h-4" />,
  customs: <FileCheck2 className="w-4 h-4" />,
  none: <Receipt className="w-4 h-4" />,
};

export function CartTaxDocPref({
  defaults,
  defaultMode,
}: {
  defaults: TaxDocDefaults;
  /** 2026-06-09 (create-order fix) — force the initial doc mode. The ฝากนำเข้า
   *  order-entry form passes "none" so creating an order never hard-blocks on
   *  the auto-tax_invoice billing fields (a juristic customer with incomplete
   *  tb_corporate could not submit); the customer opts INTO ใบกำกับ/ใบขน. The
   *  cart omits this → keeps the juristic auto-default. */
  defaultMode?: TaxDocMode;
}) {
  const t = useTranslations("cartPage");
  const [mode, setMode] = useState<TaxDocMode>(
    defaultMode ?? (defaults.isJuristic && defaults.taxId ? "tax_invoice" : "none"),
  );

  // The persisted column value ('tax_invoice' | 'customs' | 'receipt').
  const pref = prefFromMode(mode);
  const needsBilling = modeRequiresBillingSnapshot(mode);

  return (
    <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-border bg-gradient-to-r from-rose-50/60 via-white to-white">
        <h3 className="text-[13px] font-bold text-foreground">{t("taxDocHeader")}</h3>
        <p className="mt-0.5 text-[11px] text-muted">{t("taxDocSubheader")}</p>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TAX_DOC_MODES.map((m) => {
            const meta = TAX_DOC_MODE_META[m];
            const id = `taxDocMode-${m}`;
            return (
              <OptionTile
                key={m}
                id={id}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                title={meta.title}
                hint={meta.hint}
                icon={MODE_ICON[m]}
              />
            );
          })}
        </div>

        {/* Hidden form input — read by CartInteractivity.handleSubmitOrder via
            fd.get('taxDocPref'). Carries the COLUMN value (tax_invoice|customs|
            receipt), not the UI mode. */}
        <input type="hidden" name="taxDocPref" value={pref} />

        {needsBilling && (
          <div className="space-y-2 rounded-lg border border-primary-200 bg-rose-50/40 p-3">
            <p className="text-[11.5px] font-medium text-foreground">
              {t("infoFor", { doc: TAX_DOC_MODE_META[mode].title })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="sm:col-span-1 block">
                <span className="block text-[10.5px] text-muted mb-0.5">{t("taxIdLabel")}</span>
                <input
                  name="taxDocTaxId"
                  defaultValue={defaults.taxId}
                  maxLength={13}
                  inputMode="numeric"
                  pattern="\d{13}"
                  placeholder="0105564077716"
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs font-mono"
                  required={needsBilling}
                />
              </label>
              <label className="sm:col-span-2 block">
                <span className="block text-[10.5px] text-muted mb-0.5">{t("companyNameLabel")}</span>
                <input
                  name="taxDocBillingName"
                  defaultValue={defaults.companyName}
                  maxLength={300}
                  placeholder={t("companyNamePlaceholder")}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
                  required={needsBilling}
                />
              </label>
              <label className="sm:col-span-3 block">
                <span className="block text-[10.5px] text-muted mb-0.5">
                  {t("addressFor", { doc: TAX_DOC_MODE_META[mode].title })}
                </span>
                <textarea
                  name="taxDocAddress"
                  defaultValue={defaults.companyAddress}
                  maxLength={500}
                  rows={2}
                  placeholder={t("addressPlaceholder")}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
                  required={needsBilling}
                />
              </label>
            </div>
            <p className="text-[10.5px] text-muted">
              {t.rich("vatExplain", {
                base: TAX_DOC_MODE_META[mode].vatBase,
                doc: TAX_DOC_MODE_META[mode].title,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
              {defaults.isJuristic && " · "}
              {defaults.isJuristic &&
                t.rich("vatJuristic", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionTile({
  id, value, checked, onChange, title, hint, icon,
}: {
  id: string; value: string; checked: boolean; onChange: () => void;
  title: string; hint: string; icon: ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type="radio"
        name="taxDocPrefRadio"
        id={id}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="group cursor-pointer flex items-start gap-2 rounded-xl border border-border bg-white px-3 py-2.5 transition-all hover:border-primary-300 hover:bg-rose-50/40 peer-checked:border-primary-500 peer-checked:bg-gradient-to-br peer-checked:from-rose-50 peer-checked:to-rose-100/60 peer-checked:ring-2 peer-checked:ring-primary-100 peer-checked:shadow-md peer-checked:shadow-primary-600/10 peer-checked:[&_.taxdoc-icon]:bg-primary-600 peer-checked:[&_.taxdoc-icon]:text-white"
      >
        <span className="taxdoc-icon mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600 transition-colors shrink-0">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-bold text-foreground leading-tight">{title}</span>
          <span className="block text-[10.5px] text-muted leading-tight mt-0.5">{hint}</span>
        </span>
      </label>
    </div>
  );
}
