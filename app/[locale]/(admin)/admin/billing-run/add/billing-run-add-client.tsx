"use client";

/**
 * Client island for /admin/billing-run/add — customer picker + forwarder
 * picker + money summary + submit.
 *
 * Mirrors legacy add.php L96-272 (customer dropdown → ajax-loaded forwarder
 * table → summary footer → submit). Differences:
 *   - Customer dropdown is server-loaded (no AJAX-from-DOM) — keeps the
 *     island self-contained + handles auth correctly
 *   - Forwarder table fills on customer change via the
 *     listEligibleForwarders() Server Action (replaces legacy AJAX endpoint)
 *   - Submit calls createBillingRunInvoice() → redirect on success
 */

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  listEligibleForwarders,
  createBillingRunInvoice,
  type EligibleCustomerRow,
  type EligibleForwarderRow,
} from "@/actions/admin/billing-run";

type Props = {
  customers: EligibleCustomerRow[];
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const labelCls = "block text-xs font-medium text-muted mb-1";

export function BillingRunAddClient({ customers }: Props) {
  const router = useRouter();
  const [selectedUserid, setSelectedUserid] = useState<string>("");
  const [eligible, setEligible] = useState<EligibleForwarderRow[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loadingFwd, setLoadingFwd] = useState(false);

  const [dateIssued, setDateIssued] = useState(isoToday());
  const [dateDue, setDateDue] = useState(isoDaysFromToday(7));
  const [deliveryChn, setDeliveryChn] = useState("0");
  const [deliveryTh, setDeliveryTh]   = useState("0");
  const [other, setOther]             = useState("0");
  const [discount, setDiscount]       = useState("0");
  const [note, setNote]               = useState("");

  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.userid === selectedUserid) ?? null,
    [customers, selectedUserid],
  );

  // Hide already-billed rows by default (legacy hid them implicitly)
  const visibleForwarders = useMemo(
    () => (eligible ?? []).filter((f) => !f.already_billed),
    [eligible],
  );

  // Per-row checked map (cleared on customer change)
  function toggleId(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(visibleForwarders.map((f) => f.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  /**
   * Load eligible forwarders when a customer is picked.
   * The synchronous resets (eligible→null · selectedIds→empty) happen in the
   * onChange handler below to avoid React 19's setState-in-effect warning.
   * useEffect here only drives the async fetch, which setState-via-Promise
   * is allowed.
   */
  useEffect(() => {
    if (!selectedUserid) return;
    let cancelled = false;
    listEligibleForwarders(selectedUserid).then((res) => {
      if (cancelled) return;
      setLoadingFwd(false);
      if (res.ok) {
        setEligible(res.data!.rows);
        // Default selection: tick all unbilled rows
        setSelectedIds(new Set(res.data!.rows.filter((r) => !r.already_billed).map((r) => r.id)));
      } else {
        setEligible([]);
      }
    });
    return () => { cancelled = true; };
  }, [selectedUserid]);

  function onCustomerChange(uid: string) {
    setSelectedUserid(uid);
    setEligible(null);
    setSelectedIds(new Set());
    setLoadingFwd(uid !== "");
  }

  // Subtotal = Σ ftotalprice of selected forwarders (the customer-paying
  // total · tb_forwarder.ftotalprice. Earlier draft used fpaytotal which
  // doesn't exist · fixed 2026-06-03 ภูม flag.)
  const subtotal = useMemo(() => {
    if (!eligible) return 0;
    let sum = 0;
    for (const f of eligible) {
      if (selectedIds.has(f.id)) sum += f.ftotalprice;
    }
    return sum;
  }, [eligible, selectedIds]);

  const numChn = Number(deliveryChn) || 0;
  const numTh  = Number(deliveryTh)  || 0;
  const numOther = Number(other) || 0;
  const numDiscount = Number(discount) || 0;
  const totalAmount = Math.max(0, subtotal + numChn + numTh + numOther - numDiscount);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);

    if (selectedIds.size === 0) {
      setSubmitErr("กรุณาเลือกรายการอย่างน้อย 1 รายการ");
      return;
    }
    if (new Date(dateDue) < new Date(dateIssued)) {
      setSubmitErr("วันที่ครบกำหนดจ่ายต้องไม่อยู่ก่อนวันที่ออกเอกสาร");
      return;
    }

    startTransition(async () => {
      const res = await createBillingRunInvoice({
        userid:           selectedUserid,
        forwarderIds:     Array.from(selectedIds),
        dateIssued,
        dateDue,
        deliveryChnThb:   numChn,
        deliveryThThb:    numTh,
        otherThb:         numOther,
        discountThb:      numDiscount,
        noteForCustomer:  note,
      });
      if (res.ok) {
        const id = res.data!.invoiceId;
        router.push(`/admin/billing-run/${id}`);
      } else {
        setSubmitErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* SECTION 1 — Customer picker */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3">ข้อมูลลูกค้า</h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <label className="md:col-span-6">
            <span className={labelCls}>รหัสสมาชิก / ชื่อ / เลขนิติบุคคล <span className="text-red-500">*</span></span>
            <select
              required
              value={selectedUserid}
              onChange={(e) => onCustomerChange(e.target.value)}
              className={inputCls}
            >
              <option value="">— เลือกลูกค้า ({customers.length} ราย) —</option>
              {customers.map((c) => (
                <option key={c.userid} value={c.userid}>
                  {c.display_name} · {c.eligible_count} รายการ · ฿{thbFmt(c.eligible_total_thb)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">
              แสดงเฉพาะลูกค้าที่มีรายการสถานะ <strong>รอชำระเงิน (fStatus=5)</strong>
            </p>
          </label>
          <label className="md:col-span-3">
            <span className={labelCls}>วันที่ออกเอกสาร</span>
            <input
              type="date"
              value={dateIssued}
              onChange={(e) => setDateIssued(e.target.value)}
              required
              className={inputCls}
            />
          </label>
          <label className="md:col-span-3">
            <span className={labelCls}>วันที่ครบกำหนดจ่าย <span className="text-red-500">*</span></span>
            <input
              type="date"
              value={dateDue}
              onChange={(e) => setDateDue(e.target.value)}
              required
              className={inputCls}
            />
            <p className="text-xs text-muted mt-0.5">ค่าเริ่มต้น = วันนี้ + 7 วัน</p>
          </label>
        </div>

        {selectedCustomer && (
          <div className="mt-3 rounded-lg bg-surface-alt/40 p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-muted">ประเภทลูกค้า</div>
              <div className="font-medium">{selectedCustomer.is_juristic ? "นิติบุคคล" : "บุคคลธรรมดา"}</div>
            </div>
            {selectedCustomer.is_juristic && (
              <div>
                <div className="text-muted">เลขประจำตัวผู้เสียภาษี</div>
                <div className="font-medium font-mono">{selectedCustomer.tax_id || "—"}</div>
              </div>
            )}
            <div>
              <div className="text-muted">รายการรอออกใบ</div>
              <div className="font-medium">{selectedCustomer.eligible_count} รายการ</div>
            </div>
            <div>
              <div className="text-muted">ยอดรวมทั้งหมด</div>
              <div className="font-medium">฿{thbFmt(selectedCustomer.eligible_total_thb)}</div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2 — Forwarder picker */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">รายการฝากนำเข้าที่จะรวมในใบวางบิลนี้</h3>
          {visibleForwarders.length > 0 && (
            <button
              type="button"
              onClick={() => toggleAll(selectedIds.size !== visibleForwarders.length)}
              className="text-xs text-primary-600 hover:underline"
            >
              {selectedIds.size === visibleForwarders.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
          )}
        </div>

        {!selectedUserid && (
          <p className="text-sm text-muted text-center py-6">เลือกลูกค้าก่อน เพื่อดูรายการที่สามารถออกใบวางบิลได้</p>
        )}

        {selectedUserid && loadingFwd && (
          <p className="text-sm text-muted text-center py-6">กำลังโหลด...</p>
        )}

        {selectedUserid && !loadingFwd && (eligible?.length ?? 0) === 0 && (
          <p className="text-sm text-muted text-center py-6">ลูกค้านี้ไม่มีรายการที่สามารถออกใบวางบิลได้</p>
        )}

        {selectedUserid && !loadingFwd && visibleForwarders.length > 0 && (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
                <tr>
                  <th className="px-3 py-2 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === visibleForwarders.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
                  <th className="px-3 py-2 text-left">รหัสพัสดุ</th>
                  <th className="px-3 py-2 text-right">กล่อง</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก (kg)</th>
                  <th className="px-3 py-2 text-right">ปริมาตร (CBM)</th>
                  <th className="px-3 py-2 text-right">ค่าขนส่ง (฿)</th>
                  <th className="px-3 py-2 text-center">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {visibleForwarders.map((f) => (
                  <tr
                    key={f.id}
                    className={`border-t border-border hover:bg-surface-alt/30 ${selectedIds.has(f.id) ? "bg-primary-50/30" : ""}`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(f.id)}
                        onChange={(e) => toggleId(f.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">#{f.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.ftrackingchn}</td>
                    <td className="px-3 py-2 text-right">{f.fbox ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{f.fweight ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{f.fcbm ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">{thbFmt(f.ftotalprice)}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted">{f.fdate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-alt/40">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium text-muted">
                    เลือก {selectedIds.size} / {visibleForwarders.length} รายการ
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{thbFmt(subtotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 3 — Money summary */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3">สรุปยอดเงิน</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label>
              <span className={labelCls}>ค่าขนส่งจีน (CHN)</span>
              <input type="number" step="0.01" min="0" value={deliveryChn} onChange={(e) => setDeliveryChn(e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>ค่าขนส่งไทย (TH)</span>
              <input type="number" step="0.01" min="0" value={deliveryTh} onChange={(e) => setDeliveryTh(e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>อื่นๆ</span>
              <input type="number" step="0.01" min="0" value={other} onChange={(e) => setOther(e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>ส่วนลด</span>
              <input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">ค่าขนส่งรายการ (Subtotal)</span>
              <span className="font-medium">฿{thbFmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">+ ค่าขนส่งจีน</span>
              <span>฿{thbFmt(numChn)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">+ ค่าขนส่งไทย</span>
              <span>฿{thbFmt(numTh)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">+ อื่นๆ</span>
              <span>฿{thbFmt(numOther)}</span>
            </div>
            <div className="flex justify-between text-sm py-1 text-red-600">
              <span>− ส่วนลด</span>
              <span>฿{thbFmt(numDiscount)}</span>
            </div>
            <hr className="border-border" />
            <div className="flex justify-between text-lg font-bold py-1 bg-amber-50/30 -mx-2 px-2 rounded">
              <span>ยอดรวมทั้งสิ้น</span>
              <span className="text-amber-700">฿{thbFmt(totalAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — Note */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3">หมายเหตุสำหรับลูกค้า</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="เช่น 'กรุณาชำระเงินภายในวันที่ครบกำหนด ผ่านบัญชีธนาคารกสิกร 123-4-56789-0 บริษัทแพคเรด (ประเทศไทย) จำกัด'"
          className={inputCls}
        />
      </section>

      {/* Submit */}
      {submitErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitErr}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center justify-end">
        <button
          type="button"
          onClick={() => router.push("/admin/billing-run")}
          className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={pending || selectedIds.size === 0 || !selectedUserid}
          className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "กำลังสร้าง..." : `สร้างใบวางบิล (${selectedIds.size} รายการ · ฿${thbFmt(totalAmount)})`}
        </button>
      </div>
    </form>
  );
}
