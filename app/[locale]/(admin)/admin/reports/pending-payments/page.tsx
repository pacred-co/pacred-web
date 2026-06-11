/**
 * /admin/reports/pending-payments — รอตรวจสลิปชำระเงิน (Wave 20 P0-4 swap)
 *
 * **Wave 20 P0-4 (2026-05-26):** previously this page read the rebuilt
 * `forwarders` table filtered to `status='pending_payment'` — EMPTY on
 * prod. The page is now the **wallet-topup pending-approval queue**
 * (mirrors legacy `pcs-admin/wallet.php` deposit list — see Wave 7.2
 * `/admin/wallet?view=tx&kind=topup&status=1` and audit doc
 * `docs/audit/admin-pages-audit-2026-05-25-night.md` P0-4 row).
 *
 * **Legacy semantics:** `tb_wallet_hs` pending topup queue =
 *   type IN ('1','2') AND status='1'
 *   • type='1' → ลูกค้าเติมเอง (user-initiated)
 *   • type='2' → admin manual topup (manual-entry)
 *   • status='1' → รอตรวจ (pending admin approval)
 * Same filter as the wallet-page balance card "เติม XXX" link.
 *
 * **Customer join:** 2-pass `tb_users.in("userid", [...])` — same pattern
 * as `/admin/wallet/transactions-view.tsx` Wave 7.2.
 *
 * **Wave 24 #189 (2026-05-27 ค่ำ):** drop the silent `.limit(1000)` PostgREST
 * cap → swap for `?offset=`-based pagination (200 rows per page) + a separate
 * `count: "exact", head: true` query for the grand total. Footer renders
 * Prev/Next + "หน้า X จาก Y · แสดง M-N จาก T". Same pattern Agent B used on
 * `/admin/reports/forwarder` (commit `399ed01`) and `/admin/reports/payment`
 * (#185 · `22dd746`).
 *
 * §0c compliance: every Supabase query destructures { data, error }, logs
 * + throws on the load-bearing reads so a transient PgBouncer timeout
 * surfaces a real error instead of silently rendering "ไม่มีรายการ".
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { parsePage } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

export const dynamic = "force-dynamic";

// ── Pagination constants (Wave 24 #189) ──────────────────────────────────
const PAGE_SIZE = 200;

// SLA labels — sidebar may route in with ?sla= for "เกิน X วัน" buckets.
// Underlying query stays the same; surfaces as chip + banner.
const SLA_CFG: Record<string, string> = {
  "topup-1d":     "รอตรวจสลิปชำระเงินเกิน 1 วัน",
  "topup-2d":     "รอตรวจสลิปชำระเงินเกิน 2 วัน",
};

// type → kind label (matches /admin/wallet/transactions-view.tsx)
const TYPE_LABEL: Record<string, string> = {
  "1": "ชำระเงิน (ลูกค้า)",
  "2": "เติม (manual)",
};
const TYPE_CLS: Record<string, string> = {
  "1": "bg-green-50 text-green-700 border-green-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

type RawWalletHs = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number | null;
  status: string | null;
  type: string | null;
  imagesslip: string | null;
  depositnamebank: string | null;
  note: string | null;
  userid: string | null;
};

type RawUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

type Row = RawWalletHs & {
  customer: {
    userid: string;
    name: string;
    phone: string;
  } | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function daysAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function PendingPaymentsReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; sla?: string; page?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;
  const admin = createAdminClient();

  // Pagination (2026-06-03 · unified with the shared <Pagination> · ?page=N).
  // `offset` is derived from page so the rest of the page (range, rangeFrom/To,
  // CSV) is unchanged — only the URL param + footer UI move to the shared form.
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  // 1) Pending topup queue: tb_wallet_hs WHERE type IN ('1','2') AND status='1'
  //    Wave 24 #189: dropped the silent `.limit(1000)` cap → `.range()` +
  //    a separate `count: "exact", head: true` query for the grand total.
  let q = admin
    .from("tb_wallet_hs")
    .select(
      "id,date,dateslip,amount,status,type,imagesslip,depositnamebank,note,userid",
    )
    .in("type", ["1", "2"])
    .eq("status", "1")
    .order("date", { ascending: true, nullsFirst: false })   // oldest first = most overdue at top
    .range(offset, offset + PAGE_SIZE - 1);
  if (sp.date_from) q = q.gte("date", sp.date_from);
  if (sp.date_to)   q = q.lte("date", sp.date_to + "T23:59:59");

  // 2) Exact-count head query (mirrors the same filter set so the footer
  //    total reflects the same window the table renders).
  let totalQ = admin
    .from("tb_wallet_hs")
    .select("id", { count: "exact", head: true })
    .in("type", ["1", "2"])
    .eq("status", "1");
  if (sp.date_from) totalQ = totalQ.gte("date", sp.date_from);
  if (sp.date_to)   totalQ = totalQ.lte("date", sp.date_to + "T23:59:59");

  const [
    { data: rowsRaw, error },
    { count: grandTotal, error: countErr },
  ] = await Promise.all([q, totalQ]);

  if (error) {
    console.error(`[tb_wallet_hs pending list] failed`, {
      code: error.code, message: error.message, details: error.details,
    });
    throw new Error(`Failed to load tb_wallet_hs (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (countErr) {
    // Count is a UX nicety, not load-bearing — log + fall through.
    console.error(`[tb_wallet_hs pending count] failed`, {
      code: countErr.code, message: countErr.message,
    });
  }
  const raw = (rowsRaw ?? []) as unknown as RawWalletHs[];
  const totalRows = grandTotal ?? raw.length;

  // 2) Slip-image URL resolver (parallel · same as wallet transactions view).
  const slipUrlMap = await resolveLegacyUrlMap(
    raw.map((r) => ({ id: r.id, filename: r.imagesslip })),
    "slip",
  );

  // 3) Customer join — 2-pass tb_users (same pattern as /admin/wallet).
  const useridList = Array.from(new Set(raw.map((r) => r.userid).filter((u): u is string => Boolean(u))));
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

  const rows: Row[] = raw.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    return {
      ...r,
      customer: r.userid
        ? {
            userid: r.userid,
            name: u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "",
            phone: u?.userTel ?? "",
          }
        : null,
    };
  });

  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const overdue1 = rows.filter((r) => daysAgo(r.date) >= 1).length;
  const overdue7 = rows.filter((r) => daysAgo(r.date) >= 7).length;

  // Row-range labels for the "หน้านี้" Card (the footer pager itself is the
  // shared <Pagination> component now — 2026-06-03).
  const rangeFrom = totalRows === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + rows.length, totalRows);

  const csvRows = rows.map((r) => ({
    id:              r.id,
    type:            TYPE_LABEL[r.type ?? ""] ?? `type ${r.type ?? ""}`,
    customer_member: r.customer?.userid ?? "",
    customer_name:   r.customer?.name ?? "",
    customer_phone:  r.customer?.phone ?? "",
    amount:          r.amount ?? 0,
    bank:            r.depositnamebank ?? "",
    note:            r.note ?? "",
    dateslip:        r.dateslip ?? "",
    created_at:      r.date ?? "",
    days_old:        daysAgo(r.date),
  }));
  const csvCols = [
    { key: "id",              label: "เลขที่รายการ" },
    { key: "type",            label: "ประเภท" },
    { key: "customer_member", label: "รหัสลูกค้า" },
    { key: "customer_name",   label: "ชื่อลูกค้า" },
    { key: "customer_phone",  label: "เบอร์" },
    { key: "amount",          label: "จำนวน (บาท)" },
    { key: "bank",            label: "ธนาคาร" },
    { key: "note",            label: "หมายเหตุ" },
    { key: "dateslip",        label: "เวลาในสลิป" },
    { key: "created_at",      label: "วันที่สร้าง" },
    { key: "days_old",        label: "ค้างกี่วัน" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            รอตรวจสลิปชำระเงิน{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">
            อ่านจาก <span className="font-mono">tb_wallet_hs</span> WHERE{" "}
            <span className="font-mono">type IN (&#39;1&#39;,&#39;2&#39;) AND status=&#39;1&#39;</span>{" "}
            · เก่าสุดอยู่บนสุด · approve ที่{" "}
            <Link href="/admin/wallet?view=tx&kind=topup&status=1" className="text-primary-600 hover:underline">/admin/wallet</Link>
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
                href="/admin/reports/pending-payments"
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

      {/* Wave 24 #189 — pagination notice (replaces the silent 1000-cap). */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
        <span aria-hidden>✓</span>
        <div className="flex-1">
          <span className="font-semibold">ลบเพดาน 1,000 แถวต่อหน้าแล้ว</span> ·
          แบ่งหน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ ·
          ใช้ปุ่ม &ldquo;ก่อนหน้า / ถัดไป&rdquo; ใต้ตารางเพื่อดูทั้งหมด.
          <span className="text-emerald-700/80">{" "}(Wave 24 #189)</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <AdminDateFilter dateFrom={sp.date_from} dateTo={sp.date_to} />
        <CsvButton rows={csvRows} cols={csvCols} filename={`pending-topups-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      {/* Stat cards (Wave 24 #189 — prepended "ทั้งหมด (ทุกหน้า)" so the grand
          total isn't misread as the page subtotal; other cards relabeled to
          make their page-scoping explicit). */}
      <div className="grid sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <Card label="ทั้งหมด (ทุกหน้า)" value={totalRows.toLocaleString("th-TH")} />
        <Card label={`หน้านี้ (${rangeFrom.toLocaleString("th-TH")}–${rangeTo.toLocaleString("th-TH")})`} value={String(rows.length)} />
        <Card label="ยอดรวม (หน้านี้)" value={thb(total)} highlight={total > 0} />
        <Card label="ค้าง ≥ 1 วัน (หน้านี้)" value={String(overdue1)} highlight={overdue1 > 0} />
        <Card label="ค้าง ≥ 7 วัน (หน้านี้)" value={String(overdue7)} highlight={overdue7 > 0} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการรอตรวจสลิปในช่วงเวลานี้</p>
        ) : (
          <>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่</th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">ประเภท</th>
                  <th className="px-3 py-3 text-right">จำนวน (THB)</th>
                  <th className="px-3 py-3">ธนาคาร</th>
                  <th className="px-3 py-3">สลิป</th>
                  <th className="px-3 py-3 text-right">ค้าง</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const age = daysAgo(r.date);
                  const ageBadge = age >= 14 ? "bg-red-50 text-red-700 border-red-200"
                    : age >= 7 ? "bg-amber-50 text-amber-700 border-amber-200"
                    : age >= 1 ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                    : "bg-surface-alt text-muted border-border";
                  const type = r.type ?? "";
                  const amount = Number(r.amount ?? 0);
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-3 font-mono text-xs">#{r.id}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.date
                          ? new Date(r.date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div>{r.customer?.name || "—"}</div>
                        {r.customer?.userid && (
                          <div className="font-mono text-[10px] text-muted">{r.customer.userid}</div>
                        )}
                        {r.customer?.phone && (
                          <div className="text-[10px] text-muted">☎ {r.customer.phone}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            TYPE_CLS[type] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {TYPE_LABEL[type] ?? `type ${type}`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.depositnamebank ? (
                          <span className="font-mono text-[11px]">{r.depositnamebank}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {(() => {
                          const url = slipUrlMap[String(r.id)];
                          if (url) {
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-600 hover:underline"
                              >
                                ดู
                              </a>
                            );
                          }
                          if (r.imagesslip) {
                            return (
                              <span
                                className="text-amber-600"
                                title={`สลิป upload แล้วแต่หา URL ไม่ได้ — filename: ${r.imagesslip}`}
                              >
                                ⚠ ไม่พบ
                              </span>
                            );
                          }
                          return <span className="text-muted">—</span>;
                        })()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ageBadge}`}>
                          {age} วัน
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Link
                          href={`/admin/wallet/${r.id}`}
                          className="text-primary-600 hover:underline"
                        >
                          ตรวจสลิป
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={totalRows}
            basePath="/admin/reports/pending-payments"
            params={{ date_from: sp.date_from, date_to: sp.date_to, sla: sp.sla }}
          />
          </>
        )}
      </div>

      <p className="text-[11px] text-muted">
        หน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ · ใช้ตัวกรองช่วงวันที่/สถานะเพื่อจำกัดผลลัพธ์ ·
        CSV ดาวน์โหลดเฉพาะหน้าที่แสดง (หากต้องการครบทุกหน้า ให้ไล่กดถัดไปแล้วโหลดทีละหน้า)
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
