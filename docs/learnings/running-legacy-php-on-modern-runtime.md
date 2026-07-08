# Running the legacy PCS-admin PHP (written for PHP 7) on a modern Mac (PHP 8.5)

**When:** 2026-07-08 · the owner asked to run the legacy PCS admin backoffice locally so we can compare page-by-page for the faithful port. It works now — full setup + the exact traps are in [`docs/research/pcs-admin-faithful-audit-2026-07-08/RUN-LEGACY-PCS-ADMIN.md`](../research/pcs-admin-faithful-audit-2026-07-08/RUN-LEGACY-PCS-ADMIN.md). This file = the reusable *gotchas* so the next person doesn't re-derive them.

## The 5 traps (each cost real time)

1. **The DB was already there.** A prior session had loaded `pcsc_main` (117 tables) into the running Homebrew MySQL — check `mysql -u root -e "SHOW DATABASES"` BEFORE hunting for a `.sql` dump. But the legacy's DB **user** (`pcsc_main` / `P%F7*bu98NUB`) didn't exist → `CREATE USER … IDENTIFIED BY …; GRANT ALL ON pcsc_main.*`. On MySQL 9 the `mysql_native_password` plugin is **unloaded** — create the user with the *default* auth (caching_sha2); PHP 8 mysqli speaks it fine. Also: MySQL 9 here has **no `MD5()` function** (odd build) — compute password hashes in the shell (`openssl md5`) or in PHP, not in SQL.

2. **PHP 8.1+ makes mysqli THROW by default.** The legacy ran on PHP 7 where a loose query (inserting `''` into a DATETIME, etc.) was a *warning*. On PHP 8.5 it's a fatal `mysqli_sql_exception`. **Fix = `mysqli_report(MYSQLI_REPORT_OFF);` right before `new mysqli(...)` in the config** → restores PHP-7 warn-not-fatal. One line unblocks most pages.

3. **PHP 8 throws `DivisionByZeroError`** where PHP 7 warned (`$x/0`, `%`, `intdiv`). These can't be globally suppressed (language-level throw) → patch each site as you hit it: `($n>0 ? $sum/$n : 0)`. In practice there were very few (1 in report-cnt across ~18 pages tested).

4. **The `php -S` built-in server is SINGLE-THREADED → any self-HTTP call DEADLOCKS.** The legacy's `checkRightsName()` did `file_get_contents(basePathAdmin.'…/dataJson.php')` — an HTTP request to *its own server* while that server was busy serving the page → 30s max-execution → the worker dies → every later request returns HTTP 000. **Two fixes, use both:** (a) replace self-HTTP with a direct `include` (`ob_start(); include __DIR__.'/…/dataJson.php'; $json = ob_get_clean();`), and (b) run with `PHP_CLI_SERVER_WORKERS=6` so the server can serve sub-requests concurrently. The workers env var is the systemic guard for any self-HTTP you missed.

5. **There are TWO configs — edit the RIGHT one.** `member/config/config.inc.php` (customer/member) vs `member/pcs-admin/config/config.inc.php` (the admin's OWN). Admin pages `require_once('config/config.inc.php')` **relative to pcs-admin/** → the admin config. I edited the member one first and the admin assets kept pointing at the old `https://localhost/pcscargo/…` path. Set `basePath`/`basePathAdmin`/`basePathMain` → `http://localhost:8899/…` in the ADMIN config, with `php -S localhost:8899 -t public_html`.

## Bonus: logging in
Auth = `pass_tam($pw)` (= `strrev(md5) . substr(md5,0,15) . md5(substr(md5,0,15))`) matched against `tb_admin.adminPass`. Reset a **god admin** on the local copy (`admin_pop` = CEO = companyType1/dept0/sec0 = the superset menu). The login form needs BOTH a `login` submit field AND the **"remember me"** checkbox (the `pcs_admin_logged` cookie that `header.php` validates is only set when remember is on — session-only login won't pass the cookie gate).

## The tool-harness gotcha (not PHP)
`php -S` started via the Bash tool's `run_in_background` still gets SIGKILL'd by the **2-min tool timeout** (exit 124). Start it truly detached: `nohup … & disown` in a foreground Bash call that returns immediately — then it survives across turns.
