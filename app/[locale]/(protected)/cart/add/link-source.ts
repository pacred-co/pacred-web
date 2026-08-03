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
