# Big audit 2026-06-01 — Cluster 06: ADMIN / STAFF / HR / NOTIFY / CRM / MARKETING

**Author:** เดฟ-lane audit agent · **Scope:** RBAC/admin-user model · staff HR (attendance/leave/recruit/train) · org structure · in-app + SMS + LINE/FB notify · search/history analytics · surveys · marketing.
**Method:** prod row counts + column samples (Supabase REST, service-role) + legacy PHP (`member/pcs-admin/`) + Pacred `app/[locale]/(admin)/admin/*` + `actions/*`. Builds on `legacy-resweep-2026-05-31/_MASTER-FRESH.md` + `legacy-gap-2026-05-30/_MASTER.md`.

> **TL;DR headlines:**
> 1. **RBAC is split-brain & under-populated.** Legacy `tb_admin` = 13 real staff (camelCase, 45 cols incl. full HR record). Pacred `admins` = **3 rows**, `admin_contact_extras` = **0 rows**. The `/admin/admins` page JOINs admins⋈profiles⋈admin_contact_extras → only 3 of 13 staff are visible to the role layer. **The "13-admin recreate" owner-activation gap is real and still open.**
> 2. **LINE CRM is DOUBLE-INGESTED into two competing table families.** Live data (52 contacts / 212 msgs) sits in **`Podeng_*`** (ปอน's external CRM, NOT defined in any repo migration). This repo's own webhook (`app/api/webhooks/line/route.ts`, migration 0131) writes **`customers_line`/`line_messages`** which are **EMPTY (0 rows)**. `/admin/line-inbox` reads `Podeng_*`. → two webhooks, one dead.
> 3. **search-demand report reads the wrong table.** Pacred logs searches to `tb_search_history` (new schema, 31 rows). The search-demand report reads legacy `tb_history_key` (**EMPTY**, different schema). Report renders blank forever.

---

## 1. DATA INVENTORY (prod row counts as of 2026-06-01)

### 1a. Admin / RBAC

| Table | Rows | Purpose · key columns ("หัวข้อ") |
|---|---:|---|
| `tb_admin` ⚠️camelCase | **13** | **Legacy staff master = full employee record.** 45 cols: `adminID` (e.g. `admin_pop`), `adminPass` (79-char legacy hash), `adminName`/`adminLastName`/`adminNickname`, `adminEmail`, `adminTel`, `adminType` (1/2), `companyType`, `department`/`section`, `adminStatusA` (1=active), `adminStatusSale`, `salary`/`salaryType`, `nationalIDCard`, `nationalIDCardFile`/`copyHouseRegistrationFile`/`resumeFile`, `religion`/`nationality`/`maritalStat…`, `adminBirthday`, `startDate`/`endDate`, `adminLastLogin`, `adminDel`. This is HR + RBAC + payroll in one table. |
| `tb_tmp_profile_admin` | 16 | One-time tokens for admin profile-edit flows (`token` only). |
| `admins` (rebuilt) | **3** | Pacred RBAC: `profile_id` (FK→profiles), `role` (super/accounting/…), `is_active`, `granted_at`/`granted_by`. The live role gate (`requireAdmin()`). |
| `admin_contact_extras` (rebuilt) | **0** | Sidecar for the migrated 13 (company/employee_type/section/legacy_admin_id). **EMPTY** = bridge never populated. |
| `admin_audit_log` (rebuilt) | 87 | Admin action audit: `admin_id`, `action` (e.g. `incident.ignore`, `tb_organization_tell.add`), `target_type`/`target_id`, `payload`, `created_at`. **Live + working.** |
| `impersonation_sessions` (rebuilt) | 0 | "View-as-customer" session log. Unused. |

### 1b. Staff HR (legacy `tas_*` + rebuilt)

| Table | Rows | Purpose |
|---|---:|---|
| `tas_historydataold` | **0** | Legacy clock-in/out CSV import from fingerprint scanner. **Empty** (CSV not imported). |
| `tas_historydata_mobile` | 45 | Mobile GPS check-in: `adminid`, `date`/`time`, `latitude`/`longitude`, `note`, `status`. |
| `tas_holiday` | 18 | Company holidays: `holidayname`, `holidaydate`. |
| `tas_holiday_maid` | 0 | Maid/cleaner holiday calendar. Empty. |
| `tas_leave` | 1 | Leave requests: `type`, `startdate`/`enddate`, `duration`, `reason`, `filename`, `adminid`, `status` (1=รอ HR), `adminidceo`/`adminidhr` (approval chain). |
| `attendance_logs` (rebuilt) | 1 | Pacred-native daily attendance: `profile_id`, `work_date`, `clock_in`/`clock_out`, `expected_in/out`, `status`, `late_minutes`. **Orphan** — HR page repointed to legacy `tas_*`. |
| `leave_requests` (rebuilt) | 0 | Rebuilt twin of `tas_leave`. Orphan. |
| `job_postings` (rebuilt) | 3 | Pacred-native recruitment posts (slug/title/position_id/status/salary_range). **Orphan** — recruitment page reads legacy `tb_post_job`. |
| `tb_post_job` (legacy) | **1** | Legacy job postings: `jobtitle`, `amount`, `description`, `qualifications`, `welfarebenefit`, `workingtime`, `startdate`/`enddate`, `department`/`section`, `salary`. **Live** (recruitment page reads this). |
| `job_applicants` (rebuilt) | **0** | Pacred-native applicant tracking. **Live target** (recruitment detail reads it) but no rows = ATS unused. |
| `training_courses` (rebuilt) | 3 | Pacred-native training catalog (slug/title/category/duration/instructor/is_mandatory). |
| `training_enrollments` (rebuilt) | 0 | Enrollment tracking. Empty. |
| `reserve_meeting_room` (legacy) | 5 | Meeting-room bookings: `event`, `datemeet`, `start_date`/`end_date`. |
| `employee_audit_entries` (rebuilt) | 0 | Unused. |

### 1c. Org structure (rebuilt — Pacred-native, NOT legacy)

| Table | Rows | Purpose |
|---|---:|---|
| `org_branches` | 3 | Top-level departments (slug/name/director_profile_id/color_tone). |
| `org_sections` | 9 | Sections under branches (branch_id/manager_profile_id). |
| `org_positions` | 22 | Positions under sections (quota_employee/internship/partner). |
| `org_contacts` | 0 | Unused. |
| `org_assignments` | 0 | Who-sits-where (read by `/admin/hr/org-table`). **EMPTY** = org chart shows structure but no people. |
| `team_leaders` | 0 | Team-lead mapping. Empty. |

> Legacy stored department/section as **integer codes inside `tb_admin.department`/`.section`** + `organization-chart.php`. Pacred rebuilt a normalized `org_*` tree but **never wired the 13 staff into `org_assignments`** → org chart is a hollow skeleton.

### 1d. Notify — in-app, popup, SMS

| Table | Rows | Purpose |
|---|---:|---|
| `tb_notify` (legacy) | **11** | **Customer login-popup announcements.** `title`, `content` (image filename), `datestart`/`dateexp`, `url`, `adminid`. **LIVE** — broadcasts repointed here (M-1/FG-1 this session). |
| `tb_notify_read` (legacy) | **1174** | Popup read-receipts: `userid` + `popid`. **LIVE** (customer popup ack). |
| `tb_notify_wp` (legacy) | 1 | **Cross-DB WordPress popup** — legacy `notify.php` wrote here into a SEPARATE db `pcscafym_main`. Pacred uses `tb_notify` instead (divergence — see §3). |
| `tb_notify_sheet_ctt` (legacy) | 1 | Google-Sheet sync cursor for CTT partner (`numrow`). |
| `notifications` (rebuilt) | **17** | **Per-event in-app feed** (the bell at `/notifications`): `profile_id`, `category` (forwarder/…), `severity`, `title`/`body`, `link_href`, `reference_type`/`reference_id`, `delivered_line_at`/`delivered_email_at`. **LIVE** — distinct from popups; this is event notifications, not announcements. |
| `notification_reads` (rebuilt) | 0 | Read tracking for the feed. |
| `broadcasts` (rebuilt) | **0** | Rebuilt scheduled-broadcast engine. **ORPHANED** (create flow now writes `tb_notify`; cron `/api/cron/send-scheduled-broadcasts` dormant). |
| `tb_sms_hs` (legacy) | **34,684** | **SMS send log:** `date`, `msisdn`, `message`, `status` (1/2). **LIVE** — read by `/admin/reports/sms-usage`. |
| `tb_sms_statistic` / `tb_sms_statistic9` | 126 / 126 | Web-visit device/browser stats (`browser`, `getdevice`, `ip`, `userid`) — misnamed; these are analytics, not SMS. |

### 1e. CRM — LINE & Facebook (the omni-channel inbox)

| Table | Rows | Purpose · canonical? |
|---|---:|---|
| `Podeng_customers_line` | **52** | **LIVE LINE contact CRM.** line_user_id, display_name, picture, lead_source, assigned_agent_id, lead_quality, service_interest, msg counters, status. **NOT in any repo migration** (external ingest). |
| `Podeng_line_messages` | **212** | **LIVE** every inbound/outbound LINE msg (direction, message_type, text, file_url, agent_id, raw_json). |
| `Podeng_line_webhook_events` | 279 | Raw LINE webhook events (idempotency + replay). |
| `Podeng_line_lead_sources` | 3 | Per-source add-friend URLs (FB/etc → `lin.ee/…`). |
| `Podeng_fb_customers` | 1 | Facebook Messenger contacts (psid/page_id/lead_source_key/ad touchpoints). Scaffolded. |
| `Podeng_fb_messages` | 0 | FB message log. Empty (not wired). |
| `Podeng_fb_ad_touchpoints` | 0 | Click-to-Messenger ad attribution. Empty. |
| `Podeng_fb_lead_sources` | 5 | FB source taxonomy (facebook_ads/organic/…). |
| `Podeng_fb_webhook_events` | 1 | FB webhook raw. |
| `Podeng_meta_ads` | **0** | Meta ad metadata (for ROI). **Empty** = ad ROI not populated. |
| `Podeng_cs_agents` | 1 | CS/sales agent roster (agent_code/display_name/role). |
| `customers_line` (0131 rebuilt) | **0** | THIS repo's webhook target. **DEAD** (webhook writes here but inbox reads Podeng_). |
| `line_messages` (0131 rebuilt) | **0** | Same — dead twin. |

### 1f. Search / history / surveys / marketing

| Table | Rows | Purpose |
|---|---:|---|
| `tb_search_history` (rebuilt-ish) | **31** | Pacred china-search log: `user_id`, `query`, `source`, `result_count`, `created_at`. **Written by `actions/search.ts`.** |
| `tb_history_key` (legacy) | **0** | Legacy search-keyword log (`keyWord`, `type`, `apierror`). **EMPTY** — but the search-demand REPORT reads THIS. Mismatch. |
| `tb_history` (legacy) | 0 | Legacy generic history. Empty. |
| `tb_web_hs` (legacy) | 0 | Legacy web-visit log. Empty. |
| `tb_survey` (legacy) | 27 | Customer survey: sex/birthday/occupation/usedpcs/problems/promotion-wishlist. |
| `tb_survey202306` (legacy) | 34 | June-2023 survey snapshot (read by `report-pro-survey202306.php`). |
| `tb_youtude` (legacy) | **100** | YouTube video cache for the public site (title/videoid/urlcover/category). LIVE feed. |
| `tb_page_name` (legacy) | 469 | CMS blog/article titles. |
| `tb_pcs_logged` (legacy) | 26,896 | Page-access log (`pcs_logged`, `userid`, `path`). |
| `tb_organization_email` | 16 | Org email accounts (email/passemail/emailtype/note). **Live** (org-channels). |
| `tb_organization_line` | 5 | Org LINE accounts. |
| `tb_organization_tell` | 25 | Org phone numbers + equipment. **Live**. |
| `tb_organization_wechat` | 2 | Org WeChat accounts. |
| `tb_organization_domainname` | 7 | Owned domains + renewal dates. |
| `tb_org_*_ships` | 3/0/19/0 | Many-to-many: which admin owns which org-email/line/tell/wechat. |
| `momo_sync_logs` | 720 | MOMO partner sync log. |
| `cron_invocations` | 1881 | **LIVE** cron run log (cron_path/fired_at/duration_ms/status/result_summary). Excellent observability data. |
| `platform_incidents` | 77 | **LIVE** JS-error/incident tracker (fingerprint/kind/severity/route/stack). Read by `/admin/incidents`. |
| `contact_messages` (rebuilt) | 0 | Contact-form leads. Empty. |

---

## 2. REBUILT-TWIN / DEAD-WRITE MAP (canonical vs orphan)

| Concern | Legacy (faithful) | Rebuilt twin | Live? | Verdict |
|---|---|---|---|---|
| Staff/RBAC | `tb_admin` (13) | `admins`(3) + `admin_contact_extras`(0) | both partial | **SPLIT-BRAIN** — admins page reads rebuilt, but rebuilt has only 3 of 13. |
| Customer popup | `tb_notify`(11)/`tb_notify_read`(1174) | `broadcasts`(0)/`notifications`+`notification_reads` | **legacy** | broadcasts.ts **repointed to tb_notify** this session ✅. `broadcasts`/cron now ORPHANED. |
| Event feed | (none in legacy) | `notifications`(17) | **rebuilt** | Pacred-native bell feed — legitimately new, LIVE. |
| LINE CRM | (none — LINE Notify only) | `Podeng_*`(52/212) **vs** `customers_line`/`line_messages`(0/0) | **Podeng_** | **DOUBLE-INGEST** — repo webhook writes the dead `customers_line`; `Podeng_*` (external) holds real data + feeds inbox. |
| Attendance | `tas_*` | `attendance_logs`(1)/`leave_requests`(0) | **legacy** | HR repointed to `tas_*` ✅. Rebuilt twins orphaned. |
| Recruitment | `tb_post_job`(1) | `job_postings`(3) | **legacy** (post) + **rebuilt** (`job_applicants`) | hybrid — posts read legacy, applicants read rebuilt-empty. |
| Search log | `tb_history_key`(0) | `tb_search_history`(31) | **write→rebuilt, read→legacy** | **MISMATCH** — see §3 G-3. |
| Org channels | `tb_organization_*` | (none) | **legacy** | Faithful ✅ (org-channels.ts). |
| Org chart | `tb_admin.department/section` ints | `org_*`(branches/sections/positions) | **rebuilt** | Pacred normalized tree, but `org_assignments`=0 → no people placed. |

---

## 3. LEGACY GAPS (Pacred lacks / partial — cite legacy file)

### RBAC / admin
- **G-1 [P0] 13-admin recreate not done — RBAC under-populated.** `admins`=3, `admin_contact_extras`=0; legacy `tb_admin`=13 active staff (`admin_pop`/`admin_nat`/`admin_pond`/sales reps/devs). The `/admin/admins` JOIN (admins⋈profiles⋈admin_contact_extras) surfaces only 3. **Effect:** sales-rep assignment (P1-15), report rep-names, HR adminid all degrade. Owner-activation item #2 (ADR-0022). Legacy: `add-admin.php` + `include/pages/admin-table/{add,edit}.php` + `include/pages/admin/{checkAdminID,editAdmin,deleteAdmin,recoverAdmin}.php`. **Confirmed open** (prod counts).
- **G-2 [P1] No admin CRUD parity for the full 45-col HR record.** Pacred `/admin/admins/new` captures role + basic contact; legacy `admin-table/add.php` captures salary/salaryType/nationalIDCard + 3 doc uploads (ID card / house-reg / resume) / religion / nationality / marital status / start-end dates. The HR-grade fields have no Pacred input → can't onboard a real employee record.
- **G-3 [P1] Per-admin LINE-Notify token management dead.** Legacy `admin-table-linenotify.php` + `get-token-linenotify.php` + `line-notify.php` let each staffer bind a personal LINE Notify token for targeted pings. LINE Notify EOL'd Apr 2025; Pacred has the staff-GROUP push stub (`lib/notifications/staff-group.ts`) but **no per-admin** routing. (Lower priority — group push is the modern replacement.)

### Notify
- **G-4 [P1] Cross-DB WordPress popup divergence.** Legacy `notify.php` wrote popups into `tb_notify_wp` on a SEPARATE db `pcscafym_main` (the WordPress marketing site). Pacred writes `tb_notify` (the member db). **Intentional & better** (single DB) but means the **public WordPress site's popup is no longer driven by the admin** — if marketing still runs that WP site, its popups are now unmanaged. Flag for owner: is the WP popup channel retired?
- **G-5 [P2] Notify scheduling/expiry engine half-built.** `broadcasts` table + `/api/cron/send-scheduled-broadcasts` exist but are dormant after the repoint to `tb_notify` (which has datestart/dateexp but no scheduled-send cron). Future-dated announcements won't auto-publish.

### Search / analytics
- **G-6 [P0-ish] search-demand report is permanently blank.** `actions/search.ts` writes `tb_search_history` (schema: query/source/result_count, 31 rows). `actions/admin/reports-monitoring.ts` + `/admin/reports/search-demand` read `tb_history_key` (schema: keyWord/type/apierror, **0 rows**). The two halves never meet → the search-demand intelligence report shows nothing despite real searches happening. **Fix = point the report at `tb_search_history`** (or backfill the write to `tb_history_key`). NEW find.
- **G-7 [P2] SMS-credit balance probe is best-guess.** `report-api-sms.php` called `local-api.com/api/SMS/getCredit` (PCS's old vendor) to show remaining SMS credit + baht spent. Pacred `lib/sms/gateway.ts` notes the ThaiBulkSMS v2 balance endpoint is "TBD" → the sms-usage report shows send history but not live credit/spend. Wire ThaiBulkSMS balance API.
- **G-8 [P2] No survey admin.** `tb_survey`(27)/`tb_survey202306`(34) have data; legacy `report-pro-survey202306.php` rendered it. No Pacred survey report → customer-research data is dark.
- **G-9 [P2] Page-access analytics (`tb_pcs_logged` 26,896 rows) unused.** Rich funnel data with no Pacred reader; GA4 likely supersedes but the historical 26k rows are dark.

### HR / org
- **G-10 [P1] Attendance clock-in CSV import not built.** `tas_historydataold`=0; legacy `time-attendance-system/record-work-time` + fingerprint CSV import populate it. HR attendance page banners this as "ยังไม่เปิด". Real daily clock-in/out is therefore absent.
- **G-11 [P1] Org chart has no people.** `org_assignments`=0 → `/admin/hr/org-table` and org-chart render the branch/section/position skeleton but place zero staff. Legacy `organization-chart.php` rendered the real tree from `tb_admin.department/section`.
- **G-12 [P2] ATS unused.** `job_applicants`=0 — recruitment posts read legacy `tb_post_job` but no applicant ever captured; the public careers→apply funnel isn't wired to write `job_applicants`.
- **G-13 [P2] Salary/payroll module absent.** Legacy `salary-hs/` + `tb_admin.salary`/`salaryType`. No Pacred payroll surface.
- **G-14 [P2] Corporate-culture / business-plan / job-flowchart / ToS pages.** Legacy `corporateCulture/`, `businessPlan/`, `jobFlowchart/`, `termsOfServiceCargo/`, `training-regulations.php` — static-ish internal pages; Pacred has `/admin/hr/policies` + `training` partially covering. Low value.

### CRM
- **G-15 [P0 architecture] Dual LINE ingest — pick one.** `Podeng_*` (52/212, external ingest, feeds `/admin/line-inbox`) vs `customers_line`/`line_messages` (0/0, this repo's `app/api/webhooks/line/route.ts` migration 0131). Two webhook endpoints competing for the @pacred OA. **Risk:** the repo webhook (the one in Vercel) writes a dead table; the live data comes from ปอน's separate service. If both are subscribed to the same OA channel, message delivery is non-deterministic. **Must consolidate to ONE webhook + ONE table family.** NEW find.
- **G-16 [P1] FB Messenger CRM scaffolded but not wired.** `Podeng_fb_messages`=0, `Podeng_fb_webhook_events`=1, `Podeng_meta_ads`=0 — the FB half of the omni-channel inbox exists as tables but no live ingest. Click-to-Messenger ad attribution (`fb_ad_touchpoints`) dark.

---

## 4. MAX-POTENTIAL UPGRADES (ดึงศักยภาพสูงสุด)

> Tagged effort (S/M/L) × value (P0/P1/P2). The data already in prod makes several of these near-free.

### Quick wins (data already there)
- **U-1 [S·P0] Fix search-demand report → read `tb_search_history`.** 31 rows of real china-search queries (incl. Chinese-language) already logged. One-line table swap + schema map (query→keyWord, source→type) lights up demand intelligence: what products customers hunt, zero-result queries (sourcing gaps), per-customer search intent for sales follow-up. (Resolves G-6.)
- **U-2 [S·P1] Consolidate LINE ingest to one webhook/table.** Decide `Podeng_*` (has data + UI) as canonical; delete the dead `customers_line`/0131 webhook OR repoint inbox. Removes the non-deterministic-delivery risk (G-15). Then the inbox is trustworthy. (S if Podeng_ wins; M if migrating data.)
- **U-3 [S·P1] Run the 13-admin recreate + populate `admin_contact_extras` + `org_assignments`.** Unblocks sales-rep assignment, report rep-names, HR adminid, AND fills the org chart with real people in one pass (`scripts/staff-purge-analysis.mjs` exists). (Resolves G-1, G-11.)

### Omni-channel CRM (the big prize)
- **U-4 [L·P0] Unified omni-channel inbox (LINE + FB + in-app) with lead→customer linkage.** `Podeng_customers_line` already has `customer_code`/`phone`/`assigned_agent_id`/`lead_quality`/`service_interest` columns — wire them: auto-match a LINE contact to a `tb_users` (PR code) by phone, surface the customer's wallet/orders/forwarders INSIDE the chat, route by `Podeng_cs_agents`. One screen where sales sees the chat + the full Pacred account = fewer handovers (the owner's "ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover"). Fold FB (`Podeng_fb_*`) into the same inbox.
- **U-5 [M·P1] Lead-source ROI + ads attribution dashboard.** `Podeng_line_lead_sources` + `Podeng_fb_lead_sources` + `Podeng_meta_ads` + `Podeng_fb_ad_touchpoints` = the schema for "which ad → which LINE add → which order → how much revenue". Populate `Podeng_meta_ads` from the Meta Marketing API, join touchpoints→`Podeng_customers_line.customer_code`→`tb_forwarder`/`tb_payment` revenue → **cost-per-acquisition and ROAS per campaign**. Marketing currently flies blind on ad spend.
- **U-6 [M·P1] Lead-quality scoring + auto-assignment.** `lead_quality`/`service_interest` columns are unused. Score on message keywords (ฝากนำเข้า/ฝากสั่ง/ฝากโอน) + response latency, auto-assign hot leads to the right `cs_agent`, alert on cold leads going stale. Turns 52 contacts (growing) into a managed pipeline.

### RBAC / staff platform
- **U-7 [L·P1] RBAC overhaul — replace tb_admin's flat adminType (1/2) with the rebuilt `admins.role` granular model + a real permission matrix.** Legacy had only adminType + department-as-int gating; Pacred's `admins`/`org_*` + `proxy.ts` phase-gate is a better base. Build a per-route permission grid (the 14 STAFF roles in `docs/briefs/ops-roles.md`) once the 13 admins land. Adds `admin_audit_log` (already 87 rows, working) as the accountability layer.
- **U-8 [M·P2] HR self-service portal.** `tas_leave` (leave) + `tas_historydata_mobile` (GPS check-in) + `tas_holiday` already have data. Give staff a self-service: mobile GPS clock-in (already capturing lat/long), leave request with the CEO/HR approval chain (`adminidceo`/`adminidhr` columns exist), holiday calendar, payslip. Plus the fingerprint-CSV import (G-10) for office staff.
- **U-9 [S·P2] Wire the public careers funnel → `job_applicants`.** `job_postings`(3)/`tb_post_job`(1) + empty `job_applicants` — add an apply form on the public careers page that writes `job_applicants`, giving HR a real ATS pipeline.

### Notify / observability
- **U-10 [S·P1] Activate `LINE_STAFF_GROUP_ID` + the staff-group push.** Stub is wired (`lib/notifications/staff-group.ts`), fires on yuan/forwarder create. One env var (owner: add @pacred bot to the staff group, read groupId from webhook) → instant ops alerts return. (Owner-activation #1.)
- **U-11 [S·P1] Scheduled/expiring announcements.** `tb_notify` has datestart/dateexp; add a tiny cron to publish future-dated + auto-hide expired popups (resurrect the dormant `broadcasts` cron logic onto `tb_notify`). (Resolves G-5.)
- **U-12 [M·P2] SMS spend dashboard + ThaiBulkSMS balance.** `tb_sms_hs`=34,684 rows of send history. Wire the ThaiBulkSMS v2 balance endpoint (G-7) + aggregate send cost/day/type → a real telecom-spend KPI card; flag failed sends (status=2).
- **U-13 [S·P2] Incident + cron observability is GOLD — surface it.** `platform_incidents`(77) + `cron_invocations`(1881) are already capturing rich prod-health data with `result_summary` JSON. Build a single ops-health dashboard (cron success rate, MOMO sync drift, JS-error top-fingerprints, auto-commit failure trend — the momo-sync log already shows `auto_commit_failed:7`). Near-free given the data.
- **U-14 [M·P2] Search-demand → product-sourcing intelligence loop.** Once U-1 lands, zero-result searches (`result_count=0`) become a sourcing backlog — surface "top demanded products we can't find" to the buying team. The 管理員 query already in the data shows Chinese-language demand worth mining.

---

## 5. NOTES / CAVEATS
- `tb_admin` shows **13 rows**, not 45 — the "45" in the brief = column count (it's a 45-col HR table). Confirmed by sample.
- `admin_contact_extras`, `org_assignments`, `customers_line`, `line_messages`, `broadcasts`, `job_applicants`, `Podeng_meta_ads`, `Podeng_fb_messages` are all **0 rows** on prod — the recurring "rebuilt-empty twin" pattern from prior audits holds in this cluster.
- `Podeng_*` tables are NOT defined by any `supabase/migrations/*.sql` in this repo (grep returned nothing) — they're created/fed by ปอน's external CRM ingest (merged via commit `aada41ee`). Treat as an external dependency.
- Did NOT click-test any UI (analysis-only per brief). Findings are from prod row counts + column samples + source reads.
