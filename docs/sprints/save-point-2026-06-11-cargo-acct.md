# 🧾 Save-point 2026-06-11 — Cargo pricing+accounting epic (A/B/C/D) · MOMO 5-flag · ship_by · receipt hardcode-purge · freight grounding → Poom-pacred

> **Branch: `Poom-pacred`** (ภูม's). Resume on the home machine: `git fetch origin && git pull origin Poom-pacred` (needs `.env.local` first — DEV Supabase `lozntlidlqqzzcaathnm` · `SUPABASE_DB_PASSWORD` from the env-handoff). `pnpm verify` EXIT 0 at every commit below. **Owner mandate held throughout: "ห้ามตกหล่น ห้ามข้ามห้ามเดา · ตั้งต้นทุน กำไร สำคัญมาก"** — every claim grounded from legacy source / live DB, no guesses.

## 📦 Commits this session (Poom-pacred, oldest→newest)
| commit | what |
|---|---|
| `09579fc5`..`ecf08e2f` | **MOMO raw-spread + 5-flag polish** (คลี่ทุก field · Thai headers · ship_by รถ/เรือ · status colors · lightbox · sticky header · `commit trusts GZS/GZE cabinet over ship_by` money-fix) |
| `76e5ab30` | **Epic A** (cart `<ImportPriceEstimate>` island) + **Epic B** (TaxDocBadge + WHT chip + เอกสาร column) |
| `9f7402ee` | **C-9/C course-correction** — gap-map was WRONG; C is already live+faithful (`actions/forwarder-legacy.ts`). Corrected the gap docs + learning `audit-discipline.md` |
| `e33e1112` | **cart estimate 2-up เด่น** (รถ↔เรือ comparison · "เลือกอยู่" · "จ่ายตอนของถึงไทย" · keep legacy money model per owner) |
| `13cbd00c` | **D-G2 foundation** (mig 0178 + `lib/forwarder/import-duty-vat.ts` + 31 tests) · **delete PR415/71/4136/8765 receipt hardcodes** · **freight grounding doc** |
| `0db474a4` | **D-G2 UI** — `<ForwarderImportDutyEditor>` on forwarder `[fNo]` (อากร %/บาท + live ราคารวม VAT roll-up · browser-verified 100→107) |

## ✅ Epic A/B/C/D — verified state (the surprise: platform was FAR more built than the gap-map said)
- **A — cart price** ✅ live (`/cart` island recompute-on-toggle · browser-verified). **The "7703.50 ไม่เปลี่ยน รถ/เรือ" is NOT a bug**: 7703.50 = ค่าสินค้า (¥1,550 × เรท 4.97), transport is SEPARATE + paid-on-arrival (faithful legacy). Engine `getCustomerImportEstimate` already filters rates per `rgtransporttype` — verified.
- **B — doc-choice visible** ✅ live (forwarders list "เอกสาร" column + badge).
- **C — zone/carrier/COD** ✅ **already live + faithful** (gap-map audited the rebuilt orphan `actions/forwarder.ts` + a non-existent form; the real path is `actions/forwarder-legacy.ts` + `service-import/add/service-import-shipby-select.tsx`). **C-9 split-brain = already resolved** (orphan `createForwarder` gone; 0 `.from("forwarders")` in forwarder.ts). Remaining C-7 (VIP overrides) + C-8 (zip-12000) = owner-input only.
- **D — accounting** ✅ ~75% faithful + money-loop verified SAFE (a 4-gap agent sweep G3/G5/G6/G7 = clean; only finding = the receipt hardcode leak, now deleted). **D-G2 (อากร + ราคารวม VAT) = the Excel-forcing gap → BUILT this session** (see below).

## 💰 D-G2 — อากรขาเข้า + ราคารวม VAT (the owner's Excel-killer) — BUILT + verified
The xlsx SELL-block roll-up (`ราคาขายสุทธิ → +อากร → รวมก่อน VAT → +VAT 7% → ราคารวม VAT`) — was xlsx-only (not in legacy), owner chose mechanism-first (กรอกเอง · ไม่เดา duty rate).
- **mig 0178** `tb_forwarder.import_duty_pct/import_duty_thb` — **APPLIED to DEV only** (additive · cost-sheet only · NOT fTotalPrice). 🔴 **HOME-MACHINE TODO: apply 0178 to PROD next prod cycle** (`node --env-file=.env.local scripts/apply-migration-generic.mjs supabase/migrations/0178_forwarder_import_duty.sql` after switching env to prod, or via the prod apply flow). **NEXT FREE migration = 0179.**
- `lib/forwarder/import-duty-vat.ts` (`computeImportDutyVat` · pure · 31 tests · 0 baked policy · VAT rate a param).
- `setForwarderImportDuty` (actions/admin/cargo-cost.ts · super/accounting/pricing · isolated · logAdminAction).
- `<ForwarderImportDutyEditor>` mounted on `ForwarderCostSection` ([fNo] detail · gated canEdit). Browser-verified live (อากร 100 → pre-VAT 100 → VAT 7.00 → VAT-incl 107.00).
- 🟠 The VAT-incl feeding the actual **ใบกำกับ issuance = G1** (owner-blocked: PEAK GL + VAT-base sign-off · standing item).

## ❓ Rate-setting — the answer to ภูม's "ตั้งเรทหน้าไหน" (grounded `lib/admin/customer-rate-tables.ts`)
The cargo rate resolves in **4 tiers** (legacy `calPriceForwarder`, most-specific wins):
1. **per-order manual** — admin sets the binding price in the order after warehouse-weigh.
2. **per-customer (SVIP)** → the **customer profile "ตั้งค่าเรทขนส่ง" gear modal** (writes `tb_rate_custom_*` by userID · `actions/admin/customer-rate.ts adminSaveCustomerRate`). ← **"หน้าข้อมูลลูกค้าแต่ละคน"**
3. **VIP-group (by coID)** → **`/admin/settings/vip-tiers`** (writes `tb_rate_vip_*` by coID · `actions/admin/settings-vip.ts` + `rate-edits.ts adminUpdateVipRateCells`).
4. **general** → **`/admin/rates/general`** (writes `tb_rate_g_*` · coID=PCS · ALL general customers).

**Why PR009 shows "ไม่มีเรต":** PR009's `coID="PR"` → it's VIP-group "PR", which has NO rate card → empty. The estimate is tier-aware (faithful). Set it via `/admin/settings/vip-tiers` (group "PR") OR the per-customer gear modal (PR009 override). `/admin/rates/general` only affects general (coID=PCS) customers — there are **8,742** of them (the majority · they all see the รถ20/เรือ15 rates ภูม set). DB-verified: general 40kg กวางโจว = รถ฿800 / เรือ฿600 (different ✓).

## 🌏 Freight grounding (from the 2 olddata-dev zips · `docs/research/freight-grounding-2026-06-11.md`)
- **`axglobal` is NOT the AX-JOB cost ERP** — it's the AXELRA WordPress marketing + booking-LEAD funnel + freight master-data. Zero cost/margin math. The real cost engine = the AXELRA xlsx, already mined into `lib/freight/rate-model.ts`.
- **Pacred freight ≈ 80-85% built + AHEAD of legacy** on cost/profit (engine wired end-to-end · ADR-0016 3-number discipline honoured).
- **Biggest gap (G1):** `lib/freight/rate-lookup.ts:34-43` **ignores the route** (picks most-recent rate, drops pol/pod/carrier → can mis-price a lane). Low money-risk, pure-fn-testable.
- ⚠️ The extract was **code-shell only** (no `.sql`/`.csv`/`.xlsx` · plugin impl bodies missing). **HOME-MACHINE: request the AXELRA WP DB dump** (`wp_ports`/`wp_container*`/`wp_postmeta` rate rows) before freight G2 (master-data tables).

## 🔴 Carryover (home machine · ภูม said he'll continue items 2-3 + the rest)
1. **D-G2 → PROD**: apply mig 0178 to prod (additive · safe).
2. **Freight G1**: make `rate-lookup.ts` route-aware (+ tests). **G2** needs the WP DB dump (request first).
3. **Owner-blocked (พี่ป๊อป/บัญชี)**: D-G1 ใบกำกับ issuance (PEAK GL + VAT-base sign-off + flip `tax_invoice.shop_yuan_enabled`) · commission rates · duty-base policy.
4. **Carryover from prior save-points** (unchanged): 4 staff-code review cases · `RECEIPT_TOKEN_SECRET` in Vercel · `contact@pacred.co` mailbox · test-customer login.
5. **Legacy staged in Temp** (for continued work): `C:\Users\Admin\AppData\Local\Temp\pacred-legacy` (cargo PHP) + `...\pacred-freight` (axglobal/cargoT freight code).

## 🟢 SHIPPED 2026-06-12 — coID "PCS" → "PR" rebrand (executed per the defensive plan below)
**DONE.** Owner picked "data+rate+code ครบชุด". Built `lib/forwarder/coid.ts` (`GENERAL_COID='PR'` + `isGeneralCoid()` accepting 'PR' | legacy 'PCS' | empty) → swapped the tier-decision sites in all 4 resolvers (`forwarder-quote` · `forwarders-edit` · `quote-multimode` · `quote-comparison`) + 3 display sites (forwarders-table chip · warehouse-history page + export). **Kept the general-card lookup `.eq("coid", coID)`** (NOT a fixed sentinel) so a migration-lag never breaks the 8,742 — blast radius stays at the 43 already-broken 'PR' rows. `isVipCoid` (whitelist) needed no change. Migration **`0182_coid_pcs_to_pr.sql`** applied DEV (tb_co 1 · tb_rate_g_* 16+16 · **tb_users 8,742** · tb_register 16,853 → 'PR' · PCS-leftover=0). **⚠️ PROD-apply pending** (เดฟ — land it WITH the code deploy; the `isGeneralCoid` 'PCS'-alias makes the order safe either way). **Verified live (§0c):** PR009 on /cart, 25kg → ทางรถ ฿500 / ทางเรือ ฿375 (was "ไม่มีเรต"). Learning: `docs/learnings/pacred-domain-knowledge.md` (2026-06-12).

**🔎 Two corrections to the parked analysis (caught by a FRESH `information_schema` survey, not by trusting the parked numbers):** (a) real count = **8,742 PCS / 43 PR** (the "938/41" below was a stale partial read); (b) `tb_co` **DOES** have a 'PCS' row (ID 21 'ทั่วไป' — the analysis below wrongly said "no PCS/PR row"), and `tb_register.coid` (16,853) was a 4th table the parked scope missed. Lesson: survey every `coid` column from `information_schema` before a rename.

<details><summary>Original parked analysis (kept for the trail)</summary>

ภูม flagged "PR = coID=PCS · เปลี่ยน PCS เป็น PR ให้หมด" but **paused** to sync `dave-pacred` first. **NO change was made** (money-path · clean). Full analysis below so it's one-pass executable when revisited:

**🚨 The critical trap (caught in analysis): "PCS" has TWO unrelated meanings in code** — only #1 changes:
1. **`coID === "PCS"`** = the general-tier company code (the rate system). ← CHANGE to "PR".
2. **`addressID/fShipBy/hShipBy === "PCS"`** (รับเองที่โกดัง self-pickup · + PCSF/PCSE promos) and **`unit ?? "PCS"`** (freight line unit = pieces). ← **DO NOT TOUCH** (a blanket find-replace breaks shipping + freight units).

**Why (DEV data, read-only verified):** `tb_users.coID` = PCS 938 / **PR 41** (e.g. PR009) / VIP groups. The general rate cards `tb_rate_g_kg/cbm.coid` are ALL "PCS" (16+16). The code sentinel `isGeneral = coID==="PCS"` means the **41 "PR" customers are mis-tiered as VIP → read empty `tb_rate_vip` → "ไม่มีเรต"** (the bug ภูม saw). Rebranding the general code to "PR" fixes them. `tb_co` has no PCS/PR row (general is implicit, not registered).

**Exact scope to change (coID-general ONLY):**
- DATA (dry-run→apply): `tb_users.coID` "PCS"→"PR" · `tb_rate_g_kg.coid` + `tb_rate_g_cbm.coid` "PCS"→"PR". (DEV first; **PROD data UPDATE = separate prod-data-op**, env-DEV can't touch prod.)
- CODE (9 sentinel sites): `actions/forwarder-quote.ts:141,146` · `actions/admin/quote-multimode.ts:210,218` · `actions/admin/quote-comparison.ts:153` · `actions/admin/forwarders-edit.ts:210` · `actions/admin/forwarders-new.ts:200` (`GENERAL_COIDS`) · `actions/admin/earn-trigger-tb-user-sales.ts:109` (`isVipCoid` + `VipCoid` type) · `app/[locale]/(admin)/admin/customers/page.tsx:116` · `actions/admin/export/customers.ts:90` · `actions/admin/rate-edits.ts:245` (schema comment + accepts).
- **Recommended approach = defensive:** default coID "PR" + `isGeneral`/`GENERAL_COIDS` accept BOTH "PR" and "PCS" (and ""/"GENERAL") → data flips to PR fully, but any stray/prod "PCS" still resolves general (zero mis-price during the prod-data lag). The `rate-edits.ts:221-223` comment notes a prior session intentionally KEPT the general bucket "PCS" during the member-code rebrand — this finishes that.

</details>
