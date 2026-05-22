/**
 * /admin/wallet — รายการกระเป๋าสตางค์ (faithful port · Wave 7.2 · 2026-05-21 night)
 *
 * Rewrite from `wallet_transactions` (rebuilt · empty on prod) → `tb_wallet_hs`
 * (104,591 rows · 1,470 pending). Dashboard + `/admin/wallet/[id]` already
 * read tb_wallet_hs; the list was the only surface still reading the rebuilt
 * schema → operators saw "no pending approvals" while customers' top-ups
 * piled up. ภูม flagged this as the single biggest "wrong data" gap.
 *
 * Legacy `tb_wallet_hs` columns (verified 2026-05-21 via REST):
 *   id, date, dateslip, amount, status, type, typenew, typeservice,
 *   paydeposit, admincreate, imagesslip, depositnamebank, nameuserbank,
 *   nouserbank, note, adminid, adminidupdate, lockdate, session, reforder,
 *   reforder2, whno, wusercredit, userid, adminidcrate.
 *
 * type taxonomy (legacy):
 *   1 = topup (customer paid in)             — positive amount, needs slip approval
 *   2 = topup (manual · admin adds)          — positive, super only
 *   4 = wallet-pay for an order              — positive (auto, no approval)
 *   7 = withdrawal (customer requests money out) — negative, needs approval
 *
 * Wave 8 backlog: bulk-approve bar + slip-transferred-at editor +
 * admin-initiated topup form (`/admin/wallet/add`) + พายแทนลูกค้า
 * (`/admin/wallet/pay-user`).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { TbWalletBulkBar, TbWalletRowCheckbox } from "./tb-bulk-bar";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — same shape as Wave 7 (ภูม brief 2026-05-20 ค่ำ).
// URLs updated for the new tb_wallet_hs filter params (status=1/2/3 +
// kind=topup/withdraw instead of the rebuilt schema's kind=deposit/withdraw
// + status=pending/completed).
// ─────────────────────────────────────────────────────────────────────
const WALLET_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/wallet" },
  {
    label: "กรองรายการ",
    children: [
      { label: "ทั้งหมด",    href: "/admin/wallet" },
      { label: "รอเติมเงิน", href: "/admin/wallet?kind=topup&status=1" },
      { label: "รอถอน",      href: "/admin/wallet?kind=withdraw&status=1" },
      { label: "อนุมัติแล้ว", href: "/admin/wallet?status=2" },
    ],
  },
  {
    label: "จัดการ",
    children: [
      { label: "จ่ายแทนลูกค้า",       href: "/admin/wallet/pay-user" },
      { label: "ประวัติทั้งหมด",      href: "/admin/wallet/history" },
      { label: "เพิ่ม Topup ด้วยมือ", href: "/admin/wallet/add" },
      // Wave 7.3 (2026-05-22): wired refunds orphan per ภูม decision in
      // page-inventory-2026-05-21-night.md §🔴 DEAD. Refunds is a Pacred-
      // only feature (no legacy equivalent) but conceptually lives under
      // wallet management — money flowing back to the customer wallet.
      { label: "คืนเงินลูกค้า",        href: "/admin/refunds" },
    ],
  },
];

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};

// type → kind label + colour (legacy taxonomy · see header docblock)
const TYPE_LABEL: Record<string, string> = {
  "1": "เติมเงิน",
  "2": "เติม (manual)",
  "4": "ชำระจากกระเป๋า",
  "7": "ถอนเงิน",
};
const TYPE_CLS: Record<string, string> = {
  "1": "bg-green-50 text-green-700 border-green-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "4": "bg-blue-50 text-blue-700 border-blue-200",
  "7": "bg-red-50 text-red-700 border-red-200",
};

const KIND_TABS: { key: string | null; label: string; types: string[] | null }[] = [
  { key: null,       label: "ทั้งหมด", types: null },
  { key: "topup",    label: "เติมเงิน (รอตรวจ + manual)", types: ["1", "2"] },
  { key: "withdraw", label: "ถอนเงิน", types: ["7"] },
  { key: "orderpay", label: "ชำระจากกระเป๋า", types: ["4"] },
];

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "ทุกสถานะ" },
  { key: "1",  label: "รอตรวจ" },
  { key: "2",  label: "อนุมัติ" },
  { key: "3",  label: "ปฏิเสธ" },
];

type WhsRow = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number | null;
  status: string | null;
  type: string | null;
  imagesslip: string | null;
  depositnamebank: string | null;
  note: string | null;
  userid: string | null;
  adminid: string | null;
  adminidcrate: string | null;
};

type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
};

type SP = { kind?: string; status?: string; q?: string };

export default async function AdminWalletPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. The (admin) layout only
  // proves "some admin"; this page reads every customer's wallet PII
  // (bank, account no., slips) via createAdminClient (RLS-bypass), so a
  // low-trust driver/warehouse admin must be refused here, not just in
  // the nav. Money page → accounting + ops (super implicit).
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Map ?kind=... to the matching `type` values.
  const kindTab = KIND_TABS.find((t) => t.key === sp.kind);
  const typeFilter = kindTab?.types ?? null;
  // Back-compat: legacy menubar URLs used kind=deposit, kind=withdraw,
  // status=pending. Translate those silently.
  const legacyKindMap: Record<string, string[]> = {
    deposit: ["1", "2"],
    withdraw: ["7"],
  };
  const legacyTypeFilter = sp.kind && legacyKindMap[sp.kind] ? legacyKindMap[sp.kind] : null;
  const effectiveTypeFilter = typeFilter ?? legacyTypeFilter;

  const statusFilter = sp.status === "pending" ? "1" : sp.status ?? "";

  let q = admin
    .from("tb_wallet_hs")
    .select(
      "id,date,dateslip,amount,status,type,imagesslip,depositnamebank,note,userid,adminid,adminidcrate",
    )
    .order("date", { ascending: false })
    .limit(200);

  if (effectiveTypeFilter && effectiveTypeFilter.length > 0) {
    q = q.in("type", effectiveTypeFilter);
  }
  if (statusFilter && /^[123]$/.test(statusFilter)) {
    q = q.eq("status", statusFilter);
  }
  if (sp.q) {
    const term = sp.q.trim();
    if (/^\d+$/.test(term)) q = q.eq("id", Number(term));
    else q = q.eq("userid", term.toUpperCase());
  }

  const { data: rowsRaw, error } = await q;
  const rows = (rowsRaw ?? []) as unknown as WhsRow[];

  // Wave 13.1 — resolve every imagesslip → signed Supabase URL in parallel
  // (legacy `imagesslip` is a bare filename like `FCL_68f5...jpg`; live
  // location after backfill 06 is `slips/legacy/<file>`). The map is keyed
  // by tb_wallet_hs.id so we can look up per row when rendering the "ดู"
  // button below.
  const slipUrlMap = await resolveLegacyUrlMap(
    rows.map((r) => ({ id: r.id, filename: r.imagesslip })),
    "slip",
  );

  // 2nd query — merge customer names from tb_users (same pattern as
  // /admin/forwarders + /admin/yuan-payments)
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw } = await admin
      .from("tb_users")
      .select("userid,username,userlastname,usertel")
      .in("userid", userIds);
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userid, u]));
  }

  // Header counts (3 separate queries · cheap because they use the indexed status column)
  const [{ count: pendingTopupCount }, { count: pendingWithdrawCount }, { count: totalPending }] =
    await Promise.all([
      admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).in("type", ["1", "2"]).eq("status", "1"),
      admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("type", "7").eq("status", "1"),
      admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("status", "1"),
    ]);

  return (
    <>
      <PageTopMenubar items={WALLET_MENUBAR} activeHref="/admin/wallet" />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">กระเป๋าสตางค์ — รายการ</h1>
              {totalPending ? (
                <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
                  {totalPending} รอตรวจรวม
                </span>
              ) : null}
              {pendingTopupCount ? (
                <Link
                  href="/admin/wallet?kind=topup&status=1"
                  className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                >
                  เติม {pendingTopupCount}
                </Link>
              ) : null}
              {pendingWithdrawCount ? (
                <Link
                  href="/admin/wallet?kind=withdraw&status=1"
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  ถอน {pendingWithdrawCount}
                </Link>
              ) : null}
            </div>
            <p className="text-xs text-muted mt-1">
              Wave 7.2 · อ่านจาก tb_wallet_hs · approve/reject bulk + slip-time editor → Wave 8
            </p>
          </div>
          <Link
            href="/admin/wallet/add"
            className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
          >
            + เพิ่ม Topup ด้วยมือ
          </Link>
        </div>

        {/* Kind tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          {KIND_TABS.map((t) => {
            const isActive = (t.key ?? "") === (sp.kind ?? "");
            const params = new URLSearchParams();
            if (t.key) params.set("kind", t.key);
            if (sp.status && /^[123]$/.test(sp.status)) params.set("status", sp.status);
            const qs = params.toString();
            const href = qs ? `/admin/wallet?${qs}` : `/admin/wallet`;
            return (
              <Link
                key={t.label}
                href={href}
                className={
                  "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
                  (isActive
                    ? "border-primary-600 text-primary-600 font-semibold"
                    : "border-transparent text-muted hover:text-foreground")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => {
            const isActive = (t.key ?? "") === (sp.status ?? "");
            const params = new URLSearchParams();
            if (sp.kind) params.set("kind", sp.kind);
            if (t.key) params.set("status", t.key);
            const qs = params.toString();
            const href = qs ? `/admin/wallet?${qs}` : `/admin/wallet`;
            return (
              <Link
                key={t.label}
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
        </div>

        {/* Search box */}
        <form className="flex gap-2 flex-wrap" action="/admin/wallet">
          {sp.kind ? <input type="hidden" name="kind" value={sp.kind} /> : null}
          {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="ค้นหา รหัสลูกค้า (PR…) / หมายเลขรายการ"
            className="rounded-lg border border-border px-3 py-2 text-sm w-72"
          />
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">
            ค้นหา
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error.message}
          </div>
        )}

        {/* Wave 8 Group A — sticky bulk-approve bar (shows when rows selected) */}
        <TbWalletBulkBar />

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>👛</div>
              <p className="text-sm font-medium text-foreground">ไม่มีรายการตามตัวกรองนี้</p>
              <p className="text-xs text-muted max-w-md mx-auto">
                ลองล้าง/เปลี่ยนตัวกรองด้านบนเพื่อดูทุก deposit / withdraw / payment ของลูกค้า
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-2 py-3 w-8"></th>
                    <th className="px-3 py-3">วันที่สร้าง</th>
                    <th className="px-3 py-3">ลูกค้า</th>
                    <th className="px-3 py-3">ประเภท</th>
                    <th className="px-3 py-3 text-right">จำนวน (THB)</th>
                    <th className="px-3 py-3">ธนาคาร</th>
                    <th className="px-3 py-3">สถานะ</th>
                    <th className="px-3 py-3">สลิป</th>
                    <th className="px-3 py-3">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const u = r.userid ? userMap.get(r.userid) : undefined;
                    const status = r.status ?? "1";
                    const type = r.type ?? "";
                    const amount = Number(r.amount ?? 0);
                    const isNeg = amount < 0;
                    const customerName = u
                      ? `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() || r.userid
                      : r.userid ?? "—";
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-2 py-3 w-8">
                          {status === "1" ? <TbWalletRowCheckbox id={r.id} /> : null}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap">
                          {r.date
                            ? new Date(r.date).toLocaleString("th-TH", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-mono">{r.userid ?? "—"}</div>
                          <div>{customerName}</div>
                          {u?.usertel ? <div className="text-muted">{u.usertel}</div> : null}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              TYPE_CLS[type] ?? "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {TYPE_LABEL[type] ?? `type ${type}`}
                          </span>
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono text-xs ${isNeg ? "text-red-600" : "text-foreground"}`}
                        >
                          {isNeg ? "−" : ""}฿
                          {Math.abs(amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.depositnamebank ? (
                            <span className="font-mono text-[11px]">{r.depositnamebank}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {STATUS_LABEL[status] ?? `status ${status}`}
                          </span>
                          {(r.adminid || r.adminidcrate) ? (
                            <div className="text-muted text-[10px] mt-1 font-mono">
                              {r.adminid ?? r.adminidcrate}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {(() => {
                            const url = slipUrlMap[String(r.id)];
                            if (url) {
                              return (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary-600 hover:underline"
                                >
                                  ดู
                                </a>
                              );
                            }
                            if (r.imagesslip) {
                              return (
                                <span
                                  className="text-amber-600"
                                  title={`สลิป upload แล้วแต่หา URL ไม่ได้ — filename: ${r.imagesslip}`}
                                >
                                  ⚠ ไม่พบ
                                </span>
                              );
                            }
                            return <span className="text-muted">—</span>;
                          })()}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <Link
                            href={`/admin/wallet/${r.id}`}
                            className="text-primary-600 hover:underline"
                          >
                            ดู / แก้ไข
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

        <p className="text-[11px] text-muted">
          แสดงไม่เกิน 200 แถวต่อหน้า (ใช้ตัวกรอง / ค้นหาด้านบนเพื่อกรองเพิ่ม)
        </p>
      </main>
    </>
  );
}
