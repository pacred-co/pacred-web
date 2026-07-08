# Running the legacy PCS admin backoffice locally (for the faithful-port audit)

**It runs.** As of 2026-07-08 the legacy PCS-admin PHP is browsable on this Mac.

## Access
- **URL:** http://localhost:8899/member/pcs-admin/
- **Login:** `admin_pop` (พี่ป๊อป · CEO/god access — companyType1/dept0/sec0 = the superset menu) / password **`pcs123456`**
  - ⚠️ tick the **"remember me"** checkbox — the session cookie `pcs_admin_logged` (that `include/header.php` validates) is only set when remember is on.
- **DB:** local MySQL `pcsc_main` (117 tables, real migrated data) · user `pcsc_main` / `P%F7*bu98NUB`.

## Start / restart the server
```bash
pkill -f "php -S localhost:8899"
PHP_CLI_SERVER_WORKERS=6 nohup /opt/homebrew/bin/php -S localhost:8899 \
  -t /Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html \
  > /tmp/php-server.log 2>&1 & disown
```
- **`PHP_CLI_SERVER_WORKERS=6` is REQUIRED** — the legacy makes self-HTTP calls; the default single-threaded `php -S` deadlocks on them.
- docroot = `public_html` → the admin is at `/member/pcs-admin/`.

## Setup that was done (one-time · on the LEGACY COPY only, not our repo)
1. `brew install php` (PHP 8.5.8 · mysqli/gd/mbstring).
2. MySQL user: `CREATE USER 'pcsc_main'@'localhost' IDENTIFIED BY 'P%F7*bu98NUB'; GRANT ALL ON pcsc_main.* TO …`
3. Reset `admin_pop` password on the local DB: `UPDATE tb_admin SET adminPass=<pass_tam('pcs123456')> WHERE adminID='admin_pop'` (pass_tam = `strrev(md5(p)) . substr(md5(p),0,15) . md5(substr(md5(p),0,15))`).
4. **PHP 7→8 compat fixes on the legacy source** (it was written for PHP 7):
   - `pcs-admin/config/config.inc.php` — local `basePath`/`basePathAdmin`/`basePathMain` → `http://localhost:8899/…` + **`mysqli_report(MYSQLI_REPORT_OFF)`** (PHP 8.1+ makes mysqli THROW on the legacy's loose queries [empty DATETIME etc.] → restore PHP-7 warn-not-fatal).
   - `member/config/config.inc.php` — same local basePath.
   - `pcs-admin/include/function.php` — the 3 `checkRightsName()` self-HTTP `file_get_contents(basePathAdmin…dataJson.php)` → direct `include` (the self-HTTP DEADLOCKS `php -S`).
   - `pcs-admin/report-cnt.php:487` — `$sumDayAll/$no` → guard `$no>0` (PHP 8 throws DivisionByZeroError; PHP 7 warned).

## Verified rendering (2026-07-08 · all HTTP 200, no fatal)
dashboard (CEO menu) · forwarder.php (ฝากนำเข้า · 6MB list) · report-cnt.php · shops.php/shop.php (ฝากสั่งซื้อ) · payment.php (ฝากโอน) · acc-forwarder/acc-shop/acc-payment/acc-topup/acc-withdraw · cnt-hs · forwarder-bill/forwarder-check/forwarder-driver/forwarder-quotation · admin-table · check-juristic · businessPlan · api-forwarder-momo · hs-forwarder-invoice · cart.

This local instance is the SIDE-BY-SIDE reference for the faithful-port audit ([`00-legacy-function-inventory.md`](00-legacy-function-inventory.md) = the CEO menu function checklist).
