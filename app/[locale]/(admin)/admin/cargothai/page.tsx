import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SyncForm } from "./sync-form";

/**
 * /admin/cargothai — Sprint-7 foundation (Gap #4 — เดฟ owned).
 *
 * Manual + automatic sync of CargoThai's container/manifest data into
 * the legacy `tb_tmp_forwarder_cargothai` + `tb_tmp_forwarder_item_cargothai`
 * tables. The automatic cron lives at `/api/cron/cargothai-sync`
 * (vercel.json registers it daily at 02:30 ICT).
 *
 * Page shows:
 *   - Last sync timestamp (max of api_lasttimeupdated across both tables)
 *   - Total rows in each table (counts)
 *   - The 10 most-recent containers (preview)
 *   - Manual sync form (date range picker + "Sync now" button)
 *
 * Auth-gated to ops/accounting (super inherits).
 */
export const dynamic = "force-dynamic";

export default async function AdminCargoThaiPage() {
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // Three reads in parallel — counts + last-sync + recent containers.
  const [containerRes, itemRes, recentRes] = await Promise.all([
    admin
      .from("tb_tmp_forwarder_cargothai")
      .select("id", { count: "exact", head: true }),
    admin
      .from("tb_tmp_forwarder_item_cargothai")
      .select("id", { count: "exact", head: true }),
    admin
      .from("tb_tmp_forwarder_cargothai")
      .select("sm_code, container_name, container_code, customer_code, eta, api_lasttimeupdated")
      .order("api_lasttimeupdated", { ascending: false, nullsFirst: false })
      .limit(10),
  ]);

  const containerCount = containerRes.count ?? 0;
  const itemCount      = itemRes.count ?? 0;
  type Row = {
    sm_code:             string | null;
    container_name:      string | null;
    container_code:      string | null;
    customer_code:       string | null;
    eta:                 string | null;
    api_lasttimeupdated: string | null;
  };
  const recent: Row[] = (recentRes.data ?? []) as Row[];
  const lastSyncAt = recent[0]?.api_lasttimeupdated ?? null;

  const tokenConfigured = Boolean(process.env.PACRED_CARGOTHAI_TOKEN);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">CargoThai sync</h1>
        <p className="mt-1 text-sm text-muted">
          ดึงข้อมูล container + product manifest จาก CargoThai (https://cargothai.tech/api/service/GetContainerV2)
          เข้าตาราง tb_tmp_forwarder_cargothai + tb_tmp_forwarder_item_cargothai. Cron รันอัตโนมัติทุกวัน 02:30 ICT.
        </p>
      </header>

      {!tokenConfigured && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>⚠️ ยังไม่ได้ตั้งค่า PACRED_CARGOTHAI_TOKEN</strong> — sync จะ fail จนกว่าจะใส่ token ของ CargoThai
          ใน Vercel env (ติดต่อทีม CargoThai เพื่อขอ <code>_token</code>)
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Containers (tb_tmp_forwarder_cargothai)" value={containerCount.toLocaleString("th-TH")} />
        <StatCard label="Items (tb_tmp_forwarder_item_cargothai)" value={itemCount.toLocaleString("th-TH")} />
        <StatCard
          label="Last sync"
          value={lastSyncAt ? new Date(lastSyncAt).toLocaleString("th-TH") : "—"}
        />
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-3">
        <h2 className="font-bold text-sm">Sync manual</h2>
        <p className="text-xs text-muted">
          ค่าเริ่มต้น: from = เมื่อวาน · to = วันนี้. กรอกช่วงเองได้ ถ้าต้อง backfill.
        </p>
        <SyncForm tokenConfigured={tokenConfigured} />
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-bold text-sm">10 containers ล่าสุด</h2>
        </div>
        {recent.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มีข้อมูล — กด Sync เพื่อดึงครั้งแรก</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">SM code</th>
                  <th className="px-4 py-2">Container</th>
                  <th className="px-4 py-2">ลูกค้า</th>
                  <th className="px-4 py-2">ETA</th>
                  <th className="px-4 py-2">Last update</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, idx) => (
                  <tr key={r.sm_code ?? `row-${idx}`} className="border-t border-border">
                    <td className="px-4 py-2 text-xs font-mono">{r.sm_code ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">
                      <div>{r.container_name ?? "—"}</div>
                      <div className="text-muted font-mono">{r.container_code ?? ""}</div>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">{r.customer_code ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{r.eta ? new Date(r.eta).toLocaleDateString("th-TH") : "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {r.api_lasttimeupdated ? new Date(r.api_lasttimeupdated).toLocaleString("th-TH") : "—"}
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold font-mono">{value}</p>
    </div>
  );
}
