# Learnings — legacy PHP port patterns

Topics: porting `D:\xampp\htdocs\pcscargo\` → Pacred Next.js. Schema mappings · auth pattern · validation · RBAC · PDF · helpers.

> Seed file. Skill that writes here: [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md).
>
> Expected first entries (post-emergency sprint): `function.php` helper port catalogue · ratesheet engine port · mPDF→react-pdf migration patterns · auto-cancel cron pattern.

---

## [2026-06-04 evening] Per-shop array loop pattern (legacy `update3.php` / `update4.php`)

**Symptom (ภูม flag):** Pacred `AdminMarkShopOrderOrderedForm` รับ `cshippingnumber` เลขเดียวแล้ว update ทุก row ของ `tb_order` ด้วยค่าเดียวกัน. ผิด — legacy loop per `cNameShop` (แต่ละร้านมีเลข ตัวเอง).

**Legacy pattern** (`pcs-admin/shops.php` L1071-1080):
```php
if(isset($_POST['update3'])){
  for($count = 0; $count<count($_POST['cNameShop']); $count++){
    $_POST['cShippingNumber'][$count]=replaceSpace($_POST['cShippingNumber'][$count]);
    $sql = "UPDATE `tb_order` SET cShippingNumber='...'
            WHERE hNo='$hNo' AND cNameShop='$_POST[cNameShop][$count]';";
    $result = $conn->query($sql);
  }
}
```

**Form (update3.php L34-52) renders** N hidden inputs `cNameShop[]` + N text inputs `cShippingNumber[]` — one per `cnameshop` (unique). Same for `cTrackingNumber[]` in update4.php.

**Port to Pacred:**
```ts
// 1. Schema: accept per-shop array OR legacy single (back-compat)
const orderedSchema = z.object({
  hNo: z.string(),
  cshippingnumber: z.string().optional(),  // legacy single
  shops: z.array(z.object({
    cnameshop: z.string().min(1),
    cshippingnumber: z.string().min(1),
  })).optional(),
}).refine((v) => (v.shops?.length ?? 0) > 0 || v.cshippingnumber, {
  message: "อย่างน้อย 1 ค่า",
});

// 2. Body: loop per-shop · WHERE hno + cnameshop
if (d.shops) {
  for (const sh of d.shops) {
    const { error, count } = await admin
      .from("tb_order")
      .update({ cshippingnumber: sh.cshippingnumber }, { count: "exact" })
      .eq("hno", header.hno)
      .eq("cnameshop", sh.cnameshop);
    // accumulate rowsUpdated + shopsUpdated for audit
  }
}

// 3. Audit log: include `per_shop` array in payload
await logAdminAction(adminId, "service_order.ordered", ..., {
  per_shop: d.shops ?? null, ...
});
```

**UI side:**
- Dedup `cnameshop` server-side (Map by `cnameshop` from already-loaded `tb_order` items list — no extra query)
- Render ONE card per unique cnameshop
- Each card: input(s) + initial values from current `cshippingnumber` / `ctrackingnumber`
- Submit: collect all cards → POST `{shops: [...]}` array

**Cross-link:** `actions/admin/service-orders-shop-workflow.ts` `adminMarkShopOrderOrdered` + `adminUpdateShopTracking` · `app/[locale]/(admin)/admin/service-orders/[hNo]/shop-fields-board.tsx`

**Bigger pattern:** **ตรวจ legacy form HTML — ถ้าเห็น `name="...[]"` (with brackets) → backend loops · port ต้องเป็น array argument · WHERE clause ต้อง include foreign-grouping key (cnameshop · userID · etc.)**

---

## [2026-06-04 evening] Status-aware conditional UI fields (legacy multi-file update*.php pattern)

**Symptom:** Pacred `/admin/service-orders/[hNo]/edit` แสดง input ตัวเดียวกับทุก status. ผิด — legacy แต่ละ status เปิดฟิลด์ที่แก้ได้ต่างกัน.

**Legacy structure** (`shops/update.php` dispatcher):
```php
switch($_POST['type']){
  case "3": require('include/pages/shops/update/update3.php'); break;  // form: cshippingnumber input per shop
  case "4": require('include/pages/shops/update/update4.php'); break;  // form: cshippingnumber LOCKED + ctrackingnumber input per shop
}
```

Each `update<N>.php` renders a **different form** for the same `hNo` based on its current `hStatus`. Plus each has its own `update<N>Script.php` (per-status JS).

**Port to Pacred (single React component, conditional render):**
```tsx
export function ShopFieldsBoard({ status, shops, ... }) {
  if (status === "1" || status === "2") return null;  // items-editor handles these
  const isStatus3 = status === "3";
  const isStatus4 = status === "4";
  const isStatus5 = status === "5";

  return shops.map((sh) => (
    <div key={sh.cnameshop}>
      <label>เลขออเดอร์ร้านจีน</label>
      <input
        value={draft[sh.cnameshop]?.cshippingnumber}
        disabled={!isStatus3}              // editable at 3 · locked at 4/5
      />
      {(isStatus4 || isStatus5) && (
        <>
          <label>เลข Tracking จีน</label>
          <input
            value={draft[sh.cnameshop]?.ctrackingnumber}
            disabled={!isStatus4}          // editable at 4 only
          />
        </>
      )}
    </div>
  ));
}
```

**Bigger pattern:** **เมื่อ legacy มี `update<N>.php` หลายไฟล์สำหรับ status ต่างๆ → port เป็น component เดียว + conditional flag (`isStatus3`, `isStatus4`) — ไม่ต้องสร้าง component แยก** (React conditional render ทำได้คล้ายๆกัน · maintain ง่ายกว่า)

**Cross-link:** `shop-fields-board.tsx` + save-point 2026-06-04-evening §C

---

## 2026-05-31 — Split-casing landmine: `tb_users` is camelCase on prod, `tb_address`/`tb_forwarder` are lowercase (เดฟ · agent C)

**Symptom (caught by a DB-connected test, NOT tsc):** a freshly-ported action querying `tb_users` threw `column "usershipby" does not exist` at runtime — even though `0081_*.sql` (the migration file on disk) declares the column lowercase. tsc + lint + a route-200 smoke all passed; only a test that hit the **real prod DB** surfaced it.

**Root cause:** the **2026-05-27 batch-1 camelCase rename** (`tb_users` + `tb_admin` + `tb_co`, migrations 0113/0114) renamed those three tables' columns to camelCase **on prod**, but `tb_address` / `tb_forwarder` / `tb_header_order` / `tb_payment` / `tb_wallet*` stayed **lowercase**. The `0081` migration file still shows the OLD lowercase names, so reading the migration source LIES about prod reality. PostgREST fuzzy-matches some cases but raw `.eq("usershipby", …)` / `.select("userShipBy")` mismatches hard-error.

**The canonical truth (verify against prod, not the migration file):**
| Table family | Casing on prod | Examples |
|---|---|---|
| `tb_users`, `tb_admin`, `tb_co` | **camelCase** | `userID`, `userShipBy`, `userPayMethod`, `companyCustomer`, `coID`, `adminIDSale` |
| `tb_address`, `tb_forwarder`, `tb_header_order`, `tb_payment`, `tb_wallet`, `tb_wallet_hs`, `tb_cnt*` | **lowercase** | `userid`, `fstatus`, `hstatus`, `paystatus`, `wallettotal`, `walletid` |

**Rules this burns in:**
1. **Any new code reading `tb_users`/`tb_admin`/`tb_co` MUST use camelCase column names** (`userID` not `userid`, `userShipBy` not `usershipby`). The join key on those tables is `userID` (camelCase); on every OTHER `tb_*` table it's `userid` (lowercase). This bites silently because the JS object key is just a string — no compiler catches it.
2. **The migration FILE on disk is NOT the prod schema** for these 3 tables (0113/0114 renamed them post-0081). To know a column's real casing, probe prod (`select * … limit 1` and read the keys) — don't trust the `CREATE TABLE` in `0081`.
3. **tsc cannot catch a wrong Supabase column string.** A DB-connected test (sentinel-guarded, hits real prod) is the ONLY gate that finds it. Every new `tb_*` reader/writer should ship with one. This is the §0c "destructure error + a real query" discipline made concrete.

(Earlier related entry: "Schema casing drift" 2026-05-28 — this is the confirmed prod-runtime consequence.)

---

## 2026-05-30 — Dual-table writes: a "best-effort mirror" that NEVER fires looks identical to "working" (เดฟ)

**Symptom (owner-reported):** new customers who registered never appeared in `/admin?tab=inactiveCustomers` (or `/admin/customers/pending`). The admin queue showed zero recent signups even though `/register` succeeded and the customer could log in.

**Root cause — TWO compounding failures:**
1. **Table-split the rebuilt app introduced.** Pacred customer signup writes to **`profiles`** (rebuilt-app table). The legacy admin queue reads **`tb_users` WHERE `userActive='0'`**. A "bridge" (`lib/auth/legacy-bridge-tb-users.ts`, wave-28 F1) was supposed to mirror each new profile into `tb_users` so the legacy admin UI sees it. Classic D1 dual-write: new code writes table A, ported legacy UI reads table B.
2. **The bridge was deployed-but-never-ran-on-prod.** Written 2026-05-29 03:02 on `Poom-pacred`, it only reached production `main` via integration a day later. Every signup in between (58 profiles, PR002–PR027) wrote `profiles` only → orphaned. **Prod-probe proof:** `SELECT count(*) FROM tb_users WHERE coID='PR'` (the bridge's signature value) returned **0** — the bridge had literally never inserted a single row in production. A grep of the code would say "bridge is wired + awaited + correct"; only a prod-data probe revealed it had never executed there.
3. **Latent third bug surfaced during backfill:** `tb_users.userTel` carries a UNIQUE index (`idx_*_usertel`). The bridge pre-checked `userID` collision but **not** `userTel`. 14 of the 58 orphans were re-registrations sharing a phone with an existing row → the insert would throw `23505` and (being best-effort, never-throw) silently orphan them anyway. So even after the bridge "worked", ~24% of signups would still vanish.

**The deeper lesson — a silent best-effort mirror is invisible when it fails.** The bridge was written to *never throw* (so a failed mirror wouldn't 500 the signup). Good intent, but it means: **failure produces exactly the same observable result as the table-split bug it was meant to fix** — customer in `profiles`, absent from admin. There was no signal. The ONLY way to know the bridge worked is to assert the row landed in table B — which nobody did until the owner noticed customers missing weeks later.

**Fix applied (commit 221856bc):**
- Backfilled 44 orphans into `tb_users` (idempotent script `scripts/backfill-orphan-tb-users.mjs`, savepoint-per-row, phone-collision skip). 14 phone-dupes intentionally left mapping to their existing identity.
- Added the missing `userTel` pre-check + degraded `23505`-on-insert from `error`→`info` (race-safe).

**Rules this burns in:**
1. **Any dual-write (new table + ported legacy table) needs a reconciliation probe, not just code review.** `SELECT count(*) FROM legacy_table WHERE <new-code signature>` — if it's 0, the mirror never ran, no matter how correct the code reads. Add it to the deploy gate for any feature that mirrors across the `profiles ↔ tb_*` split.
2. **A best-effort/never-throw mirror MUST emit a success metric you can query later** (here: `coID='PR'` was an accidental signature that saved us — make it deliberate). Silent degrade = invisible failure = weeks of lost signups.
3. **"Deployed" ≠ "ran on prod."** A commit on a feature branch that reaches `main` days later means prod had the OLD behavior the whole time. When diagnosing "feature X doesn't work," first verify X's code actually reached prod *and left a trace*, before debugging the logic.
4. **Mirror EVERY unique constraint of the target table in the pre-check**, not just the PK. `tb_users` has unique `userID` AND unique `userTel`; checking only `userID` left a 24% silent-failure hole.

Cross-link: [`verify-deep-flow.md`](verify-deep-flow.md) (assert the row/outcome, not the 200) · [`ci-and-deploy-gotchas.md`](ci-and-deploy-gotchas.md) (deployed-vs-ran, dead-DB-probe).

---

## 2026-05-16 — V-A7 receipt-number "-N suffix" is N/A in Pacred (ภูม)

**What:** PORT_PLAN Part V row V-A7 ("Receipt-number cleanup — one canonical number, drop the error-prone `-N` suffix") describes a legacy PCS Cargo PHP problem where receipts could spawn `R-12345-1`, `R-12345-2`, etc. variants for re-issues — error-prone because staff and customers kept different numbers in their records.

**Status in Pacred:** **Already designed out from day 1, no port work needed.**
- Forwarder receipts use the raw `f_no` (one-to-one with the forwarder row)
- Service-order receipts use the raw `h_no` (one-to-one with the service_order row)
- Tax invoices use atomic `INV-YYYYMM-NNNN` from `next_tax_invoice_serial()` (migration `0034`); re-issues = cancel + new serial (per ADR-0006 §7 RD Code 86 immutability)
- No `receipt_no` / `receipt_seq` column anywhere; no codepath that appends `-N`

**Why this matters:** Future agents auditing Part V might be tempted to "fix" something that isn't broken. The clean design is intentional and well-suited to Pacred's e-receipt model.

**Verification path:** `grep -rE "receipt_no|receipt_number|receipt_seq" pacred-web/` returns zero application-code hits (matches in docs only). `next_tax_invoice_serial()` is canonical + idempotent.

**If you ever see a `-N`-style suffix appear:** it's a regression. Hunt the codepath, don't add the suffix to schema.

---

## 2026-05-18 — MySQL → PostgreSQL port: three gotchas that fail a COPY load (เดฟ/Claude)

**Context:** the D1 PCS→Pacred data migration — `pcsc_main` (117 tables) MySQL → PostgreSQL. The approach that worked: load the dump into local MySQL (XAMPP MariaDB), then a Python converter reads from the *live* DB (`pymysql`) and writes PostgreSQL `COPY` text-format files. Reading a live DB beats text-munging the 898 MB dump — clean typed values, no MySQL-escape parsing, free row-count reconciliation. A throwaway portable PostgreSQL (EDB binaries zip, `initdb` into a temp folder, no install) is enough for a dry-run.

Three legacy-data gotchas — each fails a Postgres `COPY`, none caught by `build`/`verify`, only at load time:

**1. NUL bytes (`\x00`) in legacy `varchar` data.** Some values carried a stray NUL. PostgreSQL `text`/`varchar` cannot store `\x00`. The symptom is misleading — `ERROR: extra data after last expected column` (the NUL truncates psql's C-string line read and scrambles field parsing), NOT an obvious bad-byte error. Fix: strip `\x00` from every string in the converter.

**2. Legacy `datetime NOT NULL` columns hold `'0000-00-00'`.** MySQL's `NOT NULL` does NOT block the zero-date sentinel. Keeping `NOT NULL` while mapping `0000-00-00` → `NULL` (Postgres has no zero-date) fails with a not-null violation. Fix: every `date`/`time`/`timestamp` column must be NULLABLE in the Postgres port — zero-date ↔ NULL.

**3. When a COPY row-count looks right but psql still rejects the row,** inspect raw bytes (`open(f,'rb')` + `repr`), not decoded text — a naive tab-count per line said the file was clean while gotcha #1 was hiding at the byte level.

**Also:** spawned sub-agents could NOT do network downloads (WebFetch/PowerShell/Bash network egress denied); the main session can (`pip install`, `Invoke-WebRequest` work). Do fetch/download work from the main session, not a sub-agent.

**Full migration runbook:** [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md).

---

## 2026-05-19 — MySQL → PostgreSQL via pgloader: 5 more gotchas (เดฟ/Claude)

**Context:** the D1 migration re-run end-to-end on a Mac with **pgloader**
(vs the 2026-05-18 Python converter — both reach the same validated result:
3,780,238 rows, 117/117 tables reconcile). Toolchain via Homebrew: `mysql` +
`postgresql@17` + `pgloader`. pgloader is the faster path — one command does
schema + data + indexes + sequence reset (~29 s for 3.78 M rows).

**1. pgloader connects to MySQL 9.x fine — no `caching_sha2_password` workaround.**
A common worry: MySQL 8.4+/9.x dropped `mysql_native_password` and an old
MySQL driver can't speak `caching_sha2_password`. Not true for pgloader
3.6.10 — it connects to MySQL 9.6 over TCP with no extra config. Don't waste
time creating native-password users (MySQL 9.x removed that plugin anyway).

**2. One pgloader CAST rule kills the zero-date NOT-NULL trap.**
The 2026-05-18 gotcha #2 (legacy `datetime NOT NULL` holds `0000-00-00`) is
solved declaratively in the `.load` file:
`CAST type datetime to timestamp drop not null using zero-dates-to-null`.
The `drop not null` is the essential half — without it the zeroed value
maps to NULL then fails the NOT NULL constraint. NUL bytes: pgloader's
batch loader absorbed them with 0 rejects (no manual strip needed).

**3. MySQL's default collation is case-INSENSITIVE — PostgreSQL is not.**
Legacy `utf8mb3_general_ci` means `'pcs1791' = 'PCS1791' = 'Pcscargo'` all
join/compare EQUAL; the legacy PHP relied on this unknowingly. PostgreSQL
`text`/`varchar` is case-SENSITIVE. So any identifier-like column used in
joins (here the `userid` member code) MUST be **case-normalised** in the
port — else joins that silently worked in MySQL silently break in PG. The
PCS→PR rebrand folds every code to one canonical case:
`'PR' || substring(upper(userid) from 4) WHERE upper(userid) LIKE 'PCS%'`.
Check the source for case-collision dupes FIRST (`GROUP BY upper(col)
HAVING count(*)>1`) — a collision would fail a PK/unique UPDATE.

**4. `notnull` / `isnull` are PostgreSQL postfix operators — never bare aliases.**
`SELECT count(*) FILTER (WHERE x IS NOT NULL) notnull FROM t` does NOT alias
the count — PG parses it as `(count(...)) NOTNULL` (i.e. `IS NOT NULL`) → a
**boolean**. Symptom: the column returns `t`/`f`, and a UNION with an int
literal fails `UNION types boolean and integer cannot be matched`. Fix: any
other alias (`nn`) or quote it (`AS "notnull"`).

**5. A Supabase data load needs the Postgres password — the API keys can't.**
The `anon` / `service_role` / `sb_publishable_*` keys authenticate to
**PostgREST** (the REST layer) — CRUD on existing tables, RLS-gated. They
CANNOT run DDL (`CREATE TABLE`) or a bulk `COPY`. A schema+data migration
needs a real Postgres connection —
`postgresql://postgres:<DB-PASSWORD>@db.<ref>.supabase.co:5432/postgres` —
and the DB password is a separate dashboard secret (Project Settings →
Database), NOT any API key. Plan the migration around obtaining it.

---

## 2026-05-19 — Legacy PCS `tb_*` schema reference for the D1 port (ภูม research)

**Context:** ภูม's PCS Cargo system research (4 files copied verbatim to
[`docs/research/pcs-legacy/`](../research/pcs-legacy/_index.md)) decodes the legacy
MySQL `pcsc_main` schema. The durable business-logic synthesis is in
[`pacred-domain-knowledge.md`](pacred-domain-knowledge.md) (2026-05-19 entry); the
**port-mechanics** facts that belong here:

**The legacy customer-facing tables to map (per `PCS_CARGO_COMPLETE_ANALYSIS.md` §5):**
`tb_user` · `tb_admin` · `tb_address` · `tb_cart` · `tb_shops` · `tb_forwarder` ·
`tb_forwarder_item` · `tb_forwarder_img` · `tb_payment` · `tb_wallet` · `tb_account_pcs`.

**Port gotchas specific to this schema:**

1. **Status columns are numeric VARCHAR strings, not ints/enums.** `sStatus`,
   `fStatus`, `pStatus`, `wType`, `userStatus` are all `VARCHAR(1-2)` holding
   `'0'`-`'9'`. A naive int cast loses the leading-zero / `'0'`=cancelled case.
   Decide the Pacred target type explicitly (PG enum or smallint) and map.

2. **The forwarder has no status-history table — it has per-status DATETIME
   columns** `fDateStatus2`…`fDateStatus7` on the header row. A faithful port
   either replicates those columns OR builds a real history table — but the
   *legacy data* lives in those wide columns, so the migration must read them.

3. **`tb_wallet.wBalance` is a stored running balance** (balance AFTER each txn),
   not derived. The ported wallet must keep the same invariant or recompute on
   migrate — don't assume balance is computed from a sum.

4. **`userID` = `PCS####`** is the legacy member code; Pacred rebrands to `PR###`.
   The PCS→PR rebrand + case-normalisation rule is already documented in the
   2026-05-19 pgloader entry above (gotcha #3) — same column.

5. **Code-map columns are tiny VARCHARs** (`sProvider`, `fWarehouseChina`,
   `fWarehouseName`, `fTransportType`, `fShipBy`, `bankName`) holding `'1'`-`'8'`.
   The decode tables are in `pacred-domain-knowledge.md` — port the *meaning*,
   keep the legacy code values for data-migration fidelity.

**Why this matters:** when porting a shopping/forwarder/payment/wallet screen,
the legacy column names + their numeric-string status values are the contract.
Reconcile against `docs/research/pcs-legacy/` before designing the Pacred table.

---

## 2026-05-20 — A legacy PHP page = shared chrome + per-screen body: port BOTH (เดฟ/Claude)

**Context:** the D1 customer-portal transcription was reviewed by the owner as
"ไม่เหมือน 1:1 เลย" (looks nothing like the original), "บัคกระจาย" (bugs
everywhere). Root-caused — and it is a trap any agent porting the 187-screen
admin back-office will hit the same way.

**A legacy PCS `member/*.php` page is TWO layers:**
1. **Shared chrome** — `include/header.php` (`<head>` + a **21-file** Modern-Admin
   Bootstrap-4 theme CSS bundle) + `header-theme.php` (the `<body>` classes) +
   `top-menu.php` (the fixed navbar) + `left-menu.php` (the sidebar) +
   `all-script.php` (footer + mobile bottom-nav + the jQuery/BS4/theme JS
   bundle). EVERY screen `require_once`s these.
2. **Per-screen body** — the `<div class="app-content content">…</div>` block
   between the `header-theme.php` and `all-script.php` includes.

**The bug:** the first transcription pass ported the per-screen *bodies*
faithfully but **never built the chrome layer** — no theme bundle staged, the
route-group `layout.tsx` was a bare auth wrapper. Result: every screen rendered
as unstyled raw Bootstrap markup with no navbar/sidebar/nav. The bodies were
fine; the page looked 100% broken. A per-screen `.css` (the page's inline
`<style>`) CANNOT substitute — `.card`/`.row`/`.col-*`/`.btn`/gradients are all
**theme** classes from `bootstrap.min.css` + `components.min.css` + `style.css`.

**The fix (the pattern for any PCS section — customer AND admin):**
- Stage the legacy `assets/` theme bundle **verbatim** under
  `public/legacy/pcs/assets/` (CSS + JS + fonts + icons; skip the PHP-only
  plugin dirs `mpdf*` / `api-spreadsheets` / `barcode` / `face-detection`).
- Make the **route-group `layout.tsx` BE the chrome** — load the exact CSS
  bundle `header.php` loads, in order; render the navbar + sidebar + footer
  components; load the JS bundle last. Then each `page.tsx` is *body only*.
- Responsive is **free**: `header.php`'s bundle already includes
  `custom-mobile-2023.css` / `custom-tablet-2023.css` / `pcs-group/custom-mobile.css`
  — load the bundle and the mobile + desktop layouts both render 1:1. Do NOT
  hand-build responsive.
- `<body>` classes (`vertical-layout vertical-menu-modern …`) — Next owns
  `<body>` in the root layout; set them from a small `"use client"` component
  in the protected layout (add on mount, remove on unmount).
- Order the JS bundle with plain `<script src async={false}>` (jQuery must load
  before the theme JS); render it last so the full chrome DOM exists.

**Also — "the database is wrong" was a false alarm.** The owner also flagged
the DB as "ไม่ตรง ไม่มีความต่อเนื่อง". Probed it with `psql` (count + max-date):
both the dev and prod Supabase hold the **full current** dataset — 8,898 users /
21,950 orders / 47,626 forwarders / 104,591 wallet-history rows, all through the
latest `2026-05-18` dump; migration `0081` matches the dump table-for-table and
column-for-column. The data only *looked* discontinuous because the unstyled
screens were unreadable. **Lesson:** before "reload the DB", probe it —
`psql … -c "SELECT count(*), max(<date>) FROM <t>"` — the pgloader load may
already be correct, and the real bug is elsewhere (here: the chrome layer).

---

## 2026-05-25 — V-A5 manual invoice adjustments — Pacred safety improvement over legacy (Agent L / Sprint-12 P2.6)

**What:** PORT_PLAN Part V row V-A5 ("Manual adjustment line on an invoice (±amount, reason, audited) — ends the per-cent dev tickets") shipped via migration `0109_invoice_adjustments.sql` + `actions/admin/invoice-adjustments.ts`.

**Legacy state:** `pcs-realshit/public_html/member/pcs-admin/include/pages/receipt.php` + `hs-forwarder-receipt.php` + `create-f-receipt.php` — the legacy receipt/invoice flow had **no clean adjustment line**; every per-cent correction (over-collected ฿50, manual waiver, late discount) required a developer to rewrite invoice totals by hand. The chat audit (`docs/audit/chat-analysis-2026-05-16.md`) records this as a recurring staff pain point.

**Pacred V-A5 design — polymorphic over invoice kinds, signed amount, mandatory reason:**
- `invoice_adjustments(id, target_type, target_id, profile_id, amount_thb, reason, status, added_by_admin, reversed_at, reversed_by_admin, reversal_reason, created_at)`
- `target_type` ∈ `{'forwarder', 'service_order', 'freight_invoice'}` — one table covers all 3 invoice kinds Pacred currently issues
- `amount_thb` is SIGNED — positive = surcharge added to invoice total, negative = discount/credit
- `reason` is REQUIRED (min 3 chars + length check at DB level)
- `status = active | reversed`; reversed rows stay visible for full audit history but are excluded from totals
- View `invoice_adjustment_totals` (SECURITY INVOKER) gives a per-invoice scoped sum
- RLS: customer reads own; admin = super OR accounting (money-touching per ADR-0005 K-7 — `ops` is intentionally excluded; ops has the U2-4 cost-adjustment path for post-delivery rebills)

**Distinct from U2-4 `forwarder_cost_adjustments`:**
- U2-4 = positive-only post-delivery fees (D/O · gateway · weight rebill · customs extra · other), forwarder-specific, with wallet auto-debit "mark paid" workflow
- V-A5 = signed manual adjustments on ANY invoice kind, no wallet move (invoice-total only), free-form reason

**If you ever need to add a 4th invoice kind:** extend the `target_type` CHECK constraint + add a branch in `resolveInvoiceTarget()` (`actions/admin/invoice-adjustments.ts`). The NotifyReferenceType union also needs the new kind if you want notification deep-linking by reference_type.

---

## [2026-05-26] `convertIMGCHN` port copied legacy nested image path but never created the directory

**Context:** ปอน rebuilt `/cart` with Tailwind (commits `c8e06e92` + `fb7939f1`) and reported "รูปบางรูปหาย" — empty-image cart rows rendered a broken-image icon. Cherry-picked her commits cleanly, then chased the missing images.

**Symptom:** The legacy `convertIMGCHN($url, $size)` helper (`member/include/function.php` L1414-1437) was transcribed verbatim into `app/[locale]/(protected)/cart/page.tsx`:

```ts
function convertIMGCHN(url: string | null, size: string): string {
  if (!url || url === "") {
    return "/legacy/pcs/images/shops/default.png";   // ← never existed
  }
  // ... split + clean URL ...
  if (u.includes("/")) { return u + size; }
  return "/legacy/pcs/images/shops/" + u;             // ← never existed
}
```

But `public/legacy/pcs/` only had a `shops/` subdir (with logos + default.png) — there was NO `images/shops/` subdir. So:
- Empty `cImages` → `/legacy/pcs/images/shops/default.png` → 404
- Bare-filename `cImages` → `/legacy/pcs/images/shops/<file>` → 404

The shop LOGOS (1688/taobao/tmall/nice) worked fine because `imgProvider()` (the OTHER helper, L35-44) correctly maps to `/legacy/pcs/shops/<logo>.png` (existing dir).

**Root cause:** Legacy PHP's `basePath` for product images was `member/images/shops/` (separate from `member/shops/` which held the brand logos). The transcription kept the path string but the static-mount stager only copied `shops/` (logos), never `images/shops/` (product uploads). Pre-existing bug — predates ปอน's Tailwind rebuild (same paths in `a08e7290`) — surfaced visibly when her cleaner card markup let the broken icon stand out from the noisy Bootstrap markup it replaced.

**Fix:** create `public/legacy/pcs/images/shops/` + copy `default.png` to it (commit `9646dbf7`). The bare-filename branch still 404s for legacy product uploads we don't host — same as legacy PCS behaviour for orphaned image filenames, so faithful to the port.

**Why this matters next time:**
- When transcribing a legacy helper VERBATIM, the path string is only half the work — the static-mount stager has to actually have the directory at the resolved path. Greppable check after any helper port:
  ```bash
  # for every path the helper can resolve to, the dir must exist in public/
  grep -nE '"/legacy/[^"]+"' lib/ app/ | sort -u
  ```
- A bug like this stays INVISIBLE under noisy legacy Bootstrap markup (broken-image icon blends in). A clean Tailwind rebuild surfaces it because the missing image now stands out from the otherwise-clean card. **Surfacing a pre-existing bug ≠ regression** — when a teammate reports a visual bug right after their UI rebuild, check git history first before assuming they introduced it.
- Helper-to-static-mount audit should be part of any "legacy file port" PR checklist. The faithful-port skill should add a "grep helper paths · ls every dir" gate.

**Cross-links:**
- Commit `9646dbf7` — the directory + default.png placeholder fix
- `app/[locale]/(protected)/cart/page.tsx` L134-152 — the verbatim transcription
- `member/include/function.php` L1414-1437 (legacy source) — original PHP helper
- `imgProvider()` in same file L94-112 — the helper that got the path RIGHT (shop logos)

## [2026-05-28] Schema casing drift — tb_cnt* uses camelCase quoted columns but action code writes lowercase keys (PostgREST hides it)

**Context:** Wave 25 sandbox cleanup. ภูม ran DELETE SQL in Supabase Dashboard → `ERROR: 42703: column "cntid" does not exist · HINT: Perhaps you meant to reference the column "cntID"`.

**Symptom:** raw SQL `WHERE cntid = ...` fails. But `actions/admin/cnt-payment.ts` writes `{ cntid: cntId }` via `.from("tb_cnt_item").insert(...)` and works fine — INSERT succeeds, action returns `{ ok: true }`.

**Investigation:** column-casing survey reveals inconsistent casing within the same conceptual schema family:

| Table | Casing |
|---|---|
| `tb_cnt` | ALL camelCase quoted (`cntID` · `cntName` · `cntStatus` · `cntAmount` · `nameBlank` · `noBlank` · `adminIDCreate` · only `date` is lowercase) |
| `tb_cnt_item` | ALL camelCase (`fCabinetNumber` · `cntID`) |
| `tb_cnt_pay_idorco` | ALL lowercase (`fidorco` · `fcabinetnumber`) |
| `tb_cnt_pay_trackingchn` | ALL lowercase |
| `tb_forwarder` | ALL lowercase (`fstatus` · `fdatestatus5` · `adminidupdate`) |
| `tb_log_forwarder_status` | ALL lowercase |

The legacy MySQL `pcsc_main` dump preserved identifiers as-is when imported — some had been declared with backtick-quoted camelCase in MySQL, others bare lowercase. Postgres stores quoted identifiers case-preserved + requires identical case to match.

**The mystery — why does the action's INSERT work?** Supabase JS client / PostgREST appears to fuzzy-match column names case-insensitively when constructing the SQL. The INSERT `{ cntid: ... }` is silently rewritten to `INSERT INTO tb_cnt_item ("cntID") VALUES (...)`. This makes the casing inconsistency invisible to the REST-layer-only code path.

**Why this matters next time:**
- Any feature using **raw SQL** (Postgres RPC functions · psql migration scripts · pg-promise · direct PostgreSQL client) hits `column does not exist` errors.
- Any **stored function / view / trigger** must use correct case (`"cntID"`).
- A future grep-and-rewrite codemod that "normalizes" case could break things.
- **Code in `actions/admin/cnt-payment.ts` is technically wrong** — relies on PostgREST's fuzzy match. Best practice: rewrite to use camelCase keys matching the schema (`"cntID"` not `cntid`).

**Decision needed (carry to next session):**
- **Option A** — rewrite action code to match schema (~2 hr audit + fix)
- **Option B** — write migration to rename schema columns to lowercase consistently (~1 hr + apply prod · risk: consumers using camelCase break)
- **Option C** — leave + add code comment + lint rule. Risk: any future raw-SQL/RPC writer hits trap.

**Detection sweep (find every drifted table):**
```sql
SELECT table_name,
       COUNT(*) FILTER (WHERE column_name = lower(column_name)) AS lowercase_cols,
       COUNT(*) FILTER (WHERE column_name <> lower(column_name)) AS camelcase_cols
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name LIKE 'tb_%'
GROUP BY table_name
HAVING COUNT(*) FILTER (WHERE column_name = lower(column_name)) > 0
   AND COUNT(*) FILTER (WHERE column_name <> lower(column_name)) > 0
ORDER BY table_name;
```

**Cross-links:**
- Wave 25 save-point: [`docs/research/poom-save-point-2026-05-28-afternoon.md`](../research/poom-save-point-2026-05-28-afternoon.md) §4 B-5
- Migration `0113_align_pilot_users_admin_co.sql` — ironically normalized tb_users/tb_admin/tb_co to camelCase but didn't sweep tb_cnt* which were already mixed. Future align migrations should pick a casing convention project-wide.
- Action code that relies on PostgREST fuzzy-match: `actions/admin/cnt-payment.ts` lines 240-252 (tb_cnt INSERT), 391-392 (tb_cnt_item INSERT)


---

## [2026-05-30] เขียนแค่ history table = ตัว editor ดูทำงานแต่ไม่มีผลต่อ billing

**บริบท:** legacy customer-profile มีตัวปรับ "เรทขายต่อลูกค้า" (per-user rate override). port มาเป็น `/admin/rates/custom-hs` + `adminUpdateCustomerHsRates` — แต่มัน INSERT แค่ history (`tb_customrate_hs` + `tb_hs_rate_custom_kg/cbm`) **ไม่เคยเขียน live (`tb_rate_custom_kg/cbm`)** ที่ price engine อ่าน. แอดมินตั้งเรท เห็น "บันทึกแล้ว" แต่ราคาเรียกเก็บ **ไม่เปลี่ยน** — เพราะ legacy `customRate` handler เขียน **ทั้ง live + history** แต่ port มาแค่ครึ่งเดียว.

**บทเรียน:**
1. **ตาราง `*_hs` / `*_history` = audit ไม่ใช่ source-of-truth.** เวลา port write-handler ที่ปรับเงิน/เรท ให้ไล่ว่า legacy เขียน **กี่ตาราง** — มักมีคู่ (live ที่ระบบอ่าน + history ที่เก็บ audit). port ทั้งคู่เสมอ. ชื่อ `tb_customrate_hs` = customrate **History** ไม่ใช่ HS-code (confusion ที่ทำให้ port ผิด).
2. **Verify ถึง "ค่าที่ engine อ่านจริง" ไม่ใช่แค่ "save สำเร็จ".** route 200 + toast เขียวไม่พอ — ต้องเช็คว่า field ที่ billing อ่าน เปลี่ยนจริง.
3. **Floor/min ที่ legacy โชว์ มักเป็น display-only ไม่ enforce.** อย่า hard-block ตาม UI label — ข้อมูลจริงอาจละเมิด (ลูกค้า PW: KG=0 คิด CBM อย่างเดียว · CBM 4500 < floor 5300). ทำ advisory (เตือน) + ให้ owner ตัดสิน policy เอง. `0 = ไม่คิดตามหน่วยนั้น` ห้ามนับว่า "ต่ำกว่าทุน".
4. **ตรวจ encoding ที่ port มาก่อนหน้าด้วย** — `/admin/rates/*` เดิม label โกดังสลับ (`1=อี้อู` แต่ legacy `1=กวางโจว`). data เขียนถูก (ส่ง value ผ่าน) แต่ป้ายผิด → แอดมินตั้งเรทผิดโกดังได้.

**Cross-link:** [`docs/audit/customer-profile-rate-audit-2026-05-30.md`](../audit/customer-profile-rate-audit-2026-05-30.md) · `actions/admin/customer-rate.ts` (live+history เขียนคู่ · faithful) · `lib/admin/customer-rate-tables.ts`

---

## [2026-05-30 ค่ำ] ชื่อคอลัมน์โกหกได้ — verify "ความหมาย" ของ field ภาษีจาก data จริง ไม่ใช่ชื่อ

**บริบท:** port การคิด WHT/VAT ของ `tb_forwarder`. P0 ผม map `ftotalprice → goods` (ชื่อเหมือน "ยอดรวมสินค้า"). agent (trust-but-verify) flag ว่าผิด → verify จาก prod data: **`ftotalprice` ≈ fweight × rate ทุกแถว** (id2581: 11663/481kg≈24/kg · id7404: ftotalprice 2446 + ftransportprice 1600 + chnthb 1313 แยกกัน) + legacy printReceiptF label "ค่าขนส่ง" → **`ftotalprice` = ค่าขนส่ง CN→TH ไม่ใช่สินค้า**. ฝากนำเข้า (import) **ไม่มีบรรทัด goods เลย** (ลูกค้าเป็นเจ้าของสินค้าอยู่แล้ว · ฝากแค่ขนส่ง).

ถ้าไม่จับ → juristic หัก WHT **ขาดบนบรรทัดใหญ่สุด** (goods 0% แทน transport 1%) + VAT ผิด. แก้: `ftotalprice + ftransportpricechnthb → transport intl` (WHT 1% · VAT 0%) · `ftransportprice → transport domestic` (VAT 7%) · `goods = 0`.

**บทเรียน:**
1. **field ที่กระทบเงิน — verify ความหมายจาก 3 ทาง:** (a) magnitude ของ data จริง (rate×qty?) · (b) label บนเอกสาร legacy (ใบเสร็จ/ใบกำกับ) · (c) domain logic (ฝากนำเข้า = บริการขนส่ง ไม่มีสินค้า). อย่าเชื่อชื่อคอลัมน์ (`fTotalPrice` ≠ goods).
2. **per-flow mapping ต่างกัน:** ฝากสั่ง (tb_header_order) มี goods value จริง · ฝากนำเข้า (tb_forwarder) ไม่มี — engine เดียวกัน แต่ map field คนละชุด.
3. **e-WHT / floor / min ที่ owner พูด มักเป็น policy ไม่ใช่ formula** — แยก nominal rate (ในโค้ด) ออกจาก remit-time reduction (e-WHT) + display-only floor.

**Agent-orchestration note:** spawn isolated-worktree agents (A profile · B P2) คู่ขนาน — env ของ agent **commit/git/tsc ไม่ได้** (permission policy) → agent เขียนไฟล์ไว้ใน worktree + รายงาน · orchestrator (เรา) `cp` เข้า + verify (tsc/lint/test/build) + commit เอง. **trust-but-verify จับ bug ได้** (B flag ftotalprice ที่ P0 ผมพลาด). อ่าน diff money-path ทุกบรรทัดก่อนรับ.

**Cross-link:** `docs/research/save-point-2026-05-30-rate-tax-profile.md` · `lib/tax/wht.ts` (computeForwarderTax mapping) · `lib/forwarder/resolve-rate.ts`

---

## [2026-05-30 evening] Legacy PHP `NULL` string-interpolation = empty string, NOT Postgres NULL

**Context:** ภูม flagged MOMO review-grid commit failed with `null value in column "fusercompany" of relation "tb_forwarder" violates not-null constraint`. Only ONE of 4 candidates failed (the company customer). The other 3 (individuals) committed fine.

**Root cause:** Pacred translated legacy PHP `NULL` literally to JS `null`, which became Postgres `NULL`. But in the legacy PHP, that `NULL` was string-interpolated into the SQL INSERT:

```php
$fUserCompany=0;
if($userCompany=='1') {
    $fUserCompany=NULL;   // PHP literal NULL
}
$sql = "INSERT INTO tb_forwarder (fUserCompany, ...) VALUES ('$fUserCompany', ...)";
//                                                            ↑
//                                                  String-interpolated as ''
//                                                  (PHP's NULL → "" inside quotes)
```

So the SQL value that actually went to MySQL was empty string `''`, NOT actual NULL. The column is `NOT NULL` — empty string is allowed, NULL is not.

Pacred ported the PHP intent literally:
```ts
const fUserCompany = customer.userCompany === "1" ? null : "0";  // ❌ writes Postgres NULL
```

**Fix — match legacy's effective SQL behavior:**
```ts
const fUserCompany = customer.userCompany === "1" ? "" : "0";  // ✅ writes empty string
```

**Verified prod data** (existing 21,950 tb_forwarder rows for company customers · PR124/PR2503/AIGA) all show `fusercompany=""` — confirms legacy's effective behavior.

**Why this matters next time:** When porting any legacy PHP feature that uses `$var=NULL` followed by `'$var'` in a SQL string, the legacy was writing **empty string, not NULL**. If the target column is `NOT NULL`, writing JS `null` will fail. Always check:

1. What did the legacy PHP `INSERT/UPDATE` statement use — string interpolation (`'$var'`) or actual binding (`?` placeholder with prepared statement)?
2. If string interpolation: PHP `NULL` → `""` in SQL · don't write Postgres NULL.
3. Verify against existing prod data — what value did legacy actually persist?

**Other columns at risk** (any "if X then NULL else Y" pattern in PHP that uses string interpolation):
- `tb_forwarder.fcredit` (similar legacy pattern likely)
- `tb_forwarder.subuserid` (uses string interp · was bug 2 nights ago)
- Any column with "_default" semantics where legacy treats NULL as "use the default"

**Cross-links:**
- [`lib/admin/commit-momo-row-core.ts:401`](../../lib/admin/commit-momo-row-core.ts) — MOMO commit path
- [`actions/admin/api-forwarder-manual.ts:430`](../../actions/admin/api-forwarder-manual.ts) — CargoCenter manual entry
- Legacy `api-forwarder-momo.php:241-243` + `:434-436` — the bug
- AGENTS.md §0a (workflow vs UI · faithful first then improve)
