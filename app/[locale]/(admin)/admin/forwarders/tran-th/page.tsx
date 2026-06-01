import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTranThList } from "@/actions/admin/forwarder-tran-th";

/**
 * /admin/forwarders/tran-th — TH-transport batch list (legacy
 * `tb_forwarder_tran_th_h` × 296 batches · `_sub` × 643 line items).
 *
 * Per `docs/briefs/poom-wave-2026-06-01.md` §6 — the legacy
 * forwarder-action.php row-bundling flow had ZERO Pacred writer/reader.
 * The customer-side display exists at `(protected)/service-import/[fNo]/
 * page.tsx`; this admin counterpart surfaces the 296 historical batches
 * + the 643 included forwarders.
 *
 * MVP READ-ONLY · CREATE batch deferred next sitting (needs multi-row
 * selector UI + dedup-guard against re-bundling a fid).
 *
 * Roles per ADR-0006 §1.4: super | accounting | warehouse | freight_sales.
 */

export const dynamic = "force-dynamic";

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "2-digit" });
}

export default async function AdminTranThListPage({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; rep?: string }>;
}) {
  await requireAdmin(["super", "accounting", "warehouse", "freight_sales"]);
  const sp = await searchParams;

  const dateFrom = (sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from)) ? sp.date_from : undefined;
  const dateTo   = (sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to))   ? sp.date_to   : undefined;
  const adminID  = (sp.rep ?? "").trim() || undefined;

  const result = await getTranThList({ dateFrom, dateTo, adminID, limit: 300 });

  // Per-creator rollup for the in-page leaderboard.
  const creatorAgg = new Map<string, { batches: number; items: number }>();
  for (const r of result.rows) {
    const cur = creatorAgg.get(r.adminidcreate) ?? { batches: 0, items: 0 };
    cur.batches += 1;
    cur.items   += r.itemCount;
    creatorAgg.set(r.adminidcreate, cur);
  }
  const topCreators = Array.from(creatorAgg.entries())
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => b.batches - a.batches)
    .slice(0, 10);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <nav className="text-xs text-muted">
        <Link href="/admin" className="hover:text-foreground">หน้าแรก</Link>
        <span className="mx-1">/</span>
        <Link href="/admin/forwarders" className="hover:text-foreground">ฝากนำเข้า</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">ใบจัดส่งในไทย</span>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ฝากนำเข้า</p>
          <h1 className="mt-1 text-2xl font-bold">ใบจัดส่งในไทย (TH-transport batches)</h1>
          <p className="text-xs text-muted mt-1">
            กลุ่ม forwarder ที่ส่งคันเดียวกัน · admin จับมัดเข้า batch ก่อนคนขับรับงาน
          </p>
          <p className="text-[10px] text-muted mt-1">
            📊 อ่านจาก <code className="bg-surface-alt px-1 rounded">tb_forwarder_tran_th_h</code> + <code className="bg-surface-alt px-1 rounded">_sub</code>
            {" "}(legacy ~296 batches · ~643 รายการ · brief §6) · MVP read-only · ⚠️ สร้าง batch DEFER ครั้งหน้า
          </p>
        </div>
        <span
          className="cursor-not-allowed rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-xs font-medium text-muted"
          title="DEFERRED · ต้อง UI เลือก forwarder + dedup guard"
        >
          + สร้าง batch (เร็วๆ นี้)
        </span>
      </header>

      {/* Summary */}
      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="ทั้งหมด" value={result.totalCount.toLocaleString("th-TH")} sub="batches" />
        <Stat label="ในตาราง" value={result.rows.length.toLocaleString("th-TH")} sub="แถวที่แสดง" />
        <Stat label="forwarder ที่ถูกมัด" value={result.totalItems.toLocaleString("th-TH")} sub="รายการ" />
      </section>

      {/* Filter form */}
      <form
        method="GET"
        action="/admin/forwarders/tran-th"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">ตั้งแต่</span>
          <input type="date" name="date_from" defaultValue={dateFrom ?? ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">ถึง</span>
          <input type="date" name="date_to" defaultValue={dateTo ?? ""} className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted">ผู้สร้าง (adminID)</span>
          <input type="text" name="rep" defaultValue={adminID ?? ""} placeholder="admin_xxxx" className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs" />
        </label>
        <button type="submit" className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
          กรอง
        </button>
        {(dateFrom || dateTo || adminID) && (
          <Link href="/admin/forwarders/tran-th" className="text-xs text-muted hover:text-foreground">
            ล้าง
          </Link>
        )}
      </form>

      {/* Creators leaderboard */}
      {topCreators.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          <h2 className="font-bold text-sm mb-3">🏆 ผู้สร้าง batch (ในตาราง)</h2>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2 text-right">#batches</th>
                  <th className="px-3 py-2 text-right">รวม forwarder</th>
                </tr>
              </thead>
              <tbody>
                {topCreators.map((c, idx) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.id}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{c.batches.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{c.items.toLocaleString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Batches list */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">📋 รายการ batch ({result.rows.length.toLocaleString("th-TH")})</h2>
        </div>
        {result.rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มี batch ในเงื่อนไขที่เลือก · {result.totalCount === 0 ? "ยังไม่มี historical data" : "ลองเปลี่ยน filter"}
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">วันที่สร้าง</th>
                  <th className="px-3 py-2">ผู้สร้าง</th>
                  <th className="px-3 py-2 text-right">#forwarder ในชุด</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((b) => (
                  <tr key={b.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/forwarders/tran-th/${b.id}`}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        #{b.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDateLong(b.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{b.adminidcreate}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">{b.itemCount.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/forwarders/tran-th/${b.id}`}
                        className="text-[11px] text-primary-600 hover:underline"
                      >
                        ดูรายละเอียด →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[10px] text-muted">
        📌 MVP read-only (brief §6 · เก่า 0 Pacred reader) · CREATE batch DEFERRED — ต้องมี multi-row selector UI + dedup-guard (forwarder ห้ามอยู่ใน 2 batches)
      </p>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-bold font-mono text-foreground text-xl">{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
