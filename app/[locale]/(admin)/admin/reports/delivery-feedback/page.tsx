/**
 * /admin/reports/delivery-feedback — customer delivery-feedback rollup.
 *
 * Phase 4a · ops-workflow audit 2026-06-05 §32 (handoff brief 2026-06-08).
 *
 * Reads the `delivery_feedback` table (migration 0149) — one row per
 * delivered tb_forwarder where the customer left a rating, comment, or
 * photo. Joins customer name (tb_users) + tracking + delivery date
 * (tb_forwarder) for context.
 *
 * Filters:
 *   - rating_min  ∈ 1..5  — only feedback ≥ this star count
 *   - date_from / date_to — by feedback created_at
 *
 * Renders:
 *   - 4 stat cards (count · avg rating · count by 5★/4★/etc · photos %)
 *   - Per-row table: customer · forwarder # · ดาว · comment · 📷 · วันที่
 *   - Photo thumb opens signed URL in a new tab
 *   - CSV export of the current view
 *
 * Access: ops · super · sales_admin · accounting (mirrors the rest of /admin/reports).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { Star, Camera } from "lucide-react";

export const dynamic = "force-dynamic";

type SP = {
  rating_min?: string;
  date_from?: string;
  date_to?: string;
};

type FeedbackRow = {
  id: number;
  fid: number;
  userid: string;
  rating: number | null;
  comment: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
};

type LegacyUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userCompany: string | null;
};

type Forwarder = {
  id: number;
  ftrackingth: string | null;
  ftrackingchn: string | null;
  fdatestatus7: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Juristic-aware customer display: นิติบุคคล customers show the company name
// (not the contact person) when a tb_corporate name is present. `corpNames` =
// batched Map<userid, corporatename> (fetchCorporateNameMap · no N+1).
function userDisplayName(u: LegacyUser | null | undefined, corpNames?: Map<string, string>): string {
  if (!u) return "—";
  const name = resolveBillingIdentity({
    userCompany: u.userCompany,
    userName: u.userName,
    userLastName: u.userLastName,
    corp: corpRowFromName(corpNames?.get(u.userID)),
  }).name;
  return name || "—";
}

function clampRatingMin(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.floor(n);
}

export default async function AdminDeliveryFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Mirrors the gate on /admin/reports (the hub) — ops/super/sales_admin/accounting.
  await requireAdmin(["ops", "accounting", "sales_admin"]);

  const sp = await searchParams;
  const ratingMin = clampRatingMin(sp.rating_min);
  const dateFrom = sp.date_from;
  const dateTo = sp.date_to;

  const admin = createAdminClient();

  // ── 1) feedback rows (filtered) ──
  let q = admin
    .from("delivery_feedback")
    .select("id, fid, userid, rating, comment, photo_path, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (ratingMin !== null) q = q.gte("rating", ratingMin);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
  const { data: feedbackRaw, error: feedbackErr } = await q;
  if (feedbackErr) {
    console.error("[admin delivery-feedback list] failed", {
      code: feedbackErr.code,
      message: feedbackErr.message,
    });
  }
  const feedback = (feedbackRaw ?? []) as FeedbackRow[];

  // ── 2) batch-join tb_users for customer name + tb_forwarder for tracking ──
  const userIds = Array.from(new Set(feedback.map((r) => r.userid).filter(Boolean)));
  const fids = Array.from(new Set(feedback.map((r) => r.fid)));

  const [usersRes, fwdsRes] = await Promise.all([
    userIds.length > 0
      ? admin
          .from("tb_users")
          .select("userID, userName, userLastName, userTel, userCompany")
          .in("userID", userIds)
      : Promise.resolve({ data: [] as LegacyUser[], error: null }),
    fids.length > 0
      ? admin
          .from("tb_forwarder")
          .select("id, ftrackingth, ftrackingchn, fdatestatus7")
          .in("id", fids)
      : Promise.resolve({ data: [] as Forwarder[], error: null }),
  ]);
  if (usersRes.error) {
    console.error("[admin delivery-feedback users join] failed", {
      code: usersRes.error.code,
      message: usersRes.error.message,
    });
  }
  if (fwdsRes.error) {
    console.error("[admin delivery-feedback fwds join] failed", {
      code: fwdsRes.error.code,
      message: fwdsRes.error.message,
    });
  }
  const usersById = new Map<string, LegacyUser>();
  for (const u of (usersRes.data ?? []) as LegacyUser[]) {
    usersById.set(u.userID, u);
  }
  // Juristic display: batched tb_corporate name lookup (no N+1) so นิติบุคคล
  // customers show the company name, not the contact person.
  const corpNames = await fetchCorporateNameMap(admin, userIds);
  const fwdsById = new Map<number, Forwarder>();
  for (const f of (fwdsRes.data ?? []) as Forwarder[]) {
    fwdsById.set(f.id, f);
  }

  // ── 3) signed URLs for photos (batched, 10-min expiry) ──
  const photoPaths = feedback
    .map((r) => r.photo_path)
    .filter((p): p is string => !!p);
  const photoUrls = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed, error: signErr } = await admin.storage
      .from("slips")
      .createSignedUrls(photoPaths, 60 * 10);
    if (signErr) {
      console.error("[admin delivery-feedback signedUrls] failed", {
        message: signErr.message,
      });
    } else {
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) photoUrls.set(item.path, item.signedUrl);
      }
    }
  }

  // ── 4) stats ──
  const total = feedback.length;
  const withRating = feedback.filter((r) => r.rating !== null);
  const avgRating =
    withRating.length > 0
      ? withRating.reduce((s, r) => s + (r.rating ?? 0), 0) / withRating.length
      : 0;
  const ratingBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of withRating) {
    if (r.rating !== null) ratingBreakdown[r.rating] = (ratingBreakdown[r.rating] ?? 0) + 1;
  }
  const withPhotoPct = total > 0 ? (photoPaths.length / total) * 100 : 0;
  const withCommentCnt = feedback.filter(
    (r) => r.comment && r.comment.trim().length > 0,
  ).length;

  // ── 5) CSV rows ──
  const csvRows: CsvRow[] = feedback.map((r) => {
    const u = usersById.get(r.userid);
    const f = fwdsById.get(r.fid);
    return {
      created_at: fmtDate(r.created_at),
      userid: r.userid,
      customer_name: userDisplayName(u, corpNames),
      phone: u?.userTel ?? "",
      forwarder_id: r.fid,
      tracking_th: f?.ftrackingth ?? "",
      tracking_chn: f?.ftrackingchn ?? "",
      delivered_at: fmtDate(f?.fdatestatus7 ?? null),
      rating: r.rating ?? "",
      has_photo: r.photo_path ? "yes" : "no",
      comment: r.comment ?? "",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · REPORT</p>
          <h1 className="mt-1 text-2xl font-bold">📝 Feedback การจัดส่ง (Phase 4a)</h1>
          <p className="text-sm text-muted mt-0.5">
            ลูกค้าให้คะแนน · ความคิดเห็น · รูปประกอบ หลังสถานะ ส่งแล้ว (fstatus=7)
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
            cols={[
              { key: "created_at",     label: "วันที่ส่ง feedback" },
              { key: "userid",         label: "รหัสลูกค้า" },
              { key: "customer_name",  label: "ชื่อ" },
              { key: "phone",          label: "เบอร์" },
              { key: "forwarder_id",   label: "Forwarder #" },
              { key: "tracking_th",    label: "Tracking TH" },
              { key: "tracking_chn",   label: "Tracking CN" },
              { key: "delivered_at",   label: "วันที่ส่งสินค้า" },
              { key: "rating",         label: "ดาว" },
              { key: "has_photo",      label: "มีรูป" },
              { key: "comment",        label: "ความเห็น" },
            ]}
            filename={`delivery-feedback-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        </div>
      </header>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="จำนวน feedback" value={String(total)} />
        <StatCard
          label="ค่าเฉลี่ยดาว"
          value={
            withRating.length > 0
              ? `${avgRating.toFixed(2)} ★ (${withRating.length} เรท)`
              : "—"
          }
          tone={avgRating >= 4 ? "green" : avgRating >= 3 ? "amber" : "red"}
        />
        <StatCard
          label="แนบรูป"
          value={`${photoPaths.length} (${withPhotoPct.toFixed(0)}%)`}
        />
        <StatCard label="มีความเห็น" value={String(withCommentCnt)} />
      </div>

      {/* Rating breakdown chips */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">กระจาย:</span>
          {[5, 4, 3, 2, 1].map((star) => (
            <Link
              key={star}
              href={`/admin/reports/delivery-feedback?rating_min=${star}${dateFrom ? `&date_from=${dateFrom}` : ""}${dateTo ? `&date_to=${dateTo}` : ""}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:shadow-sm ${
                ratingMin === star
                  ? "border-amber-400 bg-amber-100 text-amber-800"
                  : "border-border bg-white text-foreground hover:bg-surface-alt"
              }`}
            >
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
              {star}★ : {ratingBreakdown[star] ?? 0}
            </Link>
          ))}
          {ratingMin !== null && (
            <Link
              href={`/admin/reports/delivery-feedback${dateFrom || dateTo ? `?${dateFrom ? `date_from=${dateFrom}` : ""}${dateFrom && dateTo ? "&" : ""}${dateTo ? `date_to=${dateTo}` : ""}` : ""}`}
              className="text-xs text-muted hover:underline"
            >
              ล้าง
            </Link>
          )}
        </div>
      )}

      {/* Date filter (no tab key — this is a single-view report) */}
      <Suspense>
        <AdminDateFilter dateFrom={dateFrom} dateTo={dateTo} />
      </Suspense>

      {/* Active filter banner */}
      {(ratingMin !== null || dateFrom || dateTo) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          กรองอยู่:
          {ratingMin !== null && <> ดาว ≥ {ratingMin} ·</>}
          {dateFrom && <> ตั้งแต่ {new Date(dateFrom).toLocaleDateString("th-TH")} ·</>}
          {dateTo && <> ถึง {new Date(dateTo).toLocaleDateString("th-TH")}</>}
        </div>
      )}

      {/* Table */}
      <section className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface scrollbar-x-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-alt/60 text-left">
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">ลูกค้า</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Forwarder</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">ดาว</th>
              <th className="px-3 py-2.5 font-semibold">ความเห็น</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">รูป</th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">วันที่</th>
            </tr>
          </thead>
          <tbody>
            {feedback.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted">
                  ไม่พบ feedback ในเงื่อนไขนี้
                </td>
              </tr>
            )}
            {feedback.map((r) => {
              const u = usersById.get(r.userid);
              const f = fwdsById.get(r.fid);
              const photoUrl = r.photo_path ? photoUrls.get(r.photo_path) : undefined;
              return (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/40 align-top">
                  <td className="px-3 py-3 text-xs">
                    <CustomerCodeLink code={r.userid} className="text-xs" />
                    <div>{userDisplayName(u, corpNames)}</div>
                    {u?.userTel && <div className="text-muted">{u.userTel}</div>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <Link
                      href={`/admin/forwarders/${r.fid}`}
                      className="text-primary-600 font-mono hover:underline"
                    >
                      #{r.fid}
                    </Link>
                    {f?.ftrackingth && <div className="text-muted">TH: {f.ftrackingth}</div>}
                    {f?.ftrackingchn && <div className="text-muted">CN: {f.ftrackingchn}</div>}
                    {f?.fdatestatus7 && (
                      <div className="text-[11px] text-muted">
                        ส่งเมื่อ {fmtDate(f.fdatestatus7)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.rating !== null ? (
                      <span className="inline-flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`size-3.5 ${
                              r.rating !== null && n <= r.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted"
                            }`}
                            aria-hidden
                          />
                        ))}
                        <span className="ml-1 text-[11px] text-muted">{r.rating}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs max-w-md">
                    {r.comment ? (
                      <p className="whitespace-pre-wrap break-words text-foreground">
                        {r.comment}
                      </p>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.photo_path ? (
                      photoUrl ? (
                        <a
                          href={photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                        >
                          <Camera className="size-3.5" aria-hidden />
                          ดูรูป
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <Camera className="size-3.5" aria-hidden />
                          มี (URL หมดอายุ)
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[11px] text-muted whitespace-nowrap">
                    {fmtDate(r.created_at)}
                    {r.updated_at !== r.created_at && (
                      <div className="text-[11px]">
                        แก้ไข {fmtDate(r.updated_at)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-muted">
        แสดงสูงสุด 500 รายการ · ใช้ filter (ดาว / ช่วงวันที่) เพื่อแคบลง
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
  tone?: "green" | "amber" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/60 text-amber-900"
        : tone === "red"
          ? "border-red-200 bg-red-50/60 text-red-900"
          : "border-border bg-white dark:bg-surface text-foreground";
  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}
