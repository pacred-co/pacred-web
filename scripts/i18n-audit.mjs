#!/usr/bin/env node
// Pacred i18n audit — three checks:
//   1. Missing keys in EN that exist in TH  (fail-closed)
//   2. Missing keys in TH that exist in EN  (fail-closed)
//   3. Values identical in both locales      (informational — split by intentional vs needs-review)
//
// The third check used to surface 86 noise items the team had to manually
// scan past every run. Now we classify with three layers:
//   (a) KEY_INTENTIONAL_PATTERNS — keys whose suffix marks display chrome
//       (kickers, eyebrows, badges, brand text) where English-on-Thai is
//       a deliberate visual choice
//   (b) VALUE_INTENTIONAL_PATTERNS — values that are brand names, shipping
//       acronyms, placeholders, URLs, emails, or pure punctuation
//   (c) KEY_ALLOWLIST — escape hatch for edge cases neither pattern catches
//
// What remains after the filter = real "Thai locale still shows English"
// bugs. Report exits 0 (informational) — translation work doesn't block CI.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const th = JSON.parse(readFileSync(resolve(root, "messages/th.json"), "utf8"));
const en = JSON.parse(readFileSync(resolve(root, "messages/en.json"), "utf8"));

function flatten(obj, prefix = "") {
  const out = new Map();
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) {
      for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

// ── Intentional-same allowlists ─────────────────────────────────────
// Patterns anchor on the END of the key path (not after a dot) so they
// catch compound camelCase forms — e.g., `portsEyebrow`, `whyPacredBadge`,
// `subtitleBrand`, `titleHighlight` — not just bare `.eyebrow` etc.
const KEY_INTENTIONAL_PATTERNS = [
  /[Ee]yebrow(En)?$/,          // Section eyebrows — display chrome, often UPPERCASE EN
  /[Kk]icker$/,                 // Kicker = small heading above title
  /[Bb]adge$/,                  // Visual badge labels
  /[Bb]rand([A-Z]\w*)?$/,       // brand / brandText / brandTitle / subtitleBrand
  /[Tt]itleHighlight$/,         // Highlight strings inside title (often brand)
  /[Tt]agBrand$/,
  /\.ph$/,                      // Pacred convention: `.ph` suffix = placeholder
  /[Pp]laceholder$/,
  /En$/,                        // `.foo + En` suffix = explicitly-English variant
  /[Ee]moji$/,
  /[Ii]con$/,
];

const VALUE_INTENTIONAL_PATTERNS = [
  // Major brand names (matching whole string, possibly with " ID" / " URL" / etc.)
  /^(Pacred|Facebook|Google|TikTok|LINE|YouTube|Instagram|Twitter|Weibo|WeChat|Discord|Telegram)(\s+(Shipping|ID|URL))?$/i,
  /^(Taobao|1688|Tmall|Alibaba|Weidian|JD|AliExpress|Pinduoduo)\b/i,
  // Shipping acronyms / technical labels
  /\b(LCL|FCL|CBM|HS\s*Code|T\/T|DDP|FOB|CIF|FCA|EXW|HQ)\b/,
  /^[A-Z][A-Z\d\s/]+$/,        // Pure UPPERCASE labels — usually visual chrome
  // Dimensions / measurements with unit
  /^\d+(\.\d+)?\s*(ft|HQ|kg|cm|m|km|CBM|inch)\b/i,
  // Pure punctuation/visual characters (already filtered in old script, kept here for clarity)
  /^[•·\-+\s.]+$/,
  // Email-shape
  /@[a-z0-9.-]+\.[a-z]{2,}$/i,
  // URL
  /^https?:\/\//,
  // Currency labels
  /^[¥฿$€£][\d,]*/,
  // Common multi-brand combos like "1688 · Taobao · Tmall"
  /^(1688|Taobao|Tmall|Alibaba|JD|Pinduoduo|AliExpress|Weidian)(\s*[·\-/,]\s*(1688|Taobao|Tmall|Alibaba|JD|Pinduoduo|AliExpress|Weidian))+\s*$/,
];

const KEY_ALLOWLIST = new Set([
  // Pacred-specific UX decisions where same TH/EN is intentional:
  "footer.email", "footerExtras.email",          // email address — same in both
  "sidebar.dashboard", "admin.sidebar.dashboard", // "Dashboard" used unchanged in TH UI
  "dashboard.kicker",
  "forwarder.colTracking",                        // Column header in tracking table
  "wallet.balanceCashback", "wallet.bucket.cashback",
  "profile.lineId", "profile.facebookUrl",
  "profile.emailChannelTitle",
  "register.chFacebook", "register.chGoogle", "register.chTiktok",
  "register.emailPh",
  "login.passwordPlaceholder",
  "blog.tag21", "blog.tag22", "blog.tag23",       // Tag labels — keep canonical EN
  "footerExtras.import10", "footerExtras.customs9", "footerExtras.customs10",
  "footerExtras.knowledge6", "footerExtras.knowledge7",
  "serviceData.tagCargo", "serviceData.tagFreight", "serviceData.fcl20", "serviceData.fcl40",
  "pricing.modeCargoTitle", "pricing.modeFreightTitle",
  "pricing.modeCargoBadge", "pricing.modeFreightBadge",
  "pricing.lclTitle", "pricing.lclSubtitle", "pricing.lclMin",
  "pricing.fcl20Title", "pricing.fcl20Capacity", "pricing.fcl40Title", "pricing.fcl40Capacity",
  "pricing.statTransit", "pricing.termPrefix", "pricing.portToPort",
  "reviews.unlikeAria",                            // ARIA labels — keep EN for screen readers
  "whyPacred.articleHeading1",
  "whyPacred.articleP1Brand", "whyPacred.articleP5Brand",
  "whyPacred.articleP2DoorToDoor",
  "homeArticle.headingPart1", "homeArticle.p2DoorToDoor",
  "homeArticle.warehouseGuangzhouEn", "homeArticle.warehouseThailandEn",
  "heroBanner.tab6Title2",                         // "T/T Wire Transfer" — banking term
  "bookingCalc.size20", "bookingCalc.size40",      // Container dimensions
  "bookingCalc.calc.rowChargeableWeight",          // Shipping term
  "profile.freightTypeCargo", "profile.freightTypeSeafreight",
  "profile.transportType", "profile.shipBy",
  "ourService.titleMobile", "ourService.orderSubMobile",
  "service.whyPacredBadge", "service.reviewsBadge",
  "reviews.eyebrow",
]);

function isIntentional(key, value) {
  if (KEY_ALLOWLIST.has(key)) return true;
  if (KEY_INTENTIONAL_PATTERNS.some((p) => p.test(key))) return true;
  if (VALUE_INTENTIONAL_PATTERNS.some((p) => p.test(value))) return true;
  return false;
}

// ── Run audit ────────────────────────────────────────────────────────
const flatTh = flatten(th);
const flatEn = flatten(en);

const missingInEn = [];
const missingInTh = [];
const sameValueIntentional = [];
const sameValueNeedsReview = [];

for (const k of flatTh.keys()) if (!flatEn.has(k)) missingInEn.push(k);
for (const k of flatEn.keys()) if (!flatTh.has(k)) missingInTh.push(k);

for (const [k, v] of flatTh.entries()) {
  if (flatEn.has(k) && flatEn.get(k) === v && typeof v === "string" && v.length > 4) {
    if (/^[\d\s\-+#@.():,/]+$/.test(v)) continue; // pure punct, skip entirely
    if (isIntentional(k, v)) sameValueIntentional.push({ key: k, value: v });
    else sameValueNeedsReview.push({ key: k, value: v });
  }
}

console.log("\n══════════════════════════════════════════════════");
console.log(" Pacred i18n audit");
console.log("══════════════════════════════════════════════════");
console.log(` th keys : ${flatTh.size}`);
console.log(` en keys : ${flatEn.size}`);
console.log("");
console.log(`◆ Missing in EN  (${missingInEn.length}):`);
for (const k of missingInEn) console.log("   - " + k);
console.log("");
console.log(`◆ Missing in TH  (${missingInTh.length}):`);
for (const k of missingInTh) console.log("   - " + k);
console.log("");
console.log(`◆ Intentionally same (allowlisted, ${sameValueIntentional.length}) — OK`);
console.log("");
console.log(`◆ Same value — NEEDS REVIEW (${sameValueNeedsReview.length}):`);
if (sameValueNeedsReview.length === 0) {
  console.log("   (none) ✓");
} else {
  for (const { key, value } of sameValueNeedsReview.slice(0, 40)) {
    const preview = value.length > 60 ? value.slice(0, 60) + "…" : value;
    console.log(`   - ${key}  →  "${preview}"`);
  }
  if (sameValueNeedsReview.length > 40) {
    console.log(`   …and ${sameValueNeedsReview.length - 40} more`);
  }
}
console.log("");

const blockingIssues = missingInEn.length + missingInTh.length;
process.exit(blockingIssues > 0 ? 1 : 0);
