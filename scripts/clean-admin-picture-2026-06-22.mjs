/**
 * clean-admin-picture-2026-06-22.mjs
 *
 * One-off prod data cleanup for `tb_admin.adminPicture` (the 2026-06-22 home-page
 * crash). A live active sales rep had `adminPicture = "user.jpg"` — a BARE legacy
 * default-avatar filename with no leading slash. `next/image` rejects a non-path/
 * non-URL src ("Failed to parse src 'user.jpg' … must start with a leading slash
 * or be an absolute URL") and THROWS → it took down <ContactSales> → the whole
 * home page `/` fell to the error boundary. (`"user.jpg"` is the legacy schema
 * DEFAULT — `adminpicture varchar(150) DEFAULT 'user.jpg' NOT NULL` — seeded by
 * scripts/provision-admins-2026-06-02.mjs + fix-admin-mind-2026-06-08.mjs, so it
 * sits on every staff row that never uploaded a real photo.)
 *
 * The code is now hardened (lib/admin/sales-roster.ts nulls any non-usable src;
 * lib/admin/usable-image-src.ts is the shared guard). THIS script removes the
 * latent landmine from the DATA too — so no future un-guarded consumer can hit
 * the same crash, and the admin staff list/detail (raw <img>) stop rendering a
 * broken image.
 *
 * "Bad" = exactly the audit query's result set:
 *   adminStatusA='1' (active) AND adminPicture IS NOT NULL AND adminPicture <> ''
 *   AND adminPicture NOT LIKE '/%' AND adminPicture NOT LIKE 'http%'
 * The active SALES reps (adminStatusSale='1') are the URGENT subset — they render
 * on the public site. The fix sets the bad value to '' (empty string) — NOT NULL,
 * because the column is NOT NULL; '' satisfies the audit query (`<> ''`) and every
 * guard treats it as "no photo" → each surface shows its own fallback (the public
 * sales cards show the branded logo / character art; the admin list shows the real
 * /legacy/pcs/admin/images/user.jpg placeholder). We deliberately do NOT invent a
 * fake "/images/…" path — these reps genuinely have no uploaded photo.
 *
 * ⚠️ Carve-out (no งานหาย): a few back-office rows hold a real upload filename
 * (e.g. "admin_pod_1759261184.jpg"), NOT "user.jpg" — a real photo that lost its
 * path prefix, with no profiles.avatar_url backup. Blanking those would discard
 * the only reference, so they are FLAGGED + left untouched for a separate
 * locate-in-storage / path-reconstruction pass. Only "user.jpg" placeholders (and
 * any bad value on a public SALES rep) are blanked.
 *
 * SAFE: targeted single-column UPDATE (no delete). Dry-run by default — prints the
 * exact plan + a JSON backup of every row it would touch. Re-run with --apply.
 * After --apply it re-runs the audit query and asserts 0 bad rows remain.
 *
 * Usage:
 *   node scripts/clean-admin-picture-2026-06-22.mjs            # dry-run (reads .env.local target)
 *   node scripts/clean-admin-picture-2026-06-22.mjs --apply    # write
 *
 * DEV-SYNC (AGENTS.md §11 — after PROD, mirror onto dev lozntlidlqqzzcaathnm):
 *   SUPABASE_URL=https://lozntlidlqqzzcaathnm.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<dev service-role key> \
 *   node scripts/clean-admin-picture-2026-06-22.mjs --apply
 *   (process.env SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY override .env.local.)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");

// .env.local provides the default target; process.env overrides it (DEV-SYNC).
const env = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    )
  : {};
const url = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("✗ missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set in .env.local or the env).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const host = new URL(url).host;
const ref = host.split(".")[0];
const KNOWN = { yzljakczhwrpbxflnmco: "PROD", lozntlidlqqzzcaathnm: "DEV" };
console.log(`[clean-admin-picture] target: ${host} (${KNOWN[ref] ?? "unknown"}) · mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

// A value next/image can't load = not "/"-prefixed and not http(s) (mirrors the
// audit query's NOT LIKE '/%' AND NOT LIKE 'http%', and lib/admin/usable-image-src).
const isBad = (p) => p != null && p !== "" && !p.startsWith("/") && !p.startsWith("http");

// Pull every ACTIVE staff row + its picture/sales flag.
const { data: rows, error } = await sb
  .from("tb_admin")
  .select("adminID, adminName, adminLastName, adminNickname, adminStatusSale, adminPicture")
  .eq("adminStatusA", "1")
  .order("adminID", { ascending: true });
if (error) { console.error("read failed", error); process.exit(1); }

// "user.jpg" = the legacy default placeholder (no real photo) → safe to blank.
// A bare filename that ISN'T "user.jpg" (e.g. admin_pod_1759261184.jpg) is a real
// uploaded photo that merely lost its path prefix — blanking it would DISCARD the
// only reference to a possibly-recoverable file (งานหาย). So:
//   • BLANK  → genuine placeholders ("user.jpg") + ANY bad value on a public SALES
//              rep (adminStatusSale='1') — the crash gate + the public card show a
//              branded fallback either way, so a non-resolvable photo → '' is right.
//   • FLAG   → orphan real-photo filenames on BACK-OFFICE staff — leave untouched,
//              report for a separate path-reconstruction / locate-in-storage pass.
const isPlaceholder = (p) => p === "user.jpg";
const bad = (rows ?? []).filter((r) => isBad(r.adminPicture));
const toBlank = bad.filter((r) => isPlaceholder(r.adminPicture) || r.adminStatusSale === "1");
const toFlag = bad.filter((r) => !isPlaceholder(r.adminPicture) && r.adminStatusSale !== "1");
const urgent = toBlank.filter((r) => r.adminStatusSale === "1"); // public-facing sales reps

if (bad.length === 0) {
  console.log(`\n✓ scanned ${rows?.length ?? 0} active staff — 0 bad adminPicture values. Nothing to clean.`);
  process.exit(0);
}

const who = (r) =>
  (r.adminNickname?.trim() || `${r.adminName ?? ""} ${r.adminLastName ?? ""}`.trim() || r.adminID || "?");
const line = (r) => `  ${String(r.adminID).padEnd(16)} ${who(r).padEnd(20)} adminPicture="${r.adminPicture}"`;

console.log(`\nScanned ${rows.length} active staff · ${bad.length} bad adminPicture value(s).`);
console.log(`\n🔴 URGENT — active SALES reps (adminStatusSale='1' · render on the public site → the crash set): ${urgent.length}`);
urgent.forEach((r) => console.log(`${line(r)}  →  ""`));
console.log(`\n🟢 WILL BLANK — all placeholder/sales bad values → "" : ${toBlank.length}`);
toBlank.forEach((r) => console.log(`${line(r)}  →  ""`));
console.log(`\n🟠 FLAGGED (NOT touched) — back-office orphan real-photo filenames (no avatar_url backup · needs path reconstruction): ${toFlag.length}`);
toFlag.forEach((r) => console.log(`${line(r)}  ·  left as-is`));

// Backup the exact pre-change rows (full state of every touched row) + the flagged
// set (so the orphan filenames are preserved on disk before any later decision).
const stamp = "2026-06-22";
const backupPath = join(tmpdir(), `clean-admin-picture-backup-${ref}-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({ toBlank, flaggedNotTouched: toFlag }, null, 2));
console.log(`\nbackup written: ${backupPath}`);

if (!APPLY) {
  console.log("\nDRY-RUN — re-run with --apply to write (blanks the 🟢 set; leaves the 🟠 set untouched).");
  process.exit(0);
}

let okN = 0, failN = 0;
for (const r of toBlank) {
  const { error: e } = await sb
    .from("tb_admin")
    .update({ adminPicture: "" })
    .eq("adminID", r.adminID);
  if (e) { console.error(`  ✗ ${r.adminID}:`, e.message); failN++; } else { okN++; }
}
console.log(`\nAPPLIED — ${okN} blanked · ${failN} failed · ${toFlag.length} flagged-left-untouched.`);

// Re-run the audit to confirm 0 bad rows remain (the verify gate).
const { data: after, error: afterErr } = await sb
  .from("tb_admin")
  .select("adminID, adminStatusSale, adminPicture")
  .eq("adminStatusA", "1");
if (afterErr) { console.error("post-verify read failed", afterErr); process.exit(1); }
const stillBad = (after ?? []).filter((r) => isBad(r.adminPicture));
const stillBadSales = stillBad.filter((r) => r.adminStatusSale === "1");
console.log(`verify — bad rows remaining: ${stillBad.length} total (${toFlag.length} = the flagged orphan-photo rows, expected) · ${stillBadSales.length} active sales reps (MUST be 0)`);
process.exit(failN || stillBadSales.length ? 1 : 0);
