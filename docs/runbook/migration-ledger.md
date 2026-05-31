# 🗄 Migration Ledger — canonical state + numbering authority
**Updated:** 2026-05-30 (เดฟ) · **Authority:** เดฟ owns migration numbering · ขอเลขก่อนเขียน

นี่คือ **single source of truth** ของ migration ทั้งหมด. ก่อนเขียน migration ใหม่ → เปิดไฟล์นี้ → ใช้เลขถัดไป → จองโดยเพิ่ม row + commit.

---

## 🔢 NEXT FREE NUMBER = **0133**

ใครจะเขียน migration ใหม่ → ใช้ `0132_*` → เพิ่ม row ในตารางข้างล่าง → commit. ถ้ามีคนจองพร้อมกัน บอกเดฟ.

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
