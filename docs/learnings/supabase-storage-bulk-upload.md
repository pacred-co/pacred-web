# Supabase Storage — bulk-upload patterns + legacy-dump gotchas

> Append-only. Newest entry at the bottom.

This file captures the patterns and pitfalls we hit while back-filling legacy
PCS Cargo customer files into Supabase Storage during the D1 faithful-port
(Phase A data migration).

## Why this file exists

Storage backfill is the easy-to-skip half of "Phase A data migration" — the
schema port (`tb_*`) gets the attention, but customers also expect their
historic slips, profile pictures, and shop logos to keep working. We have
discovered the hard way that **the LOCAL `pcscargo/member/` dev dump on
ภูม's box is NOT a complete mirror of the prod server** — some directories
exist only on the live host. Future sessions need to know:

1. The script pattern (one-off bulk uploads via service-role)
2. Which directories ARE in the local dump
3. Which directories ARE NOT — and where they actually live

---

## Entry — 2026-05-22 evening · ภูม + Claude (worktree `adoring-chandrasekhar-0f8ad7`)

### What we did

Back-filled the two remaining LOCAL legacy directories that backfill 02 missed:

| Source (local) | Bucket | Path prefix | Count | Total |
|---|---|---|---|---|
| `C:/Users/Admin/pcscargo/member/storage/slip/` | `slips` | `legacy/` | 8 | 3.30 MB |
| `C:/Users/Admin/pcscargo/member/storage/file/` | `member-docs` | `legacy/storage-file/` | 2 | 1.04 MB |

Scripts at `scripts/backfill/03-upload-slips.ts` + `04-upload-storage-file.ts`.
Both ran clean (0 failures). Re-runnable — they use `upsert: true`.

### Pattern — one-off bulk upload via service-role

```ts
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Read file bytes from disk, then:
await supabase.storage.from(BUCKET).upload(targetPath, bytes, {
  contentType: "image/png",
  upsert: true,            // safe re-run
});
```

**Why `upsert: true` for backfill (vs `upsert: false` in 02):** the legacy
filenames in `storage/slip/` and `storage/file/` are unique by construction
(`PCS<member>_<timestamp>.<ext>`), so collision is impossible. Idempotent
re-runs without a HEAD probe are simpler and faster for small batches (< 50
files). For the 150-file `02-upload-files.ts` we keep `upsert: false` plus a
HEAD probe via `.list({ search })` because some legacy paths *could* repeat.

**`.env.local` loader pattern:** every backfill script keeps a copy of the
parser so each is self-contained. The whole `scripts/backfill/` directory is
expected to delete after Phase A is done — no shared util to maintain.

**`createClient` for service-role:** pass
`{ auth: { autoRefreshToken: false, persistSession: false } }` to disable
the browser-style auth flow — pure server-side, never refreshes a session.

### Filename safety — Thai characters

Supabase Storage rejects keys containing some Thai characters with a 400 +
`InvalidKey`. The eight slips here are all ASCII (`PCS<id>_<stamp>.<ext>`)
so no renaming was needed. The earlier 02 batch contained Thai admin names
(e.g. `admin_แจน_1706746557.jpg`) and those uploaded fine in 02 — but if a
future batch hits a rejection, the workaround is to slugify Thai → ASCII at
upload time, recording the original name in the manifest.

### The local-dump gap — what's MISSING

This is the load-bearing finding for ภูม + future agents. The LOCAL legacy
dump at `C:/Users/Admin/pcscargo/member/` contains ONLY:

| Path | What | Local? | Uploaded? |
|---|---|---|---|
| `images/admin/` | staff profile pics | ✅ | ✅ backfill 02 |
| `images/notify/` | admin push-notice images | ✅ | ✅ backfill 02 |
| `images/shops/` | customer shop logos | ✅ | ✅ backfill 02 |
| `images/users/` | customer profile pics | ✅ | ✅ backfill 02 |
| `storage/slip/` | wallet-deposit slips (only 8 here!) | ✅ (partial) | ✅ backfill 03 |
| `storage/file/` | ID-card + admin manual PDFs | ✅ (partial) | ✅ backfill 04 |
| `images/forwarder/` (covers) | forwarder cover photos | ❌ NOT IN LOCAL DUMP | ❌ |
| `images/cnt/` | container (ตู้) photos | ❌ NOT IN LOCAL DUMP | ❌ |
| `images/cargo/` or `storage/cargo/` | per-shipment proof photos | ❌ NOT IN LOCAL DUMP | ❌ |

The 8 slips in `storage/slip/` are only a sample — the prod server has
years of customer wallet-deposit slips not present here.

### How to get the missing files

Three options for ภูม when the API switchover lets us touch the live host:

1. **rsync from prod** (cleanest if SSH access):
   ```bash
   rsync -avz --progress \
     pcs-prod:/var/www/pcscargo/member/storage/slip/ \
     C:/Users/Admin/pcscargo/member/storage/slip/
   # Then re-run backfill 03 — upsert:true makes it safe to re-process the 8 we already have.
   ```

2. **scp + zip** if rsync isn't installed on the host:
   ```bash
   ssh pcs-prod 'cd /var/www/pcscargo/member && zip -r /tmp/legacy-uploads.zip storage/ images/'
   scp pcs-prod:/tmp/legacy-uploads.zip C:/Users/Admin/Downloads/
   ```

3. **A one-time server-side PHP dump script** — slowest but works without
   SSH. Drop a `<root>/dump-uploads.php` on the host that lists every file
   under `images/` + `storage/`, then call Supabase Storage REST from PHP
   using curl + the service-role key. **Risk:** the service-role key lands
   on the legacy host — only acceptable if we rotate the key the moment the
   dump finishes (see `docs/runbook/otp-rotation.md` for the rotation
   procedure pattern). Prefer options 1 or 2.

### Key principle going forward

**Before running a backfill, verify the local dump matches the prod tree.**
A simple `ssh pcs-prod 'find /var/www/pcscargo/member/{images,storage} -type d'`
gives the directory inventory; compare to `tree` of the local dump. If the
local dump is missing a directory, do NOT silently skip it — report up to
ภูม + log it here.

---

## Entry — 2026-05-23 evening · ภูม + Claude (worktree `adoring-chandrasekhar-0f8ad7`)

### Context — "newrealdatapcs" misread

After morning's backfill 03 + 04 ภูม pointed out I had the wrong source:
**`C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\`** is the
"snapshot ล่าสุด" (latest snapshot) — not `C:/Users/Admin/pcscargo/` which I
had been working from. Direct quote: *"ไม่ใช่ไฟล์ C:/Users/Admin/pcscargo/
นี้แล้ว เป็นไฟล์ C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs
นี้ที่ภูมิส่งให้เมื่อวานไงมันคืออัพเดตล่าสุด"*.

### What's actually in newrealdatapcs

Verified by 7z list + selective extract:

| Asset | Size | Contents |
|---|---|---|
| 3 SQL dumps (Feb · Apr · May 18) | 834 + 884 + 898 MB | `pcsc_main` MySQL dumps |
| `database-member-*.zip` (×2) | 348 MB | Just the same SQL dumps zipped |
| `database-backoffice-*.zip` | 40 KB | `backoffice_pcsc_main.sql` |
| `database-wordpress-*.zip` | 36 MB | 3 wp SQL dumps |
| `RealDataBackUpPCS/*.tar.gz` | 117 MB | 4 more gz-compressed SQL dumps |
| **`pcscargo.rar`** | **2.1 GB** | **Source code repo + 154 customer images + WP media + shop demo** |

**Key finding:** `pcscargo.rar` byte-equals the local `C:/Users/Admin/pcscargo/`
copy (same source — just the rar version). NEITHER contains prod `images/cnt/`
or `images/forwarder/` — those are on the live host only.

### What we did

ภูม clarified: *"มันเป็นไฟล์ประวัติย้อนหลัง ไม่ได้ครบตั้งแต่บริษัทเปิด
ที่บอกให้เอามาครบทั้งหมดคือเอามาทั้งหมดที่มีตามที่ส่งไปให้ทั้งหมดนั้นแหละ"*
— upload everything that IS in the snapshot, even if it isn't the full prod
history. ภูม also asked to include WordPress media + shop demo photos (*"Upload
ทั้งคู่ — เผื่อใช้ฟ้อง"*).

Full-extract pcscargo.rar → 2.8 GB uncompressed → `_extracted_full/pcscargo/`.
Wrote `scripts/backfill/05-upload-rar-extras.ts` that walks the rar tree with
an explicit include-list (skip UI assets + WP core) and uploads to bucket
prefixes that preserve the subdir layout:

| Rar source | Bucket | Path prefix | Count | Size |
|---|---|---|---|---|
| `wp-content/uploads/` | `member-docs` | `legacy-wp/uploads/` | 694 | 99.1 MB |
| `shop/<collection>/` | `member-docs` | `legacy-shop/` | 32 | 6.7 MB |
| `member/pcs-admin/include/` | `member-docs` | `legacy-pcs-admin/include/` | 2 | 80 KB |
| `member/pcs-admin/f-receipt/` | `member-docs` | `legacy-pcs-admin/f-receipt/` | 2 | 1.0 MB |
| `member/img/` | `member-docs` | `legacy-misc/img/` | 1 | 308 KB |
| `member/sms/` | `member-docs` | `legacy-misc/sms/` | 1 | 340 KB |
| **TOTAL** | | | **732** | **107.6 MB** |

Run: `pnpm tsx scripts/backfill/05-upload-rar-extras.ts --apply --concurrency 8`
→ 732 / 732 uploaded · 0 failed · 24.4 s.

### Skip-list rationale (explicit, so future agents don't re-add by accident)

Excluded directories — UI assets / WP core / 3rd-party (not customer-facing,
not legal-evidence material):

- `member/assets/**` — Bootstrap-4 template assets (892 images = icons + chrome)
- `member/PHPMailer/**` — mailer library example PNGs
- `member/fonts/**` — Font Awesome flag-icon-css
- `wp-admin/**`, `wp-includes/**` — WordPress core
- `wp-content/plugins/**`, `wp-content/themes/**`, `wp-content/upgrade/**`,
  `wp-content/maintenance/**` — WP plugin/theme/upgrade staging

If a future ภูม request needs any of these, copy the `INCLUDE_RULES` pattern
in `05-upload-rar-extras.ts` and add a new rule.

### Backfill totals on prod (running tally)

| Run | Files | Source | Bucket(s) |
|---|---|---|---|
| 02 | 150 | local `member/{images,storage}/` | `member-docs/legacy-images/*` + `legacy-uploads/file/` + `legacy-slips/` |
| 03 | 8 | local `member/storage/slip/` | `slips/legacy/` |
| 04 | 2 | local `member/storage/file/` | `member-docs/legacy/storage-file/` |
| 05 | 732 | rar `wp-content/uploads` + `shop` + `pcs-admin` + `img` + `sms` | `member-docs/legacy-*` |
| **TOTAL** | **892** | | |

### The remaining gap (unchanged)

`images/forwarder/`, `images/cnt/`, and the full historic slips archive
still need to be fetched from the prod host (rsync/scp/PHP-dump). Today's
work cleaned out the snapshot ภูม actually shipped — everything in there is
now in Supabase.

---

## Re-run commands

```bash
# Re-run any backfill — all idempotent via upsert:true.
pnpm tsx scripts/backfill/03-upload-slips.ts
pnpm tsx scripts/backfill/04-upload-storage-file.ts
pnpm tsx scripts/backfill/05-upload-rar-extras.ts --apply

# Preview backfill 05 without uploading
pnpm tsx scripts/backfill/05-upload-rar-extras.ts

# Use a different rar extract root
pnpm tsx scripts/backfill/05-upload-rar-extras.ts --root /other/path --apply
```

---

## Entry — 2026-05-23 night · ภูม + Claude (worktree `adoring-chandrasekhar-0f8ad7`)

### Context — full FTP backup arrives

After morning's backfill 02-05 work, ภูม clarified that `newrealdatapcs/pcscargo.rar` was NOT the prod data — it's the source-code repo. The real prod backup arrived later as:

- `D:\REALSHITDATAPCS\` (root) — SQL dumps + CoreFTP profiles (915 MB)
- **`D:\REALSHITDATAPCS\pcsc\`** — the actual `/home/pcsc/` FTP backup (~34 GB)

The customer files live under `D:\REALSHITDATAPCS\pcsc\public_html\member\{images,storage}\`. Total: **78,323 files / 10.08 GB**.

### Critical finding — the `shops/` mystery

Legacy `pcs-admin/forwarder.php` L166-168 uploads forwarder cover images to `member/images/shops/`, NOT to a hypothetical `images/forwarder/` directory. So **forwarder covers + shop logos are stored together in `images/shops/`** (40,686 files / 2.04 GB on prod). The dev sample had only 3 files which is why we assumed forwarder covers were missing — they're not, they're in `shops/`.

### File counts (prod vs dev sample)

| Dir | Prod | Dev sample | Multiplier |
|---|---|---|---|
| `images/admin/` | 119 | 99 | 1.2× |
| `images/notify/` | 18 | 18 | 1.0× |
| `images/users/` (incl. 50x50/) | 734 | 24 | **30×** |
| `images/shops/` | **40,686** | 3 | **13,562×** |
| `storage/slip/` | **35,515** | 8 | **4,439×** |
| `storage/file/` | 1,199 | 1 | 1,199× |
| `storage/csv/` | 52 | 0 | new |
| **Total** | **78,323** | 153 | **512×** |

The dev sample was ~0.2% of prod. We were upload-counting the floor.

### S3 protocol vs supabase-js

ภูม chose **S3 protocol** for backfill 06 (project preference). Required:

1. Create a dedicated S3 access key in Supabase Dashboard → Project Settings → Storage → S3 Access Keys → "New access key".
2. Stash `ACCESS_KEY_ID` + `SECRET_ACCESS_KEY` in `.env.local` (gitignored). Never commit.
3. Use `@aws-sdk/client-s3` with `forcePathStyle: true` — Supabase Storage requires path-style URLs (`/<bucket>/<key>`), not virtual-hosted-style (`<bucket>.s3.amazonaws.com/<key>`).
4. **Rotate the access key as soon as the one-off backfill is done.** (Dashboard → Storage → S3 Access Keys → revoke.)

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({
  endpoint:       "https://<ref>.storage.supabase.co/storage/v1/s3",
  region:         "ap-southeast-1",
  credentials:    { accessKeyId: KEY, secretAccessKey: SECRET },
  forcePathStyle: true,
});
await s3.send(new PutObjectCommand({
  Bucket: "slips", Key: "legacy/PCS9122_...png",
  Body: buffer, ContentType: "image/png",
}));
```

Throughput at concurrency 16 on ภูม's home connection: **~35 files/s** (csv smoke test, 52 files / 1.5 s). Estimated full run ~40-60 min.

### Bucket mapping (backfill 06)

| Source | Bucket | Path prefix |
|---|---|---|
| `images/admin/` | `member-docs` | `legacy-images/admin/` |
| `images/notify/` | `member-docs` | `legacy-images/notify/` |
| `images/users/` | `member-docs` | `legacy-images/users/` |
| `images/shops/` (40k files) | `forwarder-covers` | `legacy-shops/` |
| `storage/slip/` (35k files) | `slips` | `legacy/` |
| `storage/file/` | `member-docs` | `legacy-uploads/file/` |
| `storage/csv/` | `member-docs` | `legacy-uploads/csv/` |

### Resumable progress

Progress file at `scripts/backfill/.progress/06-<rule>.json` records each successful upload + each failure. Re-running the script after a crash / Ctrl+C skips files already in `done`. Gitignored (per `.gitignore` update in same commit).

### Key principle for future bulk uploads

**Never trust the dev sample as a proxy for prod scale.** Always cross-check with the table that names the files (`SELECT COUNT(*) FROM tb_wallet_hs WHERE imagesslip <> ''`) before claiming a backfill is "done". The 153-file dev sample was 0.2% of the real customer files; we shipped 4 backfills assuming we had the full set.

---

## Cross-links

- The original Phase A backfill (150 files) — `scripts/backfill/01-survey.ts` + `02-upload-files.ts`
- Migration runbook — [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- D1 direction — [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
