import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ArrowLeftRight, ChevronRight, Home, Users } from "lucide-react";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { TransferBulkForm } from "./transfer-bulk-form";

// V-G2 — Bulk transfer customers to sales rep (faithful port of legacy
// `pcs-admin/transferSalesCustomers.php`). Differs from the existing
// `/admin/customers/transfer-rep` page (which uses the one-row UPDATE
// bulk path) by going through the per-customer action — guarantees
// per-row audit + dual-side notifications per V-G2 spec.

type FilterValue = string;     // uuid | "noSale" | "all"

type RepRow = {
  profile_id: string;
  role:       string;
  profile: { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } |
           { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null }[] |
           null;
  contact: { display_name: string | null; direct_phone: string | null } |
           { display_name: string | null; direct_phone: string | null }[] |
           null;
};

export type RepOption = {
  profile_id:   string;
  display_name: string;
  member_code:  string | null;
  role:         string;
};

function repToOption(r: RepRow): RepOption {
  const prof    = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
  const contact = Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact;
  const fallback = `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim() || "(ไม่มีชื่อ)";
  return {
    profile_id:   r.profile_id,
    display_name: contact?.display_name?.trim() || fallback,
    member_code:  prof?.member_code ?? null,
    role:         r.role,
  };
}

export default async function TransferBulkPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // V-G2 spec: super OR sales_admin. ops/accounting refused — moving
  // sales-rep assignments is a sales-team action. sales_admin will be
  // further restricted to their OWN customers in the server action.
  const { user, roles } = await requireAdmin(["sales_admin"]);
  const isSuper = isGodRole(roles);

  const sp = await searchParams;
  // For sales_admin (non-super), the source-rep selector is pinned to
  // themselves — they can't transfer another rep's customers, so the
  // legacy "filter by current rep" affordance becomes "filter your own
  // customers". The dropdown still renders, but disabled.
  const defaultFrom: FilterValue = isSuper ? "all" : user.id;
  const fromFilter: FilterValue = sp.from ?? defaultFrom;

  const admin = createAdminClient();

  // List of active sales admins (filter dropdown source + target source).
  // Same query as /admin/customers/transfer-rep — keeping the shape
  // identical so a future refactor can share the rep selector component.
  const { data: repsRaw, error: repsErr } = await admin
    .from("admins")
    .select(`profile_id, role,
             profile:profiles!profile_id ( member_code, first_name, last_name, phone ),
             contact:admin_contact_extras!profile_id ( display_name, direct_phone )`)
    .in("role", ["sales_admin", "super", "ultra"])
    .eq("is_active", true);
  if (repsErr) {
    console.error(`[transfer-bulk admins read] failed`, { code: repsErr.code, message: repsErr.message });
    throw new Error(`failed to load sales reps: ${repsErr.message}`);
  }

  const reps: RepOption[] = ((repsRaw ?? []) as unknown as RepRow[]).map(repToOption);
  const repsById = new Map(reps.map((r) => [r.profile_id, r]));

  // Filter customers. For non-super callers we always scope to their
  // own customers regardless of `?from=` — the action layer enforces
  // this anyway, but pre-filtering keeps the UI honest.
  let q = admin.from("profiles")
    .select(`id, member_code, account_type, first_name, last_name, company_name,
             phone, customer_group, sales_admin_id, created_at`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!isSuper) {
    q = q.eq("sales_admin_id", user.id);
  } else if (fromFilter === "noSale") {
    q = q.is("sales_admin_id", null);
  } else if (fromFilter !== "all") {
    q = q.eq("sales_admin_id", fromFilter);
  }

  const { data: customersRaw } = await q;

  type CustomerRow = {
    id:              string;
    member_code:     string | null;
    account_type:    "personal" | "juristic";
    first_name:      string | null;
    last_name:       string | null;
    company_name:    string | null;
    phone:           string | null;
    customer_group:  string;
    sales_admin_id:  string | null;
    created_at:      string;
  };
  const customers = ((customersRaw ?? []) as unknown as CustomerRow[]).map((c) => ({
    id:              c.id,
    member_code:     c.member_code,
    name: c.account_type === "juristic" && c.company_name
      ? c.company_name
      : `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—",
    phone:           c.phone,
    customer_group:  c.customer_group,
    current_rep:     c.sales_admin_id ? repsById.get(c.sales_admin_id) ?? null : null,
    sales_admin_id:  c.sales_admin_id,
    account_type:    c.account_type,
    created_at:      c.created_at,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/customers" className="hover:text-primary-600">ลูกค้า</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">ย้ายเซลล์ผู้ดูแล (แบบมีเหตุผล)</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ลูกค้า</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold">ย้ายเซลล์ที่ดูแลลูกค้า (แบบมีเหตุผล)</h1>
            <p className="text-xs text-muted mt-0.5">
              เลือกลูกค้าได้สูงสุด 200 ราย ระบุพนักงานขายปลายทาง + เหตุผล —
              ระบบจะบันทึก audit log และส่งแจ้งเตือนให้พนักงานขายต้นทาง/ปลายทาง/ลูกค้าทุกราย
            </p>
          </div>
        </div>
      </div>

      {/* Filter by current rep (source) — disabled for non-super (pinned to self) */}
      <form method="GET" className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm space-y-1">
          <span className="block text-xs font-medium text-muted">กรองโดยพนักงานขายปัจจุบัน</span>
          <select
            name="from"
            defaultValue={fromFilter}
            disabled={!isSuper}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm min-w-[280px] disabled:bg-surface-alt disabled:text-muted"
          >
            {isSuper && <option value="all">— ทุกลูกค้า —</option>}
            {isSuper && <option value="noSale">ลูกค้าที่ยังไม่มีเซลล์ดูแล</option>}
            <optgroup label={isSuper ? "พนักงานขายที่ดูแลอยู่" : "พนักงานขาย (ตัวคุณเอง)"}>
              {reps.map((r) => (
                <option key={r.profile_id} value={r.profile_id}>
                  {r.display_name}{r.member_code ? ` (${r.member_code})` : ""}{r.role === "super" ? " · ผู้ดูแลระบบ" : ""}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {isSuper && (
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
            ค้นหา
          </button>
        )}
        {!isSuper && (
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            คุณสามารถย้ายได้เฉพาะลูกค้าที่อยู่ในความดูแลของคุณเท่านั้น
          </span>
        )}
        <div className="ml-auto inline-flex items-center gap-2 text-xs text-muted">
          <Users className="w-4 h-4" /> พบ <span className="font-bold text-foreground">{customers.length}</span> ราย
          {customers.length === 500 && <span className="text-amber-600">(แสดงได้สูงสุด 500 — ใช้ตัวกรองให้แคบลง)</span>}
        </div>
      </form>

      <TransferBulkForm customers={customers} reps={reps} />
    </main>
  );
}
