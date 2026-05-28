# Marketplace product thumbnails — research (Wave 20 P2)

> Triggered by ภูม flag 2026-05-25 ค่ำ: `/admin/forwarders` list shows
> "ไม่มี รูป" everywhere. He suspects PCS API integration not ported.
>
> **Method (per AGENTS.md §0b):** read source PHP under
> `D:\REALSHITDATAPCS\pcsc\public_html\member\` + Pacred render code +
> migrated DB schema. Sandbox blocked PostgREST sampling — DB shape
> inferred from code + cited prior backfill counts.

## TL;DR

- **Marketplaces in legacy:** 1688, taobao, tmall (Tmall routes through
  Taobao backend at the API vendor — same `pic_url` shape). Legacy
  exposed all three in the `search-image.php` shop bar and the URL parser
  (`pcs-admin/include/pages/search/searchURL.php:220-224`).
- **Mechanism:** **URL pointer, no scraping** — legacy stores the
  marketplace's own CDN URL (`cbu01.alicdn.com/img/...`) in
  `tb_cart.cImages` and propagates it unchanged through
  `tb_order.cImages` → `tb_forwarder.fCover`. A helper
  `getLinkCoverIMG()` rewrites the URL and appends `_150x150.jpg` at
  render time. The URL itself is fetched once from a 3rd-party search API
  when the customer adds the item (3 vendors: AkuCargo + TAMIT-cloud +
  Laonet).
- **Data location:** `tb_forwarder.fcover` (`varchar(500)` per migration
  `0081_pcs_legacy_schema.sql:1642` + `:2334`). Two shapes occupy this
  column:
  - **Mode A:** full URL (`https://cbu01.alicdn.com/img/.../foo.jpg`) —
    captured at search time from the API response, propagated through
    cart → order → forwarder.
  - **Mode B:** bare filename (`PR10691_67e0...8c1735.jpg`) — staff
    upload via `pcs-admin/forwarder.php:133-172` (admin overrides the
    cover photo after goods arrive). The file lives at
    `member/images/shops/<filename>` on the legacy webhost.
- **Pacred gap:** the renderer + signed-URL resolver work for **Mode B**
  (40,686 files uploaded to `forwarder-covers/legacy-shops/` per backfill
  06), and **Mode A** URLs pass through unchanged
  (`lib/storage/legacy-resolver.ts:122`). So if rows show "ไม่มี รูป",
  either (a) `fcover` is empty/`-`/`0` (the legacy default for many
  rows), (b) Mode-B files exist in DB but didn't land in Storage (subset
  of backfill 06), or (c) Mode-A URLs reference legacy alicdn variants
  the bucket layer can't dereference (no rewrite from `aliimg.zzqss.com`
  / `tbimg.zzqss.com` like legacy did).
- **Recommended approach:** **A — wire existing data + rewrite alicdn URLs**
  (no API integration needed for thumbnails). Sample 50 rows first to
  confirm the empty-rate.
- **Estimated effort:** 1.5 hours (sample query + URL-rewrite helper +
  empty-cover check + commit).

---

## Legacy mechanism (verified from PHP source)

### Marketplaces supported

`pcs-admin/search-image.php:39-44` enumerates the 3 shop logos shown in
the search bar:

```php
<a href="https://www.1688.com/"  target="_blank"><img .../></a>
<a href="https://www.taobao.com/" target="_blank"><img .../></a>
<a href="https://www.tmall.com/"  target="_blank"><img .../></a>
```

`include/pages/search/searchURL.php:220-224` resolves the URL into a
provider for the API call (Tmall → taobao backend):

```php
switch ($_POST['web']) {
    case "1688":   $srcWeb = "1688-logo-3.png"; $provider='1688';  $cProvider=1; break;
    case "taobao": $srcWeb = "taobao-logo.png"; $provider='taobao'; $cProvider=2; break;
    case "tmall":  $srcWeb = "tmall-logo.png"; $provider='taobao'; $cProvider=3; break;
}
```

So `cProvider` is the persisted code: `1`=1688, `2`=taobao, `3`=tmall.
`cProvider=4` is the legacy local-upload mode (handled separately —
filename instead of URL; see Mode B below).

### 3rd-party search APIs (the source of `pic_url`)

Three external vendors, all queried server-side via PHP `curl_exec`:

| API | Endpoint (cited PHP file:line) | Purpose |
|---|---|---|
| AkuCargo | `https://akucargo.com/api3/api-2022/search/v1/...` (`include/pages/search/search.php:47-51`) | Keyword search list |
| AkuCargo (detail) | `https://akucargo.com/api3/api-2022/get/v2/?id=<id>` (`searchURL.php:343`) | Product detail + main video |
| Laonet (1688) | `https://1688.laonet.online/index.php?route=api_tester/call&api_name=item_get&...&key=tam011plus@gmail.com` (`searchURL.php:328`) | Variant/SKU detail for 1688 |
| Laonet (taobao) | `https://laonet.online/index.php?route=api_tester/call&api_name=item_get&...&key=tam011plus@gmail.com` (`searchURL.php:356`) | Same for taobao/tmall |

The API key `tam011plus@gmail.com` is **hardcoded** in the legacy PHP.
All four endpoints return a `pic_url` (or `mainImage`) field that is a
**direct alicdn CDN URL** — no proxy, no caching layer on Pacred's side.

`include/pages/search/search.php:86` shows how the URL is rendered into
the search-list card and then captured into the cart on click:

```php
<img src="'.$json['items']['item'][$i]['pic_url'].'_350x350.jpg" ... />
```

The `_350x350.jpg` suffix is **alicdn's built-in thumbnail-resize
convention** — the CDN serves any size requested by suffix.

### Cart → order → forwarder propagation

The image URL becomes a hidden form field on the variant grid
(`searchURL.php:790`, `:945`, `:973`):

```php
<input type="hidden" name="cImages[]" value="<?php echo $json['item']['pic_url'];?>" />
```

`pcs-admin/cart.php:49` inserts it into `tb_cart`:

```sql
INSERT INTO `tb_cart`(`cDetails`,`cURL`,`cImages`,`cPrice`,`cAmount`,`cColor`,`userID`,`cSize`,`cProvider`) VALUES ...
```

`pcs-admin/shops.php:105-110` copies it from cart → `tb_order`:

```sql
SELECT cImages ... FROM `tb_cart` WHERE userID='$adminID' AND ID='$ID';
INSERT INTO `tb_order` (... cImages ...) VALUES ( ... '$row[cImages]' ...);
```

And `shops.php:1412 + 1433 + 1687` lifts it to `tb_forwarder.fCover`
when an order tracking number becomes a forwarder shipment:

```php
$fCover=$row['cImages'];  // L1412
... INSERT INTO `tb_forwarder` (... `fCover`, ...) VALUES (... '$fCover' ...);  // L1433-1437
... UPDATE `tb_forwarder` SET fCover='$cImages' WHERE fTrackingCHN=... // L806, L1687
```

### Render-side URL rewriter (legacy)

`pcs-admin/include/function.php:1845-1858` is the helper every legacy
admin page uses to render `fCover`:

```php
function getLinkCoverIMG($cover){
    $link = basePath.'images/shops/default.png';
    if (strpos($cover, "/") !== false) {                                    // URL mode
        $link = str_replace(
            ['?x-oss-process=style/alsy', '?x-oss-process=style/tbsy',
             'https://cbu01.alicdn.com/https:/', '_250x250.jpg'],
            ['', '', 'https:/', ''],
            $cover);
        $link = str_replace(
            ['https://aliimg.zzqss.com/img/ibank/',
             'https://tbimg.zzqss.com/bao/uploaded/'],
            ['https://cbu01.alicdn.com/img/ibank/',
             'https://cbu01.alicdn.com/img/ibank/'],
            $link);
        $link = $link.'_150x150.jpg';
    } else if ($cover != '') {                                              // Filename mode
        $link = basePath.'images/shops/'.$cover;
    }
    return $link;
}
```

Two normalisations Pacred does NOT do:

1. **Stripping OSS-process query params** (`?x-oss-process=style/alsy`,
   `?x-oss-process=style/tbsy`) — these are alicdn watermark/style
   directives. Legacy strips them so the raw image is fetched.
2. **Rewriting old proxy hosts** (`aliimg.zzqss.com`, `tbimg.zzqss.com`)
   to `cbu01.alicdn.com` — these are legacy ZZQSS proxy hosts that
   alicdn deprecated. Without rewriting, the `<img>` tag points at a
   404'd vendor.

Mode-B (filename) admin uploads use `forwarder.php:151` —
`$_FILES["fCover"]["tmp_name"]` is copied into `member/images/shops/`
and only the bare filename is persisted to `fCover`.

---

## Pacred current state (verified from repo at `Poom-pacred` ≈ `f83cf7d`)

### Renderer wires `fcover` correctly

`app/[locale]/(admin)/admin/forwarders/page.tsx:247` selects `fcover`
from `tb_forwarder`, then at L422-426 resolves it through
`resolveLegacyUrlMap(...,"cover")` in parallel for every row. The
`Row.coverUrl` field (line 226) holds the resolved URL or `null`.

`app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx:266-284`
renders an `<img src={r.coverUrl}>` when non-null, falls back to the
"ไม่มี รูป" placeholder otherwise. **The render path is working** — the
question is what comes back from `resolveLegacyUrlMap`.

### Resolver — `lib/storage/legacy-resolver.ts`

`resolveLegacyUrl()` handles 3 filename shapes (lines 111-128):

| Input shape | Behaviour |
|---|---|
| `null` / `""` / `"-"` / `"0"` | Returns `null` immediately (L118) |
| Full URL (`/^https?:\/\//`) | **Passes through unchanged** (L122) — Mode A works |
| Bare filename (no `/`) | Resolved to `forwarder-covers/legacy-shops/<file>` signed URL (L93 + L73) — Mode B works |
| Bucket-relative path (contains `/`) | Used as-is, bucket selected by `kind` (L88-90) |

`getSignedBucketUrl()` (`lib/storage/upload.ts:94-106`) calls
`admin.storage.from(bucket).createSignedUrl(filename, 3600)`. On any
error or missing file it **returns `null` silently** (L104). This is the
silent-failure mode: rows pointing at a filename that's not in Storage
fall through to "ไม่มี รูป" with no log line.

### Storage state — what backfill 06 actually loaded

`docs/learnings/supabase-storage-bulk-upload.md:88,253` + the backfill
06 rule table in `scripts/backfill/06-upload-prod-ftp.ts:13`:

```
member/images/shops/  →  forwarder-covers/legacy-shops/   40,686 files / 2.04 GB
```

This is the **admin-uploaded covers** (Mode B). Mode-A URLs were never
mirrored — they're served directly from alicdn at render time.

### Customer-facing order flow does NOT touch `tb_forwarder`

`actions/service-order.ts:632-668` creates orders in the **rebuilt**
`service_orders` table (not legacy `tb_forwarder`). The
`cover_image_path` field (L639) holds the image filename for the rebuilt
schema. So:

- **A NEW Pacred customer placing an order today does NOT appear in
  `/admin/forwarders`** — that page only reads `tb_forwarder`, which
  contains the ~thousands of legacy migrated rows.
- All visible "ไม่มี รูป" rows are legacy migrated data.
- The marketplace API integration that DOES exist
  (`lib/china-search/index.ts` — TAMIT + AkuCargo + Laonet, fully
  wired per audit §3a/§4a/§4b) feeds the rebuilt cart/order flow,
  not `tb_forwarder`.

### What I could not verify (sandbox blocked PostgREST sampling)

Network access from this sandbox blocked the planned curl + PowerShell
queries against the prod Supabase REST endpoint. To complete this
research, ภูม or เดฟ should run one query to confirm the
empty-vs-URL-vs-filename ratio in production:

```sql
SELECT
  COUNT(*)                                                      AS total,
  COUNT(*) FILTER (WHERE fcover IS NULL OR fcover IN ('','-','0')) AS empty,
  COUNT(*) FILTER (WHERE fcover ILIKE 'http%')                 AS url_mode,
  COUNT(*) FILTER (WHERE fcover NOT ILIKE 'http%'
                  AND fcover NOT IN ('','-','0')
                  AND fcover IS NOT NULL)                       AS filename_mode
FROM tb_forwarder;
```

Confidence: the legacy SQL writes a CDN URL for any cart-originated item
(verified above) — so `url_mode` count should be the bulk of legacy
rows. `empty` will dominate for very old rows where cart used the
default placeholder. `filename_mode` should match the 40,686 file count
in Storage (or a subset).

---

## Recommendation

### A — wire existing data + add legacy URL rewriter (RECOMMENDED)

The integration data is already present; only the resolver needs to
mirror the legacy `getLinkCoverIMG` normalisations.

**Step 1 — sample the prod DB** (5 min):

```sql
-- ภูม / เดฟ run via Supabase SQL editor
SELECT id, userid, LEFT(fcover, 120) AS fcover_preview
FROM tb_forwarder
WHERE fcover IS NOT NULL AND fcover NOT IN ('','-','0')
ORDER BY fdate DESC
LIMIT 30;
```

Look at the shapes returned: how many are `https://cbu01.alicdn.com/...`
vs bare filename vs `https://aliimg.zzqss.com/...`.

**Step 2 — extend `lib/storage/legacy-resolver.ts:111-128`** to mirror
`getLinkCoverIMG()` for the URL path (15 min):

```typescript
if (/^https?:\/\//i.test(f)) {
  // Mirror legacy getLinkCoverIMG: strip OSS-process style params,
  // rewrite deprecated proxy hosts, and add thumbnail suffix.
  return f
    .replace(/\?x-oss-process=style\/(alsy|tbsy)/g, "")
    .replace("https://cbu01.alicdn.com/https:/", "https:/")
    .replace("https://aliimg.zzqss.com/img/ibank/",  "https://cbu01.alicdn.com/img/ibank/")
    .replace("https://tbimg.zzqss.com/bao/uploaded/", "https://cbu01.alicdn.com/img/ibank/")
    .replace("_250x250.jpg", "")
    + "_150x150.jpg";  // alicdn thumbnail-resize convention
}
```

(The `_150x150.jpg` append assumes the URL doesn't already have a
size suffix — verify against the sample. If the API now returns URLs
that already include a size, drop the append step.)

**Step 3 — gate by `cprovider` if the column is in the row.** The
legacy `shopListIMG` (`function.php:1835-1843`) only applies URL mode
for `cprovider<4`. For `tb_forwarder` there's no `cprovider` column,
but the URL-shape branch already handles both cases naturally — no
change needed.

**Step 4 — log silent failures** (10 min). In
`lib/storage/upload.ts:104` add a `console.warn` when `createSignedUrl`
returns null with a non-empty filename — turns the current invisible
failure into something observable in Vercel logs.

**Step 5 — `next/image` allowlist** (5 min — if not already done).
Pacred uses `<img>` not `next/image` in the table cell so this is
optional, but if the team wants `next/image` later, add
`cbu01.alicdn.com` to `next.config.ts` `images.remotePatterns`.

**Why not B/C/D/E:**

- **B (backfill from legacy)** — already done by backfill 06 for Mode B.
  Mode A URLs are remote refs that don't need migration.
- **C (live-fetch from marketplace)** — the integration ALREADY exists
  for new orders (`lib/china-search/*`). For historic `tb_forwarder`
  rows, refetching would mean ~thousands of API calls + a $$ rate-limit
  hit on Laonet. Refetching is for adding a NEW image to a row that
  truly has none — Phase C nice-to-have, not a P2 bug fix.
- **D (server-side scrape)** — same cost as C plus legal risk. Avoid.
- **E (defer)** — option A is 1.5 h; the bug is visible on every
  forwarder list session ภูม opens. Worth fixing in current sprint.

---

## Open questions for ภูม

1. **What does the prod sample look like?** Please run the SQL in
   "Step 1" above (Supabase SQL editor) and paste the 30-row result. The
   ratio of empty vs URL vs filename decides whether a fix lands a
   visible change for ภูม or only a few rows.
2. **Do we have AkuCargo / TAMIT-cloud / Laonet credentials/IP allowlist
   for the new flow?** The `lib/china-search/*` modules already call
   these — confirm with ก๊อต that the IPs are whitelisted for prod
   Vercel egress.
3. **Should the resolver strip `_350x350.jpg` and append `_150x150.jpg`,
   or pass through whatever size came in?** Legacy renders at 60×60 on
   the list page (`forwarder.php:616`) — `_150x150.jpg` gives 2.5× DPR
   crispness with little weight cost (~3 KB ea).
4. **Is `cprovider` worth porting to `tb_forwarder` as a new column?**
   Currently we can only infer marketplace from the URL host. Adding
   `fprovider` (`1`/`2`/`3`/`4`) at INSERT time on new admin-created
   forwarders would let the table render a marketplace chip ("1688" /
   "Taobao" / "Tmall" / "ภายใน") — Phase C polish.
5. **For Mode-A URL rows older than ~6 months — is alicdn still serving
   them?** alicdn occasionally retires URLs. If sampling shows a
   meaningful share of dead URLs, we may need a thumb-and-cache layer
   (Cloudflare R2 + cron mirror) before Phase C. For now: option A
   covers the live URLs; dead URLs degrade to broken `<img>` (browser
   shows the alt text) — bearable, not blocking.

---

## Token-cost note

Doc length: ~360 lines (under the 500-LOC cap). Reading list: 8 PHP
files + 6 TS files + 3 docs (`UPGRADE_PLAN.md`, `_index.md`,
`pacred-design-philosophy.md`, `supabase-storage-bulk-upload.md`).
Sandbox blocked PostgREST sampling — added "Open question #1" to
recover that data in human review.
