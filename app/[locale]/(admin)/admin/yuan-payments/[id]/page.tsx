/**
 * /admin/yuan-payments/[id] — read-only yuan payment detail (Wave 7 fix · 2026-05-21 night).
 *
 * ── 2026-06-02 ภูม flag #2 — PCS-style redesign ──────────────────────
 *
 * Old layout was barebones (ADMIN · ฝากโอนหยวน · #1460 · flat KV list +
 * slip + action panel). PCS legacy shows two wallet summary cards on top
 * + one BIG detail card with breadcrumb + clickable customer info + status
 * badge + body sections + price breakdown right column. This rewrite ports
 * that polish over; the action area is the guided <YuanVerifyFlow> combo
 * (the old YuanPaymentActions tiny-button island was retired 2026-07-23).
 *
 * Layout (top → bottom):
 *   1. TOP CARDS (grid md:2) — left: this customer's wallet + cash-back
 *      with "+ ชำระเงิน" CTA → /admin/wallet/add?q=PR####;
 *      right: system-wide wallet + cash-back totals + same CTA.
 *      Modeled on /admin/wallet/[id]/page.tsx BalanceCard component.
 *   2. BREADCRUMB — หน้าแรก / ฝากโอนหยวน / #<id>
 *   3. MAIN DETAIL CARD (grid md:2/3+1/3):
 *      LEFT 2/3 — header (id + paytype badge) · status banner ·
 *        clickable customer (name → /admin/customers/<userid>, tel → tel:) ·
 *        "ข้อมูลค่าชำระเงิน" group (yuan · rate · thb) · paydetail · timestamps
 *      RIGHT 1/3 — price breakdown (paythb · paythbcost · payrate · payratecost
 *        · payprofitthb)
 *   4. SLIP IMAGES (existing — customer + admin sections)
 *   5. ACTION AREA — guided slip-verify combo (owner 2026-07-23 "ทุกเลนใช้
 *      แพทเทินเดียวกับ /admin/wallet/[id]"): twin-warning banner (วันเดียวกัน +
 *      ยอดเท่ากัน · paystatus 1/2) → 3-step <ol> indicator (exact wallet
 *      classNames) → <YuanVerifyFlow> client island (PAGE-1 ตรวจรอบ 1 /
 *      PAGE-2 อนุมัติ+ตัดจ่าย · pacred-dialog confirms · success popup).
 *      Replaces the old tiny-button row (YuanPaymentActions · ../actions-cell).
 *
 * ── What is preserved (don't break) ──────────────────────────────────
 *   - The server actions + their args (adminReviewYuanRound1 ·
 *     adminUpdateYuanPayment completed/failed · refund modal) — UI-only change
 *   - paystatusToPacred + paidViaWallet logic for P0-11
 *   - Slip resolver (customer + admin slips)
 *   - Refund-probe via tb_wallet_hs
 *   - force-dynamic + requireAdmin role gate
 *
 * Verified prod schema 2026-05-21 via REST: tb_payment(id, paydate,
 *   paydeposit, paystatus, paytype, paydetail, payyuan, payrate, payratecost,
 *   paythb, paythbcost, payprofitthb, paydateadmin, userid, adminid,
 *   adminidupdate, payadminidcreator, paylockdate, imagesslip,
 *   certifiedtruecopy, imagesslipadmin).
 */

import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { YuanCostEditor } from "@/components/admin/yuan-cost-editor";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { SlipImage } from "@/components/admin/slip-image";
import { YuanQrAttach } from "./yuan-qr-attach";
import { Link } from "@/i18n/navigation";
import { YuanVerifyFlow } from "./verify-flow";
import { paystatusToPacred } from "@/lib/legacy-paystatus-map";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};
// paytype legacy values: 1=alipay 2=wechat 3=union 4=usdt ... (per legacy `payment.php`)
// ภูม flag #2 confirms: keep the "Wechat" channel badge ("อันนี้ดีเเล้วเก็บไว้").
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "Alipay",
  "2": "Wechat",
  "3": "Union",
  "4": "USDT",
};

type PaymentRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  paytype: string | null;
  paydetail: string | null;
  payyuan: number | null;
  payrate: number | null;
  // Money-internal cost columns — only present in the row when the viewer may
  // see them (omitted from the SELECT otherwise). Optional to reflect that.
  payratecost?: number | null;
  paythb: number | null;
  paythbcost?: number | null;
  payprofitthb?: number | null;
  paydateadmin: string | null;
  userid: string;
  adminid: string | null;
  imagesslip: string | null;
  imagesslipadmin: string | null;
  payee_qr_image: string | null;
  // P0-11: '1' = paid from wallet (refund must reverse the debit on the refund lane)
  paydeposit: string | null;
  // A4 round-1 stamp (owner 2026-06-21) — drives the step indicator + PAGE-1/2 fold.
  reviewed_at: string | null;
};
type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
  userEmail: string | null;
};

export default async function AdminYuanPaymentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["ops", "accounting", "super"]);
  // Money-internal visibility (owner 2026-06-18): paythbcost (cost THB),
  // payratecost (cost FX rate), payprofitthb (profit) are money internals —
  // visible ONLY to ultra/accounting/pricing, NOT super/ops. We omit those
  // columns from the SELECT entirely when not allowed (never read the value),
  // and skip the cost/profit PriceRows. `payrate` (customer FX) + paythb
  // (selling THB) stay — they are the selling side, not money-internal.
  const showCostProfit = canViewCostProfit(roles);
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const admin = createAdminClient();
  // P0-11: pulled `paydeposit` so YuanPaymentActions knows whether the
  // refund modal should warn about a wallet reversal (Phase C QoL #4).
  // ภูม #2: also pulled `payratecost` for the right-column price breakdown
  // (cost columns added to the SELECT ONLY when showCostProfit).
  const baseCols =
    "id,paydate,paystatus,paytype,paydetail,payyuan,payrate,paythb,paydateadmin,userid,adminid,imagesslip,imagesslipadmin,payee_qr_image,paydeposit,reviewed_at";
  const costCols = ",payratecost,paythbcost,payprofitthb";
  const { data: rowRaw, error: rowRawErr } = await admin
    .from("tb_payment")
    .select(showCostProfit ? baseCols + costCols : baseCols)
    .eq("id", id)
    .maybeSingle();
  if (rowRawErr) {
    console.error(`[tb_payment lookup] failed`, { code: rowRawErr.code, message: rowRawErr.message, details: rowRawErr.details, hint: rowRawErr.hint });
    throw new Error(`Failed to load tb_payment (${rowRawErr.code ?? "unknown"}): ${rowRawErr.message}`);
  }
  if (!rowRaw) notFound();
  const row = rowRaw as unknown as PaymentRow;

  // Parallel reads: user · slip URLs · refund probe · wallet summary
  // (per-user + system-wide). The 4 wallet/cb fetches mirror
  // /admin/wallet/[id]/page.tsx — same `limit(50_000)` pattern (8,898
  // customers comfortably under cap). To be replaced by
  // `get_wallet_system_totals()` RPC in Phase C.
  const [
    { data: userRaw, error: userRawErr },
    { data: corpRaw, error: corpErr },
    { data: walletRaw, error: walletErr },
    { data: cbRaw, error: cbErr },
    { data: allWallets, error: allWalletsErr },
    { data: allCb, error: allCbErr },
    slipUrl,
    slipAdminUrl,
    qrUrl,
    refundRow,
  ] = await Promise.all([
    admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,userTel,userEmail")
      .eq("userID", row.userid)
      .maybeSingle(),
    admin
      .from("tb_corporate")
      .select("corporatename,corporatenumber,corporateaddress")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", row.userid)
      .maybeSingle(),
    admin.from("tb_wallet").select("wallettotal").limit(50_000),
    admin.from("tb_cash_back").select("cbtotal").limit(50_000),
    resolveLegacyUrl(row.imagesslip, "slip"),
    resolveLegacyUrl(row.imagesslipadmin, "slip"),
    resolveLegacyUrl(row.payee_qr_image, "slip"),
    admin
      .from("tb_wallet_hs")
      .select("id")
      .eq("type", "5")
      .eq("reforder", String(row.id))
      .eq("userid", row.userid)
      .limit(1)
      .maybeSingle<{ id: number }>(),
  ]);
  if (userRawErr) {
    console.error(`[tb_users list] failed`, { code: userRawErr.code, message: userRawErr.message });
  }
  if (corpErr) console.error(`[tb_corporate list] failed`, { code: corpErr.code, message: corpErr.message });
  if (walletErr) console.error(`[tb_wallet list] failed`, { code: walletErr.code, message: walletErr.message });
  if (cbErr) console.error(`[tb_cash_back list] failed`, { code: cbErr.code, message: cbErr.message });
  if (allWalletsErr)
    console.error(`[tb_wallet list-all] failed`, { code: allWalletsErr.code, message: allWalletsErr.message });
  if (allCbErr)
    console.error(`[tb_cash_back list-all] failed`, { code: allCbErr.code, message: allCbErr.message });

  const user = userRaw as unknown as UserRow | null;
  const corp = (corpRaw as unknown as {
    corporatename: string | null;
    corporatenumber: string | null;
    corporateaddress: string | null;
  } | null) ?? null;
  const walletTotalUser = Number((walletRaw as { wallettotal: number | null } | null)?.wallettotal ?? 0);
  const cbTotalUser = Number((cbRaw as { cbtotal: number | null } | null)?.cbtotal ?? 0);
  const walletTotalAll = (allWallets ?? []).reduce(
    (s, r) => s + Number((r as { wallettotal: number | null }).wallettotal ?? 0),
    0,
  );
  const cbTotalAll = (allCb ?? []).reduce(
    (s, r) => s + Number((r as { cbtotal: number | null }).cbtotal ?? 0),
    0,
  );

  const customerName =
    resolveBillingIdentity({
      userCompany: user?.userCompany,
      userName: user?.userName,
      userLastName: user?.userLastName,
      corp,
    }).name || "—";
  const status = row.paystatus ?? "1";
  const paytype = row.paytype ?? "";

  // P0-11: compute the pacred-string status from the legacy char + wallet
  // refund probe. This is the same mapping the rebuilt action uses internally
  // (lib/legacy-paystatus-map.ts), so YuanPaymentActions can decide which
  // buttons to render off a single source of truth.
  const pacredStatus = paystatusToPacred(status, Boolean(refundRow.data?.id));
  const paidViaWallet = row.paydeposit === "1";

  // ── Duplicate-twin detector (owner 2026-07-23 · wallet [id] "รายการใกล้เคียง"
  //    parity for the yuan lane): other tb_payment rows with the SAME ฿ amount
  //    (paythb) on the SAME DATE(paydate), still pending or already approved
  //    (paystatus 1/2 — a rejected '3' twin is harmless), excluding self.
  //    PostgREST has no DATE() helper → [day_start, day_end] range like the
  //    wallet page. READ-only · fail-soft (no banner on error).
  type TwinRow = {
    id: number;
    paydate: string | null;
    paythb: number | string | null;
    userid: string | null;
    paystatus: string | null;
  };
  let twins: TwinRow[] = [];
  const twinAmount = Number(row.paythb ?? 0);
  if (row.paydate && twinAmount > 0) {
    const payDate = new Date(row.paydate);
    if (!Number.isNaN(payDate.getTime())) {
      const dayStart = new Date(payDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(payDate);
      dayEnd.setHours(23, 59, 59, 999);
      const { data: twinRaw, error: twinErr } = await admin
        .from("tb_payment")
        .select("id,paydate,paythb,userid,paystatus")
        .eq("paythb", twinAmount)
        .neq("id", row.id)
        .in("paystatus", ["1", "2"])
        .gte("paydate", dayStart.toISOString())
        .lte("paydate", dayEnd.toISOString())
        .order("id", { ascending: false })
        .limit(20);
      if (twinErr) {
        console.error(`[tb_payment twins] failed`, { code: twinErr.code, message: twinErr.message });
      } else {
        twins = (twinRaw ?? []) as unknown as TwinRow[];
      }
    }
  }

  return (
    <main className="p-4 lg:p-6 space-y-4">
      {/* ── 1. TOP CARDS: per-user + system-wide ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BalanceCard
          title="ยอดเงินของสมาชิก"
          subtitle={`กระเป๋าสตางค์ ${row.userid} (บาท)`}
          amount={walletTotalUser}
          cashback={cbTotalUser}
          topupHref={`/admin/wallet/add?q=${encodeURIComponent(row.userid)}`}
        />
        <BalanceCard
          title="ยอดรวมทั้งหมดในระบบ"
          subtitle="กระเป๋าสตางค์ (บาท)"
          amount={walletTotalAll}
          cashback={cbTotalAll}
          topupHref="/admin/wallet/add"
        />
      </section>

      {/* ── 2. BREADCRUMB ── */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/yuan-payments" className="hover:text-primary-600">ฝากโอนหยวน</Link>
        <span>/</span>
        <span className="font-mono text-foreground">#{row.id}</span>
      </nav>

      {/* ── 3. MAIN DETAIL CARD ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {/* Header strip */}
        <div className="border-b border-border bg-primary-50/40 dark:bg-primary-50/5 p-4 flex items-start justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-widest text-primary-600">
              รายการฝากชำระเงินค้า
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold font-mono">#{row.id}</h1>
              {paytype ? (
                <span className="rounded-full border border-border bg-surface-alt px-2.5 py-0.5 text-[11px]">
                  {PAYTYPE_LABEL[paytype] ?? `type ${paytype}`}
                </span>
              ) : null}
              {paidViaWallet ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 text-amber-700 px-2.5 py-0.5 text-[11px]">
                  ชำระจากกระเป๋า
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted">
              เวลาทำรายการ: {row.paydate ? new Date(row.paydate).toLocaleString("th-TH") : "—"}
            </p>
          </div>
          <div className="text-right space-y-1">
            <span
              className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            {row.adminid && status !== "1" ? (
              <p className="text-[11px] text-muted">
                ดำเนินรายการแล้ว โดย: <span className="font-mono">{row.adminid}</span>
              </p>
            ) : null}
            {row.paydateadmin ? (
              <p className="text-[11px] text-muted">
                {new Date(row.paydateadmin).toLocaleString("th-TH")}
              </p>
            ) : null}
          </div>
        </div>

        {/* Body: 2-col (md:2/3 + 1/3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* LEFT 2/3 — customer + payment info */}
          <div className="md:col-span-2 p-5 space-y-4 border-b md:border-b-0 md:border-r border-border">
            {/* Customer block */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted">จาก</p>
              <Link
                href={`/admin/customers/${encodeURIComponent(row.userid)}`}
                className="block text-base font-bold text-primary-600 hover:underline"
              >
                [{row.userid}] {customerName}
              </Link>
              {user?.userTel ? (
                <p className="text-sm">
                  <span className="text-muted">โทร:</span>{" "}
                  <a href={`tel:${user.userTel}`} className="text-primary-600 hover:underline font-mono">
                    {user.userTel}
                  </a>
                </p>
              ) : null}
              {user?.userEmail ? (
                <p className="text-sm">
                  <span className="text-muted">อีเมล:</span>{" "}
                  <a href={`mailto:${user.userEmail}`} className="text-primary-600 hover:underline">
                    {user.userEmail}
                  </a>
                </p>
              ) : null}
            </div>

            {/* Payment data block */}
            <div className="space-y-1.5 rounded-xl border border-border bg-surface-alt/30 p-4">
              <p className="text-xs font-semibold text-muted mb-2">ข้อมูลค่าชำระเงิน</p>
              <KV
                label="จำนวนเงินหยวน"
                value={`¥${Number(row.payyuan ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                mono
              />
              <KV
                label="เรทฝากชำระ"
                value={`${Number(row.payrate ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4 })} บาท/หยวน`}
                mono
              />
              <KV
                label="จำนวนเงินบาท"
                value={`฿${Number(row.paythb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                mono
                emphasis
              />
            </div>

            {/* Paydetail */}
            {row.paydetail ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted">รายละเอียดผู้รับ</p>
                <p className="text-sm whitespace-pre-wrap break-words rounded-md border border-border bg-white dark:bg-surface p-3">
                  {row.paydetail}
                </p>
              </div>
            ) : null}
          </div>

          {/* RIGHT 1/3 — price breakdown.
              Money-internal rows (ต้นทุน cost THB · เรทต้นทุน cost FX · กำไรสุทธิ
              profit) render ONLY for ultra/accounting/pricing — the values were
              never even SELECTed otherwise (showCostProfit). `จ่ายจริง` (paythb)
              + `เรทลูกค้า` (payrate) are the selling side and stay visible. */}
          <div className="p-5 space-y-3 bg-surface-alt/20">
            <p className="text-xs font-semibold text-muted mb-1">สรุปรายการเงิน</p>
            <PriceRow
              label="จ่ายจริง"
              value={`฿${Number(row.paythb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            />
            {showCostProfit ? (
              <PriceRow
                label="รับทุนลูกค้า"
                value={`฿${Number(row.paythbcost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
            ) : null}
            {showCostProfit ? (
              <PriceRow
                label="เรทกูลฯ"
                value={Number(row.payratecost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4 })}
              />
            ) : null}
            <PriceRow
              label="เรทลูกค้า"
              value={Number(row.payrate ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4 })}
            />
            {showCostProfit ? (
              <div className="pt-2 border-t border-border">
                <PriceRow
                  label="กำไรสุทธิ"
                  value={`฿${Number(row.payprofitthb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  emphasis
                />
              </div>
            ) : null}
            {/* owner 2026-06-25 (YUAN · cost-editable-sell-locked) — edit the REAL
                yuan cost at ANY status (incl. settled/refunded) · sell stays locked. */}
            {showCostProfit ? (
              <YuanCostEditor
                id={row.id}
                payYuan={Number(row.payyuan ?? 0)}
                payThb={Number(row.paythb ?? 0)}
                payRateCost={row.payratecost ?? null}
                payThbCost={row.paythbcost ?? null}
                payProfitThb={row.payprofitthb ?? null}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 3.5 PAYEE QR (收款码) — owner 2026-07-08 · always shown so accounting
             can attach it any time (the customer's QR often arrives via LINE
             after the job is created) ── */}
      <section>
        <YuanQrAttach id={row.id} qrUrl={qrUrl} qrFilename={row.payee_qr_image} />
      </section>

      {/* ── 4. SLIP IMAGES ── */}
      {(slipUrl || slipAdminUrl) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {slipUrl && (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
              <p className="text-xs font-semibold text-muted mb-2">สลิป (ลูกค้าอัปโหลด)</p>
              <a
                href={slipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
              >
                <SlipImage src={slipUrl} alt="สลิป" className="max-w-full max-h-[480px] min-w-[140px] min-h-[140px]" />
              </a>
              <p className="text-[11px] text-muted mt-2 break-all font-mono">{row.imagesslip}</p>
            </div>
          )}
          {slipAdminUrl && (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
              <p className="text-xs font-semibold text-muted mb-2">สลิป (แอดมินอัปโหลด)</p>
              <a
                href={slipAdminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
              >
                <SlipImage src={slipAdminUrl} alt="สลิปแอดมิน" className="max-w-full max-h-[480px] min-w-[140px] min-h-[140px]" />
              </a>
              <p className="text-[11px] text-muted mt-2 break-all font-mono">{row.imagesslipadmin}</p>
            </div>
          )}
        </section>
      )}

      {/* ── 5. ACTION AREA — guided slip-verify combo (wallet [id] pattern ·
             owner 2026-07-23 "ทุกเลนตรวจสลิปใช้แพทเทินเดียวกัน") ── */}
      <section className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-50/5 p-5 space-y-3">
        <p className="text-xs font-semibold text-primary-700">
          การดำเนินการ — ตรวจสลิปฝากโอน (2 รอบ)
        </p>

        {/* twin warning — วันเดียวกัน + ยอดเท่ากัน ที่ยังมีผล (รอตรวจ/อนุมัติแล้ว) */}
        {twins.length > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 dark:bg-red-50/10">
            <p className="text-sm font-bold text-red-700">
              ⚠️ รายการนี้ใกล้เคียงกับรายการอื่น {twins.length} รายการ (วันเดียวกัน · ยอดเท่ากัน)
            </p>
            <p className="mt-0.5 text-[11px] text-red-800">
              ตรวจให้แน่ใจว่าไม่ใช่สลิปซ้ำ ก่อนผ่านรอบ 1 / อนุมัติตัดจ่าย
            </p>
            <div className="mt-2 space-y-1">
              {twins.map((tw) => (
                <div
                  key={tw.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] text-red-900 dark:bg-surface"
                >
                  <span>
                    วันที่/เวลา:{" "}
                    <b className="font-mono">
                      {tw.paydate ? new Date(tw.paydate).toLocaleString("th-TH") : "—"}
                    </b>
                  </span>
                  <span>
                    ลูกค้า: <b className="font-mono">{tw.userid ?? "—"}</b>
                  </span>
                  <span>
                    ยอด:{" "}
                    <b className="font-mono">
                      ฿{Number(tw.paythb ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </b>
                  </span>
                  <span>
                    สถานะ: <b>{STATUS_LABEL[tw.paystatus ?? ""] ?? `status ${tw.paystatus}`}</b>
                  </span>
                  <Link
                    href={`/admin/yuan-payments/${tw.id}`}
                    className="ml-auto font-mono font-semibold text-red-700 underline hover:text-red-800"
                  >
                    #{tw.id} →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3-step indicator — exact wallet [id] chip classNames. ฝากโอน mints NO
            tb_receipt → step labels never promise one (owner dead-end rule). */}
        <ol
          className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-3"
          aria-label="ขั้นตอนตรวจสลิปฝากโอน"
        >
          {[
            {
              no: 1,
              label: "ตรวจสลิป · วันโอน · รายการซ้ำ",
              done: Boolean(row.reviewed_at) || status !== "1",
              active: status === "1" && !row.reviewed_at,
            },
            {
              no: 2,
              label: "ตรวจยอดโอน · เรทต้นทุน",
              done: status === "2" || status === "3",
              active: status === "1" && Boolean(row.reviewed_at),
            },
            {
              no: 3,
              label: "อนุมัติตัดจ่าย · แจ้งผลลูกค้า",
              done: status === "2" || status === "3",
              active: status === "2" || status === "3",
            },
          ].map((step) => (
            <li
              key={step.no}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                step.done
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : step.active
                    ? "border-sky-400 bg-sky-50 text-sky-900 ring-2 ring-sky-100"
                    : "border-border bg-surface-alt/40 text-muted"
              }`}
            >
              <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full border border-current text-[11px]">
                {step.done ? "✓" : step.no}
              </span>
              {step.label}
            </li>
          ))}
        </ol>

        <YuanVerifyFlow
          id={String(row.id)}
          status={pacredStatus}
          yuanAmount={Number(row.payyuan ?? 0)}
          thbAmount={Number(row.paythb ?? 0)}
          payRate={Number(row.payrate ?? 0)}
          memberCode={row.userid}
          customerName={customerName}
          phone={user?.userTel ?? null}
          paidViaWallet={paidViaWallet}
          reviewedAt={row.reviewed_at ?? null}
          twinCount={twins.length}
        />
      </section>

      {/* Bottom nav */}
      <div className="flex gap-2 flex-wrap pt-1">
        <Link
          href="/admin/yuan-payments"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการทั้งหมด
        </Link>
        <Link
          href={`/admin/customers/${encodeURIComponent(row.userid)}`}
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ดูโปรไฟล์ลูกค้า →
        </Link>
      </div>
    </main>
  );
}

// ── Sub-components (kept local — they only render data, no state) ─────

function BalanceCard({
  title,
  subtitle,
  amount,
  cashback,
  topupHref,
}: {
  title: string;
  subtitle: string;
  amount: number;
  cashback: number;
  topupHref: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-red-700">{title}</p>
          <p className="text-[11px] text-muted">{subtitle}</p>
          <p className="mt-1 text-3xl font-bold text-foreground font-mono">
            ฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-purple-700">
            Cash Back: {cashback.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
          </p>
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-200" />
      <div className="px-4 py-2 text-center">
        <Link
          href={topupHref}
          className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600"
        >
          <Plus className="h-3 w-3" /> ชำระเงิน
        </Link>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span
        className={[
          "text-right",
          mono ? "font-mono" : "",
          emphasis ? "font-bold text-foreground" : "text-foreground",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function PriceRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span
        className={[
          "font-mono text-right",
          emphasis ? "text-base font-bold text-green-700" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
