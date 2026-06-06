/**
 * /billing-run/[id] — customer-side ใบวางบิลรายการเดียว (R-2)
 *
 * Per AGENTS.md §0e — strictly gated: the customer can only see their OWN
 * invoice. Tries `userid === profile.member_code` match BEFORE rendering.
 *
 * Surface area:
 *   - Header card (status · doc no · dates · amount)
 *   - Line items table (one row per forwarder)
 *   - Note from staff
 *   - Print link (opens /print page in new tab · uses browser Print)
 */

import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function CustomerBillingRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();

  if (!profile.member_code) notFound();

  const admin = createAdminClient();

  type HeaderRaw = {
    id: number;
    doc_no: string;
    userid: string;
    buyer_name: string;
    buyer_tax_id: string;
    buyer_address: string;
    buyer_branch: string;
    is_juristic: boolean;
    date_issued: string;
    date_due: string;
    subtotal_thb: number | string;
    delivery_chn_thb: number | string;
    delivery_th_thb: number | string;
    other_thb: number | string;
    discount_thb: number | string;
    total_thb: number | string;
    status: "issued" | "paid" | "cancelled";
    note_for_customer: string;
    paid_at: string | null;
    payment_method: string | null;
    payment_reference: string | null;
  };
  const { data: hdrRaw, error: hdrErr } = await admin
    .from("tb_forwarder_invoice")
    .select(
      "id, doc_no, userid, buyer_name, buyer_tax_id, buyer_address, buyer_branch, is_juristic, " +
      "date_issued, date_due, subtotal_thb, delivery_chn_thb, delivery_th_thb, other_thb, " +
      "discount_thb, total_thb, status, note_for_customer, paid_at, payment_method, payment_reference",
    )
    .eq("id", invoiceId)
    .maybeSingle<HeaderRaw>();
  if (hdrErr) {
    console.error("[/billing-run/[id] customer detail] failed", {
      code: hdrErr.code, message: hdrErr.message, invoiceId,
    });
    throw new Error(hdrErr.message);
  }
  if (!hdrRaw) notFound();

  // §0e guard: customer can ONLY see their own invoice
  if (hdrRaw.userid !== profile.member_code) notFound();

  type ItemRaw = { id: number; forwarder_id: number; amount_thb: number | string };
  const { data: itemsRaw, error: itemsErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("id, forwarder_id, amount_thb")
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });
  if (itemsErr) {
    console.error("[/billing-run/[id] customer items] failed", {
      code: itemsErr.code, message: itemsErr.message, invoiceId,
    });
  }
  const items = ((itemsRaw ?? []) as ItemRaw[]);

  // Hydrate forwarder track for the customer
  const fids = items.map((i) => i.forwarder_id);
  type FwdRow = {
    id: number;
    ftrackingchn: string | null;
    famount: number | string | null;
    fweight: number | string | null;
    fvolume: number | string | null;
    fdate: string | null;
  };
  const fwdByID = new Map<number, FwdRow>();
  if (fids.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, famount, fweight, fvolume, fdate")
      .in("id", fids);
    if (fwdErr) {
      console.error("[/billing-run/[id] customer forwarder hydrate] failed", {
        code: fwdErr.code, message: fwdErr.message,
      });
    }
    for (const f of ((fwdRaw ?? []) as FwdRow[])) {
      fwdByID.set(f.id, f);
    }
  }

  const isOverdue = hdrRaw.status === "issued" && hdrRaw.date_due < isoToday();

  return (
    <main className="p-4 md:p-6 lg:p-5 space-y-4">
      <title>{`ใบวางบิล ${hdrRaw.doc_no} | Pacred`}</title>

      <Link href="/billing-run" className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline inline-block">
        ← กลับหน้ารายการ
      </Link>

      {/* Status banner */}
      {hdrRaw.status === "issued" && isOverdue && (
        <section className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-red-800">⚠️ เลยกำหนดชำระแล้ว</p>
              <p className="text-xs text-red-700 mt-0.5">ครบกำหนด {hdrRaw.date_due} · กรุณาชำระโดยเร็ว</p>
            </div>
          </div>
        </section>
      )}

      {hdrRaw.status === "issued" && !isOverdue && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-800">รอชำระเงิน</p>
          <p className="text-xs text-amber-700 mt-0.5">ครบกำหนด {hdrRaw.date_due}</p>
        </section>
      )}

      {hdrRaw.status === "paid" && (
        <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-800">✓ ชำระเรียบร้อยแล้ว</p>
          {hdrRaw.paid_at && (
            <p className="text-xs text-emerald-700 mt-0.5">
              ชำระเมื่อ {hdrRaw.paid_at.slice(0, 10)} · {hdrRaw.payment_method}
              {hdrRaw.payment_reference && ` (${hdrRaw.payment_reference})`}
            </p>
          )}
        </section>
      )}

      {hdrRaw.status === "cancelled" && (
        <section className="rounded-2xl border border-stone-300 bg-stone-50 p-4">
          <p className="font-bold text-stone-700">✕ ใบวางบิลนี้ถูกยกเลิก</p>
        </section>
      )}

      {/* Doc header */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted">เลขที่เอกสาร</div>
            <div className="text-2xl font-bold font-mono">{hdrRaw.doc_no}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">ยอดเงิน</div>
            <div className="text-2xl font-bold text-amber-700">฿{thbFmt(Number(hdrRaw.total_thb))}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">
          <div>
            <div className="text-xs text-muted">วันที่ออก</div>
            <div>{hdrRaw.date_issued}</div>
          </div>
          <div>
            <div className="text-xs text-muted">ครบกำหนดชำระ</div>
            <div className={isOverdue ? "text-red-600 font-medium" : ""}>{hdrRaw.date_due}</div>
          </div>
        </div>
      </section>

      {/* Line items */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="p-3 md:p-4 border-b border-border">
          <h3 className="font-bold text-sm">รายการฝากนำเข้า ({items.length} รายการ)</h3>
        </div>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/60 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
                <th className="px-3 py-2 text-left">รหัสพัสดุ</th>
                <th className="px-3 py-2 text-right">กล่อง</th>
                <th className="px-3 py-2 text-right">น้ำหนัก</th>
                <th className="px-3 py-2 text-right">CBM</th>
                <th className="px-3 py-2 text-right">ค่าขนส่ง (฿)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const f = fwdByID.get(it.forwarder_id);
                return (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2.5 font-mono text-xs">#{it.forwarder_id}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{f?.ftrackingchn ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">{f?.famount ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">{f?.fweight ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">{f?.fvolume ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{thbFmt(Number(it.amount_thb))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Total breakdown */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-sm">
        <h3 className="font-bold text-sm mb-3">สรุปยอดเงิน</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted">ค่าขนส่งรายการ</span><span>฿{thbFmt(Number(hdrRaw.subtotal_thb))}</span></div>
          {Number(hdrRaw.delivery_chn_thb) > 0 && <div className="flex justify-between"><span className="text-muted">+ ค่าขนส่งจีน</span><span>฿{thbFmt(Number(hdrRaw.delivery_chn_thb))}</span></div>}
          {Number(hdrRaw.delivery_th_thb) > 0 && <div className="flex justify-between"><span className="text-muted">+ ค่าขนส่งไทย</span><span>฿{thbFmt(Number(hdrRaw.delivery_th_thb))}</span></div>}
          {Number(hdrRaw.other_thb) > 0 && <div className="flex justify-between"><span className="text-muted">+ อื่นๆ</span><span>฿{thbFmt(Number(hdrRaw.other_thb))}</span></div>}
          {Number(hdrRaw.discount_thb) > 0 && <div className="flex justify-between text-red-600"><span>− ส่วนลด</span><span>−฿{thbFmt(Number(hdrRaw.discount_thb))}</span></div>}
          <hr className="border-border my-2" />
          <div className="flex justify-between font-bold text-base">
            <span>รวมทั้งสิ้น</span>
            <span className="text-amber-700">฿{thbFmt(Number(hdrRaw.total_thb))}</span>
          </div>
        </div>
      </section>

      {/* Note */}
      {hdrRaw.note_for_customer && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <h3 className="font-bold text-sm mb-2 text-amber-800">หมายเหตุจากบริษัท</h3>
          <p className="text-sm whitespace-pre-wrap">{hdrRaw.note_for_customer}</p>
        </section>
      )}
    </main>
  );
}
