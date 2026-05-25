import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { CsvImportDetailActions } from "./detail-actions";

const STATUS_BADGE: Record<string, string> = {
  uploaded:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  previewed: "bg-blue-50 text-blue-700 border-blue-200",
  importing: "bg-amber-50 text-amber-700 border-amber-200",
  imported:  "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded:  "อัปโหลดแล้ว — รอพรีวิว",
  previewed: "พรีวิวแล้ว — รอยืนยันนำเข้า",
  importing: "กำลังนำเข้า...",
  imported:  "นำเข้าเสร็จเรียบร้อย",
  failed:    "ผิดพลาด",
};

export default async function CsvImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin  = createAdminClient();

  const { data, error } = await admin
    .from("csv_imports")
    .select(`
      id, filename, target_table, status,
      row_count, imported_count, error_message,
      size_bytes, mime_type, preview_rows,
      created_at, updated_at, imported_at,
      uploader:profiles!uploader_id ( id, member_code, first_name, last_name )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[csv_imports lookup] failed`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error(`Failed to load csv_imports (${error.code ?? "unknown"}): ${error.message}`);
  }
  if (!data) notFound();

  type Row = typeof data;
  const row = data as Row & {
    uploader: { id: string; member_code: string | null; first_name: string | null; last_name: string | null } | { id: string; member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
    preview_rows: Record<string, string>[] | null;
  };

  const uploader = Array.isArray(row.uploader) ? row.uploader[0] ?? null : row.uploader;
  const preview: Record<string, string>[] = row.preview_rows ?? [];
  const headers  = preview.length > 0 ? Object.keys(preview[0]!) : [];

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <Link href="/admin/csv-imports" className="text-xs text-primary-600 hover:underline">
        ← กลับรายการ
      </Link>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold truncate">{row.filename}</h1>
        <p className="mt-1 text-xs text-muted font-mono">{row.id}</p>
      </div>

      {/* Status hero */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <span
              className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${
                STATUS_BADGE[row.status] ?? "bg-gray-50 border-gray-200"
              }`}
            >
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
            <ul className="text-xs space-y-0.5 text-muted">
              <li>เป้าหมาย: <span className="font-mono text-foreground">{row.target_table}</span></li>
              <li>ขนาด: {row.size_bytes ? `${(row.size_bytes / 1024).toFixed(1)} KB` : "—"}</li>
              <li>แถวที่ parse ได้: <span className="font-mono text-foreground">{row.row_count}</span></li>
              {row.imported_count > 0 && (
                <li>นำเข้าสำเร็จ: <span className="font-mono text-green-700">{row.imported_count}</span></li>
              )}
              <li>อัปโหลด: {new Date(row.created_at).toLocaleString("th-TH")}</li>
              {row.imported_at && (
                <li>นำเข้าเมื่อ: {new Date(row.imported_at).toLocaleString("th-TH")}</li>
              )}
              {uploader && (
                <li>โดย: <span className="font-mono">{uploader.member_code ?? "—"}</span> {uploader.first_name} {uploader.last_name}</li>
              )}
            </ul>
            {row.error_message && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 max-w-prose">
                <p className="font-semibold">⚠ Error</p>
                <p className="mt-1 font-mono break-all">{row.error_message}</p>
              </div>
            )}
          </div>
          <CsvImportDetailActions id={row.id} status={row.status} />
        </div>
      </section>

      {/* Preview table */}
      {preview.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border bg-surface-alt/50 px-5 py-3">
            <h2 className="text-sm font-bold text-foreground">พรีวิว 5 แถวแรก</h2>
            <p className="text-xs text-muted mt-0.5">
              ตรวจว่าคอลัมน์ตรงกับ schema ของตารางเป้าหมาย
              ก่อนกด &quot;ยืนยันนำเข้า&quot;
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/30 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">#</th>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-2 max-w-[200px] truncate" title={String(r[h] ?? "")}>
                        {String(r[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {row.status === "uploaded" && (
        <p className="text-xs text-muted text-center">
          กดปุ่ม &quot;พรีวิว&quot; เพื่อให้ระบบ parse ไฟล์และโชว์ตัวอย่างก่อนนำเข้า
        </p>
      )}
    </main>
  );
}
