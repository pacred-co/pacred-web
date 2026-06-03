/**
 * /admin/reports/credit-pending — เครดิตค้างนำเข้า (Wave 20 P0-4 swap)
 *
 * **Wave 20 P0-4 (2026-05-26):** previously this read the rebuilt
 * `forwarders` + `wallet_transactions` tables — both EMPTY on prod
 * (the 47K real forwarder rows + 104K wallet rows live on legacy
 * `tb_forwarder` + `tb_wallet_hs`). Staff saw ฿0 outstanding when in
 * reality dozens of credit-customers owe money. Same bug class as
 * Wave 3 P0 #1 (/admin/forwarders rewrite) and Wave 19 (`service-orders`).
 *
 * **Legacy semantics:** in `tb_forwarder` the credit-pending set is
 *   fcredit='1' AND paydeposit != '1'
 * — i.e. the row was flagged as "ส่งก่อนชำระ" (credit terms · admin set
 * `fcredit='1'` + status=6 in legacy `pcs-admin/forwarder.php` L1431) but
 * the deposit ledger has NOT been settled (`paydeposit='1'` = paid in full).
 *
 * **Outstanding amount:** the legacy total = `calPriceForwarderMain` —
 * we reuse our port (`lib/forwarder/outstanding.ts` · Wave 15 P0-3). When
 * `paydeposit='1'` the outstanding is zero by definition (matches the
 * same rule on `/admin/forwarders` list).
 *
 * **Customer join:** 2-pass `tb_users.in("userid", [...])` — same pattern
 * as `/admin/forwarders/page.tsx` Wave 3 P0 #1 (PostgREST cannot reliably
 * auto-join on legacy text FK).
 *
 * §0c compliance: every Supabase query destructures { data, error }, logs
 * + throws on the load-bearing reads so a transient PgBouncer timeout
 * surfaces a real error instead of silently rendering "🎉 ไม่มีเครดิตค้าง".
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

export const dynamic = "force-dynamic";

// D1 Phase-B Wave-B5 (sidebar fidelity): sidebar routes 1 SLA queue here
// — เครดิตเกินกำหนด. The page already segments stuck14 (>=14 days) as a
// stat card; the real "overdue" threshold in legacy PHP is not yet
// confirmed (could be per-customer credit_terms vs hardcoded N days), so
// we surface ?sla= as a chip + banner and leave the query untouched.
const SLA_CFG: Record<string, string> = {
  "overdue": "เครดิตเกินกำหนด",
};

type RawForwarder = {
  id: number;
  fdate: string | null;
  fstatus: string;
  ftransporttype: string;
  userid: string;
  fidorco: string | null;
  paydeposit: string | null;
  // Outstanding-calc inputs (Wave 15 P0-3 — calcForwarderOutstanding)
  ftotalprice:           number | string | null;
  ftransportprice:       number | string | null;
  fpriceupdate:          number | string | null;
  fshippingservice:      number | string | null;
  pricecrate:            number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother:            number | string | null;
  fdiscount:             number | string | null;
  fusercompany:          number | string | null;
  // Display
  fdatestatus3: string | null;  // ออกจีน
  fdatestatus4: string | null;  // ถึงไทย
};

type RawUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

type Row = {
  id: number;
  order_no: string;                  // "ออเดอร์ #<id>" — legacy display label
  f_no_cargo: string | null;          // fidorco — separate Cargo API id
  status: string;                     // fstatus
  transport_type: string;
  created_at: string;
  date_shipped_china: string | null;
  outstanding_thb: number;
  paydeposit: string | null;
  customer: {
    userid: string;
    name: string;
    member_code: string;
    phone: string;
  };
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function daysAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function CreditPendingReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; sla?: string; page?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;
  const admin = createAdminClient();

  // 1) Fetch credit-flagged forwarders within date window.
  //    Credit-pending = fcredit='1' AND paydeposit != '1' (not paid in full).
  //    Legacy 1431: when admin clicks "ให้เครดิต" the row is set to
  //    paydeposit='2' (deposit-only paid) + fcredit='1'. "paid in full"
  //    later flips paydeposit='1'. So our exclude rule = paydeposit != '1'.
  let fq = admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fstatus,ftransporttype,userid,fidorco,paydeposit," +
      "ftotalprice,ftransportprice,fpriceupdate,fshippingservice,pricecrate," +
      "ftransportpricechnthb,priceother,fdiscount,fusercompany," +
      "fdatestatus3,fdatestatus4",
    )
    .eq("fcredit", "1")
    .neq("paydeposit", "1")
    .order("fdate", { ascending: true, nullsFirst: false })
    .limit(2000);
  if (sp.date_from) fq = fq.gte("fdate", sp.date_from);
  if (sp.date_to)   fq = fq.lte("fdate", sp.date_to + "T23:59:59");
  const { data: fData, error: fErr } = await fq;
  if (fErr) {
    console.error(`[tb_forwarder credit-pending list] failed`, {
      code: fErr.code, message: fErr.message, details: fErr.details,
    });
    throw new Error(`Failed to load tb_forwarder (${fErr.code ?? "unknown"}): ${fErr.message}`);
  }
  const forwarders = (fData ?? []) as unknown as RawForwarder[];

  // 2) Customer join (2-pass · same pattern as /admin/forwarders).
  const useridList = Array.from(new Set(forwarders.map((r) => r.userid).filter(Boolean)));
  let userMap = new Map<string, RawUser>();
  if (useridList.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", useridList);
    if (usersErr) {
      console.error(`[tb_users join] failed`, { code: usersErr.code, message: usersErr.message });
    } else {
      userMap = new Map((usersRaw ?? []).map((u) => [u.userID, u as RawUser]));
    }
  }

  // 3) Shape rows + compute outstanding.
  const rows: Row[] = forwarders.map((r) => {
    const u = userMap.get(r.userid);
    return {
      id: r.id,
      order_no: `ออเดอร์ #${r.id}`,
      f_no_cargo: r.fidorco,
      status: r.fstatus,
      transport_type: r.ftransporttype,
      created_at: r.fdate ?? "",
      // Legacy "ออกจากจีน" date = fdatestatus3 (in transit), fall back to
      // fdatestatus4 (arrived TH) or created_at when neither set.
      date_shipped_china: r.fdatestatus3 || r.fdatestatus4 || null,
      outstanding_thb: calcForwarderOutstanding(r),
      paydeposit: r.paydeposit,
      customer: {
        userid: r.userid,
        name: u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "",
        member_code: r.userid,  // legacy uses userid (e.g. PR10843) as the customer code
        phone: u?.userTel ?? "",
      },
    };
  });

  // Totals computed over the FULL set (correct) before paginating the display.
  const total = rows.reduce((s, r) => s + r.outstanding_thb, 0);
  const stuck14 = rows.filter((r) => {
    const ref = r.date_shipped_china ?? r.created_at;
    return daysAgo(ref) >= 14;
  }).length;

  // PERF (2026-06-03): paginate the DISPLAYED table (50/page) — the grand
  // total above stays full-set-correct because outstanding_thb is a per-row
  // JS computation, so we keep the full fetch for the sum and only slice the
  // rows we render. ?page=N drives the window (shared <Pagination>).
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  const csvRows = rows.map((r) => ({
    order_no:        r.order_no,
    f_no_cargo:      r.f_no_cargo ?? "",
    status:          legacyForwarderStatusThai(r.status),
    customer_member: r.customer.member_code,
    customer_name:   r.customer.name,
    customer_phone:  r.customer.phone,
    outstanding:     r.outstanding_thb,
    transport:       r.transport_type,
    shipped_at:      r.date_shipped_china ?? "",
    created_at:      r.created_at,
    days_credit:     daysAgo(r.date_shipped_china ?? r.created_at),
  }));
  const csvCols = [
    { key: "order_no",        label: "ออเดอร์" },
    { key: "f_no_cargo",      label: "Cargo ID" },
    { key: "status",          label: "สถานะ" },
    { key: "customer_member", label: "รหัสลูกค้า" },
    { key: "customer_name",   label: "ชื่อลูกค้า" },
    { key: "customer_phone",  label: "เบอร์" },
    { key: "outstanding",     label: "ยอดค้างชำระ (บาท)" },
    { key: "transport",       label: "ประเภทขนส่ง" },
    { key: "shipped_at",      label: "วันที่ออกจากจีน" },
    { key: "created_at",      label: "วันที่สร้าง" },
    { key: "days_credit",     label: "เครดิตค้างกี่วัน" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            เครดิตค้างนำเข้า{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">
            อ่านจาก <span className="font-mono">tb_forwarder</span> WHERE{" "}
            <span className="font-mono">fcredit=&#39;1&#39;</span> AND{" "}
            <span className="font-mono">paydeposit ≠ &#39;1&#39;</span> · ยอดค้าง = calPriceForwarderMain (Wave 15 P0-3)
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href="/admin/reports/credit-pending"
                className="rounded-full bg-white/70 px-1.5 leading-none hover:bg-white"
                aria-label="ล้างตัวกรอง SLA"
              >
                ×
              </Link>
            </span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ตัวกรอง SLA: {slaLabel} · กำลังพัฒนาเงื่อนไขกรอง · แสดงทุกรายการในขณะนี้
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <AdminDateFilter dateFrom={sp.date_from} dateTo={sp.date_to} />
        <CsvButton rows={csvRows} cols={csvCols} filename={`credit-pending-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="รายการ" value={String(rows.length)} />
        <Card label="ยอดค้างรวม" value={thb(total)} highlight={total > 0} />
        <Card label="ค้าง ≥ 14 วัน" value={String(stuck14)} highlight={stuck14 > 0} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีเครดิตค้างในช่วงเวลานี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ออเดอร์</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอดค้างชำระ</th>
                  <th className="px-4 py-3">ออกจีน</th>
                  <th className="px-4 py-3 text-right">เครดิต</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const ref = r.date_shipped_china ?? r.created_at;
                  const age = daysAgo(ref);
                  const ageBadge = age >= 30 ? "bg-red-50 text-red-700 border-red-200"
                    : age >= 14 ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-surface-alt text-muted border-border";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/forwarders/${r.id}`} className="text-primary-600 hover:underline">
                          {r.order_no}
                        </Link>
                        {r.f_no_cargo ? (
                          <div className="text-[10px] text-muted">Cargo: {r.f_no_cargo}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {legacyForwarderStatusThai(r.status) || r.status}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{r.customer.name || "—"}</div>
                        <div className="font-mono text-[10px] text-muted">{r.customer.member_code}</div>
                        {r.customer.phone && <div className="text-[10px] text-muted">☎ {r.customer.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{thb(r.outstanding_thb)}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.date_shipped_china ? new Date(r.date_shipped_china).toLocaleDateString("th-TH") : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ageBadge}`}>
                          {age} วัน
                        </span>
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
          total={rows.length}
          basePath="/admin/reports/credit-pending"
          params={{ date_from: sp.date_from, date_to: sp.date_to, sla: sp.sla }}
        />
      </div>

      <p className="text-[11px] text-muted">
        ยอดค้างรวม + จำนวนคำนวณจากชุดข้อมูลทั้งหมด · ตารางแบ่งหน้าละ {DEFAULT_PAGE_SIZE} แถว
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
