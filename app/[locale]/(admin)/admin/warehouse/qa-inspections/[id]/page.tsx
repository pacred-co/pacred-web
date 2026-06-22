/**
 * /admin/warehouse/qa-inspections/[id] — QA inspection detail.
 *
 * Server-rendered detail page. Photo gallery uses signed URLs (member-docs
 * is private). Update form patches verdict / notes / blacklist via the
 * `adminUpdateQaInspection` action.
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  adminGetQaInspection,
  adminQaPhotoSignedUrls,
} from "@/actions/admin/qa-inspections";
import type { QaVerdict } from "@/lib/validators/qa-inspection-rebuilt";
import { UpdateInspectionForm } from "./update-inspection-form";

export const dynamic = "force-dynamic";

function verdictChipCls(v: QaVerdict): string {
  return v === "pass"         ? "bg-green-100 text-green-700"
       : v === "fail"         ? "bg-amber-100 text-amber-700"
       : v === "hold"         ? "bg-blue-100 text-blue-700"
       : /* fake_product */     "bg-red-100 text-red-700";
}

export default async function QaInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "ops", "warehouse", "qa"]);
  const { id } = await params;
  const t = await getTranslations("qaInspection");

  const detailRes = await adminGetQaInspection(id);
  if (!detailRes.ok) {
    return (
      <main className="p-6 lg:p-8 max-w-3xl">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t("loadError")}: {detailRes.error}
        </div>
      </main>
    );
  }
  const row = detailRes.data;
  if (!row) notFound();

  // Signed URLs for the photo gallery (member-docs is private).
  const urlsRes = await adminQaPhotoSignedUrls(row.photo_urls, 600);
  const urlMap = urlsRes.ok ? (urlsRes.data ?? {}) : {};

  return (
    <main className="p-4 lg:p-6 space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA</p>
          <h1 className="mt-1 text-2xl font-bold">
            {t("detailTitle")} <span className="font-mono text-base text-muted">{row.id.slice(0, 8)}</span>
          </h1>
          <p className="text-sm text-muted">
            {t("col.inspectedAt")}: {row.inspected_at.slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <Link
          href="/admin/warehouse/qa-inspections"
          className="text-sm text-muted hover:text-foreground underline"
        >
          ← {t("backToList")}
        </Link>
      </div>

      {/* Forwarder reference */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">{t("forwarderSection")}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">{t("col.fNo")}</dt>
            <dd className="font-mono">
              <Link
                href={`/admin/forwarders/${row.forwarder_id}`}
                className="text-primary-600 hover:underline"
              >
                {row.forwarder_id}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("col.cabinet")}</dt>
            <dd>{row.fwd_fcabinetnumber ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("col.member")}</dt>
            <dd>{row.fwd_userid ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("col.tracking")}</dt>
            <dd className="font-mono">{row.fwd_ftrackingchn ?? "-"}</dd>
          </div>
        </dl>
      </section>

      {/* Current state */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">{t("currentState")}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${verdictChipCls(row.verdict)}`}>
            {t(`verdict.${row.verdict}`)}
          </span>
          {row.blacklist_shop && (
            <span className="inline-block rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-bold">
              {t("blacklistTag")}
            </span>
          )}
        </div>
        {row.notes && (
          <div className="mt-3 text-sm whitespace-pre-wrap">{row.notes}</div>
        )}
      </section>

      {/* Photo gallery */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">{t("photoGallery")} ({row.photo_urls.length})</h2>
        {row.photo_urls.length === 0 ? (
          <p className="text-sm text-muted">{t("noPhotos")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {row.photo_urls.map((p) => {
              const url = urlMap[p];
              return (
                <a
                  key={p}
                  href={url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden border border-border bg-surface-alt aspect-square hover:opacity-90"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={t("photoAlt")} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] text-muted">
                      {t("photoUnavailable")}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Update form */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">{t("updateSection")}</h2>
        <UpdateInspectionForm
          id={row.id}
          initialVerdict={row.verdict}
          initialNotes={row.notes ?? ""}
          initialBlacklist={row.blacklist_shop}
        />
      </section>
    </main>
  );
}
