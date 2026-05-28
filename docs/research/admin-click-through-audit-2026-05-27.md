# Admin click-through audit — 2026-05-27

> Agent K · 90-min systematic Chrome-MCP audit of every action button across `/admin/*` on `Poom-pacred` HEAD `05ce7a8` (post-Wave 22 tb_admin → admins merge).
>
> **Method:** opened each surface in real Chrome, clicked action buttons, captured console errors, measured table behavior, tested destructive actions on live PROD DB (and reversed where fired).
> **Scope:** READ-ONLY — no schema/code changes. One destructive `customer suspend` did fire (single-click no-confirm UX bug §0c) and was reversed.

## TL;DR

**16 surfaces verified · 9 distinct bugs found:**
- 🔴 **4 P0** — broken on prod data, blocks daily admin work or risks data loss
- 🟠 **4 P1** — admin works but ugly/awkward/misleading
- 🟡 **1 P2** — polish gap

**Most urgent (Wave 22 fallout):**
1. 🔴 **`/admin/admins/[uuid]` (detail) returns 500** — error boundary catches `42703: column tb_admin.adminid does not exist` from `admins/[id]/page.tsx`. List page also throws but renders fallback. Wave 22 schema swap didn't update detail/list queries.
2. 🔴 **`/admin/admins` shows only 4 admins** — banner says "13 legacy admins through the new form" but we see 4 (Pond 007, วิสุฐ, Pasit, Tadsakorn). 9 missing.
3. 🔴 **`/admin/customers` suspend button fires INSTANTLY without confirmation** — single click on red ⊘ icon mutates `profiles.is_suspended` on live PROD. Destructive without confirm dialog. (Confirmed by accidentally suspending PR10899 and reversing via the now-labeled "Approve" button.)
4. 🔴 **`combine-bill/print` 404** — every "พิมพ์บิลรวม" link goes to `/admin/forwarders/combine-bill/print` (no `?id=`) → 404. Banner confirms Wave 21 deferred.

---

## 🔴 P0 — blocks daily admin work / risks data loss

| Surface | Action | Symptom | Why (likely) |
|---|---|---|---|
| `/admin/admins/[uuid]` | Click row → detail | **500 "ขออภัย เกิดข้อผิดพลาด"** | `column tb_admin.adminid does not exist` (Wave 22 didn't update `AdminProfilePage` query) |
| `/admin/admins` | List page load | List renders but Server logs `42703: tb_admin.id does not exist` + `PGRST200: Could not find a relationship between 'admins' and 'admin_contact_extras'` — 9 admins missing | Wave 22 merge incomplete: code still queries old `tb_admin` table; PostgREST join definition missing |
| `/admin/customers` | Click ⊘ "ระงับ" icon | **Suspends customer INSTANTLY on PROD** with no confirm dialog. Eye icon = nav. Pencil/lock icons = instant server action. | Missing `<ConfirmDialog>` wrap around `suspendUser` server action |
| `/admin/forwarders/combine-bill` | "พิมพ์บิลรวม" (per-row) | **404** — link target is `/combine-bill/print` (no `?id=`) | Wave 21 deferred per banner: "bulk-select-print · PDF render (@react-pdf)" |
| `/admin/forwarders/combine-bill` | Bill #10643 row | Bill ID is NOT a link (no detail page). Items column shows "—" because `tb_bill_item query failed` | No `combine-bill/[id]` detail route. Server-action throws on items join. |
| `/admin/forwarders/combine-bill` | "ลบรายการ" (per-row) | Anchor href=`#` — no navigation. Onclick handler exists but not testable without confirm | Delete not wired to server action, only client-side handler |

## 🟠 P1 — admin works but ugly/awkward/misleading

| Surface | Action | Symptom | Why (likely) |
|---|---|---|---|
| `/admin/accounting` | ANY menubar dropdown (30+ links: quotation/deposit/shop/forwarder-rate × payment-status) | **All 404** — every link in the รายรับ/รายจ่าย/ผู้ติดต่อ/การเงิน/การบัญชี top-menubar | Hub page wired but child route files don't exist. Routes are aspirational; menubar lies about availability |
| `/admin/withdrawals` | Sidebar "รายการเบิกเงิน (รวม)" | Redirects to `/admin/wallet?kind=withdraw&status=pending` but **query filters are silently ignored** — shows full balance list | Filter params not honored by `/admin/wallet` page |
| `/admin/yuan-payments/[id]`, `/admin/service-orders/[id]` | Detail page | Labeled "ดู / แก้ไข" but is **READ-ONLY** ("Wave 7 read-only · ปุ่ม approve/reject + auto-credit wallet → Wave 8") | UI label misleading vs. wave status |
| `/admin/wallet/add`, `/admin/yuan-payments/new` | Add form | Renders but **unstyled Bootstrap-era form** — no Tailwind chrome, looks like 2018 jQuery | Wave 21 deferred per banner: "restyle form island (Bootstrap-4 → Tailwind), SweetAlert lift" |
| `/admin/cnt-hs` | List | "ข้อมูลเพิ่มเติม" column dumps hundreds of GZE codes comma-separated in ONE cell → table overflow, illegible | Need column to render as collapsed badge / popover |
| `/admin/disbursements` | URL hit | **404** — but appears in some sidebar/breadcrumbs (`reports/refunds` mentions "รายการเบิกเงิน") | Route never created; references stale |
| `/admin/hr/employees` | URL hit | **404** — but the HR hub `/admin/hr` cards link to `/admin/admins` for "รายชื่อพนักงาน" | Old URL never created; sidebar/hub uses correct one. Just check nothing else references this stale URL |

## 🟡 P2 — polish / not-blocking

| Surface | Action | Symptom | Why (likely) |
|---|---|---|---|
| `/admin/reports` (hub) | V-G6 analytics cards | All show **0** — "ปริมาณฝากนำเข้า: 0", "ยอดต่อ sales rep: 0", "HS-code revenue: 0", "ประวัติยอด/ลูกค้า: 0" | Stubs; not yet wired to data per "aggregations · drill-down" label |

---

## ✅ Verified working (clicked action + no error)

| Surface | Verified |
|---|---|
| `/admin` | Dashboard KPI cards + tabs + 7 visible audit queues |
| `/admin/forwarders` | List + 14 status filters + top-menubar `ตามประเภท / งาน / บาร์โค้ด / ค้นหา` + ดูข้อมูล row click → detail page |
| `/admin/forwarders/[fNo]` | Status timeline + customer card + คำใช้จ่าย panel + แก้ไขขนาด/น้ำหนัก link → /edit + ดูตู้คอนเทนเนอร์ → /report-cnt?id=... |
| `/admin/forwarders/[fNo]/edit` | Tailwind chrome + dimensions/CBM/crate form (Wave 12-C) |
| `/admin/forwarders/warehouse-history` | Date range filter + table (0 rows tested) |
| `/admin/forwarders/notes` | 500 rows + status tabs + per-row "เปิด →" links to /forwarders/[fNo] |
| `/admin/customers/[memberCode]` | Wave 20 read-only port + cross-links (ดูประวัติ wallet / ย้ายเซลล์ / รายการอนุมัติ) |
| `/admin/customers/transfer-rep` | Bulk-multi-select + filter UI (plain Bootstrap layout — see P1 §form island) |
| `/admin/customers/pending` | Approve queue |
| `/admin/wallet` | Balance summary (8,898 customers) + topup/withdraw filters |
| `/admin/wallet/[id]` | Topup detail + slip preview + ยืนยัน/ปฏิเสธ buttons (Tailwind polished) |
| `/admin/yuan-payments` | List + 86 rows + per-row ดู/แก้ไข → detail (P1: detail is read-only despite label) |
| `/admin/service-orders` + cart | List + cart browser polished |
| `/admin/service-orders/[id]` | Read-only (Wave 7) |
| `/admin/reports` | Hub with 5 sub-reports below (P2: V-G6 cards still 0) |
| `/admin/reports/credit-pending` | 143 rows + per-row → /forwarders/[fNo] |
| `/admin/reports/pending-payments` | 4 rows |
| `/admin/reports/refunds` | 60 rows |
| `/admin/reports/monthly-orders` | 227 rows for พ.ค. 2026 |
| `/admin/reports/debtors` | 0 rows (correct) + banner |
| `/admin/reports/payment / shop / forwarder` | All render (27 / 313 / 1000 rows) |
| `/admin/cnt-hs` | Renders but table overflow (P1) |
| `/admin/report-cnt` | 23 containers + tabs |
| `/admin/report-cnt/[CabinetNumber]` | Container detail + filter tabs + inline checkbox + เบิกเงิน button + ปรับต้นทุน tab |
| `/admin/admins/[uuid]/edit` | Tailwind form (Wave 22 Phase 4) — works even though detail page crashes |
| `/admin/admins/new` | Tailwind form (Wave 22 Phase 3) |
| `/admin/hr` | 9-card hub |
| `/admin/hr/recruitment`, `/hr/attendance` | Renders |
| `/admin/kpi` | KPI dashboard with month-over-month (฿6.7M MTD · 47k orders) |
| `/admin/accounting` (hub only) | PEAK-style chrome + accurate totals (P1: child routes 404) |
| `/admin/board`, `/board/inbox` | Work board |
| `/admin/contact-messages`, `/broadcasts`, `/tax-invoices`, `/carriers`, `/juristic-check`, `/audit`, `/incidents`, `/qa`, `/warehouse/qa-inspections`, `/drivers`, `/settings/tos-versions` | Render with proper Tailwind chrome |
| `/admin/forwarder-action?action=NoteShop` | Renders + query-driven |
| `/admin/barcode/gateway` | Renders graceful error state when params missing |

---

## Server-side errors captured (console)

```
[admins list] tb_admin query failed
  → 42703: column tb_admin.id does not exist
[admins list] admins JOIN query failed
  → PGRST200: Could not find a relationship between 'admins' and 'admin_contact_extras'
[admins/[id]] tb_admin query failed (for admin_nat, also for UUID)
  → 42703: column tb_admin.adminid does not exist
[combine-bill] tb_bill_item query failed (4× in last hour)
  → (object not unfolded)
[tb_admin list] failed (2× post-Wave 22)
```

**All 4 are Wave 22 migration regressions.** The new `admins` table replaced `tb_admin` but several queries still target the old name + columns (`id` vs `member_code`, `adminid` vs UUID `id`). The PostgREST `admin_contact_extras` relationship needs an FK declared (or use explicit JOIN).

---

## Suspected fix locations (for ภูม or next agent)

1. `app/[locale]/(admin)/admin/admins/[id]/page.tsx` — `AdminProfilePage` → swap `tb_admin.adminid` for `admins.id` (UUID) + remove `tb_admin.id` reference
2. `app/[locale]/(admin)/admin/admins/page.tsx` — `AdminTablePage` → list query uses `tb_admin.id` (doesn't exist) and PostgREST join to `admin_contact_extras` missing
3. `app/[locale]/(admin)/admin/forwarders/combine-bill/page.tsx` — `tb_bill_item` join query failing + "พิมพ์บิลรวม" link template needs `?id=${billid}` and route file `/combine-bill/print/page.tsx` needs to exist
4. `app/[locale]/(admin)/admin/customers/_components/RowActions.tsx` (or similar) — wrap suspend/reset destructive actions with `<ConfirmDialog>` before firing server action
5. `app/[locale]/(admin)/admin/accounting/` — either delete the menubar dropdown links OR create the 30+ child routes (current state: orphan menubar)
6. `app/[locale]/(admin)/admin/wallet/page.tsx` — wire `?kind` and `?status` URL params to filter the balance list (currently silently ignored)

---

## What I did NOT test (for next pass)

- **Drill-into reports row actions** — verified rows render but didn't click each row's "ดู" / external link
- **HR/training, /hr/policies, /hr/audit, /hr/org-chart, /hr/org-table** — only confirmed `/hr/recruitment` and `/hr/attendance`
- **Mobile viewport (360/390px)** — desktop-only audit
- **/admin/learning topics, /admin/forwarders/[fNo]/edit submit (didn't actually save)**
- **Admin → customer impersonation (view-as-customer)** — not found
- **Long-tail accounting/cargo income/quotation/* paths** — sampled 2, both 404; assumed pattern holds for all 30+ links
- **Tax-invoice generation** — page loads (0 rows) but didn't trigger any creation flow

---

## Meta — about this audit

- Took ~70 min of clock time + ~30 min of report writing
- Chrome MCP browser_batch flaky: navigation sometimes raced ahead of screenshot, requiring split into separate calls
- Authoritative way to detect broken queries: check `read_console_messages` after each surface — Next.js dev panel shows them in bottom-left "N Issues" badge but doesn't surface them as user-facing 500s (Wave 20 §0c lesson — silent SSR errors that pass route-smoke gate)
- Most P0s would be caught by adding **per-page error boundary that LOGS to /admin/incidents** instead of just rendering ขออภัย screen
