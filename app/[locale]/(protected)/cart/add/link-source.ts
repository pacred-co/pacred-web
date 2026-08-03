/**
 * Marketplace-link detection shared by the "เพิ่มสินค้าเข้ารถเข็น" surfaces.
 *
 * Extracted from `cart-add-multi-link.tsx` on 2026-08-03 when the review page's
 * "+ เพิ่มรายการ" became a paste POPUP (owner: "กดเพิ่มให้เป็น pop up เพิ่มสินค้าใน
 * รถเข็นดีกว่านะ") — two surfaces now decide "is this link supported?", and a
 * forked copy would drift the moment a marketplace is added.
 *
 * Detection only — no fetching, no money. The real product lookup is
 * `searchProductByUrl` (actions/product-search.ts).
 */

/** Ceiling on links per review session — the paste page, the popup, and the
 *  review page all enforce the same number so none of them can over-fill. */
export const MAX_LINKS = 20;

/**
 * Hand-off for links we CANNOT fetch automatically (owner 2026-08-03: "ถ้าลิงก์ที่
 * วางไม่ใช่ร้านค้าที่เรามี api จะเด้งไปที่หน้า ไม่มีลิงก์นะ").
 *
 * A shop outside 1688/Taobao/Tmall/Alibaba — or a supported link the API can't
 * resolve — used to dead-end in a red box. The link now travels to
 * /cart/add/manual and pre-fills a รายการ so the customer never re-copies it.
 */
export const MANUAL_LINKS_KEY = "pacred_cart_manual_links";

/** Stash links for the manual form to pick up (no-op when storage is blocked). */
export function stashManualLinks(urls: string[]): void {
  try {
    if (urls.length === 0) sessionStorage.removeItem(MANUAL_LINKS_KEY);
    else sessionStorage.setItem(MANUAL_LINKS_KEY, JSON.stringify(urls.slice(0, MAX_LINKS)));
  } catch {
    /* private mode — the manual form simply opens blank */
  }
}

/** Read WITHOUT clearing — the review page only needs to know they exist so it
 *  can offer the hand-off; the manual form is what actually consumes them. */
export function peekManualLinks(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(MANUAL_LINKS_KEY) ?? "null") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter(Boolean)
      .slice(0, MAX_LINKS);
  } catch {
    return [];
  }
}

/** Read + CONSUME the stash (one-shot, so a refresh doesn't re-add the rows). */
export function takeManualLinks(): string[] {
  const urls = peekManualLinks();
  try {
    sessionStorage.removeItem(MANUAL_LINKS_KEY);
  } catch {
    /* nothing to clear */
  }
  return urls;
}

export type Source = "1688" | "taobao" | "tmall" | "alibaba";

export function detectSource(raw: string): Source | null {
  const u = raw.trim().toLowerCase();
  if (!u) return null;
  if (u.includes("1688.com")) return "1688";
  if (u.includes("tmall.com")) return "tmall";
  if (u.includes("taobao.com")) return "taobao";
  if (u.includes("alibaba.com")) return "alibaba";
  return null;
}

export const SOURCE_BADGE: Record<Source, { label: string; icon: string }> = {
  "1688": { label: "1688", icon: "/legacy/pcs/assets/images/shops/1688-logo-2.png" },
  taobao: { label: "Taobao", icon: "/images/partners/taobaopartner.png" },
  tmall: { label: "Tmall", icon: "/images/partners/tmallpartner.png" },
  alibaba: { label: "Alibaba", icon: "/images/partners/alibabapartner.png" },
};

/** Split pasted text into individual links (newline / whitespace separated). */
export function splitLinks(text: string, cap = MAX_LINKS): string[] {
  return text
    .split(/[\s\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, cap);
}
