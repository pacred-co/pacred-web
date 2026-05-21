/**
 * /admin/forwarders — รายการฝากนำเข้าสินค้า (faithful port)
 *
 * Wave 3 P0 #1 — rewritten 2026-05-21 to read the legacy `tb_forwarder`
 * table (loaded via migration 0081 · ~8,898 customers · all their import
 * orders). Previously this page read the rebuilt-from-scratch `forwarders`
 * table which is EMPTY on prod — staff saw "0 รายการ" and could not
 * answer customer phone calls about order status.
 *
 * Legacy source: `member/pcs-admin/forwarder.php` (2,661 LOC). Status
 * URL keys match the legacy 10-tab strip (`?status=1..7`, `6.1`, `c`, `p`):
 *   1  รอเข้าโกดังจีน        (fstatus='1')
 *   2  ถึงโกดังจีนแล้ว       (fstatus='2')
 *   3  กำลังส่งมาไทย         (fstatus='3')
 *   4  ถึงไทยแล้ว             (fstatus='4')
 *   5  รอชำระเงิน              (fstatus='5')
 *   6  เตรียมส่ง               (fstatus='6' AND no driver row)
 *   6.1 กำลังจัดส่ง            (fstatus='6' AND driver row exists with fdistatus='')
 *   7  ส่งแล้ว                  (fstatus='7')
 *   c  เครติดสินค้า            (fcredit='1')
 *   p  สถานะพิเศษ              (fstatus='99')
 *
 * Customer name comes from `tb_users` joined on `userid` (legacy text id
 * like `PCS10843`). PostgREST FK auto-join is unreliable across the
 * legacy schema, so we do a 2nd query with `.in("userid", ids)` and
 * merge in TS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ForwardersTable } from "./forwarders-table";
import { ForwardersSearchBar } from "./search-bar";
import { Suspense } from "react";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ. Updated to use the legacy
// `?status=` filter keys (was `?q=` which collided with the keyword
// search box). The 10 status tabs render below; this menubar is just
// quick-jumps + work / barcode / search shortcuts.
// ─────────────────────────────────────────────────────────────────────
const FORWARDER_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/forwarders" },
  {
    label: "ตามประเภท",
    children: [
      { label: "ทั้งหมด",   href: "/admin/forwarders" },
      { label: "เตรียมส่ง", href: "/admin/forwarders?status=6" },
      { label: "เครดิต",   href: "/admin/forwarders?status=c" },
      { label: "พิเศษ",    href: "/admin/forwarders?status=p" },
    ],
  },
  {
    label: "งาน",
    children: [
      { label: "รวมบิลสินค้า",         href: "/admin/forwarders/combine-bill" },
      { label: "ประวัติเข้าโกดังไทย", href: "/admin/forwarders/warehouse-history" },
      { label: "มอบงานคนขับ",         href: "/admin/forwarders/drivers" },
    ],
  },
  {
    label: "บาร์โค้ด",
    children: [
      { label: "ทั้งหมด", href: "/admin/barcode" },
      { label: "driver", href: "/admin/barcode/driver" },
    ],
  },
  {
    label: "ค้นหา",
    children: [
      { label: "รหัสเดียว",    href: "/admin/forwarders?focus=search" },
      { label: "หลายรหัส",     href: "/admin/forwarders/bulk-search" },
    ],
  },
];

// Sidebar `?segment=` chip — label-only (Wave-B P0.5 pattern); no SQL
// filter applied. Keep the keys in sync with the sidebar dropdown.
// TODO: legacy `tb_forwarder` has no cargo-vs-freight or FCL-vs-LCL
// explicit column. Flagging cargo-vs-freight is Phase C (or needs a
// schema extension column on tb_forwarder).
const SEGMENT_LABEL: Record<string, string> = {
  "cargo-fcl":     "Cargo · FCL",
  "cargo-lcl":     "Cargo · LCL",
  "freight-fcl":   "Freight · FCL",
  "freight-lcl":   "Freight · LCL",
  "freight-truck": "Freight · รถ",
  "freight-sea":   "Freight · เรือ",
  "freight-air":   "Freight · แอร์",
};

// Legacy STATUS_LABEL — fStatus values (string in legacy too: char(2))
const STATUS_LABEL: Record<string, string> = {
  "1":   "รอเข้าโกดังจีน",
  "2":   "ถึงโกดังจีนแล้ว",
  "3":   "กำลังส่งมาไทย",
  "4":   "ถึงไทยแล้ว",
  "5":   "รอชำระเงิน",
  "6":   "เตรียมส่ง",
  "6.1": "กำลังจัดส่ง",
  "7":   "ส่งแล้ว",
  "c":   "เครติดสินค้า",
  "p":   "สถานะพิเศษ",
  "99":  "พิเศษ",
};

// Transport mode (ftransporttype char(1): '1'/'2'/'3')
const MODE_LABEL: Record<string, string> = {
  "1": "🚛 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

// Warehouse name (fwarehousename char(1))
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

type SearchParams = {
  status?: string;      // 1..7, 6.1, c, p — legacy 10-tab filter
  q?: string;           // single-line keyword search
  q_multi?: string;     // U2-5: multi-line bulk tracking search
  date_from?: string;
  date_to?: string;
  segment?: string;     // sidebar Cargo/Freight × FCL/LCL — label-only chip
  mode?: string;        // transport mode chip ('1'/'2'/'3')
};

type RawForwarderRow = {
  id: number;
  fdate: string | null;
  fstatus: string;
  ftransporttype: string;
  fwarehousechina: string;
  fwarehousename: string;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fidorco: string | null;
  userid: string;
  fnote: string | null;
  fcover: string | null;
  fweight: number | null;
  fvolume: number | null;
  famount: number | null;
  ftotalprice: number | null;
  fcosttotalprice: number | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddresszipcode: string | null;
  fcredit: string | null;
  fdetail: string | null;
};

type RawUserRow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
};

export type Row = {
  id: number;
  f_no: string;                // fidorco (legacy F-no) or fallback to id
  status: string;              // fstatus
  warehouse_china: string;     // fwarehousechina
  partner_warehouse: string;   // fwarehousename
  transport_type: string;      // ftransporttype
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  created_at: string;          // fdate (ISO)
  fcredit: string;             // '1' = credit order
  note: string | null;
  detail: string | null;
  customer: { userid: string; name: string; phone: string } | null;
};

export default async function AdminForwardersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // W-1 (gap-admin H-1): page-level role gate. Lists every customer's
  // import orders + prices via createAdminClient (RLS-bypass) — ops
  // (runs the orders) + accounting (bills them).
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ─── Main query against tb_forwarder ──────────────────────────────────
  // Note: PostgREST cannot reliably auto-join the legacy `tb_users` table
  // (the FK is by `userid` text not a true relational FK). We pull the
  // forwarder rows here, then fetch matching tb_users rows in a 2nd query.
  let q = admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fstatus,ftransporttype,fwarehousechina,fwarehousename," +
      "fcabinetnumber,ftrackingchn,ftrackingth,fidorco,userid,fnote,fcover," +
      "fweight,fvolume,famount,ftotalprice,fcosttotalprice," +
      "faddressname,faddresslastname,faddresszipcode,fcredit,fdetail",
    )
    .order("fdate", { ascending: false, nullsFirst: false })
    .limit(300);

  // Status filter — legacy keys (1..7, 6.1, c, p).
  // The 6 vs 6.1 split needs the tb_forwarder_driver_item join (skipped
  // here for performance — we treat both as fstatus='6' and let the user
  // see the unified list; if they need the 6.1 split we'll add a join).
  // TODO: ask ภูม — confirm we can defer 6.1 driver-join until Wave 3D.
  if (sp.status === "c") {
    q = q.eq("fcredit", "1");
  } else if (sp.status === "p") {
    q = q.eq("fstatus", "99");
  } else if (sp.status === "6.1") {
    q = q.eq("fstatus", "6");
  } else if (sp.status && /^[1-7]$/.test(sp.status)) {
    q = q.eq("fstatus", sp.status);
  }

  if (sp.mode && MODE_LABEL[sp.mode]) q = q.eq("ftransporttype", sp.mode);

  if (sp.date_from) q = q.gte("fdate", sp.date_from);
  if (sp.date_to)   q = q.lte("fdate", sp.date_to + "T23:59:59");

  const { data: forwarderRows, error: forwarderErr } = await q;
  const raw = (forwarderRows ?? []) as unknown as RawForwarderRow[];

  // ─── 2nd query: tb_users for customer name/phone ──────────────────────
  const uniqueUserIds = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  let usersByUserId = new Map<string, RawUserRow>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows } = await admin
      .from("tb_users")
      .select("userid,username,userlastname,usertel")
      .in("userid", uniqueUserIds);
    usersByUserId = new Map(
      ((userRows ?? []) as unknown as RawUserRow[]).map((u) => [u.userid, u]),
    );
  }

  // Shape into our Row type for the table.
  let rows: Row[] = raw.map((r) => {
    const user = usersByUserId.get(r.userid);
    const name = user
      ? `${user.username ?? ""} ${user.userlastname ?? ""}`.trim()
      : "";
    return {
      id: r.id,
      f_no: r.fidorco ?? String(r.id),
      status: r.fstatus,
      warehouse_china: r.fwarehousechina,
      partner_warehouse: r.fwarehousename,
      transport_type: r.ftransporttype,
      weight_kg: Number(r.fweight ?? 0),
      volume_cbm: Number(r.fvolume ?? 0),
      total_price: Number(r.ftotalprice ?? 0),
      tracking_chn: r.ftrackingchn,
      tracking_th: r.ftrackingth,
      cabinet_number: r.fcabinetnumber,
      created_at: r.fdate ?? "",
      fcredit: r.fcredit ?? "0",
      note: r.fnote,
      detail: r.fdetail,
      customer: user
        ? {
            userid: user.userid,
            name,
            phone: user.usertel ?? "",
          }
        : null,
    };
  });

  // ─── Client-side keyword filter across multiple fields ────────────────
  // q_multi (U2-5): multi-line bulk search — match if ANY line matches ANY field.
  // q       (legacy single): one keyword across all fields.
  if (sp.q_multi) {
    const lines = sp.q_multi
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (lines.length > 0) {
      rows = rows.filter((r) => {
        const fields = [
          r.f_no.toLowerCase(),
          (r.tracking_chn ?? "").toLowerCase(),
          (r.tracking_th  ?? "").toLowerCase(),
          (r.customer?.userid ?? "").toLowerCase(),
          (r.cabinet_number ?? "").toLowerCase(),
        ];
        return lines.some((kw) => fields.some((f) => f.includes(kw)));
      });
    }
  } else if (sp.q) {
    const keyword = sp.q.toLowerCase();
    rows = rows.filter((r) =>
      r.f_no.toLowerCase().includes(keyword) ||
      (r.tracking_chn ?? "").toLowerCase().includes(keyword) ||
      (r.tracking_th  ?? "").toLowerCase().includes(keyword) ||
      (r.customer?.userid ?? "").toLowerCase().includes(keyword) ||
      (r.customer?.phone ?? "").includes(keyword) ||
      (r.customer?.name ?? "").toLowerCase().includes(keyword) ||
      (r.cabinet_number ?? "").toLowerCase().includes(keyword)
    );
  }

  // ─── Per-tab counts (head queries against tb_forwarder) ──────────────
  // We run these in parallel; each returns the global count for that
  // status code (independent of the keyword filter so badges are stable).
  const counts = await loadStatusCounts(admin);

  const filterOpts: { v: string | undefined; l: string; n: number }[] = [
    { v: undefined, l: "ทั้งหมด", n: counts.total },
    { v: "1",   l: STATUS_LABEL["1"]!,   n: counts.s1 },
    { v: "2",   l: STATUS_LABEL["2"]!,   n: counts.s2 },
    { v: "3",   l: STATUS_LABEL["3"]!,   n: counts.s3 },
    { v: "4",   l: STATUS_LABEL["4"]!,   n: counts.s4 },
    { v: "5",   l: STATUS_LABEL["5"]!,   n: counts.s5 },
    { v: "6",   l: STATUS_LABEL["6"]!,   n: counts.s6 },
    { v: "6.1", l: STATUS_LABEL["6.1"]!, n: 0 },  // TODO: needs driver-item join
    { v: "7",   l: STATUS_LABEL["7"]!,   n: counts.s7 },
    { v: "c",   l: STATUS_LABEL["c"]!,   n: counts.credit },
    { v: "p",   l: STATUS_LABEL["p"]!,   n: counts.special },
  ];

  // ภูม brief 2026-05-20 ค่ำ — segment chip (label-only · Wave-B P0.5).
  const segmentLabel = sp.segment && SEGMENT_LABEL[sp.segment] ? SEGMENT_LABEL[sp.segment] : null;

  return (
    <>
      <PageTopMenubar items={FORWARDER_MENUBAR} activeHref="/admin/forwarders" />
      <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">
            ฝากนำเข้า — Ops{segmentLabel ? ` — ${segmentLabel}` : ""}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {rows.length.toLocaleString("th-TH")} รายการ (จากทั้งหมด {counts.total.toLocaleString("th-TH")})
          </p>
          {segmentLabel ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
              <span>กรอง: {segmentLabel}</span>
              <Link
                href="/admin/forwarders"
                className="rounded-full px-1 leading-none hover:bg-primary-100"
                aria-label="ล้างตัวกรองกลุ่ม"
              >
                ×
              </Link>
            </div>
          ) : null}
        </div>
        <Link
          href="/admin/forwarders/bulk-search"
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
        >
          🔍 ค้นหา tracking หลายเลข
        </Link>
      </div>

      {/* Advanced search */}
      <Suspense>
        <ForwardersSearchBar />
      </Suspense>

      {forwarderErr && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {forwarderErr.message}
        </div>
      )}

      {/* Status filter chips — legacy 10 tabs */}
      <div className="flex flex-wrap gap-2">
        {filterOpts.map((o) => {
          const params = new URLSearchParams();
          if (o.v)          params.set("status", o.v);
          if (sp.q)         params.set("q", sp.q);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to)   params.set("date_to", sp.date_to);
          if (sp.mode)      params.set("mode", sp.mode);
          if (sp.segment)   params.set("segment", sp.segment);
          const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
          const active = (sp.status ?? "") === (o.v ?? "");
          return (
            <Link key={o.v ?? "all"} href={href}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}>
              {o.l} {o.n > 0 && <span className="ml-1 opacity-75">({o.n.toLocaleString("th-TH")})</span>}
            </Link>
          );
        })}
      </div>

      {/* Transport-mode chip strip — รถ/เรือ/แอร์ (ftransporttype 1/2/3) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted font-medium">ขนส่ง:</span>
        {([undefined, "1", "2", "3"] as const).map((m) => {
          const params = new URLSearchParams();
          if (m)            params.set("mode", m);
          if (sp.status)    params.set("status", sp.status);
          if (sp.q)         params.set("q", sp.q);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to)   params.set("date_to", sp.date_to);
          if (sp.segment)   params.set("segment", sp.segment);
          const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
          const active = (sp.mode ?? "") === (m ?? "");
          const label = m ? MODE_LABEL[m] : "ทุก mode";
          return (
            <Link key={m ?? "all"} href={href}
              className={`rounded-full border px-3 py-1 whitespace-nowrap ${
                active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <ForwardersTable
        rows={rows}
        statusLabel={STATUS_LABEL}
        modeLabel={MODE_LABEL}
        warehouseLabel={WAREHOUSE_LABEL}
      />
    </main>
    </>
  );
}

/**
 * Per-status counts (parallel head queries · global · independent of
 * keyword/date filters so badge counts stay stable while user types).
 *
 * Legacy did `SELECT COUNT(ID), fStatus FROM tb_forwarder GROUP BY fStatus`
 * in a single query; PostgREST has no GROUP BY in select so we run
 * one head query per status. 9 parallel HEAD queries × ~50ms each.
 */
async function loadStatusCounts(admin: ReturnType<typeof createAdminClient>) {
  async function countFstatus(value: string): Promise<number> {
    const r = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", value);
    return r.count ?? 0;
  }
  async function countCredit(): Promise<number> {
    const r = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fcredit", "1");
    return r.count ?? 0;
  }
  async function countTotal(): Promise<number> {
    const r = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true });
    return r.count ?? 0;
  }

  const [total, s1, s2, s3, s4, s5, s6, s7, credit, special] = await Promise.all([
    countTotal(),
    countFstatus("1"),
    countFstatus("2"),
    countFstatus("3"),
    countFstatus("4"),
    countFstatus("5"),
    countFstatus("6"),
    countFstatus("7"),
    countCredit(),
    countFstatus("99"),
  ]);

  return { total, s1, s2, s3, s4, s5, s6, s7, credit, special };
}
