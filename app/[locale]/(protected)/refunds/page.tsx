import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { LINE_OA } from "@/components/seo/site";
import { ArrowRightLeft, ChevronRight, Home, MessageCircle, History } from "lucide-react";
import {
  REFUND_SOURCE_LABEL,
  REFUND_STATUS_LABEL,
  type RefundSource,
  type RefundStatus,
} from "@/lib/validators/refund";
import { RefundRequestForm, type SourceOption } from "./refund-request-form";

/**
 * U1-6 — /refunds customer hub.
 *
 * Read-only view of OWN refund_requests (any status, ordered newest first)
 * + form to create a new request from forwarder / service_order / yuan_payment.
 *
 * RLS scopes the list to profile_id = auth.uid().
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<RefundStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
};

type RefundRow = {
  id:           string;
  request_no:   string;
  source:       RefundSource;
  source_ref:   string | null;
  amount_thb:   number;
  reason:       string;
  status:       RefundStatus;
  created_at:   string;
  approved_at:  string | null;
  rejected_at:  string | null;
  paid_at:      string | null;
  rejected_reason: string | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function CustomerRefundsHubPage() {
  const { profile } = await requireAuth();
  const sb = await createClient();
  const memberCode = profile?.member_code ?? null;

  // ── Own refund_requests (RLS-filtered to profile_id = auth.uid()) ──
  const { data: refundsRaw, error: refundsRawErr } = await sb
    .from("refund_requests")
    .select(
      "id, request_no, source, source_ref, amount_thb, reason, status, created_at, approved_at, rejected_at, paid_at, rejected_reason",
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<RefundRow[]>();
  if (refundsRawErr) {
    console.error(`[refund_requests list] failed`, { code: refundsRawErr.code, message: refundsRawErr.message });
  }
  const refunds = refundsRaw ?? [];

  // ── Source options for the form's type-ahead picker ──
  // Surface the customer's PAID/refundable parents from the LIVE legacy tb_*
  // schema (the rebuilt forwarders/service_orders/yuan_payments twins are
  // 0-row). tb_* is service_role-locked → read via the admin client, scoped by
  // member_code. Only "ever paid" parents appear (the action re-checks at
  // submit): forwarder fstatus 6,7 (ชำระแล้ว/ส่งแล้ว) · order hstatus 3,4,5
  // (post-payment) · yuan all (THB is wallet-debited at submit). The picker
  // `value` is exactly the source_ref the action expects (fno / hno /
  // String(tb_payment.id)).
  let sourceOptions: SourceOption[] = [];
  if (memberCode) {
    const admin = createAdminClient();
    const [{ data: fwdsRaw }, { data: ordersRaw }, { data: yuansRaw }] = await Promise.all([
      admin.from("tb_forwarder")
        .select("id, fcabinetnumber, fstatus, fdate")
        .eq("userid", memberCode)
        .in("fstatus", ["6", "7"])
        .order("fdate", { ascending: false })
        .limit(50),
      admin.from("tb_header_order")
        .select("hno, hstatus, hdate")
        .eq("userid", memberCode)
        .in("hstatus", ["3", "4", "5"])
        .order("hdate", { ascending: false })
        .limit(50),
      admin.from("tb_payment")
        .select("id, paystatus, payyuan, paythb, paydate")
        .eq("userid", memberCode)
        .order("paydate", { ascending: false })
        .limit(50),
    ]);

    sourceOptions = [
      ...(((fwdsRaw ?? []) as Array<{ id: number; fcabinetnumber: string | null; fstatus: string | null }>).map((f) => ({
        source: "forwarder" as const,
        value:  String(f.id),
        label:  `ฝากนำเข้า #${f.id}${f.fcabinetnumber ? ` · ตู้ ${f.fcabinetnumber}` : ""} (สถานะ ${f.fstatus ?? "—"})`,
      }))),
      ...(((ordersRaw ?? []) as Array<{ hno: string; hstatus: string | null }>).map((o) => ({
        source: "service_order" as const,
        value:  o.hno,
        label:  `${o.hno} (สถานะ ${o.hstatus ?? "—"})`,
      }))),
      ...(((yuansRaw ?? []) as Array<{ id: number; paystatus: string | null; payyuan: number | null; paythb: number | null }>).map((y) => ({
        source: "yuan_payment" as const,
        value:  String(y.id),
        label:  `#${y.id} · ¥${y.payyuan ?? "—"} → ${thb(Number(y.paythb ?? 0))}`,
      }))),
    ];
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" /> หน้าแรก
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">ขอคืนเงิน</span>
        </nav>

        {/* Page header */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600">
                <ArrowRightLeft className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">ขอคืนเงิน (Refund)</h1>
                <p className="text-xs text-muted mt-0.5">
                  ขอคืนเงินจากออเดอร์ฝากนำเข้า / ฝากสั่ง / ฝากโอนหยวน ของคุณ
                </p>
              </div>
            </div>
            <a
              href={LINE_OA.addFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-green-500 text-white px-3 py-2 text-xs sm:text-sm font-bold hover:bg-green-600 inline-flex items-center gap-1.5 shadow-sm"
            >
              <MessageCircle className="w-4 h-4" /> ติดต่อทีมเพื่อขอ refund แบบอื่น
            </a>
          </div>
          <p className="mt-3 text-xs text-muted leading-relaxed">
            เลือกออเดอร์ที่จะขอคืนเงิน + ระบุยอดและเหตุผล ≥ 10 ตัวอักษร
            ทีม Pacred จะตรวจสอบและคืนเงินเข้ากระเป๋าหลักของคุณภายใน 1-3 วันทำการ
          </p>
        </div>

        {/* Request form */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary-600" /> ขอคืนเงินใหม่
          </h2>
          {sourceOptions.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm text-amber-800 space-y-2">
              <p className="font-semibold">ยังไม่มีออเดอร์ที่ขอคืนเงินได้</p>
              <p className="text-xs">
                ระบบจะแสดงเฉพาะออเดอร์ที่ <strong>ชำระแล้ว</strong> (ฝากนำเข้า/ฝากสั่ง/ฝากโอน) —
                เริ่มต้นใช้บริการก่อน หรือ{" "}
                <a
                  href={LINE_OA.addFriendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-900"
                >
                  ติดต่อทีมเพื่อขอ refund แบบ manual
                </a>
              </p>
            </div>
          ) : (
            <RefundRequestForm sourceOptions={sourceOptions} />
          )}
        </section>

        {/* History */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-sm inline-flex items-center gap-2">
              <History className="w-4 h-4 text-primary-600" /> ประวัติคำขอคืนเงิน ({refunds.length})
            </h2>
          </div>
          {refunds.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="text-4xl" aria-hidden>💸</div>
              <p className="text-sm font-medium text-foreground">ยังไม่มีคำขอคืนเงิน</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                เมื่อมีปัญหาเรื่องสินค้าหรือยอด — ส่งคำขอที่ฟอร์มด้านบน
                ทีมจะตรวจสอบและคืนเงินเข้ากระเป๋าให้ภายใน 1-3 วันทำการ
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">แหล่ง</th>
                  <th className="px-3 py-2 text-right">ยอดคืน</th>
                  <th className="px-3 py-2">เหตุผล</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs">{r.request_no}</td>
                    <td className="px-3 py-2 text-xs">
                      <p>{REFUND_SOURCE_LABEL[r.source]}</p>
                      {r.source_ref && (
                        <p className="font-mono text-[10px] text-muted">{r.source_ref.slice(0, 24)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-700">
                      {thb(Number(r.amount_thb))}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted max-w-xs">
                      <p className="line-clamp-2" title={r.reason}>{r.reason}</p>
                      {r.status === "rejected" && r.rejected_reason && (
                        <p className="mt-1 text-red-600">
                          <b>เหตุผลปฏิเสธ:</b> {r.rejected_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}>
                        {REFUND_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      <p>ส่ง: {new Date(r.created_at).toLocaleDateString("th-TH")}</p>
                      {r.paid_at && (
                        <p className="text-green-700">จ่าย: {new Date(r.paid_at).toLocaleDateString("th-TH")}</p>
                      )}
                      {r.rejected_at && (
                        <p className="text-red-600">ปฏิเสธ: {new Date(r.rejected_at).toLocaleDateString("th-TH")}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Contact CTA */}
        <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-5">
          <p className="text-sm font-medium text-green-900">ต้องการคืนเงินกรณีอื่น (ไม่อยู่ในออเดอร์ของคุณ)?</p>
          <p className="text-xs text-green-800 mt-1">
            เช่น ค่าบริการที่ยังไม่ได้ผูกกับออเดอร์ — แจ้งทีม Pacred ทาง LINE OA
            พร้อมแนบรายละเอียดและสลิป ทีมจะสร้าง refund-request แทนคุณ
          </p>
          <a
            href={LINE_OA.addFriendUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-bold hover:bg-green-700"
          >
            <MessageCircle className="w-4 h-4" /> ติดต่อทีม Pacred
          </a>
        </div>
      </main>
    </>
  );
}
