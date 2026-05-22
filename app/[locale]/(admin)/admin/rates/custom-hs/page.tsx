/**
 * /admin/rates/custom-hs — Rate Override ต่อลูกค้า (HS-style · Wave 9 · 2026-05-23)
 *
 * 🎯 Wave 7.2 บอกว่า "tb_priceuser_hs ไม่อยู่บน prod" → ผมตั้งชื่อตาราง legacy
 *    ผิดเช่นกัน. ตารางจริงคือ `tb_customrate_hs` (history · 463 entries) +
 *    `tb_hs_rate_custom_kg` (1,481 KG rows) + `tb_hs_rate_custom_cbm` (1,537
 *    CBM rows) — ทั้งหมดอยู่บน prod แล้ว.
 *
 * Legacy source: pcs-admin/include/pages/hs-customrate/home.php.
 *
 * Data model:
 *   tb_customrate_hs(id, userid, date, adminid)   — history log (one entry
 *                                                    per "update rates for this customer")
 *     ⇣ FK crhsid
 *   tb_hs_rate_custom_kg(userid, sourcewarehouse, rtransporttype,
 *                        rproductstype, rkg, rkgbefore, crhsid)
 *   tb_hs_rate_custom_cbm(...)
 *
 *   463 customers have custom rates. Each "entry" = a moment in time when
 *   admin updated all dimensions for that customer; child KG/CBM rows snapshot
 *   the old + new rate values per (warehouse, transport, productType).
 *
 * Wave 9 (this commit): read-only history list + drill into one customer
 * Wave 10 backlog: form แก้ไข rate (INSERT history row + UPSERT children)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "อี้อู",
  "2": "กวางโจว",
};
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};
const PRODUCT_LABEL: Record<string, string> = {
  "1": "ทั่วไป",
  "2": "มอก.",
  "3": "อย.",
  "4": "พิเศษ",
};

type HistoryRow = {
  id: number;
  userid: string;
  date: string | null;
  adminid: string | null;
};
type KgRow = {
  id: number;
  userid: string;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  rkg: number | null;
  rkgbefore: number | null;
  adminidupdate: string | null;
  crhsid: number | null;
};
type CbmRow = Omit<KgRow, "rkg" | "rkgbefore"> & {
  rcbm: number | null;
  rcbmbefore: number | null;
};
type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  coid: string | null;
};

type SP = { userid?: string; q?: string };

function cellKey(r: { sourcewarehouse: string; rtransporttype: string; rproductstype: string }) {
  return `${r.sourcewarehouse}|${r.rtransporttype}|${r.rproductstype}`;
}

export default async function CustomHsRatesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;

  const admin = createAdminClient();

  // History list (search by userid if ?q=)
  let historyQ = admin
    .from("tb_customrate_hs")
    .select("id,userid,date,adminid")
    .order("date", { ascending: false })
    .limit(200);
  if (sp.q) historyQ = historyQ.eq("userid", sp.q.trim().toUpperCase());
  const { data: histRaw } = await historyQ;
  const history = (histRaw ?? []) as unknown as HistoryRow[];

  // Join customer names for the history list
  const userIds = Array.from(new Set(history.map((h) => h.userid).filter(Boolean)));
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw } = await admin
      .from("tb_users")
      .select("userid,username,userlastname,usertel,coid")
      .in("userid", userIds);
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userid, u]));
  }

  // Drill-in: show full matrix for one customer (latest rates by joining children to their LATEST crhsid)
  const selectedUserid = sp.userid?.trim().toUpperCase() ?? null;
  let selectedUser: URow | null = null;
  let selectedKg: KgRow[] = [];
  let selectedCbm: CbmRow[] = [];
  if (selectedUserid) {
    const [{ data: u }, { data: k }, { data: c }] = await Promise.all([
      admin.from("tb_users").select("userid,username,userlastname,usertel,coid").eq("userid", selectedUserid).maybeSingle(),
      admin.from("tb_hs_rate_custom_kg").select("id,userid,sourcewarehouse,rtransporttype,rproductstype,rkg,rkgbefore,adminidupdate,crhsid").eq("userid", selectedUserid).order("crhsid", { ascending: false }).limit(500),
      admin.from("tb_hs_rate_custom_cbm").select("id,userid,sourcewarehouse,rtransporttype,rproductstype,rcbm,rcbmbefore,adminidupdate,crhsid").eq("userid", selectedUserid).order("crhsid", { ascending: false }).limit(500),
    ]);
    selectedUser = (u as unknown as URow | null) ?? null;
    selectedKg = (k ?? []) as unknown as KgRow[];
    selectedCbm = (c ?? []) as unknown as CbmRow[];
  }

  // Keep only the LATEST row per cell (crhsid desc = latest first → take first per key)
  const kgMap = new Map<string, KgRow>();
  for (const r of selectedKg) if (!kgMap.has(cellKey(r))) kgMap.set(cellKey(r), r);
  const cbmMap = new Map<string, CbmRow>();
  for (const r of selectedCbm) if (!cbmMap.has(cellKey(r))) cbmMap.set(cellKey(r), r);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · RATES · ตามลูกค้า (custom-hs)
        </p>
        <h1 className="mt-1 text-2xl font-bold">Rate Override ต่อลูกค้า</h1>
        <p className="mt-1 text-sm text-muted">
          Wave 9 read-only · 463 ลูกค้ามี custom rate ของตัวเอง · อ่านจาก
          tb_customrate_hs + tb_hs_rate_custom_{`{kg,cbm}`} · แก้ไข rate → Wave 10
        </p>
      </div>

      {/* Search */}
      <form className="flex gap-2 flex-wrap" action="/admin/rates/custom-hs">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="กรองด้วยรหัสลูกค้า (PR…)"
          className="rounded-lg border border-border px-3 py-2 text-sm w-72"
        />
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">
          ค้นหา
        </button>
      </form>

      {/* History list */}
      <section>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
          ประวัติการอัปเดต ({history.length} รายการ · ใหม่ → เก่า)
        </h2>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {history.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">ไม่พบรายการ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">รหัสลูกค้า</th>
                    <th className="px-3 py-2 text-left">ชื่อ</th>
                    <th className="px-3 py-2 text-left">เบอร์</th>
                    <th className="px-3 py-2 text-left">กลุ่ม</th>
                    <th className="px-3 py-2 text-left">อัปเดตล่าสุด</th>
                    <th className="px-3 py-2 text-left">แอดมิน</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const u = userMap.get(h.userid);
                    return (
                      <tr key={h.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-3 py-2 font-mono">{h.userid}</td>
                        <td className="px-3 py-2">
                          {`${u?.username ?? ""} ${u?.userlastname ?? ""}`.trim() || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted">{u?.usertel ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {u?.coid ? (
                            <span className="rounded-full bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5">
                              {u.coid}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {h.date ? new Date(h.date).toLocaleString("th-TH") : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{h.adminid ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/rates/custom-hs?userid=${encodeURIComponent(h.userid)}`}
                            className="text-primary-600 hover:underline text-xs"
                          >
                            ดู matrix →
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
      </section>

      {/* Drill-in matrix */}
      {selectedUserid && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold">
                Matrix สำหรับ{" "}
                <span className="font-mono text-primary-600">{selectedUserid}</span>
                {selectedUser && (
                  <span className="ml-2 text-sm text-muted font-normal">
                    {`${selectedUser.username ?? ""} ${selectedUser.userlastname ?? ""}`.trim() || ""}
                  </span>
                )}
              </h2>
              {selectedUser?.coid && (
                <p className="text-xs text-muted mt-1">
                  กลุ่ม VIP: <span className="font-mono">{selectedUser.coid}</span>
                </p>
              )}
            </div>
            <Link
              href="/admin/rates/custom-hs"
              className="text-xs text-muted hover:text-foreground"
            >
              ล้างการเลือก
            </Link>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">โกดังจีน</th>
                  <th className="px-3 py-2 text-left">ขนส่ง</th>
                  <th className="px-3 py-2 text-left">ประเภทสินค้า</th>
                  <th className="px-3 py-2 text-right">KG ก่อน</th>
                  <th className="px-3 py-2 text-right">KG ใหม่</th>
                  <th className="px-3 py-2 text-right">CBM ก่อน</th>
                  <th className="px-3 py-2 text-right">CBM ใหม่</th>
                  <th className="px-3 py-2 text-left">แอดมิน</th>
                </tr>
              </thead>
              <tbody>
                {(["1", "2"] as const).flatMap((wh) =>
                  (["1", "2", "3"] as const).flatMap((tr) =>
                    (["1", "2", "3", "4"] as const).map((pr) => {
                      const key = `${wh}|${tr}|${pr}`;
                      const kg = kgMap.get(key);
                      const cbm = cbmMap.get(key);
                      const hasAny = !!kg || !!cbm;
                      return (
                        <tr
                          key={key}
                          className={`border-t border-border ${hasAny ? "" : "opacity-40"}`}
                        >
                          <td className="px-3 py-2">{WAREHOUSE_LABEL[wh]}</td>
                          <td className="px-3 py-2">{TRANSPORT_LABEL[tr]}</td>
                          <td className="px-3 py-2">{PRODUCT_LABEL[pr]}</td>
                          <td className="px-3 py-2 text-right font-mono text-muted">
                            {kg?.rkgbefore != null ? Number(kg.rkgbefore).toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {kg?.rkg != null ? `฿${Number(kg.rkg).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted">
                            {cbm?.rcbmbefore != null ? Number(cbm.rcbmbefore).toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {cbm?.rcbm != null ? `฿${Number(cbm.rcbm).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-muted">
                            {kg?.adminidupdate ?? cbm?.adminidupdate ?? "—"}
                          </td>
                        </tr>
                      );
                    }),
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            <Link
              href={`/admin/customers/${encodeURIComponent(selectedUserid)}`}
              className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
            >
              ดูโปรไฟล์ลูกค้า →
            </Link>
          </div>
        </section>
      )}

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/rates/general"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← Rate default
        </Link>
        <Link
          href="/admin/rates/custom-user"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← Rate ตามกลุ่ม VIP
        </Link>
      </div>
    </main>
  );
}
