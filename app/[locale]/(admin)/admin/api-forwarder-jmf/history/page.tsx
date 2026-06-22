/**
 * /admin/api-forwarder-jmf/history — JMF Auto-API history (READ-ONLY).
 *
 * Wave 6 (2026-06-14). Faithful port of the legacy
 *   include/pages/api-forwarder-jmf/history.php
 * which does `SELECT * FROM tb_forwarder_jmf_tmp` (history.php:41) and renders
 * each row with API STATUS (200 = ทำงานเรียบร้อย / else = มีข้อผิดพลาด) and
 * API Result (2 = อัปเดตถึงโกดังจีน / 3 = อัปเดตกำลังส่งมาไทย / else = สร้างรายการใหม่).
 *
 * The legacy maps fWarehouseChina (1=กวางโจว, 2=อี้อู) + fTransportType via
 * nameTransportType(). We mirror the warehouse map; transport-type shows raw
 * (the legacy helper isn't in scope and the field is a free single-char code).
 *
 * §0e — reads the LIVE legacy table `tb_forwarder_jmf_tmp` (Postgres lowercases
 * the columns: datecrate / userid / fidorco / ftrackingchn / fdetail / famount /
 * fweight / fwidth / flength / fheight / fvolume / fwarehousechina /
 * fdatecontainerclose / ftransporttype / fcabinetnumber / apistatus / apiresult).
 * §0c — every Supabase query destructures error. NO writes (read-only viewer).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { History, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type JmfRow = {
  id: number;
  datecrate: string | null;
  userid: string | null;
  fidorco: string | null;
  ftrackingchn: string | null;
  fdetail: string | null;
  famount: number | null;
  fweight: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  fvolume: number | string | null;
  fwarehousechina: string | null;
  fdatecontainerclose: string | null;
  ftransporttype: string | null;
  fcabinetnumber: string | null;
  apistatus: string | null;
  apiresult: string | null;
};

// Legacy fWarehouseChina map (history.php:134-140).
function warehouseLabel(v: string | null): string {
  if (v === "1") return "กวางโจว";
  if (v === "2") return "อี้อู";
  return v ?? "—";
}

// Legacy APIStatus map (history.php:142-148): 200 = ok, else error.
function apiStatusLabel(v: string | null): { text: string; ok: boolean } {
  if (v === "200") return { text: "ทำงานเรียบร้อย", ok: true };
  return { text: v ? "มีข้อผิดพลาด" : "—", ok: false };
}

// Legacy APIResult map (history.php:149-157): 2 = at-CN-warehouse, 3 = en-route-TH, else = new.
function apiResultLabel(v: string | null): string {
  if (v === "2") return "อัปเดตถึงโกดังจีน";
  if (v === "3") return "อัปเดตกำลังส่งมาไทย";
  return "สร้างรายการใหม่";
}

function parseDateParam(v: string | string[] | undefined, endOfDay = false): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return endOfDay ? `${s}T23:59:59.999` : `${s}T00:00:00`;
}

function num(v: number | string | null): number {
  return Number(v ?? 0);
}

async function loadRows(
  fromIso: string | null,
  toIso: string | null,
): Promise<{ rows: JmfRow[]; error: string | null }> {
  const admin = createAdminClient();
  let q = admin
    .from("tb_forwarder_jmf_tmp")
    .select(
      "id, datecrate, userid, fidorco, ftrackingchn, fdetail, famount, fweight, fwidth, flength, fheight, fvolume, fwarehousechina, fdatecontainerclose, ftransporttype, fcabinetnumber, apistatus, apiresult",
    )
    .order("id", { ascending: false })
    .limit(2000);

  if (fromIso) q = q.gte("datecrate", fromIso);
  if (toIso) q = q.lte("datecrate", toIso);

  const { data, error } = await q;
  if (error) {
    console.error("[jmf history] tb_forwarder_jmf_tmp query failed", {
      code: error.code,
      message: error.message,
    });
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as JmfRow[], error: null };
}

export default async function JmfHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "ops", "warehouse"]);

  const sp = (await searchParams) ?? {};
  const fromIso = parseDateParam(sp.from, false);
  const toIso = parseDateParam(sp.to, true);
  const fromDate = sp.from ?? "";
  const toDate = sp.to ?? "";

  const { rows, error } = await loadRows(fromIso, toIso);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-jmf" className="hover:text-primary-600">JMF</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ประวัติ Auto-API</span>
      </nav>

      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary-700">
            <History className="h-6 w-6" />
            ประวัติ Auto-API (JMF)
          </h1>
          <p className="mt-1 text-xs text-muted">
            รายการที่ JMF ส่งเข้าระบบ + สถานะ API · อ่านจาก{" "}
            <code className="bg-surface-alt px-1 rounded">tb_forwarder_jmf_tmp</code> (อ่านอย่างเดียว)
          </p>
        </div>
        <Link
          href="/admin/api-forwarder-jmf"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
        >
          <ArrowLeft className="h-3 w-3" /> กลับหน้า JMF
        </Link>
      </header>

      {/* Date filter (legacy filters on send-date · default = no filter, latest 2000) */}
      <section className="rounded-xl border border-primary-200 bg-primary-50/40 p-4">
        <form method="GET" className="flex items-end gap-2 flex-wrap">
          <label className="text-xs font-medium text-primary-700">
            <span className="block mb-0.5">วันรับ ตั้งแต่</span>
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
            กรองจาก <code className="bg-white px-1 rounded">tb_forwarder_jmf_tmp.datecrate</code> · แสดงล่าสุด 2000 รายการ
          </span>
        </form>
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <header className="border-b border-gray-200 bg-surface-alt/40 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <History className="h-4 w-4 text-primary-600" />
          <h2 className="text-sm font-bold">{rows.length} รายการ</h2>
        </header>

        {error ? (
          <p className="p-6 text-center text-sm text-red-600">
            ⚠️ อ่านตาราง <code className="bg-red-50 px-1 rounded">tb_forwarder_jmf_tmp</code> ไม่สำเร็จ: {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            ⚠️ ไม่มีข้อมูล JMF ในช่วงที่เลือก
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs border-collapse min-w-[1280px]">
              <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="text-left px-2 py-2 border-b w-12">ที่</th>
                  <th className="text-left px-2 py-2 border-b w-28">วันรับ</th>
                  <th className="text-left px-2 py-2 border-b w-24">รหัสลูกค้า</th>
                  <th className="text-left px-2 py-2 border-b w-20">ID/CO</th>
                  <th className="text-left px-2 py-2 border-b w-36">เลขแทร็คจีน</th>
                  <th className="text-left px-2 py-2 border-b">รายละเอียด</th>
                  <th className="text-right px-2 py-2 border-b w-12">ลัง</th>
                  <th className="text-right px-2 py-2 border-b w-16">หนัก</th>
                  <th className="text-right px-2 py-2 border-b w-14">กว้าง</th>
                  <th className="text-right px-2 py-2 border-b w-14">ยาว</th>
                  <th className="text-right px-2 py-2 border-b w-14">สูง</th>
                  <th className="text-right px-2 py-2 border-b w-16">คิว</th>
                  <th className="text-left px-2 py-2 border-b w-20">โกดัง</th>
                  <th className="text-left px-2 py-2 border-b w-28">วันปิดตู้</th>
                  <th className="text-left px-2 py-2 border-b w-20">ขนส่งจีน</th>
                  <th className="text-left px-2 py-2 border-b w-28">เลขที่ตู้</th>
                  <th className="text-left px-2 py-2 border-b w-28">API STATUS</th>
                  <th className="text-left px-2 py-2 border-b w-32">API Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const status = apiStatusLabel(r.apistatus);
                  return (
                    <tr key={r.id} className="border-b align-top hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-muted">{r.id}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.datecrate?.slice(0, 19).replace("T", " ") ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.userid ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.fidorco ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono break-all">{r.ftrackingchn ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.fdetail ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.famount).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.fweight).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.fwidth).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.flength).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.fheight).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.fvolume).toLocaleString("en-US", { maximumFractionDigits: 5 })}</td>
                      <td className="px-2 py-1.5">{warehouseLabel(r.fwarehousechina)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.fdatecontainerclose?.slice(0, 10) ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.ftransporttype ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.fcabinetnumber || "—"}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            status.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {status.text}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{apiResultLabel(r.apiresult)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
