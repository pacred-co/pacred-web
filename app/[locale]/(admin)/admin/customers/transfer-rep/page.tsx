import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ArrowLeftRight, ChevronRight, Home, Users } from "lucide-react";
import { TransferRepForm } from "./transfer-form";

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

export default async function TransferSalesRepPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const fromFilter: FilterValue = sp.from ?? "all";

  const admin = createAdminClient();

  // List of active sales admins (filter dropdown source + target source)
  const { data: repsRaw } = await admin
    .from("admins")
    .select(`profile_id, role,
             profile:profiles!profile_id ( member_code, first_name, last_name, phone ),
             contact:admin_contact_extras!profile_id ( display_name, direct_phone )`)
    .in("role", ["sales_admin", "super"])
    .eq("is_active", true);

  const reps: RepOption[] = ((repsRaw ?? []) as RepRow[]).map(repToOption);
  const repsById = new Map(reps.map((r) => [r.profile_id, r]));

  // Filter customers
  let q = admin.from("profiles")
    .select(`id, member_code, account_type, first_name, last_name, company_name,
             phone, customer_group, sales_admin_id, created_at`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (fromFilter === "noSale") {
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
  const customers = ((customersRaw ?? []) as CustomerRow[]).map((c) => ({
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
        <span className="text-foreground font-medium">ย้ายเซลล์ผู้ดูแล</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ลูกค้า</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold">ย้ายเซลล์ผู้ดูแลลูกค้า</h1>
            <p className="text-xs text-muted mt-0.5">เลือกลูกค้าที่ต้องการย้าย แล้วเลือกพนักงานขายผู้รับโอน — เปลี่ยนทีละหลายรายการได้ในครั้งเดียว</p>
          </div>
        </div>
      </div>

      {/* Filter by current rep */}
      <form method="GET" className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm space-y-1">
          <span className="block text-xs font-medium text-muted">กรองโดยพนักงานขายปัจจุบัน</span>
          <select
            name="from"
            defaultValue={fromFilter}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm min-w-[280px]"
          >
            <option value="all">— ทุกลูกค้า —</option>
            <option value="noSale">ลูกค้าที่ยังไม่มีเซลล์ดูแล</option>
            <optgroup label="พนักงานขายที่ดูแลอยู่">
              {reps.map((r) => (
                <option key={r.profile_id} value={r.profile_id}>
                  {r.display_name}{r.member_code ? ` (${r.member_code})` : ""}{r.role === "super" ? " · ผู้ดูแลระบบ" : ""}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
          ค้นหา
        </button>
        <div className="ml-auto inline-flex items-center gap-2 text-xs text-muted">
          <Users className="w-4 h-4" /> พบ <span className="font-bold text-foreground">{customers.length}</span> ราย {customers.length === 500 && <span className="text-amber-600">(แสดงได้สูงสุด 500 — ใช้ตัวกรองให้แคบลง)</span>}
        </div>
      </form>

      <TransferRepForm customers={customers} reps={reps} />
    </main>
  );
}
