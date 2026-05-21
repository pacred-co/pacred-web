# 🚨 ภูม save-point — 2026-05-22 ค่ำ (Wave 7.3 + Wave 8 complete · machine change · home → work)

> **Read FIRST when you resume on the work computer.** This is the canonical
> state-of-the-world at the end of tonight's session. Everything committed
> is on `origin/Poom-pacred` (4 new commits since last save-point).
> Pending ภูม actions + open questions + resume commands at the bottom.

---

## 🟢 What you have now (commit chain on `Poom-pacred`)

`245e206..01fdebc` — 4 new commits since `poom-save-point-2026-05-20-night.md`:

| # | SHA | Title |
|---|-----|-------|
| 1 | `245e206` | chore(merge-cleanup): delete 3 orphan client forms after upstream rewrite |
| 2 | `11ebcbc` | feat(wave-7.3): wire 12 orphan admin pages into sidebar + page menubars |
| 3 | `9fccdd2` | feat(wave-8-group-a): bulk-approve bars for wallet + yuan + customers (tb_*) |
| 4 | `01fdebc` | feat(wave-8-bcd): admin manual forms + reports SQL views (2 parallel agents) |

(+ also Merge `59240fc` of `origin/dave-pacred` from earlier in the
session — caught up with พี่เดฟ's customer-side wave: `/service-order/add`
full PHP port + addresses modal fix + Meta Pixel/GA4/Google Ads/LIFF/Clarity
analytics chain.)

---

## 📦 Work summary — 2 phases, 19 surfaces shipped tonight

### Wave 7.3 — Orphan wiring (commit `11ebcbc`)

Closed every 🔴 DEAD row from `docs/audit/page-inventory-2026-05-21-night.md`
(except `migration/pcs-customers` kept as super-only utility per spec).

**Sidebar (`lib/admin/sidebar-menu.ts`) — extended `blockSettingsCargo` with 2 groups:**
- 🆕 **ระบบ:** `/admin/system/crons`, `/admin/system/notifications`, `/admin/csv-imports`
- 🆕 **เครื่องมือ:** `/admin/organization-email`, `/admin/admins`

**Page top-menubars (4 pages):**
- `/admin/accounting/cargo` CARGO_MENUBAR "การบัญชี": +งวดบัญชี, +กระทบยอด
- `/admin/forwarders` FORWARDER_MENUBAR "งาน": +ต้นทุนตู้, +เช็คต้นทุนตู้ (Sheet)
- `/admin/wallet` WALLET_MENUBAR "จัดการ": +คืนเงินลูกค้า
- `/admin/reports` REPORTS_MENUBAR "ปริมาณ": +ตู้ตาม HS code

**i18n:** 7 new keys under `pcsAdminNav.settingsCargo` in both `th.json` + `en.json`.

✅ Browser-verified ใน Chrome — sidebar expand shows new groups · all 12 routes 307.

### Wave 8 — Operator productivity (commits `9fccdd2` + `01fdebc`)

3 parallel streams (me + 2 background agents) shipped 8 backlog items:

**Group A — Bulk-approve bars (me · commit `9fccdd2` · 7 files · 681 LOC)**
- `actions/admin/tb-bulk.ts` — 3 new server actions:
  - `adminBulkApproveWalletHs` — UPDATE `tb_wallet_hs` status 1→2 + side-effect ปรับ `tb_wallet.wallettotal` (delta per legacy type: 1,2=deposit · 4,7=withdraw)
  - `adminBulkApproveYuanPaymentsTb` — UPDATE `tb_payment` paystatus 1→2 + paydateadmin=now
  - `adminBulkApproveCustomers` — UPDATE `tb_users` useractive 0→1 + userdateactive=now
- 3 sibling client components (`tb-bulk-bar.tsx` in wallet/yuan-payments/customers-pending) — window-event store pattern (decouple checkbox state from sticky bar across RSC)
- 3 list pages: add checkbox column + sticky bar
- ✅ Browser-verified ใน Chrome: 1,470 รอตรวจ rows show checkbox each · sticky bar appears on selection

**Group B — Admin manual entry forms (agent · part of commit `01fdebc` · 9 files)**
- `actions/admin/wallet-hs.ts` (232 LOC) — `adminCreateWalletHsManual` → INSERT tb_wallet_hs + wallet balance update
- `actions/admin/yuan-payments-tb.ts` (161 LOC) — `adminCreateYuanPaymentManual` → INSERT tb_payment (THB auto-calc = payyuan × payrate · rate default จาก tb_settings.rsdefault)
- `actions/admin/admins.ts` (+110 LOC) — `adminBulkTransferSalesRepTb` + `listActiveTbAdmins` helper
- 3 rewritten pages + 2 new form clients (banner → real form):
  - `/admin/wallet/add` (page 115 + form 318)
  - `/admin/yuan-payments/new` (page 128 + form 292)
  - `/admin/customers/transfer-rep` (page 147 + form 329)
- Schema fix: spec guessed `pamount/prate/pamountthb` — agent verified actual cols are `payyuan/payrate/paythb` (the legacy names).

**Group C — Reports SQL upgrades (agent · part of commit `01fdebc` · 4 files)**
- `supabase/migrations/0094_view_sales_by_rep.sql` (134 LOC) — Postgres VIEW `vw_sales_by_rep` joining tb_users → tb_forwarder (fstatus 6,7) + tb_header_order (hstatus 5,6) + tb_payment (paystatus 3) + tb_admin for display, grouped by (admin_userid, activity_month). Idempotent (`create or replace`).
- 3 rewritten pages (banner/redirect → real):
  - `/admin/reports/sales-by-rep` (365 LOC) — reads view · ?from/to/sort · 10-col + grand totals · friendly banner if migration not applied
  - `/admin/reports/user-sales-history` (369 LOC) — cohort tool · churn-risk badge (last activity >60d)
  - `/admin/reports/user-sales-history/[customer_id]` (379 LOC) — timeline UNION across 4 tables · latest 100 events sorted DESC
- Schema fixes: `ftotalprice` (not fpaytotal) · `htotalpriceuser` (not htotal) · `paythb` (not ptotal).

---

## 🔧 Environment state — UNCHANGED from 2026-05-20 save-point

Pacred still **Supabase prod only** — `https://yzljakczhwrpbxflnmco.supabase.co`.
Tonight I updated `.env.local` on home machine to prod (backup at
`.env.local.dev-backup-2026-05-22`). **On the work computer**:

### Update these 3 lines in `C:\Users\Admin\pacred-web\pacred-web\.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://yzljakczhwrpbxflnmco.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bGpha2N6aHdycGJ4ZmxubWNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU3ODQsImV4cCI6MjA5NDA4MTc4NH0.wNx-zJ2VHhnyvpByNSc_qEq2UttWOteLPaDXwjnMG1c
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bGpha2N6aHdycGJ4ZmxubWNvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUwNTc4NCwiZXhwIjoyMDk0MDgxNzg0fQ.n6ZOxfWUf38Ze7KC5uWffAc8x3iuro4rbPs3yMXyltk
```

All other env vars (OTP, LINE, ThaiBulkSMS, TAMIT, etc.) — no change.

---

## 🌐 Chrome extension — re-install on work computer

The "Claude for Chrome" extension is per-browser/per-machine. On the work
computer:
1. Chrome → `https://chromewebstore.google.com/` → search "Claude for Chrome" → Add to Chrome
2. Click the extension icon → "Connect to Claude" → login Anthropic account
3. Tell Claude "เชื่อม Chrome แล้ว" → Claude verifies via `list_connected_browsers` + can navigate/screenshot/interact

(Home browser was Browser 1 deviceId `f81a1842-cd47-4d64-bdf8-2403f8e48cd3`
— work computer will be a different deviceId.)

---

## ⚠️ Pending ภูม actions (do BEFORE the next batch of work)

### 1. Apply migration `0094_view_sales_by_rep.sql` via Supabase dashboard

`/admin/reports/sales-by-rep` shows a friendly error banner until applied.
Migration is idempotent (`create or replace view` + `grant select`) — safe
to re-run. Open file:
`supabase/migrations/0094_view_sales_by_rep.sql`

Paste into Supabase dashboard → SQL editor → Run. Verify the view appears
in Postgres (`select * from vw_sales_by_rep limit 1;`).

### 2. Browser test the 4 new Wave 8 surfaces (small test entries on prod)

⚠️ **PROD DATA — pick a test member like a known dev account, not a real customer.**

| Form | Test |
|---|---|
| `/admin/wallet/add` | +100 บาท to test PR → save → check `/admin/wallet?status=2` shows the row · check `tb_wallet.wallettotal` for that userid increased |
| `/admin/yuan-payments/new` | ¥10 at rate 5.00 → preview ฿50 → save → check list shows the row |
| `/admin/customers/transfer-rep` | Select 2 customers → choose admin → preview "X moves to Y" → submit → check `tb_users.adminidsale` updated |
| `/admin/wallet` bulk | ติ๊ก 2 rows pending → กด "อนุมัติทั้งหมด" → check status='2' on those rows + wallet balance updated |

### 3. Read this save-point + check the inventory doc

- `docs/audit/page-inventory-2026-05-21-night.md` — Wave 7.3 row table now shows ✅ for the 12 wired orphans (or update it).
- `docs/audit/re-audit-2026-05-21-night.md` — most P1 items now have ✅ from Wave 7.2/7.3/8.

---

## 🚀 Resume commands on work computer

```bash
# 1. Pull latest
cd C:\Users\Admin\pacred-web\pacred-web
git fetch origin
git checkout Poom-pacred
git pull --ff-only origin Poom-pacred    # expect 0 conflicts (all committed)

# 2. Update .env.local (see "Environment state" section above)
#    Edit NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY +
#    SUPABASE_SERVICE_ROLE_KEY to the prod values.

# 3. Install deps (in case anything new)
pnpm install
pnpm exec tsc --noEmit          # should be exit 0
pnpm lint                        # ~83 errors / ~124 warnings (inherited from upstream — not new)

# 4. Start dev server
pnpm dev                         # listens on :3000

# 5. Smoke test the new Wave 8 routes
curl -I http://localhost:3000/admin/wallet/add                    # → 307
curl -I http://localhost:3000/admin/yuan-payments/new             # → 307
curl -I http://localhost:3000/admin/customers/transfer-rep        # → 307
curl -I http://localhost:3000/admin/reports/sales-by-rep          # → 307
curl -I http://localhost:3000/admin/reports/user-sales-history    # → 307

# 6. Apply migration 0094 to prod Supabase (see "Pending ภูม actions §1")

# 7. Connect Claude Chrome extension (see "Chrome extension" section)

# 8. Continue from "Next pickup" below.
```

---

## 🎯 Next pickup (in priority order)

After ภูมิ verifies the Wave 8 forms work + applies migration 0094:

| # | งาน | est. | Why |
|---|---|---|---|
| 1 | **Phase A backlog** — migrate `tb_priceuser_member` + `tb_priceuser_hs` | 2-3 ชม (ภูม + ก๊อต) | Unblocks `/admin/rates/custom-user` + `/admin/rates/custom-hs` (currently Phase A banner) |
| 2 | **Backfill 3 oversized log tables** (779 MB) via `scripts/backfill/03-log-tables/` | 1-2 ชม | Needs Supabase Pro confirmed; ก๊อต handles |
| 3 | **Merge podeng** updates (b7e3eda..e4be6fc · ปอน frontend) | 1-2 ชม | Customer-facing integration; check for conflicts on /service-order/add (เดฟ just rewrote) |
| 4 | **Wave 9 scope discovery** — re-audit P3 items + Phase C feature triage | open | Pacred enhancements layer (ADR-0017 Phase C) |

---

## 📣 Notified

This save-point + the 4 commits are the heads-up for:
- **พี่เดฟ** — bulk-approve bars + manual forms shipped on tb_* schema · re-audit P0/P1 backlog closed · Wave 8 done. Reports sales-by-rep needs migration 0094 applied to prod first.
- **พี่ก๊อต** — migration 0094 is a single Postgres `create or replace view` (no schema mutation, no destructive change). Safe to apply via dashboard. Phase A backlog (tb_priceuser_*) is next priority — coordinate with ภูม.
- **ปอน** — landing/marketing not blocked by tonight's work; the analytics chain (Meta Pixel + GA4 + Google Ads + LIFF + Clarity) merged from `dave-pacred` 2 days ago is live and tracking already.
