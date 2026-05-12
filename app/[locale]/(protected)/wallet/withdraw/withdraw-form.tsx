"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createWithdraw } from "@/actions/wallet";
import { Banknote, User, Hash } from "lucide-react";

const MIN_AMOUNT = 25;
const FEE_THRESHOLD = 500;
const FEE_AMOUNT = 25;

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = { balance: number };

export function WithdrawForm({ balance }: Props) {
  const t = useTranslations("wallet");
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const amt = Number(amount);
  const fee = useMemo(() => (Number.isFinite(amt) && amt > 0 && amt < FEE_THRESHOLD) ? FEE_AMOUNT : 0, [amt]);
  const net = Number.isFinite(amt) && amt > 0 ? Math.max(0, amt - fee) : 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t("amountInvalid"));
      return;
    }
    if (amt < MIN_AMOUNT) {
      setError(`ยอดถอนขั้นต่ำ ฿${MIN_AMOUNT}`);
      return;
    }
    if (amt > balance) {
      setError(t("amountExceedsBalance"));
      return;
    }
    startTransition(async () => {
      const res = await createWithdraw({
        amount:         amt,
        bank_name:      bank,
        account_name:   accountName,
        account_number: accountNumber,
        note:           note || undefined,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("withdrawSubmittedTitle")}</h2>
        <p className="text-sm text-green-700">{t("withdrawSubmittedSubtitle")}</p>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/wallet/history")}>
            {t("viewHistory")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Amount */}
      <label className="block space-y-1">
        <span className="text-sm font-medium">จำนวนเงินที่ต้องการถอน<span className="text-red-600 ml-0.5">*</span></span>
        <div className="relative">
          <input
            type="number"
            min={MIN_AMOUNT}
            step="0.01"
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} text-2xl font-mono font-bold pr-12`}
            required
            placeholder="0.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xl font-bold text-muted">฿</span>
        </div>
        <span className="block text-xs text-muted">
          ยอดที่สามารถถอนได้ <b className="font-mono text-foreground">฿{balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b>
          {" · "}ขั้นต่ำ <b>฿{MIN_AMOUNT}</b>
        </span>
      </label>

      {/* Live fee + net preview */}
      {amt > 0 && (
        <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">ยอดถอน</span>
            <span className="font-mono">฿{amt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">ค่าบริการ {fee > 0 ? `(ยอดต่ำกว่า ฿${FEE_THRESHOLD})` : "(ยกเว้น)"}</span>
            <span className="font-mono text-red-600">−฿{fee.toFixed(2)}</span>
          </div>
          <hr className="border-amber-200" />
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-muted">ยอดที่จะได้รับ</span>
            <span className="font-mono text-2xl font-bold text-emerald-600">
              ฿{net.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Bank details */}
      <div className="space-y-3 rounded-xl border border-border bg-surface-alt/30 p-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-primary-600" /> บัญชีปลายทาง</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">ธนาคาร<span className="text-red-600 ml-0.5">*</span></span>
            <input value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} required placeholder="เช่น ไทยพาณิชย์" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium flex items-center gap-1"><User className="w-3 h-3" /> ชื่อบัญชี<span className="text-red-600">*</span></span>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} required placeholder="ชื่อ-สกุล ตามสมุดบัญชี" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> เลขที่บัญชี<span className="text-red-600">*</span></span>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9-]/g, ""))}
            className={`${inputCls} font-mono`}
            required
            placeholder="xxx-x-xxxxx-x"
            inputMode="numeric"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">หมายเหตุ (ไม่บังคับ)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="ระบุเงื่อนไขพิเศษถ้ามี" />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || !amount || amt < MIN_AMOUNT || amt > balance}
        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-base px-6 py-3 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:hover:shadow-lg ${amt >= MIN_AMOUNT && amt <= balance && !pending ? "animate-pulse" : ""}`}
      >
        {pending ? "กำลังส่งคำขอ..." : `💸 ยืนยันสั่งถอน${net > 0 ? ` ฿${net.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : ""}`}
      </button>
    </form>
  );
}
