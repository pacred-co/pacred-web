import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { sweepStaleImportingRows } from "@/lib/admin/csv-import-sweep";
import { CsvImportRowActions } from "./row-actions";

const STATUS_BADGE: Record<string, string> = {
  uploaded:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  previewed: "bg-blue-50 text-blue-700 border-blue-200",
  importing: "bg-amber-50 text-amber-700 border-amber-200",
  imported:  "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded:  "อัปโหลดแล้ว",
  previewed: "พรีวิว",
  importing: "กำลังนำเข้า",
  imported:  "นำเข้าเสร็จ",
  failed:    "ผิดพลาด",
};

type Uploader = { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;

function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function AdminCsvImportsPage() {
  const admin = createAdminClient();

  // P-19-followup-stale: opportunistic sweep so admins never see a
  // zombie 'importing' row left behind by a crashed import process.
  await sweepStaleImportingRows(admin);

  const { data } = await admin
    .from("csv_imports")
    .select(`
      id, filename, target_table, status,
      row_count, imported_count, error_message,
      size_bytes, created_at, imported_at,
      uploader:profiles!uploader_id ( member_code, first_name, last_name )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  type RawRow = {
    id: string; filename: string; target_table: string; status: string;
    row_count: number; imported_count: number; error_message: string | null;
    size_bytes: number | null; created_at: string; imported_at: string | null;
    uploader: Uploader;
  };
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    uploader: normSingle(r.uploader),
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">นำเข้าข้อมูล CSV</h1>
          <p className="mt-1 text-sm text-muted">
            อัปโหลดไฟล์ CSV → พรีวิว 5 แถวแรก → ยืนยันนำเข้าตารางเป้าหมาย.
            รองรับ <span className="font-mono">forwarders</span> เท่านั้นในเฟสนี้.
          </p>
        </div>
        <Link
          href="/admin/csv-imports/upload"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
        >
          + อัปโหลด CSV ใหม่
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มีไฟล์ CSV — กดปุ่มขวาบนเพื่อเริ่ม</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">ไฟล์ + เป้าหมาย</th>
                  <th className="px-4 py-3">ผู้อัปโหลด</th>
                  <th className="px-4 py-3 text-right">แถว / นำเข้า</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      <Link
                        href={`/admin/csv-imports/${r.id}`}
                        className="block text-primary-600 hover:underline mb-1"
                      >
                        {new Date(r.created_at).toLocaleString("th-TH")}
                      </Link>
                      {r.imported_at && (
                        <div className="text-[10px]">
                          เสร็จ {new Date(r.imported_at).toLocaleTimeString("th-TH")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium truncate max-w-[260px]">{r.filename}</div>
                      <div className="mt-0.5 font-mono text-muted">→ {r.target_table}</div>
                      {r.size_bytes && (
                        <div className="text-[10px] text-muted">{(r.size_bytes / 1024).toFixed(1)} KB</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.uploader?.member_code ?? "—"}</div>
                      <div>{r.uploader?.first_name} {r.uploader?.last_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-right font-mono">
                      <div>{r.row_count}</div>
                      {r.imported_count > 0 && (
                        <div className="text-green-700">+{r.imported_count}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          STATUS_BADGE[r.status] ?? "bg-gray-50 border-gray-200"
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.error_message && (
                        <div className="mt-1 max-w-[180px] text-[10px] text-red-700">
                          ⚠ {r.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <CsvImportRowActions id={r.id} status={r.status} />
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
