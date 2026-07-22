/**
 * 2026-06-05 (ภูม flag) — tests for normalizeProductUrl.
 *
 * Run: pnpm tsx lib/url/normalize-product-url.test.ts
 */
import { normalizeProductUrl, MAX_URL_CHARS } from "./normalize-product-url";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else      { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); fail++; }
}

console.log("\nnormalizeProductUrl — Taobao (the ภูม case)");
{
  // The actual URL from ภูม's screenshot — 935 chars
  const raw = "https://item.taobao.com/item.htm?id=1051248520031&mi_id=0000neP7nbBzDYaqJNuN03StuTI2decLrvcRfQm23fku-YI&pvid=4eae4356-512a-485e-a1db-872b12c23ec3&scm=1007.54964.466225.0&skuId=6080556917804&spm=pc_detail.30350276.201876.d15132406311sPCjWM&utparam=%7B%22item_ctr%22%3A0.06559142470359802%2C%22x_object_type%22%3A%22item%22%2C%22item_price%22%3A%22210.01%22%2C%22item_cvr%22%3A0.07572132349014282%2C%22pc_scene%22%3A%2220001%22%2C%22plus_abtest%22%3A%22863ac68efce9b62fa19da8a0517394b1%22%2C%22tpp_buckets%22%3A%22%22%2C%22ab_info%22%3A%22%22%2C%22abid%22%3A%220%22%2C%22pc_pvid%22%3A%224eae4356-512a-485e-a1db-872b12c23ec3%22%2C%22mix_group%22%3A%22L5%22%2C%22item_ecpm%22%3A0%22%2C%22x_object_id%22%3A1051248520031%7D&xxc=home_recommend";
  ok("raw URL is >300 chars (this is the bug input)", raw.length > 300, `len=${raw.length}`);
  const out = normalizeProductUrl(raw);
  ok("normalized ≤290 chars (varchar(300) safe)", out.length <= 290, `out_len=${out.length}`);
  ok("keeps id=1051248520031", out.includes("id=1051248520031"));
  ok("keeps skuId=6080556917804", out.includes("skuId=6080556917804"));
  ok("drops utparam", !out.includes("utparam"));
  ok("drops scm", !out.includes("scm="));
  ok("drops spm", !out.includes("spm="));
  ok("drops xxc", !out.includes("xxc="));
  console.log(`    → ${out}`);
}

console.log("\nnormalizeProductUrl — short URL stays untouched");
{
  const raw = "https://item.taobao.com/item.htm?id=1051248520031&skuId=6080556917804";
  const out = normalizeProductUrl(raw);
  ok("short clean URL passes through unchanged", out === raw, `got: ${out}`);
}

console.log("\nnormalizeProductUrl — Tmall");
{
  const raw = "https://detail.tmall.com/item.htm?id=999&spm=a1z10.5-b.w4011-12345.123.abc&skuId=42&scm=tracking";
  const out = normalizeProductUrl(raw);
  ok("Tmall keeps id+skuId", out.includes("id=999") && out.includes("skuId=42"));
  ok("Tmall drops spm/scm", !out.includes("spm") && !out.includes("scm"));
}

console.log("\nnormalizeProductUrl — 1688 (path-based)");
{
  const raw = "https://detail.1688.com/offer/657123456789.html?spm=long.tracking&abtest=foo&utparam=bar";
  const out = normalizeProductUrl(raw);
  ok("1688 keeps origin+path", out === "https://detail.1688.com/offer/657123456789.html", `got: ${out}`);
  ok("1688 drops all query", !out.includes("?"));
}

console.log("\nnormalizeProductUrl — JD");
{
  const raw = "https://item.jd.com/100012345.html?wareId=100012345&jd_pop=abc&extension_id=xyz&utm_source=app";
  const out = normalizeProductUrl(raw);
  ok("JD keeps wareId", out.includes("wareId=100012345"));
  ok("JD drops jd_pop/utm_source", !out.includes("jd_pop") && !out.includes("utm_source"));
}

console.log("\nnormalizeProductUrl — edge cases");
{
  ok("empty string → empty", normalizeProductUrl("") === "");
  ok("whitespace-only → empty", normalizeProductUrl("   ") === "");
  ok("non-URL note → truncated to MAX_URL_CHARS", normalizeProductUrl("ขอตามนี้นะ ของจริงดูสีอ่อนหน่อย".repeat(50)).length <= MAX_URL_CHARS);
  ok("URL without id → fallback origin+pathname",
    normalizeProductUrl("https://item.taobao.com/item.htm?spm=foo") === "https://item.taobao.com/item.htm");
  ok("unknown host → keeps origin+pathname trimmed",
    normalizeProductUrl("https://example.com/product/abc?utparam=long&".repeat(20)).length <= MAX_URL_CHARS);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
