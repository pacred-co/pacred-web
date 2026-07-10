/**
 * Unit tests for the shop/product image SOT in lib/legacy-image.ts —
 * `normalizeImageUrl`, `isDirectImageUrl`, `applyResizeSuffix`, `shopImageUrl`.
 *
 * These lock the exact bug class the owner reported on 2026-07-10
 * ("แนบรูปแล้วไม่ขึ้น" · a 404 on /legacy/pcs/admin/images/shops/https://…):
 *
 *   1. NEVER prepend a legacy base to an already-absolute URL.
 *   2. NEVER append the Alibaba `_WxH.jpg` resize suffix to a non-Alibaba host.
 *   3. A Google-Drive FOLDER link is not an image (→ placeholder / rejected).
 *   4. A Google-Drive FILE link IS renderable once normalised to `thumbnail?id=`.
 *
 * Run:  pnpm tsx lib/shop-image-url.test.ts   (wired into pnpm test:unit)
 */

import {
  normalizeImageUrl,
  isDirectImageUrl,
  applyResizeSuffix,
  shopImageUrl,
  isAlibabaCdnUrl,
  NO_COVER_IMAGE,
} from "./legacy-image";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

const origSupa = process.env.NEXT_PUBLIC_SUPABASE_URL;
const origOverride = process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE;
delete process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
const MIRROR = "https://abc.supabase.co/storage/v1/object/public/pcsracgo/public/member";

// The two real values from the owner's 2026-07-10 report.
const POSTIMG = "https://i.postimg.cc/NjtV7WMW/Hd17d3b04c64a428e96a33db4a2c92e0d-K.avif";
const DRIVE_FOLDER = "https://drive.google.com/drive/folders/1s9fnw2JKPpY9jXBxAr8OeZwp-fhk-jQx";
const ALICDN = "https://cbu01.alicdn.com/img/ibank/O1CN01abc.jpg";

section("isAlibabaCdnUrl — the resize-suffix gate");
assertEq("alicdn → true", isAlibabaCdnUrl(ALICDN), true);
assertEq("postimg → false", isAlibabaCdnUrl(POSTIMG), false);
assertEq("google drive → false", isAlibabaCdnUrl(DRIVE_FOLDER), false);
assertEq("momo partner cdn → false", isAlibabaCdnUrl("https://api.momocargo.com/images/a.png"), false);

section("normalizeImageUrl");
assertEq("empty → ''", normalizeImageUrl(""), "");
assertEq("null → ''", normalizeImageUrl(null), "");
assertEq("sentinel '-' → ''", normalizeImageUrl("-"), "");
assertEq("sentinel '0' → ''", normalizeImageUrl("0"), "");
assertEq("plain image URL unchanged", normalizeImageUrl(POSTIMG), POSTIMG);
assertEq("strips ?x-oss-process params",
  normalizeImageUrl("https://img.alicdn.com/x.jpg?x-oss-process=style/alsy"),
  "https://img.alicdn.com/x.jpg");
assertEq("strips legacy _250x250.jpg marker",
  normalizeImageUrl("https://img.alicdn.com/x.jpg_250x250.jpg"),
  "https://img.alicdn.com/x.jpg");
assertEq("dead zzqss proxy → alicdn",
  normalizeImageUrl("https://cdn.zzqss.com/img/ibank/O1CN01.jpg"),
  "https://img.alicdn.com/img/ibank/O1CN01.jpg");
assertEq("protocol-relative marketplace URL → upgraded to https (TAMIT/1688 real data)",
  normalizeImageUrl("//img.alicdn.com/imgextra/x.jpg"),
  "https://img.alicdn.com/imgextra/x.jpg");
assertEq("Google-Drive FOLDER link → '' (never an image)", normalizeImageUrl(DRIVE_FOLDER), "");
assertEq("Google-Drive /file/d/<id>/view → embeddable thumbnail",
  normalizeImageUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing"),
  "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1000");
assertEq("Google-Drive open?id=<id> → embeddable thumbnail",
  normalizeImageUrl("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp"),
  "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1000");
assertEq("Google-Drive uc?export=view&id=<id> → embeddable thumbnail",
  normalizeImageUrl("https://drive.google.com/uc?export=view&id=1AbCdEfGhIjKlMnOp"),
  "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1000");

section("isDirectImageUrl — the write-path guard");
assertEq("empty is allowed (= no image)", isDirectImageUrl(""), true);
assertEq("direct postimg image → allowed", isDirectImageUrl(POSTIMG), true);
assertEq("alicdn image → allowed", isDirectImageUrl(ALICDN), true);
assertEq("Drive FOLDER link → REJECTED", isDirectImageUrl(DRIVE_FOLDER), false);
assertEq("Drive FILE link → allowed (normalisable)",
  isDirectImageUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view"), true);
assertEq("postimg SHARE page → REJECTED (must use i.postimg.cc)",
  isDirectImageUrl("https://postimg.cc/3dLn3f2B"), false);
assertEq("imgur page → REJECTED", isDirectImageUrl("https://imgur.com/a/abcd"), false);
assertEq("i.imgur direct → allowed", isDirectImageUrl("https://i.imgur.com/abcd.png"), true);
assertEq("1688 product PAGE → REJECTED", isDirectImageUrl("https://detail.1688.com/offer/123.html"), false);
assertEq("taobao item PAGE → REJECTED", isDirectImageUrl("https://item.taobao.com/item.htm?id=1"), false);
assertEq("REGRESSION: protocol-relative alicdn URL → ALLOWED (add-to-cart must not break)",
  isDirectImageUrl("//img.alicdn.com/imgextra/x.jpg"), true);
assertEq("bare filename → REJECTED (not an absolute URL)", isDirectImageUrl("PR123.jpg"), false);
assertEq("unknown host with no extension → allowed (fail-open)",
  isDirectImageUrl("https://cdn.example.com/asset/abc123"), true);

section("applyResizeSuffix — only Alibaba hosts get the resize directive");
assertEq("alicdn + size → suffix appended", applyResizeSuffix(ALICDN, "_150x150.jpg"), `${ALICDN}_150x150.jpg`);
assertEq("postimg + size → UNCHANGED (the 404 bug)", applyResizeSuffix(POSTIMG, "_150x150.jpg"), POSTIMG);
assertEq("empty size → unchanged", applyResizeSuffix(ALICDN, ""), ALICDN);
assertEq("already sized → not double-appended",
  applyResizeSuffix("https://img.alicdn.com/x.jpg_80x80.jpg", "_150x150.jpg"),
  "https://img.alicdn.com/x.jpg_80x80.jpg");

section("shopImageUrl — the ONE resolver every surface uses");
assertEq("empty → neutral placeholder", shopImageUrl(""), NO_COVER_IMAGE);
assertEq("null → neutral placeholder", shopImageUrl(null), NO_COVER_IMAGE);
assertEq("custom emptyFallback honoured", shopImageUrl("", { emptyFallback: "/x.png" }), "/x.png");

assertEq("REGRESSION: absolute URL is never prefixed with a legacy base", shopImageUrl(POSTIMG), POSTIMG);
assertEq("REGRESSION: absolute URL + thumb size → NO suffix for non-Alibaba",
  shopImageUrl(POSTIMG, { size: "_150x150.jpg" }), POSTIMG);
assertEq("alicdn + thumb size → suffix applied",
  shopImageUrl(ALICDN, { size: "_150x150.jpg" }), `${ALICDN}_150x150.jpg`);
assertEq("alicdn full size → no suffix", shopImageUrl(ALICDN), ALICDN);

assertEq("Drive FOLDER link → placeholder (cannot render)", shopImageUrl(DRIVE_FOLDER), NO_COVER_IMAGE);
assertEq("Drive FOLDER link + size → placeholder",
  shopImageUrl(DRIVE_FOLDER, { size: "_80x80.jpg" }), NO_COVER_IMAGE);
assertEq("Drive FILE link → embeddable thumbnail, no suffix",
  shopImageUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", { size: "_80x80.jpg" }),
  "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1000");

assertEq("bare filename → Supabase mirror images/shops/",
  shopImageUrl("PR123.jpg"), `${MIRROR}/images/shops/PR123.jpg`);
assertEq("bare filename ignores the resize size (mirror has no resizer)",
  shopImageUrl("PR123.jpg", { size: "_80x80.jpg" }), `${MIRROR}/images/shops/PR123.jpg`);
assertEq("legacy pcscargo.co.th/member URL → re-pointed at the mirror (no brand leak)",
  shopImageUrl("https://pcscargo.co.th/member/images/shops/abc.jpg"),
  `${MIRROR}/images/shops/abc.jpg`);
assertEq("whitespace trimmed before classification",
  shopImageUrl("  PR9.jpg  "), `${MIRROR}/images/shops/PR9.jpg`);
assertEq("root-absolute path passes through", shopImageUrl("/images/no-cover.svg"), "/images/no-cover.svg");
assertEq("protocol-relative alicdn → https + resize suffix",
  shopImageUrl("//img.alicdn.com/x.jpg", { size: "_80x80.jpg" }),
  "https://img.alicdn.com/x.jpg_80x80.jpg");
assertEq("oss params stripped then suffixed for alicdn",
  shopImageUrl("https://img.alicdn.com/x.jpg?x-oss-process=style/tbsy", { size: "_80x80.jpg" }),
  "https://img.alicdn.com/x.jpg_80x80.jpg");

// restore env
if (origSupa === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = origSupa;
if (origOverride === undefined) delete process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE; else process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE = origOverride;

console.log(`\n${fail === 0 ? "✅" : "❌"} shop-image-url: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
