/**
 * Backfill 03 · Upload legacy wallet-deposit slips to the `slips` bucket.
 *
 * Background — ภูม flagged on 2026-05-22 that the customer-facing payment
 * slips from the legacy PHP system never landed in Supabase Storage.
 * Backfill 02 only covered files under `member/images/*` + dumped storage
 * docs into the `member-docs` bucket. This script handles the eight slips
 * we still have locally under `member/storage/slip/`, placing them in the
 * dedicated `slips` bucket (created in migration `0007_wallet.sql`) under
 * a `legacy/` prefix so they don't collide with new customer/admin slips
 * that follow the `{user_id}/{kind}/{filename}` layout.
 *
 * Source: C:/Users/Admin/pcscargo/member/storage/slip/  (8 files, ~few MB)
 * Bucket: `slips`
 * Prefix: `legacy/`
 *
 * Pre-requisites:
 *   .env.local at the worktree root with
 *     NEXT_PUBLIC_SUPABASE_URL=https://yzljakczhwrpbxflnmco.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage:
 *   pnpm tsx scripts/backfill/03-upload-slips.ts [--source <dir>] [--dry-run]
 *
 * Default behaviour APPLIES uploads (these are eight small files — dry-run
 * adds friction without value). Pass `--dry-run` to preview. Re-running is
 * idempotent: `upsert: true` overwrites byte-for-byte but the filenames are
 * unique so collisions are not expected.
 *
 * Filename safety — every file in this batch is already ASCII-safe
 * (`PCS<member>_<timestamp>.<ext>` or `PCS<member>-<date>-<stamp>.webp`) so
 * the Supabase Storage key rules pass without renaming. If a future batch
 * contains Thai characters, refer to `docs/learnings/supabase-storage-bulk-upload.md`.
 *
 * SAFETY: service-role key — do NOT log it, do NOT commit the env file.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

// ───────────────────────────────────────────────────────────────────────────
// Constants.
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_SOURCE = "C:\\Users\\Admin\\pcscargo\\member\\storage\\slip";
const TARGET_BUCKET  = "slips";
const TARGET_PREFIX  = "legacy";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".pdf":  "application/pdf",
};

// ───────────────────────────────────────────────────────────────────────────
// .env.local loader — copied from 02-upload-files.ts so both scripts stay
// self-contained (no shared util — easier to delete after backfill is done).
// ───────────────────────────────────────────────────────────────────────────

function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error(`ERROR: .env.local not found at ${envPath}`);
    console.error(`Copy .env.local from the main worktree first.`);
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
          l
            .slice(idx + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// CLI.
// ───────────────────────────────────────────────────────────────────────────

interface Args {
  source: string;
  dryRun: boolean;
  help:   boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { source: DEFAULT_SOURCE, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--source") args.source = argv[++i] ?? args.source;
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function printHelp(): void {
  console.log(`
Backfill 03 · Upload legacy wallet-deposit slips → Supabase Storage

Usage:
  pnpm tsx scripts/backfill/03-upload-slips.ts [options]

Options:
  --source <dir>   Source directory (default: ${DEFAULT_SOURCE})
  --dry-run        List files but do not upload
  -h, --help       Show this help

Target: bucket=${TARGET_BUCKET}, prefix=${TARGET_PREFIX}/
`);
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers.
// ───────────────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function sniffMime(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

interface ToUpload {
  absolutePath: string;
  name:         string;
  size:         number;
  mimeType:     string;
  targetPath:   string;
}

function collectFiles(sourceDir: string): ToUpload[] {
  if (!existsSync(sourceDir)) {
    console.error(`ERROR: source dir not found: ${sourceDir}`);
    process.exit(1);
  }
  const out: ToUpload[] = [];
  for (const name of readdirSync(sourceDir)) {
    if (name.startsWith(".")) continue;
    const abs = join(sourceDir, name);
    const st = statSync(abs);
    if (!st.isFile()) continue;
    out.push({
      absolutePath: abs,
      name,
      size:         st.size,
      mimeType:     sniffMime(name),
      // Bucket-relative POSIX path. Keep original filename (already ASCII).
      targetPath:   `${TARGET_PREFIX}/${name}`,
    });
  }
  return out;
}

async function uploadOne(
  supabase: SupabaseClient,
  entry: ToUpload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(entry.absolutePath);
  } catch (e) {
    return { ok: false, error: `read failed: ${(e as Error).message}` };
  }
  const { error } = await supabase.storage.from(TARGET_BUCKET).upload(entry.targetPath, bytes, {
    contentType: entry.mimeType,
    upsert:      true, // small batch · idempotent re-runs · ok to overwrite
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Main.
// ───────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env.local");
    process.exit(1);
  }

  const files = collectFiles(args.source);
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  console.log(`Mode:       ${args.dryRun ? "DRY-RUN" : "APPLY"}`);
  console.log(`Source:     ${args.source}`);
  console.log(`Supabase:   ${url}`);
  console.log(`Bucket:     ${TARGET_BUCKET}`);
  console.log(`Prefix:     ${TARGET_PREFIX}/`);
  console.log(`Files:      ${files.length}  (${fmtBytes(totalBytes)})`);
  console.log();

  if (files.length === 0) {
    console.log("Nothing to upload — exiting.");
    return;
  }

  if (args.dryRun) {
    for (const f of files) {
      console.log(`  ${basename(f.absolutePath).padEnd(48)}  ${fmtBytes(f.size).padStart(10)}  →  ${TARGET_BUCKET}/${f.targetPath}`);
    }
    console.log(`\nDry-run complete — re-run without --dry-run to upload.`);
    return;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let okCount = 0;
  const failed: Array<{ name: string; error: string }> = [];

  for (const f of files) {
    const r = await uploadOne(supabase, f);
    if (r.ok) {
      okCount++;
      console.log(`  OK    ${f.name.padEnd(48)} (${fmtBytes(f.size)})  →  ${TARGET_BUCKET}/${f.targetPath}`);
    } else {
      failed.push({ name: f.name, error: r.error });
      console.error(`  FAIL  ${f.name}: ${r.error}`);
    }
  }

  console.log(`\nDone.  uploaded=${okCount}  failed=${failed.length}  total=${files.length}`);
  if (failed.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
