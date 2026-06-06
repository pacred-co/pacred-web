/**
 * /admin/wallet?view=balance — per-customer wallet balance summary
 * (Wave 15 P0-1 · fidelity-gap-2026-05-24 §1).
 *
 * Legacy parity: `pcs-admin/wallet.php` L150-191 defaults to this view —
 * one row per customer with `walletTotal` + cash-back. Operators answer
 * "PR3963 มียอดเท่าไร?" in one click instead of scrolling tx history.
 *
 * Improvements over legacy (kept per AGENTS.md §0a):
 *   - Polished Pacred Tailwind cards (legacy was plain Bootstrap-4 striped table)
 *   - Single-row metric card replaces legacy's two-card header
 *   - Search + "show all" link (legacy used DataTables in-page only)
 *
 * Tradeoffs (call out so ภูม can sanity-check):
 *   - Top 200 rows by walletTotal DESC for the table (matches the rest of
 *     /admin/wallet). System-wide SUM is computed across ALL rows (limit 50k,
 *     same as /admin/page.tsx walletAll pattern · faithful).
 *   - Skipped: avatar + VIP badge — flagged 🟠 polish in the audit, not P0.
 *   - Each row links to `/admin/customers/[userid]` per audit recommendation.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletSystemTotals } from "@/lib/admin/wallet-totals";
import { pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { Link } from "@/i18n/navigation";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:     { label: "ใช้งาน", cls: "bg-green-50 text-green-700 border-green-200" },
  suspended:  { label: "ระงับ",  cls: "bg-red-50 text-red-700 border-red-200" },
};

type WalletRow = { userid: string; wallettotal: number | null };
type CashBackRow = { userid: string; cbtotal: number | null };
type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  coID: string | null;
  userStatus: string | null;
};

export type BalanceViewProps = {
  q: string | undefined;
  /** Lane C 2026-06-02 — sortable column header (ภูม flag #3). */
  sort?: string;
  dir?: string;
  /** 1-based page (server-side .range pagination · 2026-06-03). */
  page?: number;
};

// Lane C 2026-06-02 — server-side sort field whitelist.
const BALANCE_SORT_FIELDS: Record<string, string> = {
  wallettotal: "wallettotal",
  userid:      "userid",
};

export async function WalletBalanceView({ q, sort, dir, page = 1 }: BalanceViewProps) {
  const admin = createAdminClient();
  const { from: rowFrom, to: rowTo } = pageRange(page);

  // ── System-wide totals (faithful to legacy L107-127 + L165 admin/page.tsx pattern).
  // PERF (2026-06-03): pulled into the shared `getWalletSystemTotals()` helper,
  // cached 60 s (lib/admin/wallet-totals.ts). Previously this pulled ~9k+9k
  // rows + summed in JS on EVERY wallet-page render; now it's cached + shared
  // with the /admin dashboard. PostgREST still has no SUM endpoint — the cache
  // is what makes the full-table pull cheap (≤ once a minute, not per nav).
  const { sumWallet, sumCb, walletCount, cbCount } = await getWalletSystemTotals();

  // ── Top-200 wallets by balance DESC (matches legacy ORDER BY walletTotal DESC).
  // Lane C 2026-06-02 — respect ?sort=&dir= from URL with whitelist; default
  // wallettotal desc (legacy parity).
  const sortKey = sort && BALANCE_SORT_FIELDS[sort] ? sort : "wallettotal";
  const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";
  const sortColumn = BALANCE_SORT_FIELDS[sortKey];
  // PERF (2026-06-03): paginate 50/page via .range + exact count.
  let wq = admin
    .from("tb_wallet")
    .select("userid,wallettotal", { count: "exact" })
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(rowFrom, rowTo);
  if (q && q.trim()) wq = wq.eq("userid", q.trim().toUpperCase());

  // Pre-compute sort hrefs (Server Components can't ship functions).
  const sortHrefs: Record<string, string> = {};
  for (const k of Object.keys(BALANCE_SORT_FIELDS)) {
    const nextDir = sortKey === k && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    params.set("view", "balance");
    if (q) params.set("q", q);
    params.set("sort", k);
    params.set("dir", nextDir);
    sortHrefs[k] = `/admin/wallet?${params.toString()}`;
  }

  const { data: walletRowsRaw, error, count: totalWallets } = await wq;
  const walletRows = (walletRowsRaw ?? []) as unknown as WalletRow[];

  // ── Batch-join tb_users + tb_cash_back for the rows on screen.
  const userIds = walletRows.map((r) => r.userid);
  const [userMap, cbMap] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve(new Map<string, UserRow>())
      : admin
          .from("tb_users")
          .select("userID,userName,userLastName,coID,userStatus")
          .in("userID", userIds)
          .then(({ data }) => new Map(((data ?? []) as unknown as UserRow[]).map((u) => [u.userID, u]))),
    userIds.length === 0
      ? Promise.resolve(new Map<string, number>())
      : admin
          .from("tb_cash_back")
          .select("userid,cbtotal")
          .in("userid", userIds)
          .then(({ data }) => {
            const m = new Map<string, number>();
            for (const r of (data ?? []) as unknown as CashBackRow[]) {
              m.set(r.userid, Number(r.cbtotal ?? 0));
            }
            return m;
          }),
  ]);

  return (
    <>
      {/* ── Metric card: system-wide totals (legacy L107-127 equivalent) ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">ยอดเงินทั้งหมดในระบบ</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            ฿{sumWallet.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            รวมจาก tb_wallet ทุกบัญชี ({walletCount.toLocaleString()} ราย)
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">Cash Back ทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">
            ฿{sumCb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            รวมจาก tb_cash_back ({cbCount.toLocaleString()} ราย)
          </p>
        </div>
      </section>

      {/* ── Search box (Pacred improvement — legacy used DataTables only) ── */}
      <form className="flex gap-2 flex-wrap items-center" action="/admin/wallet">
        <input type="hidden" name="view" value="balance" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="ค้นหา รหัสสมาชิก (PR…)"
          className="rounded-lg border border-border px-3 py-2 text-sm w-72"
        />
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">
          ค้นหา
        </button>
        {q ? (
          <Link
            href="/admin/wallet?view=balance"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-alt"
          >
            ล้าง
          </Link>
        ) : null}
        {/* CSV export — current page only (paginate 50/page · faithful to what's
            on screen). Operators export per-page slices for spreadsheets;
            wallet system-wide totals card already shows the grand sum. */}
        <div className="ml-auto">
          <CsvButton
            rows={walletRows.map((r) => {
              const u = userMap.get(r.userid);
              const fullName = u
                ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
                : "";
              const cb = cbMap.get(r.userid) ?? 0;
              const wt = Number(r.wallettotal ?? 0);
              const isSuspended = u?.userStatus === "0";
              const row: CsvRow = {
                memberCode: r.userid,
                coID: u?.coID ?? "",
                fullName,
                walletTotal: wt.toFixed(2),
                cashBack: cb.toFixed(2),
                status: isSuspended ? "ระงับ" : "ใช้งาน",
              };
              return row;
            })}
            cols={[
              { key: "memberCode",  label: "รหัสสมาชิก" },
              { key: "coID",        label: "รหัสเก่า (coID)" },
              { key: "fullName",    label: "ชื่อ-นามสกุล" },
              { key: "walletTotal", label: "ยอดเงินคงเหลือ (฿)" },
              { key: "cashBack",    label: "Cash Back (฿)" },
              { key: "status",      label: "สถานะ" },
            ]}
            filename={`wallet-balance-page${page}${q ? `-${q}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {walletRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>👛</div>
            <p className="text-sm font-medium text-foreground">ไม่พบกระเป๋าลูกค้า</p>
            <p className="text-xs text-muted max-w-md mx-auto">
              {q ? `ไม่พบรหัสสมาชิก "${q}" — ตรวจสะกดอีกครั้ง` : "ยังไม่มีข้อมูลใน tb_wallet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 w-12">ลำดับ</th>
                  <BalanceSortTh label="รหัสสมาชิก"     field="userid"      activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} />
                  <th className="px-3 py-3">ชื่อ-นามสกุล</th>
                  <BalanceSortTh label="ยอดเงินคงเหลือ" field="wallettotal" activeKey={sortKey} activeDir={sortDir} hrefs={sortHrefs} align="right" />
                  <th className="px-3 py-3 text-right">Cash Back</th>
                  <th className="px-3 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {walletRows.map((r, idx) => {
                  const u = userMap.get(r.userid);
                  const fullName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—"
                    : "—";
                  const cb = cbMap.get(r.userid) ?? 0;
                  const wt = Number(r.wallettotal ?? 0);
                  const isSuspended = u?.userStatus === "0";
                  const statusKey = isSuspended ? "suspended" : "active";
                  return (
                    <tr key={r.userid} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-3 text-xs text-muted">{idx + 1}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/customers/${r.userid}`}
                          className="font-mono text-xs text-primary-600 hover:underline"
                        >
                          {r.userid}
                        </Link>
                        {u?.coID ? (
                          <div className="text-[10px] text-muted font-mono mt-0.5">
                            {u.coID}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs">{fullName}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm font-semibold text-foreground">
                        ฿{wt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-purple-600">
                        {cb > 0
                          ? `฿${cb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CFG[statusKey].cls}`}
                        >
                          {STATUS_CFG[statusKey].label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalWallets ?? 0}
        basePath="/admin/wallet"
        params={{ view: "balance", q, sort, dir }}
      />
      <p className="text-[11px] text-muted">
        เรียงยอด wallet สูงสุดก่อน — ใช้ค้นหารหัสสมาชิกเพื่อดูเฉพาะรายใดรายหนึ่ง
      </p>
    </>
  );
}

function BalanceSortTh({
  label,
  field,
  activeKey,
  activeDir,
  hrefs,
  align,
}: {
  label: string;
  field: string;
  activeKey: string;
  activeDir: "asc" | "desc";
  hrefs: Record<string, string>;
  align?: "right";
}) {
  const active = activeKey === field;
  const arrow = active ? (activeDir === "asc" ? "↑" : "↓") : "⇵";
  const cls = align === "right" ? "text-right" : "";
  return (
    <th className={`px-3 py-3 ${cls}`}>
      <Link
        href={hrefs[field]}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-primary-700 font-semibold" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <span className="text-[9px]" aria-hidden>{arrow}</span>
      </Link>
    </th>
  );
}
