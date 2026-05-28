/**
 * /admin/customers/recently-active — ลูกค้าที่ใช้งานล่าสุด
 *
 * Wave 7.2 (2026-05-21 night): rewritten from rebuilt schema (profiles
 * + service_orders + forwarders + yuan_payments — all empty on prod)
 * → `tb_users.userLastLogin` (simpler heuristic).
 *
 * Wave 7.2 = simple version: list tb_users sorted by userlastlogin desc.
 * Per-channel activity aggregation (lifetime stats across tb_header_order
 * + tb_forwarder + tb_payment + CSV export) → Wave 8 when we port the
 * fuller V-G6 report.
 *
 * Sales reps use this surface to spot dormant customers + chase them.
 * Wave 7.2 ranks by login recency · Wave 8 will rank by last transaction
 * across the 3 channels (matches the legacy report's purpose).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

type ActType = "all" | "personal" | "juristic";

type Row = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userCompany: string | null;
  userLastLogin: string | null;
  userRegistered: string | null;
  adminIDSale: string | null;
};

function dateOnly(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("th-TH") : "—";
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86_400_000);
}

export default async function RecentlyActiveCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAdmin(["ops", "sales_admin", "accounting"]);

  const sp = await searchParams;
  const type: ActType =
    sp.type === "personal" || sp.type === "juristic" ? sp.type : "all";

  const admin = createAdminClient();

  let q = admin
    .from("tb_users")
    .select(
      "userid,username,userlastname,usertel,useremail,usercompany,userlastlogin,userregistered,adminidsale",
    )
    .order("userLastLogin", { ascending: false, nullsFirst: false })
    .limit(500);

  if (type === "personal") q = q.neq("userCompany", "1");
  if (type === "juristic") q = q.eq("userCompany", "1");

  const { data: rowsRaw, error: rowsRawErr } = await q;
  if (rowsRawErr) {
    console.error(`[tb_users list] failed`, { code: rowsRawErr.code, message: rowsRawErr.message });
  }
  const rows = (rowsRaw ?? []) as Row[];

  const activeCount = rows.filter((r) => r.userLastLogin).length;
  const dormant30d = rows.filter((r) => {
    const d = daysSince(r.userLastLogin);
    return d !== null && d > 30;
  }).length;
  const dormant90d = rows.filter((r) => {
    const d = daysSince(r.userLastLogin);
    return d !== null && d > 90;
  }).length;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · CUSTOMERS
          </p>
          <h1 className="mt-1 text-2xl font-bold">ลูกค้าที่ใช้งานล่าสุด</h1>
          <p className="text-sm text-muted mt-1">
            เรียงตาม login ล่าสุด · Wave 7.2 simple version · per-channel
            activity (forwarder/shop/yuan) + CSV → Wave 8
          </p>
        </div>
        <Link
          href="/admin/customers"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← Customer list
        </Link>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">ประเภทลูกค้า:</span>
        {(["all", "personal", "juristic"] as const).map((t) => (
          <Link
            key={t}
            href={t === "all" ? "/admin/customers/recently-active" : `/admin/customers/recently-active?type=${t}`}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              type === t
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-border bg-white dark:bg-surface text-muted hover:text-foreground"
            }`}
          >
            {t === "all" ? "ทั้งหมด" : t === "personal" ? "บุคคล" : "นิติบุคคล"}
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="แสดงผล" value={String(rows.length)} />
        <Stat label="มี login ประวัติ" value={String(activeCount)} />
        <Stat label="หายไป > 30 วัน" value={String(dormant30d)} cls="text-amber-700" />
        <Stat label="หายไป > 90 วัน" value={String(dormant90d)} cls="text-red-700" />
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] text-muted">
            <tr>
              <th className="px-3 py-2.5">ลูกค้า</th>
              <th className="px-3 py-2.5">เบอร์</th>
              <th className="px-3 py-2.5">เซลล์ดูแล</th>
              <th className="px-3 py-2.5">สมัครเมื่อ</th>
              <th className="px-3 py-2.5">login ล่าสุด</th>
              <th className="px-3 py-2.5">หายไป</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  ไม่มีลูกค้าตรงเงื่อนไข
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isJuristic = r.userCompany === "1";
                const name = `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim() || "—";
                const days = daysSince(r.userLastLogin);
                return (
                  <tr key={r.userID} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2 max-w-[240px]">
                      <Link
                        href={`/admin/customers/${r.userID}`}
                        className="font-medium text-primary-600 hover:underline"
                      >
                        {name}
                      </Link>
                      <div className="text-[10px] text-muted font-mono">
                        {r.userID} · {isJuristic ? "นิติบุคคล" : "บุคคล"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted">{r.userTel ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-muted">{r.adminIDSale ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{dateOnly(r.userRegistered)}</td>
                    <td className="px-3 py-2">
                      {r.userLastLogin ? (
                        <span className="rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px]">
                          {dateOnly(r.userLastLogin)}
                        </span>
                      ) : (
                        <span className="text-muted text-[10px]">— ยังไม่เคย login —</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {days === null ? (
                        <span className="text-muted">—</span>
                      ) : days > 90 ? (
                        <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[10px]">
                          {days} วัน
                        </span>
                      ) : days > 30 ? (
                        <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px]">
                          {days} วัน
                        </span>
                      ) : (
                        <span className="text-muted">{days} วัน</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${cls ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
