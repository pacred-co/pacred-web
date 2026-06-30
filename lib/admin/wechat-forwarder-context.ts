import "server-only";

/**
 * WeChat China-ops context for a single forwarder (ฝากนำเข้า) order — READ-ONLY.
 *
 * The owner carryover ("WeChat follow-up · จีนว่าไงเรื่องตู้นี้"): the 24,428
 * decrypted China-ops WeChat messages (mig 0228 · `wechat_ops_message`) are now
 * searchable platform-wide at /admin/wechat-ops, but staff working a specific
 * forwarder shouldn't have to leave the order to ask "what did China say about
 * THIS container / tracking / customer?". This fetches the chat messages that
 * mention this order's container code, China tracking number, or the customer's
 * PR code, so the detail page can render them inline.
 *
 * ⚠️ PURE READ — the only query here is a SELECT on `wechat_ops_message`. No
 *    .insert / .update / .upsert / .delete, no "use server" mutation. The chat
 *    archive is internal partner comms; this module never writes it.
 *
 * MATCH LOGIC (two-stage: cheap ILIKE prefilter → precise JS boundary filter):
 *   1. Build candidate tokens from the forwarder row:
 *        - container code (fcabinetnumber) — e.g. "GZS260628-1" + its base
 *          "GZS260628" (chats reference both the per-batch code and the base).
 *        - China tracking number (ftrackingchn) — the full string + the bare
 *          digit core (a tracking like "SF982669997" → also probe "982669997").
 *        - customer PR code (userid) — e.g. "PR207".
 *   2. OR the tokens into a single ILIKE query (pg_trgm gin index on `content`
 *      makes `%token%` fast), newest-first, bounded LIMIT.
 *   3. Post-filter in JS with WORD/DIGIT-BOUNDARY regexes so a short token can't
 *      false-match as a substring of a longer code/number/phone (e.g. "PR207"
 *      must not match "PR2070"; the bare tracking "982669997" must not match
 *      inside "1982669997123"). Tokens too short to be distinctive are dropped
 *      from the bare-number probe entirely.
 *
 * @see app/[locale]/(admin)/admin/wechat-ops/page.tsx — the platform-wide search
 * @see supabase/migrations/0228_wechat_ops_message.sql — the table + pg_trgm idx
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type WechatForwarderMessage = {
  chat_name: string;
  sender: string | null;
  sent_at: string | null;
  content: string;
};

export type WechatForwarderContext = {
  /** Messages that mention this order's container / tracking / customer. */
  messages: WechatForwarderMessage[];
  /** The human-readable tokens we searched for (shown so staff know the scope). */
  searchedTokens: string[];
  /** True when the result hit the LIMIT (more matches may exist). */
  truncated: boolean;
};

/** How many matched messages to return (newest-first). */
const RESULT_LIMIT = 30;
/**
 * The ILIKE prefilter may return more than RESULT_LIMIT rows (because the JS
 * boundary filter then drops substring false-positives); pull a wider window so
 * we don't lose true matches to the prefilter cap.
 */
const PREFILTER_LIMIT = 200;
/**
 * A bare numeric token shorter than this is too ambiguous to probe on its own
 * (would over-match phone numbers / sequence ids). Container codes + PR codes +
 * the full tracking string are still probed regardless of length.
 */
const MIN_BARE_NUMBER_LEN = 8;

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape PostgREST ILIKE wildcards so a token can't act as a pattern. */
function escapeIlike(s: string): string {
  // PostgREST passes the value into `ILIKE`; %, _ and \ are LIKE metacharacters.
  return s.replace(/([%_\\])/g, "\\$1");
}

type TokenProbe = {
  /** The token as ILIKE-escaped substring (for the SQL prefilter). */
  ilike: string;
  /** Precise boundary regex (for the JS post-filter). */
  re: RegExp;
  /** Display label (deduped, shown to staff). */
  label: string;
};

/**
 * Build the boundary regex for an ALPHANUMERIC code token (container / PR code).
 * It must not be flanked by another alphanumeric char so "PR207" ≠ "PR2070" and
 * "GZS260628" ≠ "GZS2606281". Dots/dashes inside the token are literal.
 */
function codeRegex(token: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(token)}(?![A-Za-z0-9])`, "i");
}

/**
 * Build the boundary regex for a BARE NUMBER (the digit core of a tracking). It
 * must not be flanked by another digit so "982669997" ≠ "1982669997". Letters
 * adjacent are allowed (e.g. a carrier prefix "SF982669997" still counts).
 */
function bareNumberRegex(token: string): RegExp {
  return new RegExp(`(?<!\\d)${escapeRegExp(token)}(?!\\d)`);
}

/**
 * Assemble the distinct probes (ilike + boundary-regex + label) for this order.
 */
function buildProbes(input: {
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  userid: string | null;
}): TokenProbe[] {
  const probes: TokenProbe[] = [];
  const seen = new Set<string>(); // dedup by ilike token (case-insensitive)

  const add = (raw: string | null | undefined, re: RegExp, label: string) => {
    const token = (raw ?? "").trim();
    if (token.length < 3) return; // 2-char tokens are noise
    // PostgREST `.or()` reserves , ( ) and " as filter-structure chars — a token
    // carrying one would corrupt the OR filter. These never appear in a real
    // container code / tracking / PR, so just skip such a (malformed) token.
    if (/[,()"]/.test(token)) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    probes.push({ ilike: escapeIlike(token), re, label });
  };

  // 1) container code — full ("GZS260628-1") + base ("GZS260628").
  const cabinet = (input.fcabinetnumber ?? "").trim();
  if (cabinet) {
    add(cabinet, codeRegex(cabinet), cabinet);
    const base = cabinet.replace(/[-/].*$/, ""); // strip the per-batch suffix
    if (base && base !== cabinet) add(base, codeRegex(base), base);
  }

  // 2) China tracking — full string + the bare digit core (if distinctive).
  const tracking = (input.ftrackingchn ?? "").trim();
  if (tracking) {
    add(tracking, codeRegex(tracking), tracking);
    const digits = tracking.replace(/\D/g, "");
    if (digits && digits !== tracking && digits.length >= MIN_BARE_NUMBER_LEN) {
      add(digits, bareNumberRegex(digits), digits);
    }
  }

  // 3) customer PR code — e.g. "PR207".
  const pr = (input.userid ?? "").trim();
  if (pr) add(pr, codeRegex(pr), pr);

  return probes;
}

/**
 * Fetch WeChat ops messages relevant to a forwarder order. READ-ONLY, best-effort
 * (any DB error → empty result so the host page still renders).
 */
export async function loadWechatForwarderContext(input: {
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  userid: string | null;
}): Promise<WechatForwarderContext> {
  const probes = buildProbes(input);
  const searchedTokens = probes.map((p) => p.label);
  if (probes.length === 0) {
    return { messages: [], searchedTokens, truncated: false };
  }

  const admin = createAdminClient();
  // OR the ILIKE tokens — `content.ilike.%TOKEN%` for each. pg_trgm gin index
  // on `content` keeps these substring scans fast across the 24k-row archive.
  const orFilter = probes.map((p) => `content.ilike.%${p.ilike}%`).join(",");

  const { data, error } = await admin
    .from("wechat_ops_message")
    .select("chat_name, sender, sent_at, content")
    .or(orFilter)
    .order("sent_at", { ascending: false })
    .limit(PREFILTER_LIMIT);

  if (error) {
    console.error("[wechat-forwarder-context] query failed", {
      code: error.code,
      message: error.message,
    });
    return { messages: [], searchedTokens, truncated: false };
  }

  // Precise boundary post-filter — drop substring false-positives the ILIKE
  // prefilter let through (a short PR/number token inside a longer code).
  const matched = (data ?? []).filter((m) =>
    probes.some((p) => p.re.test(m.content)),
  );

  return {
    messages: matched.slice(0, RESULT_LIMIT),
    searchedTokens,
    truncated: matched.length > RESULT_LIMIT,
  };
}
