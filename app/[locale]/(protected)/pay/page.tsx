import { QrCode } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { BANK } from "@/components/seo/site";

/**
 * Company payment QR screen — `/pay`.
 *
 * ── 2026-06-08 · STATIC company QR (owner directive) ──
 * This screen previously generated a DYNAMIC, amount-encoded PromptPay QR
 * client-side via the legacy `qrcode.min.js` + `promptpay.js` vendor
 * plugins + an inline `generatePayload()`/`makeCode()` init script.
 *
 * The owner cancelled all dynamic / amount-encoded PromptPay across the
 * platform: customers SCAN the company's STATIC K-Shop / Thai-QR-Payment
 * card (the corporate Kasikornbank account), TYPE the amount themselves,
 * then attach the slip for staff to verify. So the dynamic QR generator
 * + the two vendor plugin <Script>s + the Bootstrap-4 #myModal are all
 * removed; the screen now renders the static company QR image plus the
 * bank-account block + a type-amount instruction.
 *
 * Static asset: `public/images/payment/pacred-qr.png` (the corporate
 * Thai-QR-Payment card — served centrally; this is the same image
 * `lib/promptpay.ts` now returns). The amount input is kept ONLY as a
 * non-functional display helper for the customer to note their amount;
 * it no longer drives any QR generation.
 *
 * Auth: `requireAuth()` — the screen reads no per-user data.
 */

export const dynamic = "force-dynamic";

export default async function PayPage() {
  await requireAuth();

  return (
    <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
      <section className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
        {/* ── Header ── */}
        <div className="border-b border-border px-4 py-3 md:px-5 md:py-4">
          <h1 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
            <QrCode className="h-5 w-5 md:h-6 md:w-6 shrink-0 text-primary-600" />
            <span>ชำระเงิน / สแกน QR Code</span>
          </h1>
          <p className="mt-1 text-xs md:text-sm text-muted">
            สแกน QR แล้วกรอกจำนวนเงินที่ต้องชำระเอง → โอนแล้วแนบสลิป (ทีมงานตรวจสอบ)
          </p>
        </div>

        <div className="px-4 py-5 md:px-5 md:py-5">
          {/* ── Static company QR ── */}
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/payment/pacred-qr.png"
              alt="QR Code พร้อมเพย์ / Thai QR Payment — บจก. แพคเรด (ประเทศไทย)"
              className="w-full max-w-[300px] rounded-xl border border-border bg-white p-2"
            />
          </div>

          {/* ── Bank-account block ── */}
          <div className="mt-5 rounded-xl border border-border bg-gray-50 px-4 py-4 dark:bg-surface/60">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              บัญชีรับชำระเงิน
            </p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-muted">บัญชี:</dt>
                <dd className="font-bold text-foreground tabular-nums">
                  {BANK.accountNumber}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-muted">ชื่อบัญชี:</dt>
                <dd className="font-semibold text-foreground">
                  {BANK.accountName}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-muted">ธนาคาร:</dt>
                <dd className="font-semibold text-foreground">{BANK.name}</dd>
              </div>
            </dl>
          </div>

          {/* ── Type-amount instruction ── */}
          <p className="mt-4 text-center text-sm font-medium text-foreground">
            สแกน QR แล้วกรอกจำนวนเงินที่ต้องชำระเอง → โอนแล้วแนบสลิป (ทีมงานตรวจสอบ)
          </p>

          {/* ── Amount helper (display-only — no QR generation) ── */}
          <div className="mt-4">
            <label
              htmlFor="amount"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              จำนวนเงินที่ต้องชำระ (สำหรับจดบันทึก)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:bg-surface"
              id="amount"
              placeholder="เช่น 1000.00"
            />
            <p className="mt-1 text-xs text-muted">
              กรอกจำนวนเงินเดียวกันตอนสแกนโอนผ่านแอปธนาคาร
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
