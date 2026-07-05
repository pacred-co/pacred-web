"use client";

/**
 * Client form for /admin/wallet/add — talks to `adminCreateWalletHsManual`
 * in actions/admin/wallet-hs.ts. Submits → revalidates → resets on success.
 *
 * Faithful-port note: writes to legacy `tb_wallet_hs` (NOT rebuilt
 * `wallet_transactions`). Customer is identified by `userid` (PR####
 * varchar), NOT a Pacred profile UUID.
 */

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminCreateWalletHsManual } from "@/actions/admin/wallet-hs";
import { THAI_BANKS, BANK_OTHER, bankOptionLabel } from "@/lib/banks";

export type CustomerLite = {
  userid:       string;
  username:     string | null;
  userlastname: string | null;
  usertel:      string | null;
  useremail:    string | null;
  /** นิติบุคคล — the registered company name resolved from tb_corporate (2026-07-04).
   *  When set, the picker shows the COMPANY name (owner: company, not contact person). */
  corporatename?: string | null;
};

function labelCustomer(c: CustomerLite | null | undefined): string {
  if (!c) return "—";
  const company = (c.corporatename ?? "").trim();
  const name = company || `${c.username ?? ""} ${c.userlastname ?? ""}`.trim();
  return `${c.userid} · ${name || c.usertel || c.useremail || "(ไม่มีชื่อ)"}`;
}

const KIND_OPTIONS = [
  { value: "deposit",    label: "ชำระเงิน (ยอด +)" },
  { value: "withdraw",   label: "ถอนเงิน (ยอด −)" },
  { value: "adjustment", label: "ปรับยอด (ใส่ +/− เอง)" },
] as const;

const TYPESERVICE_OPTIONS = [
  { value: "1", label: "ฝากสั่งซื้อ (cargo)" },
  { value: "2", label: "ฝากนำเข้า (freight)" },
  { value: "3", label: "ฝากโอน (transfer)" },
] as const;

type Kind = typeof KIND_OPTIONS[number]["value"];
type TypeService = typeof TYPESERVICE_OPTIONS[number]["value"];

export function AdminWalletAddForm({
  preset,
  recent,
  presetBalance,
}: {
  preset: CustomerLite | null;
  recent: CustomerLite[];
  /** Current wallet balance of the preset customer — when negative, the form
   *  pre-fills the exact amount to clear it (owner 2026-06-26 · จ่ายนอกระบบ). */
  presetBalance?: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // When the preset customer is negative, pre-fill the deposit amount that
  // nets the balance back to exactly 0 (clear the legacy "เติม-แล้วจ่าย" gap).
  const clearAmount =
    presetBalance != null && presetBalance < 0 ? Math.abs(presetBalance) : null;

  const [userid, setUserid]         = useState<string>(preset?.userid ?? "");
  const [kind, setKind]             = useState<Kind>("deposit");
  const [typeService, setTypeService] = useState<TypeService>("1");
  const [amount, setAmount]         = useState<string>(clearAmount != null ? String(clearAmount) : "");
  // Bank: a dropdown of canonical Thai banks (owner 2026-06-26 — "เอาเป็นตัวเลือก
  // ไม่ต้องพิมพ์"). `bankChoice` holds the picked bank NAME (the canonical string
  // we store) OR the BANK_OTHER sentinel → then `bankOther` free-text is used.
  // The stored value (`bankName`) stays a plain string, compatible with the
  // free-text `depositnamebank` column.
  const [bankChoice, setBankChoice] = useState<string>("");
  const [bankOther, setBankOther]   = useState<string>("");
  const bankName = bankChoice === BANK_OTHER ? bankOther.trim() : bankChoice;
  const [acctName, setAcctName]     = useState<string>("");
  const [acctNumber, setAcctNumber] = useState<string>("");
  const [slipDate, setSlipDate]     = useState<string>("");
  const [paydeposit, setPaydeposit] = useState<boolean>(false);
  const [note, setNote]             = useState<string>("");

  // Wave 12-A — slip-file state (optional · uploads to slips bucket on submit)
  const [slipFile, setSlipFile]       = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Revoke any in-flight ObjectURL when the file changes / component unmounts
  useEffect(() => {
    return () => {
      if (slipPreview) URL.revokeObjectURL(slipPreview);
    };
  }, [slipPreview]);

  function selectSlip(f: File | null) {
    setError(null);
    // Client-side 5 MB guard — matches the label promise ("≤ 5 MB") and
    // gives a friendly Thai error instead of the opaque server 500 the
    // 10 MB bodySizeLimit cap would otherwise produce on phone HEIC files.
    if (f && f.size > 5 * 1024 * 1024) {
      setError("ไฟล์สลิปใหญ่เกิน 5 MB — กรุณาเลือกไฟล์ใหม่");
      return;
    }
    setSlipFile(f);
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    if (f && f.type.startsWith("image/")) {
      setSlipPreview(URL.createObjectURL(f));
    } else {
      setSlipPreview(null);
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userid) {
      setError("เลือกสมาชิกก่อน");
      return;
    }

    const amt = parseFloat(amount.replace(/,/g, ""));
    if (Number.isNaN(amt) || amt === 0) {
      setError("จำนวนเงินไม่ถูกต้อง");
      return;
    }

    startTransition(async () => {
      const result = await adminCreateWalletHsManual(
        {
          userid,
          kind,
          amount: amt,
          deposit_namebank: bankName || undefined,
          nameuserbank:     acctName || undefined,
          nouserbank:       acctNumber || undefined,
          dateslip:         slipDate || undefined,
          paydeposit,
          typeservice:      typeService,
          note:             note || undefined,
        },
        slipFile,                       // Wave 12-A — optional slip upload
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(
        `บันทึกสำเร็จ (id ${result.data?.id}) · ยอดใหม่ของลูกค้า = ฿${(result.data?.new_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
      setAmount("");
      setNote("");
      setSlipDate("");
      selectSlip(null);
      if (slipInputRef.current) slipInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      {/* Customer selection */}
      <div>
        <label htmlFor="userid" className="block text-xs text-muted mb-1">
          สมาชิก <span className="text-red-700">*</span>
        </label>
        {preset && (
          <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" role="alert">
            ✓ Preselected: <strong>{labelCustomer(preset)}</strong>
          </div>
        )}
        <select
          id="userid"
          value={userid}
          onChange={(e) => setUserid(e.target.value)}
          disabled={pending}
          required
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
        >
          <option value="">— เลือกจากสมาชิกล่าสุด —</option>
          {recent.map((c) => (
            <option key={c.userid} value={c.userid}>{labelCustomer(c)}</option>
          ))}
          {preset && !recent.find((c) => c.userid === preset.userid) && (
            <option value={preset.userid}>{labelCustomer(preset)}</option>
          )}
        </select>
        <p className="mt-1 text-xs text-muted">
          ถ้าไม่เห็นสมาชิก ใช้ <code className="rounded bg-surface-alt px-1 text-xs">/admin/wallet/add?q=PR1234</code> เพื่อระบุตรง
        </p>
      </div>

      {/* Kind + TypeService */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="kind" className="block text-xs text-muted mb-1">ประเภทรายการ</label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            disabled={pending}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="typeService" className="block text-xs text-muted mb-1">บริการ (typeservice)</label>
          <select
            id="typeService"
            value={typeService}
            onChange={(e) => setTypeService(e.target.value as TypeService)}
            disabled={pending}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          >
            {TYPESERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount + slip date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="amount" className="block text-xs text-muted mb-1">
            จำนวน (บาท) <span className="text-red-700">*</span>
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={kind === "adjustment" ? "เช่น -250 หรือ 500" : "เช่น 1000.00"}
            disabled={pending}
            required
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted">
            {kind === "deposit"
              ? "ใส่เป็นเลขบวก (เช่น 1500.00) · ระบบจะบวกยอดให้"
              : kind === "withdraw"
                ? "ใส่เป็นเลขบวก · ระบบจะหักยอดให้อัตโนมัติ"
                : "ใส่ตัวเลขบวก/ลบเองได้ตามต้องการ (เช่น -250)"}
          </p>
        </div>
        <div>
          <label htmlFor="slipDate" className="block text-xs text-muted mb-1">วันที่สลิป</label>
          <input
            id="slipDate"
            type="date"
            value={slipDate}
            onChange={(e) => setSlipDate(e.target.value)}
            disabled={pending}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted">(optional) ถ้ามีหลักฐานการโอน</p>
        </div>
      </div>

      {/* Bank info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="bankChoice" className="block text-xs text-muted mb-1">ธนาคารปลายทาง</label>
          <select
            id="bankChoice"
            value={bankChoice}
            onChange={(e) => setBankChoice(e.target.value)}
            disabled={pending}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          >
            <option value="">— เลือกธนาคาร —</option>
            {THAI_BANKS.map((b) => (
              <option key={b.code} value={b.name}>{bankOptionLabel(b)}</option>
            ))}
            <option value={BANK_OTHER}>อื่นๆ (พิมพ์เอง)</option>
          </select>
          {bankChoice === BANK_OTHER && (
            <input
              id="bankOther"
              type="text"
              value={bankOther}
              onChange={(e) => setBankOther(e.target.value)}
              placeholder="ระบุชื่อธนาคาร"
              disabled={pending}
              maxLength={100}
              className="mt-2 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
            />
          )}
        </div>
        <div>
          <label htmlFor="acctName" className="block text-xs text-muted mb-1">ชื่อบัญชี</label>
          <input
            id="acctName"
            type="text"
            value={acctName}
            onChange={(e) => setAcctName(e.target.value)}
            disabled={pending}
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="acctNumber" className="block text-xs text-muted mb-1">เลขที่บัญชี</label>
          <input
            id="acctNumber"
            type="text"
            value={acctNumber}
            onChange={(e) => setAcctNumber(e.target.value)}
            disabled={pending}
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          />
        </div>
      </div>

      {/* Wave 12-A — slip upload (optional) */}
      <div>
        <span className="block text-xs text-muted mb-1">
          หลักฐานการโอน (สลิป) <span className="text-muted">— optional</span>
        </span>
        <label
          className={[
            "block rounded-xl border-2 border-dashed p-3.5 transition-colors",
            slipFile
              ? "border-emerald-400 bg-emerald-50/60"
              : "border-border bg-surface-alt/40 hover:bg-surface-alt/70",
            pending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          ].join(" ")}
        >
          <input
            ref={slipInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={(e) => selectSlip(e.currentTarget.files?.[0] ?? null)}
          />
          {slipFile ? (
            <div className="flex items-start gap-3.5">
              {slipPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slipPreview}
                  alt="พรีวิวสลิป"
                  className="max-h-[120px] max-w-[160px] rounded-md border border-border bg-white object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="m-0 font-medium break-all">{slipFile.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {(slipFile.size / 1024).toFixed(1)} KB · {slipFile.type || "unknown"}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    selectSlip(null);
                    if (slipInputRef.current) slipInputRef.current.value = "";
                  }}
                  className="mt-1.5 bg-transparent p-0 text-xs text-red-700 hover:text-red-800 disabled:opacity-60"
                >
                  ลบไฟล์
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center">
              <div className="text-2xl">📄</div>
              <p className="mt-1 font-medium">คลิกเพื่อเลือกไฟล์สลิป</p>
              <p className="mt-0.5 text-[11px] text-muted">
                JPG / PNG / PDF · ≤ 5 MB
              </p>
            </div>
          )}
        </label>
      </div>

      {/* VIP credit flag */}
      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={paydeposit}
            onChange={(e) => setPaydeposit(e.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-border text-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          />
          <span>เป็นเครดิต VIP (paydeposit=1) — ใช้กับลูกค้าเครดิต</span>
        </label>
      </div>

      {/* Note */}
      <div>
        <label htmlFor="note" className="block text-xs text-muted mb-1">หมายเหตุ</label>
        <textarea
          id="note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เหตุผลที่บันทึกรายการนี้ (เช่น 'สลิปลูกค้า PR1234 ระบบไม่จับ — เพิ่มเข้าด้วยตนเอง')"
          disabled={pending}
          maxLength={1000}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
        />
      </div>

      {/* Feedback */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="alert">
          ✓ {success}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => {
            setAmount(""); setNote(""); setBankChoice(""); setBankOther(""); setAcctName("");
            setAcctNumber(""); setSlipDate(""); setError(null); setSuccess(null);
            selectSlip(null);
            if (slipInputRef.current) slipInputRef.current.value = "";
          }}
          disabled={pending}
          className="rounded-lg border border-border bg-white text-foreground px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-60"
        >
          ล้างฟอร์ม
        </button>
        <button
          type="submit"
          disabled={pending || !userid || !amount}
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "กำลังบันทึก..." : "บันทึกรายการ"}
        </button>
      </div>
    </form>
  );
}
