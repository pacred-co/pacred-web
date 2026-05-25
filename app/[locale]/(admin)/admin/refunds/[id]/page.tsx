import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  REFUND_STATUS_LABEL,
  REFUND_SOURCE_LABEL,
  type RefundStatus,
  type RefundSource,
} from "@/lib/validators/refund";
import { RefundActions } from "./refund-actions";

/**
 * U1-6 — /admin/refunds/[id] detail page.
 *
 * Read-only render of the refund_request + the parent context (forwarder /
 * service_order / yuan_payment / manual) + status-aware action buttons +
 * audit timeline.
 *
 * Roles: super, accounting (writes); ops, sales_admin can read.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<RefundStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
};

type Profile = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
  email:       string | null;
};

type RefundDetailRaw = {
  id:                   string;
  request_no:           string;
  source:               RefundSource;
  source_ref:           string | null;
  amount_thb:           number;
  reason:               string;
  status:               RefundStatus;
  approved_at:          string | null;
  rejected_at:          string | null;
  rejected_reason:      string | null;
  paid_at:              string | null;
  paid_wallet_tx_id:    string | null;
  created_by_admin_id:  string | null;
  created_at:           string;
  updated_at:           string;
  profile_id:           string;
  profile: Profile | Profile[] | null;
};
type RefundDetail = Omit<RefundDetailRaw, "profile"> & { profile: Profile | null };

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function normP(p: Profile | Profile[] | null): Profile | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

export default async function AdminRefundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "accounting", "ops", "sales_admin"]);
  const { id } = await params;

  const admin = createAdminClient();

  const { data: rowRaw, error: rowErr } = await admin
    .from("refund_requests")
    .select(`
      id, request_no, source, source_ref, amount_thb, reason, status,
      approved_at, rejected_at, rejected_reason, paid_at, paid_wallet_tx_id,
      created_by_admin_id, created_at, updated_at, profile_id,
      profile:profiles!profile_id(member_code, first_name, last_name, phone, email)
    `)
    .eq("id", id)
    .maybeSingle<RefundDetailRaw>();
  if (rowErr) {
    console.error(`[refunds/[id] row lookup] id=${id}`, {
      code: rowErr.code, message: rowErr.message, details: rowErr.details, hint: rowErr.hint,
    });
    throw new Error(`Failed to load refund_requests (${rowErr.code}): ${rowErr.message}`);
  }
  if (!rowRaw) notFound();
  const row: RefundDetail = { ...rowRaw, profile: normP(rowRaw.profile) };

  // Parent context lookup — best-effort; show the parent if we can resolve it.
  let parentCtx: { label: string; details: Array<{ k: string; v: string }> } | null = null;
  if (row.source === "forwarder" && row.source_ref) {
    const { data } = await admin
      .from("forwarders")
      .select("f_no, status, total_price, created_at")
      .eq("f_no", row.source_ref)
      .maybeSingle<{ f_no: string; status: string; total_price: number | null; created_at: string }>();
    if (data) {
      parentCtx = {
        label: `Forwarder ${data.f_no}`,
        details: [
          { k: "สถานะ",     v: data.status },
          { k: "ยอดรวม",    v: data.total_price != null ? thb(Number(data.total_price)) : "—" },
          { k: "วันที่สร้าง", v: new Date(data.created_at).toLocaleString("th-TH") },
        ],
      };
    }
  } else if (row.source === "service_order" && row.source_ref) {
    const { data } = await admin
      .from("service_orders")
      .select("h_no, status, total_thb, created_at")
      .eq("h_no", row.source_ref)
      .maybeSingle<{ h_no: string; status: string; total_thb: number | null; created_at: string }>();
    if (data) {
      parentCtx = {
        label: `Service order ${data.h_no}`,
        details: [
          { k: "สถานะ",     v: data.status },
          { k: "ยอดรวม",    v: data.total_thb != null ? thb(Number(data.total_thb)) : "—" },
          { k: "วันที่สร้าง", v: new Date(data.created_at).toLocaleString("th-TH") },
        ],
      };
    }
  } else if (row.source === "yuan_payment" && row.source_ref) {
    const { data } = await admin
      .from("yuan_payments")
      .select("id, status, yuan_amount, thb_amount, channel, created_at")
      .eq("id", row.source_ref)
      .maybeSingle<{ id: string; status: string; yuan_amount: number; thb_amount: number; channel: string; created_at: string }>();
    if (data) {
      parentCtx = {
        label: `Yuan payment ${data.id.slice(0, 8)}…`,
        details: [
          { k: "สถานะ",   v: data.status },
          { k: "ช่อง",    v: data.channel },
          { k: "ยอด CNY", v: `¥${data.yuan_amount}` },
          { k: "ยอด THB", v: thb(Number(data.thb_amount)) },
          { k: "วันที่สร้าง", v: new Date(data.created_at).toLocaleString("th-TH") },
        ],
      };
    }
  } else if (row.source === "manual") {
    parentCtx = {
      label:   "Manual refund (ไม่มี parent order)",
      details: [{ k: "หมายเหตุ", v: "admin สร้างคำขอนี้โดยไม่อิงออเดอร์" }],
    };
  }

  // Audit timeline.
  const { data: auditRaw } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, payload, admin_id, admin:profiles!admin_id ( member_code, first_name, last_name )")
    .eq("target_type", "refund_request")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  type AuditRaw = {
    id: string; action: string; created_at: string; payload: unknown;
    admin: { member_code: string | null; first_name: string | null; last_name: string | null }
         | { member_code: string | null; first_name: string | null; last_name: string | null }[]
         | null;
  };
  const audit = ((auditRaw ?? []) as unknown as AuditRaw[]).map((a) => ({
    id:         a.id,
    action:     a.action,
    created_at: a.created_at,
    admin:      Array.isArray(a.admin) ? a.admin[0] ?? null : a.admin,
  }));

  const canMutate = roles.includes("super") || roles.includes("accounting");

  // Resolve paid wallet tx amount/note for transparency when status='paid'.
  let paidTxNote: string | null = null;
  if (row.paid_wallet_tx_id) {
    const { data: w } = await admin
      .from("wallet_transactions")
      .select("id, amount, note, created_at")
      .eq("id", row.paid_wallet_tx_id)
      .maybeSingle<{ id: string; amount: number; note: string | null; created_at: string }>();
    if (w) {
      paidTxNote = `wallet_tx ${w.id.slice(0, 8)}… +${thb(Number(w.amount))} @ ${new Date(w.created_at).toLocaleString("th-TH")}`;
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/refunds" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            คำขอคืนเงิน <span className="font-mono">{row.request_no}</span>
          </h1>
          <p className="text-xs text-muted">
            สร้าง {new Date(row.created_at).toLocaleString("th-TH")}
            {row.approved_at && <> · อนุมัติ {new Date(row.approved_at).toLocaleString("th-TH")}</>}
            {row.paid_at     && <> · จ่าย {new Date(row.paid_at).toLocaleString("th-TH")}</>}
            {row.rejected_at && <> · ปฏิเสธ {new Date(row.rejected_at).toLocaleString("th-TH")}</>}
            {row.created_by_admin_id ? " · admin-created" : " · customer-self-created"}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
          {REFUND_STATUS_LABEL[row.status]}
        </span>
      </div>

      {/* Customer + amount + reason */}
      <div className="grid md:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1">
          <h2 className="font-bold text-sm mb-2">ลูกค้า</h2>
          <p className="font-medium">
            {[row.profile?.first_name, row.profile?.last_name].filter(Boolean).join(" ") || "—"}
          </p>
          {row.profile?.member_code && (
            <p className="text-xs font-mono text-muted">{row.profile.member_code}</p>
          )}
          {row.profile?.phone && <p className="text-xs">☎ {row.profile.phone}</p>}
          {row.profile?.email && <p className="text-xs">✉ {row.profile.email}</p>}
          <p className="text-[10px] font-mono text-muted mt-2">profile_id: {row.profile_id}</p>
        </section>
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
          <h2 className="font-bold text-sm mb-2">{parentCtx?.label ?? REFUND_SOURCE_LABEL[row.source]}</h2>
          {parentCtx ? (
            parentCtx.details.map((d) => (
              <p key={d.k}><span className="text-muted">{d.k}:</span> {d.v}</p>
            ))
          ) : (
            <p className="text-muted">ไม่พบ parent — source_ref: {row.source_ref ?? "—"}</p>
          )}
        </section>
      </div>

      {/* Refund amount + reason */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-sm">รายละเอียดคำขอ</h2>
          <p className="font-mono text-2xl font-bold text-emerald-700">{thb(Number(row.amount_thb))}</p>
        </div>
        <div>
          <p className="text-xs text-muted">เหตุผล:</p>
          <p className="mt-1 text-sm whitespace-pre-line">{row.reason}</p>
        </div>
        {row.status === "rejected" && row.rejected_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>เหตุผลปฏิเสธ:</strong> {row.rejected_reason}
          </div>
        )}
        {row.status === "paid" && paidTxNote && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 font-mono">
            ✓ จ่ายแล้ว — {paidTxNote}
          </div>
        )}
      </section>

      {/* Action buttons */}
      {canMutate && row.status !== "paid" && row.status !== "rejected" && (
        <section className="rounded-2xl border border-primary-200 bg-primary-50/30 p-5">
          <h2 className="font-bold text-sm mb-3">การดำเนินการ</h2>
          <RefundActions id={row.id} status={row.status} />
        </section>
      )}

      {/* Audit timeline */}
      {audit.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">📜 Audit timeline</h2>
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
    </main>
  );
}
