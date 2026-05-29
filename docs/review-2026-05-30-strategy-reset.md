# 📋 Review — Strategy Reset (Owner Final 2026-05-30)
**By:** เดฟ · **Decision:** Owner final — กลับมา repo เดียว (`pacred-web`) + branch model เดิม
**pacred-admin-next:** SHELVED — เอาไว้หลังทำ admin เสร็จ ค่อยแยกไปทำ full-performance อีกที

---

## 🗺 Branch model (final · 1 repo = pacred-web)

```
                          ┌──────────────────────────────────────┐
   InwPond007 (ปอน) ──────┤                                      │
   หน้าบ้าน + member ลูกค้า │                                      │
                          │   dave-pacred (เดฟ)  ──→  main        │──→ Vercel
   Poom-pacred (ภูม) ─────┤   integrator/verify      production   │    pacred.co.th
   Admin หลังบ้านพนักงาน   │                                      │
                          │                                      │
   podeng (ปอน sub) 🔒────┤  เอาแค่ MOMO มาต่อ                    │
   LOCKED (stage ไกลไป)   └──────────────────────────────────────┘
```

| Branch | คน | บทบาท |
|---|---|---|
| `main` | ก๊อต/เดฟ gate | production · Vercel auto-deploy |
| `dave-pacred` | เดฟ | integrator — ทุก branch verify → main |
| `InwPond007` | ปอน | หน้าบ้านเว็บไซต์ลูกค้า + หลังบ้าน member ลูกค้า **ทั้งหมด** |
| `podeng` | ปอน sub | 🔒 LOCKED — member ที่ทำ stage ไกลเกินไป · เอาแค่ **MOMO** มาต่อ |
| `Poom-pacred` | ภูม | **Admin หลังบ้านพนักงาน** · ทำต่อหลัง Owner Approved |

---

## 📊 Branch state (fetch 2026-05-30)

| Branch | HEAD | behind/ahead main | งานล่าสุด |
|---|---|---|---|
| `main` | `b23fa282` | 0/0 | ก๊อต Vercel/Cloudflare runbook · prod env · migrations 0119-0122 |
| `dave-pacred` | `b23fa282` | 0/0 | = main (clean integrator base) |
| `InwPond007` | `b23fa282` | 0/0 | = main (clean ปอน base) |
| `podeng` | `b2bf7ef4` | 36 / **9** | MOMO Phase A-D + sync UI (9 commits) |
| `Poom-pacred` | `1e2104cc` | 3 / **46** | ภูม admin Wave 27-30 (46 commits · owner approved) |

---

## 🔴 CRITICAL — migration number COLLISION (verified prod 2026-05-30)

ภูม (Poom-pacred) มี 2 migration ที่ไม่อยู่ main + เลข **ชน** กับ ปอน/main:

| เลข | main (ปอน · applied prod ✅) | Poom-pacred (ภูม) | ภูม applied? | DB ชน? |
|---|---|---|---|---|
| 0118 | `momo_promote_raw_columns` | `admins_role_manager` | ✅ applied | ❌ คนละ object |
| 0119 | `momo_disambiguate_container_naming` | `momo_commit_tracking` | ❌ ยังไม่ | ❌ same table คนละ col |

**Verified on prod (yzljakczhwrpbxflnmco):**
- ภูม 0118: `admins_role_check` = `CHECK (role IN ('owner','admin','manager','staff','viewer'))` → **'manager' มีแล้ว = applied** ✅
- ภูม 0119: `momo_import_tracks.{committed_at,committed_by,commit_status,commit_error}` → **ทั้ง 4 column MISSING = ยังไม่ apply** ❌

**Assessment:**
- ✅ **DB ไม่ชน** — 0118 ภูม แก้ `admins` constraint · main's 0118 เพิ่ม column ให้ momo_import_tracks (คนละ object). 0119 ทั้งคู่แตะ momo_import_tracks แต่คนละ column (ADD COLUMN IF NOT EXISTS — coexist ได้)
- ⚠️ **Filename/order ชน** — ตอน integrate จะมี 2 ไฟล์ชื่อ 0118_*.sql + 2 ไฟล์ 0119_*.sql

**Resolution (ตอน integrate · Pickup A):**
1. Renumber ภูม's `0118_admins_role_manager` → `0123_admins_role_manager`, `0119_momo_commit_tracking` → `0124_momo_commit_tracking`
2. ภูม 0118 (admins manager) — applied prod แล้ว · renumbered file = no-op re-run (idempotent)
3. ภูม 0119 (momo commit cols) — **ต้อง apply prod ตอน integrate** (4 columns ยังไม่มี)
4. ภูม's code refs ไม่ต้องแก้ (อ้าง column/table name ไม่ใช่เลข migration)

---

## 🟢 State ที่ทำเสร็จ + KEEP

| งาน | สถานะ |
|---|---|
| Local + Vercel = prod Supabase (yzljakczhwrpbxflnmco) | ✅ `.env.local` switched · backup `.env.local.dev-backup-2026-05-29-pre-prod-switch` |
| ปอน MOMO migrations 0119-0122 (main) | ✅ applied prod + tracked on main (`bbbf6ebf`) · 9 tables + 5 cols · legacy intact |
| ภูม 0118 admins role 'manager' | ✅ applied prod (verified constraint) |
| Prod DB health | ✅ alive (auth/v1/health = 401) |

---

## ⚠️ Pending integration (lanes ที่ยังไม่เข้า main)

| Lane | commits ahead | งาน | merge เมื่อ |
|---|---|---|---|
| `Poom-pacred` (ภูม) | 46 | Admin Wave 27-30: invoice/receipt auto-gen (tb_receipt) · doc-number minter + 21 tests · printReceipt mPDF port · MOMO cron (10min) · barcode mobile rewrite · sidebar legacy-verbatim · menubar bug fix | Pickup A (renumber 0118→0123, 0119→0124 + apply ภูม 0119) |
| `podeng` (ปอน) | 9 | MOMO Phase A-D consuming code (mapper explode track_details · raw_events · sync UI) — ทำให้ตาราง 0119-0122 ที่ apply แล้วมีข้อมูลจริง | Pickup B |

> ⚠️ podeng 36 behind main — merge ต้อง resolve (camelCase 2a + LCL + fidelity ที่ landed). Surgical cherry-pick MOMO commits เท่านั้น (podeng "LOCKED except MOMO").

---

## 📦 Docs SUPERSEDED by this reset (parked · ไม่ลบ)

- `docs/team-2026-05-28-2repo-workflow.md` (2-repo)
- `docs/team-2026-05-29-3-deploy-architecture.md` (3-deploy)
- `docs/runbook/got-vercel-cloudflare-admin2-setup.md` (admin2 — แต่ §1 CRON_SECRET + §6 S3 rotate ยังใช้กับ single-repo)
- `pacred-admin-next/docs/work-distribution-1to1-2026-05-29.md` (parked กับ repo นั้น)

> ⚠️ 2 ข้อจาก got-vercel runbook ยังใช้ได้กับ single-repo + urgent:
> - **CRON_SECRET** บน Vercel pacred-web (cron 11 jobs ตาย 401 จนกว่าจะตั้ง)
> - **S3 key rotation** (leaked `e913d7da...`)

---

## 🎯 Pickup recommendations (ลำดับแนะนำ)

1. **A — Integrate Poom-pacred → main** (ภูม owner-approved admin · 46 commits · Wave 27-30) — renumber 0118→0123 + 0119→0124, apply ภูม 0119 prod, verify · `branch-integrate-loop` skill
2. **B — Integrate podeng MOMO → main** (9 commits · ทำให้ตาราง 0119-0122 มีข้อมูลจริง · surgical cherry-pick MOMO only · podeng 36 behind)
3. **ก๊อต infra** — CRON_SECRET + S3 rotate (got-vercel runbook §1/§6)
4. **C — 3 BIG P0 cluster D** (search rewrite · 5 reports · containers-hs) from B-4 audit
5. **D — 4 LOAD-BEARING fidelity gaps** (login remember-me · register channel=8 · forgot-password layout · email mode)

---

## 🔗 Reference
- Reset + branch model: `CLAUDE.md` top section (2026-05-30)
- B-4 audit (10 P0 + 33 P1): `docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md`
- 4 fidelity gaps: `docs/audit/fidelity-auth-screens-2026-05-28.md`
- ภูม admin work: `origin/Poom-pacred` Wave 27-30
- ปอน MOMO: `origin/podeng` (9 ahead)
- Migration probe scripts: `scripts/check-momo-migrations.mjs` · `scripts/check-poom-migrations.mjs`
