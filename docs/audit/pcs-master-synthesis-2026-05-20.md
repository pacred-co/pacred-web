# PCS Cargo master synthesis — Phase 1 readiness (2026-05-20 ค่ำ)

> **Cross-cutting synthesis** of 5 audits ภูม commissioned tonight:
> 1. `fidelity-2026-05-20.md` (Agent B · 7 admin screens vs legacy PHP)
> 2. `mobile-verify-2026-05-20.md` (Agent C · 5 customer screens)
> 3. `pcs-complete-analysis-2026-05-20.md` (Agent X · 4,298L พี่เดฟ analysis)
> 4. `pcs-admin-roles-2026-05-20.md` (Agent Y · 1,303L role/menu doc)
> 5. `pcs-business-flow-2026-05-20.md` (Agent Z · 1,225L flow + ops rules)
>
> Source: พี่เดฟ's `N'POOM - PCS LEARNNING/` docs at
> `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\`.
>
> **TL;DR for ภูม:** Code in `newrealdatapcs/pcscargo` is byte-identical
> to what we already have (16,184 PHP files · 0 hash diffs). The "real
> update" is พี่เดฟ's 5 markdown docs (6,826L) describing what the
> legacy system actually does — they reveal gaps in the rebuild that the
> code itself doesn't expose. Below = the merged action list.

---

## 🔴 P0 — Cannot ship Phase 1 without these (BLOCKING)

| # | Gap | Source | Effort | Notes |
|---|-----|--------|--------|-------|
| 1 | **`/admin/forwarders` reads rebuilt `forwarders` table, not legacy `tb_forwarder`** — wrong status enum (7 vs legacy's 10), wrong transport-type values (truck/ship/air vs 1/2/3), wrong customer-name source (profiles vs tb_users) | fidelity §5 | 4-6 ชม | The most-used admin screen is the rebuilt app under faithful-port paint. Staff will read wrong status to customers. |
| 2 | **QA module is a tombstone** — `/admin/warehouse/qa-inspections/page.tsx` says "QA was built on retired spine table"; the legacy QA workflow ("ของปลอม → ห้ามส่งต่อ + Blacklist") is unimplemented | business-flow §QA + Guidebook L451-454 | 6-8 ชม | Without QA, fake-product incidents have no system support → reputational + legal risk |
| 3 | **Forwarder 10%-over-preview customer re-confirm gate** — when actual cost exceeds preview by >10%, legacy forces customer re-confirmation before billing. Pacred bills silently. | business-flow §3 (BUSINESS_FLOW L85-87) | 2-3 ชม | Surprise-billing risk → wallet disputes |
| 4 | **DataTables Responsive plugin** — was missing from `(protected)/layout.tsx`, `/service-order` 7-col table horizontal-scrolls on mobile | mobile §1 | ✅ **FIXED** in commit `81f80b1` (Wave 3) |
| 5 | **Register iOS auto-zoom** — `INPUT_BASE` font-size 14px triggers iOS Safari auto-zoom | mobile §2 | ✅ **FIXED** in commit `81f80b1` (Wave 3) |
| 6 | **Quagga2 not in package.json** — camera barcode scanner non-functional | fidelity §3 | ✅ **FIXED** in commit `81f80b1` (Wave 3) |
| 7 | **`driver` role sidebar fully Phase 2/4 gated invisible** — a real `driver` login sees nothing operational; their `barcode`/`toDeliver`/`history` items are all phase-locked | roles §1 | 30 นาที | Just remove `phase: 2/4` tags on the 3 driver items in `sidebar-menu.ts` |
| 8 | **`qa` role enum missing** — QA staffers have no role to log in as without `super` over-privilege | roles §2 | 1 ชม | Add `qa` to `AdminRole` enum in `lib/auth/require-admin.ts` + sidebar |
| 9 | **`sales_admin` vs `sales` mismatch** — `AdminRole` enum has `sales_admin` but doc + prompts referenced `sales` (separate role) | roles §6 | ❓ ask ภูม whether they're the same |

---

## 🟠 P1 — Should-have for launch (within 1-2 days)

| # | Gap | Source | Effort | Notes |
|---|-----|--------|--------|-------|
| 10 | **Wave 3 downstream cleanup not finished** — 14 of 19 `cargo_*` consumers still reference retired tables. Migration 0090 DROP commented. `lib/warehouse/*` helpers undeleted. | Wave 3D in-progress | 4-6 ชม | Risk: tomorrow's dev confused by dead-code; can't apply migration 0090 |
| 11 | **`/admin/hr/humanresource` divergent from legacy** — top menubar vs legacy left-rail nested 4-level. Cards link to rebuilt-app pages not legacy. | fidelity §7 | 3-4 ชม | HR officer can't drill to "10-wheel drivers" / "พนักงานลาออก" |
| 12 | **`/admin/accounting/cargo` 6-card landing diverges** — legacy lands on single H2 banner + dropdown nav | fidelity §6a | 2 ชม | Staff won't recognize this landing |
| 13 | **VIP Credit Wallet customer page** — only `wallet/credit-panel.tsx` component; no `wallet/credit/page.tsx` route. Source L1467-1502 specifies dedicated dashboard. | complete-analysis §1 | 3-4 ชม | VIP customers can't see their credit at a glance |
| 14 | **Wallet top-up admin approval queue UI** — `/admin/wallet/approvals` dedicated page unclear; source L2047-2068 explicit | complete-analysis §2 | ❓ ask ภูม if exists; if not 2-3 ชม |
| 15 | **Cart product-scrape on URL paste** — 1688/Taobao/Tmall URL auto-fill missing | complete-analysis §3 | 4-6 ชม | Customer UX friction during ordering |
| 16 | **Mobile tap-target sweep** — header buttons (dashboard) · tab links + DT row actions (service-order) · inline history anchors (wallet) at 28-36px | mobile §3 | 1-2 ชม | Add `min-height: 44px` to `.pcs-legacy .nav-link` + `.pcs-legacy .btn-sm` |
| 17 | **`interpreter` commission approval flow** — `ops` (= CS Purchasing in legacy) approves but `menuOps` has no leaf to reach the queue | roles §3 | 30 นาที | Add 1 sidebar item |
| 18 | **VIP-credit eligibility checker** — rules spec'd in BUSINESS_FLOW L156-166 but no `isEligibleForCredit()` exists | business-flow §3 | 3-4 ชม | Currently manual admin override only |

---

## 🟢 P2 — Nice-to-have / Phase 1.5

- Status tab strips on `/admin/forwarder-action` queues (status counts + filter buttons)
- 180-day default date range on `/admin/report-cnt` (we use 90)
- SweetAlert success toasts after form submits
- Container detail view at `/admin/report-cnt/[id]` (the legacy `?id=` flow)
- `notify` / `popup` per-admin-account allowlist
- DataTables search/export/print/PDF/CSV/Excel buttons

---

## 🔵 Documentation contradictions to RESOLVE before porting

These are places where พี่เดฟ's BUSINESS_FLOW doc CONTRADICTS the legacy SQL schema. Trust the SQL, not the doc:

1. **BUSINESS_FLOW.md L57-68** invents status codes 7/8/9. Legacy `tb_header_order.hstatus` = 1..6 only (per `0081_pcs_legacy_schema.sql:2568`). Our `lib/legacy-status-map.ts` is faithful to SQL ✅.
2. **`docs.md` L91** — claims `adminType` = RBAC roles. Schema says employment type (1=ประจำ, 2=ทดลองงาน, …). RBAC actually lives in `admins.roles[]`. Faithful to SQL ✅.

---

## ❓ Questions for ภูม BEFORE we lunge

Pulled from all 5 audits:

| # | Question | Source |
|---|----------|--------|
| 1 | `sales_admin` vs `sales` — same role or two distinct? `AdminRole` enum has only `sales_admin`. | roles §6 |
| 2 | Is `/forgot-password` SMS-OTP or email-link? Doc unclear. | complete-analysis ❓1 |
| 3 | Which is canonical cart route? | complete-analysis ❓2 |
| 4 | Is wallet-approval queue a dedicated page or just a filter on `/admin/wallet`? | complete-analysis ❓5 |
| 5 | Does Pacred support "Agent" customer-role tier (vs Pacred's staff-side `sales/**`)? | complete-analysis ❓6 |
| 6 | Does the admin dashboard render the 12 specific quick-filter tabs with live counts? | complete-analysis ❓8 |
| 7 | Does forwarder-create expose all 8 China warehouse partners (SAI/CTT/MK/MX/JMF/GOGO/CargoCenter/MOMO)? | complete-analysis ❓10 |
| 8 | Service role key for prod project `yzljakczhwrpbxflnmco` — does the dev project's JWT (`pprrlabgebrnocthwdmg` ref) actually authenticate? If admin pages 401 after env switch, we need the prod project's key. | env switch |
| 9 | Should we port the 13 Freight-side roles (doc lists them but doesn't enumerate menu items)? Or defer to Phase C? | roles ❓1 |
| 10 | `tb_payment` (legacy) vs `yuan_payments` (rebuilt) — migrate-and-retire or coexist? | business-flow ❓2 |
| 11 | Volumetric-weight formula — equivalent or divergent? "100% sameness" rule says verify. | business-flow ❓3 |

---

## 🚀 Recommended next move

The P0 list is **9 items totalling ~18-25 ชม**, **3 already fixed** in Wave 3 (4/5/6). Remaining P0 work = **6 items · 14-21 ชม**.

The **single highest-leverage P0** is **#1 `/admin/forwarders` rewrite** — it's the most-used admin screen and its current divergence is the most operationally dangerous (staff will read wrong status). 4-6 ชม of focused work closes it.

After #1, the natural sequence is:
- P0 #7 (driver phase-unlock · 30 min)
- P0 #8 (qa role · 1 ชม)
- P0 #3 (forwarder 10%-over gate · 2-3 ชม)
- P0 #2 (QA module rebuild · 6-8 ชม — biggest)
- Then P1 cleanup wave

**Pre-ลุย questions for ภูม:** answer #1 (sales_admin vs sales) + #8 (service_role key) + #9 (port Freight roles?) + #11 (volumetric formula verify).
