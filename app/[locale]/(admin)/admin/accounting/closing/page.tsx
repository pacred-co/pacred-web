// Money/audit surface — never statically cache a per-admin, searchParams-driven view (stale financial/audit data).
export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { fetchCorporateNameMap } from "@/lib/admin/customer-identity";
import { ClosingMonthPicker } from "./closing-month-picker";

// P0-21 (2026-05-30 sitting-E) — Pivot the month-end closing report off
// issued tb_receipt rows (the legacy SOT for revenue + tax-invoice cut),
// NOT the rebuilt empty `forwarders` table. The legacy
// `closingAccReportForwarder.php` keyed off delivered-forwarders but in
// practice accounting uses receipt-issued-date (rdate) for revenue
// recognition. The previous Pacred port read `from("forwarders")`
// (empty on prod) so the page rendered blank.
//
// New shape: read tb_receipt WHERE rdate IN range AND rstatus='3' (issued)
// → slice by corporatetype ('1'=ลูกค้าบริษัท / '2'=ลูกค้าทั่วไป per
// 0081 column comment). Customer name + member code + tel come from
// tb_users via IN-batch lookup. Tax ID + company name live ON the
// receipt itself (recompnumber + recompname + recompaddress — the
// "billed to" snapshot at issue time).
//
// §0 design latitude — we removed the weight/volume/tracking-china
// columns (forwarder-specific) and added the receipt # + refid + WHT
// breakdown (totalbeforewithholding) which is what accounting really
// needs at month-end close.

type Tab = "all" | "juristic" | "personal";

type ReceiptRow = {
  id:                     number;
  rid:                    string;
  refid:                  string;
  rdate:                  string | null;
  ramount:                number;
  totalbeforewithholding: number;
  recompnumber:           string | null;
  recompname:             string | null;
  recompaddress:          string | null;
  corporatetype:          string | null;
  userid:                 string;
};

type UserLite = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to:   `${year}-${pad(month)}-${pad(last)}`,
  };
}

// "1" = ลูกค้าบริษัท · "2" = ลูกค้าทั่วไป (per 0081 column comment).
function isJuristicReceipt(r: ReceiptRow): boolean {
  return r.corporatetype === "1";
}

// Personal customer name = "userName userLastName" from tb_users.
// Juristic display name = recompname (the at-issuance snapshot on the receipt,
// which is the authoritative buyer name and MUST win). When the snapshot is
// blank on a juristic receipt, fall back to the live tb_corporate company name
// (never the contact person) so a company never shows a person here.
function customerLabel(
  r: ReceiptRow,
  u: UserLite | null,
  corpName?: string,
): string {
  if (isJuristicReceipt(r)) {
    if (r.recompname) return r.recompname;
    if (corpName) return corpName;
  }
  if (!u) return "—";
  return `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—";
}

export default async function ClosingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string; month?: string; page?: string }>;
}) {
  // W-1 page-level role gate. Month-end revenue + customer tax IDs via
  // createAdminClient (RLS-bypass) — accounting only (super implicit).
  await requireAdmin(["accounting"]);

  const sp     = await searchParams;
  const tab    = (sp.tab === "juristic" || sp.tab === "personal" ? sp.tab : "all") as Tab;
  const now    = new Date();
  const year   = Math.max(2021, Math.min(2099, Number(sp.year ?? now.getFullYear())));
  const month  = Math.max(1, Math.min(12, Number(sp.month ?? now.getMonth() + 1)));
  const range  = monthRange(year, month);

  const admin = createAdminClient();

  // ── Step 1: pull issued receipts for the month ──────────────────
  // rstatus='3' = ออกแล้ว (issued; 0081 default '3'). rdate is the
  // issue timestamp — revenue is recognised on this date for the
  // month-end close. Over-fetch then bucket in app code so the 3
  // tabs share a single round-trip (closings are usually <500
  // rows/month so 2000 cap is safe).
  const { data: receiptData, error: receiptErr } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, ramount, totalbeforewithholding, recompnumber, recompname, recompaddress, corporatetype, userid",
    )
    .eq("rstatus", "3")
    .gte("rdate", range.from)
    .lte("rdate", range.to + "T23:59:59")
    .order("rdate", { ascending: false })
    .limit(2000);
  if (receiptErr) {
    console.error(`[tb_receipt list] failed`, { code: receiptErr.code, message: receiptErr.message });
  }
  const receipts = ((receiptData ?? []) as unknown as ReceiptRow[]);

  // ── Step 2: hydrate customer names via single IN-batch ─────────
  // Unique userids only; tb_users is the legacy SOT for customer
  // identity (post-0113 camelCase: userID + userName + userLastName).
  const uniqUserIds = Array.from(new Set(receipts.map((r) => r.userid).filter(Boolean)));
  const userMap = new Map<string, UserLite>();
  if (uniqUserIds.length > 0) {
    const { data: userData, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", uniqUserIds);
    if (userErr) {
      console.error(`[tb_users IN-batch] failed`, { code: userErr.code, message: userErr.message });
    }
    for (const u of (userData ?? []) as UserLite[]) {
      userMap.set(u.userID, u);
    }
  }

  // Live tb_corporate company-name fallback (batched, N+1-free) — used only
  // when a juristic receipt's recompname snapshot is blank.
  const corpNames = await fetchCorporateNameMap(admin, uniqUserIds);

  // ── Step 3: bucket ──────────────────────────────────────────────
  const juristicRows = receipts.filter(isJuristicReceipt);
  const personalRows = receipts.filter((r) => !isJuristicReceipt(r));

  const visibleRows = tab === "juristic" ? juristicRows
                    : tab === "personal" ? personalRows
                    : receipts;

  const sum = (rs: ReceiptRow[], key: "ramount" | "totalbeforewithholding") =>
    rs.reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const counts = {
    all:      receipts.length,
    juristic: juristicRows.length,
    personal: personalRows.length,
  };
  const totals = {
    all:      sum(receipts,     "ramount"),
    juristic: sum(juristicRows, "ramount"),
    personal: sum(personalRows, "ramount"),
  };
  const totalBeforeWHT = sum(visibleRows, "totalbeforewithholding");
  const whtAmount      = totalBeforeWHT - totals[tab];

  // PERF (2026-06-03): client-slice the DISPLAYED table (50/page). Totals,
  // tab counts + CSV all stay computed over the full `visibleRows` set — we
  // only window the rows we render in the <tbody>.
  const page    = parsePage(sp.page);
  const offset  = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = visibleRows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // CSV rows — finance teams want the tax-id + company name front and
  // center so they can match to their accounting software.
  const csvRows: CsvRow[] = visibleRows.map((r) => {
    const u = userMap.get(r.userid) ?? null;
    return {
      rid:                    r.rid,
      refid:                  r.refid,
      customer:               customerLabel(r, u, corpNames.get(r.userid)),
      member_code:            r.userid,
      account_type:           isJuristicReceipt(r) ? "บริษัท" : "บุคคลทั่วไป",
      tax_id:                 r.recompnumber ?? "",
      company:                r.recompname ?? "",
      phone:                  u?.userTel ?? "",
      total_before_wht:       Number(r.totalbeforewithholding ?? 0),
      total_after_wht:        Number(r.ramount ?? 0),
      wht_amount:             Number(r.totalbeforewithholding ?? 0) - Number(r.ramount ?? 0),
      issue_date:             r.rdate ?? "",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ACCOUNTING · CLOSING
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">ปิดงบรายเดือน (ใบเสร็จ)</h1>
          <p className="text-sm text-muted mt-1">
            สรุปใบเสร็จที่ออกในเดือนที่เลือก — แยกตามลูกค้าบริษัท / ลูกค้าทั่วไป ·
            ตัดยอดด้วยวันที่ออกใบเสร็จ (rdate) ตามมาตรฐานบัญชี
          </p>
        </div>
        <Link
          href="/admin/accounting"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← Accounting hub
        </Link>
      </div>

      <ClosingMonthPicker year={year} month={month} tab={tab} />

      {/* Tabs */}
      <nav className="flex gap-2 border-b border-border">
        {([
          { key: "all",      label: `ทั้งหมด (${counts.all})`,        total: totals.all },
          { key: "juristic", label: `บริษัท (${counts.juristic})`,    total: totals.juristic },
          { key: "personal", label: `บุคคลทั่วไป (${counts.personal})`, total: totals.personal },
        ] as const).map((t) => {
          const params = new URLSearchParams({
            year: String(year),
            month: String(month),
            tab: t.key,
          });
          return (
            <Link
              key={t.key}
              href={`/admin/accounting/closing?${params}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                t.key === tab
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Summary cards — P0-21 added the WHT split for accounting workflow. */}
      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="จำนวนใบเสร็จ" value={String(visibleRows.length)} />
        <Stat label="ยอดรวมรับสุทธิ" value={thb(totals[tab])} />
        <Stat
          label="ยอดก่อนหัก WHT · WHT หัก"
          value={`${thb(totalBeforeWHT)} · ${thb(whtAmount)}`}
          sub
        />
      </section>

      {/* CSV export */}
      <div className="flex justify-end">
        <CsvButton
          rows={csvRows}
          cols={[
            { key: "rid",              label: "เลขใบเสร็จ" },
            { key: "refid",            label: "อ้างอิง" },
            { key: "customer",         label: "ลูกค้า" },
            { key: "member_code",      label: "รหัสสมาชิก" },
            { key: "account_type",     label: "ประเภท" },
            { key: "tax_id",           label: "เลขผู้เสียภาษี" },
            { key: "company",          label: "ชื่อบริษัท" },
            { key: "phone",            label: "เบอร์" },
            { key: "total_before_wht", label: "ยอดก่อน WHT (THB)" },
            { key: "wht_amount",       label: "WHT หัก (THB)" },
            { key: "total_after_wht",  label: "ยอดรับสุทธิ (THB)" },
            { key: "issue_date",       label: "วันที่ออกใบเสร็จ" },
          ]}
          filename={`pacred-closing-receipts-${year}-${String(month).padStart(2, "0")}-${tab}.csv`}
        />
      </div>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[11px] sm:text-[11px] text-muted">
            <tr>
              <th className="px-3 py-2.5">เลขใบเสร็จ</th>
              <th className="px-3 py-2.5">อ้างอิง</th>
              <th className="px-3 py-2.5">ลูกค้า</th>
              <th className="px-3 py-2.5">รหัส</th>
              <th className="px-3 py-2.5">เลขผู้เสียภาษี</th>
              <th className="px-3 py-2.5 text-right">ยอดก่อน WHT</th>
              <th className="px-3 py-2.5 text-right">WHT หัก</th>
              <th className="px-3 py-2.5 text-right">รับสุทธิ</th>
              <th className="px-3 py-2.5">วันที่</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted">
                  ไม่มีใบเสร็จในช่วงที่เลือก
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const u   = userMap.get(r.userid) ?? null;
                const wht = Number(r.totalbeforewithholding ?? 0) - Number(r.ramount ?? 0);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2.5 font-mono text-primary-600">{r.rid}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">{r.refid}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">
                        {customerLabel(r, u, corpNames.get(r.userid))}
                      </div>
                      {isJuristicReceipt(r) && (
                        <div className="text-[11px] text-muted">บริษัท</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs"><CustomerCodeLink code={r.userid} className="text-xs" /></td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.recompnumber || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {thb(Number(r.totalbeforewithholding ?? 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted">
                      {wht > 0 ? thb(wht) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-primary-700">
                      {thb(Number(r.ramount ?? 0))}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">
                      {r.rdate ? new Date(r.rdate).toLocaleDateString("th-TH") : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-primary-50/40 font-bold text-sm">
                <td colSpan={5} className="px-3 py-2.5 text-right">รวม</td>
                <td className="px-3 py-2.5 text-right font-mono">{thb(totalBeforeWHT)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{thb(whtAmount)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-primary-700">
                  {thb(totals[tab])}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={visibleRows.length}
        basePath="/admin/accounting/closing"
        params={{ tab, year: String(year), month: String(month) }}
      />
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono text-foreground ${sub ? "text-sm" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}
