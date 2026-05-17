"use client";

// U4-2 · Admin credit-line section on /admin/customers/[id]
//   - Read-only summary: limit / outstanding / available / terms
//   - Edit form (super + accounting only): credit_limit_thb + terms
//   - "Charge to credit" mini-form: bills an amount to the customer's
//     line (manual, e.g. a phone-in arrangement). The action enforces
//     the cap server-side, so the UI just forwards the request.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus } from "lucide-react";
import { adminSetCustomerCreditLimit, adminChargeToCredit } from "@/actions/admin/credit";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  profileId:           string;
  creditLimitThb:      number;
  creditTermsDays:     number;
  outstandingThb:      number;
  availableCreditThb:  number;
  canEdit:             boolean;   // super + accounting; else read-only
};

export function CreditLineForm(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showEdit,   setShowEdit]   = useState(false);
  const [showCharge, setShowCharge] = useState(false);

  const [limit,  setLimit]  = useState(String(p.creditLimitThb || 0));
  const [terms,  setTerms]  = useState(String(p.creditTermsDays || 30));
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function act<T>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, okMsg: string) {
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(okMsg);
        router.refresh();
        setShowEdit(false);
        setShowCharge(false);
        setTimeout(() => setMsg(null), 5000);
      } else {
        setErr(res.error ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  function onSaveLimit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 0) { setErr("วงเงินไม่ถูกต้อง"); return; }
    const t = Number(terms);
    if (!Number.isFinite(t) || t < 0 || t > 365) { setErr("ระยะเครดิตไม่ถูกต้อง (0-365 วัน)"); return; }
    act(
      () => adminSetCustomerCreditLimit({
        profile_id:        p.profileId,
        credit_limit_thb:  n,
        credit_terms_days: t,
      }),
      `บันทึกวงเงิน ฿${n.toLocaleString("th-TH")} (${t} วัน) แล้ว`,
    );
  }

  function onCharge(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setErr("จำนวนเงินไม่ถูกต้อง"); return; }
    if (!reason.trim() || reason.trim().length < 3) { setErr("กรุณาระบุเหตุผล (≥3 ตัว)"); return; }
    act(
      () => adminChargeToCredit({
        profile_id: p.profileId,
        amount_thb: n,
        reason:     reason.trim(),
      }),
      `ชาร์จ ฿${n.toLocaleString("th-TH")} ลงเครดิตลูกค้าแล้ว`,
    );
  }

  const isEnrolled = p.creditLimitThb > 0;
  const overLimit  = p.availableCreditThb < 0;
  const owedPct    = p.creditLimitThb > 0
    ? Math.min(100, Math.max(0, (p.outstandingThb / p.creditLimitThb) * 100))
    : 0;

  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-50/20 dark:from-blue-950/30 dark:to-blue-900/20 p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-700" />
          <h3 className="font-bold text-sm">วงเงินเครดิตลูกค้า (Credit line)</h3>
        </div>
        {p.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setShowEdit((s) => !s); setShowCharge(false); }} disabled={pending}>
              {isEnrolled ? "✏️ แก้ไขวงเงิน / ระยะ" : "➕ เปิดวงเงินเครดิต"}
            </Button>
            {isEnrolled && (
              <Button size="sm" variant="outline" onClick={() => { setShowCharge((s) => !s); setShowEdit(false); }} disabled={pending}>
                <Plus className="w-3.5 h-3.5" /> ชาร์จลงเครดิต
              </Button>
            )}
          </div>
        )}
      </div>

      {msg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-800">{err}</div>}

      <div className="grid sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-blue-700/80">วงเงินทั้งหมด</p>
          <p className="mt-0.5 text-lg font-bold font-mono">฿{p.creditLimitThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-red-700/80">ยอดค้างชำระ</p>
          <p className="mt-0.5 text-lg font-bold font-mono text-red-700">฿{p.outstandingThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-emerald-700/80">เครดิตคงเหลือ</p>
          <p className={`mt-0.5 text-lg font-bold font-mono ${overLimit ? "text-red-700" : "text-emerald-700"}`}>
            ฿{p.availableCreditThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted">ระยะเครดิต</p>
          <p className="mt-0.5 text-lg font-bold font-mono">{p.creditTermsDays} วัน</p>
        </div>
      </div>

      {isEnrolled && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className={`h-full ${owedPct >= 90 ? "bg-red-500" : owedPct >= 60 ? "bg-amber-500" : "bg-blue-500"}`}
            style={{ width: `${owedPct}%` }}
          />
        </div>
      )}

      {showEdit && p.canEdit && (
        <form onSubmit={onSaveLimit} className="rounded-xl border border-border bg-white dark:bg-surface p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-muted">วงเงิน (THB)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className={inputCls}
              />
              <span className="text-[10px] text-muted">0 = ปิดวงเงินเครดิต</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">ระยะเครดิต (วัน)</span>
              <input
                type="number"
                min={0}
                max={365}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" type="button" onClick={() => setShowEdit(false)} disabled={pending}>ยกเลิก</Button>
            <Button size="sm" type="submit" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </div>
        </form>
      )}

      {showCharge && p.canEdit && isEnrolled && (
        <form onSubmit={onCharge} className="rounded-xl border border-border bg-white dark:bg-surface p-3 space-y-2">
          <p className="text-xs text-muted">บันทึกค่าใช้จ่ายลงเครดิตลูกค้า (เช่น สั่งทางโทรศัพท์ / ลงไว้ก่อน) — ระบบจะตรวจสอบไม่ให้เกินวงเงิน</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-muted">จำนวน (THB)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">เหตุผล / รายละเอียด</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputCls}
                placeholder="เช่น ออเดอร์ทางโทร 2026-05-17"
                maxLength={500}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" type="button" onClick={() => setShowCharge(false)} disabled={pending}>ยกเลิก</Button>
            <Button size="sm" type="submit" disabled={pending}>{pending ? "กำลังบันทึก..." : "ยืนยันชาร์จ"}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
