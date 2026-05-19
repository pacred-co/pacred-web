"use client";

/**
 * Client form for /admin/wallet/add — talks to `adminCreateManualWalletEntry`
 * in actions/admin/wallet.ts. Submits → revalidates → resets on success.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateManualWalletEntry } from "@/actions/admin/wallet";

type ProfileLite = {
  id: string;
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
};

function labelProfile(p: ProfileLite | null | undefined): string {
  if (!p) return "—";
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return `${p.member_code ?? "—"} · ${name || p.phone || "(ไม่มีชื่อ)"}`;
}

const KIND_OPTIONS = [
  { value: "deposit",    label: "เติมเงิน (ยอด +)" },
  { value: "withdraw",   label: "ถอนเงิน (ยอด −)" },
  { value: "adjustment", label: "ปรับยอด (ใส่ +/− เอง)" },
  { value: "refund",     label: "คืนเงิน" },
] as const;

const BUCKET_OPTIONS = [
  { value: "main",     label: "กระเป๋าเงินสด" },
  { value: "cashback", label: "Cashback" },
  { value: "credit",   label: "เครดิต VIP" },
] as const;

type Kind = typeof KIND_OPTIONS[number]["value"];
type Bucket = typeof BUCKET_OPTIONS[number]["value"];

export function AdminWalletAddForm({
  preset,
  recent,
}: {
  preset: ProfileLite | null;
  recent: ProfileLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [profileId, setProfileId]   = useState<string>(preset?.id ?? "");
  const [kind, setKind]             = useState<Kind>("deposit");
  const [bucket, setBucket]         = useState<Bucket>("main");
  const [amount, setAmount]         = useState<string>("");
  const [bankName, setBankName]     = useState<string>("");
  const [acctName, setAcctName]     = useState<string>("");
  const [acctNumber, setAcctNumber] = useState<string>("");
  const [slipDate, setSlipDate]     = useState<string>("");  // YYYY-MM-DD
  const [note, setNote]             = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!profileId) {
      setError("เลือกสมาชิกก่อน");
      return;
    }

    const amt = parseFloat(amount.replace(/,/g, ""));
    if (Number.isNaN(amt)) {
      setError("จำนวนเงินไม่ถูกต้อง");
      return;
    }

    // Auto-negate amount for withdraw so admin types positive number
    let finalAmount = amt;
    if (kind === "withdraw" && amt > 0) finalAmount = -amt;
    if (kind === "deposit" && amt < 0)  finalAmount = -amt;

    startTransition(async () => {
      const result = await adminCreateManualWalletEntry({
        profile_id:     profileId,
        bucket,
        kind,
        amount:         finalAmount,
        bank_name:      bankName || undefined,
        account_name:   acctName || undefined,
        account_number: acctNumber || undefined,
        slip_date:      slipDate || undefined,
        note:           note || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(`บันทึกสำเร็จ (id: ${result.data?.id.slice(0, 8)}...) · ยอด wallet ได้ถูกอัปเดตอัตโนมัติ`);
      // Reset numeric/note fields but keep selected member for follow-up entries
      setAmount("");
      setNote("");
      setSlipDate("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Member selection */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">สมาชิก <span className="text-red-500">*</span></label>
        {preset && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs">
            ✓ เลือก: <span className="font-semibold">{labelProfile(preset)}</span>
          </div>
        )}
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          disabled={pending}
        >
          <option value="">— เลือกจากสมาชิกล่าสุด —</option>
          {recent.map((p) => (
            <option key={p.id} value={p.id}>{labelProfile(p)}</option>
          ))}
        </select>
        <p className="text-[11px] text-muted">หากไม่เห็นสมาชิกที่ต้องการ ใช้ /admin/wallet/add?q=PR1234 หรือ ?q=0812345678 เพื่อเรียกสมาชิกตรง</p>
      </div>

      {/* Kind + Bucket */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold">ประเภทรายการ</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            disabled={pending}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold">กระเป๋า</label>
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value as Bucket)}
            className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            disabled={pending}
          >
            {BUCKET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">จำนวน (บาท) <span className="text-red-500">*</span></label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={kind === "withdraw" ? "เช่น 500 (ระบบจะใส่เครื่องหมาย − ให้)" : "เช่น 1000.00"}
          className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
          disabled={pending}
          required
        />
        <p className="text-[11px] text-muted">
          {kind === "adjustment"
            ? "ใส่ตัวเลขบวก/ลบเองได้ตามต้องการ (เช่น -250 เพื่อหักยอด)"
            : kind === "withdraw"
              ? "ใส่ตัวเลขบวก ระบบจะใส่เครื่องหมายลบให้อัตโนมัติ"
              : "ใส่ตัวเลขบวก (เช่น 1500.00)"}
        </p>
      </div>

      {/* Bank details (only useful for deposit/withdraw) */}
      <details className="rounded-md border border-border bg-white dark:bg-surface p-3" open={kind === "deposit" || kind === "withdraw"}>
        <summary className="text-sm font-semibold cursor-pointer">รายละเอียดธนาคาร / สลิป (optional)</summary>
        <div className="mt-3 grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">ธนาคาร</label>
            <input
              type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
              placeholder="เช่น KBANK / SCB"
              className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">ชื่อบัญชี</label>
            <input
              type="text" value={acctName} onChange={(e) => setAcctName(e.target.value)}
              className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">เลขบัญชี</label>
            <input
              type="text" value={acctNumber} onChange={(e) => setAcctNumber(e.target.value)}
              className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">วันที่สลิป</label>
            <input
              type="date" value={slipDate} onChange={(e) => setSlipDate(e.target.value)}
              className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
              disabled={pending}
            />
          </div>
        </div>
      </details>

      {/* Note */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">หมายเหตุ</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="เหตุผลที่บันทึกรายการนี้ (เช่น 'สลิปลูกค้าเลขที่ X ระบบไม่จับ — เพิ่มเข้าด้วยตนเอง')"
          className="w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          disabled={pending}
        />
      </div>

      {/* Feedback */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300">
          ✓ {success}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || !profileId || !amount}
          className="rounded-md bg-primary-600 text-white px-5 py-2 text-sm font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {pending ? "กำลังบันทึก..." : "บันทึกรายการ"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAmount(""); setNote(""); setBankName(""); setAcctName("");
            setAcctNumber(""); setSlipDate(""); setError(null); setSuccess(null);
          }}
          disabled={pending}
          className="rounded-md border border-border bg-white dark:bg-surface px-5 py-2 text-sm hover:bg-surface-alt"
        >
          ล้างฟอร์ม
        </button>
      </div>
    </form>
  );
}
