/**
 * Backfill 01 · Survey legacy customer upload directories.
 *
 * Walks the legacy `member/images/` + `member/storage/` trees and emits a
 * manifest mapping each file → its target Supabase Storage bucket + path.
 *
 * The mapping was decided by cross-referencing the legacy PHP source
 * (`pcscargo/member/*.php`) for how each directory is read:
 *
 * | Legacy dir          | Used for                                   | Target bucket | Target path prefix       |
 * |---------------------|--------------------------------------------|---------------|--------------------------|
 * | images/users/       | customer profile pic (profile.php)         | member-docs   | legacy-images/users/     |
 * | images/shops/       | customer shop logo (shops.php / cart.php)  | member-docs   | legacy-images/shops/     |
 * | images/admin/       | staff profile pic (admin sidebar)          | member-docs   | legacy-images/admin/     |
 * | images/notify/      | admin push-notice images (popup.php)       | member-docs   | legacy-images/notify/    |
 * | storage/file/       | customer ID-card / cnt-hs PDFs (register)  | member-docs   | legacy-uploads/file/     |
 * | storage/slip/       | wallet-deposit payment slips (wallet.php)  | member-docs   | legacy-slips/            |
 *
 * Bucket choice — single `member-docs` bucket for everything legacy. Why:
 *   - `member-docs` is already the canonical Pacred customer-doc bucket
 *     (see `actions/admin/cnt-payment.ts` + `supabase/schema.sql` §5).
 *   - The bucket is private + service-role-write — matches the legacy PHP
 *     which served via direct filesystem URL but had no public/private split.
 *     Phase B will add per-table RLS policies (per runbook §4 note 1).
 *   - Avoids creating new buckets that don't exist on prod yet (low-risk).
 *
 * Usage:
 *   pnpm tsx scripts/backfill/01-survey.ts [--root <path>] [--out <path>] [--help]
 *
 * Default --root: C:/Users/Admin/pcscargo/member
 * Default --out:  scripts/backfill/manifest.json
 *
 * Output:
 *   - <out>.json     — array of `{ relativePath, absolutePath, size, mimeType, targetBucket, targetPath }`
 *   - stdout summary — counts + total size per source dir
 *
 * SAFETY: this script ONLY READS the filesystem; it does NOT touch Supabase.
 */

import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, posix, sep, extname, relative } from "node:path";

// ───────────────────────────────────────────────────────────────────────────
// Bucket mapping — keyed by relative top-level dir under <root>.
// ───────────────────────────────────────────────────────────────────────────

interface MappingRule {
  /** Source subdirectory (POSIX, relative to --root). */
  sourceDir: string;
  /** Description of what these files represent in the legacy app. */
  purpose: string;
  /** Target Supabase Storage bucket. */
  targetBucket: string;
  /** Path prefix prepended to the relative filename inside the bucket. */
  targetPrefix: string;
}

const MAPPINGS: MappingRule[] = [
  {
    sourceDir:    "images/users",
    purpose:      "Customer profile pictures (profile.php)",
    targetBucket: "member-docs",
    targetPrefix: "legacy-images/users",
  },
  {
    sourceDir:    "images/shops",
    purpose:      "Customer shop logos (shops.php, cart.php)",
    targetBucket: "member-docs",
    targetPrefix: "legacy-images/shops",
  },
  {
    sourceDir:    "images/admin",
    purpose:      "Staff profile pictures (admin sidebar)",
    targetBucket: "member-docs",
    targetPrefix: "legacy-images/admin",
  },
  {
    sourceDir:    "images/notify",
    purpose:      "Admin push-notice images (popup.php — shown to all customers)",
    targetBucket: "member-docs",
    targetPrefix: "legacy-images/notify",
  },
  {
    sourceDir:    "storage/file",
    purpose:      "Customer ID-card / cnt-hs supporting docs (register.php / users.php / cnt-hs.php)",
    targetBucket: "member-docs",
    targetPrefix: "legacy-uploads/file",
  },
  {
    sourceDir:    "storage/slip",
    purpose:      "Wallet-deposit payment slips (wallet.php)",
    targetBucket: "member-docs",
    targetPrefix: "legacy-slips",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// MIME sniff (extension-based — enough for image / pdf customer files).
// ───────────────────────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".pdf":  "application/pdf",
  ".heic": "image/heic",
  ".bmp":  "image/bmp",
  ".tif":  "image/tiff",
  ".tiff": "image/tiff",
};

function sniffMime(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// ───────────────────────────────────────────────────────────────────────────
// Recursive directory walker (handles arbitrary nesting).
// ───────────────────────────────────────────────────────────────────────────

interface FoundFile {
  /** Path relative to the legacy <root>, POSIX separators. */
  relativePath: string;
  /** Native absolute path (preserves OS separators). */
  absolutePath: string;
  size: number;
  mimeType: string;
}

function walk(absDir: string, rootAbs: string): FoundFile[] {
  const out: FoundFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch (e) {
    console.warn(`  ! skip unreadable dir: ${absDir} (${(e as Error).message})`);
    return out;
  }
  for (const name of entries) {
    // Skip dotfiles like .htaccess — never web-uploaded by customers.
    if (name.startsWith(".")) continue;
    const abs  = join(absDir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(abs, rootAbs));
    } else if (st.isFile()) {
      const rel = relative(rootAbs, abs).split(sep).join(posix.sep);
      out.push({
        relativePath: rel,
        absolutePath: abs,
        size:         st.size,
        mimeType:     sniffMime(name),
      });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Manifest entry — what script 02 reads.
// ───────────────────────────────────────────────────────────────────────────

interface ManifestEntry {
  relativePath: string;
  absolutePath: string;
  size:         number;
  mimeType:     string;
  targetBucket: string;
  /** Bucket-relative path: `<targetPrefix>/<basename>`. */
  targetPath:   string;
}

// ───────────────────────────────────────────────────────────────────────────
// CLI parsing — tiny no-deps parser.
// ───────────────────────────────────────────────────────────────────────────

interface Args {
  root: string;
  out:  string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    root: "C:\\Users\\Admin\\pcscargo\\member",
    out:  join(process.cwd(), "scripts", "backfill", "manifest.json"),
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--root") args.root = argv[++i] ?? args.root;
    else if (a === "--out") args.out = argv[++i] ?? args.out;
  }
  return args;
}

function printHelp(): void {
  console.log(`
Backfill 01 · Survey legacy customer upload directories

Usage:
  pnpm tsx scripts/backfill/01-survey.ts [options]

Options:
  --root <path>   Legacy member/ root (default: C:/Users/Admin/pcscargo/member)
  --out  <path>   Manifest output file (default: scripts/backfill/manifest.json)
  -h, --help      Show this help

What it does:
  Walks <root>/images/{users,shops,admin,notify} + <root>/storage/{file,slip},
  decides which Supabase Storage bucket each file belongs in, and writes a
  manifest JSON that script 02-upload-files.ts consumes.

  READS ONLY — does not touch Supabase.
`);
}

// ───────────────────────────────────────────────────────────────────────────
// Main.
// ───────────────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!existsSync(args.root)) {
    console.error(`ERROR: --root not found: ${args.root}`);
    console.error(`(legacy member/ should be at C:\\Users\\Admin\\pcscargo\\member on ภูม's box)`);
    process.exit(1);
  }

  console.log(`Surveying legacy uploads under: ${args.root}`);
  console.log(`Manifest output: ${args.out}\n`);

  const manifest: ManifestEntry[] = [];
  const perDir = new Map<string, { count: number; bytes: number }>();

  for (const rule of MAPPINGS) {
    const absDir = join(args.root, ...rule.sourceDir.split("/"));
    if (!existsSync(absDir)) {
      console.log(`  - skip (missing): ${rule.sourceDir}`);
      perDir.set(rule.sourceDir, { count: 0, bytes: 0 });
      continue;
    }
    const found = walk(absDir, args.root);
    let bytes = 0;
    for (const f of found) {
      // basename inside the legacy source dir (preserves any subfolders).
      const insideSrc = f.relativePath.startsWith(rule.sourceDir + "/")
        ? f.relativePath.slice(rule.sourceDir.length + 1)
        : f.relativePath;
      const targetPath = posix.join(rule.targetPrefix, insideSrc);
      manifest.push({
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        size:         f.size,
        mimeType:     f.mimeType,
        targetBucket: rule.targetBucket,
        targetPath,
      });
      bytes += f.size;
    }
    perDir.set(rule.sourceDir, { count: found.length, bytes });
    console.log(
      `  ${rule.sourceDir.padEnd(20)} ${String(found.length).padStart(6)} files  ${fmtBytes(bytes).padStart(10)}  →  ${rule.targetBucket}/${rule.targetPrefix}/`,
    );
  }

  // Sort for stable diffs.
  manifest.sort((a, b) => a.targetBucket.localeCompare(b.targetBucket) || a.targetPath.localeCompare(b.targetPath));

  writeFileSync(args.out, JSON.stringify(manifest, null, 2), "utf8");

  const totalBytes = manifest.reduce((s, e) => s + e.size, 0);
  console.log(`\nTOTAL: ${manifest.length} files · ${fmtBytes(totalBytes)}`);
  console.log(`Wrote manifest → ${args.out}`);

  // Caveat surfacing.
  if (totalBytes < 100 * 1024 * 1024) {
    console.log(`
⚠  This survey looks small (< 100 MB). The legacy LOCAL sample on ภูม's box
   is a fraction of production. The full upload set lives on แต้ม's legacy
   server (per runbook §7). Re-run this script against the full upload tree
   once ก๊อต fetches it from แต้ม — production is likely 10-100x larger.`);
  }
}

main();
