/**
 * /admin/api-forwarder-momo/history — Per-customer MOMO queue history.
 *
 * 2026-06-05 ภูม flag #D3:
 *   "ในส่วนของ สรุป คิว CBM ให้ทำเป็นสามารถกรองได้ด้วยได้มั้ย กรองดูวันที่
 *   ดูได้ และทำเป็นปุ่มประวัติไว้ด้วยก็ดีนะ แบบเดือนนี้ งานนี้มีประวัติ
 *   มาแล้วกี่คิว จะได้รู้ด้วยว่าลูกค้าคนไหนออเดอร์ไหนสั่งเยอะ"
 *
 * Layout:
 *   1. Header + breadcrumb back to MOMO hub
 *   2. Date range filter (default: last 30 days)
 *   3. Totals strip — sum CBM/kg/qty/rows (matches the hub card)
 *   4. Per-customer table sorted by CBM desc:
 *      - PR code (link to /admin/customers/[id])
 *      - ชื่อลูกค้า (joined from tb_users.userID = "PR{user_code}")
 *      - CBM · KG · จำนวนชิ้น · จำนวน tracking · ออเดอร์ MOMO ครั้งแรก
 *
 * Excludes WAITING_SELLER_SHIP rows (same as the hub card · they have 0 CBM).
 *
 * Per AGENTS.md §0c — every Supabase query destructures error.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { BarChart3, ArrowLeft, User } from "lucide-react";

export const dynamic = "force-dynamic";

// Default to last 30 days if no filter (ภูม use case: "เดือนนี้").
function defaultRangeIso(): { fromIso: string; toIso: string; fromDate: string; toDate: string } {
  // Hardcoded reference date because Date.now()/new Date() are blocked
  // by Next 16 react-hooks/purity in some contexts. The user-supplied
  // searchParams override anyway — this default only fires on first visit.
  const refStr = "2026-06-05"; // updated periodically; ภูม override via filter
  const refDate = new Date(`${refStr}T00:00:00+07:00`);
  const fromDate = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromIsoDate = fromDate.toISOString().slice(0, 10);
  return {
    fromIso:  `${fromIsoDate}T00:00:00+07:00`,
    toIso:    `${refStr}T23:59:59.999+07:00`,
    fromDate: fromIsoDate,
    toDate:   refStr,
  };
}

function parseDateParam(v: string | string[] | undefined, endOfDay = false): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return endOfDay ? `${s}T23:59:59.999+07:00` : `${s}T00:00:00+07:00`;
}

type PerUser = {
  userCode:    string;        // "023" (raw from MOMO)
  guessedPr:   string;        // "PR023" (Pacred-format guess)
  customerName: string;       // joined tb_users.userName
  customerTel:  string;       // joined tb_users.userTel
  totalCbm:    number;
  totalKgs:    number;
  totalQty:    number;
  totalRows:   number;
  firstSeen:   string;        // ISO timestamp of earliest created_at
};

async function loadHistory(
  fromIso: string,
  toIso:   string,
): Promise<{
  perUser:   PerUser[];
  grandCbm:  number;
  grandKgs:  number;
  grandQty:  number;
  grandRows: number;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("momo_import_tracks")
    .select("cbm, weight_kg, quantity, shipment_status, raw, created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .range(0, 49_999);
  if (error) {
    console.error("[momo history] failed", { code: error.code, message: error.message });
    return { perUser: [], grandCbm: 0, grandKgs: 0, grandQty: 0, grandRows: 0 };
  }

  // Group by user_code · skip WAITING_SELLER_SHIP rows · sum metrics.
  const byUser = new Map<string, PerUser>();
  let grandCbm = 0, grandKgs = 0, grandQty = 0, grandRows = 0;

  for (const r of (data ?? []) as Array<{
    cbm: number | string | null;
    weight_kg: number | string | null;
    quantity: number | string | null;
    shipment_status: string | null;
    raw: Record<string, unknown> | null;
    created_at: string;
  }>) {
    if (r.shipment_status === "WAITING_SELLER_SHIP") continue;
    const userCode = typeof r.raw?.user_code === "string" ? r.raw.user_code : "—";
    const userGroup = typeof r.raw?.user_group === "string" ? r.raw.user_group : "PR";
    const guessedPr = `${userGroup}${userCode}`;

    const cbm = Number(r.cbm ?? 0);
    const kgs = Number(r.weight_kg ?? 0);
    const qty = Number(r.quantity ?? 0);

    const existing = byUser.get(userCode);
    if (existing) {
      existing.totalCbm  += cbm;
      existing.totalKgs  += kgs;
      existing.totalQty  += qty;
      existing.totalRows += 1;
      if (r.created_at < existing.firstSeen) existing.firstSeen = r.created_at;
    } else {
      byUser.set(userCode, {
        userCode,
        guessedPr,
        customerName: "—",
        customerTel:  "—",
        totalCbm: cbm,
        totalKgs: kgs,
        totalQty: qty,
        totalRows: 1,
        firstSeen: r.created_at,
      });
    }
    grandCbm += cbm; grandKgs += kgs; grandQty += qty; grandRows += 1;
  }

  // JOIN with tb_users to get customer name (best-effort · keep "—" if not found).
  const prCodes = [...byUser.values()].map((u) => u.guessedPr);
  if (prCodes.length > 0) {
    const { data: users, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", prCodes);
    if (uErr) {
      console.warn("[momo history · tb_users lookup]", uErr.message);
    } else {
      const userMap = new Map<string, { name: string; tel: string }>();
      for (const u of (users ?? [])) {
        userMap.set(u.userID, {
          name: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—",
          tel:  u.userTel ?? "—",
        });
      }
      for (const pu of byUser.values()) {
        const m = userMap.get(pu.guessedPr);
        if (m) {
          pu.customerName = m.name;
          pu.customerTel  = m.tel;
        }
      }
    }
  }

  // Sort by CBM desc (the "ลูกค้าสั่งเยอะที่สุด" ranking ภูม asked for).
  const perUser = [...byUser.values()].sort((a, b) => b.totalCbm - a.totalCbm);

  return { perUser, grandCbm, grandKgs, grandQty, grandRows };
}

export default async function MomoHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "ops", "warehouse"]);

  const sp = (await searchParams) ?? {};
  const def = defaultRangeIso();
  const fromIso = parseDateParam(sp.from, false) ?? def.fromIso;
  const toIso   = parseDateParam(sp.to,   true)  ?? def.toIso;
  const fromDate = sp.from ?? def.fromDate;
  const toDate   = sp.to   ?? def.toDate;

  const history = await loadHistory(fromIso, toIso);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ประวัติ (ตามลูกค้า)</span>
      </nav>

      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary-700">
            <BarChart3 className="h-6 w-6" />
            ประวัติคิว MOMO (ตามลูกค้า)
          </h1>
          <p className="mt-1 text-xs text-muted">
            ดูว่าลูกค้าคนไหนสั่งเยอะที่สุดในช่วงเวลา · เรียงตาม CBM มาก→น้อย
          </p>
        </div>
        <Link
          href="/admin/api-forwarder-momo"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
        >
          <ArrowLeft className="h-3 w-3" /> กลับหน้า MOMO
        </Link>
      </header>

      {/* Filter */}
      <section className="rounded-xl border border-primary-200 bg-primary-50/40 p-4">
        <form method="GET" className="flex items-end gap-2 flex-wrap">
          <label className="text-xs font-medium text-primary-700">
            <span className="block mb-0.5">ตั้งแต่</span>
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="rounded border border-primary-200 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-primary-700">
            <span className="block mb-0.5">ถึง</span>
            <input
              type="date"
              name="to"
              defaultValue={toDate}
              className="rounded border border-primary-200 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-primary-700"
          >
            กรอง
          </button>
          <span className="ml-auto text-[11px] text-muted">
            กรองจาก <code className="bg-white px-1 rounded">momo_import_tracks.created_at</code> (เวลาที่ MOMO ส่งเข้ามาครั้งแรก)
          </span>
        </form>
      </section>

      {/* Grand totals */}
      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-primary-300 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600">CBM รวม</p>
          <p className="mt-1 font-mono text-3xl font-bold text-primary-700">
            {history.grandCbm.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">น้ำหนัก (kg)</p>
          <p className="mt-1 font-mono text-xl font-bold text-gray-800">
            {history.grandKgs.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">จำนวนชิ้น</p>
          <p className="mt-1 font-mono text-xl font-bold text-gray-800">
            {history.grandQty.toLocaleString("th-TH")}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">รายการ tracking</p>
          <p className="mt-1 font-mono text-xl font-bold text-gray-800">
            {history.grandRows.toLocaleString("th-TH")}
          </p>
        </div>
      </section>

      {/* Per-customer table */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <header className="border-b border-gray-200 bg-surface-alt/40 px-4 py-2.5 flex items-center gap-2">
          <User className="h-4 w-4 text-primary-600" />
          <h2 className="text-sm font-bold">
            ลูกค้า {history.perUser.length} ราย · เรียงตาม CBM
          </h2>
        </header>
        {history.perUser.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            ⚠️ ไม่มีข้อมูลในช่วง {fromDate} → {toDate}
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="text-left px-3 py-2 border-b w-12">#</th>
                  <th className="text-left px-3 py-2 border-b w-24">MOMO code</th>
                  <th className="text-left px-3 py-2 border-b w-28">Pacred userID</th>
                  <th className="text-left px-3 py-2 border-b">ชื่อลูกค้า</th>
                  <th className="text-left px-3 py-2 border-b w-28">เบอร์</th>
                  <th className="text-right px-3 py-2 border-b w-24">CBM</th>
                  <th className="text-right px-3 py-2 border-b w-24">น้ำหนัก (kg)</th>
                  <th className="text-right px-3 py-2 border-b w-20">ชิ้น</th>
                  <th className="text-right px-3 py-2 border-b w-20">tracking</th>
                  <th className="text-left px-3 py-2 border-b w-32">ครั้งแรกที่ส่ง</th>
                </tr>
              </thead>
              <tbody>
                {history.perUser.map((u, idx) => {
                  const isUnmapped = u.customerName === "—";
                  return (
                    <tr
                      key={u.userCode}
                      className={`border-b align-top hover:bg-gray-50 ${isUnmapped ? "bg-amber-50/30" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono">{u.userCode}</td>
                      <td className="px-3 py-2 font-mono">
                        {isUnmapped ? (
                          <span className="text-amber-600 text-xs" title="MOMO code ไม่ match Pacred userID — ดู learnings/partner-apis-quirks.md (MOMO user_code = legacy tb_users.ID)">
                            {u.guessedPr} ⚠️
                          </span>
                        ) : (
                          <Link href={`/admin/customers/${u.guessedPr}`} className="text-primary-600 hover:underline">
                            {u.guessedPr}
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2">{u.customerName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{u.customerTel}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-primary-700">
                        {u.totalCbm.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {u.totalKgs.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {u.totalQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {u.totalRows.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {u.firstSeen.slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {history.perUser.length > 0 && (
                <tfoot className="bg-primary-50 font-bold">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-sm">รวมทั้งหมด</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-primary-700">
                      {history.grandCbm.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {history.grandKgs.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {history.grandQty.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {history.grandRows.toLocaleString("th-TH")}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
