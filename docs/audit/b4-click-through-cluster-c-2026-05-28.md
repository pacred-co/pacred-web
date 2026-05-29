# B-4 Click-through audit · Cluster C · Cargo Flow · 2026-05-28

> Static-analysis pass of the **REVENUE-PATH** admin cluster. Branch
> `claude/hopeful-almeida-359e44` @ `c4417ee4`. Checked migration 0115
> (batch 2a: `tb_cnt` + `tb_cnt_item` + `tb_check_forwarder` camelCase)
> + migration 0116 (ปอน's MOMO isolated tables) against ≈40 pages +
> 8 server-action files actually imported by those pages.

## §0 TL;DR
- **Pages audited:** 42 (every page on the brief + every server action they import)
- **P0 findings:** **2** (REVENUE-PATH bugs · will 42703 column-does-not-exist at request time)
- **P1 findings:** 1
- **P2 findings:** 1 (informational TODO comment)
- 🔴 **HIGHEST-IMPACT FINDING:** `/admin/qa/new-client-no-contact` will **500 on every page-load** because the `tb_users.select("userid,username,...")` uses lowercase column names but tb_users was renamed to camelCase (`userID`, `userName`, ...) in migration 0113 batch 1. ALL the new-customer-no-contact SLA queue is invisible. Sales team won't see any new-lead-no-followup alerts.
- 🟢 **ปอน's MOMO sync verdict: PASS.** Schema + isolation + RLS + auth gate + confirm dialog all clean. The 5 API routes only touch `momo_import_tracks` / `momo_container_closed` / `momo_sack_infos` / `momo_sync_logs`. No accidental writes to `tb_*` or `cargo_*`. Brief honored.

---

## §1 P0 findings · revenue-critical

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P0-1 | `app/[locale]/(admin)/admin/qa/new-client-no-contact/page.tsx:54-63` + `:68-73` | tb_users post-rename | `.select("userid,username,userlastname,usertel,useremail,userregistered,userlastlogin,useractive,adminidsale,usercompany")` AND `.or("userlastlogin.is.null,userlastlogin.lt.${loginCutoff}")` use lowercase column names. Migration 0113 renamed them to `userID`/`userName`/`userLastName`/`userTel`/`userEmail`/`userRegistered`/`userLastLogin`/`userActive`/`adminIDSale`/`userCompany`. The query will **42703**: PostgREST will reject the select list because those columns no longer exist. Adjacent filter calls already use camelCase (`.eq("userActive", "1")`, `.gt("userRegistered", ...)`) — so this is a half-migrated file. The render code (line 134 `u.userName`, `u.userLastName`) also expects camelCase, confirming the SELECT is the broken side. | Replace the select string with `"userID,userName,userLastName,userTel,userEmail,userRegistered,userLastLogin,userActive,adminIDSale,userCompany"` and rewrite both `.or()` filters to `"userLastLogin.is.null,userLastLogin.lt.${loginCutoff}"`. |
| P0-2 | `app/[locale]/(admin)/admin/service-orders/cart/add/page.tsx:38-41` | tb_admin post-rename | `.from("tb_admin").select("adminid").eq("adminemail", user.email)` — both `adminid` and `adminemail` were renamed to `adminID` + `adminEmail` in migration 0113 batch 1. The page will throw on every load because **every** admin who opens the cart-add form falls into this email lookup. The TypeScript generic `<{ adminid: string }>` confirms the file pre-dates the rename (sister file `service-orders/cart/page.tsx:136-139` is already fixed — uses `adminID` + `adminEmail`). | Change `.select("adminid")` → `.select("adminID")`, `.eq("adminemail", user.email)` → `.eq("adminEmail", user.email)`, `.maybeSingle<{ adminid: string }>()` → `.maybeSingle<{ adminID: string }>()`, and `data?.adminid` → `data?.adminID`. |

---

## §2 P1 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P1-1 | `actions/admin/forwarders.ts:540+` (`adminBulkUpdateForwarderTbStatus`) + `actions/admin/forwarders.ts:118-160` (single-row `adminUpdateForwarder`) + `actions/admin/forwarders-bulk.ts` | Missing audit trail | When admin changes a forwarder `fstatus` via the bulk toolbar, the bulk-cancel action, OR the single-row detail page, the row is updated and `admin_audit_log` records the call — but **no row is inserted into `tb_log_forwarder_status`**. Only `actions/admin/forwarder-check.ts` (the bulk-bill flow) writes the per-status audit row. Legacy PCS uses `tb_log_forwarder_status` as the canonical status-change ledger (used by `/admin/forwarders/[fNo]` history modal + dispute resolution). Pacred's `admin_audit_log` row exists but isn't joined to the per-forwarder history. **Result:** when a customer disputes "why did status go from 3→7?", the answer lives in a different table — and the order detail page can't show the per-row timeline because tb_log_forwarder_status has no Pacred-era rows. | Extract the existing `appendStatusLog()` helper from `forwarder-check.ts` into a shared file (e.g. `lib/forwarder/status-log.ts`), then call it from `forwarders.ts:adminBulkUpdateForwarderTbStatus` + `adminUpdateForwarder` + `forwarders-bulk.ts:bulkCancel` after each successful UPDATE that changes `fstatus`. The legacy `tb_log_forwarder_status` schema (per migration 0081) accepts `fid` + `fstatusold` + `fstatusnew` + `adminidchange` + `fdatechange`. |

---

## §3 P2 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P2-1 | `app/[locale]/(admin)/admin/forwarders/page.tsx:589` | TODO comment in production | `{ v: "6.1", l: STATUS_LABEL["6.1"]!, n: 0 },  // TODO: needs driver-item join` — the 6.1 tab count is hardcoded to 0 because the legacy logic needs a join into `tb_forwarder_driver_item.fdistatus=''`. Cosmetic — the tab still renders + filters, just shows "0" on the badge. | Either hide the tab when `n=0` (matches legacy "show pill only when > 0" pattern at `forwarders/page.tsx:372`), or implement the driver-item join and emit a real count. |

---

## §4 Pages with ZERO findings (clean — green list)

- `/admin/cnt-hs` (`page.tsx`, `cabinet-list-cell.tsx`) — clean. All tb_cnt camelCase columns used correctly. Search `.or()` quotes the camelCase identifiers ('"ID"::text.ilike...' on line 127) per `supabase-rls-patterns.md` learning.
- `/admin/cnt-hs/[id]` (`page.tsx`, `action-buttons.tsx`, `slip-upload-form.tsx`) — clean. tb_cnt/tb_cnt_item/tb_users all camelCase correct. Approve/reject have confirm dialogs.
- `/admin/report-cnt` (`page.tsx`, `cnt-list-table.tsx`, `cnt-payment-modal.tsx`) — clean. tb_cnt_item `fCabinetNumber` correct camelCase; tb_forwarder lowercase correct (batch 2b deferred).
- `/admin/report-cnt/[fNo]` (`page.tsx`, `container-detail-client.tsx`, `cost-rate-modal.tsx`, `cost-update-view.tsx`) — clean. tb_cnt_item `ID/cntID/fCabinetNumber`, tb_check_forwarder `fID/adminID`, tb_users `userID/userName/coID` all correct camelCase.
- `/admin/report-cnt/pay` — tombstone redirect (Wave 17). Fine.
- `/admin/forwarder-check` (`page.tsx`, `forwarder-check-table.tsx`) — clean. tb_check_forwarder `fID/adminID` correct.
- `/admin/forwarder-action` — clean. tb_header_order + tb_forwarder both legacy lowercase (correct).
- `/admin/forwarder-import-warehouse` — server-side redirect to `/forwarders/warehouse-history` (Wave 16). Fine.
- `/admin/forwarder-sales` — clean. Uses rebuilt `team_leaders` + `sales_commissions`.
- `/admin/forwarders` (`page.tsx`, `forwarders-table.tsx`, `bulk-actions-toolbar.tsx`, `search-bar.tsx`) — clean. tb_users select uses camelCase (`userID,userName,userLastName,userTel,coID,userComparison,userCompany,adminIDSale`). tb_forwarder + tb_corporate lowercase (NOT renamed). Bulk-status + bulk-cancel both have confirm. Bulk-driver-assign doesn't have confirm but isn't destructive (auto-expires on no-accept).
- `/admin/forwarders/[fNo]` (`page.tsx`) — clean. Rebuilt `forwarders` lookup + legacy `tb_forwarder` fallback. tb_users select uses correct camelCase.
- `/admin/forwarders/[fNo]/edit` — clean.
- `/admin/forwarders/bulk-search` — pure form host (no DB).
- `/admin/forwarders/combine-bill` (list + add + print) — clean. tb_bill + tb_bill_item legacy lowercase correct (NOT renamed). tb_users select camelCase correct.
- `/admin/forwarders/container-cost-check` — pure form host.
- `/admin/forwarders/new` — clean. tb_users + tb_co + tb_settings + tb_address + tb_address_main all correct.
- `/admin/forwarders/notes` — clean. tb_forwarder lowercase + tb_users camelCase correct.
- `/admin/forwarders/warehouse-history` — clean. tb_forwarder_import2 + tb_forwarder + tb_users all use correct casing for their respective batches.
- `/admin/service-orders` (`page.tsx`) — clean. tb_users `userID` correct.
- `/admin/service-orders/[hNo]` (`page.tsx`, `legacy-view.tsx`) — clean. tb_users camelCase + tb_header_order/tb_order lowercase both correct.
- `/admin/service-orders/cart` — clean (sister of cart/add — uses `adminID`/`adminEmail` correctly).
- `/admin/service-orders/notes` — clean. Rebuilt `service_orders`.
- `/admin/containers/[id]/hs` — clean. Rebuilt `containers` + `container_hs_lines` + `hs_codes`.
- `/admin/warehouse/bulletin` — UI-only.
- `/admin/warehouse/containers` — tombstone redirect to `/report-cnt`.
- `/admin/warehouse/qa-inspections` (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`) — uses `adminListQaInspections` action; no direct table access from page.
- `/admin/qa` (hub) — pure links.
- `/admin/qa/chn-shop-over-2d` — clean. tb_header_order + tb_users camelCase.
- `/admin/qa/chn-wh-over-2d` — clean. tb_forwarder + tb_users camelCase.
- `/admin/qa/credit-overdue` — clean. tb_forwarder + tb_users camelCase.
- `/admin/qa/order-over-10min` — clean. tb_header_order + tb_users camelCase.
- `/admin/qa/ownerless-goods` — clean. tb_forwarder only (lowercase correct).
- `/admin/qa/pay-fwd-over-2d` — clean.
- `/admin/qa/pay-shop-over-1d` — clean. tb_header_order + tb_users camelCase.
- `/admin/qa/prepare-overdue` — clean.
- `/admin/qa/transit-overdue` — clean. tb_forwarder + tb_users camelCase.
- `/admin/api-forwarder-cn` + `/api-forwarder-cn/manual` — clean. Hub + form host (no direct queries).
- `/admin/api-forwarder-momo` + `/api-forwarder-momo/manual` — clean (sister of api-forwarder-cn).
- **`/admin/api-forwarder-momo/sync` + `/sync/sync-client.tsx`** — ✅ **ปอน's NEW work · PASS.** Server page reads ONLY from `momo_import_tracks` / `momo_container_closed` / `momo_sack_infos` (3 latest-20 snapshots) — column list matches migration 0116 schema exactly. Client makes HTTP calls to `/api/admin/momo/{import-track,container-closed,sack-info,sync-preview,sync}` — those 5 routes (verified) write ONLY to `momo_*` tables (no `tb_*` / `cargo_*` writes anywhere). The destructive "Sync เข้าตาราง MOMO" button has a confirm dialog (`sync-client.tsx:131`). Auth gate (`_shared.ts:guardAdmin`) restricts to super/ops/warehouse/accounting and returns proper 401/403 instead of leaking errors. Brief 2026-05-28 §10 "ห้ามแก้ table เดิมเด็ดขาด" rule honored end-to-end.
- `/admin/api-sheets-ctt` + `/admin/api-sheets-mk` + `/admin/api-sheets-mx` + `/admin/api-sheets-sang` — clean. Share `loadCarrierManualPageData()` (lib/admin/carrier-manual-page-data.ts) which uses correct casing on every table (tb_co `coID/coName/coStatus`, tb_users `userID/userName/userLastName/userTel/coID`, tb_settings, tb_address, tb_address_main).
- `/admin/momo-lcl` — UI-only form host.
- `/admin/cargothai` — clean. tb_tmp_forwarder_cargothai + tb_tmp_forwarder_item_cargothai (legacy/not-renamed) used with lowercase columns.
- `/admin/driver-runs` — clean. Rebuilt `forwarder_driver`.
- `/admin/drivers` + `/admin/drivers/[id]` — clean. Rebuilt `forwarder_driver`.
- `/admin/drivers/work` — clean. Rebuilt `profiles` `.eq("id", ...)` + legacy `tb_forwarder_driver` + `tb_forwarder_driver_item` (lowercase correct, batch 2b deferred) + `tb_users.userID/userName/userLastName/userTel` (camelCase correct).
- `/admin/incidents` — clean. Rebuilt `platform_incidents`.

---

## §5 Pages NOT audited (out of brief or no .tsx file)

- `/admin/service-orders/notes` — listed in scope but only has `.from("service_orders")` (rebuilt schema, no legacy column risk).
- `/admin/warehouse/qa-inspections/{new,[id]}` — listed in scope; pages exist but delegate all DB work to `actions/admin/qa-inspections.ts`. Scanned the action — uses rebuilt `qa_inspections` schema (lowercase correct).

---

## §6 Cross-reference — what we explicitly DIDN'T flag (false-positive guard)

The following lowercase column references are **correct** on their respective tables (NOT in any rename batch — batch 2b deferred):

- `tb_forwarder.adminid` · `adminidcreator` · `adminidupdate` · `adminidkey` (forwarders/page.tsx, forwarders/[fNo]/page.tsx, warehouse-history/page.tsx, etc.)
- `tb_forwarder.userid` · `fstatus` · `fcabinetnumber` · `ftrackingchn` · `ftotalprice` · `ftransporttype` · `fdate` etc. — every page that reads tb_forwarder.
- `tb_forwarder_item.*` (forwarders/[fNo]/edit/page.tsx)
- `tb_forwarder_driver.*` + `tb_forwarder_driver_item.*` (drivers/work/page.tsx, drivers/page.tsx)
- `tb_forwarder_import2.*` (forwarder-check/page.tsx, report-cnt/[fNo]/page.tsx, warehouse-history/page.tsx)
- `tb_header_order.*` (service-orders/page.tsx, qa/*, forwarder-action/page.tsx)
- `tb_order.*` (service-orders/[hNo]/page.tsx)
- `tb_cart.*` (service-orders/cart/page.tsx)
- `tb_cnt_pay_idorco.*` + `tb_cnt_pay_trackingchn.*` (cnt-payment.ts, report-cnt/[fNo]/page.tsx)
- `tb_cost_container.*` (report-cnt-detail.ts)
- `tb_address.*` + `tb_address_main.*` + `tb_corporate.*` (forwarders/new/page.tsx, forwarders/page.tsx)
- `tb_bill.*` + `tb_bill_item.*` (forwarders/combine-bill/page.tsx)
- `tb_settings.*` (multiple)
- `tb_promotion.*` (forwarder-check/page.tsx)
- `tb_tmp_forwarder_*` (cargothai/page.tsx, momo-lcl)

The following uppercase column references are **correct** (batch 1 — applied 2026-05-26):

- `tb_users.userID/userName/userLastName/userTel/userEmail/userActive/userRegistered/userLastLogin/userCompany/userCredit/userComparison/userLineNotify/userLineID/userLineIDOA/coID/adminID/adminIDSale/userPicture` — every clean page.
- `tb_admin.adminID/adminEmail/adminStatusA/adminNickname` — service-orders/cart/page.tsx, forwarders-new.ts, combine-bill.ts, forwarders-edit.ts, cnt-payment.ts, etc.
- `tb_co.coID/coName/coStatus` — service-orders/cart/page.tsx, forwarders/new/page.tsx.

The following uppercase references are **correct** (batch 2a — applied 2026-05-27):

- `tb_cnt.ID/cntName/cntStatus/cntAmount/cntImagesSlip/cntFile/adminIDCreate/adminIDUpdate/dateUpdate/nameBlank/noBlank/nameAccount` — cnt-hs/page.tsx, cnt-hs/[id]/page.tsx, cnt-payment.ts, cnt-hs.ts.
- `tb_cnt_item.ID/cntID/fCabinetNumber` — cnt-hs/page.tsx, cnt-hs/[id]/page.tsx, report-cnt/page.tsx, report-cnt/[fNo]/page.tsx, cnt-payment.ts.
- `tb_check_forwarder.ID/fID/cfStatus/adminID` — forwarder-check/page.tsx, report-cnt/[fNo]/page.tsx, forwarder-check.ts, report-cnt-detail.ts.

---

## §7 Methodology notes (why this audit can be trusted)

1. Read migration `0113_align_pilot_users_admin_co.sql` + `0115_align_container_payment_tables.sql` + `0116_momo_isolated_tables.sql` in full to lock the column-rename inventory.
2. For every `.from("tb_*")` call across the 40 pages + their actions, cross-referenced the columns named in `.select(...)` + `.eq(...)` + `.in(...)` + `.or(...)` + `.update(...)` + `.insert(...)` against the rename map.
3. Verified MOMO sync's 5 API routes (`/api/admin/momo/*`) by greping for any `.from("tb_*")` or `.from("cargo_*")` — zero hits.
4. For the audit-log P1 finding, verified by greping `tb_log_forwarder_status` across `actions/admin/forwarders.ts` + `forwarders-bulk.ts` — zero hits (only `forwarder-check.ts` writes it).
5. Did NOT execute the app — this is pure static analysis. P0 bugs are guaranteed to repro on the first page-load that hits them; the rest is theory-of-impact + code-reading.
