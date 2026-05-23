import { type ReactNode } from "react";
import { MessageCircle, Phone, ArrowRight, Quote } from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";
const HOTLINE = "066-131-0253";

const EMOJI_HEAD = /^([\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}✅⚠️📞📲🚢✈️📦🛠️🆘🛑🚫🌍🇨🇳🚀🛳️💡🎯👉⏱⏰🔎🛒🇹🇭🏁📍⭐📂](?:[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE0F}️])*)\s*(.*)$/u;
const NUMBERED_RE = /^(\d+)\.\s+(.+)$/;
const SUB_BULLET_RE = /^[-•—●◦▪►▸]\s+/;
const CTA_LEAD_RE = /^(📲|🏁)/u;

type Block =
  | { kind: "h2"; emoji?: string; text: string }
  | { kind: "h3"; emoji?: string; text: string }
  | { kind: "list-item"; text: string; number: string; children: string[] }
  | { kind: "bullet-group"; items: string[] }
  | { kind: "callout"; text: string }
  | { kind: "lead"; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "cta"; text: string }
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

function parseArticle(text: string, title?: string): Block[] {
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

export function ArticleContent({ text, title }: { text: string; title?: string }) {
  const blocks = parseArticle(text, title);

  const elements: ReactNode[] = blocks.map((b, i) => {
    if (b.kind === "h2") {
      return (
        <h2
          key={i}
          className="mt-10 md:mt-12 mb-3 md:mb-4 flex items-start gap-3 scroll-mt-24"
        >
          {b.emoji && (
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary-500/15 to-primary-700/15 border border-primary-200/70 dark:border-primary-900/40 text-[18px] md:text-[20px] leading-none translate-y-[1px]"
            >
              {b.emoji}
            </span>
          )}
          <span className="flex-1 text-[19px] md:text-[26px] font-black leading-[1.25] tracking-tight text-[#111827] dark:text-white">
            {b.text}
          </span>
        </h2>
      );
    }
    if (b.kind === "h3") {
      return (
        <h3
          key={i}
          className="mt-7 md:mt-9 mb-2 md:mb-3 flex items-center gap-2.5 scroll-mt-24"
        >
          {b.emoji && (
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-[15px] md:text-[16px] leading-none"
            >
              {b.emoji}
            </span>
          )}
          <span className="flex-1 text-[16px] md:text-[19px] font-black leading-[1.3] tracking-tight text-[#111827] dark:text-white">
            {b.text}
          </span>
        </h3>
      );
    }
    if (b.kind === "lead") {
      return (
        <p
          key={i}
          className="mt-1 mb-6 md:mb-8 pl-4 md:pl-5 border-l-[3px] border-primary-500 text-[15px] md:text-[18px] leading-[1.7] md:leading-[1.75] text-[#374151] dark:text-white/90 font-medium tracking-[-0.005em]"
        >
          {b.text}
        </p>
      );
    }
    if (b.kind === "bullet-group") {
      return (
        <ul key={i} className="my-3 md:my-4 space-y-2 md:space-y-2.5">
          {b.items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-3">
              <span
                aria-hidden
                className="shrink-0 mt-[10px] md:mt-[11px] w-2 h-2 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shadow-[0_2px_4px_rgba(179,0,0,0.30)]"
              />
              <span className="flex-1 text-[14.5px] md:text-[15.5px] leading-[1.7] text-[#374151] dark:text-white/85">
                {item}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    if (b.kind === "list-item") {
      return (
        <div
          key={i}
          className="my-4 md:my-5 rounded-2xl border border-border bg-gradient-to-br from-white to-surface/60 dark:from-surface dark:to-surface-alt/60 p-3.5 md:p-5 shadow-[0_3px_10px_rgba(15,23,42,0.04)] hover:border-primary-200 dark:hover:border-primary-900/60 transition-colors"
        >
          <div className="flex items-start gap-3 md:gap-4">
            <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[14px] md:text-[16px] font-black shadow-[0_6px_14px_rgba(179,0,0,0.25)] tabular-nums">
              {b.number}
            </span>
            <p className="flex-1 text-[15px] md:text-[17px] leading-[1.5] md:leading-[1.55] text-[#111827] dark:text-white font-black tracking-tight pt-1 md:pt-1.5">
              {b.text}
            </p>
          </div>
          {b.children.length > 0 && (
            <ul className="mt-2.5 md:mt-3 ml-12 md:ml-14 space-y-1.5 md:space-y-2 border-l-2 border-primary-100 dark:border-primary-900/40 pl-3 md:pl-4">
              {b.children.map((c, ci) => (
                <li key={ci} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="shrink-0 mt-[8px] md:mt-[9px] w-1.5 h-1.5 rounded-full bg-primary-400"
                  />
                  <span className="flex-1 text-[13.5px] md:text-[14.5px] leading-[1.65] md:leading-[1.7] text-[#4b5563] dark:text-white/75">
                    {c}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (b.kind === "callout") {
      const cleaned = b.text.replace(/^Pacred Tip\s*[::]\s*/i, "").replace(/^💡\s*/u, "");
      return (
        <aside
          key={i}
          className="my-6 md:my-7 relative overflow-hidden rounded-2xl border border-primary-200 dark:border-primary-900/60 bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-950/30 dark:via-surface dark:to-primary-950/10 p-4 md:p-5 shadow-[0_6px_18px_rgba(179,0,0,0.08)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-gradient-to-r from-transparent via-primary-200/40 to-transparent dark:via-primary-700/20"
          />
          <div className="relative flex items-start gap-3">
            <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-400 text-primary-800 text-[16px] leading-none shadow-[0_4px_10px_rgba(0,0,0,0.10)]">
              💡
            </span>
            <div className="flex-1">
              <div className="text-[10.5px] md:text-[11px] font-black text-primary-600 tracking-[0.16em] uppercase mb-0.5">
                Pacred Tip
              </div>
              <p className="text-[14px] md:text-[15.5px] leading-[1.65] md:leading-[1.7] font-bold text-[#111827] dark:text-white">
                {cleaned}
              </p>
            </div>
          </div>
        </aside>
      );
    }
    if (b.kind === "quote") {
      return (
        <blockquote
          key={i}
          className="my-7 md:my-9 relative pl-6 md:pl-8 pr-3 md:pr-4 py-2 md:py-3"
        >
          <Quote
            aria-hidden
            className="absolute left-0 top-0 w-6 h-6 md:w-7 md:h-7 text-primary-600/70 -scale-x-100"
            strokeWidth={2.4}
            fill="currentColor"
          />
          <p className="text-[16px] md:text-[20px] leading-[1.55] md:leading-[1.5] font-black text-[#111827] dark:text-white tracking-tight italic">
            {b.text}
          </p>
        </blockquote>
      );
    }
    if (b.kind === "cta") {
      return (
        <aside
          key={i}
          className="my-8 md:my-10 relative overflow-hidden rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-900/60 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white p-4 md:p-6 shadow-[0_18px_40px_rgba(179,0,0,0.30)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "16px 16px",
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 text-[10.5px] md:text-[11px] font-black tracking-[0.14em] uppercase backdrop-blur-sm mb-1.5">
                Pacred Shipping
              </div>
              <p className="text-[14.5px] md:text-[17px] leading-[1.55] md:leading-[1.55] font-black text-white tracking-tight">
                {b.text}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row md:flex-row gap-2 md:gap-2.5 shrink-0">
              <TrackedExternalLink
                href={LINE_URL}
                cta="line_consult"
                surface="article_content"
                className="inline-flex items-center justify-center gap-1.5 h-10 md:h-11 px-4 rounded-xl bg-white text-primary-700 text-[12.5px] md:text-[13.5px] font-black hover:bg-yellow-50 transition-colors shadow-[0_8px_18px_rgba(255,255,255,0.15)]"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.6} fill="currentColor" />
                ทักไลน์
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
              </TrackedExternalLink>
              <a
                href={`tel:${HOTLINE.replace(/-/g, "")}`}
                className="inline-flex items-center justify-center gap-1.5 h-10 md:h-11 px-4 rounded-xl bg-white/10 text-white text-[12.5px] md:text-[13.5px] font-black border border-white/25 hover:bg-white/20 hover:border-white/45 transition-colors backdrop-blur-sm"
              >
                <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                {HOTLINE}
              </a>
            </div>
          </div>
        </aside>
      );
    }
    if (b.kind === "tags") {
      return (
        <div
          key={i}
          className="mt-10 md:mt-12 pt-5 md:pt-6 border-t border-border"
        >
          <div className="text-[10.5px] font-black text-muted tracking-[0.16em] uppercase mb-2.5">
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {b.tags.map((t, ti) => (
              <span
                key={ti}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface dark:bg-surface-alt text-[#374151] dark:text-white/80 text-[11px] md:text-[11.5px] font-bold border border-border hover:border-primary-300 hover:text-primary-700 dark:hover:text-primary-300 transition-colors cursor-default"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      );
    }
    return (
      <p
        key={i}
        className="my-3 md:my-3.5 text-[14.5px] md:text-[16px] leading-[1.75] md:leading-[1.8] text-[#374151] dark:text-white/85"
      >
        {b.text}
      </p>
    );
  });

  return <div className="article-content max-w-none">{elements}</div>;
}
