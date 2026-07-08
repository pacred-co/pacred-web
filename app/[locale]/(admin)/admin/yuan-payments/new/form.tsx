"use client";

/**
 * Client form for /admin/yuan-payments/new — talks to
 * `adminCreateYuanPaymentManual` in actions/admin/yuan-payments-tb.ts.
 * Submits → revalidates → resets on success.
 *
 * Faithful-port: writes to legacy `tb_payment`. Customer is identified
 * by `userid` (PR####). THB total previewed client-side.
 */

import { useRef, useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminCreateYuanPaymentManual } from "@/actions/admin/yuan-payments-tb";
import { CustomerPicker } from "@/components/admin/customer-picker";
import { decodeQrFromFile } from "@/lib/qr/decode-image";
import { OcrExtract } from "@/components/ocr/ocr-extract";

export type CustomerLite = {
  userid:       string;
  username:     string | null;
  userlastname: string | null;
  usertel:      string | null;
  useremail:    string | null;
};

function labelCustomer(c: CustomerLite | null | undefined): string {
  if (!c) return "—";
  const name = `${c.username ?? ""} ${c.userlastname ?? ""}`.trim();
  return `${c.userid} · ${name || c.usertel || c.useremail || "(ไม่มีชื่อ)"}`;
}

const PAYTYPE_OPTIONS = [
  { value: "1", label: "Alipay" },
  { value: "2", label: "Wechat" },
  { value: "3", label: "Union Pay / Bank" },
  { value: "4", label: "USDT" },
] as const;

type PayType = typeof PAYTYPE_OPTIONS[number]["value"];

export function AdminYuanPaymentNewForm({
  preset,
  defaultRate,
}: {
  preset:      CustomerLite | null;
  defaultRate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [userid, setUserid]       = useState<string>(preset?.userid ?? "");
  const [paytype, setPaytype]     = useState<PayType>("1");
  const [paydetail, setPaydetail] = useState<string>("");
  const [payyuan, setPayyuan]     = useState<string>("");
  const [payrate, setPayrate]     = useState<string>(defaultRate ? defaultRate.toFixed(2) : "5.00");
  const [paycost, setPaycost]     = useState<string>("");      // admin cost rate (optional)
  const [paydeposit, setPaydeposit] = useState<boolean>(false);
  const [note, setNote]           = useState<string>("");

  // Wave 12-A — slip-file state (optional · uploads to slips bucket on submit)
  const [slipFile, setSlipFile]       = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  // owner 2026-07-08 — payee 收款码 QR (Alipay/WeChat) the customer sent
  const [qrFile, setQrFile]       = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const qrInputRef = useRef<HTMLInputElement | null>(null);
  // auto-read the QR machine payload (channel + reference) — admin reviews
  const [qrDecoding, setQrDecoding] = useState<boolean>(false);
  const [qrDecoded, setQrDecoded]   = useState<{ text: string; channel: "alipay" | "wechat" | null } | null>(null);

  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (slipPreview) URL.revokeObjectURL(slipPreview);
    };
  }, [slipPreview]);

  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  function selectQr(f: File | null) {
    setError(null);
    if (f && f.size > 5 * 1024 * 1024) {
      setError("ไฟล์รูป QR ใหญ่เกิน 5 MB — กรุณาเลือกไฟล์ใหม่");
      return;
    }
    setQrFile(f);
    setQrDecoded(null);
    if (qrPreview) URL.revokeObjectURL(qrPreview);
    setQrPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);

    // Auto-read the QR — decode its machine payload + detect the channel so the
    // admin doesn't retype. Best-effort · silent on failure (a non-QR image or a
    // logo-heavy code just yields no auto-fill). The Chinese shop name printed on
    // the image is NOT in the QR (needs OCR · owner-gated on a vision key).
    if (f && f.type.startsWith("image/")) {
      setQrDecoding(true);
      void decodeQrFromFile(f)
        .then((res) => {
          setQrDecoded(res);
          if (res?.channel === "alipay") setPaytype("1");
          else if (res?.channel === "wechat") setPaytype("2");
        })
        .catch(() => setQrDecoded(null))
        .finally(() => setQrDecoding(false));
    }
  }

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

  // Preview computed THB total.
  const previewThb = useMemo(() => {
    const yuan = parseFloat(payyuan.replace(/,/g, ""));
    const rate = parseFloat(payrate.replace(/,/g, ""));
    if (Number.isNaN(yuan) || Number.isNaN(rate) || yuan <= 0 || rate <= 0) return null;
    return Math.round(yuan * rate * 100) / 100;
  }, [payyuan, payrate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userid) { setError("เลือกสมาชิกก่อน"); return; }

    const yuan = parseFloat(payyuan.replace(/,/g, ""));
    const rate = parseFloat(payrate.replace(/,/g, ""));
    if (Number.isNaN(yuan) || yuan <= 0) { setError("จำนวน CNY ไม่ถูกต้อง"); return; }
    if (Number.isNaN(rate) || rate <= 0) { setError("เรทไม่ถูกต้อง"); return; }
    if (!paydetail.trim()) { setError("ระบุชื่อ/บัญชีผู้รับ"); return; }

    const costRate = paycost.trim() ? parseFloat(paycost.replace(/,/g, "")) : undefined;
    if (paycost.trim() && (Number.isNaN(costRate ?? NaN) || (costRate ?? -1) < 0)) {
      setError("cost rate ไม่ถูกต้อง"); return;
    }

    startTransition(async () => {
      const result = await adminCreateYuanPaymentManual(
        {
          userid,
          paytype,
          paydetail: paydetail.trim(),
          payyuan: yuan,
          payrate: rate,
          payratecost: costRate,
          paydeposit,
          note: note || undefined,
        },
        slipFile,                       // Wave 12-A — optional admin-attached slip
        qrFile,                         // owner 2026-07-08 — payee 收款码 QR
      );

      if (!result.ok) { setError(result.error); return; }

      setSuccess(
        `บันทึกสำเร็จ (id ${result.data?.id}) · THB total = ฿${(result.data?.paythb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
      setPayyuan("");
      setPaydetail("");
      setNote("");
      selectSlip(null);
      selectQr(null);
      if (slipInputRef.current) slipInputRef.current.value = "";
      if (qrInputRef.current) qrInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      {/* Customer — type-to-search autocomplete over the FULL customer DB
          (9,000+ tb_users) via <CustomerPicker> + adminSearchCustomers.
          Yields the PR member code into `userid` — the exact field the
          create action already submits (unchanged). `?q=PR1234` still
          pre-selects (preset → initialLabel chip). */}
      <div>
        <label className="block text-xs text-muted mb-1">สมาชิก <span className="text-red-700">*</span></label>
        <CustomerPicker
          value={userid}
          onChange={(id) => setUserid(id)}
          initialLabel={preset ? labelCustomer(preset) : undefined}
          placeholder="ค้นหา PR / ชื่อ / เบอร์ / อีเมล / บริษัท"
          required
          disabled={pending}
        />
        <small className="mt-1 block text-xs text-muted">
          พิมพ์ PR / ชื่อ / เบอร์ / อีเมล / ชื่อบริษัท เพื่อค้นหาลูกค้าทั้งหมด · หรือใช้{" "}
          <code className="rounded bg-surface-alt px-1 py-0.5 text-[11px]">/admin/yuan-payments/new?q=PR1234</code> เพื่อระบุตรง
        </small>
      </div>

      {/* Channel + Detail */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">ช่องทาง</label>
          <select
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            value={paytype}
            onChange={(e) => setPaytype(e.target.value as PayType)}
            disabled={pending}
          >
            {PAYTYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted mb-1">ผู้รับ (ชื่อ / บัญชี / wallet ID) <span className="text-red-700">*</span></label>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            value={paydetail}
            onChange={(e) => setPaydetail(e.target.value)}
            placeholder="เช่น 张三 · alipay 123@xx.com"
            disabled={pending}
            required
            maxLength={2000}
          />
        </div>
      </div>

      {/* Amount + Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">จำนวน CNY <span className="text-red-700">*</span></label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            value={payyuan}
            onChange={(e) => setPayyuan(e.target.value)}
            placeholder="¥100.00"
            disabled={pending}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">เรท (THB/CNY) <span className="text-red-700">*</span></label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            value={payrate}
            onChange={(e) => setPayrate(e.target.value)}
            placeholder="5.00"
            disabled={pending}
            required
          />
          <small className="mt-1 block text-xs text-muted">default = tb_settings.rpdefault (เรทฝากชำระ)</small>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">cost rate (admin)</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            value={paycost}
            onChange={(e) => setPaycost(e.target.value)}
            placeholder="เช่น 4.95"
            disabled={pending}
          />
          <small className="mt-1 block text-xs text-muted">(optional) ใช้คำนวน margin</small>
        </div>
      </div>

      {/* Preview */}
      {previewThb != null && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          พรีวิว THB total = <strong>฿{previewThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
      )}

      {/* owner 2026-07-08 — payee QR (收款码) the customer sent, so the China
          operator can scan+pay. Distinct from the after-transfer slip below. */}
      <div>
        <label className="block text-xs text-muted mb-1">
          รูป QR ปลายทาง (Alipay / WeChat 收款码 ที่ลูกค้าส่งมา) <span className="text-muted">— สำหรับสแกนโอน</span>
        </label>
        <label
          className={`block cursor-pointer rounded-xl border-2 border-dashed p-3.5 transition ${
            qrFile
              ? "border-blue-400 bg-blue-50/40"
              : "border-border bg-surface-alt/40 hover:border-blue-300 hover:bg-blue-50/30"
          } ${pending ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <input
            ref={qrInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={(e) => selectQr(e.currentTarget.files?.[0] ?? null)}
          />
          {qrFile ? (
            <div className="flex items-start gap-3.5">
              {qrPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrPreview}
                  alt="พรีวิว QR ปลายทาง"
                  className="max-h-[120px] max-w-[160px] rounded border border-border bg-white object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="m-0 break-all font-medium text-sm">{qrFile.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {(qrFile.size / 1024).toFixed(1)} KB · {qrFile.type || "unknown"}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    selectQr(null);
                    if (qrInputRef.current) qrInputRef.current.value = "";
                  }}
                  className="mt-1.5 bg-transparent p-0 text-xs text-red-600 hover:text-red-700"
                >
                  ลบไฟล์
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center">
              <div className="text-2xl">📱</div>
              <p className="mt-1 font-medium text-sm">คลิกเพื่อแนบรูป QR ปลายทาง</p>
              <p className="mt-0.5 text-[11px] text-muted">
                JPG / PNG / PDF · ≤ 5 MB
              </p>
            </div>
          )}
        </label>

        {/* Auto-read result — the QR machine payload + detected channel.
            The admin reviews; a button folds it into the recipient field. */}
        {qrDecoding && (
          <p className="mt-2 text-[11px] text-blue-600">⏳ กำลังอ่าน QR อัตโนมัติ…</p>
        )}
        {qrDecoded && (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            <p className="font-medium">
              📷 อ่านจาก QR อัตโนมัติ
              {qrDecoded.channel && (
                <span className="ml-1">· ช่องทาง: {qrDecoded.channel === "alipay" ? "Alipay (支付宝)" : "WeChat"} (ตั้งให้แล้ว)</span>
              )}
            </p>
            <p className="mt-1 break-all font-mono text-blue-700">{qrDecoded.text}</p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                setPaydetail((prev) => (prev.trim() ? `${prev.trim()} · ${qrDecoded.text}` : qrDecoded.text))
              }
              className="mt-1.5 bg-transparent p-0 font-medium text-blue-700 underline hover:text-blue-900"
            >
              ＋ ใช้เป็นข้อมูลผู้รับ
            </button>
            <p className="mt-1 text-blue-600/80">
              ชื่อร้าน (ตัวอักษรจีนบนรูป) ไม่ได้อยู่ใน QR — กดปุ่ม “อ่านข้อความจากรูป” ด้านล่างเพื่อดึงชื่อร้าน
            </p>
          </div>
        )}

        {/* In-house OCR (Tesseract.js) — read the Chinese shop name / any text
            printed on the QR image, then click a line to fill the recipient. */}
        {qrFile && (
          <OcrExtract
            file={qrFile}
            langs="chi_sim+eng"
            label="🔍 อ่านชื่อร้าน/ข้อความบนรูป (OCR)"
            disabled={pending}
            onPickLine={(l) =>
              setPaydetail((prev) => (prev.trim() ? `${prev.trim()} · ${l}` : l))
            }
          />
        )}
      </div>

      {/* Wave 12-A — slip upload (optional · admin-attached proof) */}
      <div>
        <label className="block text-xs text-muted mb-1">
          หลักฐานการโอน (สลิป) <span className="text-muted">— optional · เก็บใน imagesslipadmin</span>
        </label>
        <label
          className={`block cursor-pointer rounded-xl border-2 border-dashed p-3.5 transition ${
            slipFile
              ? "border-emerald-400 bg-emerald-50/40"
              : "border-border bg-surface-alt/40 hover:border-primary-300 hover:bg-primary-50/30"
          } ${pending ? "cursor-not-allowed opacity-60" : ""}`}
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
                  className="max-h-[120px] max-w-[160px] rounded border border-border bg-white object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="m-0 break-all font-medium text-sm">{slipFile.name}</p>
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
                  className="mt-1.5 bg-transparent p-0 text-xs text-red-600 hover:text-red-700"
                >
                  ลบไฟล์
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center">
              <div className="text-2xl">📄</div>
              <p className="mt-1 font-medium text-sm">คลิกเพื่อเลือกไฟล์สลิป</p>
              <p className="mt-0.5 text-[11px] text-muted">
                JPG / PNG / PDF · ≤ 5 MB
              </p>
            </div>
          )}
        </label>
      </div>

      {/* Paid via wallet */}
      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-primary-500 focus:ring-primary-500/30"
            checked={paydeposit}
            onChange={(e) => setPaydeposit(e.target.checked)}
            disabled={pending}
          />
          <span>ลูกค้าจ่ายจาก wallet (paydeposit=1)</span>
        </label>
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs text-muted mb-1">หมายเหตุ</label>
        <textarea
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          maxLength={1000}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          ✓ {success}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          className="rounded-lg border border-border bg-white text-foreground px-4 py-2 text-sm hover:bg-surface-alt"
          onClick={() => {
            setPayyuan(""); setPaydetail(""); setNote(""); setPaycost("");
            setError(null); setSuccess(null);
            selectSlip(null);
            selectQr(null);
            if (slipInputRef.current) slipInputRef.current.value = "";
            if (qrInputRef.current) qrInputRef.current.value = "";
          }}
          disabled={pending}
        >
          ล้างฟอร์ม
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={pending || !userid || !payyuan || !paydetail}
        >
          {pending ? "กำลังบันทึก..." : "บันทึกรายการ"}
        </button>
      </div>
    </form>
  );
}
