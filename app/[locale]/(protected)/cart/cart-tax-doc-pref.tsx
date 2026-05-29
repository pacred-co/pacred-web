"use client";

/**
 * Cart tax-document preference (เดฟ 2026-05-30 · P1 of the tax-billing-flow
 * rebuild — design: docs/research/tax-billing-flow-design-2026-05-30.md).
 *
 * Owner directive at /cart: "เลือกไว้เลยว่าเอา VAT ออกใบกำกับภาษีอะไร
 * ประมาณนั้น." → at order time, the customer picks the kind of tax document
 * they want for THIS order:
 *
 *   - receipt     → ใบเสร็จรับเงิน ปกติ (ไม่มี VAT)             [default for personal]
 *   - tax_invoice → ใบกำกับภาษี + VAT 7% (RD Code 86)          [default for juristic]
 *
 * The choice + a snapshot of the 13-digit tax id + company address are
 * persisted on tb_header_order so the billing/payment-land flow knows what
 * to issue (P2 will route this to the existing tax_invoices machinery).
 *
 * NOTE: "customs" (ใบขนสินค้า) is not offered here — customs is for the
 * import-cargo flow (`tb_forwarder`), not for shop-orders (`tb_header_order`).
 * It will surface on the service-import booking page in a later P3 phase.
 */

import { useState, type ReactNode } from "react";
import { FileText, Receipt } from "lucide-react";

export type TaxDocDefaults = {
  isJuristic: boolean;
  taxId: string;        // 13-digit
  companyName: string;
  companyAddress: string;
};

const OPTIONS = [
  {
    value: "receipt" as const,
    title: "ใบเสร็จรับเงิน",
    hint: "ไม่มี VAT · ลูกค้าบุคคลทั่วไป",
    icon: <Receipt className="w-4 h-4" />,
  },
  {
    value: "tax_invoice" as const,
    title: "ใบกำกับภาษี (มี VAT 7%)",
    hint: "นิติบุคคล · ใช้เครดิตภาษีได้",
    icon: <FileText className="w-4 h-4" />,
  },
];

export function CartTaxDocPref({ defaults }: { defaults: TaxDocDefaults }) {
  const [pref, setPref] = useState<"receipt" | "tax_invoice">(
    defaults.isJuristic && defaults.taxId ? "tax_invoice" : "receipt",
  );

  const needsBilling = pref === "tax_invoice";

  return (
    <div className="rounded-2xl bg-white border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-border bg-gradient-to-r from-rose-50/60 via-white to-white">
        <h3 className="text-[13px] font-bold text-foreground">เอกสารภาษีสำหรับออเดอร์นี้</h3>
        <p className="mt-0.5 text-[11px] text-muted">เลือกล่วงหน้า — ระบบจะออกเอกสารตามที่เลือกตอนชำระเงิน</p>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((opt) => {
            const id = `taxDocPref-${opt.value}`;
            return (
              <OptionTile
                key={opt.value}
                id={id}
                value={opt.value}
                checked={pref === opt.value}
                onChange={() => setPref(opt.value)}
                title={opt.title}
                hint={opt.hint}
                icon={opt.icon}
              />
            );
          })}
        </div>

        {/* Hidden form input — read by CartInteractivity.handleSubmitOrder via fd.get() */}
        <input type="hidden" name="taxDocPref" value={pref} />

        {needsBilling && (
          <div className="space-y-2 rounded-lg border border-primary-200 bg-rose-50/40 p-3">
            <p className="text-[11.5px] font-medium text-foreground">ข้อมูลสำหรับใบกำกับภาษี</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="sm:col-span-1 block">
                <span className="block text-[10.5px] text-muted mb-0.5">เลขผู้เสียภาษี (13 หลัก)</span>
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
                <span className="block text-[10.5px] text-muted mb-0.5">ชื่อบริษัท / ผู้รับใบกำกับภาษี</span>
                <input
                  name="taxDocBillingName"
                  defaultValue={defaults.companyName}
                  maxLength={300}
                  placeholder="บริษัท แพคเรด (ประเทศไทย) จำกัด"
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
                  required={needsBilling}
                />
              </label>
              <label className="sm:col-span-3 block">
                <span className="block text-[10.5px] text-muted mb-0.5">ที่อยู่ตามใบกำกับภาษี</span>
                <textarea
                  name="taxDocAddress"
                  defaultValue={defaults.companyAddress}
                  maxLength={500}
                  rows={2}
                  placeholder="เลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์"
                  className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
                  required={needsBilling}
                />
              </label>
            </div>
            <p className="text-[10.5px] text-muted">
              ระบบจะ <strong>คิด VAT 7%</strong> เพิ่มจากค่าบริการ + ออกใบกำกับภาษีตอนคุณชำระเงิน
              {defaults.isJuristic && " · "}
              {defaults.isJuristic && (
                <>นิติบุคคล <strong>หักภาษี ณ ที่จ่าย</strong> 1% (ค่าขนส่ง) / 3% (ค่าบริการ) — แสดงในบิล</>
              )}
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
