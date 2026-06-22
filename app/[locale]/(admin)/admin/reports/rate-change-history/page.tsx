/**
 * /admin/reports/rate-change-history — ประวัติการปรับเรทราคาลูกค้า
 *
 * Faithful read-only port of the legacy PCS Cargo admin
 *   <legacy>/member/pcs-admin/hs-customrate.php
 *   + include/pages/hs-customrate/home.php   (the log list)
 *   + include/pages/hs-customrate/detail.php (the per-record old→new modal)
 *
 * ── What legacy logs ───────────────────────────────────────────────────────
 * Every time staff saves a per-customer rate override (legacy users.php
 * customRate handler → mirrored in Pacred `adminSaveCustomerRate`), the system
 * appends a history snapshot:
 *   • tb_customrate_hs      — the header: ID, userID (customer), adminID, date.
 *   • tb_hs_rate_custom_kg  — per-cell KG change: rKGbefore → rKG, keyed crhsID.
 *   • tb_hs_rate_custom_cbm — per-cell CBM change: rCBMbefore → rCBM, keyed crhsID.
 * The legacy home page shows "รหัสอ้างอิง / รหัสลูกค้า / อัพเดทล่าสุด /
 * แอดมินที่อัปเดต" with a "ดูรายละเอียด" button that ajax-loads the per-record
 * old→new table. We reproduce that, server-rendered, via ?id=<crhsID>.
 *
 * ── Live data ──────────────────────────────────────────────────────────────
 * These history tables ARE written today (the per-customer rate editor on the
 * customer profile + /admin/rates/custom-user → adminSaveCustomerRate appends a
 * snapshot on every change). So this is a real, populated change-history — NOT
 * a partial / placeholder surface. No audit table needs to be created.
 *
 * READ-ONLY report. No writes to any money / status / rate table.
 *
 * §0c: every Supabase read destructures { data, error } and console.errors.
 * §0d: reachable from /admin/reports + (nav wired by เดฟ) under Reports.
 *
 * Encodings (legacy, do not "fix") — reused from lib/admin/customer-rate-tables:
 *   sourceWarehouse '1'=กวางโจว '2'=อี้อู · rTransportType '1'=รถ '2'=เรือ
 *   rProductsType '1' ทั่วไป '2' มอก. '3' อย./น้ำยา '4' พิเศษ
 */
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PRODUCTS,
  TRANSPORTS,
  WAREHOUSES,
  type ProductId,
  type TransportId,
  type WarehouseId,
} from "@/lib/admin/customer-rate-tables";

export const dynamic = "force-dynamic";

// ── encoding label helpers ────────────────────────────────────────────────
const warehouseLabel = (id: string): string =>
  WAREHOUSES.find((w) => w.id === id)?.short ?? (id || "—");
const transportLabel = (id: string): string =>
  TRANSPORTS.find((t) => t.id === id)?.short ?? (id || "—");
const productLabel = (id: string): string =>
  PRODUCTS.find((p) => p.id === id)?.label ?? (id || "—");

// ── date formatter (no helper in lib; inline like other report pages) ──────
function fmtDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function num(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ── row shapes ─────────────────────────────────────────────────────────────
type HistHeaderRow = {
  id: number;
  userid: string | null;
  adminid: string | null;
  date: string | null;
};

type HistChildRow = {
  id: number;
  crhsid: number;
  userid: string | null;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  before: number | null;
  after: number | null;
};

type SP = {
  q?: string; // search customer or admin code
  id?: string; // detail view for one history record
};

const LIST_LIMIT = 400;

export default async function RateChangeHistoryReport({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const detailId = sp.id && /^\d+$/.test(sp.id) ? Number(sp.id) : null;

  const admin = createAdminClient();

  // ── 1. Read the history headers (newest first) ──────────────────────────
  let headerQuery = admin
    .from("tb_customrate_hs")
    .select("id,userid,adminid,date")
    .order("id", { ascending: false })
    .limit(LIST_LIMIT);

  // Search: filter by customer code OR admin code (case-insensitive prefix).
  if (q) {
    const safe = q.replace(/[%,()]/g, ""); // strip PostgREST-special chars
    headerQuery = headerQuery.or(`userid.ilike.${safe}%,adminid.ilike.${safe}%`);
  }

  const { data: headerRaw, error: headerErr } = await headerQuery;
  if (headerErr) {
    console.error(`[rate-change-history tb_customrate_hs] failed`, {
      q,
      code: headerErr.code,
      message: headerErr.message,
      details: headerErr.details,
    });
  }
  const headers = (headerRaw ?? []) as unknown as HistHeaderRow[];

  // ── 2. Batch-resolve customer + admin display names ─────────────────────
  const userIds = Array.from(new Set(headers.map((h) => h.userid).filter(Boolean) as string[]));
  const adminIds = Array.from(new Set(headers.map((h) => h.adminid).filter(Boolean) as string[]));

  const nameOf = {
    user: new Map<string, string>(),
    admin: new Map<string, string>(),
  };

  if (userIds.length > 0) {
    const { data: uRaw, error: uErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany")
      .in("userID", userIds);
    if (uErr) {
      console.error(`[rate-change-history tb_users] failed`, { code: uErr.code, message: uErr.message });
    }
    type U = { userID: string; userName: string | null; userLastName: string | null; userCompany: string | null };
    for (const u of (uRaw ?? []) as unknown as U[]) {
      const full = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim();
      nameOf.user.set(u.userID, full || u.userID);
    }
  }

  if (adminIds.length > 0) {
    const { data: aRaw, error: aErr } = await admin
      .from("tb_admin")
      .select("adminID,adminName,adminLastName,adminNickname")
      .in("adminID", adminIds);
    if (aErr) {
      console.error(`[rate-change-history tb_admin] failed`, { code: aErr.code, message: aErr.message });
    }
    type A = { adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null };
    for (const a of (aRaw ?? []) as unknown as A[]) {
      const nick = (a.adminNickname ?? "").trim();
      const full = `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim();
      nameOf.admin.set(a.adminID, nick || full || a.adminID);
    }
  }

  // ── 3. Count child (cell) changes per header — KG + CBM in one pass ──────
  const headerIds = headers.map((h) => h.id);
  const childCount = new Map<number, number>();
  if (headerIds.length > 0) {
    for (const tbl of ["tb_hs_rate_custom_kg", "tb_hs_rate_custom_cbm"] as const) {
      const { data: cRaw, error: cErr } = await admin
        .from(tbl)
        .select("crhsid")
        .in("crhsid", headerIds)
        .limit(5000);
      if (cErr) {
        console.error(`[rate-change-history ${tbl} count] failed`, { code: cErr.code, message: cErr.message });
        continue;
      }
      for (const r of (cRaw ?? []) as unknown as { crhsid: number }[]) {
        childCount.set(r.crhsid, (childCount.get(r.crhsid) ?? 0) + 1);
      }
    }
  }

  // ── 4. If a detail id is requested, load its KG + CBM old→new rows ───────
  let detailKg: HistChildRow[] = [];
  let detailCbm: HistChildRow[] = [];
  let detailHeader: HistHeaderRow | null = null;
  if (detailId != null) {
    detailHeader = headers.find((h) => h.id === detailId) ?? null;
    if (!detailHeader) {
      // Header may be outside the current page/filter — fetch it directly.
      const { data: hRaw, error: hErr } = await admin
        .from("tb_customrate_hs")
        .select("id,userid,adminid,date")
        .eq("id", detailId)
        .maybeSingle<HistHeaderRow>();
      if (hErr) console.error(`[rate-change-history detail header] failed`, { detailId, code: hErr.code, message: hErr.message });
      detailHeader = hRaw ?? null;
    }

    const [{ data: kgRaw, error: kgErr }, { data: cbmRaw, error: cbmErr }] = await Promise.all([
      admin
        .from("tb_hs_rate_custom_kg")
        .select("id,crhsid,userid,sourcewarehouse,rtransporttype,rproductstype,rkgbefore,rkg")
        .eq("crhsid", detailId)
        .order("id", { ascending: true }),
      admin
        .from("tb_hs_rate_custom_cbm")
        .select("id,crhsid,userid,sourcewarehouse,rtransporttype,rproductstype,rcbmbefore,rcbm")
        .eq("crhsid", detailId)
        .order("id", { ascending: true }),
    ]);
    if (kgErr) console.error(`[rate-change-history detail kg] failed`, { detailId, code: kgErr.code, message: kgErr.message });
    if (cbmErr) console.error(`[rate-change-history detail cbm] failed`, { detailId, code: cbmErr.code, message: cbmErr.message });

    type RawKg = { id: number; crhsid: number; userid: string | null; sourcewarehouse: string; rtransporttype: string; rproductstype: string; rkgbefore: number | null; rkg: number | null };
    type RawCbm = { id: number; crhsid: number; userid: string | null; sourcewarehouse: string; rtransporttype: string; rproductstype: string; rcbmbefore: number | null; rcbm: number | null };
    detailKg = ((kgRaw ?? []) as unknown as RawKg[]).map((r) => ({
      id: r.id, crhsid: r.crhsid, userid: r.userid,
      sourcewarehouse: r.sourcewarehouse, rtransporttype: r.rtransporttype, rproductstype: r.rproductstype,
      before: r.rkgbefore != null ? Number(r.rkgbefore) : null,
      after: r.rkg != null ? Number(r.rkg) : null,
    }));
    detailCbm = ((cbmRaw ?? []) as unknown as RawCbm[]).map((r) => ({
      id: r.id, crhsid: r.crhsid, userid: r.userid,
      sourcewarehouse: r.sourcewarehouse, rtransporttype: r.rtransporttype, rproductstype: r.rproductstype,
      before: r.rcbmbefore != null ? Number(r.rcbmbefore) : null,
      after: r.rcbm != null ? Number(r.rcbm) : null,
    }));
  }

  const linkBack = q ? `/admin/reports/rate-change-history?q=${encodeURIComponent(q)}` : `/admin/reports/rate-change-history`;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติการปรับเรทราคาลูกค้า</h1>
          <p className="mt-1 text-sm text-muted">
            ระบบบันทึกทุกครั้งที่แอดมินกดอัปเดตเรทขนส่งรายลูกค้า — ใคร ปรับให้ลูกค้าคนไหน เมื่อไหร่ และจากเรทเดิม → เรทใหม่
            <br />
            <span className="font-mono text-xs">tb_customrate_hs</span> + <span className="font-mono text-xs">tb_hs_rate_custom_kg/cbm</span>
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Read-only banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        รายงานนี้ <span className="font-semibold">อ่านอย่างเดียว</span> — บันทึกประวัติเกิดขึ้นอัตโนมัติเมื่อมีการบันทึกเรทรายลูกค้า
        (หน้าโปรไฟล์ลูกค้า / <span className="font-mono">/admin/rates/custom-user</span>) · แสดงล่าสุด {LIST_LIMIT.toLocaleString("en-US")} รายการ
      </div>

      {/* Error banner (soft-fail) */}
      {headerErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">อ่านข้อมูลไม่สำเร็จ: {headerErr.message}</p>
          <p className="mt-1 text-xs text-red-700">รหัสข้อผิดพลาด: <span className="font-mono">{headerErr.code ?? "unknown"}</span></p>
        </div>
      )}

      {/* Search form (GET) */}
      <form method="GET" action="/admin/reports/rate-change-history" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="q" className="block text-xs text-muted mb-1">ค้นหา รหัสลูกค้า หรือ รหัสแอดมิน</label>
            <input
              id="q"
              type="text"
              name="q"
              defaultValue={q}
              placeholder="เช่น PR009 หรือ adminpoom"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหา
          </button>
          {q && (
            <Link href="/admin/reports/rate-change-history" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt">
              ล้างค้นหา
            </Link>
          )}
        </div>
      </form>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="ครั้งที่ปรับเรท (แสดง)" value={headers.length.toLocaleString("en-US")} />
        <Card label="ลูกค้าที่ถูกปรับ" value={userIds.length.toLocaleString("en-US")} />
        <Card label="แอดมินที่ปรับ" value={adminIds.length.toLocaleString("en-US")} />
      </div>

      {/* Detail panel (when ?id= present) */}
      {detailId != null && (
        <section className="rounded-2xl border border-primary-200 bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border bg-surface-alt/40 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">
                รายละเอียด (รหัสอ้างอิง #{detailId})
              </p>
              {detailHeader && (
                <p className="mt-0.5 text-xs text-muted">
                  ลูกค้า{" "}
                  <span className="font-medium text-foreground">
                    {detailHeader.userid ? nameOf.user.get(detailHeader.userid) ?? detailHeader.userid : "—"}
                  </span>{" "}
                  · ปรับโดย{" "}
                  <span className="font-medium text-foreground">
                    {detailHeader.adminid ? nameOf.admin.get(detailHeader.adminid) ?? detailHeader.adminid : "—"}
                  </span>{" "}
                  · {fmtDate(detailHeader.date)}
                </p>
              )}
            </div>
            <Link href={linkBack} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt">
              ปิดรายละเอียด ✕
            </Link>
          </div>

          <div className="p-4 space-y-6">
            <ChangeTable
              title="ราคาคิดตามน้ำหนัก (KG)"
              unit="บาท/กก."
              rows={detailKg}
            />
            <ChangeTable
              title="ราคาคิดตามปริมาตร (CBM)"
              unit="บาท/คิว"
              rows={detailCbm}
            />
            {detailKg.length === 0 && detailCbm.length === 0 && (
              <p className="text-center text-sm text-muted py-6">ไม่พบรายการเปลี่ยนแปลงของบันทึกนี้</p>
            )}
          </div>
        </section>
      )}

      {/* History list */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {headers.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            {q ? `ไม่พบประวัติที่ตรงกับ "${q}"` : "ยังไม่มีประวัติการปรับเรท"}
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">รหัสอ้างอิง</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">อัปเดตล่าสุด</th>
                  <th className="px-4 py-3">แอดมินที่ปรับ</th>
                  <th className="px-4 py-3 text-right">ช่องที่เปลี่ยน</th>
                  <th className="px-4 py-3 text-center">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => {
                  const isActive = detailId === h.id;
                  const changes = childCount.get(h.id) ?? 0;
                  return (
                    <tr
                      key={h.id}
                      className={`border-t border-border align-top ${isActive ? "bg-primary-50/50" : "hover:bg-surface-alt/30"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">#{h.id}</td>
                      <td className="px-4 py-3 text-xs">
                        {h.userid ? (
                          <Link
                            href={`/admin/customers/${encodeURIComponent(h.userid)}`}
                            className="text-primary-600 hover:underline"
                          >
                            {nameOf.user.get(h.userid) ?? h.userid}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {h.userid && (
                          <span className="block font-mono text-[11px] text-muted">{h.userid}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDate(h.date)}</td>
                      <td className="px-4 py-3 text-xs">
                        {h.adminid ? (
                          <Link
                            href={`/admin/admins/${encodeURIComponent(h.adminid)}`}
                            className="text-primary-600 hover:underline"
                          >
                            {nameOf.admin.get(h.adminid) ?? h.adminid}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {h.adminid && (
                          <span className="block font-mono text-[11px] text-muted">{h.adminid}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {changes > 0 ? changes.toLocaleString("en-US") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/admin/reports/rate-change-history?${q ? `q=${encodeURIComponent(q)}&` : ""}id=${h.id}#detail`}
                          className={`inline-block rounded-lg px-3 py-1.5 text-xs font-medium ${
                            isActive
                              ? "bg-primary-600 text-white"
                              : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          }`}
                        >
                          ดูรายละเอียด
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
        เรียงใหม่→เก่า ตามรหัสอ้างอิง · กด “ดูรายละเอียด” เพื่อดูเรทเดิม → เรทใหม่รายช่อง · กดชื่อลูกค้า/แอดมินเพื่อเปิดโปรไฟล์
      </p>
    </main>
  );
}

// ── per-record KG/CBM old→new change table ────────────────────────────────
function ChangeTable({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: HistChildRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">โกดังจีน</th>
              <th className="px-3 py-2">รูปแบบขนส่ง</th>
              <th className="px-3 py-2">ประเภทสินค้า</th>
              <th className="px-3 py-2 text-right">เรทเดิม</th>
              <th className="px-3 py-2 text-center" aria-hidden="true"></th>
              <th className="px-3 py-2 text-right">เรทใหม่ ({unit})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const wentUp = (r.after ?? 0) > (r.before ?? 0);
              const wentDown = (r.after ?? 0) < (r.before ?? 0);
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs">{warehouseLabel(r.sourcewarehouse)}</td>
                  <td className="px-3 py-2 text-xs">{transportLabel(r.rtransporttype)}</td>
                  <td className="px-3 py-2 text-xs">{productLabel(r.rproductstype)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted">{num(r.before)}</td>
                  <td className="px-3 py-2 text-center text-muted">→</td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-xs font-semibold ${
                      wentUp ? "text-red-700" : wentDown ? "text-emerald-700" : ""
                    }`}
                  >
                    {num(r.after)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}
