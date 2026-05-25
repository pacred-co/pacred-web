import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  WITHDRAWAL_STATUS_LABEL,
  ROLE_KIND_LABEL,
  SOURCE_KIND_LABEL,
  type WithdrawalStatus,
  type RoleKind,
  type SourceKind,
} from "@/lib/validators/commission";
import { WithdrawalActionsClient } from "./withdrawal-actions-client";

/**
 * V-E8 — /admin/commissions/[id] detail page.
 *
 * Shows the withdrawal header + included accruals + status-aware admin
 * actions (approve / reject / mark-paid w/ slip upload).
 *
 * Roles: super, accounting.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<WithdrawalStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

type HeaderRow = {
  id:                   string;
  withdrawal_no:        string;
  status:               WithdrawalStatus;
  earner_admin_id:      string;
  role_kind:            RoleKind;
  title:                string;
  gross_thb:            number;
  wht_rate_pct:         number;
  wht_amount_thb:       number;
  net_thb:              number;
  payee_bank_name:      string;
  payee_account_name:   string;
  payee_account_no:     string;
  requested_at:         string;
  approved_at:          string | null;
  rejected_at:          string | null;
  rejected_reason:      string | null;
  paid_at:              string | null;
  slip_storage_path:    string | null;
  notes:                string | null;
  earner: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
};

type ItemRow = {
  id:                       string;
  included_amount_thb:      number;
  accrual: {
    source_kind:        SourceKind;
    source_ref:         string;
    base_thb:           number;
    accrued_amount_thb: number;
    accrued_at:         string;
  } | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function earnerName(e: { member_code: string | null; first_name: string | null; last_name: string | null } | null): string {
  if (!e) return "—";
  const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
  if (e.member_code && name) return `${e.member_code} · ${name}`;
  return e.member_code ?? name ?? "—";
}

export default async function AdminCommissionWithdrawalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "accounting"]);
  const { id } = await params;

  const admin = createAdminClient();

  const { data: headerRaw, error: headerRawErr } = await admin
    .from("commission_withdrawals")
    .select(`
      id, withdrawal_no, status, earner_admin_id, role_kind, title,
      gross_thb, wht_rate_pct, wht_amount_thb, net_thb,
      payee_bank_name, payee_account_name, payee_account_no,
      requested_at, approved_at, rejected_at, rejected_reason,
      paid_at, slip_storage_path, notes,
      earner:profiles!earner_admin_id ( member_code, first_name, last_name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (headerRawErr) {
    console.error(`[commission_withdrawals lookup] failed`, { code: headerRawErr.code, message: headerRawErr.message, details: headerRawErr.details, hint: headerRawErr.hint });
    throw new Error(`Failed to load commission_withdrawals (${headerRawErr.code ?? "unknown"}): ${headerRawErr.message}`);
  }
  if (!headerRaw) notFound();
  type RawHeader = Omit<HeaderRow, "earner"> & {
    earner: HeaderRow["earner"] | HeaderRow["earner"][] | null;
  };
  const raw = headerRaw as unknown as RawHeader;
  const header: HeaderRow = {
    ...raw,
    earner: Array.isArray(raw.earner) ? raw.earner[0] ?? null : raw.earner,
  };

  const { data: itemsRaw, error: itemsRawErr } = await admin
    .from("commission_withdrawal_items")
    .select(`
      id, included_amount_thb,
      accrual:commission_accruals!commission_accrual_id (
        source_kind, source_ref, base_thb, accrued_amount_thb, accrued_at
      )
    `)
    .eq("commission_withdrawal_id", id);
  if (itemsRawErr) {
    console.error(`[commission_withdrawal_items list] failed`, { code: itemsRawErr.code, message: itemsRawErr.message });
  }
  type RawItem = Omit<ItemRow, "accrual"> & {
    accrual: ItemRow["accrual"] | ItemRow["accrual"][] | null;
  };
  const items: ItemRow[] = ((itemsRaw ?? []) as unknown as RawItem[]).map((r) => ({
    ...r,
    accrual: Array.isArray(r.accrual) ? r.accrual[0] ?? null : r.accrual,
  }));

  // Audit trail
  const { data: auditRaw, error: auditRawErr } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, admin:profiles!admin_id ( member_code, first_name, last_name )")
    .eq("target_type", "commission_withdrawal")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (auditRawErr) {
    console.error(`[admin_audit_log list] failed`, { code: auditRawErr.code, message: auditRawErr.message });
  }
  type AuditRaw = {
    id: string; action: string; created_at: string;
    admin: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
  };
  const audit = ((auditRaw ?? []) as unknown as AuditRaw[]).map((a) => ({
    id:         a.id,
    action:     a.action,
    created_at: a.created_at,
    admin:      Array.isArray(a.admin) ? a.admin[0] ?? null : a.admin,
  }));

  // Signed URL for slip (if paid)
  let slipSignedUrl: string | null = null;
  if (header.slip_storage_path) {
    const { data: signed } = await admin.storage
      .from("commission-slips")
      .createSignedUrl(header.slip_storage_path, 60 * 60); // 1h
    slipSignedUrl = signed?.signedUrl ?? null;
  }

  const isSuper = roles.includes("super");

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/commissions" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            คำขอเบิก <span className="font-mono">{header.withdrawal_no}</span>
          </h1>
          <p className="text-xs text-muted">
            ขอเมื่อ {new Date(header.requested_at).toLocaleString("th-TH")}
            {header.approved_at && <> · อนุมัติ {new Date(header.approved_at).toLocaleString("th-TH")}</>}
            {header.paid_at     && <> · จ่าย {new Date(header.paid_at).toLocaleString("th-TH")}</>}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[header.status]}`}>
          {WITHDRAWAL_STATUS_LABEL[header.status]}
        </span>
      </div>

      {/* Earner + Payee blocks */}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2">Earner</h2>
          <p className="font-medium">{earnerName(header.earner)}</p>
          <p className="text-xs">บทบาท: {ROLE_KIND_LABEL[header.role_kind]}</p>
          <p className="text-xs">หัวข้อ: {header.title}</p>
        </section>
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
          <h2 className="font-bold text-sm mb-2">บัญชีรับเงิน</h2>
          <p>ธนาคาร: <strong>{header.payee_bank_name}</strong></p>
          <p>ชื่อบัญชี: <strong>{header.payee_account_name}</strong></p>
          <p>เลขบัญชี: <span className="font-mono">{header.payee_account_no}</span></p>
        </section>
      </div>

      {/* Rejected reason banner */}
      {header.status === "rejected" && header.rejected_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>ปฏิเสธ:</strong> {header.rejected_reason}
        </div>
      )}

      {/* Items table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">รายการ accruals ที่รวมในคำขอนี้ ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ไม่มี items</p>
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
                  <td className="px-3 py-2 text-xs">{it.accrual ? SOURCE_KIND_LABEL[it.accrual.source_kind] : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{it.accrual?.source_ref ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{thb(Number(it.accrual?.base_thb ?? 0))}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(Number(it.included_amount_thb))}</td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {it.accrual?.accrued_at ? new Date(it.accrual.accrued_at).toLocaleDateString("th-TH") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Totals */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-muted">ยอดรวม (gross)</td>
              <td className="py-1 text-right font-mono">{thb(header.gross_thb)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted">หัก ณ ที่จ่าย {Number(header.wht_rate_pct)}%</td>
              <td className="py-1 text-right font-mono text-red-700">−{thb(header.wht_amount_thb)}</td>
            </tr>
            <tr className="border-t-2 border-black text-base font-bold">
              <td className="py-2">รับสุทธิ (net)</td>
              <td className="py-2 text-right font-mono text-primary-700">{thb(header.net_thb)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Slip display + actions */}
      {header.status === "paid" && slipSignedUrl && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5 space-y-2">
          <h2 className="font-bold text-sm">หลักฐานการโอน</h2>
          <a href={slipSignedUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-700 hover:underline break-all">
            ดู/ดาวน์โหลดสลิป →
          </a>
        </section>
      )}

      {/* Status actions (admin) */}
      <WithdrawalActionsClient
        id={header.id}
        withdrawalNo={header.withdrawal_no}
        status={header.status}
        isSuper={isSuper}
      />

      {/* Audit timeline */}
      {audit.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">Audit timeline</h2>
          <ul className="space-y-1.5 text-xs">
            {audit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-muted whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="font-medium">{a.action}</span>
                <span className="text-muted">
                  by {a.admin?.member_code ?? "—"}
                  {a.admin?.first_name && ` (${a.admin.first_name}${a.admin.last_name ? " " + a.admin.last_name : ""})`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {header.notes && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-1">หมายเหตุ</h2>
          <p className="text-xs whitespace-pre-line">{header.notes}</p>
        </section>
      )}
    </main>
  );
}
