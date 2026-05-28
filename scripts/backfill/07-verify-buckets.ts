/**
 * Backfill 07 · Verify uploaded buckets — quick sanity check.
 *
 * Lists 5 sample objects per bucket prefix to confirm backfill 06 landed
 * everything, and prints signed URLs so ภูม can click + verify a real
 * slip/cover/PDF opens in the browser.
 *
 * Usage:
 *   pnpm tsx scripts/backfill/07-verify-buckets.ts
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) { console.error("missing .env.local"); process.exit(1); }
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

interface Probe { bucket: string; prefix: string; label: string; }
const PROBES: Probe[] = [
  { bucket: "slips",             prefix: "legacy/",                       label: "Wallet slips · 35K historic" },
  { bucket: "forwarder-covers",  prefix: "legacy-shops/",                 label: "Shop logos + forwarder covers · 40K" },
  { bucket: "member-docs",       prefix: "legacy-images/admin/",          label: "Staff profile pics · 119" },
  { bucket: "member-docs",       prefix: "legacy-images/notify/",         label: "Admin push-notice images · 18" },
  { bucket: "member-docs",       prefix: "legacy-images/users/",          label: "Customer profile pics + 50x50/ · 734" },
  { bucket: "member-docs",       prefix: "legacy-uploads/file/",          label: "ID-card + admin manual PDFs · 1,199" },
  { bucket: "member-docs",       prefix: "legacy-uploads/csv/",           label: "Bulk CSV imports · 52" },
  { bucket: "member-docs",       prefix: "legacy-wp/uploads/",            label: "WordPress media — pcscargo.com · 4.9K" },
  { bucket: "member-docs",       prefix: "legacy-pcsfreight-wp/uploads/", label: "WordPress media — pcs-seafreight · 252" },
];

async function main(): Promise<void> {
  const env = loadEnvLocal();

  // S3 client (for LIST — fastest).
  const s3 = new S3Client({
    endpoint:       env.SUPABASE_S3_ENDPOINT,
    region:         env.SUPABASE_S3_REGION,
    credentials:    { accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });

  // Supabase client (for signed URL — Dashboard-friendly).
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  console.log(`Verifying prod buckets · ${env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  for (const p of PROBES) {
    console.log(`────────────────────────────────────────`);
    console.log(`${p.bucket}/${p.prefix}   ← ${p.label}`);

    let totalCount = "?";
    let samples: string[] = [];

    try {
      // 1st request — count + sample names
      const list = await s3.send(new ListObjectsV2Command({
        Bucket: p.bucket, Prefix: p.prefix, MaxKeys: 5,
      }));
      samples = (list.Contents ?? []).map((o) => o.Key!).filter(Boolean);
      // KeyCount only counts what this page returned. For total we'd page
      // forever — instead estimate via IsTruncated flag.
      totalCount = list.IsTruncated ? `${samples.length}+` : String(samples.length);

      console.log(`  total objects (first page): ${totalCount}`);
      console.log(`  sample keys:`);
      for (const k of samples) console.log(`    - ${k}`);
    } catch (e) {
      console.warn(`  ✘ LIST error: ${(e as Error).message}`);
      continue;
    }

    // Generate a signed URL for the FIRST sample → clickable in browser
    if (samples.length > 0) {
      const firstKey = samples[0].slice(p.prefix.length);
      const fullKey = p.prefix + firstKey;
      const { data, error } = await sb.storage.from(p.bucket)
        .createSignedUrl(fullKey, 3600);
      if (error) {
        console.warn(`  ✘ signed URL error: ${error.message}`);
      } else if (data) {
        console.log(`  → 1-hour signed URL (click to verify):`);
        console.log(`    ${data.signedUrl}`);
      }
    }
    console.log("");
  }

  console.log(`────────────────────────────────────────`);
  console.log(`Dashboard URL (browse all):`);
  const ref = (env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./) ?? [])[1];
  console.log(`  https://supabase.com/dashboard/project/${ref}/storage/buckets`);
}

main().catch((e) => { console.error(e); process.exit(1); });
