import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { nowMs } from "@/lib/datetime-helpers";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol } from "@/components/admin/csv-button";
import { exportBroadcastsAll } from "@/actions/admin/export/broadcasts";

/**
 * /admin/broadcasts — Pop-up ประกาศ list (faithful — legacy `pcs-admin/popup.php`
 * `include/pages/popup/all.php`).
 *
 * 2026-06-01 — REPOINTED to legacy `tb_notify`. Each row is one announcement
 * popup shown to ALL active customers within its `datestart..dateexp` window
 * (read flow in the customer login-popup). Columns mirror legacy all.php:
 * รหัส (id) · ชื่อเรื่องประกาศ (title + image/text preview) · วันที่เริ่มแสดงผล
 * (datestart) · วันที่สิ้นสุดการแสดงผล (dateexp) · ผู้ทำรายการ (adminid) ·
 * ตัวเลือก (delete). We add an "active now?" chip — Pacred design latitude.
 */

export const dynamic = "force-dynamic";

type NotifyRow = {
  id:        number;
  title:     string;
  content:   string | null;
  datestart: string | null;
  dateexp:   string | null;
  url:       string | null;
  adminid:   string | null;
};

function looksLikeImage(s: string | null | undefined): boolean {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(s) || /^https?:\/\//i.test(s);
}

function fmt(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminBroadcastsListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["super", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: raw, error: rawErr } = await admin
    .from("tb_notify")
    .select("id, title, content, datestart, dateexp, url, adminid")
    .order("id", { ascending: false })
    .limit(500);
  if (rawErr) {
    console.error(`[tb_notify list] failed`, { code: rawErr.code, message: rawErr.message });
    throw new Error(`Failed to load tb_notify (${rawErr.code ?? "unknown"}): ${rawErr.message}`);
  }
  const rows = (raw ?? []) as unknown as NotifyRow[];

  const now = nowMs();
  const activeCount = rows.filter((r) => {
    const start = r.datestart ? new Date(r.datestart).getTime() : -Infinity;
    const end   = r.dateexp   ? new Date(r.dateexp).getTime()   :  Infinity;
    return start <= now && now <= end;
  }).length;

  // PERF (2026-06-03): client-slice the displayed table (50/page) — activeCount
  // above stays full-set-correct (JS-derived over all rows).
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // CSV columns mirror the <thead> 1:1.
  const csvCols: CsvCol[] = [
    { key: "id", label: "รหัส" },
    { key: "title", label: "ชื่อเรื่องประกาศ" },
    { key: "datestart", label: "วันที่เริ่มแสดงผล" },
    { key: "dateexp", label: "วันที่สิ้นสุด" },
    { key: "status", label: "สถานะ" },
    { key: "adminid", label: "ผู้ทำรายการ" },
  ];
  const csvRows = pageRows.map((r) => {
    const start = r.datestart ? new Date(r.datestart).getTime() : -Infinity;
    const end = r.dateexp ? new Date(r.dateexp).getTime() : Infinity;
    const active = start <= now && now <= end;
    const expired = now > end;
    return {
      id: r.id,
      title: r.title ?? "",
      datestart: fmt(r.datestart),
      dateexp: fmt(r.dateexp),
      status: active ? "กำลังแสดง" : expired ? "หมดอายุ" : "รอแสดง",
      adminid: r.adminid ?? "—",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">📢 Pop-up ประกาศ</h1>
          <p className="text-xs text-muted mt-1">
            ประกาศที่เด้งหาลูกค้าทุกคนตอน login — แสดงในช่วง <strong>วันเริ่ม–วันหมดอายุ</strong> จนกว่าลูกค้าจะกด &quot;รับทราบ&quot;
            (<span className="text-green-700 font-medium">{activeCount}</span> รายการกำลังแสดงตอนนี้)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="broadcasts.csv"
            fetchAll={async () => {
              "use server";
              return exportBroadcastsAll();
            }}
          />
          <Link
            href="/admin/broadcasts/new"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
          >
            ➕ เพิ่ม Pop-up ใหม่
          </Link>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มี Pop-up ประกาศ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">รหัส</th>
                  <th className="px-3 py-2">ชื่อเรื่องประกาศ</th>
                  <th className="px-3 py-2">วันที่เริ่มแสดงผล</th>
                  <th className="px-3 py-2">วันที่สิ้นสุด</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">ผู้ทำรายการ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const start = r.datestart ? new Date(r.datestart).getTime() : -Infinity;
                  const end   = r.dateexp   ? new Date(r.dateexp).getTime()   :  Infinity;
                  const active = start <= now && now <= end;
                  const expired = now > end;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                      <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/broadcasts/${r.id}`} className="text-primary-600 hover:underline font-medium">
                          {r.title}
                        </Link>
                        {looksLikeImage(r.content) ? (
                          <div className="mt-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.content!}
                              alt={r.title}
                              style={{ maxHeight: 90 }}
                              className="rounded border border-border"
                            />
                          </div>
                        ) : r.content ? (
                          <p className="mt-0.5 text-xs text-muted line-clamp-2">{r.content}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmt(r.datestart)}</td>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{fmt(r.dateexp)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            active
                              ? "bg-green-50 text-green-700 border-green-200"
                              : expired
                                ? "bg-gray-50 text-gray-500 border-gray-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {active ? "กำลังแสดง" : expired ? "หมดอายุ" : "รอแสดง"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-center">{r.adminid ?? "—"}</td>
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
          basePath="/admin/broadcasts"
        />
      </div>

      <p className="text-[10px] text-muted">
        Faithful port ของ legacy <code className="font-mono">popup.php</code> — เขียนลง <code className="font-mono">tb_notify</code> ·
        ลูกค้ากด &quot;รับทราบ&quot; → บันทึก <code className="font-mono">tb_notify_read</code>.
      </p>
    </main>
  );
}
