import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { DriverAssignmentActions } from "./actions-cell";

const STATUS_BADGE: Record<number, string> = {
  1: "bg-yellow-50 text-yellow-700 border-yellow-200",
  2: "bg-blue-50 text-blue-700 border-blue-200",
  3: "bg-gray-50 text-gray-600 border-gray-200",
  4: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABEL: Record<number, string> = {
  1: "มอบหมาย",
  2: "รับงาน",
  3: "หมดเวลา",
  4: "เสร็จ",
};

type DriverProfile = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
} | { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null }[] | null;

type ForwarderRow = {
  f_no:                string | null;
  source_warehouse:    string | null;
  transport_type:      string | null;
  total_price:         number | null;
  ship_first_name:     string | null;
  ship_last_name:      string | null;
  ship_phone:          string | null;
} | { f_no: string | null; source_warehouse: string | null; transport_type: string | null; total_price: number | null; ship_first_name: string | null; ship_last_name: string | null; ship_phone: string | null }[] | null;

function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function AdminDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // P-18-followup-rbac: page-level guard so direct URL by an admin role
  // outside "ops" gets a clean redirect (the actions/admin/drivers.ts
  // server actions already enforce this, but the UI sidebar gate alone
  // doesn't stop someone hitting /admin/drivers directly).
  await requireAdmin(["ops"]);

  const sp    = await searchParams;
  const admin = createAdminClient();

  let q = admin
    .from("forwarder_driver")
    .select(`
      id, status, fd_date, accepted_at, completed_at, note, created_at,
      driver:profiles!profile_id ( member_code, first_name, last_name, phone ),
      forwarder:forwarders!forwarder_id ( f_no, source_warehouse, transport_type, total_price, ship_first_name, ship_last_name, ship_phone )
    `)
    .order("fd_date", { ascending: false })
    .limit(200);

  if (sp.status) {
    const n = Number.parseInt(sp.status, 10);
    if ([1, 2, 3, 4].includes(n)) q = q.eq("status", n);
  }

  const { data } = await q;

  type RawRow = {
    id: string; status: number; fd_date: string;
    accepted_at: string | null; completed_at: string | null;
    note: string | null; created_at: string;
    driver: DriverProfile;
    forwarder: ForwarderRow;
  };
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    driver:    normSingle(r.driver),
    forwarder: normSingle(r.forwarder),
  }));

  // Tally for filter chips
  const { data: counts } = await admin.from("forwarder_driver").select("status");
  const tally = (counts ?? []).reduce<Record<number, number>>((acc, r) => {
    const s = (r as { status: number }).status;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">รายการมอบหมายคนขับ</h1>
        <p className="mt-1 text-sm text-muted">
          แต่ละแถว = หนึ่งมอบหมาย (1 forwarder ↔ 1 driver). cron auto-flips
          status=1 → 3 หาก 17 ชม. ผ่านไปไม่รับงาน
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={!sp.status} href="/admin/drivers">
          ทั้งหมด ({(counts ?? []).length})
        </Chip>
        {[1, 2, 3, 4].map((s) => (
          <Chip
            key={s}
            active={sp.status === String(s)}
            href={`/admin/drivers?status=${s}`}
          >
            {STATUS_LABEL[s]} ({tally[s] ?? 0})
          </Chip>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มีรายการมอบหมาย</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">มอบหมายเมื่อ</th>
                  <th className="px-4 py-3">Forwarder</th>
                  <th className="px-4 py-3">คนขับ</th>
                  <th className="px-4 py-3">ผู้รับ</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      <Link
                        href={`/admin/drivers/${r.id}`}
                        className="block hover:underline text-primary-600 mb-1"
                      >
                        {new Date(r.fd_date).toLocaleString("th-TH")}
                      </Link>
                      {r.accepted_at && (
                        <div className="text-[10px]">รับ {new Date(r.accepted_at).toLocaleTimeString("th-TH")}</div>
                      )}
                      {r.completed_at && (
                        <div className="text-[10px]">เสร็จ {new Date(r.completed_at).toLocaleTimeString("th-TH")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.forwarder?.f_no ? (
                        <>
                          <Link
                            href={`/admin/forwarders/${r.forwarder.f_no}`}
                            className="font-mono text-primary-600 hover:underline"
                          >
                            {r.forwarder.f_no}
                          </Link>
                          <div className="mt-0.5 text-muted">
                            {r.forwarder.source_warehouse} · {r.forwarder.transport_type}
                          </div>
                          {r.forwarder.total_price && (
                            <div className="text-muted">
                              ฿{Number(r.forwarder.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.driver?.member_code ?? "—"}</div>
                      <div>{r.driver?.first_name} {r.driver?.last_name}</div>
                      <div className="text-muted">{r.driver?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.forwarder?.ship_first_name && (
                        <>
                          <div>{r.forwarder.ship_first_name} {r.forwarder.ship_last_name ?? ""}</div>
                          <div className="text-muted">{r.forwarder.ship_phone ?? "—"}</div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          STATUS_BADGE[r.status] ?? "bg-gray-50 border-gray-200"
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.note && (
                        <div className="mt-1 text-[10px] text-muted max-w-[160px]">📝 {r.note}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DriverAssignmentActions id={r.id} status={r.status as 1 | 2 | 3 | 4} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Chip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border hover:bg-surface-alt"
      }`}
    >
      {children}
    </Link>
  );
}
