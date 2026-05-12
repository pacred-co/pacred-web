import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { Search } from "lucide-react";

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  q?: string;
  type?: string;
  status?: string;
  page?: string;
}>;

type CustomerRow = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  account_type: string;
  company_name: string | null;
  status: string;
  role: string | null;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    active: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
    incomplete: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    suspended: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  }[status] ?? "bg-surface text-muted";
  const label = { active: "ใช้งาน", incomplete: "รอ Approve", suspended: "ระงับ" }[status] ?? status;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg}`}>
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
      type === "juristic"
        ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400"
        : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
    }`}>
      {type === "juristic" ? "นิติบุคคล" : "บุคคล"}
    </span>
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q = "", type = "all", status = "all", page: pageStr = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageStr, 10));
  const from = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  let query = admin
    .from("profiles")
    .select(
      "id, member_code, first_name, last_name, phone, email, account_type, company_name, status, role, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (type !== "all") query = query.eq("account_type", type);
  if (status !== "all") query = query.eq("status", status);
  if (q.trim()) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,member_code.ilike.%${q}%,company_name.ilike.%${q}%`,
    );
  }

  const { data: customers, count } = await query;
  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const str = params.toString();
    return `/admin/customers${str ? `?${str}` : ""}`;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">สมาชิกทั้งหมด</h1>
          <p className="text-sm text-muted mt-1">จัดการข้อมูลสมาชิกในระบบ</p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-muted">
          {total.toLocaleString()} คน
        </span>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="ชื่อ / เบอร์ / รหัสสมาชิก..."
            className="w-full h-9 rounded-lg border border-border bg-white dark:bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
          />
        </div>
        <select
          name="type"
          defaultValue={type}
          className="h-9 rounded-lg border border-border bg-white dark:bg-surface px-3 text-sm outline-none focus:border-primary-500 transition"
        >
          <option value="all">ทุกประเภท</option>
          <option value="personal">บุคคล</option>
          <option value="juristic">นิติบุคคล</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-lg border border-border bg-white dark:bg-surface px-3 text-sm outline-none focus:border-primary-500 transition"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="active">ใช้งาน</option>
          <option value="incomplete">รอ Approve</option>
          <option value="suspended">ระงับ</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 transition"
        >
          ค้นหา
        </button>
        {(q || type !== "all" || status !== "all") && (
          <a
            href="/admin/customers"
            className="h-9 flex items-center rounded-lg border border-border px-4 text-sm text-muted hover:text-foreground transition"
          >
            ล้าง
          </a>
        )}
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[#F8F9FB] dark:bg-surface-alt text-left">
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">รหัสสมาชิก</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">ชื่อ / บริษัท</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">เบอร์โทร</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">อีเมล</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">ประเภท</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">วันที่สมัคร</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(customers as CustomerRow[] | null)?.map((c) => {
                const name =
                  c.account_type === "juristic"
                    ? ((c.company_name ?? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()) || "—")
                    : (`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—");
                const date = new Date(c.created_at).toLocaleDateString("th-TH", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                });
                return (
                  <tr key={c.id} className="hover:bg-[#F8F9FB] dark:hover:bg-surface-alt transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{c.member_code ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{name}</td>
                    <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted max-w-[160px] truncate">{c.email ?? "—"}</td>
                    <td className="px-4 py-3"><TypeBadge type={c.account_type} /></td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-muted text-xs">{date}</td>
                    <td className="px-4 py-3">
                      <CustomerRowActions id={c.id} status={c.status} />
                    </td>
                  </tr>
                );
              })}
              {(!customers || customers.length === 0) && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    ไม่พบข้อมูลสมาชิก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted">
              แสดง {from + 1}–{Math.min(from + PAGE_SIZE, total)} จาก {total} รายการ
            </span>
            <div className="flex gap-1.5">
              {page > 1 && (
                <a
                  href={pageHref(page - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface transition-colors text-sm"
                >
                  ‹
                </a>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span key={`ellipsis-${p}`} className="flex h-8 w-8 items-center justify-center text-muted text-xs">…</span>
                    )}
                    <a
                      key={p}
                      href={pageHref(p)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
                        p === page
                          ? "bg-primary-600 text-white font-semibold"
                          : "border border-border text-muted hover:bg-surface"
                      }`}
                    >
                      {p}
                    </a>
                  </>
                ))}
              {page < totalPages && (
                <a
                  href={pageHref(page + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface transition-colors text-sm"
                >
                  ›
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
