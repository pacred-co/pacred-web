#!/usr/bin/env node
/**
 * Functional proof that the profile-avatar upload works end-to-end against the
 * real `avatars` bucket (2026-06-04 — owner "ตั้งรูป profile ใช้ได้จริง?"). It
 * replicates the exact storage ops that lib/storage/upload.ts::uploadToBucket +
 * actions/profile-avatar.ts do (upload → getPublicUrl → the URL is reachable),
 * then DELETES the test object so nothing is left behind.
 *
 * Usage: node --env-file=.env.local scripts/test-avatar-upload.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("FATAL: SUPABASE url/key missing"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const img = readFileSync("public/images/pacred-stamp.png");
const path = `devtest/avatar-proof-${process.argv[2] ?? "run"}.png`;

console.log(`Uploading ${img.length} bytes → avatars/${path} …`);
const up = await sb.storage.from("avatars").upload(path, img, { contentType: "image/png", upsert: true });
if (up.error) { console.error("✗ UPLOAD FAILED:", up.error.message); process.exit(2); }
console.log("✓ uploaded");

const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
console.log("public URL:", pub.publicUrl);

const res = await fetch(pub.publicUrl);
console.log(`✓ fetched public URL → HTTP ${res.status} · content-type ${res.headers.get("content-type")} · ${res.headers.get("content-length")} bytes`);
const ok = res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("image/");

const rm = await sb.storage.from("avatars").remove([path]);
console.log(rm.error ? `⚠ cleanup failed: ${rm.error.message}` : "✓ cleaned up test object");

console.log(ok ? "\n✅ AVATAR UPLOAD WORKS END-TO-END (upload + public URL reachable + image served)" : "\n❌ something off — check above");
process.exit(ok ? 0 : 3);
