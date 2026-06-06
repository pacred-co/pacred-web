/**
 * /admin/wallet/withdrawals — dedicated customer-WITHDRAW approval queue.
 * P1-26 (ADR-0018 D-2 rule 1 + rule 3 ¶3-4 · 2026-05-30).
 *
 * Why a dedicated page (reachability · AGENTS.md §0d): the customer withdraw
 * flow (submitWithdrawRequest → tb_wallet_hs type='3' status='1') had NO
 * obvious admin entry point. The generic /admin/wallet?view=tx&kind=withdraw
 * filter existed but (a) was mislabeled/wired to type='7' (fixed) and (b) is
 * buried behind a top-menu filter. The owner directive is "every function
 * needs a clear ≤3-click entry". This page IS that entry: sidebar
 * กระเป๋าสตางค์ → top-menu "รายการถอนเงิน (รออนุมัติ)" → here (2 clicks), with
 * inline approve/reject so accounting clears the queue without drilling in.
 *
 * Legacy parity: faithful to `pcs-admin/wallet.php?page=withdraw` list mode
 * (w-s-withdraw.php) — a list of pending withdraw rows the admin acts on.
 * The per-row detail (slip · similar-tx · bank block) stays on
 * /admin/wallet/[id]; this is the batch-clear surface.
 *
 * Reads: tb_wallet_hs WHERE type='3' (customer withdraw) + tb_users (names) +
 * tb_wallet (live balance per customer, to sanity-check the refund-on-reject).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportWithdrawalsAll } from "@/actions/admin/export/withdrawals";
import { ArrowLeft } from "lucide-react";
import { WithdrawRowActions } from "./withdraw-row-actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "จ่ายแล้ว",
  "3": "ปฏิเสธ (คืนเงินแล้ว)",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};

const WALLET_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/wallet" },
  { label: "ประวัติรายการ", href: "/admin/wallet?view=tx" },
  { label: "รายการถอนเงิน", href: "/admin/wallet/withdrawals" },
  {
    label: "จัดการ",
    children: [
      { label: "จ่ายแทนลูกค้า", href: "/admin/wallet/pay-user" },
      { label: "ประวัติทั้งหมด", href: "/admin/wallet/history" },
      { label: "เพิ่ม Topup ด้วยมือ", href: "/admin/wallet/add" },
      { label: "คืนเงินลูกค้า", href: "/admin/refunds" },
    ],
  },
];

type WhsRow = {
  id: number;
  date: string | null;
  amount: number | null;
  status: string | null;
  depositnamebank: string | null;
  nameuserbank: string | null;
  nouserbank: string | null;
  note: string | null;
  userid: string | null;
  adminidupdate: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

type SP = { status?: string; page?: string };

export default async function AdminWithdrawalsQueuePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Money page → accounting + ops (super implicit). Driver/warehouse refused.
  await requireAdmin(["ops", "accounting"]);
  const sp = await searchParams;

  // Default the queue to pending (status='1'); allow ?status=2/3 to review
  // history. Anything else → pending.
  const statusFilter = sp.status === "2" || sp.status === "3" ? sp.status : "1";

  const admin = createAdminClient();

  // Pending count for the header badge — type='3' (customer withdraw).
  const { count: pendingCount, error: countErr } = await admin
    .from("tb_wallet_hs")
    .select("id", { count: "exact", head: true })
    .eq("type", "3")
    .eq("status", "1");
  if (countErr) {
    console.error(`[tb_wallet_hs withdraw count] failed`, { code: countErr.code, message: countErr.message });
  }

  // PERF (2026-06-03): paginate (50/page via .range + exact count).
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);
  const { data: rowsRaw, error, count: totalWithdrawals } = await admin
    .from("tb_wallet_hs")
    .select("id,date,amount,status,depositnamebank,nameuserbank,nouserbank,note,userid,adminidupdate", { count: "exact" })
    .eq("type", "3")
    .eq("status", statusFilter)
    .order("date", { ascending: false })
    .range(rowFrom, rowTo);
  if (error) {
    console.error(`[tb_wallet_hs withdraw list] failed`, { code: error.code, message: error.message });
    throw new Error(`โหลดรายการถอนเงินไม่สำเร็จ (${error.code ?? "unknown"}): ${error.message}`);
  }
  const rows = (rowsRaw ?? []) as unknown as WhsRow[];

  // Merge customer names.
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[tb_users list] failed`, { code: usersErr.code, message: usersErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }

  const statusTabs: { key: string; label: string }[] = [
    { key: "1", label: "รออนุมัติ" },
    { key: "2", label: "จ่ายแล้ว" },
    { key: "3", label: "ปฏิเสธ" },
  ];

  return (
    <>
      <PageTopMenubar items={WALLET_MENUBAR} activeHref="/admin/wallet/withdrawals" />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">คำขอถอนเงินจากกระเป๋า</h1>
              {pendingCount ? (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  รออนุมัติ {pendingCount.toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted mt-1">
              ลูกค้ากดถอน → ยอดถูกหักจากกระเป๋าทันที (hold) · แอดมิน &ldquo;จ่ายเงิน&rdquo; เมื่อโอนเข้าบัญชีลูกค้าแล้ว ·
              &ldquo;ปฏิเสธ&rdquo; = คืนเงินเข้ากระเป๋า (ADR-0018)
            </p>
          </div>
          <Link
            href="/admin/wallet"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> กลับกระเป๋าสตางค์
          </Link>
        </div>

        {/* Status filter chips + CSV export — accounting downloads the
            withdrawal queue per status to reconcile against bank transfers. */}
        <div className="flex flex-wrap items-center gap-2">
          {statusTabs.map((t) => {
            const isActive = t.key === statusFilter;
            const href = t.key === "1" ? "/admin/wallet/withdrawals" : `/admin/wallet/withdrawals?status=${t.key}`;
            return (
              <Link
                key={t.key}
                href={href}
                className={
                  "rounded-full border px-3 py-1 text-xs " +
                  (isActive
                    ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                    : "border-border bg-white text-muted hover:bg-surface-alt")
                }
              >
                {t.label}
              </Link>
            );
          })}
          <div className="ml-auto">
            <CsvButton
              rows={rows.map((r) => {
                const u = r.userid ? userMap.get(r.userid) : undefined;
                const customerName = u
                  ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
                  : "";
                const row: CsvRow = {
                  id: r.id,
                  date: r.date ?? "",
                  userid: r.userid ?? "",
                  customer: customerName,
                  tel: u?.userTel ?? "",
                  amount: Number(r.amount ?? 0).toFixed(2),
                  bank: r.depositnamebank ?? "",
                  bank_account_name: r.nameuserbank ?? "",
                  bank_account_no: r.nouserbank ?? "",
                  status: STATUS_LABEL[r.status ?? ""] ?? r.status ?? "",
                  admin_action_by: r.adminidupdate ?? "",
                  note: r.note ?? "",
                };
                return row;
              })}
              fetchAll={async () => {
                "use server";
                // Export the FULL filtered withdrawal queue (all pages of the
                // active status tab) — audited via admin_export_log
                // (PII walk-off trail: bank account name + note · MONEY).
                return exportWithdrawalsAll(statusFilter);
              }}
              cols={[
                { key: "id",                label: "Wallet HS ID" },
                { key: "date",              label: "วันที่ขอ" },
                { key: "userid",            label: "รหัสลูกค้า" },
                { key: "customer",          label: "ชื่อลูกค้า" },
                { key: "tel",               label: "เบอร์โทร" },
                { key: "amount",            label: "จำนวน (฿)" },
                { key: "bank",              label: "ธนาคาร" },
                { key: "bank_account_name", label: "ชื่อบัญชี" },
                { key: "bank_account_no",   label: "เลขที่บัญชี" },
                { key: "status",            label: "สถานะ" },
                { key: "admin_action_by",   label: "Admin ดำเนินการ" },
                { key: "note",              label: "หมายเหตุ" },
              ]}
              filename={`withdrawals-status${statusFilter}-page${page}-${new Date().toISOString().slice(0, 10)}.csv`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>💸</div>
              <p className="text-sm font-medium text-foreground">
                {statusFilter === "1" ? "ไม่มีคำขอถอนเงินที่รออนุมัติ" : "ไม่มีรายการตามตัวกรองนี้"}
              </p>
              <p className="text-xs text-muted">ทุกคำขอถอนถูกดำเนินการแล้ว</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3">วันที่ขอ</th>
                    <th className="px-3 py-3">ลูกค้า</th>
                    <th className="px-3 py-3 text-right">จำนวน (THB)</th>
                    <th className="px-3 py-3">บัญชีปลายทาง</th>
                    <th className="px-3 py-3">สถานะ</th>
                    {statusFilter === "1" ? <th className="px-3 py-3">ดำเนินการ</th> : <th className="px-3 py-3">โดย</th>}
                    <th className="px-3 py-3">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const u = r.userid ? userMap.get(r.userid) : undefined;
                    const amount = Number(r.amount ?? 0);
                    const customerName = u
                      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                      : r.userid ?? "—";
                    const rowStatus = r.status ?? "1";
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {r.date
                            ? new Date(r.date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-mono">{r.userid ?? "—"}</div>
                          <div>{customerName}</div>
                          {u?.userTel ? <div className="text-muted">{u.userTel}</div> : null}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-sm font-bold text-red-600 whitespace-nowrap">
                          −฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-medium">{r.depositnamebank || "—"}</div>
                          {r.nameuserbank ? <div className="text-muted">{r.nameuserbank}</div> : null}
                          {r.nouserbank ? <div className="font-mono text-muted">{r.nouserbank}</div> : null}
                          {r.note ? <div className="mt-1 text-[11px] text-muted italic">หมายเหตุ: {r.note}</div> : null}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              STATUS_CLS[rowStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {STATUS_LABEL[rowStatus] ?? `status ${rowStatus}`}
                          </span>
                        </td>
                        {statusFilter === "1" ? (
                          <td className="px-3 py-3">
                            <WithdrawRowActions id={r.id} />
                          </td>
                        ) : (
                          <td className="px-3 py-3 text-xs font-mono text-muted">{r.adminidupdate ?? "—"}</td>
                        )}
                        <td className="px-3 py-3 text-xs">
                          <Link href={`/admin/wallet/${r.id}`} className="text-primary-600 hover:underline">
                            ดูเต็ม
                          </Link>
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
          total={totalWithdrawals ?? 0}
          basePath="/admin/wallet/withdrawals"
          params={{ status: sp.status }}
        />
        <p className="text-[11px] text-muted">⇆ เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์</p>
      </main>
    </>
  );
}
