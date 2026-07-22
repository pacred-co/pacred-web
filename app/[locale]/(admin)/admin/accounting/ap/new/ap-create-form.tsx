"use client";

/**
 * Create a new AP disbursement REQUEST (ขอเบิก · transfer_status='requested').
 * Spec §4 + §5: this writes ONLY the ap_disbursement row (a record of intent) —
 * no money moves. Confirm-before-mutate (§0f); server recomputes/validates.
 *
 * The lane picker maps 1:1 to the xlsx tabs; the category enum is load-bearing
 * (service_cost / advance_passthrough / refund_correction). A refund/correction
 * fills ยอดคืน; a normal spend fills ยอดเบิก (the server requires one > 0).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { createApRequest } from "@/actions/admin/ap-disbursement";
import {
  AP_LANE_ORDER,
  AP_LANE_LABEL,
  AP_ENTITY_LABEL,
  AP_CATEGORY_LABEL,
  type ApLane,
  type ApEntity,
  type ApCategory,
} from "@/lib/admin/ap-disbursement";
import type { PacredAccountKey } from "@/lib/payment/bank-accounts";

const SOURCE_ACCOUNTS: { key: PacredAccountKey; label: string }[] = [
  { key: "service", label: "SERVICE 204-1-55856-6 (บริการ · ไม่ออกใบกำกับ)" },
  { key: "logistics", label: "LOGISTICS 225-2-91144-0 (ขนส่งในไทย)" },
  { key: "trading", label: "TRADING 232-1-07669-9 (ใบกำกับ + VAT7%)" },
];

export function ApCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [lane, setLane] = useState<ApLane>("sea");
  const [entity, setEntity] = useState<ApEntity>("pacred");
  const [category, setCategory] = useState<ApCategory>("service_cost");
  const [itemLabel, setItemLabel] = useState("");
  const [shipmentNo, setShipmentNo] = useState("");
  const [quotationNo, setQuotationNo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [lineName, setLineName] = useState("");
  const [note, setNote] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [isCustomerNamed, setIsCustomerNamed] = useState(false);

  const [amountWithdraw, setAmountWithdraw] = useState("");
  const [amountRefund, setAmountRefund] = useState("");
  const [amountGross, setAmountGross] = useState("");
  const [whtPct, setWhtPct] = useState("");
  const [whtCertNo, setWhtCertNo] = useState("");

  const [sourceAccountKey, setSourceAccountKey] = useState<PacredAccountKey | "">("");
  const [payeeName, setPayeeName] = useState("");
  const [payeeAccountNo, setPayeeAccountNo] = useState("");
  const [payeeBank, setPayeeBank] = useState("");
  const [payChannel, setPayChannel] = useState("");

  const isRefundLane = category === "refund_correction";

  function onSubmit() {
    setErr(null);
    const w = Number(amountWithdraw || 0);
    const rf = Number(amountRefund || 0);
    if (!itemLabel.trim()) {
      setErr("กรุณากรอกรายการเบิกเงิน");
      return;
    }
    if (w <= 0 && rf <= 0) {
      setErr("กรุณากรอกยอดเบิกหรือยอดคืนอย่างน้อยหนึ่งช่อง (> 0)");
      return;
    }
    startTransition(async () => {
      const net = w - rf;
      const ok = await confirm(
        `บันทึกคำขอเบิก "${itemLabel.trim()}" (สุทธิ ฿${net.toLocaleString("en-US", {
          minimumFractionDigits: 2,
        })})?\n\nเป็นการบันทึก "คำขอเบิก" (requested) — ยังไม่ตัดจ่ายเงิน.`,
        { title: "บันทึกคำขอเบิก", confirmLabel: "บันทึก" },
      );
      if (!ok) return;
      const res = await createApRequest({
        lane,
        entity,
        category,
        item_label: itemLabel.trim(),
        shipment_no: shipmentNo || null,
        quotation_no: quotationNo || null,
        customer_id: customerId || null,
        line_name: lineName || null,
        note: note || null,
        expense_category: expenseCategory || null,
        is_customer_named_receipt: isCustomerNamed,
        amount_withdraw: w,
        amount_refund: rf,
        amount_gross: amountGross ? Number(amountGross) : null,
        wht_pct: whtPct ? Number(whtPct) : null,
        wht_cert_no: whtCertNo || null,
        source_account_key: sourceAccountKey || null,
        payee_name: payeeName || null,
        payee_account_no: payeeAccountNo || null,
        payee_bank: payeeBank || null,
        pay_channel: payChannel || null,
      });
      if (res.ok && res.data) {
        router.push(`/admin/accounting/ap/${res.data.id}`);
      } else {
        setErr(res.ok ? "unknown_error" : res.error);
      }
    });
  }

  const labelCls = "mb-1 block text-xs font-medium text-gray-600";
  const inputCls = "w-full rounded-lg border border-black/15 px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          ⚠️ {err}
        </div>
      )}

      {/* lane / entity / category */}
      <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="c-lane">เลน (sheet)</label>
          <select id="c-lane" value={lane} onChange={(e) => setLane(e.target.value as ApLane)} className={inputCls}>
            {AP_LANE_ORDER.map((l) => (
              <option key={l} value={l}>{AP_LANE_LABEL[l]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="c-entity">Entity</label>
          <select id="c-entity" value={entity} onChange={(e) => setEntity(e.target.value as ApEntity)} className={inputCls}>
            {(Object.keys(AP_ENTITY_LABEL) as ApEntity[]).map((e) => (
              <option key={e} value={e}>{AP_ENTITY_LABEL[e]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="c-cat">หมวดหมู่รายการ</label>
          <select id="c-cat" value={category} onChange={(e) => setCategory(e.target.value as ApCategory)} className={inputCls}>
            {(Object.keys(AP_CATEGORY_LABEL) as ApCategory[]).map((c) => (
              <option key={c} value={c}>{AP_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </div>
      </section>

      {/* item + linkage */}
      <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="c-item">รายการเบิกเงิน *</label>
          <input id="c-item" value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="เช่น ค่า D/O · ค่าบริการ FORM E · ค่าลงทะเบียน + จับคู่ YY" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-ship">SHIPMENT / เลขงาน</label>
          <input id="c-ship" value={shipmentNo} onChange={(e) => setShipmentNo(e.target.value)} placeholder="PRA260050001" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-qo">QUOTATION (QO)</label>
          <input id="c-qo" value={quotationNo} onChange={(e) => setQuotationNo(e.target.value)} placeholder="QO-20260500013" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-cust">รหัสลูกค้า</label>
          <input id="c-cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="PR… / A…" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-line">ชื่อในไลน์ / ใบวางแจ้งหนี้</label>
          <input id="c-line" value={lineName} onChange={(e) => setLineName(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="c-exp">หมวดบัญชี (OPEX เท่านั้น)</label>
          <input id="c-exp" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} placeholder="ค่าใช้จ่ายทั่วไป / บุคลากร / เงินสดย่อย / ต้นทุนขนส่งจีน-ไทย…" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="c-note">หมายเหตุ / REMARK</label>
          <textarea id="c-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
          <input type="checkbox" checked={isCustomerNamed} onChange={(e) => setIsCustomerNamed(e.target.checked)} />
          มีใบเสร็จรับเงิน<span className="font-semibold">ชื่อลูกค้า</span> (เงินทดรองจ่าย · pass-through · ห้ามบันทึกเป็นรายได้/กำไร)
        </label>
      </section>

      {/* money */}
      <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="c-w">ยอดเบิก (฿){isRefundLane ? "" : " *"}</label>
          <input id="c-w" type="number" step="0.01" min="0" value={amountWithdraw} onChange={(e) => setAmountWithdraw(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-r">ยอดคืน (฿)</label>
          <input id="c-r" type="number" step="0.01" min="0" value={amountRefund} onChange={(e) => setAmountRefund(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-g">ฐาน gross (ก่อนหัก ณ ที่จ่าย)</label>
          <input id="c-g" type="number" step="0.01" min="0" value={amountGross} onChange={(e) => setAmountGross(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-wht">อัตราหัก ณ ที่จ่าย (%)</label>
          <input id="c-wht" type="number" step="0.01" min="0" max="100" value={whtPct} onChange={(e) => setWhtPct(e.target.value)} placeholder="1 / 3" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="c-cert">เลขที่ใบหัก (WT/WT3/WT53)</label>
          <input id="c-cert" value={whtCertNo} onChange={(e) => setWhtCertNo(e.target.value)} className={inputCls} />
        </div>
      </section>

      {/* accounts */}
      <section className="grid gap-4 rounded-xl border border-black/10 bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="c-src">บัญชีที่จ่ายออก (Pacred · source · 3-account SOT)</label>
          <select id="c-src" value={sourceAccountKey} onChange={(e) => setSourceAccountKey(e.target.value as PacredAccountKey | "")} className={inputCls}>
            <option value="">— อนุมานจากเลน (ไม่ระบุ) —</option>
            {SOURCE_ACCOUNTS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="c-pn">ผู้รับเงิน — ชื่อบัญชี</label>
          <input id="c-pn" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-pa">ผู้รับเงิน — เลขบัญชี</label>
          <input id="c-pa" value={payeeAccountNo} onChange={(e) => setPayeeAccountNo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-pb">ผู้รับเงิน — ธนาคาร</label>
          <input id="c-pb" value={payeeBank} onChange={(e) => setPayeeBank(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="c-pc">ช่องทาง</label>
          <input id="c-pc" value={payChannel} onChange={(e) => setPayChannel(e.target.value)} placeholder="พร้อมเพย์ / โอน / สแกน Alipay" className={inputCls} />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกคำขอเบิก"}
        </button>
        <span className="text-[12px] text-gray-500">
          บันทึกเป็น “ต้องการเบิก” (requested) — ยังไม่ตัดจ่าย เงินจะจ่ายจริงในขั้นตอน “อนุมัติ → บันทึกการโอน”
        </span>
      </div>
    </div>
  );
}
