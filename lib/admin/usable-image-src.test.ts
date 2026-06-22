import assert from "node:assert";
import { isUsableImageSrc, usableImageSrcOr } from "./usable-image-src";

let passed = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); passed++; };

// ── isUsableImageSrc — the crash gate ───────────────────────────────────────
// The exact value that crashed the home page on 2026-06-22:
ok(isUsableImageSrc("user.jpg") === false, '"user.jpg" (bare legacy default) is NOT usable');
// Other bare filenames next/image would also reject:
ok(isUsableImageSrc("photo.png") === false, "bare filename is not usable");
ok(isUsableImageSrc("avatar-123.jpeg") === false, "bare hyphenated filename is not usable");
ok(isUsableImageSrc("C:\\Users\\a.png") === false, "windows path is not usable");
ok(isUsableImageSrc("data:image/png;base64,AAAA") === false, "data: URI is not usable by next/image");

// Empty / nullish → not usable.
ok(isUsableImageSrc("") === false, "empty string is not usable");
ok(isUsableImageSrc(null) === false, "null is not usable");
ok(isUsableImageSrc(undefined) === false, "undefined is not usable");

// Usable: a leading-slash path or an absolute http(s) URL.
ok(isUsableImageSrc("/images/pacred-logo-red.png") === true, "leading-slash path is usable");
ok(isUsableImageSrc("/legacy/pcs/admin/images/user.jpg") === true, "legacy placeholder PATH is usable");
ok(isUsableImageSrc("http://example.com/a.png") === true, "http URL is usable");
ok(isUsableImageSrc("https://x.supabase.co/storage/v1/object/public/member/a.jpg") === true, "https storage URL is usable");

// "http..."-without-scheme-slashes is still only accepted when it begins with
// http:// or https:// (a bare "httpfoo" is a filename-shaped string → reject).
ok(isUsableImageSrc("httpfoo.png") === false, '"httpfoo.png" without :// is not a URL');

// ── usableImageSrcOr — coerce-to-fallback ───────────────────────────────────
const FB = "/legacy/pcs/admin/images/user.jpg";
ok(usableImageSrcOr("user.jpg", FB) === FB, '"user.jpg" coerces to the fallback path');
ok(usableImageSrcOr("", FB) === FB, "empty coerces to the fallback");
ok(usableImageSrcOr(null, FB) === FB, "null coerces to the fallback");
ok(usableImageSrcOr("/uploads/x.png", FB) === "/uploads/x.png", "a real path passes through unchanged");
ok(usableImageSrcOr("https://cdn/x.png", FB) === "https://cdn/x.png", "a real URL passes through unchanged");

console.log(`usable-image-src.test.ts — ${passed} passed · 0 failed`);
