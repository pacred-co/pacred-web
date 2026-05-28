/**
 * Backfill 02 · Upload legacy customer files to Supabase Storage.
 *
 * Reads the manifest produced by `01-survey.ts` and uploads each file to its
 * target Supabase Storage bucket via the service-role key. Skips files that
 * already exist (HEAD probe). Writes a `.failed.json` next to the manifest
 * for any uploads that errored, so the script can be re-run safely.
 *
 * Pre-requisites:
 *   .env.local at repo root must contain:
 *     NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage:
 *   pnpm tsx scripts/backfill/02-upload-files.ts [--manifest <path>] [--limit N]
 *                                                [--concurrency N] [--bucket name]
 *                                                [--apply] [--help]
 *
 * Default is --dry-run (no uploads). Pass --apply to actually upload.
 *
 * SAFETY: requires --apply explicitly. Service-role key — do NOT commit the
 * resulting `.failed.json` if it contains customer-PII filenames.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

// ───────────────────────────────────────────────────────────────────────────
// Types — mirror 01-survey.ts ManifestEntry exactly.
// ───────────────────────────────────────────────────────────────────────────

interface ManifestEntry {
  relativePath: string;
  absolutePath: string;
  size:         number;
  mimeType:     string;
  targetBucket: string;
  targetPath:   string;
}

interface FailedEntry extends ManifestEntry {
  error: string;
}

interface Args {
  manifest:    string;
  limit:       number;
  concurrency: number;
  bucket:      string | null;
  apply:       boolean;
  help:        boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// .env.local loader — same pattern as scripts/promote-admin.ts.
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

function parseArgs(argv: string[]): Args {
  const args: Args = {
    manifest:    join(process.cwd(), "scripts", "backfill", "manifest.json"),
    limit:       0,
    concurrency: 4,
    bucket:      null,
    apply:       false,
    help:        false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--manifest") args.manifest = argv[++i] ?? args.manifest;
    else if (a === "--limit") args.limit = Number(argv[++i] ?? "0");
    else if (a === "--concurrency") args.concurrency = Number(argv[++i] ?? "4");
    else if (a === "--bucket") args.bucket = argv[++i] ?? null;
    else if (a === "--apply") args.apply = true;
    else if (a === "--dry-run") args.apply = false;
  }
  return args;
}

function printHelp(): void {
  console.log(`
Backfill 02 · Upload legacy customer files to Supabase Storage

Usage:
  pnpm tsx scripts/backfill/02-upload-files.ts [options]

Options:
  --manifest <path>    Manifest from 01-survey.ts (default: scripts/backfill/manifest.json)
  --limit N            Only upload the first N entries (0 = all; default: 0)
  --concurrency N      Parallel uploads (default: 4)
  --bucket <name>      Only upload entries targeting this bucket (default: all)
  --apply              ACTUALLY UPLOAD. Default is dry-run.
  --dry-run            Skip uploads, just report what would happen.
  -h, --help           Show this help

Pre-requisites:
  .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  Run 01-survey.ts first to produce manifest.json

Behaviour:
  - HEAD-probes each target path; SKIPS if already uploaded (resumable).
  - Writes failures to <manifest>.failed.json for re-run.
  - upsert=false — never overwrites an existing object.

Recommended flow:
  pnpm tsx scripts/backfill/02-upload-files.ts                    # dry-run first
  pnpm tsx scripts/backfill/02-upload-files.ts --limit 5 --apply  # smoke 5 uploads
  pnpm tsx scripts/backfill/02-upload-files.ts --apply             # full run
`);
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers.
// ───────────────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Check if a path already exists in the bucket. Uses list() on the parent
 * dir + name match — the JS client doesn't expose a plain HEAD.
 */
async function objectExists(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<boolean> {
  const dir  = posix.dirname(path);
  const name = posix.basename(path);
  const { data, error } = await supabase.storage.from(bucket).list(dir, {
    limit:  1000,
    search: name,
  });
  if (error) return false;
  return (data ?? []).some((o) => o.name === name);
}

async function uploadOne(
  supabase: SupabaseClient,
  entry: ManifestEntry,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!existsSync(entry.absolutePath)) {
    return { ok: false, error: `source file missing: ${entry.absolutePath}` };
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(entry.absolutePath);
  } catch (e) {
    return { ok: false, error: `read failed: ${(e as Error).message}` };
  }
  // Supabase free tier caps individual files at 50 MB; Pro raises this but
  // still warn — refuse > 500 MB to avoid accidental huge objects.
  if (bytes.byteLength > 500 * 1024 * 1024) {
    return { ok: false, error: `file too large: ${fmtBytes(bytes.byteLength)} (refusing > 500 MB)` };
  }
  const { error } = await supabase.storage.from(entry.targetBucket).upload(entry.targetPath, bytes, {
    contentType: entry.mimeType,
    upsert:      false,
  });
  if (error) {
    // The JS client returns "The resource already exists" with status 409
    // — treat as success (someone else uploaded between our probe + here).
    const msg = error.message || "";
    if (/already exists|Duplicate/i.test(msg)) return { ok: true };
    return { ok: false, error: msg };
  }
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Concurrent runner — simple worker-pool over an array.
// ───────────────────────────────────────────────────────────────────────────

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
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

  if (!existsSync(args.manifest)) {
    console.error(`ERROR: manifest not found: ${args.manifest}`);
    console.error(`Run 01-survey.ts first.`);
    process.exit(1);
  }

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env.local");
    process.exit(1);
  }

  const allEntries = JSON.parse(readFileSync(args.manifest, "utf8")) as ManifestEntry[];
  let entries = allEntries;
  if (args.bucket) entries = entries.filter((e) => e.targetBucket === args.bucket);
  if (args.limit > 0) entries = entries.slice(0, args.limit);

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const mode = args.apply ? "APPLY (uploading)" : "DRY-RUN (no uploads)";
  const totalBytes = entries.reduce((s, e) => s + e.size, 0);
  console.log(`Mode:        ${mode}`);
  console.log(`Manifest:    ${args.manifest}`);
  console.log(`Supabase:    ${url}`);
  console.log(`Entries:     ${entries.length} / ${allEntries.length}`);
  console.log(`Total size:  ${fmtBytes(totalBytes)}`);
  console.log(`Concurrency: ${args.concurrency}\n`);

  if (!args.apply) {
    // Dry-run summary by bucket.
    const byBucket = new Map<string, { count: number; bytes: number }>();
    for (const e of entries) {
      const b = byBucket.get(e.targetBucket) ?? { count: 0, bytes: 0 };
      b.count += 1;
      b.bytes += e.size;
      byBucket.set(e.targetBucket, b);
    }
    for (const [bucket, s] of byBucket) {
      console.log(`  ${bucket.padEnd(20)} ${String(s.count).padStart(6)} files  ${fmtBytes(s.bytes).padStart(10)}`);
    }
    // Show first 5 entries so ภูม can sanity-check.
    console.log(`\nFirst 5 entries:`);
    for (const e of entries.slice(0, 5)) {
      console.log(`  ${e.relativePath} → ${e.targetBucket}/${e.targetPath} (${fmtBytes(e.size)})`);
    }
    console.log(`\nDry-run complete. Pass --apply to actually upload.`);
    return;
  }

  // APPLY.
  const failed: FailedEntry[] = [];
  let uploaded = 0;
  let skipped  = 0;
  const t0 = Date.now();

  await runPool(entries, args.concurrency, async (entry, i) => {
    const tag = `[${i + 1}/${entries.length}]`;
    const exists = await objectExists(supabase, entry.targetBucket, entry.targetPath);
    if (exists) {
      skipped++;
      if ((i + 1) % 50 === 0) console.log(`${tag} skip (exists) ${entry.targetPath}`);
      return;
    }
    const r = await uploadOne(supabase, entry);
    if (r.ok) {
      uploaded++;
      if ((i + 1) % 25 === 0 || entries.length < 25) {
        console.log(`${tag} OK   ${entry.targetBucket}/${entry.targetPath} (${fmtBytes(entry.size)})`);
      }
    } else {
      failed.push({ ...entry, error: r.error });
      console.error(`${tag} FAIL ${entry.targetPath}: ${r.error}`);
    }
  });

  const dt = (Date.now() - t0) / 1000;
  console.log(`\nDone in ${dt.toFixed(1)}s.`);
  console.log(`  uploaded: ${uploaded}`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  failed:   ${failed.length}`);

  if (failed.length > 0) {
    const failedPath = args.manifest.replace(/\.json$/, "") + ".failed.json";
    writeFileSync(failedPath, JSON.stringify(failed, null, 2), "utf8");
    console.log(`\nWrote ${failed.length} failures → ${failedPath}`);
    console.log(`Re-run after fixing: pnpm tsx scripts/backfill/02-upload-files.ts --manifest ${failedPath} --apply`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
