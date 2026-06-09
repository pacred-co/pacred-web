"use client";

/**
 * Client UI for /admin/commission/freight — WAVE 6 · the FREIGHT commission
 * ledger + withdrawal queue + rate-tier review. 💰 MONEY-CRITICAL · DORMANT-aware.
 *
 * Sections:
 *   1. DORMANT banner — shown when commission.freight_enabled is OFF (or any
 *      seeded tier is not owner-confirmed). Explains the system records nothing.
 *   2. Tier-config view — the seeded AX-JOB rates with a "PENDING owner confirm"
 *      pill on each unconfirmed row (read-only review — the owner confirms via DB
 *      + flips the flag).
 *   3. Accruals ledger — the earned-but-unbundled commission rows.
 *   4. Withdrawal queue — approve / reject / pay. Every mutation is
 *      confirm-before-mutate (§0f). The PAID flip is super-only + requires a slip.
 *
 * Wide tables → overflow-x-auto + scrollbar-x-visible (Windows-Chrome hides the
 * scrollbar by default · §0c). All writes go to actions/admin/freight-commission.ts
 * which gates RBAC server-side (this UI's canPay/canApprove are affordance only).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, CheckCircle2, XCircle, Banknote, Lock, AlertTriangle } from "lucide-react";
import { PacredDialog, DialogFooter, useConfirmDialogs } from "@/components/ui/pacred-dialog";
import {
  adminApproveCommissionWithdrawal,
  adminRejectCommissionWithdrawal,
  adminMarkCommissionWithdrawalPaid,
  type CommissionAccrualRow,
  type CommissionWithdrawalRow,
  type FreightCommissionTierView,
} from "@/actions/admin/freight-commission";

const SCOPE_LABEL: Record<string, string> = {
  freight_quote: "ค่าเฟรท (Freight)",
  freight_customs: "พิธีการ (Customs)",
  freight_doc: "เอกสาร (Doc)",
  freight_flat: "เหมา/ชิปเมนต์ (Flat)",
};

const ACCRUAL_STATUS_LABEL: Record<string, string> = {
  accrued: "พร้อมเบิก",
  withdrawn: "อยู่ในใบเบิก",
  void: "ยกเลิก",
};

const WITHDRAWAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอตรวจ", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  approved: { label: "อนุมัติแล้ว", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  paid: { label: "จ่ายแล้ว", cls: "border-green-200 bg-green-50 text-green-700" },
  rejected: { label: "ปฏิเสธ", cls: "border-gray-200 bg-gray-100 text-gray-500" },
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH");
}

export function FreightCommissionClient({
  enabled,
  anyTierPending,
  tiers,
  accruals,
  withdrawals,
  canPay,
  canApprove,
  loadFailed,
}: {
  enabled: boolean;
  anyTierPending: boolean;
  tiers: FreightCommissionTierView[];
  accruals: CommissionAccrualRow[];
  withdrawals: CommissionWithdrawalRow[];
  canPay: boolean;
  canApprove: boolean;
  loadFailed: boolean;
}) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();

  // Pay dialog state (slip required).
  const payRef = useRef<HTMLDialogElement>(null);
  const [payTarget, setPayTarget] = useState<CommissionWithdrawalRow | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);

  async function handleApprove(w: CommissionWithdrawalRow) {
    const ok = await confirm(
      `อนุมัติใบเบิกค่าคอมของ ${w.earnerName}?\n\nยอดสุทธิ ${thb(w.netThb)} (ขั้นต้น ${thb(w.grossThb)} − หัก ณ ที่จ่าย ${thb(w.whtThb)}). การอนุมัติยังไม่ใช่การจ่ายเงิน — ขั้นจ่ายต้อง super กดยืนยันแยกต่างหาก.`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminApproveCommissionWithdrawal({ id: w.id });
      if (res.ok) router.refresh();
      else await alert(`อนุมัติไม่สำเร็จ: ${res.error}`);
    });
  }

  async function handleReject(w: CommissionWithdrawalRow) {
    const reason = window.prompt(`ปฏิเสธใบเบิกของ ${w.earnerName} — กรุณาระบุเหตุผล (≥3 ตัวอักษร):`);
    if (reason == null) return; // cancelled
    if (reason.trim().length < 3) {
      await alert("กรุณาระบุเหตุผล ≥3 ตัวอักษร");
      return;
    }
    start(async () => {
      const res = await adminRejectCommissionWithdrawal({ id: w.id, reason: reason.trim() });
      if (res.ok) router.refresh();
      else await alert(`ปฏิเสธไม่สำเร็จ: ${res.error}`);
    });
  }

  function openPay(w: CommissionWithdrawalRow) {
    setPayTarget(w);
    setSlipFile(null);
    payRef.current?.showModal();
  }

  function submitPay(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    if (!slipFile || slipFile.size === 0) {
      void alert("กรุณาแนบหลักฐานการโอน (สลิป)");
      return;
    }
    const target = payTarget;
    const file = slipFile;
    start(async () => {
      const res = await adminMarkCommissionWithdrawalPaid({ id: target.id }, file);
      if (res.ok) {
        payRef.current?.close();
        setPayTarget(null);
        setSlipFile(null);
        router.refresh();
      } else {
        await alert(`บันทึกการจ่ายไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  const openAccruals = accruals.filter((a) => a.status === "accrued");
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");

  return (
    <div className="space-y-5">
      {loadFailed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ โหลดข้อมูลบางส่วนไม่สำเร็จ (เกิดข้อผิดพลาดชั่วคราว) — ตัวเลขอาจไม่ครบ. กรุณารีเฟรช.
        </div>
      )}

      {/* ── 1) DORMANT banner ── */}
      {!enabled ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900">ระบบ DORMANT — รอ owner ยืนยัน rate + เปิดใช้งาน</p>
              <p className="text-xs text-amber-800 max-w-3xl">
                ระบบค่าคอมมิชชั่น Freight ถูกปิดอยู่ (business_config <code className="rounded bg-amber-100 px-1">commission.freight_enabled</code> = OFF).
                ขณะปิด: การสะสมค่าคอม (accrual) จะ <strong>ไม่บันทึกอะไรเลย</strong>. เปิดใช้งานเมื่อ
                owner รีวิว/ยืนยันเรทในตาราง <code className="rounded bg-amber-100 px-1">freight_commission_tiers</code>
                (ตั้ง <code className="rounded bg-amber-100 px-1">is_owner_confirmed = true</code>) แล้วเปิดแฟล็ก.
              </p>
            </div>
          </div>
        </div>
      ) : anyTierPending ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900">เปิดใช้งานแล้ว — แต่ยังมีเรทที่ยังไม่ยืนยัน</p>
              <p className="text-xs text-amber-800 max-w-3xl">
                ระบบเปิดอยู่ แต่บางเรทยังไม่ <strong>owner-confirmed</strong> → เรทที่ยังไม่ยืนยันจะ <strong>ไม่ถูกนำไปสะสมค่าคอม</strong>.
                ดูตารางเรทด้านล่าง.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-800">
          ✓ ระบบเปิดใช้งานอยู่ + เรททั้งหมดยืนยันแล้ว — การสะสมค่าคอมทำงานปกติ.
        </div>
      )}

      {/* ── 2) Tier-config view ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <BadgePercent className="h-4 w-4 text-primary-600" aria-hidden />
          <h2 className="text-sm font-semibold">เรทค่าคอมมิชชั่น (Rate Tiers)</h2>
          <span className="ml-auto text-xs text-muted">{tiers.length} เรท</span>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3">ประเภท</th>
                <th className="px-3 py-3 text-right">เรท</th>
                <th className="px-3 py-3 text-right">WHT</th>
                <th className="px-3 py-3">มีผลตั้งแต่</th>
                <th className="px-3 py-3">สถานะ owner</th>
                <th className="px-3 py-3">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {tiers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">ยังไม่มีเรทค่าคอม</td></tr>
              )}
              {tiers.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-3">{SCOPE_LABEL[t.serviceKind] ?? t.serviceKind}</td>
                  <td className="px-3 py-3 text-right font-mono">
                    {t.flatThb != null ? `${thb(t.flatThb)}/ชิป.` : t.ratePct != null ? `${t.ratePct}%` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{t.whtPct}%</td>
                  <td className="px-3 py-3 text-xs text-muted">{t.effectiveFrom}</td>
                  <td className="px-3 py-3">
                    {t.isOwnerConfirmed ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">ยืนยันแล้ว</span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">PENDING owner confirm</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted max-w-[260px]">{t.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 3) Accruals ledger ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">รายการสะสมค่าคอม (Accruals)</h2>
          <span className="ml-auto text-xs text-muted">
            {accruals.length} รายการ · พร้อมเบิก {openAccruals.length}
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3">พนักงาน</th>
                <th className="px-3 py-3">ที่มา</th>
                <th className="px-3 py-3 text-right">ฐานรายได้</th>
                <th className="px-3 py-3 text-right">ค่าคอมสุทธิ</th>
                <th className="px-3 py-3 text-right">WHT</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {accruals.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">ยังไม่มีรายการสะสมค่าคอม</td></tr>
              )}
              {accruals.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-3">{a.earnerName}</td>
                  <td className="px-3 py-3 text-xs"><span className="text-muted">{a.sourceKind}</span> · {a.sourceRef}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{thb(a.baseThb)}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold">{thb(a.accruedAmountThb)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{a.whtPct}%</td>
                  <td className="px-3 py-3 text-xs">{ACCRUAL_STATUS_LABEL[a.status] ?? a.status}</td>
                  <td className="px-3 py-3 text-xs text-muted">{fmtDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 4) Withdrawal queue ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary-600" aria-hidden />
          <h2 className="text-sm font-semibold">คิวเบิกจ่ายค่าคอม (Withdrawals)</h2>
          <span className="ml-auto text-xs text-muted">
            {withdrawals.length} ใบ · รอตรวจ {pendingWithdrawals.length}
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm min-w-[940px]">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3">พนักงาน</th>
                <th className="px-3 py-3 text-right">ขั้นต้น</th>
                <th className="px-3 py-3 text-right">WHT</th>
                <th className="px-3 py-3 text-right">สุทธิ</th>
                <th className="px-3 py-3">บัญชีรับโอน</th>
                <th className="px-3 py-3">สถานะ</th>
                <th className="px-3 py-3">ขอเมื่อ</th>
                <th className="px-3 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">ยังไม่มีใบเบิกค่าคอม</td></tr>
              )}
              {withdrawals.map((w) => {
                const st = WITHDRAWAL_STATUS[w.status] ?? { label: w.status, cls: "border-gray-200 bg-gray-100 text-gray-500" };
                return (
                  <tr key={w.id} className="border-t border-border align-top hover:bg-surface-alt/30">
                    <td className="px-3 py-3">{w.earnerName}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{thb(w.grossThb)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{thb(w.whtThb)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">{thb(w.netThb)}</td>
                    <td className="px-3 py-3 text-xs">
                      {w.payeeBankName || w.payeeAccountName || w.payeeAccountNo ? (
                        <span>
                          {w.payeeBankName ?? "—"}<br />
                          <span className="text-muted">{w.payeeAccountName ?? ""} {w.payeeAccountNo ?? ""}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                      {w.status === "rejected" && w.rejectedReason && (
                        <p className="mt-1 text-[10px] text-muted max-w-[180px]">{w.rejectedReason}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{fmtDate(w.requestedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {w.status === "pending" && canApprove && (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => handleApprove(w)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg bg-blue-50 px-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" /> อนุมัติ
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => handleReject(w)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3" /> ปฏิเสธ
                            </button>
                          </>
                        )}
                        {w.status === "approved" && canPay && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => openPay(w)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-green-600 px-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <Banknote className="w-3 h-3" /> ยืนยันจ่าย
                          </button>
                        )}
                        {w.status === "approved" && !canPay && (
                          <span className="text-[10px] text-muted">รอ super จ่าย</span>
                        )}
                        {(w.status === "paid" || w.status === "rejected") && (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pay dialog (super-only · slip required · confirm-before-mutate · §0f) */}
      <PacredDialog dialogRef={payRef} title="ยืนยันการจ่ายค่าคอมมิชชั่น">
        <form onSubmit={submitPay} className="space-y-4">
          {payTarget && (
            <div className="rounded-lg bg-surface-alt/50 px-3 py-2 text-sm">
              <p>พนักงาน: <strong>{payTarget.earnerName}</strong></p>
              <p>ยอดสุทธิที่จ่าย: <strong className="text-primary-600">{thb(payTarget.netThb)}</strong></p>
              <p className="text-xs text-muted">ขั้นต้น {thb(payTarget.grossThb)} − หัก ณ ที่จ่าย {thb(payTarget.whtThb)}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-800">แนบสลิปการโอน (จำเป็น)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <p className="mt-1 text-[11px] text-muted">รับเฉพาะรูปภาพหรือ PDF (≤5MB). การยืนยันจ่ายนี้เป็นการบันทึกเงินออก — ทำได้เฉพาะ super.</p>
          </div>
          <DialogFooter onCancel={() => payRef.current?.close()} pending={pending} submitLabel="ยืนยันจ่ายเงิน" pendingLabel="กำลังบันทึก…" />
        </form>
      </PacredDialog>

      {dialogs}
    </div>
  );
}
