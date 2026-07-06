"use client";

/**
 * Client island for the admin-PUSH "เบิกจ่ายค่าสินค้า" eligible-orders
 * table + batch-create modal. Re-sweep A2 #23 (D1 / ADR-0017).
 *
 * Logic ported from `report-shops-profit-pay.php` + getListShop.php
 * (the DataTables multi-select → "เบิกจ่ายค่าสินค้า" modal → submit),
 * but rendered with our own Tailwind design per AGENTS.md §0a (we copy
 * the workflow, polish the look ourselves).
 *
 * Behaviour:
 *   - Each eligible order has a checkbox; the footer shows the running
 *     selected count + SUM(priceUser) (the amount that will be posted).
 *   - "เบิกจ่ายค่าสินค้า" opens a confirm panel listing the selected
 *     orders + a title field + a receiving-bank dropdown.
 *   - Submit → createShopDisbursementBatch({ orderIds, title, accountId }).
 *     On success → navigate to the new batch's history detail.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  createShopDisbursementBatch,
  type EligibleShopOrder,
  type ShopPayAccount,
} from "@/actions/admin/shop-disbursement";
import { bankName } from "@/lib/admin/bank-names";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "40": "ถึงโกดังจีน",
  "5": "สำเร็จ",
  "6": "ยกเลิกออเดอร์",
};

export function ShopDisbursementCreateForm({
  orders,
  accounts,
}: {
  orders: EligibleShopOrder[];
  accounts: ShopPayAccount[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allChecked = orders.length > 0 && selected.size === orders.length;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id)),
    );
  }

  const selectedOrders = useMemo(
    () => orders.filter((o) => selected.has(o.id)),
    [orders, selected],
  );

  // The batch amount = SUM(priceUser) over the selected orders (the value
  // the server recomputes + posts to tb_shop_pay_h.amount). Each order's
  // priceUser is already computed server-side, so sum the precomputed
  // values directly for the live footer + modal display.
  const amount = useMemo(
    () => Math.round(selectedOrders.reduce((s, o) => s + o.priceUser, 0) * 100) / 100,
    [selectedOrders],
  );

  function openModal() {
    setError(null);
    if (selected.size === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 รายการ");
      return;
    }
    setModalOpen(true);
  }

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError("กรุณากรอกชื่อเรื่องที่เบิกเงิน");
      return;
    }
    startTransition(async () => {
      const res = await createShopDisbursementBatch({
        orderIds: Array.from(selected),
        title: title.trim(),
        accountId: accountId ? Number(accountId) : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Success → go to the new batch detail.
      router.push(`/admin/shop-disbursement/history/${res.data?.batchId}`);
    });
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        ไม่พบรายการที่รอเบิกจ่ายในช่วงเวลานี้ (ออเดอร์ที่ชำระเงินแล้ว · ยังไม่เบิกจ่าย)
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-black/10">
        <table className="min-w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="เลือกทั้งหมด"
                  className="h-4 w-4"
                />
              </th>
              <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
              <th className="px-3 py-2 text-left">ข้อมูลสินค้า</th>
              <th className="px-3 py-2 text-left">วันที่ชำระเงิน</th>
              <th className="px-3 py-2 text-right">ราคาต้นทุน (บาท)</th>
              <th className="px-3 py-2 text-right">ราคาขาย (บาท)</th>
              <th className="px-3 py-2 text-right">ค่าบริการ (บาท)</th>
              <th className="px-3 py-2 text-right">VAT 7% (บาท)</th>
              <th className="px-3 py-2 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {orders.map((o) => {
              const checked = selected.has(o.id);
              return (
                <tr
                  key={o.id}
                  className={checked ? "bg-primary-50/60" : "hover:bg-gray-50/60"}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      aria-label={`เลือก ${o.hno}`}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-primary-700">{o.hno}</td>
                  <td className="px-3 py-2 max-w-[16rem] truncate">
                    {o.htitle ?? "—"}
                    {o.hcount && o.hcount > 1 ? ` และอีก ${o.hcount - 1} รายการ` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {o.walletDate ? o.walletDate.replace("T", " ").slice(0, 19) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {o.costKeyed ? fmt2(o.pricePCS) : <span className="text-amber-600">รอคำนวณ</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt2(o.priceUser)}</td>
                  <td className="px-3 py-2 text-right">
                    {o.costKeyed ? fmt2(o.profit) : <span className="text-amber-600">รอคำนวณ</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {o.costKeyed ? fmt2(o.vat7) : <span className="text-amber-600">รอคำนวณ</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                      {STATUS_LABEL[String(o.hstatus)] ?? o.hstatus ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky action footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-4">
        <div className="text-sm">
          เลือกแล้ว <span className="font-semibold">{selected.size}</span> รายการ ·
          ยอดเบิกรวม (ราคาขาย):{" "}
          <span className="font-bold text-primary-700">{fmt2(amount)}</span> บาท
        </div>
        <button
          type="button"
          onClick={openModal}
          disabled={selected.size === 0}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          เบิกจ่ายค่าสินค้า
        </button>
      </div>

      {error && !modalOpen && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Confirm modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-3">
              <h3 className="text-base font-bold">
                ทำรายการเบิกเงิน — {selectedOrders.length} รายการ
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="overflow-x-auto rounded-lg border border-black/10">
                <table className="min-w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
                      <th className="px-3 py-2 text-right">ราคาขาย (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {selectedOrders.map((o, i) => (
                      <tr key={o.id}>
                        <td className="px-3 py-1.5">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-primary-700">{o.hno}</td>
                        <td className="px-3 py-1.5 text-right">{fmt2(o.priceUser)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg bg-primary-50 px-4 py-3 text-sm">
                ยอดเงินที่เบิก (รวมราคาขาย):{" "}
                <span className="text-lg font-bold text-primary-700">{fmt2(amount)}</span> บาท
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="disb-title">
                  ชื่อเรื่องที่เบิกเงิน (เช่น บิลวันที่ 2-3 ธันวา)
                </label>
                <input
                  id="disb-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={300}
                  placeholder="ชื่อเรื่องที่เบิกเงิน"
                  className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="disb-account">
                  บัญชีรับเงิน (ปลายทางที่โอน)
                </label>
                <select
                  id="disb-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                >
                  <option value="">— ไม่ระบุบัญชี (กรอกภายหลังตอนจ่ายเงิน) —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {bankName(a.bankname)} · {a.accountnumber} · {a.accountname}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {pending ? "กำลังทำรายการ…" : "ยืนยันเบิกเงิน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
