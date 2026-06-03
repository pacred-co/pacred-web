/**
 * /admin/cnt-hs/[id] — รายละเอียดการเบิกเงินค่าตู้ (Wave 10 · Wave 12-A 2026-05-23)
 *
 * Legacy: pcs-admin/cnt-hs.php?page=detail&id=<ID> (L486+ · ~350 LOC).
 *
 * What the page shows:
 *   - Full tb_cnt row: cntname (comma-separated cabinet list · sometimes 90+!),
 *     amount, status badge, bank details, slip image, attached PDF file,
 *     created/updated dates + admins
 *   - Linked tb_cnt_item rows (one per cabinet number)
 *   - For each cabinet: join tb_forwarder (count, weight, volume, total price)
 *     so admin sees what's IN the container they're paying for
 *
 * Status lifecycle:
 *   '1' = รอตรวจ (newly created · slip not yet uploaded)
 *   '2' = อนุมัติ/จ่ายแล้ว (legacy: cnt-hs.php?page=detail uploads slip → sets status=2)
 *   '3' = ปฏิเสธ (cancelled by admin)
 *
 * Wave 10:
 *   - Full read-only view + Approve/Reject buttons (status='1' only)
 *   - Slip image + PDF file VIEW (renders + opens in new tab)
 *
 * Wave 12-A (this commit):
 *   - Slip upload form → uploads to `slips` bucket + auto-flips status='2'
 *     (matches legacy upload-and-auto-approve at cnt-hs.php L572)
 *   - Slip viewer now reads from signed-URL when filename has no `/` (admin
 *     bucket-stored) and falls back to /legacy/uploads/ for legacy paths
 *
 * Wave 13 backlog:
 *   - cntFile (quotation/invoice PDF) upload
 *   - Edit-which-cabinets-are-in-this-cnt flow
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { CntActionButtons } from "./action-buttons";
import { CntSlipUploadForm } from "./slip-upload-form";
import { fstatusBadge } from "@/lib/admin/forwarder-status";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจ",
  "2": "จ่ายแล้ว",
  "3": "ปฏิเสธ",
};
// Wave 24 ROW-COLOR-RESTORE — was `-100` washed tints; staff couldn't read
// the chip at-a-glance. Solid Tailwind weights match canonical CNTSTATUS_CFG
// + `forwarder-status.ts` rule: chip-color is LOGIC not chrome.
const STATUS_CLS: Record<string, string> = {
  "1": "bg-amber-500 text-amber-50 border-amber-700",
  "2": "bg-emerald-500 text-emerald-50 border-emerald-700",
  "3": "bg-red-500 text-red-50 border-red-700",
};

type CntRow = {
  ID: number;
  cntName: string | null;
  cntStatus: string | null;
  cntAmount: number | null;
  cntImagesSlip: string | null;
  cntFile: string | null;
  date: string | null;
  adminIDCreate: string | null;
  nameBlank: string | null;
  noBlank: string | null;
  nameAccount: string | null;
  dateUpdate: string | null;
  adminIDUpdate: string | null;
};
type CntItemRow = {
  ID: number;
  fCabinetNumber: string;
  cntID: number;
};
type FwRow = {
  id: number;
  fdate: string | null;
  fcabinetnumber: string;
  fidorco: string | null;
  fstatus: string | null;
  ftotalprice: number | null;
  fweight: number | null;
  fvolume: number | null;
  userid: string | null;
};
type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
};

/**
 * Resolve a slip URL.
 *   - Full http(s) URL → return as-is
 *   - Starts with "admin/" → signed URL from `slips` bucket (Wave 12-A uploads)
 *   - Otherwise → legacy file under /legacy/uploads/ (pre-port slip filenames)
 *
 * Returns null if a signed URL couldn't be created (caller renders fallback).
 */
/**
 * Resolve cnt-hs slip/file filenames to signed URLs.
 *
 * Wave 13 — extended to fall through to `resolveLegacyUrl` for bare
 * filenames (legacy backfill 06 lives in `slips/legacy/` and
 * `member-docs/legacy-uploads/file/`). Behaviour:
 *   - http(s)://...       → pass-through
 *   - admin/<...>         → slips bucket (Wave 12 admin upload path)
 *   - bare filename       → resolveLegacyUrl: `slips/legacy/<file>` for
 *                            images, `member-docs/legacy-uploads/file/<file>`
 *                            for PDFs (caller picks `kind`)
 */
async function slipUrl(filename: string): Promise<string | null> {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  if (filename.startsWith("admin/")) {
    return getSignedBucketUrl("slips", filename);
  }
  // Bare filename — route by extension. PDFs live in legacy-uploads/file/,
  // images live in slips/legacy/.
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  return resolveLegacyUrl(filename, isPdf ? "file" : "slip");
}

export default async function CntHsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "accounting"]);
  const { id: idParam } = await params;
  const cntId = Number(idParam);
  if (!Number.isFinite(cntId) || cntId <= 0) notFound();

  const admin = createAdminClient();

  // 1. Read the main cnt row
  const { data: cntRaw, error: cntRawErr } = await admin
    .from("tb_cnt")
    .select(
      "ID,cntName,cntStatus,cntAmount,cntImagesSlip,cntFile,date,adminIDCreate,nameBlank,noBlank,nameAccount,dateUpdate,adminIDUpdate",
    )
    .eq("ID", cntId)
    .maybeSingle();
  if (cntRawErr) {
    console.error(`[tb_cnt lookup] failed`, { code: cntRawErr.code, message: cntRawErr.message, details: cntRawErr.details, hint: cntRawErr.hint });
    throw new Error(`Failed to load tb_cnt (${cntRawErr.code ?? "unknown"}): ${cntRawErr.message}`);
  }
  if (!cntRaw) notFound();
  const cnt = cntRaw as unknown as CntRow;

  // 2. Read linked cabinet items
  const { data: itemsRaw, error: itemsRawErr } = await admin
    .from("tb_cnt_item")
    .select("ID,fCabinetNumber,cntID")
    .eq("cntID", cntId);
  if (itemsRawErr) {
    console.error(`[tb_cnt_item list] failed`, { code: itemsRawErr.code, message: itemsRawErr.message });
  }
  const items = (itemsRaw ?? []) as unknown as CntItemRow[];
  const cabinetNumbers = Array.from(new Set(items.map((i) => i.fCabinetNumber).filter(Boolean)));

  // 3. Read forwarders for these cabinets (so admin sees the goods)
  //
  // Wave 24 #189 follow-up: this is a sub-resource query (forwarders WITHIN
  // a specific cnt-hs container) NOT a top-level paginated list — adding
  // ?offset= here would break the per-cabinet grouping (`fwByCabinet`)
  // below, leaving some cabinets half-rendered. The cabinetNumbers count
  // per cnt-hs is bounded by physical container size (typically 50-200
  // forwarders, occasionally up to ~500 for mega-cnt-hs). Bumped from
  // .limit(1000) → .limit(5000) defensively + added a Sentry-friendly
  // warn so we can spot when a future cnt-hs grows past that. A real
  // fix would partition the table per-cabinet or paginate per-cabinet,
  // both of which require UX changes — out of scope for the silent-cap
  // sweep.
  let forwarders: FwRow[] = [];
  if (cabinetNumbers.length > 0) {
    const { data: fwRaw, error: fwRawErr } = await admin
      .from("tb_forwarder")
      .select("id,fdate,fcabinetnumber,fidorco,fstatus,ftotalprice,fweight,fvolume,userid")
      .in("fcabinetnumber", cabinetNumbers)
      .order("fdate", { ascending: false })
      .limit(5000);
    if (fwRaw && fwRaw.length >= 5000) {
      console.warn(
        `[cnt-hs/${cntId}] forwarder list hit 5000-row cap — per-cabinet ` +
        `pagination needed (Wave 24 #189 deferred). Cabinets: ${cabinetNumbers.length}.`,
      );
    }
    if (fwRawErr) {
      console.error(`[tb_forwarder list] failed`, { code: fwRawErr.code, message: fwRawErr.message });
    }
    forwarders = (fwRaw ?? []) as unknown as FwRow[];
  }

  // 4. Resolve customer names for the forwarders
  const userIds = Array.from(new Set(forwarders.map((f) => f.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersRawErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName")
      .in("userID", userIds);
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }

  // Group forwarders by cabinet for the table layout
  const fwByCabinet = new Map<string, FwRow[]>();
  for (const f of forwarders) {
    const arr = fwByCabinet.get(f.fcabinetnumber) ?? [];
    arr.push(f);
    fwByCabinet.set(f.fcabinetnumber, arr);
  }

  const status = cnt.cntStatus ?? "1";
  const canAct = status === "1" && (roles.includes("super") || roles.includes("accounting"));

  // Resolve slip + file URLs once on the server (signed-URL fetch is async
  // for admin-bucket uploads — must complete before render).
  const slipResolved = cnt.cntImagesSlip ? await slipUrl(cnt.cntImagesSlip) : null;
  const fileResolved = cnt.cntFile ? await slipUrl(cnt.cntFile) : null;

  // Sum across linked forwarders (sanity vs cnt.amount)
  const linkedTotal = forwarders.reduce((s, f) => s + Number(f.ftotalprice ?? 0), 0);
  const linkedCount = forwarders.length;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · เบิกเงินค่าตู้
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">#{cnt.ID}</h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs font-mono">
              {cabinetNumbers.length} ตู้
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 12-A · slip-upload + auto-approve เปิดใช้งานแล้ว · cntFile upload → Wave 13
          </p>
        </div>
        <Link href="/admin/cnt-hs" className="text-xs text-primary-600 hover:underline">
          ← รายการ
        </Link>
      </div>

      {/* Main detail card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <KV
          label="ยอดเบิก (THB)"
          value={`฿${Number(cnt.cntAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV
          label="ยอดรวมจากตู้ที่อยู่ในรายการ"
          value={`฿${linkedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${linkedCount} รายการ ฝากนำเข้า)`}
          mono
        />
        <KV label="วันที่สร้าง" value={cnt.date ? new Date(cnt.date).toLocaleString("th-TH") : "—"} />
        <KV label="แอดมินผู้สร้าง" value={cnt.adminIDCreate ?? "—"} mono />
        {cnt.dateUpdate && (
          <KV
            label="แก้ไขล่าสุด"
            value={`${new Date(cnt.dateUpdate).toLocaleString("th-TH")} (${cnt.adminIDUpdate ?? "—"})`}
          />
        )}
      </div>

      {/* Bank card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <p className="text-xs font-semibold text-muted">ปลายทางโอน</p>
        <KV label="ธนาคาร" value={cnt.nameBlank ?? "—"} />
        <KV label="เลขที่บัญชี" value={cnt.noBlank ?? "—"} mono />
        <KV label="ชื่อบัญชี" value={cnt.nameAccount ?? "—"} />
      </div>

      {/* Slip + file viewer */}
      {(cnt.cntImagesSlip || cnt.cntFile) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {cnt.cntImagesSlip && (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
              <p className="text-xs font-semibold text-muted mb-2">สลิปการโอน</p>
              {slipResolved ? (
                <a
                  href={slipResolved}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
                >
                  {cnt.cntImagesSlip.toLowerCase().endsWith(".pdf") ? (
                    <span className="inline-flex items-center gap-2 px-3 py-2 text-sm text-primary-700">
                      📄 เปิดสลิป PDF →
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slipResolved} alt="สลิป" className="max-w-full max-h-[400px]" />
                  )}
                </a>
              ) : (
                <p className="text-xs text-muted italic">ไม่สามารถสร้างลิงก์สลิปได้</p>
              )}
              <p className="text-[10px] text-muted mt-2 break-all">{cnt.cntImagesSlip}</p>
            </div>
          )}
          {cnt.cntFile && (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
              <p className="text-xs font-semibold text-muted mb-2">เอกสารแนบ (PDF)</p>
              {fileResolved ? (
                <a
                  href={fileResolved}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-primary-500 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
                >
                  📄 เปิดเอกสาร →
                </a>
              ) : (
                <p className="text-xs text-muted italic">ไม่สามารถสร้างลิงก์เอกสารได้</p>
              )}
              <p className="text-[10px] text-muted mt-2 break-all">{cnt.cntFile}</p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons + slip upload (only for pending status='1') */}
      {canAct && (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-yellow-900">รายการนี้ยังอยู่ในสถานะ &quot;รอตรวจ&quot;</p>
            <p className="text-xs text-yellow-800 mt-1">
              เลือกวิธีปิดงาน: อัปโหลดสลิปการโอน (จะ auto-approve เป็น &quot;จ่ายแล้ว&quot;) · หรือ
              อนุมัติ/ปฏิเสธโดยตรง (ไม่บันทึกสลิป)
            </p>
          </div>

          {/* Slip-upload card — primary path mirrors legacy */}
          <div className="rounded-xl border border-border bg-white p-4">
            <CntSlipUploadForm cntId={cnt.ID} />
          </div>

          {/* Fallback: status-only mutation (no slip) */}
          <div className="rounded-xl border border-border bg-white/60 p-4 space-y-2">
            <p className="text-xs font-medium text-muted">หรือเปลี่ยนสถานะโดยไม่อัปโหลดสลิป</p>
            <CntActionButtons cntId={cnt.ID} />
          </div>
        </div>
      )}
      {status === "1" && !canAct && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          คุณไม่มีสิทธิ์ approve/reject (ต้องเป็น super หรือ accounting)
        </div>
      )}

      {/* Cabinets table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-semibold">
            ตู้ที่อยู่ในรายการ ({cabinetNumbers.length} ตู้ · {linkedCount} forwarders)
          </h2>
        </div>
        {cabinetNumbers.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ไม่มีรายการ ตู้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">เลขตู้</th>
                  <th className="px-3 py-2 text-right">จำนวน forwarder</th>
                  <th className="px-3 py-2 text-right">น้ำหนักรวม</th>
                  <th className="px-3 py-2 text-right">ปริมาตรรวม</th>
                  <th className="px-3 py-2 text-right">ราคารวม</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cabinetNumbers.map((cabinet) => {
                  const fws = fwByCabinet.get(cabinet) ?? [];
                  const w = fws.reduce((s, f) => s + Number(f.fweight ?? 0), 0);
                  const v = fws.reduce((s, f) => s + Number(f.fvolume ?? 0), 0);
                  const t = fws.reduce((s, f) => s + Number(f.ftotalprice ?? 0), 0);
                  return (
                    <tr key={cabinet} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{cabinet}</td>
                      <td className="px-3 py-2 text-right">{fws.length}</td>
                      <td className="px-3 py-2 text-right font-mono">{w.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{v.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        ฿{t.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/forwarders?focus=search&q=${encodeURIComponent(cabinet)}`}
                          className="text-primary-600 hover:underline"
                        >
                          ดูใน forwarder
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Forwarders detail table (collapsed by default — too many to scroll
          for big cnts; show only first 50, hint to drill into forwarders page) */}
      {forwarders.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">รายการ ฝากนำเข้า (แสดง 50 รายการแรก)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">วันที่</th>
                  <th className="px-3 py-2 text-left">F-no</th>
                  <th className="px-3 py-2 text-left">ตู้</th>
                  <th className="px-3 py-2 text-left">ลูกค้า</th>
                  <th className="px-3 py-2 text-left">สถานะ</th>
                  <th className="px-3 py-2 text-right">ราคา</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {forwarders.slice(0, 50).map((f) => {
                  const u = f.userid ? userMap.get(f.userid) : undefined;
                  // Wave 24 ROW-COLOR-RESTORE — row tint + chip per fstatus.
                  const badge = fstatusBadge(f.fstatus ?? "");
                  return (
                    <tr key={f.id} className={`border-t border-border ${badge.rowBg}`}>
                      <td className="px-3 py-2">
                        {f.fdate ? String(f.fdate).slice(0, 10) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono">{f.fidorco ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{f.fcabinetnumber}</td>
                      <td className="px-3 py-2">
                        {f.userid ? (
                          <Link
                            href={`/admin/customers/${encodeURIComponent(f.userid)}`}
                            className="text-primary-700 hover:underline"
                          >
                            {`${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || f.userid}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {f.fstatus ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.chip}`}
                          >
                            {badge.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ฿{Number(f.ftotalprice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/forwarders/${encodeURIComponent(f.fidorco ?? String(f.id))}`}
                          className="text-primary-700 hover:underline"
                        >
                          ดู
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {forwarders.length > 50 && (
            <p className="px-4 py-2 text-xs text-muted">
              + อีก {forwarders.length - 50} รายการ — ดูเพิ่มในหน้า /admin/forwarders
            </p>
          )}
        </section>
      )}

      {/* cntname raw list (for searching specific cabinet) */}
      {cnt.cntName && (
        <details className="rounded-2xl border border-border bg-white dark:bg-surface p-5 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">
            cntname raw (comma-separated · จาก legacy)
          </summary>
          <p className="mt-3 font-mono text-[11px] break-words text-muted">{cnt.cntName}</p>
        </details>
      )}
    </main>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
