/**
 * /admin/reports/debtors — ลูกค้าติดหนี้กระเป๋า
 *
 * Wave 20 P0-4 follow-up (2026-05-26) — schema swap rebuilt → legacy.
 * Was reading the rebuilt `wallet` + `profiles` tables (both EMPTY on
 * prod). Swapped to `tb_wallet.wallettotal < 0` + `tb_users` 2-pass
 * lookup + `tb_cash_back.cbtotal` for the cashback column.
 *
 * Important — Pacred legacy `tb_wallet` enforces non-negative balance
 * at insert time (every customer-side spend goes through the wallet-
 * deduct flow which refuses if insufficient funds). So this report
 * shows 0 rows on prod most of the time. The REAL "ลูกค้าค้างชำระ"
 * surface in legacy is `tb_forwarder.fcredit='1'` with status not
 * yet delivered — that lives at `/admin/reports/credit-pending`
 * which is the page operators actually use for "who owes us money".
 *
 * This page is preserved (not redirected) because:
 * - Wallet negative IS still theoretically possible (admin manual
 *   adjustments via tb_wallet_hs.type='5' can over-deduct)
 * - It's a safety check operators want to confirm "no leak"
 * - A 0-row "🎉 ไม่มีลูกค้าติดหนี้กระเป๋า" is a meaningful "all clear"
 *   signal vs an actual error
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

export const dynamic = "force-dynamic";

type WalletRow = {
  userid: string;
  wallettotal: number;
};
type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};
type CashBackRow = {
  userid: string;
  cbtotal: number | null;
};

function thb(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "฿" + Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function DebtorsReport() {
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  // Wallet-balance debtors — tb_wallet where wallettotal < 0.
  // §0c: destructure error + throw on the load-bearing read.
  const { data: walletRaw, error: walletErr } = await admin
    .from("tb_wallet")
    .select("userid, wallettotal")
    .lt("wallettotal", 0)
    .order("wallettotal", { ascending: true })
    .limit(500);
  if (walletErr) {
    console.error(`[tb_wallet debtors list] failed`, {
      code: walletErr.code, message: walletErr.message, details: walletErr.details,
    });
    throw new Error(`Failed to load tb_wallet (${walletErr.code ?? "unknown"}): ${walletErr.message}`);
  }
  const wallets = (walletRaw ?? []) as WalletRow[];

  // 2-pass: customer names + cashback balances (parallel).
  const useridList = wallets.map((w) => w.userid).filter(Boolean);
  let userMap: Record<string, UserRow> = {};
  let cbMap: Record<string, number> = {};
  if (useridList.length > 0) {
    const [usersRes, cbRes] = await Promise.all([
      admin.from("tb_users").select("userID, userName, userLastName, userTel").in("userID", useridList),
      admin.from("tb_cash_back").select("userid, cbtotal").in("userid", useridList),
    ]);
    if (usersRes.error) {
      console.error(`[tb_users debtors join] failed`, { code: usersRes.error.code, message: usersRes.error.message });
    } else {
      userMap = Object.fromEntries(((usersRes.data ?? []) as UserRow[]).map((u) => [u.userID, u]));
    }
    if (cbRes.error) {
      console.error(`[tb_cash_back debtors join] failed`, { code: cbRes.error.code, message: cbRes.error.message });
    } else {
      cbMap = Object.fromEntries(((cbRes.data ?? []) as CashBackRow[]).map((c) => [c.userid, Number(c.cbtotal ?? 0)]));
    }
  }

  const totalDebt = wallets.reduce((s, w) => s + Number(w.wallettotal), 0);

  const csvRows = wallets.map((w) => {
    const u = userMap[w.userid];
    return {
      userid: w.userid,
      name: u ? [u.userName, u.userLastName].filter(Boolean).join(" ") : "",
      phone: u?.userTel ?? "",
      wallet_balance: w.wallettotal,
      cashback_balance: cbMap[w.userid] ?? 0,
    };
  });
  const csvCols = [
    { key: "userid",            label: "รหัสลูกค้า" },
    { key: "name",              label: "ชื่อลูกค้า" },
    { key: "phone",             label: "เบอร์" },
    { key: "wallet_balance",    label: "ยอดกระเป๋า (บาท)" },
    { key: "cashback_balance",  label: "ยอด cashback (บาท)" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">ลูกค้าติดหนี้กระเป๋า</h1>
          <p className="mt-1 text-sm text-muted">
            ลูกค้าที่ยอดกระเป๋าติดลบ — เรียงหนี้ลึกสุดบนสุด
          </p>
        </div>
        <div className="flex gap-2">
          <CsvButton rows={csvRows} cols={csvCols} filename={`debtors-${new Date().toISOString().slice(0,10)}.csv`} />
          <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt self-center">← กลับรีพอร์ตหลัก</Link>
        </div>
      </div>

      {/* Wave 20 P0-4: cross-link to credit-pending which is the REAL
          "ลูกค้าค้างชำระเครดิต" surface (legacy tb_forwarder.fcredit='1'
          flow). Most "debt" in Pacred is credit-line not wallet-overdraft. */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
        <span aria-hidden>💡</span>
        <div className="flex-1">
          <p className="font-medium">หน้านี้แสดงเฉพาะ &ldquo;หนี้กระเป๋า&rdquo; (wallet ติดลบ)</p>
          <p className="mt-0.5 text-xs">
            สำหรับลูกค้าที่ค้างจ่ายค่าฝากนำเข้าด้วยเครดิต ดูที่ →{" "}
            <Link href="/admin/reports/credit-pending" className="font-medium underline hover:text-blue-700">
              รายงานเครดิตค้างชำระ
            </Link>
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card label="ลูกค้าที่ติดหนี้" value={String(wallets.length)} highlight={wallets.length > 0} />
        <Card label="หนี้รวม (บาท)" value={thb(totalDebt)} highlight={totalDebt < 0} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {wallets.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">🎉 ไม่มีลูกค้าติดหนี้กระเป๋า</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอดกระเป๋า</th>
                  <th className="px-4 py-3 text-right">cashback</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => {
                  const u = userMap[w.userid];
                  const customerName = u ? [u.userName, u.userLastName].filter(Boolean).join(" ") : "";
                  return (
                    <tr key={w.userid} className="border-t border-border">
                      <td className="px-4 py-3 text-xs">
                        <p>{customerName || "—"}</p>
                        <p className="font-mono text-[10px] text-muted">{w.userid}</p>
                        {u?.userTel && <p className="text-[10px] text-muted">☎ {u.userTel}</p>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${Number(w.wallettotal) < 0 ? "text-red-700" : "text-muted"}`}>
                        {thb(Number(w.wallettotal))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted">{thb(cbMap[w.userid] ?? 0)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/customers/${w.userid}`} className="text-xs text-primary-600 hover:underline">เปิด →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
