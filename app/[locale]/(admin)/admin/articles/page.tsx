import { Link } from "@/i18n/navigation";
import { Plus, FileText, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { SlipImage } from "@/components/admin/slip-image";
import { listCmsArticles } from "@/actions/admin/cms-articles";
import {
  CMS_CATEGORY_META, CMS_STATUS_LABEL, CMS_STATUSES,
  type CmsStatus,
} from "@/lib/validators/cms-article";

// Reads cms_articles via the service-role client on each request.
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<CmsStatus, string> = {
  draft:     "border-slate-300 bg-slate-100 text-slate-700",
  pending:   "border-amber-300 bg-amber-50 text-amber-700",
  published: "border-green-300 bg-green-50 text-green-700",
  rejected:  "border-rose-300 bg-rose-50 text-rose-700",
};

/** The public page a published article of this category lives on. */
function publicArticlePath(category: string, slug: string): string {
  if (category === "our_work") return `/our-work/${slug}`;
  if (category === "knowledge") return `/knowledge/${slug}`;
  if (category === "news") return `/news/${slug}`;
  return `/articles/${slug}`;
}

function fmt(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "2-digit", month: "short", day: "numeric" });
}

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // The content team: super + ultra + managers + sales/ops.
  await requireAdmin(["super", "ultra", "manager", "sales_admin", "sales", "ops"]);
  const sp = await searchParams;
  const statusFilter = (CMS_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;

  const res = await listCmsArticles({ status: statusFilter });
  const articles = res.ok ? (res.data?.articles ?? []) : [];
  const err = res.ok ? null : res.error;

  // Counts per status for the tab badges (from the unfiltered set when no filter).
  const allRes = statusFilter ? await listCmsArticles() : res;
  const all = allRes.ok ? (allRes.data?.articles ?? []) : [];
  const countByStatus = (s: CmsStatus) => all.filter((a) => a.status === s).length;

  const TABS: { key: string | undefined; label: string }[] = [
    { key: undefined, label: "ทั้งหมด" },
    ...CMS_STATUSES.map((s) => ({ key: s, label: CMS_STATUS_LABEL[s] })),
  ];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · CONTENT"
        title="เขียนบทความ"
        subtitle="เขียนบทความเองได้เลย — ส่งให้ Ultra Admin Z อนุมัติ แล้วขึ้นหน้าเว็บอัตโนมัติ (สาระน่ารู้ · ข่าวสาร · ผลงานของเรา)"
        actions={
          <Link href="/admin/articles/new" className="inline-flex items-center gap-1.5 rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-600">
            <Plus className="h-4 w-4" /> เขียนบทความใหม่
          </Link>
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const active = (t.key ?? "") === (statusFilter ?? "");
          const n = t.key ? countByStatus(t.key as CmsStatus) : all.length;
          return (
            <Link
              key={t.label}
              href={t.key ? `/admin/articles?status=${t.key}` : "/admin/articles"}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${active ? "border-primary-300 bg-primary-50 text-primary-700" : "border-border bg-white dark:bg-surface hover:bg-surface-alt"}`}
            >
              {t.label}
              {n > 0 ? <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-none ${active ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700"}`}>{n}</span> : null}
            </Link>
          );
        })}
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">โหลดรายการไม่สำเร็จ: {err}</div>
      ) : articles.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-alt/30 px-6 py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted" />
          <h2 className="mt-3 text-lg font-bold text-foreground">ยังไม่มีบทความ</h2>
          <p className="mt-1 text-sm text-muted">กด “เขียนบทความใหม่” เพื่อเริ่มเขียนบทความแรก</p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5">ปก</th>
                <th className="px-3 py-2.5">หัวข้อ</th>
                <th className="px-3 py-2.5">หมวด</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">อัปเดต</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-t border-border align-middle hover:bg-surface-alt/40">
                  <td className="px-3 py-2">
                    <div className="h-14 w-11 overflow-hidden rounded-md border border-border bg-surface-alt">
                      {a.coverUrl ? <SlipImage src={a.coverUrl} alt={a.title} className="h-full w-full object-cover" /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[360px]">
                    <Link href={`/admin/articles/${a.id}`} className="font-semibold text-foreground hover:text-primary-600 hover:underline line-clamp-2">
                      {a.title || "(ยังไม่มีหัวข้อ)"}
                    </Link>
                    {a.excerpt ? <p className="mt-0.5 text-[12px] text-muted line-clamp-1">{a.excerpt}</p> : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[12px]">
                    {CMS_CATEGORY_META[a.category as keyof typeof CMS_CATEGORY_META]?.label ?? a.category}
                    {a.subCategory ? <span className="text-muted"> · {a.subCategory}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[a.status]}`}>{CMS_STATUS_LABEL[a.status]}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[12px] text-muted">{fmt(a.updatedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/articles/${a.id}`} className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100">แก้ไข</Link>
                      {a.status === "published" && a.slug ? (
                        <a href={publicArticlePath(a.category, a.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-foreground hover:bg-surface-alt"><ExternalLink className="h-3 w-3" /> เว็บ</a>
                      ) : null}
                    </div>
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
