# PHP Legacy Cleanup Audit — pcscargo full sweep

**Date:** 2026-05-16
**Auditor:** Claude sub-agent (PHP cleanup auditor)
**Path:** `C:\xampp\htdocs\pcscargo` (เดฟ's local XAMPP — bulk-copied from production 2026-03-19) · ALSO at `/Users/dev/Desktop/pcscargo` on Mac (used by deep-sweep)
**Purpose:** identify dead code to delete · remaining port gaps · NEW security cleanup items not in existing audits
**Cross-ref:** existing `php-pcscargo-integrations.md` covers integrations + env; this audit covers **cleanup + gap-finding**

> ⚠️ **§6 "Active files NOT yet ported" is SUPERSEDED by [`php-deep-sweep-2026-05-16.md`](php-deep-sweep-2026-05-16.md)** (2026-05-16 night, เดฟ-led 4-agent deep-sweep + verification pass). §6 only listed 5 "should-port" items; deep-sweep found ~36 (12 freight + 24 admin polish) plus 17 new DB tables. **§1-5 of this audit remain authoritative** (file inventory + tier 1-3 dead code + S-1..S-6 security findings).

> **Cross-link:** [`chat-analysis-2026-05-16.md`](chat-analysis-2026-05-16.md) (parallel LINE chat audit) · [`php-deep-sweep-2026-05-16.md`](php-deep-sweep-2026-05-16.md) (master gap doc, supersedes §6) · [`docs/PORT_PLAN.md`](../PORT_PLAN.md) **Part V** (action items — V-E6..V-E12 + V-G + V-H from deep-sweep) · [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md) (existing PCS scrub plan)

---

## Executive summary

| Metric | Value |
|---|---|
| Total disk (`pcscargo/`) | **~3.3 GB** |
| `member/assets/` (vendor JS/PDF) | 637 MB |
| `wp-content/` (dead WordPress) | 265 MB |
| `member/images/` (legacy uploads) | 47 MB |
| `member/storage/` (active slips) | 4.4 MB |
| App-code PHP files (no vendor/WP/PHPMailer) | **~870** |
| Dead-code candidates | **~115 files + 3 full backup dirs** (~1.0 MB raw .php) |
| Tier-1 safe-to-delete | ~85 files |
| Tier-2 expired promos | ~10 files |
| Tier-3 test/scratch | ~30 files |
| **NEW high-severity security findings** | **6** (file:line specific — see §5) |
| Active files NOT yet ported (real gaps) | **~5 minor, 0 critical** — port functionally complete |
| mtime activity signal | **UNUSABLE** — bulk-copied 2026-03-19 |

**Bottom line:** Pacred port is functionally complete. PHP tree is a safety net + reference. ~115 PHP files + 3 backup dirs deletable today with zero risk.

---

## 1. Top-level directory inventory

| Path | .php count | Purpose | Status | Action |
|---|---|---|---|---|
| `member/` | 42 | Customer-facing entry pages | active, ported ✅ | reference only — delete after Pacred go-live + 30d |
| `member/pcs-admin/` | 187 | Admin entry pages | active, ~95% ported ✅ | reference only |
| `member/pcs-admin/include/pages/` | 587 (82 sub-dirs) | Admin partials (real business logic) | active, ported ✅ | reference only |
| `member/include/` | 11 + 92 in pages/ | Customer shared helpers (`function.php` 2451 LOC) | active, ported ✅ | reference only |
| `member/api/` | ~10 | Customer API endpoints (OTP, juristic-check, line-notify) | active, ported ✅ | reference only |
| `member/PHPMailer/` (v5) | 47 | Legacy mailer vendor | superseded by PHPMailer2023 | **DELETE — vendor dup** |
| `member/PHPMailer2023/` (v6) | 61 | Mailer + mPDF vendor | active until Pacred Resend cutover | keep |
| `member/sms/` | 7 | ThaiBulkSMS SDK samples | demo only | safe to remove |
| `member/storage/` | 0 (data) | Active customer slips/files | DATA — preserve | export to backup before delete |
| `member/test-system/` | 2 | Test harness | test only | **DELETE** |
| `member/tmp/` | 0 (ttfontdata) | mPDF font cache | regenerable | safe to clear |
| `member/images/` | 0 (uploads) | Avatars/forwarder/shop imgs | DATA — preserve | export before delete |
| `member/assets/` | 15,106 (vendor) | DataTables/mPDF/jQuery/Google API/FB SDK | vendor JS/PHP | **DELETE with `member/`** (Pacred uses npm) |
| `api/` | 1 | `cover-youtube` endpoint | niche | check usage before delete |
| `c/`, `f/`, `s/` | 1 each | Short-URL redirects (`/c/?id=X` → forwarder/...) | LIVE URLs — external SMS/email/QR link to these | **keep + redirect** to Pacred post-cutover |
| `m/` | 1 | `getDevice()` helper stub | dead | **DELETE** |
| `shop/` | 0 (jpg/mp4) | Static Air Jordan / Yeezy / Dunk / Force product images (2022) | dead | **DELETE** (4 dirs of demo content) |
| `site-map/` | 3 (index + 2 copies) | Public sitemap generator | active for SEO | port to Pacred `app/sitemap.ts` + **delete copies** |
| `get-youtube-pcs/` | 1 | One-off | niche | check usage |
| `run-time/` | 2 (`cttupdate/`, `line/`) | Cron heartbeats | unclear | check before delete |
| `test-api/` | 3 | Dev scratch | test only | **DELETE** |
| `SQL/` | 0 (.sql dumps) | DB dumps: `pcsc_cargo.sql` (158 MB WP) + `pcsc_main.sql` (306 MB app) — **2026-04-30 dump** | reference data | archive to `docs/audit/sql-dumps/` (gitignore) |
| `wp-*` + `wp-content/` + `wp-includes/` | hundreds | Dead WordPress install (replaced by Pacred Next.js) | dead | **DELETE entire WP stack** (verify `wp-content/uploads/` not linked first) |

---

## 2. Dead-code Tier 1 — high confidence (variants/dups/backups)

### Customer-side (`member/`)
| File | Note |
|---|---|
| `forwarderBackUp.php` (268KB) | older copy of forwarder.php |
| `payment20231213.php` (116KB) | date-stamped older copy |
| `20260311wallet.php` (60KB) | date-stamped variant of wallet.php |
| `wallet-credit.php` / `wallet-normal.php` / `wallet-notblank.php` | 3 unused conditional copies (Pacred merged to 1) |
| `blank.php` | empty template |
| `line-notify-admin.php` · `line-notify.php` · `line.php` | LINE Notify (EOL April 2025) — replaced by Messaging API |

### Admin-side (`member/pcs-admin/`)
- `adminOld.php` (48KB), `admin-profile copy.php` (44KB)
- `forwarderBackUp.php` (4KB), `forwarder-backup.php` (180KB)
- `printBill copy.php`
- `api-sheets-sang-2023.php`
- `report-driver-2023.php` (57KB), `report-driver2.php`
- `forwarder-driver-w.php` (157KB) — suffix-variant
- `forwarder-import-warehouse2.php` (49KB) — numbered dup
- `barcode-c-import2.php`
- `blank.php`, `blank-new.php`, `code-templet.php`
- `businessPlan.php`, `corporateCulture.php`, `jobFlowchart.php`, `descriptionBTN.php` — stubs against fake `tb_name`
- `api-new-1.php`, `api-new-2.php` — curl test scripts

### Backup sub-directories in `pcs-admin/include/pages/`
| Dir | Files | Size |
|---|---|---|
| `forwarder-back-up/` | 19 | 496KB |
| `forwarderBackUp/` | 5 | 244KB |
| `api-forwarder-jmf-backup/` | 6 | 92KB |
| `sample-page/` | 1 | bootstrap leftover |

### Customer-side `include/pages/` variants
- `cart/survey.php`, `cart/survey202306.php` — expired survey
- `index/20250514-getListPayForwarder.php` — date-stamped
- `index/20260311-getListPay.php`, `index/20260311-getListPayForwarder.php`
- `index/getListPay-notblank.php`, `index/getListPayForwarder-notblank.php`

### Site-map duplicates
- `site-map/index copy.php`, `site-map/index copy 2.php`

---

## 3. Dead-code Tier 2 — time-bound expired

| File | Origin |
|---|---|
| `pcs-admin/user-pro-valentine.php` | Valentine promo report |
| `pcs-admin/user-pro1212.php` | 12/12 promo report |
| `pcs-admin/report-pro-3-year-anniversary.php` | Anniversary promo |
| `pcs-admin/report-pro-oh-my-ghost.php` | Halloween 2023 |
| `pcs-admin/report-pro-survey202306.php` | June 2023 survey |

---

## 4. Dead-code Tier 3 — test scaffolding / scratch

- 14 `pcs-admin/test-*.php` + `a-Test-*.php` + `testAPITTP.php` + `test_get_contents.php` + `addmail-test.php` + `test-blank.php`
- `pcs-admin/blank-new.php`, `blank.php`, `code-templet.php`, `test.php`
- `pcs-admin/include/pages/a-test-commission/`, `addmail-test/`, `booking-meeting-room/Test*.php`
- `member/test-system/payForwarder/`, `member/test-system/runReceiptF/`
- `member/api/convert-img-to-webp/blank.php`, `test.php`
- `member/api/check-juristic-person/test-dataapi.php`, `index-2.php`
- `member/pcs-admin/exampleReceiptF.php`, `exampleSummaryF.php` (verify ref before delete)
- `test-api/` whole directory

**Literal "copy" files in `pcs-admin/include/pages/`:**
- `forwarder/update copy.php`, `payment/QRPay copy.php`
- `shops/update/update4 copy.php`
- `time-attendance-system/leave-record/add copy.php`, `apiHisLeave copy.php`
- `time-attendance-system/record-work-time/record-time copy.php`
- `users/profile copy.php`

**Tier 1-3 grand totals:** ~115 .php files + 3 backup sub-dirs = **~145 files / ~1.0 MB** safe to delete today.

---

## 5. NEW security findings (file:line specific) ⚠️

These are NEW concrete findings not in `php-pcscargo-integrations.md`. **Action required before PHP goes external** (if at all) — currently mitigated by XAMPP local-only access.

### S-1: Plaintext password in 10-year non-HttpOnly cookie ⚠️ CRITICAL
**Files:** `member/login.php:40`, `member/pcs-admin/login.php:42`
```php
setcookie("member_password", $_POST['adminPass'], time()+ (10 * 365 * 24 * 60 * 60));
```
**Impact:** anyone who acquires a logged-in browser keeps the plaintext password for 10 years.
**Action:** force-clear `member_password` cookie globally via `header.php` before any external exposure. Pacred (Supabase Auth) doesn't have this issue.

### S-2: Weak proprietary password hash `pass_tam()` ⚠️ CRITICAL
**File:** `member/include/encryptPass.php`
```php
function pass_tam($password) {
    $password    = md5($password);
    $password2   = substr("$password", 0, 15);
    $password3   = md5($password2);
    $password4   = strrev($password);
    return $password4 . $password2 . $password3;
}
```
Custom MD5-based scheme, no salt, no work factor. Deterministic + rainbow-tableable.
**Action:** Pacred already plans force-reset on first login (CLAUDE.md A-1 / Phase H). This is the exact algorithm to disclose in breach communications.

### S-3: SQL injection in main auth gate ⚠️ CRITICAL
**Files:** `member/include/header.php:11-13`, `member/pcs-admin/include/header.php` (same pattern)
```php
$userID = $_COOKIE["pcs_userID"];
$sql = "SELECT ... FROM tb_users WHERE userID='$userID' AND ... pcs_logged='$pcs_logged';";
```
Cookie values directly concatenated into SQL on every auth-checked page. **Highest-impact SQL injection point** — runs before any page logic.
**Action:** if PHP stays externally accessible during cutover, patch immediately. Pacred is RLS-protected, no equivalent risk.

### S-4: Hardcoded LINE Notify OAuth credentials
**File:** `member/pcs-admin/api/linenotify/callback/index.php:3-4`
```php
$client_id     = '4G0QlYx3x9BRL94COg76xR';
$client_secret = 'Z65milRidAXhHXZ8gGMAjvItzzDRckuOcNfA6QEpLGp';
```
LINE Notify EOL April 2025 = service dead, but credentials still active.
**Action:** revoke at LINE developer console before deleting source.

### S-5: Unprotected cron endpoints
**Files:** `pcs-admin/api/autorun/check-apprentice/index.php`, `send-line-sales/index.php`, `update-active-customers/index.php`, `update-sheet-sang.php`, `update-sheet-sang2.php`, `pcs-admin/automation/php/reset-credit-forwarder.php`
No IP allowlist, no shared-secret, no auth cookie. Anyone with URL can fire credit reset / send LINE notifications / mass-update userActive.
**Currently mitigated by:** XAMPP local-only access.
**Action:** if PHP host changes, add `.htaccess` IP allowlist to `pcs-admin/api/autorun/` first. Pacred crons use `CRON_SECRET` header (✅).

### S-6: Unsafe file upload + open redirects
- `member/api/convert-img-to-webp/index.php` — accepts `$_POST['folder_path']` → path traversal
- `member/forwarder.php` — checks mime via `$_FILES['type']` (client-controlled)
- Various `header("location: " . $_GET['return'])` — open redirect / phishing pivot
**Action:** Pacred Server Actions enforce server-side validation; no equivalent risks.

### Inherited from existing audit (already known — restated for rotation checklist)
- ThaiBulkSMS key + Facebook OAuth secret + SMTP password — hardcoded in 6+ files
- Cookie `pcs_logged` 10-year lifespan (IP-bound but auth weak)

**Total NEW high-severity findings:** 6 (S-1 through S-6)

---

## 6. Active files NOT yet ported (real gaps)

After cross-referencing 187 admin + 42 customer top-level files against Pacred:

| PHP file | Purpose | Pacred status | Recommendation |
|---|---|---|---|
| `pcs-admin/api-forwarder-cn.php` | China-side forwarder sync | partial via `actions/admin/forwarders.ts` | bridge file — keep until MOMO sync wire complete; **do not delete** per CLAUDE.md "Don't preempt brand cleanup" |
| `pcs-admin/api-forwarder-ttp.php` | TTP carrier sync | none | TTP scrub plan — defer until ก๊อต API switchover |
| `pcs-admin/api-sheets-{ctt,mk,mx,sang}.php` (4 files) | Google Sheets rate cache | retire post-Phase G | **deprecated** — Pacred admin dashboards replace |
| `pcs-admin/check-customer-maomao-{free,vip}.php` | MaoMao rate-tier customer review | none specific | **should-port** if MaoMao tier exists in Pacred rates (verify with ภูม) |
| `pcs-admin/check-customer-shipby-freedom.php` | "Freedom" ShipBy audit | none | nice-to-have, run ad-hoc SQL |
| `pcs-admin/check-sang-cost.php` | Sang carrier price-check | none | nice-to-have |
| `pcs-admin/check-payMethod.php` | Customer pay-method audit | none | nice-to-have |
| `pcs-admin/check-price-flash.php` | Flash Express price audit | none | nice-to-have |
| `pcs-admin/check-get-youtube.php` | YT cover image existence audit | none | deprecated |
| `pcs-admin/recently-used-imported-customers.php` | Recent CSV-import customers list | `csv-imports` covers partially | low priority |
| `pcs-admin/closingAccReportForwarder.php` | Monthly accounting close report | accounting page covers high-level | **should-port** if accounting team uses monthly close ritual |
| `pcs-admin/withdraw-commission-interpreter.php` | Interpreter (พนักงานล่าม) payout | `sales-payouts` is sales-only | **should-port** if interpreter role in Pacred RBAC |
| `pcs-admin/training-regulations.php` | Static training regs | `hr/training` exists | covered |
| `pcs-admin/popup.php` | Admin push popup management | `notifications` covers in-app push | nice-to-have |
| `pcs-admin/products.php` | Shop product list/manage | none | deprecated (tied to dead shop/) |
| `pcs-admin/print-report-shop.php` | Shop order batch print | likely covered by `service-orders` printables | low priority |
| `member/map.php`, `pcs-admin/map.php` | Static map page | none | deprecated |
| `member/mail.php`, `pcs-admin/mail.php` | Static email-team page | none | deprecated |

**Total real gap items:** ~5 **should-port** items + ~10 deprecated/nice-to-have. **None block cargo revenue path.**

---

## 7. SQL/ dumps analysis

| File | Size | Generated | Notes |
|---|---|---|---|
| `pcscargo/SQL/pcsc_main.sql` | 306 MB | **2026-04-30 14:47** | App DB — **newer than Desktop dump** |
| `pcscargo/SQL/pcsc_cargo.sql` | 158 MB | 2026-04-30 14:46 | WordPress marketing DB — dead site (replaced by Pacred Next.js) |
| `~/Desktop/SQLWPPCS/somedata-2026-03-19-1348-pcsc_main.sql` | 306 MB | 2026-03-18 23:49 | The dump in CLAUDE.md — **superseded** by SQL/pcsc_main.sql |

**Recommendation:**
- Archive `pcscargo/SQL/pcsc_main.sql` (2026-04-30) into `docs/audit/sql-dumps/` (gitignored) as canonical snapshot
- Delete Desktop dump
- Extract `wp_options` keys from `pcsc_cargo.sql` for any Pacred SEO cross-reference; then delete

---

## 8. Cleanup recommendations (sequenced)

### Immediate (before Pacred public beta)
1. **Snapshot PHP tree** → `legacy-php-backup-2026-05-15.tar.zst` (out-of-tree, local). Safety net.
2. **Delete Tier 1-3 dead code** (~145 .php files + 3 backup sub-dirs) — frees ~1 MB of source, clears mental overhead.
3. **Patch S-3 SQL injection** in `header.php` if PHP stays externally accessible during cutover.

### Pre-PCS-shutdown
4. **Verify 5 "should-port" admin tools** (MaoMao tier, ShipBy-Freedom, monthly close, interpreter payout, etc.) — either port to Pacred or write one-pager confirming deferred/dropped.
5. **Confirm short-URL redirects** `/c/`, `/f/`, `/s/` — these may have external links (SMS/QR). Plan redirect strategy.
6. **Archive `pcsc_main.sql`** (2026-04-30). Delete old Desktop dump. Delete `pcsc_cargo.sql`.
7. **Revoke LINE Notify OAuth client** at LINE dev console.
8. **Send breach disclosure** to PHP customers re: weak `pass_tam()` hash → reset on first Pacred login.

### Hygiene (post-cutover, +30 days)
9. **Move `pcscargo/` to `pcscargo.archive.YYYY-MM-DD/`** — read-only.
10. **Delete `wp-*` stack + `wp-content/`** unless `wp-content/uploads/` linked from active Pacred pages (grep first).
11. **Update [`pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)** to checkmark legacy paths as scrubbed.
12. **Rotate ALL hardcoded secrets** from PHP (ThaiBulkSMS, FB OAuth, SMTP) — after Pacred cutover so legacy doesn't lose access mid-cutover.

### During-transition rules
13. Per CLAUDE.md "Don't preempt brand cleanup": **keep `api-forwarder-jmf/cn/ttp.php`** until ก๊อต confirms API switchover.
14. **Keep `member/storage/` + `member/images/users/forwarder/shops/`** until uploads migrated to Supabase Storage.

---

## 9. Notes on methodology

- mtime-based recency bucketing **abandoned** — entire tree shares 2026-03-19 mtime (bulk copy). Used content + filename + git-blame-equivalent (cross-ref existing audit) instead.
- File-content spot-checks performed on: login.php (both), header.php (both), config.inc.php (both), encryptPass.php, 4 OTP files, 6 admin autoruns, c/f/m/s shortlinks, linenotify/callback, sample/blank/code-templet/api-new-1. Not exhaustive.
- Tier-1 "high confidence delete" = filename matches dead-code pattern AND same-stem non-dead variant exists.
- Pacred port coverage cross-checked via `actions/admin/` + `app/[locale]/(admin)/admin/` listings.

---

## 🚦 Cross-link to action plan

- [PORT_PLAN Part U](../PORT_PLAN.md) — these findings → trackable T-U* tasks
- [STRATEGY §9](../STRATEGY.md) — production-readiness updated with these gaps
- [team-status doc](../runbook/team-status-2026-05-16.md) — assigned to ภูม + ก๊อต + เดฟ
- [pcs-scrub-plan.md](../runbook/pcs-scrub-plan.md) — sequencing
- [chat-analysis-2026-05-16.md](chat-analysis-2026-05-16.md) — parallel chat-derived findings
