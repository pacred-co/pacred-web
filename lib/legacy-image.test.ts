/**
 * Unit tests for lib/legacy-image.ts — the legacy member-folder image URL
 * resolver (Supabase Storage mirror · env-driven base · no brand leak). Pure.
 *
 * Run:  pnpm tsx lib/legacy-image.test.ts   (wired into pnpm test:unit)
 */

import { legacyMemberUrl, legacyMemberBase } from "./legacy-image";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// Save + control env (legacyMemberBase reads process.env at call time).
const origSupa = process.env.NEXT_PUBLIC_SUPABASE_URL;
const origOverride = process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE;
function setEnv(supa?: string, override?: string) {
  if (supa === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = supa;
  if (override === undefined) delete process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE; else process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE = override;
}

section("legacyMemberBase — resolution order");
setEnv(undefined, undefined);
assertEq("no env → local /legacy/pcs fallback (no crash, no brand leak)", legacyMemberBase(), "/legacy/pcs");

setEnv("https://abc.supabase.co", undefined);
assertEq("supabase url → bucket public path",
  legacyMemberBase(), "https://abc.supabase.co/storage/v1/object/public/pcsracgo/public/member");

setEnv("https://abc.supabase.co/", undefined);
assertEq("trailing slash on supabase url is trimmed",
  legacyMemberBase(), "https://abc.supabase.co/storage/v1/object/public/pcsracgo/public/member");

setEnv("https://abc.supabase.co", "https://cdn.example.com/m/");
assertEq("explicit override WINS over supabase + trailing slash trimmed",
  legacyMemberBase(), "https://cdn.example.com/m");

section("legacyMemberUrl — path join + leading-slash strip");
setEnv("https://abc.supabase.co", undefined);
const base = "https://abc.supabase.co/storage/v1/object/public/pcsracgo/public/member";
assertEq("relative path joined", legacyMemberUrl("images/users/PR123.jpg"), `${base}/images/users/PR123.jpg`);
assertEq("leading slash stripped", legacyMemberUrl("/storage/slip/abc.png"), `${base}/storage/slip/abc.png`);
assertEq("multiple leading slashes stripped", legacyMemberUrl("///images/shops/x.jpg"), `${base}/images/shops/x.jpg`);

// restore original env
setEnv(origSupa, origOverride);

console.log(`\n${fail === 0 ? "✅" : "❌"} legacy-image: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
