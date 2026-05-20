# 🚨 ภูม save-point — 2026-05-20 ค่ำ (Phase 1 push · Pacred-production env · 12-hour run)

> **Read FIRST when you resume on your home computer.** This is the
> canonical state-of-the-world at the end of today's session. Everything
> committed is on `origin/Poom-pacred` (8 new commits today). Open
> questions + next moves at the bottom.

---

## 🟢 What you have now (commit chain on `Poom-pacred`)

`b584c22..90c1dbe` — 7 commits today (8 with this save-point doc):

| # | SHA | Title |
|---|-----|-------|
| 1 | `b646101` | fix(sidebar+forwarders+dashboard): clean batch 1 (Pacred-is-one-company + รถ/เรือ/แอร์ in-page chip) |
| 2 | `967f2dc` | feat(faithful-port): Option C wave 1 — retire spine + port report-cnt.php + 11-button audit menu |
| 3 | `e701083` | feat(supabase): add prod-fresh schema bundle for single-env Supabase (891 KB · 117 legacy tables verified) |
| 4 | `f6653f6` | feat(faithful-port): Option A locked + drop spine migration (Wave 2A · พี่เดฟ confirmed · ภูม verified empty) |
| 5 | `ffdad6c` | feat(faithful-port): Option A Wave 2 — port legacy barcode + cnt-payment + retire spine scan routes (5 agents in parallel) |
| 6 | `81f80b1` | feat(phase1): Wave 3 — backfill scripts + 2 audits + partial cargo_* cleanup + mobile P0 + Quagga (4 agents) |
| 7 | `90c1dbe` | docs(audit): 3 PCS Cargo audits from N'POOM-PCS-LEARNNING + master synthesis (3 agents) |
| 8 | _this_ | docs(save-point): + Q3 Freight roles (in-flight agent) + final CLAUDE.md/AGENTS.md update + handoff |

---

## 🔧 Environment changes you must mirror on your home computer

The repo's `.env.local` is gitignored — you have to MANUALLY update it on
the home machine. Old dev project (`pprrlabgebrnocthwdmg`) is no longer the
target; ก๊อต took dev for other work. Pacred is now **prod-only**.

### Update these 2 lines in `C:\Users\Admin\pacred-web\.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://yzljakczhwrpbxflnmco.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_vNH5pL5AiLWmJKjXwA58vA_TE1-ZJnb
```

### Keep this line as-is (per ภูม "ของเก่าใช้ได้"):

```bash
SUPABASE_SERVICE_ROLE_KEY=<the JWT you already have in dev .env.local — same value works>
```

🔴 **Service-role CONFIRMED BROKEN (test 2026-05-20 ค่ำ post-handoff):**
the JWT in dev backup has `ref:"pprrlabgebrnocthwdmg"`. Tested against
prod:
```
GET https://yzljakczhwrpbxflnmco.supabase.co/rest/v1/forwarders
  with the dev service_role JWT
→ 401 "Invalid API key"
```

Supabase validates the JWT's `ref` claim against the project, so the
dev key cannot authenticate prod no matter what. **ภูม MUST fetch the
prod service_role key** from Supabase dashboard → project
`yzljakczhwrpbxflnmco` → Settings → API → service_role (secret) → copy
paste into `.env.local`.

Until that's done, ALL `/admin/*` routes that use `createAdminClient()`
silently fail. Symptoms seen so far:
- `/admin/forwarders` renders but shows "0 รายการ" (the empty-result
  path is hit because Supabase error is swallowed)
- `/admin/barcode/driver` doesn't load (the page's 3 Promise.all
  count queries throw)
- ApiKey mismatch is the single root cause for almost every "page
  doesn't work" you see on prod.

### Backup file already created on office machine:
`.env.local.dev-backup-2026-05-20` (gitignored · contains the OLD dev
project keys for rollback if needed).

### Other env vars — no changes needed:
`OTP_BYPASS=true` · `NEXT_PUBLIC_SITE_URL=http://localhost:3000` · all
the rest of `.env.local` unchanged.

---

## 📦 What landed today (work summary)

### Wave 1 — Faithful port of `report-cnt.php` (commit `967f2dc`)

- New `/admin/report-cnt` — faithful 1:1 port of legacy `report-cnt.php`
  (2487 LOC). Status tabs (รอเข้าโกดังไทย / เข้าโกดังไทยแล้ว) ·
  transport-mode tabs (ทั้งหมด / ทางรถ / ทางเรือ) · date+actionPay
  search · totals row · 14-column table · money cols (ต้นทุน · ราคาขาย
  · กำไร) role-gated to super/ops/accounting.
- New `<TopMenuReport>` — the 11-button audit menu (faithful port of
  `top-menu-report.php`): ประวัติเข้าโกดังไทย · รายงานตู้ · หมายเหตุ
  สั่งซื้อ/นำเข้า · ไม่ได้ถ่ายสินค้า · ไม่ใส่ค่าขนส่ง · ไม่ใส่เบอร์ตู้
  · ไม่ใส่วันที่ปิดตู้ · ไม่เลือกขนส่งฟรี · เลือกขนส่งฟรีผิด · เครดิต
  เกินกำหนด.
- New `/admin/forwarder-action?action=…` — 9 audit-queue stubs wired to
  legacy SQL conditions (6 work · 3 needed schema verification → Wave 2C).
- New `/admin/forwarder-import-warehouse` — ประวัติเข้าโกดังไทย stub.
- Spine page `/admin/warehouse/containers` (the rebuilt pre-D1 model)
  tombstoned · 308-redirects to /admin/report-cnt.

### Wave 2 — Barcode + cnt-payment (commit `ffdad6c`)

- 4 cargo barcode routes (camera/Quagga): `/admin/barcode/cargo/{all,from,import,prepare}`
- 4 driver barcode routes (USB scanner): `/admin/barcode/driver/{all,from,import,prepare}`
- Gateway routing brain: `/admin/barcode/gateway?type=&device=&tracking=`
  → query `tb_forwarder` → redirect to `/admin/forwarders/<f_no>` with
  the right anchor + query per `type` (`all/from/4/6`).
- `<TopMenuBarcode>` component (5+5 buttons for cargo + driver flows).
- `adminCreateCntPayment` server action (INSERT into tb_cnt + 3 join
  tables + PDF upload to `member-docs/cnt-payment/<id>/`).
- `/admin/cnt-hs` history page (faithful port of `cnt-hs.php` LIST view).
- `/admin/report-cnt/pay` form page (multi-select unpaid containers +
  4 metadata fields + PDF upload).
- 3 remaining audit queues wired: **NoteShop** uses `tb_header_order`
  (not `tb_shop` per stale comment) · **NotShipFree** + **NotShipFreeError**
  use 41-ZIP `FREE_SHIPPING_ZIPS` (union of 6 PHP arrays).
- Spine scan routes deleted: 7 files under `/admin/warehouse/containers/[code]/*`
  + `new-container-form.tsx`.

### Wave 3 — Backfill scripts + audits + mobile P0 (commit `81f80b1`)

- `scripts/backfill/01-survey.ts` + `02-upload-files.ts` (TypeScript ·
  ภูม runs with prod service-role).
- `pnpm add @ericblade/quagga2` — camera scanner now wires.
- `/admin/(protected)/layout.tsx` — added DataTables + DataTables-Responsive
  CSS + JS to the PCS asset bundle (fixes /service-order horizontal-scroll
  on mobile per Agent C audit).
- `/admin/(auth)/register/page.tsx` — `INPUT_BASE` bumped 14px → 16px
  (iOS no longer auto-zooms on focus).
- 2 audit docs landed: `docs/audit/fidelity-2026-05-20.md` + `mobile-verify-2026-05-20.md`.
- 5 of 19 cargo_* downstream consumers stubbed (`actions/admin/disbursements.ts`
  + `warehouse/{bulletin,qa-inspections}/page.tsx` × 4). Migration 0090
  DROP statements remain commented — Wave 4 prerequisite.

### Audit synthesis (commit `90c1dbe`)

- 3 agents read พี่เดฟ's 5 markdown analyses at
  `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\`:
  - PCS_CARGO_COMPLETE_ANALYSIS.md (4,298L)
  - PCS_ADMIN_ROLES_AND_MENUS.md (1,303L)
  - BUSINESS_FLOW.md + PCS_Cargo_Guidebook_TH.md + docs.md (1,225L)
- Produced 4 audit docs in `docs/audit/`:
  - `pcs-complete-analysis-2026-05-20.md` (262L)
  - `pcs-admin-roles-2026-05-20.md` (224L)
  - `pcs-business-flow-2026-05-20.md` (251L)
  - **`pcs-master-synthesis-2026-05-20.md` (188L)** — the master P0/P1/P2 list
- **Discovery:** the new `newrealdatapcs/pcscargo` PHP source is
  BYTE-IDENTICAL to our existing snapshot (16,184 PHP files · 0 hash
  differences). The "real update" is the 5 markdown analyses.

### Q1 + Q4 investigation (this session, pre-handoff)

- **Q1 — 2-system architecture (member vs admin):** Pacred's `profiles`
  + `admins` design already supports "1 user → both customer + admin via
  role flag". Legacy `tb_users` + `tb_admin` ported as separate tables in
  migration 0081 but Pacred's intent is unified Supabase Auth + role join.
  ✅ No code change needed for the customer-side ↔ admin-side bridge.
- **Q4 — volumetric weight:** Legacy `chargeableWeight × per-kg-rate` ≡
  Pacred `MAX(kg × kgRate, cbm × cbmRate)` IFF rates calibrated such
  that `cbm_rate = 200 × kg_rate` (air · divisor 5000) or `166.67 ×
  kg_rate` (sea · divisor 6000). ภูม must verify admin rate-config
  matches before launching.

---

## ⚠️ Open questions still pending (ห้ามเดา rule)

1. **Service-role JWT against prod** — confirmed by ภูม "ของเก่าใช้ได้";
   verify by hitting `/admin/*` once logged in. If 401, fetch prod
   service_role from Supabase dashboard.
2. **`sales_admin` vs `sales`** — Q3 Freight-roles agent is investigating
   tonight; check its report tomorrow.
3. **Wallet-approval queue shape** — dedicated page or filter? Audit
   ❓5; not yet resolved.
4. **Volumetric rate calibration** — Q4 verification needed in admin
   rate-config page.
5. **WordPress dumps** in `newrealdatapcs/database-wordpress/` — what's
   their relationship to the Pacred marketing site? Not investigated.
6. **Cart product-scrape on URL paste** (1688/Taobao/Tmall auto-fill)
   — not implemented in Pacred. Source L913-938 explicit.
7. **VIP Credit Wallet customer page** — `/wallet/credit/page.tsx`
   missing (only `credit-panel.tsx` component exists).

---

## 🎯 Next move (Phase 1 P0 from master synthesis)

Remaining P0 work = **6 items · ~14-21 ชม**, in priority order:

1. **`/admin/forwarders` rewrite** — read `tb_forwarder` (not the
   rebuilt `forwarders`). Most-used screen, biggest operational risk.
   4-6 ชม.
2. **QA module rebuild** — currently tombstoned. Without it, fake-product
   incidents have no system support. 6-8 ชม.
3. **Forwarder 10%-over-preview re-confirm gate** — surprise-billing risk.
   2-3 ชม.
4. **`driver` role phase-unlock** — driver sidebar is invisible currently.
   30 นาที. (Likely done by Q3 agent tonight.)
5. **`qa` role enum** — QA staff can't log in without `super`. 1 ชม.
   (Likely done by Q3 agent tonight.)
6. **`sales` role add (if Q3 confirms distinct)** — 30 นาที. (Done by Q3 if applicable.)

Plus Wave 3 backlog:
- Finish 14 remaining cargo_* consumer rewrites.
- Apply migration 0090 (uncomment DROP statements after Wave 3 cleanup).
- Delete `lib/warehouse/*` helpers + 4 test files.

---

## 🚀 Resume commands on home computer

```bash
# 1. Pull latest
cd C:\Users\Admin\pacred-web
git fetch origin
git checkout Poom-pacred
git pull origin Poom-pacred

# 2. Update .env.local (see "Environment changes" section above)
# (manually edit NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY;
#  keep SUPABASE_SERVICE_ROLE_KEY unchanged)

# 3. Install any new deps
pnpm install
pnpm tsc --noEmit  # should be exit 0
pnpm lint           # should be 0 errors / N warnings (N=74-77)

# 4. Start dev server
pnpm dev

# 5. Smoke test
curl -I http://localhost:3000/login          # → 200
curl -I http://localhost:3000/admin/report-cnt # → 307 (auth gate)

# 6. Read first
cat docs/audit/pcs-master-synthesis-2026-05-20.md
# then pick from "Next move" P0 list above
```

---

## 📣 Notified

This save-point + the 4 audit docs are the heads-up for:
- **พี่เดฟ** — Wave 2/3 spine retirement + Option A path · Wave 3D 14
  files still need cleanup · audit findings on `/admin/forwarders`
  using the wrong table.
- **พี่ก๊อต** — Supabase Pro upgrade noted · prod-only direction
  embraced · `e701083` schema bundle ready for fresh-prod spin-up if
  needed.
- **ปอน** — landing/marketing not blocked by today's work; mobile P0
  fixes (DataTables + iOS auto-zoom) help any customer surface ปอน
  ships next.
