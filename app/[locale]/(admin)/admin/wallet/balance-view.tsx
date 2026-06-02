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
};

export async function WalletBalanceView({ q }: BalanceViewProps) {
  const admin = createAdminClient();

  // ── System-wide totals (faithful to legacy L107-127 + L165 admin/page.tsx pattern).
  // PostgREST has no aggregate-fn endpoint; we pull the rows + sum in app.
  // .limit(50_000) matches the admin/page.tsx walletAll precedent (8,898
  // customers → comfortably under cap).
  // Wave 21 P2 Phase A: Two SUMs (wallet + cash_back) — both fetch full tables
  // to reduce in JS. Survey docs/research/wave-21-p2-query-survey.md §2 + §6 —
  // to be replaced by a `get_wallet_system_totals()` RPC in Phase C. Leaving
  // the fetches for now: PostgREST has no SUM endpoint + staff want fresh data.
  const [{ data: allWalletsForSum }, { data: allCbForSum }] = await Promise.all([
    admin.from("tb_wallet").select("wallettotal").limit(50_000),
    admin.from("tb_cash_back").select("cbtotal").limit(50_000),
  ]);
  const sumWallet = (allWalletsForSum ?? []).reduce(
    (s, r) => s + Number((r as { wallettotal: number | null }).wallettotal ?? 0),
    0,
  );
  const sumCb = (allCbForSum ?? []).reduce(
    (s, r) => s + Number((r as { cbtotal: number | null }).cbtotal ?? 0),
    0,
  );

  // ── Top-200 wallets by balance DESC (matches legacy ORDER BY walletTotal DESC).
  let wq = admin
    .from("tb_wallet")
    .select("userid,wallettotal")
    .order("wallettotal", { ascending: false })
    .limit(200);
  if (q && q.trim()) wq = wq.eq("userid", q.trim().toUpperCase());

  const { data: walletRowsRaw, error } = await wq;
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
            รวมจาก tb_wallet ทุกบัญชี ({(allWalletsForSum ?? []).length.toLocaleString()} ราย)
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
          <p className="text-xs text-muted">Cash Back ทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">
            ฿{sumCb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            รวมจาก tb_cash_back ({(allCbForSum ?? []).length.toLocaleString()} ราย)
          </p>
        </div>
      </section>

      {/* ── Search box (Pacred improvement — legacy used DataTables only) ── */}
      <form className="flex gap-2 flex-wrap" action="/admin/wallet">
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
                  <th className="px-3 py-3">รหัสสมาชิก</th>
                  <th className="px-3 py-3">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-3 text-right">ยอดเงินคงเหลือ</th>
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

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน 200 อันดับแรก (ยอด wallet สูงสุดก่อน) — ใช้ค้นหารหัสสมาชิกเพื่อดูเฉพาะรายใดรายหนึ่ง
      </p>
    </>
  );
}
