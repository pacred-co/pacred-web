/**
 * /admin/sales-payouts/[id] — the FAITHFUL payout detail + pay-out form
 * (P0-23 · ADR-0020).
 *
 * REPOINTED 2026-05-31 from the DEAD rebuilt `sales_payouts` table onto the
 * legacy `tb_user_sales_admin_pay` family via `getSalesPayoutDetailTb()`.
 *
 * Faithful to `pcs-admin/report-user-sales-history.php` DETAIL mode
 * (L198-330): the payout header (bank-transfer fields + the customer's
 * ID-card file) + the linked forwarder rows (via tb_user_sales_pay →
 * tb_user_sales → tb_forwarder) + the commission summary. When the payout is
 * still pending (status=='2') the slip-upload pay form is shown (L259-287); a
 * paid payout (status=='3') shows the read-only slip (L291-315).
 *
 * Reachable from: the /admin/sales-payouts queue (row → "แก้ไขข้อมูลและดูรายละเอียด").
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { Link } from "@/i18n/navigation";
import { getSalesPayoutDetailTb } from "@/actions/admin/sales-payouts-tb";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { SalesPayoutPayForm } from "./pay-form";

export const dynamic = "force-dynamic";

// tb_forwarder.fstatus '1'..'7' (legacy L362-370).
const FSTATUS: Record<string, { label: string; cls: string }> = {
  "1": { label: "รอสินค้าเข้าโกดังจีน", cls: "bg-red-50 text-red-700 border-red-200" },
  "2": { label: "สินค้าถึงโกดังจีนแล้ว", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  "3": { label: "กำลังส่งมาประเทศไทย", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  "4": { label: "สินค้าถึงประเทศไทยแล้ว", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "5": { label: "รอชำระเงิน", cls: "bg-red-50 text-red-700 border-red-200" },
  "6": { label: "เตรียมส่ง", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "7": { label: "ส่งแล้ว", cls: "bg-green-50 text-green-700 border-green-200" },
};
// tb_user_sales.usstatus '1'/'2' (legacy L371-374).
const USSTATUS: Record<string, { label: string; cls: string }> = {
  "1": { label: "ยังไม่เบิกจ่าย", cls: "bg-red-50 text-red-700 border-red-200" },
  "2": { label: "เบิกจ่ายแล้ว", cls: "bg-green-50 text-green-700 border-green-200" },
};

export default async function AdminSalesPayoutDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Money-internal gate (owner 2026-06-18): commission payout amount + forwarder
  // cost (ต้นทุน) + กำไรสุทธิ + the 1%/WHT/net commission summary are visible only
  // to ultra/accounting/pricing. Selling price (ค่าฝากนำเข้าจีน) + volume/weight stay.
  const showMoney = canViewCostProfit(roles);
  const { id } = await params;

  const payoutId = Number(id);
  if (!Number.isInteger(payoutId) || payoutId <= 0) notFound();

  const res = await getSalesPayoutDetailTb(payoutId);
  if (!res.ok) {
    if (res.error === "not_found") notFound();
    throw new Error(`Failed to load sales payout #${payoutId}: ${res.error}`);
  }
  const d = res.data!;
  const isPending = d.status === "2";
  const isPaid = d.status === "3";

  // The customer's ID-card file + the paid slip (signed URLs · `slips` bucket).
  const [idCardUrl, slipUrl] = await Promise.all([
    d.file ? getSignedBucketUrl("slips", d.file) : Promise.resolve(null),
    isPaid && d.imagesSlip ? getSignedBucketUrl("slips", d.imagesSlip) : Promise.resolve(null),
  ]);

  // Commission summary (legacy L402-407): 1% of ราคาขายรวม, − 3% WHT.
  const totalSale = d.totalSalePriceCHN;
  const commission = totalSale * 0.01;
  const wht = commission * 0.03;
  const netCommission = commission - wht;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · ประวัติจ่ายเงินลูกค้าตัวแทน
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">#{d.id}</h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                isPaid
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {isPaid ? "สำเร็จ" : "รอดำเนินการ"}
            </span>
            <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs font-mono">
              {d.userIDMain}
            </span>
          </div>
        </div>
        <Link href="/admin/sales-payouts" className="text-xs text-primary-600 hover:underline">
          ← รายการ
        </Link>
      </div>

      {/* Header — bank fields + ID-card + (pay form | paid slip) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
          <KV label="ชื่อธนาคาร" value={d.nameBank || "—"} />
          <KV label="เลขที่บัญชี" value={d.noBank || "—"} mono />
          <KV label="ชื่อบัญชี" value={d.nameAccount || "—"} />
          {showMoney && (
            <KV
              label="จำนวนเงิน"
              value={`฿${Number(d.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
              mono
              danger
            />
          )}
          <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
            <span className="text-muted shrink-0">สำเนาบัตร</span>
            {idCardUrl ? (
              <a href={idCardUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                ดูไฟล์
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          {d.dateSlip && (
            <KV label="วันที่จ่าย" value={new Date(d.dateSlip).toLocaleString("th-TH")} />
          )}
          {d.adminCreate && <KV label="ผู้ทำรายการ" value={d.adminCreate} mono />}
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          {isPending ? (
            <>
              <p className="text-sm font-semibold mb-3">จ่ายเงินส่วนแบ่ง — แนบสลิป</p>
              <SalesPayoutPayForm id={d.id} />
            </>
          ) : isPaid ? (
            <>
              <p className="text-sm font-semibold mb-3">หลักฐานการโอน (จ่ายแล้ว)</p>
              {slipUrl ? (
                <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slipUrl}
                    alt="สลิปการจ่ายเงิน"
                    className="max-h-[260px] rounded-md border border-border bg-white object-contain"
                  />
                </a>
              ) : (
                <p className="text-sm text-muted">ไม่มีไฟล์สลิป</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">สถานะรายการ: {d.status}</p>
          )}
        </div>
      </div>

      {/* Linked forwarder rows (legacy L320-410). */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">รายการนำเข้าจีนที่เบิกส่วนแบ่ง</p>
        </div>
        {d.forwarders.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ไม่มีรายการที่เชื่อมโยง</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">รายละเอียด</th>
                  <th className="px-3 py-2">เลขแทรคกิ้ง</th>
                  <th className="px-3 py-2 text-right">ปริมาตร(CBM)</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก(Kg)</th>
                  {showMoney && <th className="px-3 py-2 text-right">ต้นทุนนำเข้าจีน</th>}
                  <th className="px-3 py-2 text-right">ค่าฝากนำเข้าจีน</th>
                  {showMoney && <th className="px-3 py-2 text-right">กำไรสุทธิ</th>}
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">สถานะเบิก</th>
                </tr>
              </thead>
              <tbody>
                {d.forwarders.map((f) => {
                  const fs = f.fStatus ? FSTATUS[f.fStatus] : null;
                  const us = f.usStatus ? USSTATUS[f.usStatus] : null;
                  return (
                    <tr key={f.usId} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        {f.forwarderId ? (
                          <Link
                            href={`/admin/forwarders/${f.forwarderId}`}
                            className="text-primary-600 hover:underline"
                          >
                            {f.fDetail ?? `#${f.forwarderId}`}
                          </Link>
                        ) : (
                          <span>{f.fDetail ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{f.fTrackingCHN ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{f.fVolume.toLocaleString("en-US", { minimumFractionDigits: 5 })}</td>
                      <td className="px-3 py-2 text-right font-mono">{f.fWeight.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      {showMoney && <td className="px-3 py-2 text-right font-mono">{f.fCostTotalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>}
                      <td className="px-3 py-2 text-right font-mono">{f.fTotalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      {showMoney && <td className="px-3 py-2 text-right font-mono">{f.netProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>}
                      <td className="px-3 py-2">
                        {fs ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${fs.cls}`}>{fs.label}</span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {us ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${us.cls}`}>{us.label}</span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Commission summary — legacy L400-409 (money-internal: 1%/WHT/net). */}
        {showMoney && (
          <div className="border-t border-border px-4 py-4 text-right space-y-1 text-sm">
            <p className="font-semibold">ค่าขนส่งจีน</p>
            <p>ราคาขายรวม : {totalSale.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท</p>
            <hr className="my-2 border-border/60" />
            <p>ส่วนแบ่ง 1% : {commission.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท</p>
            <p>หักภาษี 3% : {wht.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท</p>
            <p className="font-semibold">
              ส่วนแบ่งสุทธิ : <span className="text-red-700">{netCommission.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> บาท
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/sales-payouts"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการ
        </Link>
      </div>
    </main>
  );
}

function KV({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={[mono ? "font-mono" : "", danger ? "text-red-700 font-bold" : "", "text-right"].join(" ")}>
        {value}
      </span>
    </div>
  );
}
