import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminRoles } from "@/lib/auth/require-admin";
import {
  WITHDRAWAL_STATUS_LABEL,
  ROLE_KIND_LABEL,
  SOURCE_KIND_LABEL,
  MIN_WITHDRAWAL_THB,
  type WithdrawalStatus,
  type RoleKind,
  type SourceKind,
} from "@/lib/validators/commission";
import { RequestWithdrawalClient, type AccrualOption } from "./request-withdrawal-client";

/**
 * V-E8/H1/H2 — /commissions/me (staff self-serve commission portal).
 *
 * Eligible staff (interpreter / sales_admin / super) sees:
 *   - own unpaid balance + per-source breakdown
 *   - "Request withdrawal" form when total ≥ MIN_WITHDRAWAL_THB
 *   - history of past withdrawals
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<WithdrawalStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

type AccrualRow = {
  id:                  string;
  role_kind:           RoleKind;
  source_kind:         SourceKind;
  source_ref:          string;
  base_thb:            number;
  accrued_amount_thb:  number;
  accrued_at:          string;
};

type WithdrawalRow = {
  id:             string;
  withdrawal_no:  string;
  status:         WithdrawalStatus;
  title:          string;
  gross_thb:      number;
  net_thb:        number;
  requested_at:   string;
  paid_at:        string | null;
};

const ELIGIBLE_ROLES = new Set(["interpreter", "sales_admin", "super"]);

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function MyCommissionsPage() {
  const { user } = await requireAuth();
  const roles = await getAdminRoles();
  if (!roles || !roles.some((r) => ELIGIBLE_ROLES.has(r))) {
    // Non-eligible profiles get sent home — commission portal is staff-only.
    redirect("/dashboard");
  }

  // AUDIT-FOLLOWUP (Agent F LOW #3) — use RLS-scoped client. The
  // commission_accruals RLS already enforces earner_admin_id = auth.uid()
  // for the staff role, so the explicit `.eq("earner_admin_id", user.id)`
  // filter below becomes defense-in-depth.
  const supabase = await createClient();

  // ── Unpaid accruals (own) ──
  const { data: accrualsRaw, error: accrualsRawErr } = await supabase
    .from("commission_accruals")
    .select("id, role_kind, source_kind, source_ref, base_thb, accrued_amount_thb, accrued_at")
    .eq("earner_admin_id", user.id)
    .is("withdrawal_item_id", null)
    .order("accrued_at", { ascending: false })
    .limit(500);
  if (accrualsRawErr) {
    console.error(`[commission_accruals list] failed`, { code: accrualsRawErr.code, message: accrualsRawErr.message });
  }
  const accruals = (accrualsRaw ?? []) as AccrualRow[];

  const unpaidTotal = accruals.reduce((s, a) => s + Number(a.accrued_amount_thb), 0);
  const canRequest = unpaidTotal >= MIN_WITHDRAWAL_THB;

  // Group accrual count by source_kind for the summary cards
  const byKind: Record<SourceKind, { count: number; total: number }> = {
    service_order: { count: 0, total: 0 },
    forwarder:     { count: 0, total: 0 },
    freight_quote: { count: 0, total: 0 },
  };
  for (const a of accruals) {
    byKind[a.source_kind].count += 1;
    byKind[a.source_kind].total += Number(a.accrued_amount_thb);
  }

  // ── Withdrawals (own) ──
  const { data: withdrawalsRaw, error: withdrawalsRawErr } = await supabase
    .from("commission_withdrawals")
    .select("id, withdrawal_no, status, title, gross_thb, net_thb, requested_at, paid_at")
    .eq("earner_admin_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (withdrawalsRawErr) {
    console.error(`[commission_withdrawals list] failed`, { code: withdrawalsRawErr.code, message: withdrawalsRawErr.message });
  }
  const withdrawals = (withdrawalsRaw ?? []) as WithdrawalRow[];

  // Role kind for new request (use first eligible accrual or fallback to role).
  const defaultRoleKind: RoleKind =
    accruals[0]?.role_kind
    ?? (roles.includes("interpreter") ? "interpreter" : "sales_rep");

  const accrualOptions: AccrualOption[] = accruals.map((a) => ({
    id:                  a.id,
    source_kind:         a.source_kind,
    source_ref:          a.source_ref,
    accrued_amount_thb:  Number(a.accrued_amount_thb),
    accrued_at:          a.accrued_at,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">PORTAL · ค่าคอม</p>
        <h1 className="mt-1 text-2xl font-bold">ค่าคอมของฉัน</h1>
        <p className="text-xs text-muted mt-1">
          ดูยอดสะสม + ขอเบิกค่าคอม + ดูประวัติคำขอ ·
          บทบาท: {ROLE_KIND_LABEL[defaultRoleKind]}
        </p>
      </header>

      {/* Unpaid balance summary */}
      <section className="rounded-2xl border-2 border-primary-200 bg-primary-50/40 p-5">
        <p className="text-xs text-muted">ยอดสะสมรอเบิก (gross)</p>
        <p className="text-3xl font-extrabold text-primary-700 font-mono">{thb(unpaidTotal)}</p>
        <p className="text-xs text-muted mt-1">
          จาก <strong>{accruals.length}</strong> รายการ ·
          ขั้นต่ำขอเบิก: <span className="font-mono">{thb(MIN_WITHDRAWAL_THB)}</span>
        </p>

        <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs">
          {(Object.keys(byKind) as SourceKind[]).map((k) => (
            <div key={k} className="rounded-lg border border-border bg-white p-3">
              <p className="text-muted">{SOURCE_KIND_LABEL[k]}</p>
              <p className="font-mono font-bold mt-1">{thb(byKind[k].total)}</p>
              <p className="text-[10px] text-muted">{byKind[k].count} รายการ</p>
            </div>
          ))}
        </div>
      </section>

      {/* Request withdrawal */}
      {canRequest ? (
        <RequestWithdrawalClient
          accruals={accrualOptions}
          minRequiredThb={MIN_WITHDRAWAL_THB}
        />
      ) : (
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5">
          <p className="text-sm text-muted">
            ยอดสะสมยังไม่ถึงขั้นต่ำขอเบิก ({thb(MIN_WITHDRAWAL_THB)}) — สะสมเพิ่มแล้วกลับมาขอเบิก
          </p>
        </section>
      )}

      {/* Unpaid accrual breakdown (read-only list) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">รายการสะสมที่ยังไม่ได้เบิก ({accruals.length})</h2>
        </div>
        {accruals.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ยังไม่มีรายการสะสม</p>
        ) : (
          <div className="overflow-x-auto">
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
                {accruals.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{SOURCE_KIND_LABEL[a.source_kind]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.source_ref}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(Number(a.base_thb))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(Number(a.accrued_amount_thb))}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(a.accrued_at).toLocaleDateString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Withdrawal history */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">ประวัติคำขอเบิก ({withdrawals.length})</h2>
        </div>
        {withdrawals.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ยังไม่เคยขอเบิก</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">หัวข้อ</th>
                  <th className="px-3 py-2 text-right">ยอดรวม</th>
                  <th className="px-3 py-2 text-right">สุทธิ</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">ขอเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`/commissions/me/${w.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {w.withdrawal_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{w.title}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(w.gross_thb)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(w.net_thb)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[w.status]}`}>
                        {WITHDRAWAL_STATUS_LABEL[w.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {new Date(w.requested_at).toLocaleDateString("th-TH")}
                      {w.paid_at && <><br /><span className="text-[10px] text-green-700">จ่าย {new Date(w.paid_at).toLocaleDateString("th-TH")}</span></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
