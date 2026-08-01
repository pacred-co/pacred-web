import { bodyAsHtml } from "@/lib/cms/legacy-body-to-html";
import { sanitizeArticleHtml } from "@/lib/cms/sanitize-article-html";

/**
 * Renders a knowledge / news article body as a plain DOCUMENT — the layout the
 * author laid out in the WYSIWYG editor, nothing added, nothing guessed.
 *
 * Replaces <ArticleContent> on those two categories (ปอน 2026-08-01: the old
 * renderer turned "1." into a rounded numbered card, an emoji line into a badge
 * heading, etc. — the author could not control the page). <ArticleContent>
 * stays in use for our_work case studies, which keep their card layout.
 *
 * A body written before the switch is still plain text; `bodyAsHtml` converts it
 * on the fly with the SAME rules the old renderer used, so an un-migrated (or
 * static, non-CMS) article never renders raw. Everything is sanitised at read
 * time too — see lib/cms/sanitize-article-html.ts.
 *
 * Typography lives in the `.article-doc` block in app/globals.css.
 */
export function ArticleHtml({ text, title }: { text: string; title?: string }) {
  const html = sanitizeArticleHtml(bodyAsHtml(text ?? "", title));
  if (!html) return null;
  return <div className="article-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
