/**
 * /admin/forwarders/exceptions — คิวพัสดุมีปัญหา (gap G7 · เดฟ 2026-06-30)
 *
 * READ-ONLY queue of every ฝากนำเข้า (tb_forwarder) row with an OPEN exception
 * (fexception_status='open' · mig 0230). Surfaces ของแตก/ไม่ใช่ของลูกค้า/
 * ตู้ตีกลับ/ติดด่าน/PR สลับ that staff flagged on the detail page, so the team
 * sees what needs follow-up in one place. Each card is self-explaining (§0g):
 * type · owner+PR · tracking/container · note · photo thumb · opened-at · ≤1-click
 * to the detail page (where flag/resolve live).
 *
 * Gated ops/warehouse/super (same set that can flag/resolve). Pure read — this
 * page never mutates; the flag/resolve actions are on the detail page.
 *
 * Pattern source: /admin/qa/ownerless-goods (the closest analog tb_forwarder
 * exception queue).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { PageHeader } from "@/components/admin/page-header";
import { EXCEPTION_TYPE_LABEL, type ExceptionType } from "@/lib/admin/forwarder-exception-types";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const FETCH_CAP = 300;

const TYPE_BADGE: Record<ExceptionType, string> = {
  not_mine:           "bg-red-100 text-red-700 border-red-200",
  damaged:            "bg-orange-100 text-orange-700 border-orange-200",
  container_returned: "bg-purple-100 text-purple-700 border-purple-200",
  customs_held:       "bg-amber-100 text-amber-800 border-amber-200",
  wrong_pr:           "bg-rose-100 text-rose-700 border-rose-200",
  other:              "bg-slate-100 text-slate-700 border-slate-200",
};

type ExRow = {
  id: number;
  fidorco: string | null;
  userid: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  fexception_type: string | null;
  fexception_note: string | null;
  fexception_photo: string | null;
  fexception_at: string | null;
  fexception_by: string | null;
};

function asExceptionType(v: string | null): ExceptionType {
  if (v && v in EXCEPTION_TYPE_LABEL) return v as ExceptionType;
  return "other";
}

export default async function ForwarderExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "warehouse", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const { data, error, count } = await admin
    .from("tb_forwarder")
    .select(
      "id,fidorco,userid,ftrackingchn,fcabinetnumber," +
        "fexception_type,fexception_note,fexception_photo,fexception_at,fexception_by",
      { count: "exact" },
    )
    .eq("fexception_status", "open")
    .order("fexception_at", { ascending: false })
    .limit(FETCH_CAP);

  // 42703 = mig 0230 not applied yet — render an informative empty state, not 500.
  const migrationMissing =
    !!error && (error.code === "42703" || /fexception/i.test(error.message ?? ""));
  if (error && !migrationMissing) {
    console.error(`[forwarder exceptions] failed`, { code: error.code, message: error.message });
  }

  const rows = (data ?? []) as unknown as ExRow[];

  // Merge customer names (tb_users.userID == tb_forwarder.userid). One IN query.
  const userIds = [...new Set(rows.map((r) => (r.userid ?? "").trim()).filter(Boolean))];
  const nameByUser: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", userIds);
    if (uErr) {
      console.error(`[forwarder exceptions tb_users] failed`, { code: uErr.code, message: uErr.message });
    } else {
      for (const u of (users ?? []) as { userID: string; userName: string | null; userLastName: string | null }[]) {
        nameByUser[u.userID] = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim();
      }
    }
  }

  // Client-paginate the fetched window (the queue is small by nature).
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // Resolve photo thumbnails for the visible page only (signed URLs, 1h).
  const photoUrls = await Promise.all(
    pageRows.map((r) => (r.fexception_photo ? getSignedBucketUrl("slips", r.fexception_photo) : Promise.resolve(null))),
  );

  const total = count ?? rows.length;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <PageHeader
        eyebrow="ADMIN · ฝากนำเข้า"
        title="คิวพัสดุมีปัญหา"
        subtitle="พัสดุที่ทีมแจ้งว่ามีปัญหา (ของแตก/ไม่ใช่ของลูกค้า/ตู้ตีกลับ/ติดด่าน/PR สลับ) · รอดำเนินการ"
        badges={
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              total > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-surface-alt text-muted"
            }`}
          >
            {total} รายการ
          </span>
        }
        actions={
          <Link
            href="/admin/forwarders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ← กลับรายการฝากนำเข้า
          </Link>
        }
      />

      {migrationMissing && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ยังไม่ได้รัน migration 0230 (คอลัมน์ fexception_*) — คิวนี้จะแสดงข้อมูลหลังรัน migration แล้ว
        </div>
      )}
      {error && !migrationMissing && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center shadow-sm space-y-2">
          <div className="text-4xl" aria-hidden>✅</div>
          <p className="text-sm font-medium text-foreground">ไม่มีพัสดุที่มีปัญหารอดำเนินการ</p>
          <p className="text-[11px] text-muted">เมื่อทีมแจ้งปัญหาพัสดุจากหน้ารายละเอียดออเดอร์ จะมาแสดงที่นี่</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pageRows.map((r, i) => {
            const exType = asExceptionType(r.fexception_type);
            const owner = (r.userid ?? "").trim();
            const ownerName = nameByUser[owner] ?? "";
            const photoUrl = photoUrls[i];
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-border border-l-4 border-l-red-400 bg-white dark:bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {/* photo thumb (or icon) */}
                  {photoUrl ? (
                    <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl}
                        alt="รูปปัญหาพัสดุ"
                        className="h-16 w-16 rounded-lg border border-border object-cover"
                      />
                    </a>
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50">
                      <AlertTriangle className="h-6 w-6 text-red-500" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    {/* type + opened-at */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TYPE_BADGE[exType]}`}>
                        {EXCEPTION_TYPE_LABEL[exType]}
                      </span>
                      <span className="text-[11px] text-muted">
                        แจ้งเมื่อ {r.fexception_at ? formatThaiDateTime(r.fexception_at) : "—"}
                        {r.fexception_by ? ` · โดย ${r.fexception_by}` : ""}
                      </span>
                    </div>

                    {/* identity: order# · owner+PR · tracking/container */}
                    <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-sm">
                      <span className="font-semibold text-foreground">
                        ออเดอร์ #{r.fidorco ?? r.id}
                      </span>
                      <span className="text-muted">
                        ลูกค้า{" "}
                        <span className="font-medium text-foreground">
                          {ownerName ? `${ownerName} (${owner || "—"})` : owner || "ไม่มีเจ้าของ"}
                        </span>
                      </span>
                      {r.ftrackingchn && (
                        <span className="text-muted">
                          Track <span className="font-mono text-foreground">{r.ftrackingchn}</span>
                        </span>
                      )}
                      {r.fcabinetnumber && (
                        <span className="text-muted">
                          ตู้ <span className="font-mono text-foreground">{r.fcabinetnumber}</span>
                        </span>
                      )}
                    </div>

                    {/* note */}
                    {r.fexception_note && (
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">{r.fexception_note}</p>
                    )}
                  </div>

                  {/* next action — ≤1 click to the detail page (flag/resolve live there) */}
                  <Link
                    href={`/admin/forwarders/${r.id}`}
                    className="shrink-0 rounded-lg border border-primary-500 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
                  >
                    เปิดดู / จัดการ →
                  </Link>
                </div>
              </div>
            );
          })}

          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={rows.length}
            basePath="/admin/forwarders/exceptions"
          />
        </div>
      )}

      <p className="text-[11px] text-muted">
        gap G7 · บันทึก/ปิดเคส ทำที่หน้ารายละเอียดออเดอร์ (ปุ่ม “แจ้งปัญหาพัสดุ”) · การเปลี่ยนลูกค้า/ปรับบิล ใช้ปุ่มเดิม (ต้องบัญชี/owner เคาะ)
      </p>
    </main>
  );
}
