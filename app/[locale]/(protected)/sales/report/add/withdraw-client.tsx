"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { submitSalesWithdrawal } from "@/actions/commissions-tb";
import {
  computeCommission,
  SALES_MIN_WITHDRAWAL_THB,
} from "@/lib/sales-commission/calc";

/**
 * withdraw-client.tsx — the customer-side commission withdrawal UI for
 * `/sales/report/add` (P0-23 · ADR-0020).
 *
 * Replaces the legacy DEAD `#select1` jQuery button + the AJAX
 * `getListForwarder.php` modal with a real React selector that:
 *   1. lets the agent check the unpaid rows they want to claim,
 *   2. shows the live commission breakdown (1% − 3% WHT) as they select,
 *   3. opens a bank-info + ID-card-PDF form (the legacy modal),
 *   4. calls `submitSalesWithdrawal` (the faithful `add` POST).
 *
 * The breakdown shown here is computed client-side for instant feedback, but
 * the SERVER recomputes it from live tb_forwarder data (anti-tamper) — the
 * client figure is advisory only. Same `percen` (0.01) is passed from the
 * server page so the two agree.
 *
 * Visible copy kept faithful to getListForwarder.php (bank fields, the
 * min-1,000 note, the "ยืนยันรายการเบิกเงิน" button).
 */

export type UnpaidRowForWithdraw = {
  usID: number;
  userID: string | null;
  fTrackingCHN: string | null;
  /** ftotalprice − fdiscount = this row's contribution to gross. */
  net: number;
  /** raw ftotalprice (for the "ยอดค่านำเข้า" column). */
  fTotalPrice: number;
};

const THAI_BANKS = [
  "กรุงเทพ",
  "กสิกรไทย",
  "กรุงไทย",
  "ทหารไทย",
  "ไทยพาณิชย์",
  "กรุงศรีอยุธยา",
  "เกียรตินาคิน",
  "ซีไอเอ็มบีไทย",
  "ทิสโก้",
  "ธนชาต",
  "ยูโอบี",
  "แลนด์ แอนด์ เฮาส์",
  "ออมสิน",
  "พร้อมเพย์",
  "CIMB",
  "ICBC",
] as const;

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function WithdrawClient({
  rows,
  percen,
}: {
  rows: UnpaidRowForWithdraw[];
  percen: number;
}): ReactNode {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Live breakdown over the selected rows (mirrors the server math).
  const breakdown = useMemo(() => {
    let gross = 0;
    for (const r of rows) if (selected.has(r.usID)) gross += r.net;
    return computeCommission(gross, percen);
  }, [rows, selected, percen]);

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
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.usID)),
    );
  }

  function onOpenModal() {
    setMsg(null);
    if (selected.size === 0) {
      setMsg({ tone: "err", text: "กรุณาเลือกรายการที่ต้องการเบิกเงิน" });
      return;
    }
    if (!breakdown.eligible) {
      setMsg({
        tone: "err",
        text: `คุณมียอดการเบิกเงินน้อยกว่า ${SALES_MIN_WITHDRAWAL_THB.toLocaleString(
          "en-US",
        )} บาท กรุณาสะสมยอดให้ครบหรือมากกว่าเพื่อทำรายการ`,
      });
      return;
    }
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setMsg(null);

    const form = e.currentTarget;
    const nameBank = (form.elements.namedItem("name_blank") as HTMLSelectElement | null)?.value ?? "";
    const noBank = (form.elements.namedItem("no_blank") as HTMLInputElement | null)?.value ?? "";
    const nameAccount = (form.elements.namedItem("name_account") as HTMLInputElement | null)?.value ?? "";
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const idCardFile = fileInput?.files?.[0] ?? null;

    if (!nameBank || !noBank.trim() || !nameAccount.trim()) {
      setMsg({ tone: "err", text: "กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ" });
      return;
    }
    if (!idCardFile) {
      setMsg({ tone: "err", text: "กรุณาแนบสำเนาบัตรประชาชน (.pdf)" });
      return;
    }

    startTransition(async () => {
      const res = await submitSalesWithdrawal({
        usIds: [...selected],
        nameBank,
        noBank: noBank.trim(),
        nameAccount: nameAccount.trim(),
        idCardFile,
      });
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        return;
      }
      // Legacy SweetAlert "ทำรายการจ่ายเงินสำเร็จ" → redirect to the payout
      // detail. We toast + navigate to the new payout's history detail.
      setModalOpen(false);
      setSelected(new Set());
      router.push(`/sales/history/${res.data?.id ?? ""}`);
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  return (
    <>
      {/* ── Selection list ── */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-alt"
        >
          {selected.size === rows.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
        </button>
        <span className="text-xs text-muted">
          เลือกแล้ว {selected.size}/{rows.length} รายการ
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-3 font-medium text-center">เลือก</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">ID</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">รหัสสมาชิก</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">เลขแทรคกิ้ง</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">ยอดค่านำเข้า</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.usID}
                className={`border-t border-border cursor-pointer hover:bg-surface-alt/30 ${
                  selected.has(row.usID) ? "bg-red-50/60 dark:bg-red-500/5" : ""
                }`}
                onClick={() => toggle(row.usID)}
              >
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-600"
                    checked={selected.has(row.usID)}
                    onChange={() => toggle(row.usID)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`เลือกรายการ ${row.usID}`}
                  />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground">{row.usID}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">
                  {row.userID}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">
                  {row.fTrackingCHN}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-red-600">
                  {fmt(row.fTotalPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Live breakdown ── */}
      <div className="mt-4 rounded-xl border border-border bg-surface-alt/40 dark:bg-surface px-4 py-3">
        <div className="flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:justify-end sm:gap-x-6">
          <div className="text-muted">
            ค่าขนส่งจีน : <span className="font-mono tabular-nums text-foreground">{fmt(breakdown.gross)}</span> บาท
          </div>
          <div className="text-muted">
            ส่วนแบ่ง 1% : <span className="font-mono tabular-nums text-foreground">{fmt(breakdown.commission)}</span> บาท
          </div>
          <div className="text-muted">
            หักภาษี 3% : <span className="font-mono tabular-nums text-foreground">{fmt(breakdown.wht)}</span> บาท
          </div>
          <div className="font-semibold text-foreground">
            ส่วนแบ่งสุทธิ :{" "}
            <span className="font-mono tabular-nums text-red-600">{fmt(breakdown.net)}</span> บาท
          </div>
        </div>
        <p className="mt-2 text-xs text-red-600">
          *หมายเหตุ ในการเบิกเงินแต่ละครั้งจะต้องมียอดขั้นต่ำ{" "}
          {SALES_MIN_WITHDRAWAL_THB.toLocaleString("en-US")} บาท ขึ้นไป
        </p>
      </div>

      {msg && !modalOpen && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            msg.tone === "ok"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
          role="alert"
        >
          {msg.text}
        </div>
      )}

      {/* ── Floating CTA — replaces the legacy #select1 ── */}
      <div className="mt-5 flex justify-center md:justify-end">
        <button
          type="button"
          onClick={onOpenModal}
          disabled={selected.size === 0}
          className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/30 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ทำรายการเบิกเงินรายการที่เลือก
        </button>
      </div>

      {/* ── Modal: bank info + ID-card PDF ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-surface shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h4 className="text-base font-bold text-foreground">
                ทำรายการเบิกเงิน {selected.size} รายการ
              </h4>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              autoComplete="off"
              encType="multipart/form-data"
              className="px-4 py-4"
            >
              <div className="text-right text-sm text-muted mb-3">
                ค่าขนส่งจีน :{" "}
                <span className="font-mono tabular-nums text-foreground">{fmt(breakdown.gross)}</span> บาท
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1" htmlFor="name_blank">
                    ชื่อธนาคาร
                  </label>
                  <select
                    name="name_blank"
                    id="name_blank"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  >
                    <option value="">เลือกธนาคาร</option>
                    {THAI_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1" htmlFor="no_blank">
                    เลขที่บัญชี
                  </label>
                  <input
                    type="text"
                    name="no_blank"
                    id="no_blank"
                    required
                    className="w-full rounded-lg border border-border px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1" htmlFor="name_account">
                    ชื่อบัญชี
                  </label>
                  <input
                    type="text"
                    name="name_account"
                    id="name_account"
                    required
                    className="w-full rounded-lg border border-border px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1" htmlFor="file">
                    หลักฐานสำเนาบัตรประชาชนผู้เบิกเงิน ไฟล์ .pdf
                  </label>
                  <input
                    type="file"
                    name="file"
                    id="file"
                    accept=".pdf,application/pdf"
                    data-max-file-size="9M"
                    required
                    className="block w-full rounded-lg border border-border px-3 py-2 text-base md:text-sm file:mr-3 file:rounded-md file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-red-600"
                  />
                </div>
              </div>

              <hr className="my-3 border-t border-dashed border-border" />

              <div className="flex flex-col gap-1 text-sm sm:items-end">
                <div className="text-muted">
                  ส่วนแบ่ง 1% : <span className="font-mono tabular-nums text-foreground">{fmt(breakdown.commission)}</span> บาท
                </div>
                <div className="text-muted">
                  หักภาษี 3% : <span className="font-mono tabular-nums text-foreground">{fmt(breakdown.wht)}</span> บาท
                </div>
                <div className="font-semibold text-foreground">
                  ส่วนแบ่งสุทธิ :{" "}
                  <span className="font-mono tabular-nums text-red-600">{fmt(breakdown.net)}</span> บาท
                </div>
              </div>

              {msg && modalOpen && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    msg.tone === "ok"
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                  role="alert"
                >
                  {msg.text}
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={pending}
                  className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-alt disabled:opacity-60"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
                >
                  {pending ? "กำลังทำรายการ..." : "ยืนยันรายการเบิกเงิน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
