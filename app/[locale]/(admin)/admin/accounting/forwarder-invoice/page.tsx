/**
 * Admin > "ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า" — LIST page
 *
 * Agent F3 · E2E LOOP FIX batch (2026-05-29) — REPLACES the prior 1:1
 * faithful shell (which had no DataTable, no add/detail wired) with a
 * real Tailwind admin list reading tb_receipt JOIN tb_users.
 *
 * Legacy reference: `pcs-admin/include/pages/hs-forwarder-invoice/home.php`
 * (the default view is a header shell; the actual per-customer invoice list
 * is reached behind "ดูรายละเอียด" workflows that don't have a single PHP
 * source — Pacred surfaces it here as the canonical list).
 *
 * Per AGENTS.md §0a — workflow logic from legacy · Pacred Tailwind polish:
 *   - Status filter chips (pending / paid / cancelled — rstatus 3/1/2)
 *   - Sortable columns (date · rid · customer · amount)
 *   - Summary band (count + sum per status)
 *   - Row tint per status (amber=pending · emerald=paid · red=cancelled)
 *   - Search by customer userid or rid
 *   - Date range filter
 *
 * Reads:
 *   - tb_receipt (filtered by rstatus + date)
 *   - tb_users (joined by userid for customer display name)
 *   - tb_receipt_item (count per receipt — "N items")
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────
// Status palette — rstatus mapping
// ────────────────────────────────────────────────────────────

type RStatus = "1" | "2" | "3";

const RSTATUS_CFG: Record<
  RStatus,
  { label: string; chip: string; rowBg: string; key: "paid" | "cancelled" | "pending" }
> = {
  "1": {
    label:  "จ่ายแล้ว",
    chip:   "bg-emerald-500 text-emerald-50 border border-emerald-700",
    rowBg:  "bg-emerald-50",
    key:    "paid",
  },
  "2": {
    label:  "ยกเลิก",
    chip:   "bg-red-500 text-red-50 border border-red-700",
    rowBg:  "bg-red-50",
    key:    "cancelled",
  },
  "3": {
    label:  "รอชำระเงิน",
    chip:   "bg-amber-400 text-amber-950 border border-amber-600",
    rowBg:  "bg-amber-50",
    key:    "pending",
  },
};

function rstatusCfg(rstatus: string) {
  return RSTATUS_CFG[rstatus as RStatus] ?? {
    label: rstatus,
    chip:  "bg-gray-300 text-gray-900",
    rowBg: "",
    key:   "pending" as const,
  };
}

// ────────────────────────────────────────────────────────────
// SearchParams
// ────────────────────────────────────────────────────────────

type SearchParams = {
  status?: string;   // 'pending' | 'paid' | 'cancelled' | undefined (= all)
  q?: string;        // search by rid or userid
  date_from?: string;
  date_to?: string;
  sort?: string;     // 'date' | 'rid' | 'userid' | 'amount' — default 'date'
  dir?: string;      // 'asc' | 'desc' — default 'desc'
};

const STATUS_PARAM_TO_RSTATUS: Record<string, RStatus> = {
  pending:   "3",
  paid:      "1",
  cancelled: "2",
};

// ────────────────────────────────────────────────────────────
// Row types
// ────────────────────────────────────────────────────────────

type RawReceipt = {
  id: number;
  rid: string;
  refid: string | null;
  rdate: string | null;
  rdatecreate: string | null;
  issuedate: string | null;
  ramount: number | string | null;
  totalbeforewithholding: number | string | null;
  rstatus: string;
  userid: string;
  adminid: string | null;
  statusprint: string | null;
  corporatetype: string | null;
  recompname: string | null;
};

type RawUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
};

type DisplayRow = {
  id: number;
  rid: string;
  refid: string | null;
  date: string | null;
  rstatus: string;
  userid: string;
  customerName: string;
  amount: number;
  isCorporate: boolean;
  itemCount: number;
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function customerDisplay(u: RawUser | undefined, userid: string, recompname: string | null): string {
  if (recompname && recompname.trim()) return recompname.trim();
  if (!u) return userid;
  const name = [u.userName, u.userLastName].filter(Boolean).join(" ").trim();
  return name || userid;
}

function buildQuery(current: SearchParams, patch: Partial<SearchParams>): string {
  const merged = { ...current, ...patch };
  const parts: string[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

type SortKey = "date" | "rid" | "userid" | "amount";

// Hoisted to top-level — React 19 react-compiler rule forbids nested
// component definitions inside the page render. Closure-free.
function SortLink({
  target,
  label,
  sortKey,
  sortDir,
  sp,
}: {
  target: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  sp: SearchParams;
}) {
  const nextDir = sortKey === target && sortDir === "desc" ? "asc" : "desc";
  const arrow = sortKey === target ? (sortDir === "desc" ? "↓" : "↑") : "";
  return (
    <Link
      href={`/admin/accounting/forwarder-invoice${buildQuery(sp, { sort: target, dir: nextDir })}`}
      className="inline-flex items-center gap-1 hover:text-indigo-700"
    >
      {label} <span className="text-xs">{arrow}</span>
    </Link>
  );
}

// ────────────────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────────────────

export default async function AccountingForwarderInvoiceListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;

  const admin = createAdminClient();

  // ── Sort + status filter ─────────────────────────────────
  const sortKey: SortKey =
    sp.sort === "rid" || sp.sort === "userid" || sp.sort === "amount" ? sp.sort : "date";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const sortColumn: Record<SortKey, string> = {
    date:   "rdate",
    rid:    "rid",
    userid: "userid",
    amount: "totalbeforewithholding",
  };

  // ── Build query ──────────────────────────────────────────
  let query = admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, issuedate, ramount, totalbeforewithholding, " +
        "rstatus, userid, adminid, statusprint, corporatetype, recompname",
    )
    .order(sortColumn[sortKey], { ascending: sortDir === "asc", nullsFirst: false })
    .limit(500);

  const rstatusFilter = sp.status ? STATUS_PARAM_TO_RSTATUS[sp.status] : undefined;
  if (rstatusFilter) {
    query = query.eq("rstatus", rstatusFilter);
  }
  if (sp.date_from) {
    query = query.gte("rdate", sp.date_from);
  }
  if (sp.date_to) {
    // inclusive end of day
    query = query.lte("rdate", `${sp.date_to}T23:59:59`);
  }
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    query = query.or(`rid.ilike.%${q}%,userid.ilike.%${q}%`);
  }

  const { data: receiptRows, error: receiptErr } = await query;
  if (receiptErr) {
    console.error(`[tb_receipt list] failed`, { code: receiptErr.code, message: receiptErr.message });
    throw new Error(`Failed to load invoices: ${receiptErr.message}`);
  }
  const receipts = (receiptRows ?? []) as unknown as RawReceipt[];

  // ── Load tb_users for customer display names ─────────────
  const uniqueUserIds = Array.from(new Set(receipts.map((r) => r.userid).filter(Boolean)));
  let usersById = new Map<string, RawUser>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", uniqueUserIds);
    if (userErr) {
      console.error(`[tb_users list] failed`, { code: userErr.code, message: userErr.message });
    }
    usersById = new Map<string, RawUser>(
      ((userRows ?? []) as unknown as RawUser[]).map((u) => [u.userID, u]),
    );
  }

  // ── Item counts (one query, group in TS) ─────────────────
  const rids = receipts.map((r) => r.rid).filter(Boolean);
  const itemCountByRid = new Map<string, number>();
  if (rids.length > 0) {
    const { data: items, error: itemsErr } = await admin
      .from("tb_receipt_item")
      .select("rid")
      .in("rid", rids);
    if (itemsErr) {
      console.error(`[tb_receipt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
    }
    for (const it of (items ?? []) as unknown as Array<{ rid: string }>) {
      itemCountByRid.set(it.rid, (itemCountByRid.get(it.rid) ?? 0) + 1);
    }
  }

  // ── Materialise display rows ─────────────────────────────
  const rows: DisplayRow[] = receipts.map((r) => {
    const u = usersById.get(r.userid);
    return {
      id:           r.id,
      rid:          r.rid,
      refid:        r.refid,
      date:         r.rdate ?? r.rdatecreate ?? r.issuedate,
      rstatus:      r.rstatus,
      userid:       r.userid,
      customerName: customerDisplay(u, r.userid, r.recompname),
      amount:       toNumber(r.totalbeforewithholding) || toNumber(r.ramount),
      isCorporate:  r.corporatetype === "1",
      itemCount:    itemCountByRid.get(r.rid) ?? 0,
    };
  });

  // ── Summary band ─────────────────────────────────────────
  const summary = {
    total:     rows.length,
    pending:   { count: 0, amount: 0 },
    paid:      { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0 },
    grand:     0,
  };
  for (const r of rows) {
    const key = rstatusCfg(r.rstatus).key;
    summary[key].count++;
    summary[key].amount += r.amount;
    summary.grand += r.amount;
  }

  // ── Helpers for sort link (hoisted via SortLink component below) ─

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Breadcrumb + title */}
        <nav className="text-sm text-slate-500 mb-3">
          <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
          <span className="mx-1">/</span>
          <span className="text-slate-700">ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-semibold text-slate-900">
            ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า
          </h1>
          <Link
            href="/admin/accounting/forwarder-invoice/add"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
          >
            <Plus className="size-4" />
            ออกใบแจ้งหนี้ใหม่
          </Link>
        </div>

        {/* Summary band */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">ทั้งหมด</div>
            <div className="text-2xl font-semibold text-slate-900">{summary.total.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">รวม ฿{fmtBaht(summary.grand)}</div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <div className="text-xs text-amber-900">รอชำระเงิน</div>
            <div className="text-2xl font-semibold text-amber-950">{summary.pending.count}</div>
            <div className="text-xs text-amber-900 mt-1">฿{fmtBaht(summary.pending.amount)}</div>
          </div>
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <div className="text-xs text-emerald-900">จ่ายแล้ว</div>
            <div className="text-2xl font-semibold text-emerald-950">{summary.paid.count}</div>
            <div className="text-xs text-emerald-900 mt-1">฿{fmtBaht(summary.paid.amount)}</div>
          </div>
          <div className="rounded-lg border border-red-300 bg-red-50 p-3">
            <div className="text-xs text-red-900">ยกเลิก</div>
            <div className="text-2xl font-semibold text-red-950">{summary.cancelled.count}</div>
            <div className="text-xs text-red-900 mt-1">฿{fmtBaht(summary.cancelled.amount)}</div>
          </div>
        </div>

        {/* Status filter chips + search + dates */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 mb-4">
          <form method="GET" action="/admin/accounting/forwarder-invoice" className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-slate-600 mr-1">สถานะ:</span>
              <Link
                href={`/admin/accounting/forwarder-invoice${buildQuery(sp, { status: undefined })}`}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  !sp.status
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                ทั้งหมด
              </Link>
              <Link
                href={`/admin/accounting/forwarder-invoice${buildQuery(sp, { status: "pending" })}`}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  sp.status === "pending"
                    ? "bg-amber-500 text-white border-amber-700"
                    : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
                }`}
              >
                รอชำระเงิน
              </Link>
              <Link
                href={`/admin/accounting/forwarder-invoice${buildQuery(sp, { status: "paid" })}`}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  sp.status === "paid"
                    ? "bg-emerald-600 text-white border-emerald-800"
                    : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                จ่ายแล้ว
              </Link>
              <Link
                href={`/admin/accounting/forwarder-invoice${buildQuery(sp, { status: "cancelled" })}`}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  sp.status === "cancelled"
                    ? "bg-red-600 text-white border-red-800"
                    : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                }`}
              >
                ยกเลิก
              </Link>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {/* keep status param across submit */}
              {sp.status && <input type="hidden" name="status" value={sp.status} />}
              {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
              {sp.dir && <input type="hidden" name="dir" value={sp.dir} />}

              <label className="flex flex-col text-xs text-slate-600">
                <span>ค้นหา (rid / userid)</span>
                <input
                  type="text"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder="PR260529-1 หรือ PR10899"
                  className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm w-56"
                />
              </label>
              <label className="flex flex-col text-xs text-slate-600">
                <span>ตั้งแต่</span>
                <input
                  type="date"
                  name="date_from"
                  defaultValue={sp.date_from ?? ""}
                  className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-slate-600">
                <span>ถึง</span>
                <input
                  type="date"
                  name="date_to"
                  defaultValue={sp.date_to ?? ""}
                  className="mt-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
                />
              </label>
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-800"
              >
                ค้นหา
              </button>
              {(sp.q || sp.date_from || sp.date_to) && (
                <Link
                  href={`/admin/accounting/forwarder-invoice${buildQuery({}, { status: sp.status })}`}
                  className="px-3 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-50 text-slate-600"
                >
                  ล้าง
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  <SortLink target="date" label="วันที่ออก" sortKey={sortKey} sortDir={sortDir} sp={sp} />
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <SortLink target="rid" label="เลขใบแจ้งหนี้" sortKey={sortKey} sortDir={sortDir} sp={sp} />
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <SortLink target="userid" label="ลูกค้า" sortKey={sortKey} sortDir={sortDir} sp={sp} />
                </th>
                <th className="px-3 py-2 text-center font-medium">รายการ</th>
                <th className="px-3 py-2 text-right font-medium">
                  <SortLink target="amount" label="ยอด (บาท)" sortKey={sortKey} sortDir={sortDir} sp={sp} />
                </th>
                <th className="px-3 py-2 text-center font-medium">สถานะ</th>
                <th className="px-3 py-2 text-center font-medium">พิมพ์แล้ว</th>
                <th className="px-3 py-2 text-center font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                    ไม่พบใบแจ้งหนี้ในเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const cfg = rstatusCfg(r.rstatus);
                  return (
                    <tr key={r.id} className={`${cfg.rowBg} border-t border-slate-100 hover:bg-slate-50/80`}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/admin/accounting/forwarder-invoice/${r.id}`}
                          className="text-indigo-700 hover:underline font-medium"
                        >
                          {r.rid}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{r.customerName}</div>
                        <div className="text-xs text-slate-500">
                          {r.userid}{r.isCorporate ? " · นิติบุคคล" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">{r.itemCount}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        ฿{fmtBaht(r.amount)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.chip}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-xs">
                        {r.refid && r.refid.trim() ? (
                          <span className="text-slate-500" title={r.refid}>มีหมายเหตุ</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link
                          href={`/admin/accounting/forwarder-invoice/${r.id}`}
                          className="text-sm text-indigo-700 hover:underline"
                        >
                          ดู
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {rows.length === 500 && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            แสดงผล 500 แถวแรกเท่านั้น — กรุณาใช้ตัวกรองวันที่หรือสถานะเพื่อจำกัดผลลัพธ์
          </div>
        )}
      </div>
    </div>
  );
}
