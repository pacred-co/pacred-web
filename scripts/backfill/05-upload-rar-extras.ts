/**
 * Backfill 05 · Upload the rest of the legacy rar to Supabase Storage.
 *
 * Background (2026-05-23 evening): ภูม clarified that
 * `C:/Users/Admin/Downloads/newrealdatapcs/newrealdatapcs/pcscargo.rar` (2.1 GB)
 * is the "snapshot ล่าสุด" — copy EVERY customer-facing image+PDF in it, not
 * only the `member/images/` + `member/storage/` subset that backfills 02-04
 * covered. ภูม said: *"มันเป็นไฟล์ประวัติย้อนหลัง ไม่ได้ครบตั้งแต่บริษัทเปิด
 * ที่บอกให้เอามาครบทั้งหมดคือเอามาทั้งหมดที่มีตามที่ส่งไปให้ทั้งหมดนั้นแหละ"*.
 *
 * Backfills 02-04 covered:
 *   ✅ member/images/{admin,users,notify,shops}/...
 *   ✅ member/storage/{slip,file}/...
 *
 * This script covers the EXTRA customer-facing dirs in the rar:
 *   - wp-content/uploads/                  → member-docs/legacy-wp/
 *     (WordPress media — banners + blog images, ~694 files)
 *   - shop/<collection>/                   → member-docs/legacy-shop/
 *     (demo shop product photos — Air Jordan, Yeezy, Dunk, Airforce, ~32 files)
 *   - member/pcs-admin/{include,f-receipt} → member-docs/legacy-pcs-admin/
 *     (admin reference scans embedded in the legacy admin UI)
 *   - member/img/                          → member-docs/legacy-misc/img/
 *   - member/sms/                          → member-docs/legacy-misc/sms/
 *
 * Skipped on purpose (NOT customer-facing — UI assets / template / WP core):
 *   - member/assets/**                     (Bootstrap-4 template assets)
 *   - member/fonts/**                      (Font Awesome icons)
 *   - member/PHPMailer/**                  (mailer-library example images)
 *   - wp-admin/**                          (WordPress core admin chrome)
 *   - wp-includes/**                       (WordPress core)
 *   - wp-content/plugins/**                (3rd-party plugin assets)
 *   - wp-content/themes/**                 (theme stylesheet images)
 *   - wp-content/upgrade/**                (WordPress core upgrade staging)
 *   - wp-content/maintenance/**            (WordPress maintenance page)
 *
 * Pre-requisites:
 *   - pcscargo.rar already extracted to <root> (default
 *     C:/Users/Admin/Downloads/newrealdatapcs/_extracted_full/pcscargo).
 *   - .env.local at repo root with NEXT_PUBLIC_SUPABASE_URL +
 *     SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   pnpm tsx scripts/backfill/05-upload-rar-extras.ts [--root <path>] [--apply]
 *                                                     [--concurrency N] [--limit N]
 *
 * Default --dry-run (lists what WOULD upload). Pass --apply to actually upload.
 * Idempotent: `upsert: true` so re-runs are safe.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, posix, sep, extname, relative } from "node:path";

// ─── ENV LOADER (same pattern as 02-upload-files.ts) ───────────────────────

function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error(`ERROR: .env.local not found at ${envPath}`);
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [
          l.slice(0, idx).trim(),
          l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

// ─── INCLUDE / EXCLUDE MAP ─────────────────────────────────────────────────
// Posix-style relative paths (relative to <root>). Each rule:
//   - sourceDir: where in the extracted tree to walk
//   - bucket:    target Supabase Storage bucket
//   - prefix:    path prefix inside the bucket; final = `<prefix>/<relPath>`

interface Rule {
  sourceDir: string;
  bucket:    string;
  prefix:    string;
  purpose:   string;
}

const INCLUDE_RULES: Rule[] = [
  {
    sourceDir: "wp-content/uploads",
    bucket:    "member-docs",
    prefix:    "legacy-wp/uploads",
    purpose:   "WordPress media library (banners, blog images, page hero)",
  },
  {
    sourceDir: "shop",
    bucket:    "member-docs",
    prefix:    "legacy-shop",
    purpose:   "Demo shop product photos (Air Jordan, Yeezy, Dunk, Airforce)",
  },
  {
    sourceDir: "member/pcs-admin/include",
    bucket:    "member-docs",
    prefix:    "legacy-pcs-admin/include",
    purpose:   "Admin reference images embedded in pcs-admin/include/*",
  },
  {
    sourceDir: "member/pcs-admin/f-receipt",
    bucket:    "member-docs",
    prefix:    "legacy-pcs-admin/f-receipt",
    purpose:   "Receipt template/scan assets",
  },
  {
    sourceDir: "member/img",
    bucket:    "member-docs",
    prefix:    "legacy-misc/img",
    purpose:   "Misc member/img directory",
  },
  {
    sourceDir: "member/sms",
    bucket:    "member-docs",
    prefix:    "legacy-misc/sms",
    purpose:   "Misc member/sms directory",
  },
];

// Allowed file extensions (customer-facing media only). All comparisons
// lower-cased.
const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".heic", ".bmp",
  ".tif", ".tiff",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".pdf":  "application/pdf",
  ".heic": "image/heic",
  ".bmp":  "image/bmp",
  ".tif":  "image/tiff",
  ".tiff": "image/tiff",
};

function sniffMime(filename: string): string {
  return MIME_BY_EXT[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

// ─── WALK ────────────────────────────────────────────────────────────────

interface Found {
  abs:    string;
  rel:    string;        // posix path relative to <sourceDir>
  size:   number;
  mime:   string;
}

function walk(absDir: string, rootAbs: string): Found[] {
  const out: Found[] = [];
  let entries: string[];
  try { entries = readdirSync(absDir); }
  catch (e) {
    console.warn(`  ! skip unreadable: ${absDir} (${(e as Error).message})`);
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;     // dotfiles
    const abs = join(absDir, name);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      out.push(...walk(abs, rootAbs));
    } else if (st.isFile()) {
      const ext = extname(name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const rel = relative(rootAbs, abs).split(sep).join(posix.sep);
      out.push({ abs, rel, size: st.size, mime: sniffMime(name) });
    }
  }
  return out;
}

// ─── SAFE FILENAME — same rule as lib/storage/upload.ts ────────────────────
function safePathPart(s: string): string {
  // Replace any chars Supabase Storage doesn't like with _.
  // Keep slashes (we WANT to preserve subdirs).
  return s.replace(/[^\w./\-]/g, "_");
}

// ─── CLI ──────────────────────────────────────────────────────────────────

interface Args {
  root:        string;
  apply:       boolean;
  concurrency: number;
  limit:       number;
  help:        boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    root: "C:\\Users\\Admin\\Downloads\\newrealdatapcs\\_extracted_full\\pcscargo",
    apply: false,
    concurrency: 4,
    limit: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--help" || x === "-h") a.help = true;
    else if (x === "--root") a.root = argv[++i] ?? a.root;
    else if (x === "--apply") a.apply = true;
    else if (x === "--concurrency") a.concurrency = parseInt(argv[++i] ?? "4", 10);
    else if (x === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10);
  }
  return a;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────

interface UploadItem {
  abs:        string;
  bucket:     string;
  targetPath: string;
  size:       number;
  mime:       string;
}

async function uploadOne(
  sb: SupabaseClient,
  item: UploadItem,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let buf: Buffer;
  try { buf = readFileSync(item.abs); }
  catch (e) { return { ok: false, error: `read failed: ${(e as Error).message}` }; }

  const { error } = await sb.storage.from(item.bucket).upload(item.targetPath, buf, {
    contentType: item.mime,
    upsert: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function uploadAll(
  sb: SupabaseClient,
  items: UploadItem[],
  concurrency: number,
): Promise<{ ok: number; failed: { item: UploadItem; error: string }[] }> {
  let ok = 0;
  const failed: { item: UploadItem; error: string }[] = [];
  let cursor = 0;
  const total = items.length;

  async function worker() {
    while (cursor < total) {
      const i = cursor++;
      const it = items[i];
      const r = await uploadOne(sb, it);
      if (r.ok) {
        ok++;
        if (ok % 50 === 0 || ok === total) {
          console.log(`  …uploaded ${ok}/${total}`);
        }
      } else {
        failed.push({ item: it, error: r.error });
        console.warn(`  ✘ ${it.bucket}/${it.targetPath}  (${r.error})`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, failed };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Backfill 05 · Upload pcscargo.rar extras to Supabase Storage

Usage:
  pnpm tsx scripts/backfill/05-upload-rar-extras.ts [options]

Options:
  --root <path>          Extracted rar root (default: <newrealdatapcs>/_extracted_full/pcscargo)
  --apply                Actually upload (default: dry-run)
  --concurrency N        Parallel uploads (default: 4)
  --limit N              Stop after N files (0 = unlimited)
  -h, --help             Show this help

Idempotent: upsert:true.
`);
    return;
  }

  if (!existsSync(args.root)) {
    console.error(`ERROR: --root not found: ${args.root}`);
    console.error(`Extract pcscargo.rar first:`);
    console.error(`  7z x "C:/Users/Admin/Downloads/newrealdatapcs/newrealdatapcs/pcscargo.rar" -y`);
    process.exit(1);
  }

  console.log(`Scanning extracted rar root: ${args.root}\n`);

  // Build full upload list.
  const items: UploadItem[] = [];
  for (const rule of INCLUDE_RULES) {
    const absDir = join(args.root, ...rule.sourceDir.split("/"));
    if (!existsSync(absDir)) {
      console.log(`  - ${rule.sourceDir.padEnd(35)}  (missing — skip)`);
      continue;
    }
    const found = walk(absDir, absDir);
    let bytes = 0;
    for (const f of found) {
      const safeRel = safePathPart(f.rel);
      const targetPath = posix.join(rule.prefix, safeRel);
      items.push({
        abs:        f.abs,
        bucket:     rule.bucket,
        targetPath,
        size:       f.size,
        mime:       f.mime,
      });
      bytes += f.size;
    }
    console.log(
      `  + ${rule.sourceDir.padEnd(35)}  ${String(found.length).padStart(5)} files  ${fmtBytes(bytes).padStart(10)}  →  ${rule.bucket}/${rule.prefix}/`,
    );
  }

  const totalBytes = items.reduce((s, x) => s + x.size, 0);
  console.log(`\nTOTAL TO UPLOAD: ${items.length} files · ${fmtBytes(totalBytes)}`);

  if (args.limit > 0 && args.limit < items.length) {
    console.log(`(--limit ${args.limit} — truncating)`);
    items.length = args.limit;
  }

  if (!args.apply) {
    console.log(`\nDRY-RUN. Pass --apply to upload.`);
    return;
  }

  // Load env + init client.
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`ERROR: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local`);
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\nUploading to ${url} ...\n`);
  const t0 = Date.now();
  const { ok, failed } = await uploadAll(sb, items, args.concurrency);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n────────────────────────────────────────`);
  console.log(`✓ uploaded:  ${ok}/${items.length}  in ${secs}s`);
  if (failed.length > 0) {
    console.log(`✘ failed:    ${failed.length}`);
    console.log(`First 10 failures:`);
    for (const f of failed.slice(0, 10)) {
      console.log(`  ${f.item.bucket}/${f.item.targetPath}  →  ${f.error}`);
    }
  } else {
    console.log(`✘ failed:    0`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
