# B-4 Click-through audit · Cluster A · Customer/Staff · 2026-05-28

Static-analysis pass per the "verify-deep-flow" learning + AGENTS.md §0c. Scanned ~30 pages + their imported server actions in the customer/admin/HR cluster on branch `claude/hopeful-almeida-359e44` (= main · HEAD `c4417ee4`).

## §0 TL;DR

- Pages audited: **30** (cluster A — customers/admins/hr/team-leaders/migration/juristic-check/contact-messages/csv-imports/learning)
- **P0 findings: 3** — `adminConvertToJuristic` uses `.eq("ID", profile_id)` on the `profiles` table at 3 locations. The action will throw a PostgREST error every call ("column profiles.ID does not exist") — every "เปลี่ยนเป็นนิติบุคคล" admin click currently fails. Same bug class as the prior `77799024` fix; the fix missed these 3 hits.
- **P1 findings: 18** — Missing `error` destructure on Supabase queries (15 instances · §0c violation · transient DB errors invisible) · 3 lowercase column names on renamed tables (`tb_users` + `tb_admin`) → silent zero rows on `customers/transfer-rep` page list + admin dropdown.
- **P2 findings: 4** — `window.confirm()` instead of PacredConfirmDialog on mutate actions · TODO/HACK markers.

**Highest-impact P0 to ship first:**
> `actions/admin/customers.ts` lines 193, 220, 244 — change `.eq("ID", d.profile_id)` to `.eq("id", d.profile_id)` (lowercase). Without this, /admin/customers/[id]/convert-to-juristic posts always error 500 (or worse, silently roll back account_type leaving the row in a half-state — line 244 is the rollback on corp insert failure).

## §1 P0 findings (definite runtime bugs — ship fixes ASAP)

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P0-1 | `actions/admin/customers.ts:193` | `.eq("ID", profile_id)` on `profiles` | `adminConvertToJuristic` "before" read. The `profiles` table column stays lowercase `id` (rebuilt-era table, NOT renamed in batch 1). PostgREST throws PGRST116 "column profiles.ID does not exist" → action returns false → admin sees "ไม่พบลูกค้านี้" on every click. | `.eq("id", d.profile_id)` |
| P0-2 | `actions/admin/customers.ts:220` | `.eq("ID", profile_id)` on `profiles` | Same bug — UPDATE step (flip `account_type`). If P0-1 was somehow bypassed, this would throw and the upsert below would never run. | `.eq("id", d.profile_id)` |
| P0-3 | `actions/admin/customers.ts:244` | `.eq("ID", profile_id)` on `profiles` | Same bug — the **rollback** branch when `corporate` upsert fails. Means even if P0-1 & P0-2 worked, a failed corp insert would attempt rollback which itself errors → row gets stuck mid-conversion with `account_type='juristic'` and NO corporate row, breaking the `guard_corporate_account_type` trigger for all future updates. | `.eq("id", d.profile_id)` |

**Why this slipped past lint/tsc:** TypeScript can't validate Supabase column names against schema — the generic `<{ ID: string; ... }>` on line 194 even matches the BUG. Lint catches missing `error` destructure but not bad column casing.

**Reachability:** Form posted from `/admin/customers/[id]/convert-to-juristic` → `ConvertToJuristicForm.submit()` → `adminConvertToJuristic({profile_id, ...})`. Anyone clicking the eye-icon row action on `/admin/customers` lands here. Form has a confirm checkbox + spinner, so the silent failure is high-visibility (toast shows error.message containing `"ID"` column-not-found) — but still a P0 bug on a customer-facing admin flow.

## §2 P1 findings (silent runtime bugs · data integrity · §0c violations)

### P1-A — Lowercase column names on tables renamed to camelCase

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P1-1 | `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx:49` | `.select("userid, username, userlastname, usertel, adminidsale")` on `tb_users` | Post-batch-1 columns are `userID, userName, userLastName, userTel, adminIDSale` (camelCase, double-quoted). PostgREST identifier resolution is case-sensitive when columns were created camelCase-quoted → these SELECTs throw PGRST204 "column tb_users.userid does not exist" → page shows error or empty list. | Change to `"userID, userName, userLastName, userTel, adminIDSale"` |
| P1-2 | `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx:65` | `.or("username.ilike...,userlastname.ilike...,usertel.ilike...")` on `tb_users` | Same problem — the `.or()` filter references lowercase columns that don't exist. Free-text search by name/phone returns error or empty. | Use `userName.ilike`, `userLastName.ilike`, `userTel.ilike` |
| P1-3 | `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx:78` | `.select("adminid, adminnickname, adminname, adminlastname, department, section")` on `tb_admin` | tb_admin columns now camelCase (`adminID, adminNickname, adminName, adminLastName`). The admin target dropdown will be empty or throw — Phase 3 of Wave 22 (the legacy 13 admins now live in `admins`+`admin_contact_extras`), but the page still queries `tb_admin` directly with lowercase columns. **Note:** The transfer-form.tsx client component types (`TbAdminLite`, `CustomerLite`) use the lowercase shape — even if the SELECT worked, the keys wouldn't match. **The whole page needs a Wave 22 rewrite** to use `admins`/`admin_contact_extras` (already done correctly in `actions/admin/admins.ts::listActiveTbAdmins`). | Stop-gap: change SELECT to camelCase AND remap client types. Real fix: swap to `admins JOIN admin_contact_extras` pattern from the `admins` list page. |

### P1-B — Missing `error` destructure (§0c violations)

These are `Promise.all([admin.from(...), ...])` patterns where the result `.error` is never inspected. A transient DB error (PgBouncer timeout · 503 · etc) silently collapses the row set to `[]` and the page renders an empty table — exactly the 2026-05-25 `/customers/PR10899` silent-404 case study.

| # | File:Line | Pattern | What's wrong |
|---|---|---|---|
| P1-4 | `app/[locale]/(admin)/admin/customers/transfer-bulk/page.tsx:101` | `const { data: customersRaw } = await q;` | No `error` destructure on customer list query. Page would silently show "0 customers" on a transient DB error instead of throwing. |
| P1-5 | `app/[locale]/(admin)/admin/customers/[id]/transfer-rep/page.tsx:23-29` | `Promise.all([...5 queries...])` destructured as `{ data: profile }`, `{ data: shopAgg }`, etc. — NO error on any | 5 parallel reads of profile + service_orders + forwarders + yuan_payments. Errors silently swallowed; on transient error, page shows zero stats + falls through to `notFound()` on line 62 if profile is empty (silent 404 instead of error boundary). |
| P1-6 | `app/[locale]/(admin)/admin/team-leaders/page.tsx:15` | `Promise.all([...])` destructured as `[{ data: leaders }, { data: groups }]` — NO error | Team leader list + customer_groups read. Transient error → silent empty list. |
| P1-7 | `app/[locale]/(admin)/admin/juristic-check/page.tsx:33` | `const { data: docs } = ... await admin.from("documents")` | Documents lookup for juristic verification. No error handling → admin sees "ไม่มีเอกสาร" on a transient error and might reject the customer thinking docs weren't uploaded. **Higher-stakes silent-fail than most.** |
| P1-8 | `app/[locale]/(admin)/admin/juristic-check/page.tsx:49` | `const { data: signed } = await admin.storage.createSignedUrl(...)` | Signed-URL generation. Single doc failure silently skipped (`continue` on line 52), but a wider storage outage silently drops ALL doc previews. Should at least log. |
| P1-9 | `app/[locale]/(admin)/admin/hr/attendance/page.tsx:71-84` | `Promise.all([adminsRes, contactsRes, attsRes, leavesRes])` — uses `.data` only | 4-query HR daily attendance dashboard. A failure in any silently shows partial data. |
| P1-10 | `app/[locale]/(admin)/admin/hr/attendance/leaves/page.tsx:59-75` | `Promise.all([leavesRes, adminsRes])` — uses `.data` only | Leave queue + admin candidates. Silent failure shows empty queue or empty employee dropdown. |
| P1-11 | `app/[locale]/(admin)/admin/hr/audit/page.tsx:59-68` | `Promise.all([entriesRes, adminsRes])` — uses `.data` only | Audit entries list + employee dropdown. |
| P1-12 | `app/[locale]/(admin)/admin/hr/training/page.tsx:56-64` | `Promise.all([coursesRes, enrollsRes, adminsRes])` — uses `.data` only | 3-query training dashboard. |
| P1-13 | `app/[locale]/(admin)/admin/hr/policies/page.tsx:41-45` | `Promise.all([policiesRes, acksRes, activeAdminsRes])` — uses `.data` only | Policy library + acknowledgments. |
| P1-14 | `app/[locale]/(admin)/admin/hr/recruitment/page.tsx:56-71` | `Promise.all([postingsRes, applicantsRes])` — uses `.data` only | Recruitment dashboard. |
| P1-15 | `app/[locale]/(admin)/admin/hr/recruitment/[id]/page.tsx:78-99` | `Promise.all([postingRes, applicantsRes])` — uses `.data` only. Line 101: `if (!postingRes.data) notFound();` — falls through to silent 404 on a transient DB error reading `postingRes`. | Same §0c "silent 404 on transient error" pattern as `/customers/PR10899` was. **Verify-deep-flow violation.** |
| P1-16 | `app/[locale]/(admin)/admin/hr/org-chart/page.tsx:74-82` | `Promise.all([branchesRes, sectionsRes, positionsRes, assignmentsRes])` — uses `.data` only | 4-query org tree. |
| P1-17 | `app/[locale]/(admin)/admin/hr/org-table/page.tsx:30-38` | `Promise.all([branchesRes, sectionsRes, positionsRes, assignmentsRes])` — uses `.data` only | Same as P1-16, table view. |
| P1-18 | `app/[locale]/(admin)/admin/csv-imports/page.tsx:36-45` | Has `error` destructure but does NOT throw — only logs. Then continues with `(data ?? [])`. | Inconsistent with §0c. If the page is the list landing, soft-degradation may be OK, but `csv-imports/[id]/page.tsx` does throw — be consistent. (Minor — flag as P1 only because the silent path can mask a wider issue.) |

## §3 P2 findings (polish — defer)

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P2-1 | `app/[locale]/(admin)/admin/customers/reset-pwd-button.tsx:48` | `window.confirm("รีเซ็ตรหัสผ่าน...")` | Native browser confirm dialog instead of `PacredConfirmDialog`. Already has TTL-protected reveal — relatively safe, but inconsistent with rest of admin chrome. | Swap to PacredConfirmDialog component |
| P2-2 | `app/[locale]/(admin)/admin/admins/admin-actions.tsx:71` | `confirm(isActive ? "ปิดสิทธิ์..." : "เปิดสิทธิ์...")` | Native confirm on `RowActions.toggle` — flips admin role on/off without proper dialog. | Swap to PacredConfirmDialog |
| P2-3 | `app/[locale]/(admin)/admin/team-leaders/row-actions.tsx:15-21` | `function toggle()` calls server action without ANY confirm | Toggling team-leader active status (which affects commission attribution) has NO confirmation — one accidental click toggles. | Add PacredConfirmDialog wrapper for the toggle |
| P2-4 | `actions/admin/customers.ts:103-114` (comments) | Comments reference `tb_users.userid` lowercase | Stale docs after batch-1 rename. Not a runtime bug, but if future devs read it they'll write more lowercase queries. | Fix doc strings to `userID` |

## §4 Pages with ZERO findings (clean — green list)

- `app/[locale]/(admin)/admin/customers/page.tsx` (list — proper error destructure on all 3 queries · uses correct camelCase columns)
- `app/[locale]/(admin)/admin/customers/[id]/page.tsx` (thin shell — delegates to legacy-view)
- `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx` (the §0c poster child — destructures error from EVERY query, throws on hard error, notFound only for missing user)
- `app/[locale]/(admin)/admin/customers/[id]/convert-to-juristic/page.tsx` (correct lowercase `eq("id", id)` on profiles)
- `app/[locale]/(admin)/admin/customers/[id]/convert-to-juristic/convert-to-juristic-form.tsx` (form client component — clean)
- `app/[locale]/(admin)/admin/customers/[id]/transfer-rep/transfer-rep-form.tsx` (form client component)
- `app/[locale]/(admin)/admin/customers/[id]/transfer-rep/rep-combobox.tsx` (combobox client component)
- `app/[locale]/(admin)/admin/customers/pending/page.tsx` (proper error handling)
- `app/[locale]/(admin)/admin/customers/pending/tb-bulk-bar.tsx` (client component)
- `app/[locale]/(admin)/admin/customers/recently-active/page.tsx` (proper error)
- `app/[locale]/(admin)/admin/customers/transfer-bulk/transfer-bulk-form.tsx` (client component)
- `app/[locale]/(admin)/admin/admins/page.tsx` (the Wave 22 poster — 3-query merge with full error+throw)
- `app/[locale]/(admin)/admin/admins/[id]/page.tsx` (Wave 23 P0 rewrite — full §0c discipline)
- `app/[locale]/(admin)/admin/admins/[id]/edit/page.tsx` (proper throw on action error)
- `app/[locale]/(admin)/admin/admins/new/page.tsx` (server stub — no DB calls)
- `app/[locale]/(admin)/admin/hr/page.tsx` (proper error destructure on both queries)
- `app/[locale]/(admin)/admin/hr/assets/page.tsx` (stub — no DB calls)
- `app/[locale]/(admin)/admin/hr/humanresource/page.tsx` (need to verify — no DB queries found via grep)
- `app/[locale]/(admin)/admin/migration/pcs-customers/page.tsx` (proper error · view-only)
- `app/[locale]/(admin)/admin/migration/pcs-customers/run-backfill-panel.tsx` (client component)
- `app/[locale]/(admin)/admin/juristic-check/juristic-actions.tsx` (client form)
- `app/[locale]/(admin)/admin/contact-messages/page.tsx` (proper error destructure)
- `app/[locale]/(admin)/admin/contact-messages/actions-cell.tsx` (client component)
- `app/[locale]/(admin)/admin/csv-imports/[id]/page.tsx` (proper error + throw)
- `app/[locale]/(admin)/admin/csv-imports/upload/page.tsx` (proper error on storage list)
- `app/[locale]/(admin)/admin/csv-imports/[id]/detail-actions.tsx` (client component)
- `app/[locale]/(admin)/admin/csv-imports/row-actions.tsx` (client component)
- `app/[locale]/(admin)/admin/learning/page.tsx` (no DB calls — placeholder hub)
- `app/[locale]/(admin)/admin/team-leaders/add-form.tsx` (client component)

## §5 Pages NOT yet audited (out of scope or unable to read)

- `app/[locale]/(admin)/admin/admins/[id]/admin-profile-client.tsx` (885 LOC — large legacy port client component; scanned for `.from()` calls only, no DB queries on client side anyway; deeper audit deferred — Wave 22 Phase 4 follow-up Agent N noted some sidecar actions still target legacy `tb_admin` and may have separate column-case bugs)
- `app/[locale]/(admin)/admin/customers/transfer-rep/transfer-form.tsx` — client component, types referenced in P1-3 finding (the `CustomerLite` + `TbAdminLite` types use lowercase keys which won't match the camelCase PostgREST response)

## §6 Bonus findings (outside Cluster A but spotted during scan)

These are NOT in scope but worth tracking as the same bug class:

- `app/[locale]/(admin)/admin/wallet/add/page.tsx:48-49,60-61` — lowercase `userid, username, userlastname, usertel, useremail` SELECT on `tb_users` (same as P1-1)
- `app/[locale]/(admin)/admin/service-orders/cart/add/page.tsx:38-40` — lowercase `adminid, adminemail` SELECT on `tb_admin` (same as P1-3)
- `app/[locale]/(admin)/admin/service-orders/cart/page.tsx:136` — `.from("tb_admin")` (needs check)
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx:106` — `const { data: row } = await q.maybeSingle();` — no error destructure (P1-class)
- `app/[locale]/(admin)/admin/notifications/dispatch/page.tsx:193` — `const { data, count } = await q;` — no error destructure (P1-class)

## §7 Recommended fix order

1. **Now (10 min):** Fix P0-1/2/3 — single sed-able change in `actions/admin/customers.ts`. Three `.eq("ID", d.profile_id)` → `.eq("id", d.profile_id)`. While there, fix the stale generic `<{ ID: string; ... }>` on line 194 → `<{ id: string; ... }>` for typecheck honesty.
2. **Today (30 min):** Fix P1-1/2/3 — `customers/transfer-rep/page.tsx` whole page is broken (lowercase columns + lowercase types in `transfer-form.tsx`). Either patch SELECT + retype, or do the Wave 22 swap (recommended — use the `admins`+`admin_contact_extras` pattern that the `admins` list and `transfer-rep/[id]` per-customer page already use).
3. **This sprint (~2-3 hr):** P1-4..P1-17 — sweep §0c violations. Pattern is mechanical: `{ data: x } = await ...` → `{ data: x, error: xErr } = await ...; if (xErr) console.error(...);`. 14 instances across HR pages. Use a codemod-style script if possible (similar to the `pacred/no-bare-supabase-data-destructure` ESLint rule — check if that's running on these files).
4. **Polish (defer):** P2 — swap native `confirm()` to `PacredConfirmDialog` on the 3 destructive actions.

---

*Auditor: Claude · 2026-05-28 · static analysis only · runtime not exercised. ESLint rule `pacred/no-bare-supabase-data-destructure` exists but appears NOT applied to these files (or was bypassed); recommend a CI re-run after fixes.*
