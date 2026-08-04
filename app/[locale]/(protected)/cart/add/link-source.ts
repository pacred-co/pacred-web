import { useSyncExternalStore } from "react";

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

// ── ประเทศต้นทาง ───────────────────────────────────────────────────
/**
 * The origin-country chips on /cart/add (owner 2026-08-04 "ปลดประเทศออกให้กดได้").
 *
 * `hasApi` is the honest bit: only จีน has marketplace lookups (1688 / Taobao /
 * Tmall / Alibaba — see `detectSource`). Picking any other country therefore
 * routes the order to the manual form instead of pretending we can fetch it,
 * and the label travels along so the buying team sees WHICH country it is
 * (folded into tb_cart.cdetails by `manualItemToCartRows`).
 *
 * Add a country's marketplaces to `detectSource` first, then flip `hasApi`.
 */
export const ORIGIN_COUNTRIES = [
  { code: "cn", label: "จีน", hasApi: true },
  { code: "jp", label: "ญี่ปุ่น", hasApi: false },
  { code: "kr", label: "เกาหลีใต้", hasApi: false },
  { code: "vn", label: "เวียดนาม", hasApi: false },
  { code: "in", label: "อินเดีย", hasApi: false },
  { code: "id", label: "อินโดนีเซีย", hasApi: false },
  { code: "my", label: "มาเลเซีย", hasApi: false },
  { code: "us", label: "อเมริกา", hasApi: false },
] as const;

export type OriginCode = (typeof ORIGIN_COUNTRIES)[number]["code"];

/** จีน — what every existing order is, so it stays the default everywhere. */
export const DEFAULT_ORIGIN: OriginCode = "cn";

const ORIGIN_KEY = "pacred_cart_origin_country";

export function originCountry(code: string) {
  return ORIGIN_COUNTRIES.find((c) => c.code === code) ?? ORIGIN_COUNTRIES[0];
}

/** Remember the pick so the manual form (a separate page) knows it. จีน clears
 *  the key — the default must never leave a stale non-จีน value behind. */
export function stashOriginCountry(code: string): void {
  try {
    if (code === DEFAULT_ORIGIN) sessionStorage.removeItem(ORIGIN_KEY);
    else sessionStorage.setItem(ORIGIN_KEY, code);
  } catch {
    /* private mode — the manual form just falls back to จีน */
  }
}

/** Read WITHOUT consuming: the pick has to survive a refresh of the manual form
 *  and a walk back to /cart/add (unlike the one-shot link stash). */
export function readOriginCountry(): OriginCode {
  try {
    const raw = sessionStorage.getItem(ORIGIN_KEY);
    const hit = ORIGIN_COUNTRIES.find((c) => c.code === raw);
    return hit ? hit.code : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

/**
 * The remembered pick, SSR-safe — server renders จีน, the client swaps in the
 * stored value on hydration. `useSyncExternalStore` (not an effect + setState)
 * because sessionStorage IS an external store: the effect form both trips
 * react-hooks/set-state-in-effect and flashes จีน for one extra render.
 *
 * No subscription: sessionStorage cannot change under a mounted page here — the
 * only writer is `stashOriginCountry`, and the surface that calls it holds the
 * live value in its own state.
 */
const NO_SUBSCRIBE = () => () => {};
export function useStoredOriginCountry(): OriginCode {
  return useSyncExternalStore(NO_SUBSCRIBE, readOriginCountry, () => DEFAULT_ORIGIN);
}
