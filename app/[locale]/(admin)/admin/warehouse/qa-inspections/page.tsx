/**
 * /admin/warehouse/qa-inspections — QA & QC inspection queue.
 *
 * P0 #2 rebuild on `tb_forwarder` spine (replaces the Wave 3D tombstone
 * that FK'd the retired cargo_shipments spine).
 *
 * Faithful to PCS_Cargo_Guidebook_TH.md L441-454:
 *   - List inspection rows with verdict chip (pass/fail/hold/fake_product)
 *   - Free-text search by f_no / cabinet / member_code / china tracking
 *   - "บันทึก QA ใหม่" CTA → /new
 *   - "Blacklist" badge on fake_product rows
 *   - Click row → /[id] detail
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  adminListQaInspections,
  type QaVerdict,
} from "@/actions/admin/qa-inspections";

export const dynamic = "force-dynamic";

type SP = {
  verdict?: string; // 'all' | QaVerdict
  q?:       string;
};

const VERDICT_FILTERS: Array<{ key: "all" | QaVerdict; bg: string }> = [
  { key: "all",          bg: "bg-gray-100 text-gray-700"     },
  { key: "pass",         bg: "bg-green-100 text-green-700"   },
  { key: "fail",         bg: "bg-amber-100 text-amber-700"   },
  { key: "hold",         bg: "bg-blue-100 text-blue-700"     },
  { key: "fake_product", bg: "bg-red-100 text-red-700"       },
];

function verdictBadge(v: QaVerdict, label: string): React.ReactNode {
  const cls =
    v === "pass"         ? "bg-green-100 text-green-700"
    : v === "fail"       ? "bg-amber-100 text-amber-700"
    : v === "hold"       ? "bg-blue-100 text-blue-700"
    : /* fake_product */   "bg-red-100 text-red-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default async function QaInspectionsListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "warehouse", "qa"]);
  const sp = await searchParams;
  const t = await getTranslations("qaInspection");

  const verdictParam = (sp.verdict ?? "all") as "all" | QaVerdict;
  const validVerdict =
    verdictParam === "all" || ["pass", "fail", "hold", "fake_product"].includes(verdictParam)
      ? verdictParam
      : "all";

  const res = await adminListQaInspections({
    verdict: validVerdict,
    q:       sp.q,
    limit:   500,
  });

  const rows = res.ok ? (res.data ?? []) : [];
  const error = res.ok ? null : res.error;

  // Count per-verdict tiles (for the filter strip).
  const counts: Record<"all" | QaVerdict, number> = {
    all:           rows.length,
    pass:          0,
    fail:          0,
    hold:          0,
    fake_product:  0,
  };
  // When a filter is active rows is already filtered — we still surface
  // the per-verdict counts of the loaded set for hover feedback.
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

  return (
    <main className="p-4 lg:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA</p>
          <h1 className="mt-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Link
          href="/admin/warehouse/qa-inspections/new"
          className="rounded-lg bg-primary-600 text-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-primary-700"
        >
          + {t("newCta")}
        </Link>
      </div>

      {/* Verdict filter strip */}
      <div className="flex flex-wrap gap-2">
        {VERDICT_FILTERS.map((f) => {
          const isActive = validVerdict === f.key;
          const c = counts[f.key];
          return (
            <Link
              key={f.key}
              href={buildHref({ verdict: f.key === "all" ? undefined : f.key, q: sp.q })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border ${
                isActive
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt"
              }`}
            >
              <span>{t(`verdict.${f.key}`)}</span>
              {c > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5 ${f.bg}`}>
                  {c}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <form method="GET" action="/admin/warehouse/qa-inspections" className="flex flex-wrap gap-2 items-center">
        {validVerdict !== "all" && <input type="hidden" name="verdict" value={validVerdict} />}
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm w-72"
        />
        <button
          type="submit"
          className="rounded-md border border-primary-500 bg-primary-500 text-white px-3 py-1.5 text-sm font-medium hover:bg-primary-600"
        >
          {t("searchSubmit")}
        </button>
        {sp.q && (
          <Link
            href={buildHref({ verdict: validVerdict === "all" ? undefined : validVerdict })}
            className="text-xs text-muted hover:text-foreground underline"
          >
            {t("clearSearch")}
          </Link>
        )}
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t("loadError")}: {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center text-sm text-muted">
          {t("emptyState")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">{t("col.inspectedAt")}</th>
                <th className="px-3 py-2 text-left">{t("col.fNo")}</th>
                <th className="px-3 py-2 text-left">{t("col.cabinet")}</th>
                <th className="px-3 py-2 text-left">{t("col.member")}</th>
                <th className="px-3 py-2 text-left">{t("col.tracking")}</th>
                <th className="px-3 py-2 text-center">{t("col.verdict")}</th>
                <th className="px-3 py-2 text-center">{t("col.blacklist")}</th>
                <th className="px-3 py-2 text-right">{t("col.photos")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2 text-xs">
                    <Link href={`/admin/warehouse/qa-inspections/${r.id}`} className="text-primary-600 hover:underline">
                      {r.inspected_at.slice(0, 16).replace("T", " ")}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.forwarder_id}</td>
                  <td className="px-3 py-2 text-xs">{r.fwd_fcabinetnumber ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{r.fwd_userid ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.fwd_ftrackingchn ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {verdictBadge(r.verdict, t(`verdict.${r.verdict}`))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.blacklist_shop ? (
                      <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold">
                        {t("blacklistTag")}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {r.photo_urls.length > 0 ? r.photo_urls.length : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function buildHref(opts: { verdict?: string; q?: string }): string {
  const p = new URLSearchParams();
  if (opts.verdict) p.set("verdict", opts.verdict);
  if (opts.q)       p.set("q",       opts.q);
  return `/admin/warehouse/qa-inspections${p.toString() ? `?${p.toString()}` : ""}`;
}
