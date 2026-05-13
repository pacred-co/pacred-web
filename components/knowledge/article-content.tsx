import { type ReactNode } from "react";

const EMOJI_HEADING_REGEX =
  /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}✅⚠️📞📲🚢✈️📦🛠️🆘🛑🚫🌍🇨🇳🚀🛳️💡🎯👉⏱🔎🛒🇹🇭]/u;

const NUMBERED_RE = /^(\d+)\.\s+(.+)$/;
const SUB_BULLET_RE = /^[-•—]\s+/;

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "list-item"; text: string; number: string; children: string[] }
  | { kind: "bullet-group"; items: string[] }
  | { kind: "callout"; text: string }
  | { kind: "p"; text: string }
  | { kind: "tags"; tags: string[] };

// Heuristic: ดู line ว่าน่าจะเป็น bullet (สั้น, ไม่มีจุดท้าย) หรือ paragraph
function looksLikeBullet(line: string): boolean {
  // ถ้าขึ้นต้นด้วยตัวเลข+. → bullet เสมอ (numbered)
  if (NUMBERED_RE.test(line)) return false; // จัดการแยก
  // เริ่มด้วย dash หรือ bullet
  if (SUB_BULLET_RE.test(line)) return true;
  // ส้น (< 80 chars) และไม่ลงท้ายด้วย . ! ? — น่าจะเป็น list item
  if (line.length < 80 && !/[.!?]$/.test(line)) return true;
  return false;
}

function parseArticle(text: string): Block[] {
  const lines = text.split("\n").map((l) => l.trim());
  const blocks: Block[] = [];
  const allTags: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line) {
      i++;
      continue;
    }

    // hashtag-only line
    if (line.startsWith("#") && line.split(/\s+/).every((w) => w.startsWith("#"))) {
      allTags.push(...line.split(/\s+/).filter((t) => t.startsWith("#")));
      i++;
      continue;
    }

    // Callout (Pacred Tip / 💡 line)
    if (/^(Pacred Tip|💡 )/i.test(line)) {
      blocks.push({ kind: "callout", text: line });
      i++;
      continue;
    }

    // Numbered list item
    const numberedMatch = line.match(NUMBERED_RE);
    if (numberedMatch) {
      const children: string[] = [];
      let j = i + 1;
      // เก็บบรรทัดที่ตามมาเป็น sub-bullets จนเจอ empty / next numbered / heading
      while (j < lines.length) {
        const next = lines[j];
        if (!next) break;
        if (NUMBERED_RE.test(next)) break;
        if (EMOJI_HEADING_REGEX.test(next)) break;
        if (looksLikeBullet(next)) {
          children.push(next.replace(SUB_BULLET_RE, ""));
          j++;
        } else {
          // เป็น paragraph ยาว — หยุดเก็บ children
          break;
        }
      }
      blocks.push({
        kind: "list-item",
        number: numberedMatch[1],
        text: numberedMatch[2],
        children,
      });
      i = j;
      continue;
    }

    // Emoji-led heading
    if (EMOJI_HEADING_REGEX.test(line)) {
      const isSubHeading = line.length < 50;
      blocks.push({ kind: isSubHeading ? "h3" : "h2", text: line });
      i++;

      // ถ้าหัวข้อลงท้ายด้วย : เก็บบรรทัดถัดไปเป็น bullet group
      if (line.endsWith(":") || line.endsWith("?")) {
        const items: string[] = [];
        while (i < lines.length) {
          const next = lines[i];
          if (!next) break;
          if (EMOJI_HEADING_REGEX.test(next)) break;
          if (NUMBERED_RE.test(next)) break;
          if (looksLikeBullet(next)) {
            items.push(next.replace(SUB_BULLET_RE, ""));
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

    // Default: paragraph
    blocks.push({ kind: "p", text: line });
    i++;
  }

  if (allTags.length) blocks.push({ kind: "tags", tags: allTags });
  return blocks;
}

export function ArticleContent({ text }: { text: string }) {
  const blocks = parseArticle(text);

  const elements: ReactNode[] = blocks.map((b, i) => {
    if (b.kind === "h2") {
      return (
        <h2
          key={i}
          className="mt-8 md:mt-10 mb-3 text-[19px] md:text-[24px] font-black leading-tight tracking-tight text-[#111827] dark:text-white"
        >
          {b.text}
        </h2>
      );
    }
    if (b.kind === "h3") {
      return (
        <h3
          key={i}
          className="mt-6 mb-2 text-[16px] md:text-[18px] font-black leading-tight tracking-tight text-[#111827] dark:text-white"
        >
          {b.text}
        </h3>
      );
    }
    if (b.kind === "bullet-group") {
      return (
        <ul key={i} className="my-3 space-y-1.5 pl-1">
          {b.items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-[9px] w-1.5 h-1.5 rounded-full bg-primary-500" />
              <span className="flex-1 text-[14px] md:text-[15px] leading-[1.7] text-[#374151] dark:text-white/85">
                {item}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    if (b.kind === "list-item") {
      return (
        <div key={i} className="my-4 md:my-5">
          <div className="flex items-start gap-3">
            <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] md:text-[14px] font-black shadow-[0_4px_10px_rgba(179,0,0,0.22)]">
              {b.number}
            </span>
            <p className="flex-1 text-[14.5px] md:text-[16px] leading-[1.6] text-[#111827] dark:text-white font-black tracking-tight pt-1">
              {b.text}
            </p>
          </div>
          {b.children.length > 0 && (
            <ul className="mt-2 ml-11 md:ml-12 space-y-1 border-l-2 border-primary-100 dark:border-primary-900/40 pl-3">
              {b.children.map((c, ci) => (
                <li key={ci} className="flex items-start gap-2">
                  <span className="shrink-0 mt-[9px] w-1 h-1 rounded-full bg-primary-400" />
                  <span className="flex-1 text-[13.5px] md:text-[14.5px] leading-[1.65] text-muted">
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
      return (
        <div
          key={i}
          className="my-5 md:my-6 rounded-2xl bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-950/30 dark:via-surface dark:to-primary-950/10 border-l-4 border-primary-500 p-4 md:p-5 shadow-[0_4px_14px_rgba(179,0,0,0.06)]"
        >
          <p className="text-[14px] md:text-[15px] leading-[1.7] font-bold text-[#111827] dark:text-white">
            {b.text}
          </p>
        </div>
      );
    }
    if (b.kind === "tags") {
      return (
        <div key={i} className="mt-10 pt-6 border-t border-border flex flex-wrap gap-1.5">
          {b.tags.map((t, ti) => (
            <span
              key={ti}
              className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-[11.5px] font-bold border border-primary-100 dark:border-primary-900/40"
            >
              {t}
            </span>
          ))}
        </div>
      );
    }
    return (
      <p
        key={i}
        className="my-3 text-[14.5px] md:text-[16px] leading-[1.8] text-[#374151] dark:text-white/85"
      >
        {b.text}
      </p>
    );
  });

  return <div className="article-content">{elements}</div>;
}
