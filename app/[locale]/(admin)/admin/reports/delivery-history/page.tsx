/**
 * /admin/reports/delivery-history — ประวัติการส่งสินค้า (delivery history).
 *
 * Port of legacy PCS Cargo `history.php` (the per-customer delivery-history
 * report). Pacred was MISSING this report entirely (owner ภูม, 2026-06-19).
 *
 * Definition — "delivery history" = forwarder (ฝากนำเข้า) shipments that have
 * reached the dispatch/delivered end of the pipeline. The `tb_forwarder.fstatus`
 * pipeline (canonical map in lib/legacy-status-map.ts):
 *   1 รอสินค้าเข้าโกดังจีน · 2 สินค้าถึงโกดังจีน · 3 กำลังส่งมาไทย ·
 *   4 ถึงไทยแล้ว · 5 รอชำระเงิน · 6 เตรียมส่ง · 7 ส่งแล้ว
 *
 * DEFAULT filter: fstatus IN ('6','7') (เตรียมส่ง + ส่งแล้ว) — the delivered/
 * dispatched tail. A status <select> lets staff widen to a specific status or
 * to "ส่งถึงขั้นรอชำระขึ้นไป" (≥5 — 5/6/7). DEFAULT date range = last 30 days,
 * matched against the most-relevant delivery stamp:
 *   - ส่งแล้ว (7)   → fdatestatus7 (วันที่ส่งจริง)
 *   - เตรียมส่ง (6) → fdatestatus6
 *   - else          → fdate (วันที่สร้างออเดอร์) as a fallback anchor
 * We filter on `fdate` (always present) for the range query, then surface the
 * most-recent delivery stamp per row in the table (no missing-stamp surprises).
 *
 * Amount = the composite outstanding via calcForwarderOutstanding
 * (lib/forwarder/outstanding.ts) — the same grand-total operators chase on the
 * forwarder list, not the partial ftotalprice column.
 *
 * READ-ONLY: no writes, no mutation, no server action. CSV export of the
 * current view via the shared formula-injection-safe <CsvButton>.
 *
 * Access: super · ultra · accounting · ops · warehouse — matches the cargo
 * reports (containers-awaiting-th gate) so warehouse/dispatch staff can pull
 * a delivery history.
 *
 * §0c compliance: every Supabase query destructures { data, error } +
 * console.error on failure; no silent notFound.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";

export const dynamic = "force-dynamic";

type SP = {
  fstatus?: string;
  date_from?: string;
  date_to?: string;
};

// One forwarder row — the delivery-history-relevant subset of tb_forwarder.
// Includes the price columns calcForwarderOutstanding needs.
type ForwarderRow = {
  id: number;
  userid: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fcabinetnumber: string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  fstatus: string | null;
  fdate: string | null;
  fdatestatus6: string | null;
  fdatestatus7: string | null;
  // price fields (calcForwarderOutstanding)
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  fusercompany: number | string | null;
};

type LegacyUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

// The selectable status-filter options (label + the fstatus codes each covers).
const STATUS_OPTIONS: { value: string; label: string; codes: string[] }[] = [
  { value: "delivered", label: "ส่งแล้ว + เตรียมส่ง (default)", codes: ["6", "7"] },
  { value: "7", label: "ส่งแล้ว", codes: ["7"] },
  { value: "6", label: "เตรียมส่ง", codes: ["6"] },
  { value: "ge5", label: "รอชำระขึ้นไป (รอชำระ/เตรียมส่ง/ส่งแล้ว)", codes: ["5", "6", "7"] },
  { value: "5", label: "รอชำระเงิน", codes: ["5"] },
  { value: "all", label: "ทั้งหมด", codes: ["1", "2", "3", "4", "5", "6", "7"] },
];

function resolveStatusCodes(raw: string | undefined): { value: string; codes: string[] } {
  const found = STATUS_OPTIONS.find((o) => o.value === raw);
  // default → delivered (6,7)
  return found ?? STATUS_OPTIONS[0];
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return isoDate(d);
}

function todayIso(): string {
  return isoDate(new Date());
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The relevant "delivery" date for a row — fdatestatus7 if ส่งแล้ว, else
 *  fdatestatus6 if เตรียมส่ง, else fall back to fdate. */
function deliveryStamp(r: ForwarderRow): string | null {
  if (r.fstatus === "7" && r.fdatestatus7) return r.fdatestatus7;
  if (r.fstatus === "6" && r.fdatestatus6) return r.fdatestatus6;
  return r.fdatestatus7 ?? r.fdatestatus6 ?? r.fdate ?? null;
}

function userDisplayName(u: LegacyUser | null | undefined): string {
  if (!u) return "";
  return [u.userName, u.userLastName].filter(Boolean).join(" ");
}

function recipientName(r: ForwarderRow): string {
  return [r.faddressname, r.faddresslastname].filter(Boolean).join(" ").trim();
}

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, string> = {
  "5": "bg-red-50 text-red-700 border-red-200",
  "6": "bg-blue-50 text-blue-700 border-blue-200",
  "7": "bg-green-50 text-green-700 border-green-200",
  "4": "bg-purple-50 text-purple-700 border-purple-200",
  "3": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "2": "bg-amber-50 text-amber-700 border-amber-200",
  "1": "bg-gray-50 text-gray-600 border-gray-200",
};

export default async function AdminDeliveryHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Cargo-report gate — matches /admin/reports/containers-awaiting-th plus
  // 'ultra' (the god role from mig 0193).
  await requireAdmin(["super", "ultra", "accounting", "ops", "warehouse"]);

  const sp = await searchParams;
  const { value: statusValue, codes: statusCodes } = resolveStatusCodes(sp.fstatus);
  const dateFrom = sp.date_from ?? thirtyDaysAgo();
  const dateTo = sp.date_to ?? todayIso();
  // Whether the range came from the URL (true) or the 30-day default (false).
  const usingDefaultRange = !sp.date_from && !sp.date_to;

  const admin = createAdminClient();

  // ── 1) forwarder delivery rows (filtered) ──
  //   Filter on fdate (always present) for the date window; restrict to the
  //   chosen fstatus codes; newest first; cap 500.
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, ftrackingchn, ftrackingth, fcabinetnumber, " +
        "faddressname, faddresslastname, fstatus, fdate, fdatestatus6, fdatestatus7, " +
        "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, " +
        "ftransportpricechnthb, priceother, fdiscount, fusercompany",
    )
    .in("fstatus", statusCodes)
    .gte("fdate", `${dateFrom}T00:00:00`)
    .lte("fdate", `${dateTo}T23:59:59`)
    .order("fdate", { ascending: false, nullsFirst: false })
    .limit(500);
  if (fwdErr) {
    console.error("[admin delivery-history list] failed", {
      code: fwdErr.code,
      message: fwdErr.message,
      statusCodes,
      dateFrom,
      dateTo,
    });
  }
  const rows = (fwdRaw ?? []) as unknown as ForwarderRow[];

  // ── 2) batch-join tb_users for customer name + phone ──
  const userIds = Array.from(
    new Set(rows.map((r) => r.userid).filter((v): v is string => !!v)),
  );
  const usersById = new Map<string, LegacyUser>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error("[admin delivery-history users join] failed", {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as LegacyUser[]) {
      usersById.set(u.userID, u);
    }
  }

  // ── 3) compute amounts + stats ──
  const amountById = new Map<number, number>();
  for (const r of rows) {
    amountById.set(r.id, calcForwarderOutstanding(r));
  }
  const totalCount = rows.length;
  const deliveredCount = rows.filter((r) => r.fstatus === "7").length;
  const preparingCount = rows.filter((r) => r.fstatus === "6").length;
  const totalAmount = rows.reduce((s, r) => s + (amountById.get(r.id) ?? 0), 0);

  // ── 4) CSV rows (current view) ──
  const csvRows: CsvRow[] = rows.map((r) => {
    const u = r.userid ? usersById.get(r.userid) : undefined;
    return {
      id: r.id,
      delivery_date: fmtDate(deliveryStamp(r)),
      userid: r.userid ?? "",
      customer_name: userDisplayName(u),
      phone: u?.userTel ?? "",
      recipient: recipientName(r),
      cabinet: r.fcabinetnumber ?? "",
      tracking_chn: r.ftrackingchn ?? "",
      tracking_th: r.ftrackingth ?? "",
      status: legacyForwarderStatusThai(r.fstatus),
      amount: (amountById.get(r.id) ?? 0).toFixed(2),
      created_at: fmtDate(r.fdate),
    };
  });
  const csvCols = [
    { key: "id", label: "Forwarder #" },
    { key: "delivery_date", label: "วันที่ส่ง" },
    { key: "userid", label: "รหัสลูกค้า" },
    { key: "customer_name", label: "ชื่อลูกค้า" },
    { key: "phone", label: "เบอร์" },
    { key: "recipient", label: "ผู้รับ" },
    { key: "cabinet", label: "เลขตู้" },
    { key: "tracking_chn", label: "Tracking CN" },
    { key: "tracking_th", label: "Tracking TH" },
    { key: "status", label: "สถานะ" },
    { key: "amount", label: "ยอดรวม (บาท)" },
    { key: "created_at", label: "วันที่สร้าง" },
  ];

  const statusFilterBase = "/admin/reports/delivery-history";

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · REPORT</p>
          <h1 className="mt-1 text-2xl font-bold">📦 ประวัติการส่งสินค้า</h1>
          <p className="text-sm text-muted mt-0.5">
            รายการฝากนำเข้าที่ถึงปลายทาง (เตรียมส่ง / ส่งแล้ว) — port ของ legacy history.php
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt"
          >
            ← กลับหน้ารายงาน
          </Link>
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`delivery-history-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        </div>
      </header>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="รายการทั้งหมด" value={totalCount.toLocaleString("th-TH")} />
        <StatCard label="ส่งแล้ว" value={deliveredCount.toLocaleString("th-TH")} tone="green" />
        <StatCard label="เตรียมส่ง" value={preparingCount.toLocaleString("th-TH")} tone="blue" />
        <StatCard label="ยอดรวม" value={thb(totalAmount)} tone="green" />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">สถานะ:</span>
        {STATUS_OPTIONS.map((o) => {
          const params = new URLSearchParams();
          params.set("fstatus", o.value);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to) params.set("date_to", sp.date_to);
          const active = statusValue === o.value;
          return (
            <Link
              key={o.value}
              href={`${statusFilterBase}?${params.toString()}`}
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium hover:shadow-sm ${
                active
                  ? "border-primary-400 bg-primary-50 text-primary-700"
                  : "border-border bg-white text-foreground hover:bg-surface-alt"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>

      {/* Date filter — tab key carries the status filter through date changes */}
      <Suspense>
        <AdminDateFilter tab={statusValue} dateFrom={sp.date_from} dateTo={sp.date_to} />
      </Suspense>

      {/* Active filter banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        กรองอยู่: สถานะ {resolveStatusCodes(sp.fstatus).codes.map((c) => legacyForwarderStatusThai(c)).join(" / ")} ·
        ช่วงวันที่{" "}
        {new Date(dateFrom).toLocaleDateString("th-TH")} — {new Date(dateTo).toLocaleDateString("th-TH")}
        {usingDefaultRange && <> (ค่าเริ่มต้น: 30 วันล่าสุด)</>}
      </div>

      {/* Table */}
      <section className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface scrollbar-x-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-alt/60 text-left">
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">วันที่ส่ง</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Forwarder</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">ลูกค้า / ผู้รับ</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">เลขตู้</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Tracking</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">สถานะ</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">ยอดรวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted">
                  ไม่พบประวัติการส่งในเงื่อนไขนี้
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const u = r.userid ? usersById.get(r.userid) : undefined;
              const recipient = recipientName(r);
              const name = userDisplayName(u);
              return (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-surface-alt/40 align-top"
                >
                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    {fmtDate(deliveryStamp(r))}
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    <Link
                      href={`/admin/forwarders/${r.id}`}
                      className="text-primary-600 font-mono hover:underline"
                    >
                      #{r.id}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {r.userid && <div className="font-mono">{r.userid}</div>}
                    {name && <div>{name}</div>}
                    {recipient && recipient !== name && (
                      <div className="text-muted">ผู้รับ: {recipient}</div>
                    )}
                    {u?.userTel && <div className="text-muted">{u.userTel}</div>}
                    {!r.userid && !name && !recipient && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap font-mono">
                    {r.fcabinetnumber || <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {r.ftrackingth && <div>TH: {r.ftrackingth}</div>}
                    {r.ftrackingchn && <div className="text-muted">CN: {r.ftrackingchn}</div>}
                    {!r.ftrackingth && !r.ftrackingchn && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_BADGE[r.fstatus ?? ""] ?? "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {legacyForwarderStatusThai(r.fstatus)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs whitespace-nowrap">
                    {thb(amountById.get(r.id) ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-muted">
        แสดงสูงสุด 500 รายการ · ใช้ filter (สถานะ / ช่วงวันที่) เพื่อแคบลง · ยอดรวม = ยอดค้างชำระรวม
        (calcForwarderOutstanding) · รายงานนี้อ่านอย่างเดียว
      </p>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "blue" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50/60 text-blue-900"
        : tone === "red"
          ? "border-red-200 bg-red-50/60 text-red-900"
          : "border-border bg-white dark:bg-surface text-foreground";
  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <p className="text-2xl font-bold tabular-nums font-mono">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}
