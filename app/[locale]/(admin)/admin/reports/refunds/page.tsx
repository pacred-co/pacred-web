/**
 * /admin/reports/refunds — refund event report (faithful-port rewrite).
 *
 * Wave 20 P0-4 (2026-05-26) — swap data source from the rebuilt-app
 * `wallet_transactions` (kind='refund' — EMPTY on prod) to the legacy
 * `tb_wallet_hs` table where the 4,356 historic refund rows actually
 * live (type='5' = ปรับยอดโดยแอดมิน / refund). Mirrors the Wave 20
 * P0-2 accounting hub rewrite at commit `1a1b8d7`.
 *
 * Field map (rebuilt → legacy):
 *   wallet_transactions.kind='refund'      → tb_wallet_hs.type='5'
 *   wallet_transactions.amount             → tb_wallet_hs.amount
 *   wallet_transactions.status='completed' → tb_wallet_hs.status='2'
 *   wallet_transactions.created_at         → tb_wallet_hs.date
 *   wallet_transactions.note               → tb_wallet_hs.note (refund reason)
 *   wallet_transactions.profile_id (uuid)  → tb_wallet_hs.userid (text PR12345)
 *   wallet_transactions.reference_id       → tb_wallet_hs.reforder (forwarder id)
 *   wallet_transactions.slip_transferred_at→ tb_wallet_hs.dateslip
 *   (n/a)                                  → tb_wallet_hs.imagesslip
 *   profiles join                          → tb_users batch lookup by userid
 *   linked forwarder                       → tb_forwarder.id = reforder
 *                                            (when reforder is pure digits)
 *
 * Customer name: 2-pass tb_users lookup (rebuilt profiles is empty for
 * migrated customers); mirrors the Wave 3 P0 #1 pattern in
 * `/admin/forwarders/page.tsx`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";

export const dynamic = "force-dynamic";

type LegacyUser = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
};

type LegacyForwarder = {
  id: number;
  fstatus: string;
  ftotalprice: number | null;
};

type RawWalletHs = {
  id: number;
  userid: string;
  amount: number | null;
  status: string | null;
  note: string | null;
  date: string | null;
  dateslip: string | null;
  reforder: string | null;
  adminidupdate: string | null;
};

type Row = {
  id: number;
  userid: string;
  amount: number;
  status: string;
  note: string | null;
  date: string;
  dateslip: string | null;
  reforder: string | null;
  adminidupdate: string | null;
  user: LegacyUser | null;
  forwarder: LegacyForwarder | null;
};

function thb(n: number): string {
  return "฿" + Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function userDisplayName(u: LegacyUser | null): string {
  if (!u) return "—";
  return [u.username, u.userlastname].filter(Boolean).join(" ") || "—";
}

// Module-scope helper so React Compiler doesn't flag Date.now as impure-in-render.
function nDaysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// tb_wallet_hs.status enum (shared with tb_payment).
const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};

export default async function RefundsReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  // Default 30-day window if nothing specified.
  const dateFrom = sp.date_from ?? nDaysAgoIsoDate(30);
  const dateTo   = sp.date_to;

  // ── 1) Main refund rows (tb_wallet_hs type='5' = refund / admin manual adjust). ──
  let q = admin
    .from("tb_wallet_hs")
    .select("id, userid, amount, status, note, date, dateslip, reforder, adminidupdate")
    .eq("type", "5")
    .eq("status", "2")
    .order("date", { ascending: false })
    .limit(1000);
  q = q.gte("date", dateFrom);
  if (dateTo) q = q.lte("date", dateTo + "T23:59:59");
  const { data: rawRows, error: refundErr } = await q;
  if (refundErr) {
    console.error(`[tb_wallet_hs refund list] failed`, {
      code: refundErr.code,
      message: refundErr.message,
      details: refundErr.details,
    });
    throw new Error(
      `Failed to load tb_wallet_hs refunds (${refundErr.code ?? "unknown"}): ${refundErr.message}`,
    );
  }
  const raw = (rawRows ?? []) as RawWalletHs[];

  // ── 2) Batch-load tb_users for the userid set on screen (2-pass lookup). ──
  const userIds = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  const userMap = new Map<string, LegacyUser>();
  if (userIds.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userid, username, userlastname, usertel")
      .in("userid", userIds);
    if (userErr) {
      console.error(`[tb_users batch] failed`, { code: userErr.code, message: userErr.message });
    }
    for (const u of (userRows ?? []) as LegacyUser[]) {
      userMap.set(u.userid, u);
    }
  }

  // ── 3) Batch-load tb_forwarder for the linked refunds (reforder column). ──
  // reforder is text but holds a forwarder id when the refund relates to a
  // specific import job. Filter to pure-digit values only.
  const forwarderIds = Array.from(
    new Set(
      raw
        .map((r) => r.reforder)
        .filter((r): r is string => Boolean(r) && /^\d+$/.test(r as string))
        .map((r) => Number(r)),
    ),
  );
  const forwarderMap = new Map<number, LegacyForwarder>();
  if (forwarderIds.length > 0) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, ftotalprice")
      .in("id", forwarderIds);
    if (fwdErr) {
      console.error(`[tb_forwarder batch] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    for (const f of (fwdRows ?? []) as LegacyForwarder[]) {
      forwarderMap.set(f.id, f);
    }
  }

  // ── 4) Merge into render rows. ──
  const rows: Row[] = raw.map((r) => {
    const fwdId = r.reforder && /^\d+$/.test(r.reforder) ? Number(r.reforder) : null;
    return {
      id: r.id,
      userid: r.userid,
      amount: Number(r.amount ?? 0),
      status: r.status ?? "",
      note: r.note,
      date: r.date ?? "",
      dateslip: r.dateslip,
      reforder: r.reforder,
      adminidupdate: r.adminidupdate,
      user: userMap.get(r.userid) ?? null,
      forwarder: fwdId !== null ? (forwarderMap.get(fwdId) ?? null) : null,
    };
  });

  const total = rows.reduce((s, r) => s + Math.abs(r.amount), 0);

  // ── 5) CSV data. ──
  const csvRows = rows.map((r) => ({
    id:           r.id,
    date:         r.date,
    dateslip:     r.dateslip ?? "",
    userid:       r.userid,
    name:         userDisplayName(r.user),
    phone:        r.user?.usertel ?? "",
    amount:       Math.abs(r.amount),
    reforder:     r.reforder ?? "",
    forwarder_status: r.forwarder ? legacyForwarderStatusThai(r.forwarder.fstatus) : "",
    note:         r.note ?? "",
    admin:        r.adminidupdate ?? "",
  }));
  const csvCols = [
    { key: "date",             label: "วันที่ระบบ" },
    { key: "dateslip",         label: "วันที่โอนจริง (สลิป)" },
    { key: "id",               label: "Tx ID" },
    { key: "userid",           label: "รหัสลูกค้า" },
    { key: "name",             label: "ชื่อลูกค้า" },
    { key: "phone",            label: "เบอร์" },
    { key: "amount",           label: "ยอดคืน (บาท)" },
    { key: "reforder",         label: "ref forwarder" },
    { key: "forwarder_status", label: "สถานะ forwarder" },
    { key: "note",             label: "หมายเหตุ" },
    { key: "admin",            label: "admin ผู้ทำรายการ" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">รายการคืนเงิน</h1>
          <p className="mt-1 text-sm text-muted">
            tb_wallet_hs ที่ <span className="font-mono">type=&apos;5&apos;</span> status=&apos;2&apos; — default 30 วันล่าสุด
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <AdminDateFilter dateFrom={sp.date_from} dateTo={sp.date_to} />
        <CsvButton rows={csvRows} cols={csvCols} filename={`refunds-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card label="จำนวนรายการ" value={String(rows.length)} />
        <Card label="ยอดคืนรวม" value={thb(total)} />
        <Card label="เชื่อม forwarder" value={String(rows.filter((r) => r.forwarder).length)} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีการคืนเงินในช่วงเวลานี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่ระบบ / โอนจริง</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอดคืน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">อ้างอิง forwarder</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className="text-muted">
                        {r.date ? new Date(r.date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </div>
                      {r.dateslip && (
                        <div className="mt-0.5 text-foreground">
                          ⏱ {new Date(r.dateslip).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>
                        <Link href={`/admin/customers/${r.userid}`} className="text-primary-600 hover:underline">
                          {userDisplayName(r.user)}
                        </Link>
                      </p>
                      <p className="font-mono text-[10px] text-muted">{r.userid}</p>
                      {r.user?.usertel && <p className="text-[10px] text-muted">☎ {r.user.usertel}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{thb(r.amount)}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.forwarder ? (
                        <Link
                          href={`/admin/forwarders/${r.forwarder.id}`}
                          className="font-mono text-[11px] text-primary-600 hover:underline"
                        >
                          F{r.forwarder.id}{" "}
                          <span className="text-muted">({legacyForwarderStatusThai(r.forwarder.fstatus)})</span>
                        </Link>
                      ) : r.reforder ? (
                        <span className="font-mono text-[11px] text-muted">{r.reforder}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-xs truncate" title={r.note ?? ""}>
                      {r.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
