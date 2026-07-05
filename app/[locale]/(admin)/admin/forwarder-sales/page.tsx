import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

/**
 * /admin/forwarder-sales — sales-rep attribution report.
 *
 * REPOINTED 2026-06-02 per ADR-0026 from the DEAD rebuilt `sales_commissions`
 * + `team_leaders` + `profiles` joins (0 rows on prod) onto the LIVE legacy
 * `tb_sales_report` (17,027 rep-attribution rows) — per the brief
 * `docs/briefs/poom-wave-2026-06-01.md` §1.
 *
 * `tb_sales_report` schema (0081 L4411):
 *   • id            — pk
 *   • srdate        — วันที่ลูกค้าชำระ
 *   • fid           — เลขที่ออเดอร์ฝากนำเข้า (→ tb_forwarder.id)
 *   • sradminidsale — adminID of the sales rep who closed the deal
 *
 * This page = WHO closed WHICH forwarder + the resulting revenue (joined live
 * from `tb_forwarder.ftotalprice − fdiscount`). Different from
 * `/admin/commissions` (sales-rep payout queue from `tb_user_sales*`) — this is
 * the ATTRIBUTION report for cross-team review by accounting / sales admin.
 *
 * Legacy reference: `pcs-admin/forwarder-sale.php` filtered by the logged-in
 * admin's own ID; Pacred exposes a rep picker so super / accounting / sales_admin
 * can drill into any rep.
 *
 * Roles per ADR-0006 §1.4: accounting | sales_admin (super implicit).
 */

export const dynamic = "force-dynamic";

type RepOption = {
  adminID: string;
  display: string;
};

type ReportRow = {
  id:           number;
  srdate:       string | null;
  fid:          number;
  sradminidsale: string;
  customer:     string | null;
  ftotalprice:  number;
  fdiscount:    number;
  fstatus:      string | null;
  fTrackingCHN: string | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminForwarderSalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    rep?:        string;
    date_from?:  string;
    date_to?:    string;
    page?:       string;
  }>;
}) {
  await requireAdmin(["accounting", "sales_admin"]);
  const sp = await searchParams;
  const repId = (sp.rep ?? "").trim();
  const page = parsePage(sp.page);

  // Default to current month (legacy convention).
  const now = new Date();
  const ym  = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  const defaultFrom = `${ym}-01`;
  const defaultTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const dateFrom = (sp.date_from && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_from)) ? sp.date_from : defaultFrom;
  const dateTo   = (sp.date_to   && /^\d{4}-\d{2}-\d{2}$/.test(sp.date_to))   ? sp.date_to   : defaultTo;

  const admin = createAdminClient();

  // ── 1. Rep picker — distinct sradminidsale values + JOIN tb_admin for name ──
  const { data: distinctReps, error: distinctErr } = await admin
    .from("tb_sales_report")
    .select("sradminidsale")
    .gte("srdate", `${dateFrom}T00:00:00`)
    .lte("srdate", `${dateTo}T23:59:59`)
    .limit(2000);
  if (distinctErr) {
    console.error("[tb_sales_report distinct] failed", { code: distinctErr.code, message: distinctErr.message });
  }
  const repSet = new Set<string>();
  for (const r of ((distinctReps ?? []) as Array<{ sradminidsale: string }>)) {
    if (r.sradminidsale) repSet.add(r.sradminidsale);
  }
  const repIdsInWindow = Array.from(repSet);

  // Hydrate rep names from tb_admin (camelCase per php-port-patterns.md).
  type AdminRow = { adminID: string; adminFirstName: string | null; adminLastName: string | null };
  let adminByID = new Map<string, AdminRow>();
  if (repIdsInWindow.length > 0) {
    const { data: adminsRaw, error: adminsErr } = await admin
      .from("tb_admin")
      .select("adminID, adminFirstName, adminLastName")
      .in("adminID", repIdsInWindow);
    if (adminsErr) {
      console.error("[tb_admin reps] failed", { code: adminsErr.code, message: adminsErr.message });
    }
    adminByID = new Map(((adminsRaw ?? []) as unknown as AdminRow[]).map((a) => [a.adminID, a]));
  }
  const repOptions: RepOption[] = repIdsInWindow
    .map((id) => {
      const a = adminByID.get(id);
      const name = a ? [a.adminFirstName, a.adminLastName].filter(Boolean).join(" ").trim() : "";
      return {
        adminID: id,
        display: name ? `${id} · ${name}` : id,
      };
    })
    .sort((a, b) => a.display.localeCompare(b.display, "th"));

  // ── 2. Main report query ──
  let reportQ = admin
    .from("tb_sales_report")
    .select("id, srdate, fid, sradminidsale")
    .gte("srdate", `${dateFrom}T00:00:00`)
    .lte("srdate", `${dateTo}T23:59:59`)
    .order("srdate", { ascending: false })
    .limit(2000);
  if (repId) reportQ = reportQ.eq("sradminidsale", repId);
  const { data: reportRaw, error: reportErr } = await reportQ;
  if (reportErr) {
    console.error("[tb_sales_report list] failed", { code: reportErr.code, message: reportErr.message });
  }
  type SrRow = { id: number; srdate: string | null; fid: number; sradminidsale: string };
  const srRows = (reportRaw ?? []) as unknown as SrRow[];

  // ── 3. Batch-hydrate tb_forwarder for fid set ──
  type FwdRow = {
    id: number;
    userid: string | null;
    ftotalprice: number | string | null;
    fdiscount: number | string | null;
    fstatus: string | null;
    ftrackingchn: string | null;
  };
  const fIds = Array.from(new Set(srRows.map((r) => r.fid)));
  let fwdById = new Map<number, FwdRow>();
  if (fIds.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, ftotalprice, fdiscount, fstatus, ftrackingchn")
      .in("id", fIds);
    if (fwdErr) {
      console.error("[tb_forwarder list] failed", { code: fwdErr.code, message: fwdErr.message });
    }
    fwdById = new Map(((fwdRaw ?? []) as unknown as FwdRow[]).map((f) => [f.id, f]));
  }

  // ── 4. Optional: customer name via tb_users (camelCase: userID) ──
  type UserRow = { userID: string; userName: string | null; userLastName: string | null; userCompany: string | null };
  const userIds = Array.from(new Set([...fwdById.values()].map((f) => f.userid).filter((v): v is string => !!v)));
  let userByID = new Map<string, UserRow>();
  let corpNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany")
      .in("userID", userIds);
    if (usersErr) {
      console.error("[tb_users names] failed", { code: usersErr.code, message: usersErr.message });
    }
    userByID = new Map(((usersRaw ?? []) as unknown as UserRow[]).map((u) => [u.userID, u]));
    // Juristic display: batched tb_corporate name lookup (no N+1) so นิติบุคคล
    // customers show the company name, not the contact person.
    corpNames = await fetchCorporateNameMap(admin, userIds);
  }

  // ── 5. Assemble rows ──
  const rows: ReportRow[] = srRows.map((r) => {
    const f = fwdById.get(r.fid);
    const u = f?.userid ? userByID.get(f.userid) : null;
    const displayName = u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(corpNames.get(u.userID)),
        }).name
      : "";
    const customer = u
      ? [u.userID, displayName].filter(Boolean).join(" ").trim() || u.userID
      : f?.userid ?? null;
    return {
      id:            r.id,
      srdate:        r.srdate,
      fid:           r.fid,
      sradminidsale: r.sradminidsale,
      customer,
      ftotalprice:   Number(f?.ftotalprice ?? 0),
      fdiscount:     Number(f?.fdiscount   ?? 0),
      fstatus:       f?.fstatus ?? null,
      fTrackingCHN:  f?.ftrackingchn ?? null,
    };
  });

  // ── 6. Per-rep rollup + totals ──
  const repAgg = new Map<string, { count: number; gross: number; net: number }>();
  let totalGross = 0;
  let totalNet   = 0;
  for (const r of rows) {
    const slot = repAgg.get(r.sradminidsale) ?? { count: 0, gross: 0, net: 0 };
    const net = r.ftotalprice - r.fdiscount;
    slot.count += 1;
    slot.gross += r.ftotalprice;
    slot.net   += net;
    totalGross += r.ftotalprice;
    totalNet   += net;
    repAgg.set(r.sradminidsale, slot);
  }
  const repBoard = Array.from(repAgg.entries())
    .map(([id, agg]) => {
      const opt = repOptions.find((o) => o.adminID === id);
      return {
        adminID: id,
        display: opt?.display ?? id,
        count:   agg.count,
        gross:   agg.gross,
        net:     agg.net,
      };
    })
    .sort((a, b) => b.net - a.net);

  // PERF (2026-06-03): paginate the DISPLAYED detail table (50/page). The
  // leaderboard rollup + gross/net totals + CSV stay full-set-correct because
  // they reduce over the full `rows`; only the rendered detail tbody is sliced.
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // ── 7. CSV ──
  const csvRows: CsvRow[] = rows.map((r) => ({
    srdate:        r.srdate ? new Date(r.srdate).toLocaleString("th-TH") : "",
    rep:           r.sradminidsale,
    fid:           r.fid,
    tracking:      r.fTrackingCHN ?? "",
    customer:      r.customer ?? "",
    ftotalprice:   r.ftotalprice,
    fdiscount:     r.fdiscount,
    net:           r.ftotalprice - r.fdiscount,
    fstatus:       r.fstatus ?? "",
  }));

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/forwarder-sales" />
      <main className="p-6 lg:p-8 space-y-5">
        <PageHeader
          eyebrow="ADMIN · SALES ATTRIBUTION"
          title="รายงานยอดขาย Sales Rep (ฝากนำเข้า)"
          subtitle={
            <>
              ใครปิดออเดอร์ไหน · {rows.length.toLocaleString("th-TH")} forwarder ในช่วงที่เลือก ·
              อ้างอิงจาก <code className="bg-surface-alt px-1 rounded text-xs">tb_sales_report</code> ของจริง
              <span className="block mt-1 text-[11px]">
                📊 ADR-0026 repoint จาก dead <code>sales_commissions</code> · ค่าคอมจ่ายอยู่ที่ <Link href="/admin/commissions" className="underline">/admin/commissions</Link>
              </span>
            </>
          }
        />

        {/* Filters */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
          <form method="GET" action="/admin/forwarder-sales" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="date_from" value={dateFrom} />
            <input type="hidden" name="date_to" value={dateTo} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-muted">Sales rep</span>
              <select
                name="rep"
                defaultValue={repId}
                className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs min-w-[200px]"
              >
                <option value="">— ทุกคน —</option>
                {repOptions.map((o) => (
                  <option key={o.adminID} value={o.adminID}>{o.display}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
              กรอง
            </button>
            {repId && (
              <Link
                href={`/admin/forwarder-sales?date_from=${dateFrom}&date_to=${dateTo}`}
                className="text-xs text-muted hover:text-foreground"
              >
                ล้าง
              </Link>
            )}
          </form>
          <AdminDateFilter
            tab={`rep=${encodeURIComponent(repId)}`}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </section>

        {/* Summary cards */}
        <section className="grid sm:grid-cols-4 gap-3">
          <Stat label="จำนวนรายการ" value={rows.length.toLocaleString("th-TH")} />
          <Stat label="Reps ที่ active" value={repBoard.length.toLocaleString("th-TH")} />
          <Stat label="ยอดขายรวม (gross)" value={thb(totalGross)} small />
          <Stat label="หลังหักส่วนลด (net)" value={thb(totalNet)} />
        </section>

        {/* Leaderboard */}
        {repBoard.length > 0 && (
          <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <h2 className="font-bold text-sm mb-3">🏆 อันดับ Sales Rep ในช่วงนี้</h2>
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Sales Rep</th>
                    <th className="px-3 py-2 text-right">จำนวนออเดอร์</th>
                    <th className="px-3 py-2 text-right">ยอดขาย (gross)</th>
                    <th className="px-3 py-2 text-right">หลังหักลด (net)</th>
                  </tr>
                </thead>
                <tbody>
                  {repBoard.slice(0, 20).map((r, idx) => (
                    <tr key={r.adminID} className="border-t border-border">
                      <td className="px-3 py-2 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-2 text-xs">{r.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.count.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.gross)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-primary-700">{thb(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* CSV */}
        <div className="flex justify-end">
          <CsvButton
            rows={csvRows}
            cols={[
              { key: "srdate",      label: "วันที่ลูกค้าชำระ" },
              { key: "rep",         label: "Sales Rep" },
              { key: "fid",         label: "Forwarder ID" },
              { key: "tracking",    label: "Tracking CHN" },
              { key: "customer",    label: "ลูกค้า" },
              { key: "ftotalprice", label: "ยอดขาย (gross)" },
              { key: "fdiscount",   label: "ส่วนลด" },
              { key: "net",         label: "หลังหักลด" },
              { key: "fstatus",     label: "fStatus" },
            ]}
            filename={`pacred-forwarder-sales-${dateFrom}-to-${dateTo}${repId ? `-${repId}` : ""}.csv`}
          />
        </div>

        {/* Detail table */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-sm">📋 รายการ ({rows.length.toLocaleString("th-TH")})</h2>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full min-w-[800px] text-xs sm:text-sm">
              <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[11px] sm:text-[11px] text-muted">
                <tr>
                  <th className="px-3 py-2.5">วันที่ชำระ</th>
                  <th className="px-3 py-2.5">Forwarder</th>
                  <th className="px-3 py-2.5">Tracking CHN</th>
                  <th className="px-3 py-2.5">ลูกค้า</th>
                  <th className="px-3 py-2.5">Sales Rep</th>
                  <th className="px-3 py-2.5 text-right">ยอดขาย</th>
                  <th className="px-3 py-2.5 text-right">หลังหักลด</th>
                  <th className="px-3 py-2.5">fStatus</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted">
                      ไม่มี <code className="bg-surface-alt px-1 rounded text-xs">tb_sales_report</code> ในช่วงที่เลือก
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        {r.srdate ? new Date(r.srdate).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/forwarders/${r.fid}`} className="text-primary-600 hover:underline font-mono text-xs">
                          #{r.fid}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted whitespace-nowrap">
                        {r.fTrackingCHN ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {r.customer ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {r.sradminidsale}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{thb(r.ftotalprice)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-primary-700">
                        {thb(r.ftotalprice - r.fdiscount)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-surface-alt text-foreground border border-border px-2 py-0.5 text-[11px]">
                          {r.fstatus ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4">
            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={rows.length}
              basePath="/admin/forwarder-sales"
              params={{ rep: repId || undefined, date_from: dateFrom, date_to: dateTo }}
            />
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono text-foreground ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
