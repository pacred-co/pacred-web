import { Eye, PencilLine } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CMS_STATUS_LABEL } from "@/lib/validators/cms-article";

/**
 * "You are looking at a PREVIEW" bar for the public article routes.
 *
 * Only ever rendered when a content-team admin resolved an unpublished article
 * through the preview path in lib/cms/articles.ts — a real visitor still gets a
 * 404, so this bar existing on screen already means "admin + not live".
 *
 * It has to be loud: the whole point is that the author does NOT walk away
 * thinking the article is on the website when it is still waiting for approval
 * (the exact confusion behind the ปอน 2026-08-01 "กดดูขึ้น 404" report).
 */
export function UnpublishedPreviewBanner({
  status,
  articleId,
}: {
  /** The row's cms_articles.status — "published" renders nothing. */
  status: string;
  /** Deep-link back to the editor so a fix is one click away. */
  articleId: number;
}) {
  if (status === "published") return null;

  const label =
    CMS_STATUS_LABEL[status as keyof typeof CMS_STATUS_LABEL] ?? status;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-900/70 dark:text-amber-100 print:hidden">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1.5 px-[14px] py-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          ตัวอย่างเท่านั้น — ยังไม่ขึ้นเว็บ
        </span>
        <span className="inline-flex items-center rounded-full border border-amber-400 bg-white/70 px-2 py-0.5 text-[12px] font-bold dark:border-amber-600 dark:bg-amber-950/60">
          สถานะ: {label}
        </span>
        <span className="text-[13px] leading-snug">
          คนทั่วไปเปิดลิงก์นี้จะเห็น 404 · จะขึ้นเว็บจริงต่อเมื่อ Ultra Admin Z กดอนุมัติ
        </span>
        <Link
          href={`/admin/articles/${articleId}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-white px-2.5 py-1 text-[12px] font-bold text-amber-900 hover:bg-amber-50 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden /> กลับไปแก้ไข
        </Link>
      </div>
    </div>
  );
}
