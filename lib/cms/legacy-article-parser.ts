/**
 * The LEGACY body dialect parser — extracted verbatim from
 * components/knowledge/article-content.tsx (owner 2026-06-23) so that BOTH the
 * old renderer and the one-off text→HTML migration read the same rules. Pure:
 * no React, no I/O.
 *
 * Dialect: emoji-led line = heading · "1." = numbered item (indented "-" lines
 * become its children) · "-" = bullet · a fully-quoted line = pull-quote ·
 * `![alt](url)` = image · a #hashtag-only line = tags.
 */

const EMOJI_HEAD = /^([\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}✅⚠️📞📲🚢✈️📦🛠️🆘🛑🚫🌍🇨🇳🚀🛳️💡🎯👉⏱⏰🔎🛒🇹🇭🏁📍⭐📂](?:[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE0F}️])*)\s*(.*)$/u;
const NUMBERED_RE = /^(\d+)\.\s+(.+)$/;
const SUB_BULLET_RE = /^[-•—●◦▪►▸]\s+/;
const CTA_LEAD_RE = /^(📲|🏁)/u;
// Inline image — a markdown `![alt](url)` line on its own (owner 2026-06-23 · CMS
// editor "แทรกรูปในเนื้อหา"). Additive: legacy bodies have no such lines.
const IMG_RE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/;

export type Block =
  | { kind: "h2"; emoji?: string; text: string }
  | { kind: "h3"; emoji?: string; text: string }
  | { kind: "list-item"; text: string; number: string; children: string[] }
  | { kind: "bullet-group"; items: string[] }
  | { kind: "callout"; text: string }
  | { kind: "lead"; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "cta"; text: string }
  | { kind: "image"; url: string; alt: string }
  | { kind: "tags"; tags: string[] };

// Strip editorial scaffolding / placeholders before display
function cleanLine(raw: string): string {
  return raw
    // remove "พาดหัว:" / "Title:" / "หัวข้อ:" prefixes after emoji
    .replace(/^พาดหัว\s*[::]\s*/i, "")
    .replace(/^หัวข้อ\s*[::]\s*/i, "")
    // strip [ปุ่ม: …] placeholders entirely
    .replace(/\[ปุ่ม[^\]]*\]/g, "")
    // replace [ชื่อแบรนด์…] type placeholders with brand
    .replace(/\[ชื่อแบรนด์[^\]]*\]/g, "Pacred Shipping")
    .replace(/\[บริษัท[^\]]*\]/g, "Pacred Shipping")
    // strip leftover surrounding double-quotes if entire line is wrapped
    .trim();
}

function looksLikeBullet(line: string): boolean {
  if (NUMBERED_RE.test(line)) return false;
  if (SUB_BULLET_RE.test(line)) return true;
  if (line.length < 100 && !/[.!?]$/.test(line)) return true;
  return false;
}

function isQuotedLine(line: string): boolean {
  // Thai "…" or ASCII "…" wrapping the entire line, length 25-200
  if (line.length < 20 || line.length > 240) return false;
  return (
    (line.startsWith("“") && line.endsWith("”")) || // “…”
    (line.startsWith("‟") && line.endsWith("„")) ||
    (line.startsWith('"') && line.endsWith('"')) ||
    (line.startsWith("'") && line.endsWith("'"))
  );
}

function stripQuotes(line: string): string {
  return line.replace(/^["“”'']+|["“”'']+$/g, "").trim();
}

export function parseArticle(text: string, title?: string): Block[] {
  const rawLines = text.split("\n").map((l) => l.trim());
  const lines: string[] = [];
  for (const l of rawLines) lines.push(l);

  const blocks: Block[] = [];
  const allTags: string[] = [];

  // First pass — find lead paragraph (first plain paragraph after possibly-skipped title)
  let leadCaptured = false;
  let titleSkipped = false;

  // Normalize comparison: lowercase + strip emoji/punctuation for title match
  const normalize = (s: string) =>
    s
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE0F}️]/gu, "")
      .replace(/[!?.,…"'“”‘’\s]/g, "")
      .toLowerCase();
  const titleNorm = title ? normalize(title) : "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line) {
      i++;
      continue;
    }

    // Inline image — markdown ![alt](url) on its own line (CMS · owner 2026-06-23)
    const imgMatch = line.match(IMG_RE);
    if (imgMatch) {
      blocks.push({ kind: "image", url: imgMatch[2], alt: imgMatch[1] || "" });
      i++;
      leadCaptured = true;
      continue;
    }

    // hashtag-only line → tags
    if (line.startsWith("#") && line.split(/\s+/).every((w) => w.startsWith("#"))) {
      allTags.push(...line.split(/\s+/).filter((t) => t.startsWith("#")));
      i++;
      continue;
    }

    // Callout (💡 / Pacred Tip)
    if (/^(Pacred Tip|💡 )/i.test(line)) {
      const cleaned = cleanLine(line);
      blocks.push({ kind: "callout", text: cleaned });
      i++;
      continue;
    }

    // Closing CTA line (📲 / 🏁)
    if (CTA_LEAD_RE.test(line)) {
      const cleaned = cleanLine(line).replace(/^(📲|🏁)\s*/u, "");
      if (cleaned) {
        blocks.push({ kind: "cta", text: cleaned });
      }
      i++;
      continue;
    }

    // Numbered list item
    const numberedMatch = line.match(NUMBERED_RE);
    if (numberedMatch) {
      const children: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (!next) break;
        if (NUMBERED_RE.test(next)) break;
        if (EMOJI_HEAD.test(next) && next.length < 80) break;
        if (looksLikeBullet(next)) {
          children.push(next.replace(SUB_BULLET_RE, ""));
          j++;
        } else {
          break;
        }
      }
      blocks.push({
        kind: "list-item",
        number: numberedMatch[1],
        text: cleanLine(numberedMatch[2]),
        children: children.map(cleanLine).filter(Boolean),
      });
      i = j;
      leadCaptured = true; // numbered list means we're past intro
      continue;
    }

    // Emoji-led heading
    const headMatch = line.match(EMOJI_HEAD);
    if (headMatch && headMatch[1] && headMatch[2]) {
      const emoji = headMatch[1];
      const rest = cleanLine(headMatch[2]);

      // If this matches article title — skip the first time
      if (!titleSkipped && titleNorm && normalize(rest) === titleNorm) {
        titleSkipped = true;
        i++;
        continue;
      }

      if (!rest) {
        i++;
        continue;
      }

      const isSubHeading = rest.length < 40;
      blocks.push({
        kind: isSubHeading ? "h3" : "h2",
        emoji,
        text: rest,
      });
      i++;
      leadCaptured = true;

      // If heading ends with : or ? — collect bullet group beneath
      if (rest.endsWith(":") || rest.endsWith("?")) {
        const items: string[] = [];
        while (i < lines.length) {
          const next = lines[i];
          if (!next) break;
          if (EMOJI_HEAD.test(next) && next.length < 80) break;
          if (NUMBERED_RE.test(next)) break;
          if (looksLikeBullet(next)) {
            items.push(cleanLine(next.replace(SUB_BULLET_RE, "")));
            i++;
          } else {
            break;
          }
        }
        if (items.length > 0) {
          blocks.push({ kind: "bullet-group", items });
        }
      }
      continue;
    }

    // Title-only line (no emoji) that matches article title — skip
    if (!titleSkipped && titleNorm && normalize(line) === titleNorm) {
      titleSkipped = true;
      i++;
      continue;
    }

    // Pull-quote (wrapped in quotes, standalone)
    if (isQuotedLine(line)) {
      blocks.push({ kind: "quote", text: stripQuotes(line) });
      i++;
      leadCaptured = true;
      continue;
    }

    // Lead = first non-trivial paragraph after title
    if (!leadCaptured && line.length > 40) {
      const cleaned = cleanLine(line);
      blocks.push({ kind: "lead", text: cleaned });
      leadCaptured = true;
      i++;
      continue;
    }

    // Default: paragraph
    blocks.push({ kind: "p", text: cleanLine(line) });
    i++;
  }

  if (allTags.length) blocks.push({ kind: "tags", tags: allTags });
  return blocks;
}
