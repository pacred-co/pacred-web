/**
 * One-way converter: the LEGACY plain-text body dialect → clean semantic HTML.
 *
 * Why (ปอน 2026-08-01): the body used to be plain text that a heuristic parser
 * re-interpreted into opinionated cards (rounded numbered boxes, gradient
 * callouts…). The author could not control the layout — the code guessed it. We
 * are moving to a Google-Docs-style WYSIWYG that stores HTML, so the author lays
 * the page out themselves.
 *
 * This runs BOTH:
 *   • once per article in the migration script (text → stored HTML), and
 *   • at read time as a fallback, so an un-migrated body never renders raw.
 *
 * It reuses `parseArticle` — the SAME rules the old renderer used — so a
 * converted article keeps exactly the content (and order) it showed before;
 * only the presentation drops from "cards" to plain document flow.
 *
 * Pure + dependency-free: safe in a script, a Server Component, or a test.
 */
import { parseArticle } from "@/lib/cms/legacy-article-parser";

/** Escape text destined for an HTML text node / attribute value. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Is this body already HTML (i.e. written in / migrated to the new editor)?
 *
 * Deliberately conservative — it looks for a BLOCK tag the editor emits, not any
 * "<". A legacy body that merely mentions "<" in prose must NOT be mistaken for
 * HTML, or it would render escaped-looking and lose its formatting.
 */
export function isHtmlBody(body: string): boolean {
  return /<(p|h[1-4]|ul|ol|li|blockquote|figure|img|table|pre|div)\b/i.test(body ?? "");
}

/**
 * `1.` items are emitted as one <ol>; this flushes the open run.
 *
 * A legacy article often writes "1." … paragraph … "2." … paragraph — the
 * paragraph between items closes the list, so without `start` every item would
 * render as "1." again. Carry the author's own number across the break.
 */
function flushOrderedRun(run: { n: string; html: string }[], out: string[]): void {
  if (run.length === 0) return;
  const first = Number(run[0].n);
  const startAttr = Number.isFinite(first) && first > 1 ? ` start="${first}"` : "";
  out.push(`<ol${startAttr}>${run.map((r) => r.html).join("")}</ol>`);
  run.length = 0;
}

/**
 * Convert a legacy body to HTML. `title` is used only to drop a duplicated
 * title line, exactly as the old renderer did.
 */
export function legacyBodyToHtml(text: string, title?: string): string {
  const blocks = parseArticle(text ?? "", title);
  const out: string[] = [];
  const orderedRun: { n: string; html: string }[] = [];

  for (const b of blocks) {
    // Any non-numbered block ends the current <ol>.
    if (b.kind !== "list-item") flushOrderedRun(orderedRun, out);

    switch (b.kind) {
      case "h2":
      case "h3": {
        const head = [b.emoji, b.text].filter(Boolean).join(" ").trim();
        out.push(`<${b.kind}>${esc(head)}</${b.kind}>`);
        break;
      }
      case "list-item": {
        const children = b.children.length
          ? `<ul>${b.children.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
          : "";
        orderedRun.push({ n: b.number, html: `<li>${esc(b.text)}${children}</li>` });
        break;
      }
      case "bullet-group":
        out.push(`<ul>${b.items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>`);
        break;
      // A callout / pull-quote both become a blockquote — the one piece of
      // "styling" worth keeping, because it is semantic (the author DID mark
      // this text as set apart), unlike the numbered cards which were guessed.
      case "callout":
      case "quote":
        out.push(`<blockquote><p>${esc(b.text)}</p></blockquote>`);
        break;
      case "lead":
        // The old renderer styled the first paragraph larger. Keep it a plain
        // paragraph — the author can make it stand out themselves now.
        out.push(`<p>${esc(b.text)}</p>`);
        break;
      case "cta":
        out.push(`<p><strong>${esc(b.text)}</strong></p>`);
        break;
      case "p":
        out.push(`<p>${esc(b.text)}</p>`);
        break;
      case "image":
        out.push(
          `<figure><img src="${esc(b.url)}" alt="${esc(b.alt)}" /></figure>`,
        );
        break;
      case "tags":
        out.push(`<p>${b.tags.map((t) => esc(t)).join(" ")}</p>`);
        break;
    }
  }

  flushOrderedRun(orderedRun, out);
  return out.join("\n");
}

/** Read-time helper: give me HTML for this body whatever format it is stored in. */
export function bodyAsHtml(body: string, title?: string): string {
  const raw = body ?? "";
  return isHtmlBody(raw) ? raw : legacyBodyToHtml(raw, title);
}
