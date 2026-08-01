import "server-only";

/**
 * Allow-list sanitiser for article HTML written in the WYSIWYG editor
 * (ปอน 2026-08-01 — "อยากได้แบบเหมือน google doc จัดวางได้อิสระเลย").
 *
 * The body is authored by staff, but it is rendered on PUBLIC pages, so it is
 * still untrusted input: a compromised/mistaken admin, a paste from an external
 * site, or a future import must not be able to inject script/iframe/handlers.
 *
 * Run it on BOTH sides:
 *   • WRITE — in the save action, so the DB only ever holds clean HTML.
 *   • READ  — in the renderer, so anything already stored (or hand-edited in
 *             the DB) is cleaned before it reaches dangerouslySetInnerHTML.
 *
 * The allow-list is exactly what the editor can produce — nothing speculative.
 */
import sanitizeHtml from "sanitize-html";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr",
    "h2", "h3", "h4",
    "ul", "ol", "li",
    "blockquote",
    "strong", "b", "em", "i", "u", "s", "code", "pre",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    // `start` keeps "3." reading as 3 when a paragraph splits the list.
    ol: ["start"],
    img: ["src", "alt", "title", "width", "height"],
    // TextAlign writes style="text-align: …" onto the block it aligns.
    p: ["style"], h2: ["style"], h3: ["style"], h4: ["style"],
    th: ["colspan", "rowspan", "style"],
    td: ["colspan", "rowspan", "style"],
  },
  // Only alignment — never colour/size/position, which could be used to hide or
  // overlay content on a public page.
  allowedStyles: {
    "*": { "text-align": [/^(left|right|center|justify)$/] },
  },
  // http(s) for external, and root-relative for our own uploads. No data:/js:.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // An external link opened from our page must not keep a handle on it.
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const external = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: external
          ? { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" }
          : attribs,
      };
    },
  },
  // Drop the CONTENT of anything disallowed-and-dangerous rather than unwrapping
  // it as text (a <script> body would otherwise become visible page text).
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

/** Clean article HTML. Returns "" for empty/undefined input. */
export function sanitizeArticleHtml(html: string): string {
  const raw = (html ?? "").trim();
  if (!raw) return "";
  return sanitizeHtml(raw, OPTIONS);
}
