/**
 * /admin/forwarder-action?action=… — 9 audit queues
 *
 * Faithful port of legacy `member/pcs-admin/forwarder-action.php` (1192 LOC).
 * 9 audit queues, each with a different `fNote`/`fCover`/`fCabinetNumber`/
 * `fShipBy`/`fCredit` condition driving the result set.
 *
 * Wave 1 — `tb_forwarder` queues: Note, notPhoto, notPortage, notContainer,
 *           NotDateContainerClose, fCreditError. (shipped)
 * Wave 2 — adds (this commit):
 *   - NoteShop          → joins `tb_header_order` (hNote<>'') with hStatus
 *                          tab strip (?q=1..6). NB: legacy comment said
 *                          `tb_shop`; the actual SQL (forwarder-action.php
 *                          L631+) reads `tb_header_order`. We follow the
 *                          SQL, not the stale comment.
 *   - NotShipFree       → fAddressZIPCode IN (free-shipping list) AND
 *                          fShipBy NOT IN ('PCS','PCSF') AND fDate>2022-01-15
 *   - NotShipFreeError  → fAddressZIPCode NOT IN (free-shipping list) AND
 *                          fShipBy='PCSF' AND fDate>2022-01-15
 *
 * The ZIP-code list is the union of the 6 PHP $arrZIPCode* arrays defined in
 * `member/include/function.php` L3 + `member/pcs-admin/include/function.php`
 * L1734-1740 (BKK + NakhonPathom + Nonthaburi + PathumThani(empty) +
 * SamutPrakan + SamutSakhon). Dedup'd. Source-of-truth = the PHP.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

type SP = { action?: string; q?: string };

const ACTION_LABEL: Record<string, string> = {
  Note: "หมายเหตุนำเข้า",
  NoteShop: "หมายเหตุสั่งซื้อ",
  notPhoto: "ไม่ได้ถ่ายสินค้า",
  notPortage: "ไม่ใส่ค่าขนส่ง",
  notContainer: "ไม่ใส่เบอร์ตู้",
  NotDateContainerClose: "ไม่ใส่วันที่ปิดตู้",
  NotShipFree: "ไม่เลือกขนส่งฟรี",
  NotShipFreeError: "เลือกขนส่งฟรีผิด",
  fCreditError: "เครดิตเกินกำหนด",
};

const ACTION_CONDITION: Record<string, string> = {
  Note: "AND fnote <> '' AND fnote IS NOT NULL",
  NoteShop: "tb_header_order: hnote<>'' AND hstatus IN (1..6)",
  notPhoto: "AND fcover = '' AND fstatus > 1 AND fdate > 2022-01-15",
  notPortage: "AND ftransportprice = 0 AND fdate > 2022-01-15",
  notContainer: "AND fcabinetnumber = '' AND fdate > 2022-01-15",
  NotDateContainerClose: "AND fdatecontainerclose IS NULL AND fdate > 2022-01-15",
  NotShipFree: "AND faddresszipcode IN (FREE_SHIPPING_ZIPS) AND fshipby NOT IN ('PCS','PCSF') AND fdate > 2022-01-15",
  NotShipFreeError: "AND faddresszipcode NOT IN (FREE_SHIPPING_ZIPS) AND fshipby = 'PCSF' AND fdate > 2022-01-15",
  fCreditError: "AND fcredit = '1' AND fcreditdate < NOW()",
};

/**
 * Free-shipping ZIP codes — the union of 6 PHP $arrZIPCode* arrays
 * (BKK + Nakhon Pathom + Nonthaburi + Pathum Thani(empty) + Samut Prakan +
 * Samut Sakhon), de-duplicated. Source: `member/pcs-admin/include/function.php`
 * L1734-1740 (and identical lists scattered across cart / forwarder PHP).
 *
 * Stored as strings because `tb_forwarder.faddresszipcode` is varchar(5)
 * and `.in()` requires matching types.
 */
const FREE_SHIPPING_ZIPS = [
  // Bangkok (26 unique)
  "10100", "10110", "10120", "10140", "10150", "10160", "10170",
  "10200", "10210", "10220", "10230", "10240", "10250", "10260",
  "10300", "10310", "10330", "10400", "10500", "10510", "10520",
  "10530", "10600", "10700", "10800", "10900",
  // Nakhon Pathom
  "73110", "73170",
  // Nonthaburi
  "11000", "11110", "11120", "11130", "11140", "11150",
  // Samut Prakan
  "10130", "10270", "10290", "10540", "10560",
  // Samut Sakhon
  "74000", "74110",
];

const NOTE_SHOP_TABS: { q: string | null; label: string }[] = [
  { q: null, label: "ทั้งหมด" },
  { q: "1", label: "รอดำเนินการ" },
  { q: "2", label: "รอชำระเงิน" },
  { q: "3", label: "สั่งสินค้า" },
  { q: "4", label: "รอร้านจีนจัดส่ง" },
  { q: "5", label: "สำเร็จ" },
  { q: "6", label: "ออเดอร์ที่ยกเลิก" },
];

export default async function AdminForwarderActionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);
  const sp = await searchParams;
  const action = sp.action ?? "";
  const label = ACTION_LABEL[action];

  if (!action || !label) {
    return (
      <>
        <TopMenuReport activeHref={`/admin/forwarder-action`} />
        <main className="p-6 lg:p-8">
          <h1 className="text-2xl font-bold">forwarder-action</h1>
          <p className="text-sm text-muted mt-2">
            กรุณาเลือกหัวข้อจากเมนูด้านบน (9 audit queues)
          </p>
        </main>
      </>
    );
  }

  const admin = createAdminClient();

  // --- NoteShop branch: reads tb_header_order, not tb_forwarder ---
  if (action === "NoteShop") {
    const fStatusQ = sp.q;
    let shopQ = admin
      .from("tb_header_order")
      .select("id,hdate,hno,userid,hcover,htitle,hcount,htotalpricechn,hstatus,hnote,hrate,hdateupdate")
      .neq("hnote", "")
      .not("hnote", "is", null)
      .limit(200)
      .order("hdate", { ascending: false });

    if (fStatusQ && /^[1-6]$/.test(fStatusQ)) {
      shopQ = shopQ.eq("hstatus", fStatusQ);
    }

    const { data: shopRows, error: shopError } = await shopQ;

    return (
      <>
        <TopMenuReport activeHref={`/admin/forwarder-action?action=${action}`} />
        <main className="p-4 lg:p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · AUDIT</p>
            <h1 className="mt-1 text-2xl font-bold">{label}</h1>
            <p className="mt-1 text-xs text-muted">
              Legacy condition: <code className="rounded bg-surface-alt px-1 py-0.5">{ACTION_CONDITION[action]}</code>
            </p>
          </div>

          {/* Status tab strip (?q=1..6) */}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {NOTE_SHOP_TABS.map((t) => {
              const isActive = (t.q ?? "") === (fStatusQ ?? "");
              const href = t.q
                ? `/admin/forwarder-action?action=NoteShop&q=${t.q}`
                : `/admin/forwarder-action?action=NoteShop`;
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

          {shopError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              โหลดข้อมูลไม่สำเร็จ: {shopError.message}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            {!shopRows || shopRows.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในคิวนี้</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">ID</th>
                      <th className="px-2 py-2 text-left">วันที่สร้าง</th>
                      <th className="px-2 py-2 text-left">เลขที่ออเดอร์</th>
                      <th className="px-2 py-2 text-left">รหัสสมาชิก</th>
                      <th className="px-2 py-2 text-left">สินค้า</th>
                      <th className="px-2 py-2 text-right">ราคารวม (¥)</th>
                      <th className="px-2 py-2 text-center">สถานะ</th>
                      <th className="px-2 py-2 text-left">หมายเหตุ</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopRows.map((r) => (
                      <tr key={r.id as number} className="border-t border-border">
                        <td className="px-2 py-2 font-mono">{r.id as number}</td>
                        <td className="px-2 py-2">{r.hdate ? String(r.hdate).slice(0, 10) : "-"}</td>
                        <td className="px-2 py-2 font-mono">{(r.hno as string) || "-"}</td>
                        <td className="px-2 py-2 font-mono">{(r.userid as string) || "-"}</td>
                        <td className="px-2 py-2 max-w-[240px] truncate" title={(r.htitle as string) ?? ""}>
                          {(r.htitle as string) || "-"} {r.hcount ? `(${r.hcount as number})` : ""}
                        </td>
                        <td className="px-2 py-2 text-right">{Number(r.htotalpricechn ?? 0).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{r.hstatus as string}</td>
                        <td className="px-2 py-2 max-w-[280px] truncate" title={(r.hnote as string) ?? ""}>
                          {(r.hnote as string) || "-"}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            href={`/admin/orders?q=${r.hno as string}`}
                            className="text-primary-600 hover:underline text-[11px]"
                          >
                            ดู
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted">
            (Wave 2 — แสดงไม่เกิน 200 แถว · tb_header_order audit · edit / printShop / status-count badges → Wave 3)
          </p>
        </main>
      </>
    );
  }

  // --- All other actions: read tb_forwarder ---
  let q = admin
    .from("tb_forwarder")
    .select("id,fdate,fcabinetnumber,ftrackingchn,fstatus,fnote,fcover,fwarehousename,ftotalprice,fshipby,faddresszipcode")
    .limit(200)
    .order("fdate", { ascending: false });

  const cutoff = "2022-01-15 00:00:00";
  if (action === "Note") {
    q = q.not("fnote", "is", null).neq("fnote", "");
  } else if (action === "notPhoto") {
    q = q.eq("fcover", "").gt("fstatus", "1").gte("fdate", cutoff);
  } else if (action === "notPortage") {
    q = q.eq("ftransportprice", 0).gte("fdate", cutoff);
  } else if (action === "notContainer") {
    q = q.eq("fcabinetnumber", "").gte("fdate", cutoff);
  } else if (action === "NotDateContainerClose") {
    q = q.is("fdatecontainerclose", null).gte("fdate", cutoff);
  } else if (action === "fCreditError") {
    q = q.eq("fcredit", "1").lt("fcreditdate", new Date().toISOString());
  } else if (action === "NotShipFree") {
    // ZIP in free-shipping list, but customer chose a non-free carrier
    q = q
      .in("faddresszipcode", FREE_SHIPPING_ZIPS)
      .not("fshipby", "in", `(PCS,PCSF)`)
      .gte("fdate", cutoff);
  } else if (action === "NotShipFreeError") {
    // ZIP NOT in free-shipping list, but customer chose free carrier (PCSF) — error case
    q = q
      .not("faddresszipcode", "in", `(${FREE_SHIPPING_ZIPS.join(",")})`)
      .eq("fshipby", "PCSF")
      .gte("fdate", cutoff);
  }

  const fStatusQ = sp.q;
  if (fStatusQ) q = q.eq("fstatus", fStatusQ);

  const { data: rows, error } = await q;

  return (
    <>
      <TopMenuReport activeHref={`/admin/forwarder-action?action=${action}`} />
      <main className="p-4 lg:p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · AUDIT</p>
          <h1 className="mt-1 text-2xl font-bold">{label}</h1>
          <p className="mt-1 text-xs text-muted">
            Legacy condition: <code className="rounded bg-surface-alt px-1 py-0.5">{ACTION_CONDITION[action] ?? "TBD"}</code>
          </p>
          {(action === "NotShipFree" || action === "NotShipFreeError") && (
            <p className="mt-1 text-[11px] text-muted">
              Free-shipping ZIP list: {FREE_SHIPPING_ZIPS.length} codes (BKK + นนทบุรี + ปทุมธานี + นครปฐม + สมุทรปราการ + สมุทรสาคร)
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error.message}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {!rows || rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในคิวนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">ID</th>
                    <th className="px-2 py-2 text-left">วันที่</th>
                    <th className="px-2 py-2 text-left">เบอร์ตู้</th>
                    <th className="px-2 py-2 text-left">tracking จีน</th>
                    <th className="px-2 py-2 text-center">สถานะ</th>
                    {(action === "NotShipFree" || action === "NotShipFreeError") && (
                      <>
                        <th className="px-2 py-2 text-left">ZIP</th>
                        <th className="px-2 py-2 text-left">ShipBy</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-left">หมายเหตุ</th>
                    <th className="px-2 py-2 text-right">ราคา</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id as number} className="border-t border-border">
                      <td className="px-2 py-2 font-mono">{r.id as number}</td>
                      <td className="px-2 py-2">{r.fdate ? String(r.fdate).slice(0, 10) : "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.fcabinetnumber as string) || "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.ftrackingchn as string) || "-"}</td>
                      <td className="px-2 py-2 text-center">{r.fstatus as string}</td>
                      {(action === "NotShipFree" || action === "NotShipFreeError") && (
                        <>
                          <td className="px-2 py-2 font-mono">{(r.faddresszipcode as string) || "-"}</td>
                          <td className="px-2 py-2 font-mono">{(r.fshipby as string) || "-"}</td>
                        </>
                      )}
                      <td className="px-2 py-2 max-w-[280px] truncate" title={(r.fnote as string) ?? ""}>{(r.fnote as string) ?? "-"}</td>
                      <td className="px-2 py-2 text-right">{Number(r.ftotalprice ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <Link href={`/admin/forwarders?q=${r.id as number}`} className="text-primary-600 hover:underline text-[11px]">
                          ดู
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted">
          (แสดงไม่เกิน 200 แถว · edit buttons + bulk-apply (notPortage รวมค่าขนส่ง) → Wave 3)
        </p>
      </main>
    </>
  );
}
