/**
 * E6 — /admin/service-orders/refunds — Shop-order refund history list.
 *
 * Legacy `pcs-admin/shopping-return.php` default mode = `home.php`
 * (3-tab list of past refunds). The refund ACTION already shipped
 * (`adminRefundShopOrderItem` · per-item UI button on legacy-view.tsx),
 * but ops could not review "ขอดูประวัติคืนเงิน" — this page closes that.
 *
 * Data source: `tb_wallet_hs WHERE type='5' AND typeservice='1'`
 * — the per-item shop refund credit (the refund action writes exactly
 * this). Joins:
 *   - tb_users (camelCase userID/userName/userLastName) for customer
 *   - tb_header_order via reforder=hno for the order title
 *   - tb_admin via adminid for the "ผู้ทำรายการ" admin display name
 *
 * Reachability §0d: linked from PURCHASING_MENUBAR on
 * `/admin/service-orders/page.tsx` (under "งาน → ประวัติคืนเงิน"),
 * keeping the same single-leaf sidebar pattern the rest of the
 * shop-order sub-routes use.
 *
 * Pagination uses count: "exact" + offset/limit (NEVER the silent
 * 1000-row PostgREST cap · AGENTS.md §0e).
 *
 * §0f: read-only — no mutate, so no confirm-dialog needed.
 *
 * Default window = 30 days back (owner's "ขอดูประวัติคืนเงิน" usually
 * means "this month-ish"); ?date_from / ?date_to overrides.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  PageTopMenubar,
  type MenubarItem,
} from "@/components/admin/page-top-menubar";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import {
  daysAgoIso,
  todayIso,
  endOfDayTs,
  DEFAULT_REFUND_WINDOW_DAYS,
} from "@/lib/admin/refund-history-helpers";

export const dynamic = "force-dynamic";

// Mirrors the menubar in /admin/service-orders/page.tsx so the sub-page
// keeps the shop-order top-nav. Adding "ประวัติคืนเงิน" here too keeps
// the cross-link bidirectional.
const PURCHASING_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/service-orders" },
  {
    label: "สถานะ",
    children: [
      { label: "ทั้งหมด",          href: "/admin/service-orders" },
      { label: "รอดำเนินการ",      href: "/admin/service-orders?q=1" },
      { label: "รอชำระเงิน",       href: "/admin/service-orders?q=2" },
      { label: "สั่งสินค้า",        href: "/admin/service-orders?q=3" },
      { label: "รอร้านจีนจัดส่ง",  href: "/admin/service-orders?q=4" },
      { label: "สำเร็จ",           href: "/admin/service-orders?q=5" },
      { label: "ยกเลิก",            href: "/admin/service-orders?q=6" },
    ],
  },
  {
    label: "งาน",
    children: [
      { label: "cart",                  href: "/admin/service-orders/cart" },
      { label: "เพิ่มสินค้าใน cart",     href: "/admin/service-orders/cart/add" },
      { label: "หมายเหตุฝากสั่ง",       href: "/admin/service-orders/notes" },
      { label: "ประวัติคืนเงิน",          href: "/admin/service-orders/refunds" },
    ],
  },
];

type SearchParams = {
  date_from?: string;
  date_to?:   string;
  search?:    string;
  page?:      string;
};

type RawHs = {
  id:        number;
  date:      string | null;
  amount:    number | string;
  reforder:  string | null;
  userid:    string;
  note:      string | null;
  adminid:   string | null;
};

type RawUser = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
};

type RawHeader = {
  hno:    string;
  htitle: string | null;
};

type RawAdmin = {
  adminID:       string;
  adminName:     string | null;
  adminLastName: string | null;
};

function thb(n: number): string {
  return (
    "฿" +
    Number(n || 0).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      year:   "numeric",
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export default async function ShopRefundHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // RBAC — money lane (super / accounting / ops). Sales cannot see refunds.
  await requireAdmin(["super", "accounting", "ops"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  const fromDate = sp.date_from ?? daysAgoIso(DEFAULT_REFUND_WINDOW_DAYS);
  const toDate   = sp.date_to   ?? todayIso();
  const search   = (sp.search ?? "").trim();
  const page     = parsePage(sp.page);
  const { from, to } = pageRange(page, DEFAULT_PAGE_SIZE);

  // ── Query: tb_wallet_hs refund rows (type='5' AND typeservice='1') ─
  let q = admin
    .from("tb_wallet_hs")
    .select("id,date,amount,reforder,userid,note,adminid", {
      count: "exact",
    })
    .eq("type", "5")
    .eq("typeservice", "1")
    .gte("date", `${fromDate}T00:00:00`)
    .lte("date", endOfDayTs(toDate))
    .order("date", { ascending: false })
    .range(from, to);

  if (search) {
    const safe = search.replace(/[%,*()]/g, "");
    q = q.or(`reforder.ilike.%${safe}%,userid.ilike.%${safe}%`);
  }

  const { data: hsRowsRaw, error: hsErr, count: total } = await q;
  if (hsErr) {
    console.error("[/admin/service-orders/refunds] tb_wallet_hs list failed", {
      code: hsErr.code,
      message: hsErr.message,
    });
  }
  const hsRows = (hsRowsRaw ?? []) as RawHs[];

  // ── Join: tb_users (camelCase) ─────────────────────────────────
  const userids = Array.from(
    new Set(hsRows.map((r) => r.userid).filter(Boolean)),
  );
  const userByUid = new Map<string, RawUser>();
  if (userids.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName")
      .in("userID", userids);
    if (userErr) {
      console.error(
        "[/admin/service-orders/refunds] tb_users join failed",
        { code: userErr.code, message: userErr.message },
      );
    }
    for (const u of (userRows ?? []) as RawUser[]) {
      userByUid.set(u.userID, u);
    }
  }

  // ── Join: tb_header_order via reforder=hno ─────────────────────
  const hnos = Array.from(
    new Set(hsRows.map((r) => r.reforder).filter((h): h is string => !!h)),
  );
  const orderByHno = new Map<string, RawHeader>();
  if (hnos.length > 0) {
    const { data: orderRows, error: orderErr } = await admin
      .from("tb_header_order")
      .select("hno,htitle")
      .in("hno", hnos);
    if (orderErr) {
      console.error(
        "[/admin/service-orders/refunds] tb_header_order join failed",
        { code: orderErr.code, message: orderErr.message },
      );
    }
    for (const o of (orderRows ?? []) as RawHeader[]) {
      orderByHno.set(o.hno, o);
    }
  }

  // ── Join: tb_admin for the "ผู้ทำรายการ" display name ──────────
  const adminIds = Array.from(
    new Set(hsRows.map((r) => r.adminid).filter((a): a is string => !!a)),
  );
  const adminByAdminId = new Map<string, RawAdmin>();
  if (adminIds.length > 0) {
    // tb_admin uses camelCase columns (post-0113 rename) — match the
    // refund action and lib/admin/assign-sales-rep.ts query shapes.
    const { data: adminRows, error: adminErr } = await admin
      .from("tb_admin")
      .select("adminID,adminName,adminLastName")
      .in("adminID", adminIds);
    if (adminErr) {
      console.error(
        "[/admin/service-orders/refunds] tb_admin join failed",
        { code: adminErr.code, message: adminErr.message },
      );
    }
    for (const a of (adminRows ?? []) as RawAdmin[]) {
      adminByAdminId.set(a.adminID, a);
    }
  }

  // ── Aggregate totals (for the header summary card) ─────────────
  const sumThb = hsRows.reduce(
    (acc, r) => acc + Number(r.amount ?? 0),
    0,
  );

  return (
    <>
      <PageTopMenubar
        items={PURCHASING_MENUBAR}
        activeHref="/admin/service-orders/refunds"
      />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              ADMIN · ฝากสั่งสินค้า
            </p>
            <h1 className="mt-1 text-2xl font-bold">ประวัติคืนเงินรายการ</h1>
            <p className="text-sm text-muted mt-0.5">
              tb_wallet_hs type=5 (รายการคืนเงิน) typeservice=1 (cargo · ฝากสั่ง)
              — เครดิตคืนเข้ากระเป๋าลูกค้า
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700">
              ในช่วงที่กรอง (หน้าปัจจุบัน)
            </p>
            <p className="text-lg font-mono font-bold text-emerald-700">
              {thb(sumThb)} · {hsRows.length.toLocaleString("th-TH")} รายการ
            </p>
            <p className="text-[10px] text-emerald-700/75">
              ทั้งหมดในช่วง: {(total ?? 0).toLocaleString("th-TH")} รายการ
            </p>
          </div>
        </div>

        {hsErr && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {hsErr.message}
          </div>
        )}

        {/* Filter bar — date range + search */}
        <form
          method="GET"
          action="/admin/service-orders/refunds"
          className="rounded-2xl border border-border bg-white dark:bg-surface p-3 lg:p-4 shadow-sm flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="text-[10px] text-muted block mb-1">
              วันที่คืนเงิน · ตั้งแต่
            </label>
            <input
              type="date"
              name="date_from"
              defaultValue={fromDate}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">
              ถึง
            </label>
            <input
              type="date"
              name="date_to"
              defaultValue={toDate}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-muted block mb-1">
              ค้นหา hNo หรือ PR
            </label>
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="เช่น P26060001 หรือ PR321"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหา
          </button>
          {(search || sp.date_from || sp.date_to) && (
            <Link
              href="/admin/service-orders/refunds"
              className="text-xs text-muted hover:text-foreground px-2 py-1.5 underline"
            >
              ล้าง (กลับ 30 วันล่าสุด)
            </Link>
          )}
        </form>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          {hsRows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>↩️</div>
              <p className="text-sm font-medium text-foreground">
                ไม่มีประวัติคืนเงินในช่วงนี้
              </p>
              <p className="text-xs text-muted max-w-md mx-auto">
                {search || sp.date_from || sp.date_to
                  ? "ลองล้างตัวกรองด้านบนเพื่อขยายช่วง"
                  : "เมื่อ admin กด \"คืนเงินรายการนี้\" จากใบฝากสั่ง รายการจะปรากฏที่นี่"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 whitespace-nowrap">วันที่</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">ออเดอร์</th>
                    <th className="px-3 py-2">หมายเหตุ / รายการ</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">
                      จำนวนเงิน
                    </th>
                    <th className="px-3 py-2">ผู้ทำรายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {hsRows.map((r) => {
                    const u = userByUid.get(r.userid);
                    const customerName = u
                      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
                      : "";
                    const o = r.reforder ? orderByHno.get(r.reforder) : undefined;
                    const a = r.adminid ? adminByAdminId.get(r.adminid) : undefined;
                    const adminName = a
                      ? `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim()
                      : "";
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-border hover:bg-surface-alt/30 align-top"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {fmtDate(r.date)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Link
                            href={`/admin/customers/${r.userid}`}
                            className="font-mono text-primary-600 hover:underline"
                          >
                            {r.userid}
                          </Link>
                          {customerName && (
                            <p className="text-[11px] text-foreground">
                              {customerName}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.reforder ? (
                            <Link
                              href={`/admin/service-orders/${r.reforder}`}
                              className="font-mono text-primary-600 hover:underline"
                            >
                              {r.reforder}
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                          {o?.htitle && (
                            <p
                              className="text-[11px] text-muted line-clamp-2"
                              title={o.htitle}
                            >
                              {o.htitle}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted max-w-md">
                          <p className="line-clamp-3" title={r.note ?? undefined}>
                            {r.note || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-700 whitespace-nowrap">
                          {thb(Number(r.amount ?? 0))}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.adminid ? (
                            <>
                              <p className="font-mono">{r.adminid}</p>
                              {adminName && (
                                <p className="text-[11px] text-muted">
                                  {adminName}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
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
          total={total ?? 0}
          basePath="/admin/service-orders/refunds"
          params={{
            date_from: sp.date_from,
            date_to:   sp.date_to,
            search:    sp.search,
          }}
        />
      </main>
    </>
  );
}
