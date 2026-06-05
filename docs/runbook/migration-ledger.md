# 🗄 Migration Ledger — canonical state + numbering authority
**Updated:** 2026-05-30 (เดฟ) · **Authority:** เดฟ owns migration numbering · ขอเลขก่อนเขียน

นี่คือ **single source of truth** ของ migration ทั้งหมด. ก่อนเขียน migration ใหม่ → เปิดไฟล์นี้ → ใช้เลขถัดไป → จองโดยเพิ่ม row + commit.

---

## 🔢 NEXT FREE NUMBER = **0142**

ใครจะเขียน migration ใหม่ → ใช้ `0142_*` → เพิ่ม row ในตารางข้างล่าง → commit. ถ้ามีคนจองพร้อมกัน บอกเดฟ.

> 2026-06-05 เดฟ: **0141** = `customer_cs_assignment` (per-customer CS · `tb_users.adminIDCS` varchar(20) NOT NULL DEFAULT '' + `tb_admin.adminStatusCS` varchar(1) DEFAULT '0' + index + seed พลอย `admin_ploy` into the CS pool · mirror of `adminIDSale`/`adminStatusSale` · camelCase). ✅ **applied prod 2026-06-05** (936ms · direct-host · verified: both cols present, admin_ploy in CS pool, 8,937 customers adminIDCS='').

> 2026-06-04 Lane C: **0138** = `forwarder_invoice` (ใบวางบิล R-2 · 2 tables · ✅ **applied prod by ภูม** per CLAUDE.md session-close 2026-06-03) · **0139** = `min_sell_floor` (seed 1 `business_config` key `pricing.min_sell_floor` for the sales min-sell guardrail — กว่างโจว 2,900 / อี้อู 4,900 / เรือ +300 · global-trade-group §5). ✅ **0139 applied prod 2026-06-04** (72ms · idempotent seed · `business_config.pricing.min_sell_floor` verified present via REST).
> 2026-06-04 Lane B: **0140** = `yuan_tax_doc_pref` (RENAMED from 0139 at integration — collided with Lane C's 0139 · tax_doc_pref + 2 snapshot cols on tb_payment · completes the 3-mode selection data model across all order types · issuance deferred per ADR-0027). ✅ **0140 applied prod 2026-06-04** (160ms · ADD COLUMN nullable · `tb_payment.tax_doc_pref` verified present).
> 2026-06-02→04: **0137** = `pcs_sync_state` (pcs_sync_state + pcs_sync_logs · PCS↔Pacred sync ledger · NEW isolated tables only · RLS deny-all). ✅ **applied prod 2026-06-04** (150ms · pcs_sync_state id=1 seeded · pcs_sync_logs present · via `scripts/apply-migration-generic.mjs` direct-host). NEXT FREE stays **0141**.

> 2026-06-02 PM-6: **0136** = `partners` (external logistics/business partner directory · staff-CRUD gap §PM-6 #3 — 1 NEW isolated table, NO FK to legacy, RLS service_role/admin-only · mirrors carriers/freight_quote). ⏳ **NOT applied prod yet** — เดฟ applies (direct-DB back up · pure DDL · idempotent `create … if not exists`).

> 2026-06-01 PM-5: **0135** = `import_promo_banner_config` (seed 6 business_config keys `import.promo.*` for the configurable ฝากนำเข้า "โปรเหมาๆ" banner). ⏳ **NOT applied prod yet** — เดฟ applies (idempotent `on conflict do nothing` seed · zero schema change).

> 2026-06-01 PM-2: **0133** = `lead_call_log` (acquisition call-queue) · **0134** = `freight_quote` (freight RFQ). ✅ **ทั้งคู่ applied prod 2026-06-01** (tables `lead_call_log` + `freight_quote` created).

> 0118-0129 ครอง prod แล้ว (ปอน 0118-0122 MOMO · ภูม 0123-0124 admins+momo-commit · เดฟ 0125 customer-usage-split · เดฟ 0126 tax-rates-seed · เดฟ 0127 order-tax-doc-pref · เดฟ 0128 tax-rates-rental-goods · เดฟ 0129 forwarder-tax-invoice · all applied 2026-05-30).

> **กฎกันชนถาวร:** migration เป็น **global sequence ของทั้ง repo** ไม่ใช่ของ branch ใคร. เลขชนกัน = merge เจ็บ. **เขียนใหม่ → ขอเลขจากเดฟ / เช็คไฟล์นี้ก่อนเสมอ.**

---

## ✅ Applied to prod (yzljakczhwrpbxflnmco) — canonical

| # | ไฟล์ | เจ้าของ | สถานะ prod | branch ที่มี |
|---|---|---|---|---|
| 0001-0117 | (historic — base schema · legacy tb_* · indexes · RLS · admins · etc.) | ทีม | ✅ applied | main |
| 0118 | `momo_promote_raw_columns` | ปอน | ✅ applied | main |
| 0119 | `momo_disambiguate_container_naming` | ปอน | ✅ applied (this session) | main |
| 0120 | `momo_raw_events_and_detail_tables` | ปอน | ✅ applied (this session) | main |
| 0121 | `momo_tracking_links_and_status_snapshot` | ปอน | ✅ applied (this session) | main |
| 0122 | `momo_sync_run_items` | ปอน | ✅ applied (this session) | main |
| 0123 | `admins_role_manager` | ภูม | ✅ applied (renumbered from 0118 · integrated 2026-05-30) | main |
| 0124 | `momo_commit_tracking` | ภูม | ✅ applied (renumbered from 0119 · integrated 2026-05-30) | main |
| 0125 | `customer_usage_split` | เดฟ | ✅ applied 2026-05-30 (135ms · used=2805/unused=6085) | main |
| 0126 | `tax_rates_seed` | เดฟ | ✅ applied 2026-05-30 (74ms · 4 rate rows: transport 1% · service 3% · goods 3% · VAT 7%) | main |
| 0127 | `order_tax_doc_pref` | เดฟ | ✅ applied 2026-05-30 (2309ms · 3 cols × 2 tables · CHECK constraint · 2 partial indexes) | main |
| 0128 | `tax_rates_rental_goods` | เดฟ | ✅ applied 2026-05-30 (563ms · +rental_pct=5 · goods_pct 3→0 · หลัง owner ตอบ 5 คำถามบัญชี) | main |
| 0129 | `forwarder_tax_invoice` | เดฟ (P2) | ✅ applied 2026-05-30 (935ms · 3 ตาราง tb_*-native: `tb_forwarder_tax_invoice` + `_item` + `tb_forwarder_wht_entry` · per-class WHT · live-lane ใบกำกับ) | main |
| 0130 | `momo_cabinet_join_field` | ภูม/main | ✅ in main | main |
| 0131 | `line_oa_inbox` | ปอน | ✅ **applied prod** (re-probe 2026-05-30 = HTTP 200 ×4 tables · ไม่กระทบ legacy · idempotent) — **renumbered 0125→0131** ตอน integrate InwPond007 2026-05-30 (ชน เดฟ `customer_usage_split`) · 4 ตาราง isolated: `customers_line`/`line_lead_sources`/`line_messages`/`line_webhook_events` · RLS service_role | main (ex-InwPond007) |
| 0132 | `forwarder_bill_to_name` | เดฟ | ✅ **applied prod 2026-06-01 (106ms · metadata-only ADD COLUMN nullable)** · `tb_forwarder.fbilltoname varchar(200)` · Pacred-original bill-to override (no legacy col) · faithful target of rebuilt `forwarders.bill_to_name_override` · `adminSetForwarderBillToOverride` repointed | main |
| 0133 | `lead_call_log` | เดฟ | ✅ **applied prod 2026-06-01** · CEO §6 acquisition call-queue activity log · 1 NEW isolated table `lead_call_log` (id/userid/admin_id/status/note/called_at · NO FK · service_role-only RLS · 3 indexes) · powers `/admin/leads` · idempotent | dave-pacred (acquisition) |
| 0134 | `freight_quote` | เดฟ | ✅ **applied prod 2026-06-01** · public freight RFQ lead-capture (AX BOOKING funnel) · 1 ตาราง `freight_quote` (singular · ≠ plural `freight_quotes` admin quotation in 0048) · RLS public-insert + admin-read (mirrors `contact_messages`) · idempotent · เปิด FREIGHT revenue line | dave-pacred (freight-quote MVP) |
| 0135 | `import_promo_banner_config` | เดฟ | ✅ **applied prod 2026-06-01 via PostgREST** (IPv6 direct-DB was down on the home machine → applied the 6 INSERTs through `POST /rest/v1/business_config` + `Prefer: resolution=ignore-duplicates` · the REST/IPv4 path works for seed/DML when direct-DB times out; DDL still needs direct-DB / SQL-editor) · seed 6 `business_config` keys `import.promo.{enabled,headline,text,amount_thb,end_date,image_url}` (category "Promo") → configurable ฝากนำเข้า "โปรเหมาๆ" banner editable at `/admin/settings/business-config` · defaults = previous hardcoded banner · idempotent `on conflict do nothing` (zero schema change) | dave-pacred (service-import promo) |
| 0136 | `partners` | เดฟ | ✅ **applied prod 2026-06-02** (direct-DB · pure DDL · idempotent) · 1 NEW isolated table `partners` (external logistics/business partner directory — GOGO/JMF/TTP/MOMO/CargoThai/warehouse/customs/messenger/api_provider) · `id/code(unique)/name/name_en/partner_type(CHECK 8 vals)/contact_*/note/is_active/sort/timestamps` · NO FK to legacy (like carriers/freight_quote) · RLS `is_admin(['super'])` only · staff-CRUD gap §PM-6 #3 MVP · admin CRUD at `/admin/partners` (super) · `set_updated_at()` trigger · idempotent `create … if not exists` | dave-pacred (partner directory MVP) |
| 0137 | `pcs_sync_state` + `pcs_sync_logs` | ภูม (renumbered from his `0135` by เดฟ at integration — collided with main's `0135_import_promo_banner_config`) | ⏳ **NOT applied prod** · 2 NEW isolated tables for the PCS↔Pacred sync — `pcs_sync_state` (singleton id=1 cursor) + `pcs_sync_logs` (append-only audit) · service_role-only · RLS deny-all · idempotent `create … if not exists`. **Activation (ภูม/ก๊อต/owner):** (1) apply 0137 to prod (2) set `PCS_SYNC_URL`/`PCS_SYNC_TOKEN` Vercel env (3) deploy `pcscargo.com/api/pacred-sync.php`. Cron `/api/cron/pcs-sync` (every 10 min) is already in vercel.json — until activation it fails gracefully (`state_read_failed`, HTTP 200, no customer impact). | Poom-pacred (PCS↔Pacred sync) |
| 0138 | `forwarder_invoice` | ภูม | ✅ **applied prod by ภูม** (CLAUDE.md session-close 2026-06-03 · R-2 ใบวางบิล/billing-run · 2 tables) | main |
| 0139 | `min_sell_floor` | เดฟ (Lane C) | ⏳ **NOT applied prod** · seed 1 `business_config` key `pricing.min_sell_floor` (JSON: base ต่อโกดัง 1=กวางโจว 2=อี้อู + surcharge ต่อขนส่ง 1=รถ 2=เรือ 3=อากาศ + enabled + block) for the sales min-sell guardrail (global-trade-group §5 · กว่างโจว 2,900 / อี้อู 4,900 / เรือ +300) · editable at `/admin/settings/business-config` · idempotent `on conflict do nothing` (zero schema change) · loader `lib/pricing/min-sell-config.ts` falls back to identical defaults so applying is OPTIONAL | dave-pacred (Lane C pricing) |
| 0140 | `yuan_tax_doc_pref` | เดฟ (Lane B) | ⏳ **NOT applied prod** · RENAMED from 0139 at integration (collided with Lane C's 0139) · adds `tax_doc_pref` + `tax_doc_tax_id` + `tax_doc_address` to `tb_payment` (ฝากโอน) — mirrors 0127's columns on tb_header_order/tb_forwarder so yuan orders can carry a tax-doc mode (ใบกำกับ/ใบขน/ไม่รับเอกสาร). CHECK `in ('receipt','tax_invoice','customs')` · 1 partial index · idempotent `add column if not exists`. **Issuance still deferred per ADR-0027** (no cross-type World-B store for yuan) — completes the SELECTION data model only. เดฟ applies (metadata-only ADD COLUMN nullable). | dave-pacred (Lane B tax-doc) |

---

## ✅ ภูม's migrations — RENUMBERED + INTEGRATED 2026-05-30 (done)

ภูม เขียน 2 migration บน Poom-pacred · apply prod เองแล้วทั้งคู่ · เลขชน filename กับ ปอน's 0118/0119. **Integrate Poom-pacred → main 2026-05-30: renumbered + merged (done):**

| เลขเดิม (Poom-pacred) | เลขใหม่ (main) | ไฟล์ | object | prod |
|---|---|---|---|---|
| 0118 | **0123** | `admins_role_manager` | `admins` role +`manager` | ✅ applied |
| 0119 | **0124** | `momo_commit_tracking` | `momo_import_tracks` +4 cols | ✅ applied |

**DB ไม่ชน** — คนละ object (ภูม admins/momo-commit · ปอน momo-promote/disambiguate). renumber = filename fix เท่านั้น · re-run idempotent no-op.

### 🔧 ภูม renumber (ทำบน Poom-pacred ก่อน sync main):
```bash
cd <your-pacred-clone>
git checkout Poom-pacred
git mv supabase/migrations/0118_admins_role_manager.sql supabase/migrations/0123_admins_role_manager.sql
git mv supabase/migrations/0119_momo_commit_tracking.sql  supabase/migrations/0124_momo_commit_tracking.sql
git commit -m "chore(migrations): renumber 0118→0123, 0119→0124 (collision w/ main ปอน MOMO)"
# จากนั้น sync main (จะได้ ปอน's 0118-0122 มาแบบไม่ชน):
git pull origin dave-pacred --no-edit
git push origin Poom-pacred
```
> SQL content idempotent (ADD COLUMN IF NOT EXISTS / drop-add constraint) — renumbered file = no-op re-run · prod ไม่กระทบ.

---

## 📋 Apply mechanism (custom · ไม่ใช่ Supabase CLI)

โปรเจกต์นี้ apply migration ด้วย script ตรง (ไม่ได้ใช้ `supabase db push`) → **ไม่มี `supabase_migrations.schema_migrations` table** → "applied" = ดูจาก schema จริง (probe scripts).

```bash
# Apply 1 migration:
PG_PASSWORD='<prod-pw>' node scripts/apply-pilot-migration.mjs   # แก้ MIGRATION_PATH ในไฟล์ก่อน
# Probe ว่า apply แล้วยัง:
PG_PASSWORD='<prod-pw>' node scripts/check-momo-migrations.mjs    # ปอน MOMO 0119-0122
PG_PASSWORD='<prod-pw>' node scripts/check-poom-migrations.mjs    # ภูม 0118/0119
```
PG_PASSWORD อยู่ใน `.env.local` (`PG_PASSWORD=...`).

---

## 🔑 กฎ (ทุกคนต้องทำตาม)

1. **migration = global sequence** · ไม่ใช่ per-branch · เลขชน = เจ็บตอน merge
2. **ก่อนเขียน → เช็คไฟล์นี้ → ใช้ NEXT FREE → จอง (เพิ่ม row + commit)**
3. **ทุก migration idempotent** (IF NOT EXISTS / IF EXISTS guards) — re-run ปลอดภัย
4. **isolation** — momo_* แตะแต่ momo_* · อย่าแตะ legacy tb_*/cargo_* ถ้าไม่จำเป็น
5. **apply prod → บอกเดฟ + update ledger นี้** (เปลี่ยนสถานะเป็น ✅ applied)
6. **ห้าม renumber migration ที่อยู่ main แล้ว** (apply prod ไปแล้ว · เลขครอง) — คนใหม่หลบไปเลขถัดไป
