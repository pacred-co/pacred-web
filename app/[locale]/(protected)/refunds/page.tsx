import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
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
  await requireAuth();
  const sb = await createClient();

  // ── Own refund_requests (RLS-filtered to profile_id = auth.uid()) ──
  const { data: refundsRaw } = await sb
    .from("refund_requests")
    .select(
      "id, request_no, source, source_ref, amount_thb, reason, status, created_at, approved_at, rejected_at, paid_at, rejected_reason",
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<RefundRow[]>();
  const refunds = refundsRaw ?? [];

  // ── Source options for the form's type-ahead picker ──
  // Surface user's own forwarders + service_orders + yuan_payments so they
  // can pick a parent ref by f_no / h_no / id with a label. RLS scopes
  // each list to their own.
  const [{ data: fwdsRaw }, { data: ordersRaw }, { data: yuansRaw }] = await Promise.all([
    sb.from("forwarders")
      .select("f_no, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("service_orders")
      .select("h_no, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("yuan_payments")
      .select("id, status, yuan_amount, thb_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const sourceOptions: SourceOption[] = [
    ...(((fwdsRaw ?? []) as Array<{ f_no: string; status: string; created_at: string }>).map((f) => ({
      source: "forwarder" as const,
      value:  f.f_no,
      label:  `${f.f_no} (${f.status})`,
    }))),
    ...(((ordersRaw ?? []) as Array<{ h_no: string; status: string; created_at: string }>).map((o) => ({
      source: "service_order" as const,
      value:  o.h_no,
      label:  `${o.h_no} (${o.status})`,
    }))),
    ...(((yuansRaw ?? []) as Array<{ id: string; status: string; yuan_amount: number; thb_amount: number; created_at: string }>).map((y) => ({
      source: "yuan_payment" as const,
      value:  y.id,
      label:  `${y.id.slice(0, 8)}… (${y.status}) · ¥${y.yuan_amount} → ${thb(y.thb_amount)}`,
    }))),
  ];

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
            <p className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm text-amber-800">
              ยังไม่มีออเดอร์ที่จะขอคืนเงิน — เริ่มต้นใช้บริการก่อน
              หรือ{" "}
              <a
                href={LINE_OA.addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-900"
              >
                ติดต่อทีมเพื่อขอ refund แบบ manual
              </a>
            </p>
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
            <p className="p-8 text-center text-sm text-muted">
              ยังไม่มีคำขอคืนเงิน — สร้างใหม่ที่ฟอร์มด้านบน
            </p>
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
      <Footer />
    </>
  );
}
