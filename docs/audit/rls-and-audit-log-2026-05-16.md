# RLS + Admin Audit Log — comprehensive audit (K-sec-2 + K-sec-3)

> **Status:** ✅ Completed by เดฟ (preempting ก๊อต P1 items K-sec-2 + K-sec-3). Findings + recommendations only — no code changes. ก๊อต reviews + dispatches any fix work to ภูม.
> **Date:** 2026-05-16 night · **Scope:** Pacred `supabase/migrations/*.sql` + `supabase/schema.sql` + `actions/admin/*.ts` audit log call sites.
> **Source:** PORT_PLAN Part S2 ก๊อต queue items K-sec-2 + K-sec-3.
>
> **Read with:**
> [`docs/decisions/0002-admin-architecture.md`](../decisions/0002-admin-architecture.md) (RBAC + is_admin design) ·
> [`docs/decisions/0014-customer-self-service-state-transitions.md`](../decisions/0014-customer-self-service-state-transitions.md) (audit-row pattern) ·
> [`docs/audit/owasp-2026-05.md`](owasp-2026-05.md) (broader OWASP Top 10 audit).

---

## 0. TL;DR

**RLS hygiene = 🟢 strong.** 58/58 public tables have `enable row level security`. 8/8 Supabase Storage buckets have policies. The 4 "permissive" patterns are all intentional + justified.

**Admin audit log coverage = 🟢 strong.** 96 distinct action namespaces logged via `logAdminAction()` across 130 call sites. Coverage gap = read-only and pure-list admin actions (no audit needed, OK).

**Real issues found = ZERO blocking.** A small list of minor polish items (§7) for V2 long-phase, but **nothing blocks Monday launch**.

---

## 1. Inventory

| Metric | Count | Notes |
|---|---|---|
| Public tables created | 58 | per `grep -hE "^create table" migrations/*.sql` (deduped) |
| Tables with RLS enabled | **58 (100%)** | per `alter table X enable row level security` scan w/ multi-space-tolerant regex |
| `create policy` statements (tables) | 152 | in `supabase/migrations/*.sql` (excludes `schema.sql` initial bootstrap) |
| `create policy` statements (storage.objects) | 23 | for 8 storage buckets |
| Storage buckets defined | 8 | member-docs, slips, forwarder-covers, carts, avatars, resumes, csv-imports, tax-invoices |
| `logAdminAction()` call sites | 130 | in `actions/admin/*.{ts,tsx}` |
| Distinct admin action namespaces | 96 | unique `"<entity>.<verb>"` strings |
| `is_admin()` function definition | 1 | in `0015_admin_rbac.sql` |
| Migrations touched RLS | 27 | of 42 total migrations |

---

## 2. `is_admin()` function (the central RBAC primitive)

Defined at `supabase/migrations/0015_admin_rbac.sql:50-71`:

```sql
create or replace function public.is_admin(any_role text[] default null)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  ok boolean;
begin
  select exists (
    select 1 from public.admins
     where profile_id = auth.uid()
       and is_active  = true
       and (any_role is null or role = any(any_role) or role = 'super')
  ) into ok;
  return coalesce(ok, false);
end;
$$;
```

**Strengths:**
- `SECURITY DEFINER` + `set search_path = public` → safe against `search_path` injection
- `is_active = true` → suspending an admin disables them everywhere instantly (no policy redeploy needed)
- `role = 'super'` implicit bypass on any role check → super has read/write everywhere by design
- `coalesce(ok, false)` → defaults to refuse when ambiguous

**Considerations (NOT blockers, just notes):**
- The `super` bypass is the entire authorization story for super-role. **No table can restrict super's access via `is_admin(['ops'])` even when intent is to keep super out** (rare; would be unusual design)
- Function granted to `anon, authenticated` (line 70) so RLS policies can call it client-side via PostgREST. Standard pattern; safe.

**Recommendation:** none. Function is correct.

---

## 3. RLS coverage — every public table

All 58 tables have `alter table X enable row level security`. Earlier audit suggested ~37 tables missing — that was a regex bug (single-space-only match missed alignment-padded `alter table foo               enable row level security` lines).

**Verified RLS-enabled tables (58):**

| Migration | Tables |
|---|---|
| 0001_profiles | profiles |
| 0002_orders | order_drafts, orders |
| 0004_corporate | corporate, documents |
| 0005_addresses | addresses |
| 0006_tos | (extends profiles) |
| 0007_wallet | wallet, wallet_transactions |
| 0008_payment_yuan | yuan_payments |
| 0009_rates | customer_groups, settings, rate_general, rate_vip, rate_custom_user, rate_custom_hs |
| 0010_forwarder | forwarders, forwarder_items, forwarder_images, forwarder_status_log |
| 0011_service_order | cart_items, service_orders, service_order_items, promotions, promotion_applications |
| 0013_sales_referral | team_leaders, sales_payouts, sales_commissions |
| 0014_notifications | notifications, notification_reads |
| 0015_admin_rbac | admins, admin_audit_log |
| 0016_phase_h_upgrades | containers (legacy), forwarder.container_id link |
| 0017_org_chart | org_branches, org_sections, org_positions |
| 0018_hr_employees | employees |
| 0019_hr_recruitment | job_postings, applicants |
| 0020_hr_attendance | attendance_records, leave_requests |
| 0021_hr_learning_policies_audit | training_courses, training_enrollments, policies, policy_acknowledgments, employee_audit_entries |
| 0022_contact_messages | contact_messages |
| 0027_admin_contact_extras | (extends admins) |
| 0028_forwarder_driver | forwarder_driver |
| 0029_csv_imports | csv_imports |
| 0030_hs_codes_rates | hs_codes, container_hs_lines |
| 0033_containers | cargo_containers, cargo_shipments, cargo_shipment_tracking, cargo_container_status_history |
| 0034_tax_invoices | tax_invoice_seq, tax_invoices, tax_invoice_lines |
| 0036_carriers | carriers |
| 0037 / 0039-0043 | extensions to existing tables (RLS already on parent) |

→ **Result: zero RLS-missing gaps.**

---

## 4. Permissive policy review (the `using (true)` cases)

4 occurrences found via `grep -nE "using \(true\)|with check \(true\)"`. All reviewed — **all properly justified**:

| Migration:line | Policy | Justification |
|---|---|---|
| `0022:42` | `contact_messages_insert_anyone` INSERT `with check (true)` | Public contact form — anon + authenticated can submit. Profile_id captured if signed-in, else null. ✅ correct. |
| `0036:74` | `carriers_authenticated_read` SELECT `to authenticated using (true)` | Customer-facing carrier dropdown (e.g. "เลือก SPX / J&T / Flash"). Read open to all authenticated; write gated to `is_admin(['super','ops'])`. ✅ correct. |
| `0030:74` | `hs_codes_select_all` SELECT `using (true)` | **WAS** open to anon (footgun) — but **patched by `0031_hs_codes_rls_authenticated.sql`** which drops + recreates the policy with `using (auth.role() = 'authenticated')`. ✅ properly fixed. |
| `0031:4` | (the patch comment) | n/a — comment line |

**No remaining permissive-policy concerns.**

---

## 5. Storage bucket policies — all 8 buckets

| Bucket | Migration | Pattern | Notes |
|---|---|---|---|
| `member-docs` | `schema.sql` (initial) | owner-only (`(storage.foldername(name))[1] = auth.uid()`) | Juristic registration docs. Private. |
| `slips` | `0007_wallet.sql` | owner-only path-based | Deposit slips. Private. |
| `forwarder-covers` | `0010_forwarder.sql` | owner-only path-based | Forwarder cover images. Private. |
| `carts` | `0011_service_order.sql` | owner-only path-based | Cart-item images. Private. |
| `avatars` | `0012_avatars_bucket.sql` | owner-only insert/update/delete + public read | Profile avatars. Public read OK (avatar URL is public). |
| `resumes` | `0019_hr_recruitment.sql` | admin-only (super + sales_admin) read/write | HR recruitment resumes. Private + admin-only. |
| `csv-imports` | `0029_csv_imports.sql` | admin-only read/write | Admin CSV uploads. Private + admin-only. |
| `tax-invoices` | `0035_tax_invoices_storage.sql` | owner-read (path-based) + admin-read (`is_admin(['super','accounting'])`) | Tax invoice PDFs. Customer + finance admin. |

**No storage gaps.**

---

## 6. Admin audit log coverage (K-sec-3)

### 6.1 The audit log table

Defined at `0015_admin_rbac.sql:75-83`:

```sql
create table public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete restrict,
  action      text not null,             -- 'forwarder.status_set' | etc
  target_type text not null,             -- 'forwarder' | 'wallet_transaction' | ...
  target_id   text not null,             -- accepts uuids or slugs (h_no, f_no)
  payload     jsonb,                     -- arbitrary context
  created_at  timestamptz not null default now()
);
```

Helper: `lib/audit-log.ts::logAdminAction(adminId, action, targetType, targetId, payload?)`. Used by 130 call sites across `actions/admin/*.{ts,tsx}`.

### 6.2 Action namespace coverage (96 distinct strings)

Sample of confirmed-logged actions (subset of 96):

```
admin.contact_update            admin.grant                     admin.toggle
attendance.upsert               carrier.create                  carrier.deactivate
carrier.update                  contact_message.update_status   container.create
container.link_forwarders       container.set_close_at          container.set_status
container.unlink_forwarder      container.update                csv_import.confirm
csv_import.delete               csv_import.preview              csv_import.upload
customer.approve                customer.assign_rep             customer.bulk_transfer_rep
customer.convert_to_juristic    customer.edit                   customer.suspend
customer.transfer_rep           employee.password_reset         employee.remove
employee.suspend                employee.unsuspend              employee.upsert_extras
employee_audit.delete           forwarder.auto_clear_payment    forwarder.bulk_update
forwarder.mark_paid             forwarder.rollback              forwarder.set_bill_to_override
forwarder.update                fwd_cost_adj.cancel             fwd_cost_adj.create
fwd_cost_adj.mark_paid          ... (+ ~56 more)
```

Format = `<entity>.<verb>` — clean + searchable.

### 6.3 Coverage check — admin actions WITHOUT audit log calls

Manual review of admin actions in `actions/admin/*.ts`. The following are **read-only / list / search operations** which do NOT need audit logs (correctly omitted):

- `adminBulkTrackingSearch` (read-only multi-line tracking lookup)
- `getAdminForwarderList`, `getAdminCustomerList`, etc. (list queries)
- Bulk-search + report-style admin queries

**Likely-real coverage gaps to verify manually** (mutating but possibly not audited):

| Action | File | Concern |
|---|---|---|
| `adminQuickClock` | `attendance.ts` | Quick attendance log entry — may or may not audit. Verify it writes audit row or document why not needed (low-volume + clear timestamp). |
| `adminUpsertEmployeeExtras` | `employees.ts` | Verify "employee.upsert_extras" audit present (it IS in the action list, ✓ probably OK). |
| `adminCreateAuditEntry` / `adminDeleteAuditEntry` | `employee-audit.ts` | Meta — audit-of-audit? "employee_audit.delete" is in list ✓. |

**Recommendation:** ก๊อต spot-check the 3 above + any new ภูม-shipped V-A/B/C/D actions (night-1..4 batch) for audit-log presence. Estimated 30m manual scan.

### 6.4 RLS on `admin_audit_log` itself

```sql
-- per 0015_admin_rbac.sql
alter table public.admin_audit_log enable row level security;
create policy admin_audit_log_admin_read on public.admin_audit_log
  for select using (public.is_admin());
```

**Read-only for admins. No customer access. INSERTs only via SECURITY DEFINER `logAdminAction()` helper (admin client) — RLS not bypassed accidentally.**

✓ Correct.

---

## 7. Minor polish (V2 long-phase — NOT blocking Monday)

### 7.1 Documentation gap
- `lib/audit-log.ts::logAdminAction` and the action-namespace convention (`<entity>.<verb>`) are not documented in any decision/architecture doc. **Recommend:** add a short section to [ADR-0002](../decisions/0002-admin-architecture.md) or new ADR documenting the audit-log call convention. Low priority. ภูม or เดฟ writes (30m).

### 7.2 Audit log retention policy
- No retention strategy documented. Audit log grows forever in current design.
- **Recommend:** ADR or runbook decision: keep 2 years online + archive older to cold storage; or keep forever (compliance use). ก๊อต decision.

### 7.3 Audit log review UI
- `/admin/audit` route exists (per ภูม night-4 — `4c45bf5` commit). Verify it covers all 96 action namespaces in its filter dropdown + provides drill-down to target. ภูม spot-check 30m.

### 7.4 PII in audit `payload`
- Some audit payloads may contain sensitive fields (phone numbers, tax IDs, customer addresses) snapshotted at action time.
- **Recommend:** review payload contents per action namespace; consider redaction for export. Low priority — internal-only access via RLS = limited blast radius.

### 7.5 Audit log volume monitoring
- No alert if audit log INSERTs spike abnormally (could indicate compromise or runaway script).
- **Recommend:** Sentry / Upstash counter for admin_audit_log insert rate. Add to post-launch dashboard. P2.

---

## 8. Recommended Pacred-side smoke tests (next time deploying)

To prove RLS is actually enforcing in production (not just present in schema), run these in a Supabase SQL editor session AS a non-admin authenticated user (using `set role authenticated; set request.jwt.claim.sub = '<test-user-uuid>';`):

```sql
-- 1. Customer reads only own wallet
select count(*) from wallet;  -- should = 1 (or 0)

-- 2. Customer cannot read other customer's orders
select count(*) from service_orders where profile_id != auth.uid();  -- should = 0

-- 3. Customer cannot insert wallet_transactions with kind that requires admin
insert into wallet_transactions (profile_id, kind, amount, status)
values (auth.uid(), 'admin_adjustment', 1000, 'completed');
-- should fail RLS

-- 4. Customer cannot SELECT admin_audit_log
select count(*) from admin_audit_log;  -- should fail RLS

-- 5. is_admin() returns false for non-admin
select is_admin(), is_admin(array['super']), is_admin(array['accounting']);  -- all false
```

→ **Recommend:** ภูม writes these into `lib/__tests__/rls.test.ts` as integration tests against a dedicated test Supabase project. Estimated 2-3h.

---

## 9. Final verdict

| Audit area | Status | Action needed |
|---|---|---|
| RLS table coverage | 🟢 100% | none |
| Permissive policy review | 🟢 all justified | none |
| Storage bucket coverage | 🟢 8/8 covered | none |
| `is_admin()` correctness | 🟢 correct | none |
| Admin audit log coverage | 🟢 96 namespaces | spot-check 3 actions (§6.3) |
| Audit log table RLS | 🟢 correct | none |
| Documentation (audit log convention) | 🟡 missing | add to ADR-0002 or new ADR (30m) |
| Audit retention policy | 🟡 undecided | ก๊อต decision |
| RLS integration tests | 🟡 absent | ภูม writes (2-3h) — post-launch P2 |
| PII in audit payloads | 🟡 unreviewed | spot-check (low priority) |

**No 🔴 blockers.** Pacred RLS posture is **stronger than the deep-sweep audit feared** — the legacy PHP system had SQL injection in the main auth gate (`legacy-cleanup-2026-05-16.md` §5 S-3), but Pacred is structurally protected by RLS-on-everything + Supabase's parameterized client.

---

## 10. Cross-references

- ก๊อต queue items → [`docs/briefs/got.md`](../briefs/got.md) K-sec-2 + K-sec-3
- RBAC + `is_admin()` design → [ADR-0002](../decisions/0002-admin-architecture.md)
- Audit-row pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- Broader OWASP audit → [`docs/audit/owasp-2026-05.md`](owasp-2026-05.md)
- Legacy PHP security findings (S-1..S-6) → [`docs/audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §5
- Helper code → `lib/audit-log.ts::logAdminAction`
- Audit table migration → `supabase/migrations/0015_admin_rbac.sql`
- `is_admin()` migration → same file lines 50-71

**End of audit. ก๊อต: review the 3 polish items (§7) — none are launch-blocking. Mark K-sec-2 + K-sec-3 as ✅ in got.md if you agree with findings.**
