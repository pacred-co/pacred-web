# ภูม cargo-domain notes — A: Mobile-scanning (01) + Admin-employee (04)

> Reviewer: ภูม. Date: 2026-05-19. Lens: **D1 faithful PCS port** — owner directive
> "copy 100% identical FIRST, then improve" ([`poom.md`](../../briefs/poom.md) §0).
> Source docs reviewed: [`01-mobile-scanning.md`](01-mobile-scanning.md) +
> [`04-admin-employee.md`](04-admin-employee.md). Phase-B stage owner sheet:
> [`poom-phase-b-prep.md`](../poom-phase-b-prep.md). Legacy reference:
> [`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §1.4 (badges) + §6 priorities,
> [`d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) §4 (logic loop per role).

---

## 1. Phase-B fidelity reactions (D1 lens: does this conflict with "copy first")

**Doc 01 — mostly Phase-C, NOT Phase-B:**
- 🔴 **Conflict (push to C):** R-3 PWA + manifest · R-6 POD photo + GPS · R-7 Print Pacred labels (`bwip-js`) · R-8 public guest tracking · R-9 batch scan + offline buffer · R-13..R-17 (voice/haptics/OCR/Capacitor). **None of these exist in legacy PCS.** Shipping them in B = reinterpretation, breaks D1.
- 🟢 **Phase-B-safe (faithful enablers):** R-1 zxing polyfill (legacy scan only works with cam — iOS broken = legacy-broken, OK to fix as infra) · R-2 Button 44px (cosmetic infra, no workflow change) · R-5 `capture="environment"` on slip uploads (legacy slip-upload was native phone UI, this matches it).
- ⚠️ **Pure-Pacred reinterpretation (NEVER in B):** R-4 `<MobileCard>` table → card pattern. **Legacy admin uses Bootstrap-4 DataTables** ([`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §5 — "Modern Admin" template). Replacing tables with mobile cards = changing the visual paradigm staff are trained on. Push to C.

**Doc 04 — mixed: AP-1, AP-3, AP-5 are largely faithful; AP-2, AP-4, AP-6, AP-7 are mostly C:**
- 🟢 **Phase-B (faithful — match legacy):** AP-1.1 add 4 RBAC roles (matches legacy `company/department/section` triple via my B-4 `0088_admin_role_triple.sql`) · AP-1.5 per-role sidebars (= B-4) · AP-3.1..4 wire `ensureWorkItemForEntity` — **WAIT, see §4 red flag below** · AP-7.7 `/admin/qa` 11 SLA-breach cards (matches legacy 11 QA queues — = B-9) · AP-7.8 kill duplicate `/admin/containers` (= B-6 cleanup).
- 🔴 **Phase-C (NEVER in B — these are rebuilt-era inventions):** AP-2 mobile drawer/PWA admin shell (legacy admin = Bootstrap-4 desktop-only) · AP-2.3 `/admin/scan` PWA (legacy = 8-mode browser pages, NOT PWA — see §2 below) · AP-2.4 `/admin/clock` (legacy attendance is in HR Extension, not a 1-tap mobile button) · AP-4 CS workspace + omni-channel inbox (legacy = `tb_note_*` queues = my B-9; no LINE webhook in legacy) · AP-6.1 "ปุ่มเดียววางบิล" bulk-bill (legacy has รวมบิล multi-order consolidation = B-8 — but **per-customer**, not bulk-checkbox) · AP-7.1/7.2 impersonation + support panel · AP-7.3 staff-direct chat / staff_announcements (legacy has bulletin, not chat).
- 🟢 **Phase-B (= work already in my B-stages):** AP-5 disbursement (= B-9 `tb_extension` + needs new design per [`disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md)) · AP-1.2 sweep ungated pages (security-infra, OK).

---

## 2. Phase-B sequence implications

### 01 → B-7 (warehouse barcode scan, 8 variants)
- **R-1 zxing polyfill MUST fold into B-7 NOW** — legacy scan worked on any cam-capable device; if iOS Safari can't scan in Pacred, the B-7 "faithful 8-mode scan family" doesn't match legacy behaviour. Add to B-7 acceptance bar: "every mode works on iPhone Safari too". +2h to B-7 estimate (10-12h total).
- **R-12 scanner-device deep-link (Honeywell/Zebra optimistic-UI)** — legacy used these scanners with the simple form field; the auto-focus loop is already there in `scan-form.tsx:82`. Folding optimistic-UI INTO B-7 risks behaviour drift (faithful = wait for server). **Defer to C.**
- **R-9 batch + offline** — legacy was strictly one-at-a-time (online MySQL only). Defer to C.
- **R-13 voice/haptics, R-15 customer QR, R-21 customer scan-to-track** — none in legacy. C.

### 04 → B-4 (per-role sidebar + badges)
- AP-1.1 (extend `admins.role` CHECK with 4 new roles) **must land BEFORE B-4** — my draft `0088_admin_role_triple.sql` extends the enum into legacy `company/department/section`; AP-1.1's `marketing/cs_admin/docs_admin/logistics_admin` should fold into this migration. Result: ONE migration, not two.
- AP-1.5 new sidebars (`menuMarketing`, etc.) = **literally B-4** — same work. Already on my plate.
- AP-1.2 sweep 31 ungated pages = security-infra; do alongside B-4 since I'll be in `lib/auth/require-admin.ts`.
- AP-7.9 group Pacred-only modules under "Enhancements" — fits B-4 sidebar assembly. Cheap S, ship together.

### 04 → B-8 (accounting: รวมบิล + container-payment + รับรู้รายได้)
- AP-5 disbursement (เบิก/จ่าย) is **adjacent to B-8 but a separate system** — not part of legacy accounting screens. **Defer disbursement build to C / sequence after B-9.** Pure B-8 stays as-specced.
- AP-6.1 "ปุ่มเดียววางบิล" — owner's verbal ask, but legacy did this **per-customer (รวมบิล screen pre-selects)**, not bulk-multi-customer. Build the legacy รวมบิล exactly in B-8; the "bulk multi-customer" variant is a C enhancement.
- AP-6.5 persisted bulk-run audit rows — infra polish, OK for B-8 (cheap S).

### 04 → B-9 (QA / notes / Learning / Extension)
- AP-7.7 `/admin/qa` 11 SLA cards = **literally B-9 QA queue piece** ([`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §1.4 lists the 11 queues). Same work — fold in.
- AP-7.4 notification outbox UI extend = `tb_extension`-ish, fits B-9 "Extension tools".
- AP-7.5 `system_config` table — net-new (legacy had hard-coded config in `tb_setting`). **Phase B = port `tb_setting` directly**; the editor UI is a C polish.

---

## 3. Data/schema gaps

| Proposal | Read | Write | New migration? | Join key |
|---|---|---|---|---|
| R-1 zxing (B-7) | `tb_forwarder.fAmount/fStatus` | `tb_forwarder.fStatus` | None | `fNo` |
| R-6 POD photo+GPS | n/a | new `cargo_shipment_events.geo_lat/lng/photo_storage_path` | Yes — `0090_pod_events.sql` (Phase C) | `forwarder_id` / `fNo` |
| AP-1.1 RBAC roles | `admins.role` CHECK | extend CHECK | **fold into my `0088_admin_role_triple.sql`** | `admin_id` |
| AP-3 work-board hooks | `tb_forwarder.fStatus` transitions | `work_items` row | None (table exists post-launch) | `entity_type='forwarder' + entityRef=fNo` |
| AP-5 disbursement | n/a | full new schema (`disbursement_requests/lines/allocations/fund`, `wht_certificates`) | Yes — Phase C, NOT B | `recipient_admin_id` |
| AP-6.1 bulk-bill | `tb_forwarder` + `tb_invoice` | `tb_invoice` insert + `tb_invoice_consolidation` | None if I port legacy schema | `userID` (per-customer grouping) |
| AP-7.7 QA queues | `tb_check_forwarder` (Phase A loads) | `tb_check_forwarder.status` | None | `fNo` |
| AP-7.5 system_config | n/a | new `system_config` OR port `tb_setting` | Port `tb_setting` (faithful) | `setting_key` |

**Key insight:** Most "new schema" proposals in doc 04 are **already covered by Phase A's `tb_*` port** — `tb_check_forwarder` (QA), `tb_note_order/forwarder` (notes), `tb_learning_*` (Learning), `tb_extension_*` (Extension), `tb_setting` (config). The R&D writes from an assumption Pacred-only schema exists; faithful port reads the `tb_*` directly.

---

## 4. ภูม cargo-domain red flags (the QC the agents can't self-do)

🔴 **AP-3 work-board hook on forwarder status changes — risk of dual-write divergence.** Doc 04 §2.5 wants `ensureWorkItemForEntity()` called from `adminAdvanceForwarder` AFTER every status change. **Legacy PCS has NO `work_items` concept** — staff navigate by the sidebar badges (B-4) + the dashboard queue strip. Adding a hidden hook that creates board rows when `fStatus` advances *won't break legacy fidelity* (board is a C addition that just sits in the menu), but **staff will encounter it before they ask for it**. Recommendation: defer the AP-3 hook wiring until Phase C — keep the work-board cosmetic in B (it exists, but stays empty for ported entities) and wire the hook only when the team layers C enhancements.

🔴 **Doc 04 §1.2 "Sub-driver folds into driver" — schema can't split commission.** Confirmed against [`ops-roles.md`](../../briefs/ops-roles.md) §14. **Legacy has the same gap** — the cargo team actually splits commission manually via `tb_commission` rows. Faithful port = preserve the manual split. The doc's "build `forwarder_driver_pairings` table" is C.

🔴 **R-4 mobile-card admin tables — breaks "zero retraining".** Bootstrap-4 DataTables is the visual the warehouse + accounting staff have used for years. Converting tables to cards on phone changes the muscle memory (sort-by-column → swipe-through-cards). **Reject for B.** Cards are a C-1 candidate for warehouse pages ONLY, with explicit staff sign-off.

🟠 **Doc 04 §2.4 "1-tap attendance + Web Push for staff" — wrong tool for cargo team.** Cargo warehouse/driver staff are on LINE OA all day; pushing attendance through a 2nd Web Push channel = duplicate notifications. Legacy attendance lives in HR/Extension; faithful = use that route. C decision.

🟠 **Doc 01 R-15 public `/track/[code]` guest page — closes chat pain BUT introduces new exposure surface.** Legacy didn't have public tracking by design (customers used member portal). Adding it = product extension. Defer C; if it ships, **token-required** (NOT raw code-by-rate-limit — too easy to enumerate `PR0001`, `PR0002`...).

🟢 **R-2 Button 44px fix — actually faithful.** Legacy buttons rendered at `.btn-lg` sizes in Bootstrap 4 (≈44-50px). The Pacred shrink is the rebuilt-era reinterpretation. Fixing = restoring legacy.

---

## 5. Phase-C-1 cargo-revenue priority (one each from 01 + 04)

**From 01 — R-7 Print Pacred labels (`bwip-js`, Code-128 generator).** Cargo-ops forensics §D2 ("two parallel systems that don't reconcile") names the supplier-CN-barcode dependency as a structural bottleneck. Owning the print = owning the canonical scan-barcode = unlocks fuller intake automation + Pacred-branded label in the customer's hand. Direct revenue lever: cleaner intake = faster billing cycle. ~1 wk.

**From 04 — AP-5 unified disbursement / WHT cert (เบิก/จ่าย).** Owner explicitly calls this "the one that always has problems" ([`disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md) §1) and cargo-ops forensics §A6 names WHT as "most-repeated complaint". Closing this kills two daily-pain loops AND unlocks Acc-AP role workspace (currently 0/4 covered). Cargo lens: every container Pacred pays for triggers a เบิก — direct revenue-cycle impact. ~3 wk.

---

**End — `_poom-notes-A-cargo-ops.md`.** Next pickup: notes B (docs 02 marketing + 08 tracking-logistics) if needed.
