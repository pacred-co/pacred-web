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
 * Wave 9 (initial): read-only history list + drill into one customer matrix
 * Wave 12-D (2026-05-23): inline matrix edit on drill-in · INSERT history
 *   row + per-cell snapshot via adminUpdateCustomerHsRates. Mirrors the
 *   legacy users.php L527-591 append-only pattern (one tb_customrate_hs
 *   row per save, N child rows tagged with crhsid).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportRatesCustomHsAll } from "@/actions/admin/export/rates-custom-hs";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { HsRateEditForm, type HsCellInitial } from "./edit-form";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName, type CorporateIdentityRow } from "@/lib/admin/customer-identity";

export const dynamic = "force-dynamic";

// Cell labels live with the client edit-form (edit-form.tsx) — single
// source of truth so a label tweak there flows into the matrix.

type HistoryRow = {
  id: number;
  userid: string;
  date: string | null;
  adminid: string | null;
};
// Kg/CbmRow types pared down to the columns the page actually consumes
// — rkgbefore/rcbmbefore were used by the Wave 9 read-only diff table;
// the edit form takes only the LATEST value and re-reads "before" on
// the server inside adminUpdateCustomerHsRates, so we drop them here.
type KgRow = {
  id: number;
  userid: string;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  rkg: number | null;
  adminidupdate: string | null;
  crhsid: number | null;
};
type CbmRow = Omit<KgRow, "rkg"> & {
  rcbm: number | null;
};
type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  coID: string | null;
  userCompany: string | null;
};

type SP = { userid?: string; q?: string; page?: string };

function cellKey(r: { sourcewarehouse: string; rtransporttype: string; rproductstype: string }) {
  return `${r.sourcewarehouse}|${r.rtransporttype}|${r.rproductstype}`;
}

/**
 * Collapse the per-customer history (KG + CBM rows ordered by crhsid desc)
 * into ONE entry per cell representing the LATEST value — that's what
 * the editor seeds inputs with.
 */
function buildHsCellMatrix(kgRows: KgRow[], cbmRows: CbmRow[]): HsCellInitial[] {
  const out = new Map<string, HsCellInitial>();
  // KG rows are already crhsid-desc → first sighting per key = latest.
  for (const r of kgRows) {
    const k = cellKey(r);
    if (out.has(k)) continue;
    out.set(k, {
      sourcewarehouse: r.sourcewarehouse as "1" | "2",
      rtransporttype: r.rtransporttype as "1" | "2" | "3",
      rproductstype: r.rproductstype as "1" | "2" | "3" | "4",
      rkg: r.rkg,
      rcbm: null,
      rkg_admin: r.adminidupdate,
      rcbm_admin: null,
    });
  }
  // CBM rows likewise — fuse onto existing cells or seed new ones.
  const cbmSeen = new Set<string>();
  for (const r of cbmRows) {
    const k = cellKey(r);
    if (cbmSeen.has(k)) continue;
    cbmSeen.add(k);
    const existing = out.get(k);
    if (existing) {
      existing.rcbm = r.rcbm;
      existing.rcbm_admin = r.adminidupdate;
    } else {
      out.set(k, {
        sourcewarehouse: r.sourcewarehouse as "1" | "2",
        rtransporttype: r.rtransporttype as "1" | "2" | "3",
        rproductstype: r.rproductstype as "1" | "2" | "3" | "4",
        rkg: null,
        rcbm: r.rcbm,
        rkg_admin: null,
        rcbm_admin: r.adminidupdate,
      });
    }
  }
  return Array.from(out.values());
}

export default async function CustomHsRatesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;

  const admin = createAdminClient();

  // History list (search by userid if ?q=) — paginated 50/page (2026-06-04).
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);
  let historyQ = admin
    .from("tb_customrate_hs")
    .select("id,userid,date,adminid")
    .order("date", { ascending: false })
    .range(from, to);
  if (sp.q) historyQ = historyQ.eq("userid", sp.q.trim().toUpperCase());
  const { data: histRaw, error: histRawErr } = await historyQ;
  if (histRawErr) {
    console.error(`[tb_customrate_hs list] failed`, { code: histRawErr.code, message: histRawErr.message });
  }
  const history = (histRaw ?? []) as unknown as HistoryRow[];

  // Exact total — Wave 10 follow-up fix 2026-05-23 (ภูม flagged similar
  // .length-vs-exact-count bug across QA queues). The list is capped at
  // 200 for display but the chip should show TRUE total.
  let totalHistoryCount: number | null = null;
  {
    const q = admin.from("tb_customrate_hs").select("id", { count: "exact", head: true });
    const q2 = sp.q ? q.eq("userid", sp.q.trim().toUpperCase()) : q;
    const { count } = await q2;
    totalHistoryCount = count ?? null;
  }

  // Join customer names for the history list
  const userIds = Array.from(new Set(history.map((h) => h.userid).filter(Boolean)));
  let userMap = new Map<string, URow>();
  const historyCorpNames = await fetchCorporateNameMap(admin, userIds);
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersRawErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel,coID,userCompany")
      .in("userID", userIds);
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }
  // นิติบุคคล → company name (not the contact person) · display-only.
  const historyNameOf = (u: URow | undefined): string =>
    resolveBillingIdentity({
      userCompany: u?.userCompany,
      userName: u?.userName,
      userLastName: u?.userLastName,
      corp: u ? corpRowFromName(historyCorpNames.get(u.userID)) : null,
    }).name || "—";

  // Drill-in: show full matrix for one customer (latest rates by joining children to their LATEST crhsid)
  const selectedUserid = sp.userid?.trim().toUpperCase() ?? null;
  let selectedUser: URow | null = null;
  let selectedCorp: CorporateIdentityRow | null = null;
  let selectedKg: KgRow[] = [];
  let selectedCbm: CbmRow[] = [];
  if (selectedUserid) {
    const [{ data: u }, { data: corp }, { data: k }, { data: c }] = await Promise.all([
      admin.from("tb_users").select("userID,userName,userLastName,userTel,coID,userCompany").eq("userID", selectedUserid).maybeSingle(),
      admin.from("tb_corporate").select("corporatename,corporatenumber,corporateaddress").eq("userid", selectedUserid).maybeSingle<CorporateIdentityRow>(),
      admin.from("tb_hs_rate_custom_kg").select("id,userid,sourcewarehouse,rtransporttype,rproductstype,rkg,adminidupdate,crhsid").eq("userid", selectedUserid).order("crhsid", { ascending: false }).limit(500),
      admin.from("tb_hs_rate_custom_cbm").select("id,userid,sourcewarehouse,rtransporttype,rproductstype,rcbm,adminidupdate,crhsid").eq("userid", selectedUserid).order("crhsid", { ascending: false }).limit(500),
    ]);
    selectedUser = (u as unknown as URow | null) ?? null;
    selectedCorp = corp ?? null;
    selectedKg = (k ?? []) as unknown as KgRow[];
    selectedCbm = (c ?? []) as unknown as CbmRow[];
  }
  // นิติบุคคล → company name (not the contact person) · display-only.
  const selectedName = resolveBillingIdentity({
    userCompany: selectedUser?.userCompany,
    userName: selectedUser?.userName,
    userLastName: selectedUser?.userLastName,
    corp: selectedCorp,
  }).name;

  // (kg/cbm latest-per-cell collapse moved into buildHsCellMatrix, which
  // also produces the shape the edit form needs.)

  // CSV export — mirrors the history <thead> 1:1 (rate-override update history).
  const csvCols: CsvCol[] = [
    { key: "userid", label: "รหัสลูกค้า" },
    { key: "name", label: "ชื่อ" },
    { key: "tel", label: "เบอร์" },
    { key: "coID", label: "กลุ่ม" },
    { key: "date", label: "อัปเดตล่าสุด" },
    { key: "adminid", label: "แอดมิน" },
  ];
  const csvRows: CsvRow[] = history.map((h) => {
    const u = userMap.get(h.userid);
    const name = historyNameOf(u);
    return {
      userid: h.userid,
      name,
      tel: u?.userTel ?? "—",
      coID: u?.coID ?? "—",
      date: h.date ? new Date(h.date).toLocaleString("th-TH") : "—",
      adminid: h.adminid ?? "—",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · RATES · ตามลูกค้า (custom-hs)
        </p>
        <h1 className="mt-1 text-2xl font-bold">Rate Override ต่อลูกค้า</h1>
        <p className="mt-1 text-sm text-muted">
          Wave 12-D inline edit · กดดู matrix แล้วแก้ไขเรท → INSERT
          history row + per-cell snapshot ลง tb_customrate_hs + tb_hs_rate_custom_{`{kg,cbm}`}
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
        <div className="flex items-end justify-between gap-2 flex-wrap mb-2">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider">
            ประวัติการอัปเดต ({totalHistoryCount ?? history.length} รายการ
            {totalHistoryCount && totalHistoryCount > history.length
              ? ` · แสดง ${history.length} ล่าสุด`
              : ""}
            · ใหม่ → เก่า)
          </h2>
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="rate-override-history.csv"
            fetchAll={async () => {
              "use server";
              return exportRatesCustomHsAll({ q: sp.q });
            }}
          />
        </div>
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
                        <td className="px-3 py-2"><CustomerCodeLink code={h.userid} /></td>
                        <td className="px-3 py-2">
                          {historyNameOf(u)}
                        </td>
                        <td className="px-3 py-2 text-muted">{u?.userTel ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {u?.coID ? (
                            <span className="rounded-full bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5">
                              {u.coID}
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
          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={totalHistoryCount ?? 0}
            basePath="/admin/rates/custom-hs"
            params={{ q: sp.q, userid: sp.userid }}
          />
        </div>
      </section>

      {/* Drill-in matrix — Wave 12-D = inline edit (was read-only in Wave 9). */}
      {selectedUserid && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold">
                แก้ไขเรทของ{" "}
                <span className="font-mono text-primary-600">{selectedUserid}</span>
                {selectedUser && (
                  <span className="ml-2 text-sm text-muted font-normal">
                    {selectedName}
                  </span>
                )}
              </h2>
              {selectedUser?.coID && (
                <p className="text-xs text-muted mt-1">
                  กลุ่ม VIP: <span className="font-mono">{selectedUser.coID}</span>{" "}
                  (เรทนี้จะ override เรทของ tier)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/customers/${encodeURIComponent(selectedUserid)}`}
                className="text-xs rounded-md border border-border bg-white px-3 py-1.5 hover:bg-surface-alt"
              >
                โปรไฟล์ลูกค้า
              </Link>
              <Link
                href="/admin/rates/custom-hs"
                className="text-xs text-muted hover:text-foreground self-center"
              >
                ล้าง
              </Link>
            </div>
          </div>

          {selectedUser ? (
            <HsRateEditForm
              userid={selectedUserid}
              customerLabel={`${selectedUserid} · ${selectedName || "—"}`}
              cells={buildHsCellMatrix(selectedKg, selectedCbm)}
            />
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              ไม่พบลูกค้า <span className="font-mono">{selectedUserid}</span> ใน tb_users
            </div>
          )}
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
