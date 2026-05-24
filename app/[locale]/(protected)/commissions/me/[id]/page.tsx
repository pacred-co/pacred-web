import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminRoles } from "@/lib/auth/require-admin";
import {
  WITHDRAWAL_STATUS_LABEL,
  SOURCE_KIND_LABEL,
  type WithdrawalStatus,
  type SourceKind,
} from "@/lib/validators/commission";

/**
 * V-E8/H1/H2 — /commissions/me/[id] (staff-side withdrawal detail).
 *
 * AUDIT-FOLLOWUP (Agent F MED #2): staff couldn't view own past withdrawal
 * detail — the history-list link on /commissions/me pointed to the admin-
 * gated /admin/commissions/[id] which 404'd for non-admin roles.
 *
 * This route is the staff-side READ-ONLY detail. RLS on commission_withdrawals
 * already scopes to earner_admin_id = auth.uid() for the staff (interpreter /
 * sales_admin) role, so the SELECT below silently returns null if the
 * customer is browsing someone else's withdrawal id.
 *
 * No mutations — staff can only view. Admin actions (approve/reject/mark-paid)
 * live on the admin detail page.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<WithdrawalStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const ELIGIBLE_ROLES = new Set(["interpreter", "sales_admin", "super"]);

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type WithdrawalDetail = {
  id:                  string;
  withdrawal_no:       string;
  status:              WithdrawalStatus;
  title:               string;
  notes:               string | null;
  earner_admin_id:     string;
  gross_thb:           number;
  wht_rate_pct:        number;
  wht_amount_thb:      number;
  net_thb:             number;
  payee_bank_name:     string | null;
  payee_account_name:  string | null;
  payee_account_no:    string | null;
  requested_at:        string;
  approved_at:         string | null;
  paid_at:             string | null;
  rejected_at:         string | null;
  rejected_reason:     string | null;
  slip_storage_path:   string | null;
  created_at:          string;
};

type ItemRow = {
  id:                       string;
  commission_accrual_id:    string;
  included_amount_thb:      number;
  accrual: {
    source_kind:        SourceKind;
    source_ref:         string;
    base_thb:           number;
    accrued_amount_thb: number;
    accrued_at:         string;
  } | { source_kind: SourceKind; source_ref: string; base_thb: number; accrued_amount_thb: number; accrued_at: string }[] | null;
};

export default async function MyWithdrawalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireAuth();
  const roles = await getAdminRoles();
  if (!roles || !roles.some((r) => ELIGIBLE_ROLES.has(r))) {
    redirect("/dashboard");
  }
  const { id } = await params;

  // RLS-scoped read: customer/non-earner attempts will get null.
  const supabase = await createClient();
  const { data: w } = await supabase
    .from("commission_withdrawals")
    .select(`
      id, withdrawal_no, status, title, notes, earner_admin_id,
      gross_thb, wht_rate_pct, wht_amount_thb, net_thb,
      payee_bank_name, payee_account_name, payee_account_no,
      requested_at, approved_at, paid_at, rejected_at, rejected_reason,
      slip_storage_path, created_at
    `)
    .eq("id", id)
    .maybeSingle<WithdrawalDetail>();

  if (!w) notFound();
  if (w.earner_admin_id !== user.id) {
    // Defense-in-depth: RLS already scopes, but reject explicitly.
    notFound();
  }

  // Bundled accrual items (RLS-scoped).
  const { data: itemsRaw } = await supabase
    .from("commission_withdrawal_items")
    .select(`
      id, commission_accrual_id, included_amount_thb,
      accrual:commission_accruals!commission_accrual_id (
        source_kind, source_ref, base_thb, accrued_amount_thb, accrued_at
      )
    `)
    .eq("commission_withdrawal_id", id);
  const items = ((itemsRaw ?? []) as ItemRow[]).map((it) => {
    const acc = Array.isArray(it.accrual) ? it.accrual[0] ?? null : it.accrual;
    return { ...it, accrual: acc };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/commissions/me" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้าค่าคอม
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            คำขอเบิก <span className="font-mono">{w.withdrawal_no}</span>
          </h1>
          <p className="text-xs text-muted">
            ขอเมื่อ {new Date(w.requested_at).toLocaleString("th-TH")}
            {w.approved_at && <> · อนุมัติ {new Date(w.approved_at).toLocaleString("th-TH")}</>}
            {w.paid_at     && <> · จ่าย {new Date(w.paid_at).toLocaleString("th-TH")}</>}
            {w.rejected_at && <> · ปฏิเสธ {new Date(w.rejected_at).toLocaleString("th-TH")}</>}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[w.status]}`}>
          {WITHDRAWAL_STATUS_LABEL[w.status]}
        </span>
      </div>

      {/* Rejected reason banner */}
      {w.status === "rejected" && w.rejected_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>ปฏิเสธ:</strong> {w.rejected_reason}
          <p className="text-xs text-muted mt-1">
            (รายการสะสมถูกปล่อยกลับเข้ารายการรอเบิก — ลองยื่นใหม่ได้)
          </p>
        </div>
      )}

      {/* Title + notes */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
        <h2 className="font-bold text-sm mb-1">{w.title}</h2>
        {w.notes && <p className="text-xs whitespace-pre-line">{w.notes}</p>}
      </section>

      {/* Amounts */}
      <section className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
        <h2 className="font-bold text-sm mb-3">💰 ยอดเบิก</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-muted">ยอดรวม (Gross)</td>
              <td className="py-1 text-right font-mono">{thb(Number(w.gross_thb))}</td>
            </tr>
            {Number(w.wht_amount_thb) > 0 && (
              <tr>
                <td className="py-1 text-amber-700">หัก ภาษี ณ ที่จ่าย {Number(w.wht_rate_pct)}%</td>
                <td className="py-1 text-right font-mono text-amber-700">
                  −{thb(Number(w.wht_amount_thb))}
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-black font-bold text-base">
              <td className="py-2">ยอดสุทธิ (Net)</td>
              <td className="py-2 text-right font-mono text-primary-700">{thb(Number(w.net_thb))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Payee bank */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1 text-xs">
        <h2 className="font-bold text-sm mb-2">บัญชีรับเงิน</h2>
        <p>ธนาคาร: <strong>{w.payee_bank_name ?? "—"}</strong></p>
        <p>ชื่อบัญชี: {w.payee_account_name ?? "—"}</p>
        <p>เลขที่บัญชี: <span className="font-mono">{w.payee_account_no ?? "—"}</span></p>
      </section>

      {/* Bundled accrual items */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">รายการสะสมที่รวมในคำขอนี้ ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted">
            ไม่มีรายการ (อาจถูกปล่อยออกแล้วเพราะคำขอ rejected)
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">ที่มา</th>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">ค่าคอม</th>
                <th className="px-3 py-2">เกิดเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs">
                    {it.accrual ? SOURCE_KIND_LABEL[it.accrual.source_kind] : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{it.accrual?.source_ref ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {it.accrual ? thb(Number(it.accrual.base_thb)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                    {thb(Number(it.included_amount_thb))}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {it.accrual ? new Date(it.accrual.accrued_at).toLocaleDateString("th-TH") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Paid slip download (if paid + slip uploaded by admin) */}
      {w.status === "paid" && w.slip_storage_path && (
        <section className="rounded-2xl border border-green-200 bg-green-50/40 p-5 space-y-2">
          <h2 className="font-bold text-sm">📎 หลักฐานการจ่าย</h2>
          <p className="text-xs">Pacred ได้จ่ายค่าคอมเรียบร้อย — ติดต่อแอดมินหากต้องการสำเนาสลิป</p>
          <p className="text-[10px] text-muted">เก็บที่: <span className="font-mono">{w.slip_storage_path}</span></p>
        </section>
      )}

      {/* PDF download */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <h2 className="font-bold text-sm mb-2">📄 ใบสำคัญรับเงินค่าคอม</h2>
        <a
          href={`/api/commission-withdrawal/${w.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
        >
          ⬇️ ดาวน์โหลด PDF
          {Number(w.wht_amount_thb) > 0 && " (มีใบ 50 ทวิ)"}
        </a>
        <p className="mt-2 text-[10px] text-muted">
          {Number(w.wht_amount_thb) > 0
            ? "ใบสำคัญฯ มีแนบใบรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ด้านในเอกสาร"
            : "ยอดไม่ถึงเกณฑ์หัก ณ ที่จ่าย — ไม่มีใบ 50 ทวิ"}
        </p>
      </section>

      <p className="text-[10px] text-muted">
        💡 รายการนี้เป็น read-only — ติดต่อ super/accounting หากต้องการแก้ไข
      </p>
    </main>
  );
}
