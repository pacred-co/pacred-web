/**
 * Backfill 06 · Upload prod FTP backup to Supabase Storage via S3 protocol.
 *
 * Background (2026-05-23 evening): ภูม downloaded the full 34 GB FTP backup
 * from vps185.nokhosting.com (/home/pcsc/) to D:\REALSHITDATAPCS\pcsc\. The
 * customer files live under public_html/member/{images,storage}/. 78K files
 * total · ~10 GB. ภูม chose S3 protocol + upload at ORIGINAL size (no resize).
 *
 * Survey results (2026-05-23):
 *   member/images/admin/        119 files  /  ~ 30 MB    → member-docs/legacy-images/admin/
 *   member/images/notify/        18 files  /  ~  6 MB    → member-docs/legacy-images/notify/
 *   member/images/users/        734 files  /  127 MB     → member-docs/legacy-images/users/
 *   member/images/shops/     40,686 files  / 2.04 GB     → forwarder-covers/legacy-shops/   ← BIG
 *   member/storage/slip/     35,515 files  / 6.84 GB     → slips/legacy/                    ← BIG
 *   member/storage/file/      1,199 files  / 1.03 GB     → member-docs/legacy-uploads/file/
 *   member/storage/csv/          52 files  /  580 KB     → member-docs/legacy-uploads/csv/
 *   ────────────────────────────────────────────────────────
 *   TOTAL                    78,323 files  /  ~10 GB
 *
 * S3 endpoint: https://yzljakczhwrpbxflnmco.storage.supabase.co/storage/v1/s3
 * Region:      ap-southeast-1
 * Credentials: SUPABASE_S3_ACCESS_KEY_ID + SUPABASE_S3_SECRET_ACCESS_KEY
 *              (created in Dashboard → Project Settings → Storage → S3 Access Keys)
 *              KEYS LIVE IN .env.local ONLY · NEVER COMMITTED · ROTATE AFTER UPLOAD.
 *
 * Why S3 vs supabase-js: ภูม preference (project-wide standard).
 * forcePathStyle:true is REQUIRED — Supabase Storage uses path-style URLs.
 *
 * Idempotent: PutObject overwrites (S3 default). Progress saved to
 * scripts/backfill/.progress/06-<rule>.json so re-runs after crashes skip
 * already-uploaded files.
 *
 * Usage:
 *   pnpm tsx scripts/backfill/06-upload-prod-ftp.ts                # dry-run
 *   pnpm tsx scripts/backfill/06-upload-prod-ftp.ts --apply        # upload
 *   pnpm tsx scripts/backfill/06-upload-prod-ftp.ts --apply --concurrency 16
 *   pnpm tsx scripts/backfill/06-upload-prod-ftp.ts --apply --rule slip
 *
 * Estimated time at concurrency 16: 1-2 hours for 78K files.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync,
} from "node:fs";
import { join, posix, sep, extname, relative } from "node:path";

// ─── ENV LOADER ──────────────────────────────────────────────────────────
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

// ─── RULES ────────────────────────────────────────────────────────────────
interface Rule {
  name:      string;
  sourceDir: string;
  bucket:    string;
  prefix:    string;
  purpose:   string;
}

const PROD_ROOT     = "D:\\REALSHITDATAPCS\\pcsc\\public_html\\member";
const PROD_WP_ROOT  = "D:\\REALSHITDATAPCS\\pcsc\\public_html\\wp-content\\uploads";
const SF_WP_ROOT    = "D:\\REALSHITDATAPCS\\pcsc\\pcs-seafreight.com\\wp-content\\uploads";

// 2026-05-23 night — added wp-prod + seafreight-wp + img rules after a
// full D:\REALSHITDATAPCS audit (per ภูม request). Discovered the dev rar
// snapshot only had 694 wp-content files vs 5,154 on prod (4,460 missed),
// and pcs-seafreight.com sister-site WP media (268 files) was completely
// absent. PCS→PR branding rule: the bucket PREFIX uses `legacy-` (historic
// PCS data marker · OK to keep). The Pacred (PR) brand applies to NEW UI
// text + paths we generate going forward — legacy filenames keep their
// `PCSnnnn_*` form because tb_* DB rows reference them by that exact name.

const RULES: Rule[] = [
  {
    name:      "admin",
    sourceDir: join(PROD_ROOT, "images", "admin"),
    bucket:    "member-docs",
    prefix:    "legacy-images/admin",
    purpose:   "Staff profile pictures (sidebar avatar)",
  },
  {
    name:      "notify",
    sourceDir: join(PROD_ROOT, "images", "notify"),
    bucket:    "member-docs",
    prefix:    "legacy-images/notify",
    purpose:   "Admin push-notice images",
  },
  {
    name:      "users",
    sourceDir: join(PROD_ROOT, "images", "users"),
    bucket:    "member-docs",
    prefix:    "legacy-images/users",
    purpose:   "Customer profile pictures (+ 50x50/ thumbs)",
  },
  {
    name:      "shops",
    sourceDir: join(PROD_ROOT, "images", "shops"),
    bucket:    "forwarder-covers",
    prefix:    "legacy-shops",
    purpose:   "Shop logos + forwarder covers (legacy mixed both in shops/)",
  },
  {
    name:      "slip",
    sourceDir: join(PROD_ROOT, "storage", "slip"),
    bucket:    "slips",
    prefix:    "legacy",
    purpose:   "Wallet-deposit slips (35K historic)",
  },
  {
    name:      "file",
    sourceDir: join(PROD_ROOT, "storage", "file"),
    bucket:    "member-docs",
    prefix:    "legacy-uploads/file",
    purpose:   "ID-card + admin manual PDFs + customer cert scans",
  },
  {
    name:      "csv",
    sourceDir: join(PROD_ROOT, "storage", "csv"),
    bucket:    "member-docs",
    prefix:    "legacy-uploads/csv",
    purpose:   "Bulk CSV uploads (admin imports)",
  },
  {
    name:      "wp-prod",
    sourceDir: PROD_WP_ROOT,
    bucket:    "member-docs",
    prefix:    "legacy-wp/uploads",
    purpose:   "WordPress media library — pcscargo.com (5K · banners/blog/page hero/responsive sizes)",
  },
  {
    name:      "seafreight-wp",
    sourceDir: SF_WP_ROOT,
    bucket:    "member-docs",
    prefix:    "legacy-pcsfreight-wp/uploads",
    purpose:   "WordPress media library — pcs-seafreight.com sister site (268)",
  },
];

const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".heic", ".bmp",
  ".tif", ".tiff", ".csv", ".xlsx", ".xls",
]);
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif",  ".webp": "image/webp", ".pdf": "application/pdf",
  ".heic": "image/heic", ".bmp": "image/bmp",
  ".tif": "image/tiff",  ".tiff": "image/tiff",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};
function sniffMime(name: string): string {
  return MIME_BY_EXT[extname(name).toLowerCase()] ?? "application/octet-stream";
}

// ─── WALK ─────────────────────────────────────────────────────────────────
interface Found { abs: string; rel: string; size: number; mime: string; }
function walk(absDir: string, rootAbs: string): Found[] {
  const out: Found[] = [];
  let entries: string[];
  try { entries = readdirSync(absDir); }
  catch { return out; }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
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

function safePathPart(s: string): string {
  return s.replace(/[^\w./\-]/g, "_");
}

// ─── CLI ──────────────────────────────────────────────────────────────────
interface Args {
  apply: boolean; concurrency: number; rule: string | null;
  limit: number; resume: boolean; help: boolean;
}
function parseArgs(argv: string[]): Args {
  const a: Args = {
    apply: false, concurrency: 16, rule: null, limit: 0, resume: true, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--help" || x === "-h") a.help = true;
    else if (x === "--apply") a.apply = true;
    else if (x === "--concurrency") a.concurrency = parseInt(argv[++i] ?? "16", 10);
    else if (x === "--rule") a.rule = argv[++i] ?? null;
    else if (x === "--limit") a.limit = parseInt(argv[++i] ?? "0", 10);
    else if (x === "--no-resume") a.resume = false;
  }
  return a;
}
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

// ─── PROGRESS ────────────────────────────────────────────────────────────
const PROGRESS_DIR = join(process.cwd(), "scripts", "backfill", ".progress");
function progressPath(ruleName: string): string {
  return join(PROGRESS_DIR, `06-${ruleName}.json`);
}
interface ProgressFile { done: Record<string, true>; failed: Record<string, string>; }
function loadProgress(name: string): ProgressFile {
  const p = progressPath(name);
  if (!existsSync(p)) return { done: {}, failed: {} };
  try { return JSON.parse(readFileSync(p, "utf8")) as ProgressFile; }
  catch { return { done: {}, failed: {} }; }
}
function saveProgress(name: string, pf: ProgressFile): void {
  if (!existsSync(PROGRESS_DIR)) mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(progressPath(name), JSON.stringify(pf), "utf8");
}

// ─── UPLOAD (S3 PutObject) ───────────────────────────────────────────────
interface Item { abs: string; bucket: string; key: string; size: number; mime: string; }

async function uploadOne(
  s3: S3Client, it: Item,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let buf: Buffer;
  try { buf = readFileSync(it.abs); }
  catch (e) { return { ok: false, error: `read: ${(e as Error).message}` }; }

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      it.bucket,
      Key:         it.key,
      Body:        buf,
      ContentType: it.mime,
    }));
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return { ok: false, error: msg.slice(0, 200) };
  }
}

async function uploadAll(
  s3: S3Client, items: Item[], concurrency: number,
  progress: ProgressFile, ruleName: string, startedAt: number,
): Promise<{ ok: number; failed: number; skipped: number }> {
  let cursor = 0, ok = 0, failed = 0, skipped = 0;
  const total = items.length;
  let lastSave = Date.now();

  async function worker() {
    while (cursor < total) {
      const i = cursor++;
      const it = items[i];
      const trackKey = `${it.bucket}/${it.key}`;
      if (progress.done[trackKey]) { skipped++; continue; }

      const r = await uploadOne(s3, it);
      if (r.ok) {
        progress.done[trackKey] = true;
        delete progress.failed[trackKey];
        ok++;
      } else {
        progress.failed[trackKey] = r.error;
        failed++;
        if (failed <= 20 || failed % 50 === 0) {
          console.warn(`  ✘ ${trackKey}  (${r.error.slice(0, 80)})`);
        }
      }

      if ((ok + failed) % 200 === 0) {
        saveProgress(ruleName, progress);
        const elapsed = (Date.now() - startedAt) / 1000;
        const processed = ok + failed;
        const rate = processed / elapsed;
        const remaining = total - (ok + failed + skipped);
        const eta = rate > 0 ? Math.round(remaining / rate) : 0;
        console.log(`  …${processed}/${total}  (ok ${ok} · fail ${failed} · skip ${skipped})  ${rate.toFixed(1)}/s  ETA ${Math.floor(eta / 60)}m${eta % 60}s`);
        lastSave = Date.now();
      } else if (Date.now() - lastSave > 30_000) {
        saveProgress(ruleName, progress);
        lastSave = Date.now();
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  saveProgress(ruleName, progress);
  return { ok, failed, skipped };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Backfill 06 · Upload prod FTP backup to Supabase Storage via S3 protocol

Usage:
  pnpm tsx scripts/backfill/06-upload-prod-ftp.ts [options]

Options:
  --apply              Actually upload (default: dry-run)
  --concurrency N      Parallel uploads (default: 16)
  --rule <name>        Only run a specific rule (admin|notify|users|shops|slip|file|csv)
  --limit N            Stop after N files per rule (debug)
  --no-resume          Ignore progress file; re-upload everything

Progress saved to scripts/backfill/.progress/06-<rule>.json (gitignored).
`);
    return;
  }

  if (!existsSync(PROD_ROOT)) {
    console.error(`ERROR: prod root not found: ${PROD_ROOT}`);
    process.exit(1);
  }

  const env = loadEnvLocal();
  let s3: S3Client | null = null;
  if (args.apply) {
    const ep = env.SUPABASE_S3_ENDPOINT;
    const region = env.SUPABASE_S3_REGION;
    const key = env.SUPABASE_S3_ACCESS_KEY_ID;
    const secret = env.SUPABASE_S3_SECRET_ACCESS_KEY;
    if (!ep || !region || !key || !secret) {
      console.error(`ERROR: missing one of SUPABASE_S3_{ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY} in .env.local`);
      process.exit(1);
    }
    s3 = new S3Client({
      endpoint:        ep,
      region:          region,
      credentials:     { accessKeyId: key, secretAccessKey: secret },
      forcePathStyle:  true,   // required for Supabase Storage
    });
    console.log(`S3 client initialised — endpoint ${ep} (region ${region})`);
  }

  const rules = args.rule
    ? RULES.filter((r) => r.name === args.rule)
    : RULES;
  if (rules.length === 0) {
    console.error(`ERROR: --rule ${args.rule} not found. Available: ${RULES.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }

  let grandOk = 0, grandFailed = 0, grandSkipped = 0, grandFiles = 0, grandBytes = 0;
  const t0 = Date.now();

  for (const rule of rules) {
    console.log(`\n────────────────────────────────────────`);
    console.log(`Rule: ${rule.name}  (${rule.purpose})`);
    console.log(`  src: ${rule.sourceDir}`);
    console.log(`  dst: ${rule.bucket}/${rule.prefix}/`);

    if (!existsSync(rule.sourceDir)) {
      console.log(`  - skip (missing source)`);
      continue;
    }

    console.log(`  Walking...`);
    const found = walk(rule.sourceDir, rule.sourceDir);
    const items: Item[] = found.map((f) => ({
      abs:    f.abs,
      bucket: rule.bucket,
      key:    posix.join(rule.prefix, safePathPart(f.rel)),
      size:   f.size,
      mime:   f.mime,
    }));
    const totalBytes = items.reduce((s, x) => s + x.size, 0);
    grandFiles += items.length;
    grandBytes += totalBytes;
    console.log(`  Found: ${items.length} files · ${fmtBytes(totalBytes)}`);

    if (args.limit > 0 && args.limit < items.length) {
      console.log(`  (--limit ${args.limit} — truncating)`);
      items.length = args.limit;
    }

    if (!args.apply) {
      console.log(`  DRY-RUN — pass --apply to upload`);
      continue;
    }

    const progress = args.resume ? loadProgress(rule.name) : { done: {}, failed: {} };
    const doneCount = Object.keys(progress.done).length;
    if (doneCount > 0) console.log(`  Resuming — ${doneCount} already done`);

    const ruleStart = Date.now();
    const { ok, failed, skipped } = await uploadAll(
      s3!, items, args.concurrency, progress, rule.name, ruleStart,
    );
    grandOk += ok; grandFailed += failed; grandSkipped += skipped;
    const secs = ((Date.now() - ruleStart) / 1000).toFixed(1);
    console.log(`  ✓ uploaded ${ok} · ✘ failed ${failed} · ⤵ skipped ${skipped}  in ${secs}s`);
  }

  const totalSecs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n════════════════════════════════════════`);
  console.log(`SUMMARY`);
  console.log(`  Files scanned: ${grandFiles}`);
  console.log(`  Total size:    ${fmtBytes(grandBytes)}`);
  if (args.apply) {
    console.log(`  ✓ uploaded:    ${grandOk}`);
    console.log(`  ✘ failed:      ${grandFailed}`);
    console.log(`  ⤵ skipped:     ${grandSkipped}`);
    console.log(`  Time:          ${totalSecs}s`);
    console.log(``);
    console.log(`⚠ REMEMBER: rotate the S3 access key in Supabase Dashboard after this run.`);
    console.log(`  (Project Settings → Storage → S3 Access Keys → delete the row with this Access Key ID)`);
  } else {
    console.log(`  DRY-RUN — pass --apply to upload`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
