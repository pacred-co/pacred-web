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

## Re-run commands

```bash
# Re-run the slip upload (idempotent · 8 files)
pnpm tsx scripts/backfill/03-upload-slips.ts

# Re-run the storage/file upload (idempotent · 2 files)
pnpm tsx scripts/backfill/04-upload-storage-file.ts

# Preview without uploading
pnpm tsx scripts/backfill/03-upload-slips.ts --dry-run
pnpm tsx scripts/backfill/04-upload-storage-file.ts --dry-run
```

---

## Cross-links

- The original Phase A backfill (150 files) — `scripts/backfill/01-survey.ts` + `02-upload-files.ts`
- Migration runbook — [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- D1 direction — [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
