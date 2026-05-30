/**
 * /admin/yuan-payments/[id] — read-only yuan payment detail (Wave 7 fix · 2026-05-21 night).
 *
 * The /admin dashboard's "payment" tab "ดู/แก้ไข" link pointed at
 * `/admin/yuan-payments/${row.id}` but no route existed → 404. This page
 * resolves the row id against `tb_payment` + `tb_users` and renders the
 * basics + the slip image (if any).
 *
 * Wave 8 backlog: approve/reject buttons + auto-credit wallet on approve
 * (mirrors the legacy `tb_payment.paystatus '1' → '2' → '3'` flow). For
 * now read-only; ops uses the legacy PHP admin if urgent.
 *
 * Verified prod schema 2026-05-21 via REST: tb_payment(id, paydate,
 *   paydeposit, paystatus, paytype, paydetail, payyuan, payrate, payratecost,
 *   paythb, paythbcost, payprofitthb, paydateadmin, userid, adminid,
 *   adminidupdate, payadminidcreator, paylockdate, imagesslip,
 *   certifiedtruecopy, imagesslipadmin).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { Link } from "@/i18n/navigation";
import { YuanPaymentActions } from "../actions-cell";
import { paystatusToPacred } from "@/lib/legacy-paystatus-map";

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
  paythb: number | null;
  paythbcost: number | null;
  payprofitthb: number | null;
  paydateadmin: string | null;
  userid: string;
  adminid: string | null;
  imagesslip: string | null;
  imagesslipadmin: string | null;
  // P0-11: '1' = paid from wallet (refund must reverse the debit on YuanPaymentActions)
  paydeposit: string | null;
};
type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

export default async function AdminYuanPaymentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const admin = createAdminClient();
  // P0-11: pulled `paydeposit` so YuanPaymentActions knows whether the
  // refund modal should warn about a wallet reversal (Phase C QoL #4).
  const { data: rowRaw, error: rowRawErr } = await admin
    .from("tb_payment")
    .select(
      "id,paydate,paystatus,paytype,paydetail,payyuan,payrate,paythb,paythbcost,payprofitthb,paydateadmin,userid,adminid,imagesslip,imagesslipadmin,paydeposit",
    )
    .eq("id", id)
    .maybeSingle();
  if (rowRawErr) {
    console.error(`[tb_payment lookup] failed`, { code: rowRawErr.code, message: rowRawErr.message, details: rowRawErr.details, hint: rowRawErr.hint });
    throw new Error(`Failed to load tb_payment (${rowRawErr.code ?? "unknown"}): ${rowRawErr.message}`);
  }
  if (!rowRaw) notFound();
  const row = rowRaw as unknown as PaymentRow;

  const { data: userRaw, error: userRawErr } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName,userTel,userEmail")
    .eq("userID", row.userid)
    .maybeSingle();
  if (userRawErr) {
    console.error(`[tb_users list] failed`, { code: userRawErr.code, message: userRawErr.message });
  }
  const user = userRaw as unknown as UserRow | null;

  const customerName = `${user?.userName ?? ""} ${user?.userLastName ?? ""}`.trim() || "—";
  const status = row.paystatus ?? "1";
  const paytype = row.paytype ?? "";

  // Wave 13: resolve legacy slip filenames → Supabase signed URLs in
  // parallel. Bare filenames (`PCS9122_…jpg`) live under `slips/legacy/`
  // after backfill 06; the resolver also passes through full URLs and
  // Wave-12 admin uploads at `admin/cnt-slip/…` unchanged.
  //
  // P0-11: ALSO probe for an existing wallet refund row so YuanPaymentActions
  // can render the right "refunded" vs "failed" branch on paystatus='3'.
  // Pattern verified against actions/admin/yuan-payments.ts:104 — refund
  // is INSERT tb_wallet_hs(type='5', reforder=id, userid).
  const [slipUrl, slipAdminUrl, refundRow] = await Promise.all([
    resolveLegacyUrl(row.imagesslip, "slip"),
    resolveLegacyUrl(row.imagesslipadmin, "slip"),
    admin
      .from("tb_wallet_hs")
      .select("id")
      .eq("type", "5")
      .eq("reforder", String(row.id))
      .eq("userid", row.userid)
      .limit(1)
      .maybeSingle<{ id: number }>(),
  ]);
  // P0-11: compute the pacred-string status from the legacy char + wallet
  // refund probe. This is the same mapping the rebuilt action uses internally
  // (lib/legacy-paystatus-map.ts), so YuanPaymentActions can decide which
  // buttons to render off a single source of truth.
  const pacredStatus = paystatusToPacred(status, Boolean(refundRow.data?.id));
  const paidViaWallet = row.paydeposit === "1";

  return (
    <main className="p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · ฝากโอนหยวน
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">#{row.id}</h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            {paytype ? (
              <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs">
                {PAYTYPE_LABEL[paytype] ?? `type ${paytype}`}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-1">
            P0-11 · ปุ่ม approve/reject ด้านล่างเขียน tb_payment (เปลี่ยนสถานะ + stamp adminid)
          </p>
        </div>
        <Link href="/admin/yuan-payments" className="text-xs text-primary-600 hover:underline">
          ← รายการ
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <KV label="ลูกค้า" value={`${customerName} (${row.userid})`} />
        <KV label="โทร · อีเมล" value={`${user?.userTel ?? "-"} · ${user?.userEmail ?? "-"}`} />
        <KV
          label="ยอดหยวน (¥)"
          value={`¥${Number(row.payyuan ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV label="เรท" value={String(row.payrate ?? 0)} mono />
        <KV
          label="ยอดโอน (THB)"
          value={`฿${Number(row.paythb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV
          label="ทุน (THB)"
          value={`฿${Number(row.paythbcost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV
          label="กำไร (THB)"
          value={`฿${Number(row.payprofitthb ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        {row.paydetail ? <KV label="รายละเอียดผู้รับ" value={row.paydetail} /> : null}
        <KV
          label="วันที่สร้าง"
          value={row.paydate ? new Date(row.paydate).toLocaleString("th-TH") : "-"}
        />
        <KV
          label="วันที่อนุมัติ"
          value={row.paydateadmin ? new Date(row.paydateadmin).toLocaleString("th-TH") : "-"}
        />
        {row.adminid ? <KV label="ผู้อนุมัติ" value={row.adminid} mono /> : null}
      </div>

      {slipUrl && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <p className="text-xs font-semibold text-muted mb-2">สลิป (ลูกค้าอัปโหลด)</p>
          <a
            href={slipUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slipUrl} alt="สลิป" className="max-w-full max-h-[600px]" />
          </a>
          <p className="text-xs text-muted mt-2 break-all">{row.imagesslip}</p>
        </div>
      )}

      {slipAdminUrl && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <p className="text-xs font-semibold text-muted mb-2">สลิป (แอดมินอัปโหลด)</p>
          <a
            href={slipAdminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slipAdminUrl} alt="สลิปแอดมิน" className="max-w-full max-h-[600px]" />
          </a>
          <p className="text-xs text-muted mt-2 break-all">{row.imagesslipadmin}</p>
        </div>
      )}

      {/* P0-11 — actions row. YuanPaymentActions is the same client island
          the table-list bulk-bar uses (renders different buttons per
          rebuilt-string status: pending → เริ่มโอน/ปฏิเสธ; processing →
          โอนสำเร็จ/ล้มเหลว; non-terminal → คืนเงิน w/ slip modal). The
          underlying adminUpdateYuanPayment action writes tb_payment per
          the legacy paystatus flow (verified actions/admin/yuan-payments.ts:73). */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-50/5 p-5">
        <p className="text-xs font-semibold text-primary-700 mb-2">การดำเนินการ</p>
        <YuanPaymentActions
          id={String(row.id)}
          status={pacredStatus}
          yuan_amount={Number(row.payyuan ?? 0)}
          thb_amount={Number(row.paythb ?? 0)}
          member_code={row.userid}
          customer_name={customerName}
          phone={user?.userTel ?? null}
          paid_via_wallet={paidViaWallet}
        />
      </div>

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/yuan-payments"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการ
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

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
