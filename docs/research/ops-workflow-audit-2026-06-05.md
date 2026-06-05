# 🏭 Ops-workflow audit — target operating model vs what's built (2026-06-05)

**Trigger (owner):** the Pacred ops flow must run as a chain of roles —
**เซล → CS → Doc → โกดัง → บัญชี → จัดส่ง** — each owning concrete tasks. Owner
asked to (1) add **per-customer CS assignment** (each customer their own CS, like
the sales-rep round-robin) and (2) **audit what exists first, then build the gaps.**
4 read-only agents mapped the target model vs the codebase (cross-ref legacy
`pcs-admin/*.php` per §0b).

## 🔑 Headline
**Most of the machinery is BUILT — the gaps are mostly RBAC/wiring + a few genuine
greenfield pieces.** The CLAUDE.md service-catalogue "❌ ใหม่ทั้งหมด" labels for
ใบขน/tax-invoice/clearance are **STALE** — those are shipped (just role-locked).

| Role | Tasks | Verdict |
|---|---|---|
| **เซล** Sales | รับลูกค้า | ✅ assigned per customer (`tb_users.adminIDSale` · round-robin · 4 live change paths) |
| **CS** | ตามสถานะให้ลูกค้า | ❌ **no per-customer assignment** — only the central line shown today (this run). The build is the headline ask → fully planned below. |
| **Doc** | ประสานชิปปิ้ง · ใบขน · เอกสาร · ประสานจีน · ขยับสถานะ | ✅ **built** (customs-declaration CRUD+PDF, tax-invoice, receipts, billing-run, Form-E/packing/DO) — but **role-LOCKED**: `freight_export_doc`/`freight_import_doc` sidebars are TODO placeholders + doc routes gated `["super","accounting"]` → Doc users can't reach the tools built for them. |
| **โกดัง** Warehouse | รับตู้ · รับสินค้า · แสกนรับเข้า · **แจ้งของครบต่อตู้** | ✅ scan-in (USB+camera, auto-flip fstatus=4) excellent · ❌ **per-container completeness alert "ของมาครบมั้ย ตู้ต่อตู้" MISSING** (owner's headline) — data exists (famount vs fi2amount by fcabinetnumber) but no container rollup + no alert. |
| **บัญชี** Accounting | วางบิล · **จ่ายค่าตู้ให้เฟรท** · เก็บเงินลูกค้า | ✅ วางบิล (billing-run `tb_forwarder_invoice`) + collect (fStatus 5→6 + auto-receipt + WHT, closed loop) · 🔴 **จ่ายค่าตู้ OUT to freight = MISSING** (no payable ledger — `disbursements.ts` tombstoned; no `tb_freight_rate_*`; legacy never had it → greenfield + accounting policy). |
| **จัดส่ง** Dispatch | แพลนโทร · จัดเที่ยวรถ · ส่งหลังจ่าย · feedback | ✅ deliver-after-paid (photo + auto fstatus=7) strong · ⚠️ driver-batch works but has a **dead-write twin** (`forwarder-drivers.ts`→empty rebuilt table) + no route optimization · ⚠️ call-queue is acquisition-only/backward-looking · ❌ **customer delivery feedback MISSING** (only static marketing reviews). |

## 🛠 Phased build plan (gaps only)

**Phase 1 — CS per-customer assignment** (owner's explicit ask · fully planned · ~6 files + migration 0141). Mirror the `tb_users.adminIDSale` legacy model (NOT the rebuilt `profiles` twin — that's a dead-write). Spec below.

**Phase 2 — Doc role unlock** (highest leverage: features exist, door is locked). Wire `menuFreightExportDoc`/`menuFreightImportDoc` (replace TODO placeholders in `lib/admin/sidebar-menu.ts:1287/1387`) + add the Doc roles to the `requireAdmin([...])` gates on `freight/declarations/*`, `accounting/customs-declarations`, freight-invoice PDF routes. Optional: a unified `/admin/docs` cockpit queue + a cargo-side `docs_admin` role. **Correct the stale CLAUDE.md "❌" labels.**

**Phase 3 — Warehouse per-container completeness alert** (owner headline). Container rollup by `fcabinetnumber`: `expected = COUNT(tb_forwarder)` vs `scanned = COUNT(tb_forwarder_import2 fi2amount>0)` → (a) badge on `/admin/report-cnt` list ("ยิงครบ 45/52", red when short), (b) banner on `report-cnt/[fNo]` ("⚠️ ยังขาด 7 รายการ"), (c) `notifyStaffGroup` on container-100% + a cron alert for closed-but-incomplete. Hook = the 3→4 flip in `actions/admin/barcode-import.ts:422-440`.

**Phase 4 — Dispatch feedback + dead-write fix.** (a) NEW customer delivery-feedback (table + `/service-import/[fNo]` post-fstatus=7 rating surface + admin readout). (b) Repoint/remove the `forwarder-drivers.ts::adminAssignDriverToForwarder` dead-write (live path = `driver-batches.ts`/`driver-work.ts` on `tb_forwarder_driver*`). (c) optional: a "calls due today" dispatch plan (add `next_call_at` to `lead_call_log` or a delivery-coordination queue).

**Phase 5 — Freight cost-side (จ่ายค่าตู้)** 🔴 owner/accounting decision (already flagged in CLAUDE.md): admin-editable `tb_freight_rate_*` + monthly FX + markup-tier + a payable ledger (un-tombstone the AP concept). Biggest, needs policy sign-off.

---

## Phase 1 spec — CS per-customer assignment (executable)

Mirror `adminIDSale` exactly. **Pool source = `tb_admin` flag** (consistent with sales — assignment is gated on `tb_admin.adminStatusSale`, not the rebuilt RBAC role). Seed CS pool = **พลอย (`admin_ploy`)** (= `CONTACT.phoneCs` 062-603-4456).

**CREATE:**
- `supabase/migrations/0141_customer_cs_assignment.sql` — `tb_users."adminIDCS" varchar(20) NOT NULL DEFAULT ''` + `tb_admin."adminStatusCS" varchar(1) NOT NULL DEFAULT '0'` + index on `adminIDCS` + seed `UPDATE tb_admin SET adminStatusCS='1' WHERE adminID='admin_ploy'`. **All camelCase quoted** (mirror `adminIDSale`/migration 0113). NEXT FREE = 0141 (ledger) → bump to 0142.
- `lib/admin/cs-rep-central.ts` — `export const CENTRAL_CS_ADMIN_ID = "admin_ploy"`.
- `lib/admin/assign-cs-rep.ts` — `pickLeastLoadedCsRep()` (verbatim mirror of `assign-sales-rep.ts`, pool `adminStatusA='1' AND adminStatusCS='1'`, count by `adminIDCS`).

**EDIT:**
- `lib/legacy/pcs-chrome.ts` — `PcsCsRep` type + `CS_FALLBACK` (พลอย/`CONTACT.phoneCsDisplay`) + `cs` field on `PcsChromeData`/`EMPTY_CHROME`/catch + `resolveCsRep()` (near-verbatim of `resolveSalesRep`, reads `adminIDCS`; tel-chain `tb_org_tell_ships`→`tb_organization_tell` reused unchanged) + select `adminIDCS` + call resolver (ideally `Promise.all` with `resolveSalesRep`).
- `lib/auth/legacy-bridge-tb-users.ts` — import + call `pickLeastLoadedCsRep` + add `adminIDCS` to the insert payload (every signup gets a CS at register).
- `actions/admin/customer-profile.ts` ⚠️ ภูม-lane — `listCsAdmins()` (clone `listSalesAdmins`, filter `adminStatusCS='1'`) + `adminUpdateUserCsRep()` (clone `adminUpdateUserSaleRep`, write `adminIDCS`, add `revalidateTag("pcs-chrome")`).
- `app/[locale]/(admin)/admin/customers/[id]/profile-sections.tsx` ⚠️ ภูม-lane — `CsRepEditor` (clone `SaleRepEditor`).
- `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx` ⚠️ ภูม-lane — select `adminIDCS` + `listCsAdmins()` + render `<CsRepEditor>`.
- `components/legacy/pcs-left-menu.tsx` — wire the CS card to `data.cs` (fallback to central baked into `CS_FALLBACK`).
- `docs/runbook/migration-ledger.md` — 0141 row.

**Gotchas:** camelCase columns (tsc can't catch wrong case — verify vs prod) · NOT the `profiles`/`admins` dead-write twin · `loadPcsChromeData` is `unstable_cache` 60s tag `"pcs-chrome"` (add `revalidateTag` on CS change) · 8,898 existing rows get `adminIDCS=''` → central พลอย until assigned (optional round-robin backfill once >1 CS in pool).

> Per-agent full detail (file paths + line numbers + code) is in this run's transcript — Agent 1 (CS clone-plan), Agent 2 (Doc/role-lock), Agent 3 (warehouse completeness), Agent 4 (accounting+dispatch).
