/**
 * /admin/service-orders — ฝากสั่งซื้อสินค้า (shop-order) admin list.
 *
 * Wave 20 P0 follow-up (2026-05-26 — ภูม flag "ไม่มีข้อมูลไรเลย"):
 * Previously this page read the rebuilt `service_orders` table which
 * has **0 rows** on prod — the 21,950 legacy ฝากสั่ง headers live on
 * `tb_header_order` (loaded by Phase A migration). Swapped the data
 * source to legacy, status enum to numeric `hstatus`, and customer
 * join to `tb_users` (the same `userid + .in(...)` pattern as
 * `/admin/forwarders/page.tsx` Wave 3 P0 #1).
 *
 * Field map (rebuilt → legacy):
 *   service_orders.h_no               → tb_header_order.hno (Pxxxxx — same shape)
 *   service_orders.status enum 6-vals → tb_header_order.hstatus '1'..'6'
 *                                       (via legacy-status-map.ts toLegacyOrderCode)
 *   service_orders.title              → tb_header_order.htitle
 *   service_orders.item_count         → tb_header_order.hcount
 *   service_orders.total_thb          → tb_header_order.hcostallth
 *                                       (legacy "ราคารวมไทยบาท" — already converted)
 *   service_orders.payment_due_at     → tb_header_order.hdatepayment (deferred · null OK)
 *   service_orders.created_at         → tb_header_order.hdate
 *   service_orders.profile (UUID FK)  → tb_users via userid (text "PR12345" PK)
 *
 * §0c compliance: every Supabase query destructures { data, error } +
 * console.error on failure + throws (so a transient PgBouncer timeout
 * surfaces a real error instead of silently rendering "ไม่มีรายการ").
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { LEGACY_ORDER_STATUS, legacyOrderStatusThai, toLegacyOrderCode } from "@/lib/legacy-status-map";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ.
// Sidebar "บริการฝากสั่งสินค้า" lands a single leaf here; status filters
// + cart actions + notes + search live in this horizontal menubar so
// the sidebar stays slim (Pacred-is-one-company pattern · matches
// /admin/customers + /admin/accounting/cargo pattern).
// ─────────────────────────────────────────────────────────────────────
const PURCHASING_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/service-orders" },
  {
    label: "สถานะ",
    children: [
      { label: "ทั้งหมด",                href: "/admin/service-orders" },
      { label: "รอดำเนินการ",            href: "/admin/service-orders?status=pending" },
      { label: "รอชำระเงิน",             href: "/admin/service-orders?status=awaiting_payment" },
      { label: "สั่งสินค้า",              href: "/admin/service-orders?status=ordered" },
      { label: "รอร้านจีนจัดส่ง",        href: "/admin/service-orders?status=awaiting_china_ship" },
      { label: "สำเร็จ",                 href: "/admin/service-orders?status=completed" },
      { label: "ยกเลิก",                  href: "/admin/service-orders?status=cancelled" },
      { label: "cart",                  href: "/admin/service-orders/cart" },
      { label: "เพิ่มสินค้าใน cart",     href: "/admin/service-orders/cart/add" },
    ],
  },
  { label: "หมายเหตุฝากสั่ง", href: "/admin/service-orders/notes" },
  { label: "ค้นหา",          href: "/admin/service-orders?focus=search" },
];

// Status badge palette per legacy code. Numeric keys mirror tb_header_order.hstatus.
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-gray-50 text-gray-700 border-gray-200",                   // pending
  "2": "bg-yellow-50 text-yellow-700 border-yellow-200",             // awaiting_payment
  "3": "bg-blue-50 text-blue-700 border-blue-200",                   // ordered
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200",             // awaiting_china_ship
  "5": "bg-green-50 text-green-700 border-green-200",                // completed
  "6": "bg-red-50 text-red-700 border-red-200",                      // cancelled
};

export default async function AdminServiceOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  // Role gate — same as legacy `tb_header_order` operators (sales/ops/super).
  await requireAdmin(["ops", "sales", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Resolve rebuilt-era enum (?status=pending / awaiting_payment / etc.)
  // to its numeric legacy hstatus. Unknown values fall through to "no
  // filter" so URL-fuzz doesn't break the page.
  const legacyStatusCode = sp.status ? toLegacyOrderCode(sp.status) : undefined;

  // ── Pass 1: page of headers — narrow column set keeps the wire small.
  let q = admin
    .from("tb_header_order")
    .select("id, hno, hstatus, htitle, hcount, hcostallth, htotalpriceuser, hdate, hdatepayment, userid, htransporttype")
    .order("hdate", { ascending: false })
    .limit(200);

  if (legacyStatusCode) q = q.eq("hstatus", legacyStatusCode);

  const { data: rowsRaw, error: rowsErr } = await q;
  if (rowsErr) {
    console.error(`[tb_header_order list] failed`, {
      code: rowsErr.code, message: rowsErr.message, details: rowsErr.details,
    });
    throw new Error(`Failed to load tb_header_order (${rowsErr.code ?? "unknown"}): ${rowsErr.message}`);
  }

  type RawRow = {
    id: number;
    hno: string;
    hstatus: string;
    htitle: string | null;
    hcount: number | null;
    hcostallth: number | null;       // ราคารวมไทยบาท (after rate conversion)
    htotalpriceuser: number | null;  // ยอดที่ลูกค้าต้องจ่ายจริง
    hdate: string;
    hdatepayment: string | null;
    userid: string;
    htransporttype: string | null;
  };
  const rows = (rowsRaw ?? []) as RawRow[];

  // ── Pass 2: batch customer lookup (PostgREST type-depth issue prevents
  //   a single embed; flat 2-pass + JS merge is the same pattern as
  //   /admin/forwarders/page.tsx).
  const useridList = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean)));
  let userMap: Record<string, { username: string | null; userlastname: string | null; usertel: string | null }> = {};
  if (useridList.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userid, username, userlastname, usertel")
      .in("userid", useridList);
    if (usersErr) {
      console.error(`[tb_users list] failed`, { code: usersErr.code, message: usersErr.message });
    } else {
      userMap = Object.fromEntries(
        (usersRaw ?? []).map((u) => [
          u.userid,
          { username: u.username, userlastname: u.userlastname, usertel: u.usertel },
        ]),
      );
    }
  }

  return (
    <>
      <PageTopMenubar items={PURCHASING_MENUBAR} activeHref="/admin/service-orders" />
      <main className="p-6 lg:p-8 space-y-5">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ฝากสั่งซื้อ — Ops</h1>
          <p className="mt-1 text-xs text-muted">
            {rows.length} รายการ ({legacyStatusCode ? `กรอง: ${legacyOrderStatusThai(legacyStatusCode)}` : "ทั้งหมด"})
            · แสดงล่าสุด 200 อันดับแรก
          </p>
        </div>

        <FilterBar currentStatus={sp.status} />

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">เลขที่</th>
                    <th className="px-4 py-3">ลูกค้า</th>
                    <th className="px-4 py-3">รายการ</th>
                    <th className="px-4 py-3 text-right">ชิ้น</th>
                    <th className="px-4 py-3 text-right">ยอด (บาท)</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const u = userMap[r.userid];
                    const customerName = u ? `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() : "—";
                    // Display total = "ยอดที่ลูกค้าต้องจ่ายจริง" if set,
                    // otherwise the legacy "รวม THB" total. Most legacy
                    // rows have hcostallth set; htotalpriceuser fills in
                    // after admin completes line-edits.
                    const total = Number(r.htotalpriceuser ?? r.hcostallth ?? 0);
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-4 py-3 font-mono text-xs">
                          <Link href={`/admin/service-orders/${r.hno}`} className="text-primary-600 hover:underline">
                            {r.hno}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-mono">{r.userid}</div>
                          <div>{customerName}</div>
                          {u?.usertel && <div className="text-muted">{u.usertel}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[280px] truncate" title={r.htitle ?? ""}>
                          {r.htitle ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right">{r.hcount ?? 0}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          ฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.hstatus] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                            {legacyOrderStatusThai(r.hstatus)}
                          </span>
                          {r.hstatus === "2" && r.hdatepayment && (
                            <div className="text-[10px] text-yellow-700 mt-1">
                              หมดเขต {new Date(r.hdatepayment).toLocaleDateString("th-TH")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          {new Date(r.hdate).toLocaleDateString("th-TH")}
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
    </>
  );
}

function FilterBar({ currentStatus }: { currentStatus?: string }) {
  // Build filter pills from the canonical status map (5 codes + "ทั้งหมด").
  const opts: Array<{ rebuiltKey: string | undefined; thai: string }> = [
    { rebuiltKey: undefined, thai: "ทั้งหมด" },
    ...(Object.values(LEGACY_ORDER_STATUS).map((e) => ({
      rebuiltKey: e.key,
      thai: e.thai,
    }))),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link
          key={o.rebuiltKey ?? "all"}
          href={o.rebuiltKey ? `/admin/service-orders?status=${o.rebuiltKey}` : "/admin/service-orders"}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentStatus ?? "") === (o.rebuiltKey ?? "")
              ? "bg-primary-500 text-white border-primary-500"
              : "bg-white border-border hover:bg-surface-alt"
          }`}
        >
          {o.thai}
        </Link>
      ))}
    </div>
  );
}
