import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Plus, Users, Search } from "lucide-react";
import { listPayUserHistory } from "@/actions/admin/pay-user-view";
import { PayUserAddClient } from "./pay-user-add-client";
import { PayUserHistoryTable } from "./pay-user-history-table";
import { PageSizeSelect } from "@/components/admin/page-size-select";
import { parsePageSize } from "@/lib/admin/paginate";
import { isNextControlFlowError } from "@/lib/observability/next-control-flow";
import type { AdminActionResult } from "@/actions/admin/common";
import type { PayUserHistoryRow } from "@/actions/admin/pay-user-view";

/** จำนวนแถวต่อหน้า (owner 2026-07-16 · ตามภาพ) — เริ่ม 10/25 ที่จำกัด list สั้นๆ ได้จริง. */
const PAY_USER_SIZES = [10, 25, 50, 100, 200, 400] as const;

/**
 * จ่ายเงินแทนลูกค้า (admin pay-on-behalf) — faithful port of legacy
 * `pcs-admin/pay-users.php`. Two modes on `?action`:
 *   • LIST (default)   — history of pay-on-behalf transactions (tb_wallet_hs
 *     WHERE adminIDCrate<>'' AND type IN(2,4)) — 9-col table + ทำรายการใหม่.
 *   • ADD (?action=add) — the builder: ประเภทบริการ + customer + wallet card +
 *     unpaid-items table + pay modal → PDF summary.
 *
 * The MONEY WRITES live in actions/admin/pay-user.ts (tested); this page +
 * pay-user-view.ts only READ + display. ภูม 2026-07-06 (owner: "ไม่มีเลย · แกะมาให้เป๊ะ").
 */
export const dynamic = "force-dynamic";

export default async function AdminWalletPayUserPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string; q?: string; size?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  // ── ADD mode — the pay-on-behalf builder ──
  if (sp.action === "add") {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] space-y-5 bg-surface p-4 lg:p-8 dark:bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/admin" className="hover:text-primary-600">แอดมิน</Link>
          <span>›</span>
          <Link href="/admin/wallet/pay-user" className="hover:text-primary-600">จ่ายเงินแทนลูกค้า</Link>
          <span>›</span>
          <span className="text-foreground font-medium">ทำรายการแทน</span>
        </nav>
        <PayUserAddClient />
      </main>
    );
  }

  // ── LIST mode — pay-on-behalf history ──
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const size = parsePageSize(sp.size, PAY_USER_SIZES);

  // ── Fail SOFT, never 500 ───────────────────────────────────────────────
  // `withAdmin` does NOT catch — anything the loader throws (a PostgREST
  // transport error · a malformed `?q=` reaching the `.or()` filter · a null
  // deref while shaping a legacy row) escapes into the Server-Component render
  // and the whole page 500s with only an opaque digest. Prod hit exactly this:
  // 5 occurrences of digest 1620674152 on /admin/wallet/pay-user over
  // 2026-07-16→17. The page ALREADY renders `res.error` in a red banner, so a
  // throw is strictly worse than the failure shape it already handles — funnel
  // one into the other and the money page stays usable (search + ทำรายการใหม่
  // still work) instead of blanking.
  //
  // Next control-flow sentinels (redirect() from requireAdmin, notFound(), an
  // HTTP-error fallback) MUST be re-thrown untouched or auth would break.
  let res: AdminActionResult<{ rows: PayUserHistoryRow[]; total: number; page: number; pageSize: number }>;
  try {
    res = await listPayUserHistory({ page, q, pageSize: size });
  } catch (e) {
    if (isNextControlFlowError(e)) throw e;
    console.error("[admin/wallet/pay-user listPayUserHistory] threw", {
      page,
      size,
      hasQuery: q.length > 0,
      message: e instanceof Error ? e.message : String(e),
    });
    res = {
      ok: false,
      error: "โหลดประวัติการจ่ายเงินแทนลูกค้าไม่สำเร็จ — กรุณาลองใหม่ หรือล้างคำค้นหาแล้วลองอีกครั้ง",
    };
  }

  const rows = res.ok ? res.data!.rows : [];
  const total = res.ok ? res.data!.total : 0;
  const pageSize = res.ok ? res.data!.pageSize : 50;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const qsFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sp.size && sp.size !== "50") params.set("size", sp.size);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/wallet/pay-user?${s}` : "/admin/wallet/pay-user";
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] space-y-5 bg-surface p-4 lg:p-8 dark:bg-background">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">แอดมิน</Link>
        <span>›</span>
        <span className="text-foreground font-medium">จ่ายเงินแทนลูกค้า</span>
      </nav>

      {/* กรอบขาวหุ้มเนื้อหา บนพื้นเทา (owner 2026-07-16) */}
      <section className="space-y-5 rounded-2xl border border-border bg-white p-4 shadow-sm lg:p-6 dark:bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Users className="h-7 w-7 text-primary-600" /> จ่ายเงินแทนลูกค้า
          </h1>
        </div>
        <Link
          href="/admin/wallet/pay-user?action=add"
          className="inline-flex items-center gap-2.5 text-sm font-semibold text-gray-800 hover:text-emerald-700"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </span>
          ทำรายการใหม่
        </Link>
      </header>

      {/* ค้นหา + จำนวนแถวต่อหน้า อยู่บรรทัดเดียวกัน (owner 2026-07-16) */}
      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหา รหัสสมาชิก / รายการอ้างอิง / ผู้ทำรายการ"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <button type="submit" className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900">ค้นหา</button>
          {q && (
            <Link href="/admin/wallet/pay-user" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">ล้าง</Link>
          )}
        </form>
        <PageSizeSelect basePath="/admin/wallet/pay-user" current={size} params={{ q }} sizes={PAY_USER_SIZES} />
      </div>

      {!res.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{res.error}</div>
      )}

      {/* history table (client-side sortable · owner 2026-07-16) */}
      <PayUserHistoryTable rows={rows} />

      {/* pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          {page > 1 && <Link href={qsFor(page - 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50">ก่อนหน้า</Link>}
          <span className="text-gray-500">หน้า {page} / {lastPage}</span>
          {page < lastPage && <Link href={qsFor(page + 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50">ถัดไป</Link>}
        </div>
      )}
      </section>
    </main>
  );
}
