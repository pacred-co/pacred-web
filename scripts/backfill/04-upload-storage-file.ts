/**
 * Backfill 04 · Upload legacy `storage/file/` tree to `member-docs`.
 *
 * The legacy PHP system kept admin-uploaded reference docs and manuals
 * under `member/storage/file/` (sibling to `storage/slip/`). Backfill 02
 * intentionally skipped this folder because the survey treated the
 * `storage/file/` mapping as customer-doc-only and the local dump turned
 * out to also contain admin manuals + ToS PDFs that don't fit the
 * `member-docs/legacy-uploads/file/` convention.
 *
 * This script walks the folder recursively (preserving subfolders like
 * `manual/`) and uploads everything to `member-docs` under
 * `legacy/storage-file/<original-relative-path>`. That keeps the legacy
 * tree intact and inspectable, separate from the existing
 * `legacy-images/` + `legacy-uploads/` prefixes from backfill 02.
 *
 * Source: C:/Users/Admin/pcscargo/member/storage/file/  (small: 1 PDF + manual/)
 * Bucket: `member-docs`
 * Prefix: `legacy/storage-file/`
 *
 * Pre-requisites:
 *   .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   pnpm tsx scripts/backfill/04-upload-storage-file.ts [--source <dir>] [--dry-run]
 *
 * SAFETY: service-role key — do NOT log it, do NOT commit the env file.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, posix, relative, sep } from "node:path";

// ───────────────────────────────────────────────────────────────────────────
// Constants.
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_SOURCE = "C:\\Users\\Admin\\pcscargo\\member\\storage\\file";
const TARGET_BUCKET  = "member-docs";
const TARGET_PREFIX  = "legacy/storage-file";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".pdf":  "application/pdf",
  ".doc":  "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls":  "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt":  "text/plain",
};

// ───────────────────────────────────────────────────────────────────────────
// .env.local loader (kept self-contained per backfill convention).
// ───────────────────────────────────────────────────────────────────────────

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
Backfill 04 · Upload legacy storage/file tree → ${TARGET_BUCKET}/${TARGET_PREFIX}/

Usage:
  pnpm tsx scripts/backfill/04-upload-storage-file.ts [options]

Options:
  --source <dir>   Source directory (default: ${DEFAULT_SOURCE})
  --dry-run        List files but do not upload
  -h, --help       Show this help
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
  /** POSIX path relative to source root (preserves subfolders e.g. `manual/foo.pdf`). */
  relativePath: string;
  size:         number;
  mimeType:     string;
  targetPath:   string;
}

function walk(absDir: string, rootAbs: string, out: ToUpload[]): void {
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch (e) {
    console.warn(`  ! skip unreadable dir: ${absDir} (${(e as Error).message})`);
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const abs = join(absDir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(abs, rootAbs, out);
    } else if (st.isFile()) {
      const rel = relative(rootAbs, abs).split(sep).join(posix.sep);
      out.push({
        absolutePath: abs,
        relativePath: rel,
        size:         st.size,
        mimeType:     sniffMime(name),
        targetPath:   posix.join(TARGET_PREFIX, rel),
      });
    }
  }
}

function collectFiles(sourceDir: string): ToUpload[] {
  if (!existsSync(sourceDir)) {
    console.error(`ERROR: source dir not found: ${sourceDir}`);
    process.exit(1);
  }
  const out: ToUpload[] = [];
  walk(sourceDir, sourceDir, out);
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
    upsert:      true, // idempotent re-runs
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
      console.log(`  ${f.relativePath.padEnd(48)}  ${fmtBytes(f.size).padStart(10)}  →  ${TARGET_BUCKET}/${f.targetPath}`);
    }
    console.log(`\nDry-run complete — re-run without --dry-run to upload.`);
    return;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let okCount = 0;
  const failed: Array<{ relativePath: string; error: string }> = [];

  for (const f of files) {
    const r = await uploadOne(supabase, f);
    if (r.ok) {
      okCount++;
      console.log(`  OK    ${f.relativePath.padEnd(48)} (${fmtBytes(f.size)})  →  ${TARGET_BUCKET}/${f.targetPath}`);
    } else {
      failed.push({ relativePath: f.relativePath, error: r.error });
      console.error(`  FAIL  ${f.relativePath}: ${r.error}`);
    }
  }

  console.log(`\nDone.  uploaded=${okCount}  failed=${failed.length}  total=${files.length}`);
  if (failed.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
