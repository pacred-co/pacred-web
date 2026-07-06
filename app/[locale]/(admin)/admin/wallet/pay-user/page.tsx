import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { UserPlus, Search } from "lucide-react";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { listPayUserHistory } from "@/actions/admin/pay-user-view";
import { PayUserAddClient } from "./pay-user-add-client";

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

function thb(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? "").trim();
  const cfg =
    s === "2"
      ? { label: "สำเร็จ", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : s === "1"
        ? { label: "รอดำเนินการ", cls: "border-amber-200 bg-amber-50 text-amber-700" }
        : s === "3"
          ? { label: "ไม่สำเร็จ", cls: "border-red-200 bg-red-50 text-red-700" }
          : { label: "—", cls: "border-gray-200 bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export default async function AdminWalletPayUserPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string; q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  // ── ADD mode — the pay-on-behalf builder ──
  if (sp.action === "add") {
    return (
      <main className="p-4 lg:p-8 space-y-5">
        <nav className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/admin" className="hover:text-primary-600">แอดมิน</Link>
          <span>›</span>
          <Link href="/admin/wallet/pay-user" className="hover:text-primary-600">จ่ายเงินแทนลูกค้า</Link>
          <span>›</span>
          <span className="text-foreground font-medium">ทำรายการแทน</span>
        </nav>
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · WALLET · PAY ON BEHALF</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">ทำรายการจ่ายเงินแทนลูกค้า</h1>
          <p className="mt-1 text-sm text-muted">
            เลือกบริการ → กรอกรหัสลูกค้า → เลือกออเดอร์ที่ค้างชำระ → กด &ldquo;ชำระเงินแทนลูกค้า&rdquo;
          </p>
        </header>
        <PayUserAddClient />
      </main>
    );
  }

  // ── LIST mode — pay-on-behalf history ──
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const res = await listPayUserHistory({ page, q });
  const rows = res.ok ? res.data!.rows : [];
  const total = res.ok ? res.data!.total : 0;
  const pageSize = res.ok ? res.data!.pageSize : 50;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const qsFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/wallet/pay-user?${s}` : "/admin/wallet/pay-user";
  };

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">แอดมิน</Link>
        <span>›</span>
        <span className="text-foreground font-medium">จ่ายเงินแทนลูกค้า</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · WALLET · PAY ON BEHALF</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">จ่ายเงินแทนลูกค้า</h1>
          <p className="mt-1 text-sm text-muted">
            ประวัติการรับชำระค่าฝากสั่งซื้อ + ฝากนำเข้าที่เจ้าหน้าที่ทำแทนลูกค้า (โทร/LINE) · พบ {total.toLocaleString("th-TH")} รายการ
          </p>
        </div>
        <Link
          href="/admin/wallet/pay-user?action=add"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <UserPlus className="h-4 w-4" /> ทำรายการใหม่
        </Link>
      </header>

      {/* search */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
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

      {!res.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{res.error}</div>
      )}

      {/* history table */}
      <div className="scrollbar-x-visible overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] border-collapse text-[13px] [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] font-semibold text-gray-500">
              <th className="px-3 py-2">เลขที่</th>
              <th className="px-3 py-2">เวลาทำรายการ</th>
              <th className="px-3 py-2">รหัสสมาชิก</th>
              <th className="px-3 py-2">ชื่อ-นามสกุล</th>
              <th className="px-3 py-2">ประเภทบริการ</th>
              <th className="px-3 py-2 text-right">จำนวนเงิน</th>
              <th className="px-3 py-2">รายการอ้างอิง</th>
              <th className="px-3 py-2 text-center">สถานะรายการ</th>
              <th className="px-3 py-2">ผู้ทำรายการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400">
                  ยังไม่มีรายการจ่ายเงินแทนลูกค้า
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={i % 2 ? "bg-gray-50/40" : ""}>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.id}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.date ? formatThaiDateTime(r.date) : "—"}</td>
                  <td className="px-3 py-2">
                    {r.userid ? (
                      <Link href={`/admin/customers/${r.userid}`} className="font-medium text-sky-600 hover:underline">{r.userid}</Link>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-800">{r.name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${r.service_label === "ฝากนำเข้า" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"}`}>
                      {r.service_label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{thb(r.amount)}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.reforder ?? "—"}</td>
                  <td className="px-3 py-2 text-center"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2 text-gray-600">{r.admin_crate ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          {page > 1 && <Link href={qsFor(page - 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50">ก่อนหน้า</Link>}
          <span className="text-gray-500">หน้า {page} / {lastPage}</span>
          {page < lastPage && <Link href={qsFor(page + 1)} className="rounded border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50">ถัดไป</Link>}
        </div>
      )}
    </main>
  );
}
