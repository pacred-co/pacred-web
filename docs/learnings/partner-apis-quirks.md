# Learnings — partner API quirks

Topics: MOMO JMF (TH warehouse partner) · TAM (china-search interim) · ThaiBulkSMS (OTP) · LINE Messaging API + LIFF · PromptPay · DBD juristic lookup · RCGroup-TH · LINE Notify (EOL Mar 2025).

> Append-only. Newest entry on top. Each entry: date · symptom · root cause · what to do.

---

## 2026-06-04 evening · MOMO `user_code` is the LEGACY integer ID (`tb_users.ID`), NOT the string userID

**Symptom:** MOMO review-grid `/admin/api-forwarder-momo/review` shows rows
flagged "ไม่มี PR023 ในระบบ" + "ไม่มี PR99 ในระบบ" — but lookup-by-userID
returns nothing in `tb_users` for `PR023` / `PR99`, and the legacy SQL dump
also has no `PCS023` / `PCS99`.

**Root cause:** MOMO stores customers by `user_code` = **PCS legacy
`tb_users.ID` (integer PK) zero-padded to 3 digits**, NOT by `userID`
(the string display code like `PCS1395`, `PR1395`). Pacred's
`commit-momo-row-core.ts` naively wraps it as `PR${user_code}` which only
works when MOMO's customer happens to have a userID matching that pattern
(true for most accounts whose display code is e.g. `PR040` from autogen,
NOT true for migrated PCS customers whose display code is `PRxxxx`
arbitrary).

**Concrete cases found 2026-06-04:**
| MOMO `user_code` | Legacy `tb_users.ID` | Legacy `userID` | Pacred `userID` (after migrate) | Customer | Phone |
|---|---|---|---|---|---|
| `023` | 23 | `PCS1395` | `PR1395` | ฮูเซ็น | 0831915627 |
| `99`  | 99 | `PCS89`   | `PR089`  | ธนชัย ปานพรมมา | 0843369559 |

**Verified ผ่าน 3 paths:**
1. Legacy SQL dump (`/d/REALSHITDATAPCS/pcsc_main.sql`) at `tb_users` INSERT block (lines 1261140+) — `grep -oE "\(23, 'PCS[^']+'"` returns `(23, 'PCS1395'`
2. Pacred `tb_users` filtered by `userID='PR1395'` shows `ID=23` (the integer PK is preserved across migration)
3. Phone match on Pacred `tb_users.userTel='0831915627'` returns PR1395 (1 hit · 100% match)

**What to do:**
- **Default (recommended):** ไม่ต้องแตะ Pacred · เซลแจ้ง MOMO ฝั่งโน้นแก้ user_code ของลูกค้าให้ตรง Pacred userID — เพราะมีหลักฐานเพิ่มเติม (ดูเรื่องที่ 2 ด้านล่าง): MOMO operator กรอกผิดเอง ป้ายของจริงเขียน `PR025` ไม่ใช่ `023`
- **Fallback A:** Atomic rename `PR1395 → PR023` + `PR089 → PR099` ผ่าน `scripts/rename-userid-to-pr99.mjs` (ภูมเคยทำ 3 รายตอน 2026-05-30: PR9370→PR005, PR1282→PR032, PR1321→PR116) — ต้อง dry-run ก่อน apply เพราะแตะลูกค้าจริง + 9 FK tables
- **Fallback B:** Smart mapping ใน `lib/admin/commit-momo-row-core.ts` — ถ้า `PR${user_code}` ไม่เจอใน tb_users → ลอง `tb_users.id = Number(user_code)` → ใช้ userID ของแถวนั้น. หลีกเลี่ยง rename · เก็บ logic ใน code

**Cross-link:** `scripts/lookup-pr023-by-phone.mjs` + `scripts/lookup-pr023-final.mjs` (the 2-step diagnostic) · save-point `docs/research/poom-save-point-2026-06-04-evening.md`

---

## 2026-06-04 evening · MOMO `raw.images[]` is GROUND TRUTH — เปิดดูจริงก่อนเชื่อ field อื่นใน raw

**Symptom:** MOMO sync ส่ง `user_code="023"` มา · ระบบสรุปว่าลูกค้า PR023 (ไม่มีใน Pacred)

**Discovery:** ภูมไม่ trust field · เปิด `raw.images[0]` URL ใน browser →
รูปป้ายแปะกระสอบของจริงเขียนว่า **"PR025"** (ไม่ใช่ "023")

→ พิสูจน์ว่า **MOMO operator กรอก user_code ผิดเอง** (Pacred logic ถูก ·
ป้าย physical ถูก · แค่ data entry ที่ MOMO operator พลาด)

**What to do (workflow pattern):**
1. ทุก row ใน MOMO review ที่ flag "ไม่มี PR{xxx} ในระบบ" → เปิด `raw.images[0]` ดูป้ายจริงก่อน
2. ถ้าป้ายเขียน PR{yyy} ที่ตรงกับ Pacred → MOMO กรอกผิด · แจ้งเซลให้ MOMO อัพเดท user_code ของลูกค้านั้นในระบบ MOMO
3. ถ้าป้ายอ่านไม่ออก/ไม่มีรูป → fallback ไปดู `tb_users.ID` mapping (เรื่องด้านบน)

**Pacred UI support (commit `4751c411` + `691060cb`):**
- หน้า `/admin/api-forwarder-momo/review` มี column "รูปป้าย" แสดง thumbnail + quick-zoom lightbox
- Multi-image support (~5% rows มี > 1 รูป) · keyboard ← → · thumbnail strip
- → ภูมไม่ต้องเปิดแท็บใหม่ดู URL · คลิกในตารางได้เลย

**Bigger pattern:** **เมื่อ partner API ส่งทั้ง structured data + attachment image
มาด้วย → image คือ source of truth · field อื่นเป็น operator data entry ที่ผิดได้.** 
ใช้กับทุก partner ที่มี photo evidence (MOMO sack labels · upload receipts · OCR-ish use cases)

**Cross-link:** `app/[locale]/(admin)/admin/api-forwarder-momo/review/review-client.tsx` (`<ZoomLightbox>` component) · save-point 2026-06-04-evening

---

## 2026-06-01 · LINE staff-group push — the chat.line.biz URL id is NOT a pushable groupId

**Symptom.** `LINE_STAFF_GROUP_ID` was set to `C61f60d763a766e4f391812381281e3d9` (copied from the chat.line.biz
URL after adding @pacred to the staff group), but staff-notify never fired. `GET /v2/bot/group/<that id>/summary`
→ **HTTP 404 "Not found"** (also 404 on members/count). Pushing to it would silently fail.

**Root cause.** `chat.line.biz` is the **LINE OA Manager (Chat console)** UI. The `C…` id in its URL is the
console's internal **chat-thread id** — a DIFFERENT namespace from the Messaging API `source.groupId`. LINE has
no "list my groups" API on purpose — the real, pushable `groupId` only ever arrives inside a **webhook event**
(`join` / `memberJoined` / `message` → `event.source.groupId`). Both start with `C` but are NOT interchangeable.

**What to do.**
- Get the real groupId from a webhook event, not the URL. Verify any candidate with
  `GET /v2/bot/group/<id>/summary` → **200 + groupName = pushable**; 404 = wrong id.
- Member-count sanity: the LINE API count EXCLUDES the bot, so `(N shown in the LINE app) = API count + 1`
  (we saw API 14 → app "(15)"). A `memberJoined` event timestamp in UTC also cross-checks the join you saw (×+7 = ICT).
- **Reusable pattern (ต่อยอด > rebuild):** when a teammate already runs an inbound integration (here ปอน's
  Cloudflare Worker logging every event to Supabase `Podeng_line_webhook_events.raw_payload`), the fastest fix is
  to **READ their data**, not re-instrument. The real groupId was already sitting in their table. Map the partner's
  schema first (`Podeng_*` ≠ our unused 0131 `line_*`) before building anything.

**Flex push gotcha.** A malformed Flex message → LINE **400** → staff get NOTHING (worse than plain text). Always
push-test the exact Flex JSON to the group once (expect 200 + `sentMessages`) before shipping the code path.

**Env-on-Vercel gotcha.** Runtime env vars are snapshotted into a deployment at creation — changing
`LINE_STAFF_GROUP_ID` / `LINE_PUSH_BYPASS` in the Vercel UI does NOT affect the running prod until a **redeploy**.
And Vercel's API never returns `sensitive`-type values (only `encrypted`/`plain`) — you can read back a groupId/flag but not a secret key.

---

## 2026-05-27 · DBD lookup — Pacred has a working route handler; the client was bypassing it

**Symptom.** Every juristic signup landed in the "ระบบค้นหาไม่พร้อม — กรอกด้วยตนเอง" branch — customers always typed company info manually. d1-deep-audit-2026-05-24 listed this as Gap #5 "TAMIT (Thai ID) identity verification — none, DBD/RD stubbed but not equivalent."

**Root cause** — two-layer confusion:

1. **`regis-tam.php` is NOT about Thai ID verification.** Despite the name's resemblance to Pacred's TAMIT product-search vendor (`tamit-cloud.com`), the legacy `member/regis-tam.php` is the **Thai juristic-person (นิติบุคคล) 3-step signup**. Per `docs/sprints/archive-a-to-n.md:190`: "regis-tam.php | นิติบุคคลไทย — 3-step | tb_corporate | ✅ ครบ". Already shipped in Pacred as `/register` juristic tab + `actions/auth.ts registerJuristicStep1/saveJuristicStep2/uploadJuristicDoc/completeJuristicRegistration`.

2. **The client-side DBD lookup was hitting the retired endpoints.** `register-client.tsx fetchCompany()` called `opendata.dbd.go.th/api/v1/nameAndAddress` + `api/v1/juristicNameAll` directly from the browser. Per the 2026-05-17 entry below, those `api/v1/*` paths were retired (404 on every request) — but Pacred ALREADY had a working internal `app/api/dbd/[taxId]/route.ts` that hits the CURRENT CKAN 2.10 `datastore_search` endpoint with the WAF-bypass User-Agent + proper Thai-field-name encoding. The client just wasn't using it.

**What to do.** Always check `app/api/*` first before adding a new external-API call from the client. The internal route may already do the right thing — and a server-side fetch is the only place you can set the User-Agent / proxy headers a WAF needs.

**Code.** `app/[locale]/(auth)/register/register-client.tsx fetchCompany()` now calls `/api/dbd/${encodeURIComponent(id)}` — single endpoint, normalised response shape (`{ name, address, subdistrict, district, province, postcode }`), explicit status-code handling (404 = not_found, 502 = upstream down → unavailable). No more 4-way field-name juggling (`juristic_name_th` vs `JuristicNameTH` vs `name_th` vs `CompanyName`).

**Pattern rule.** When a partner API needs a User-Agent header, custom timeouts, or WAF-evasion tricks, do it server-side via a route handler. A `fetch()` from `"use client"` cannot set most WAF-relevant headers (the browser overrides them) and can never spoof a User-Agent — the WAF will always see the real browser UA.

**Anti-pattern caught.** d1-deep-audit-2026-05-24 Gap #5 was mislabelled "TAMIT (Thai ID) verification" because the legacy filename contains "tam". Future agents should NOT assume a partner-API integration is missing without first grepping `app/api/` for an existing internal route. Updated `dave.md` pickup #2 + `d1-deep-audit-2026-05-24.md` Gap #5 row + §1 + §2 + §4 Sprint 1 #4 to reflect ✅ DONE.

---

## 2026-05-26 · LINE Notify dead since 2025-03-31 — `notify-bot.line.me` is end-of-life

**Symptom:** Spawned a parallel agent to "port LINE Notify per-user OAuth" per the d1-deep-audit Gap #3. Agent built the UI page + callback route + actions. All gates green. **Then a screenshot from `notify-bot.line.me` showed "End of service for LINE Notify"** — the service ended March 31, 2025. The whole feature was built on top of a dead API. Reverted as commit `2e099721`.

**Root cause — TWO compounding failures:**

1. **The brief mentioned EOL but framed it as a question:** the role brief literally said *"LINE Notify EOL April 2025 — port per-user OAuth OR migrate to LINE Messaging API model?"*. The agent (and I, as integrator) scoped the work as "port" without verifying the OAuth endpoint was still alive. Treating "EOL by X" as a routine question rather than a hard gate cost a full agent run + integration cycle + a revert commit.

2. **No upstream alive-check before building integration code.** Pacred's other partner-API learnings (DBD, CKAN, MOMO JMF) all begin with a curl test or a manual probe. LINE Notify wasn't tested before the agent started — the OAuth flow was inferred from the legacy PHP source, which is from before the EOL announcement.

**What to do — for any external-API integration, run a 30-second alive-check FIRST:**

```bash
# Smoke the OAuth-issuance endpoint
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://notify-bot.line.me/oauth/authorize?scope=notify"
# Expected: 200/302 from a live service.
# Got 410 / a "service ended" HTML page → DEAD. Don't build.
```

If the brief contains any of these phrases, treat them as **hard gates** until the upstream is verified alive:
- "EOL by &lt;date&gt;"
- "deprecated"
- "sunset"
- "no longer supported"
- "we are regrettably discontinuing"

**Replacement path (LIFF + Messaging API):**
LINE itself directs developers to its **Messaging API** with a LINE Login channel + LIFF. Pacred already has both:
- Messaging API channel `2009931373` (`@pacred` OA)
- LINE Login channel `2010105778` + LIFF ID `2010105778-SaSkkGza`
- `profiles.line_user_id` + `line_linked_at` columns ready (migration `0003_profiles_extended.sql`)
- Unique index on `line_user_id` already in place
- `LINE_PUSH_BYPASS=true` env flag for dev safety

The replacement flow:
1. Customer adds Pacred LINE OA as friend (QR / `https://lin.ee/Yg3fU0I`)
2. Customer authenticates via LIFF — `/liff/link` page captures their `line_user_id`
3. Pacred sends notifications via `Messaging API pushMessage(to=line_user_id, ...)`

The Track 3 page + form code was a UI shell that could be adapted, but reverting was cleaner than salvaging — the OAuth half is fundamentally different.

**Cleanup left for the L pickup (next session):**
- `lib/notifications/line-notify.ts` — still talks to `notify-bot.line.me` (dead). Replace with `messaging-api.ts` or repurpose for Messaging API pushMessage.
- `app/api/linenotify/callback/route.ts` — leftover from earlier work, also dead. Delete or replace with `/liff/link` flow.
- Build `/liff/link` page that uses the LINE LIFF SDK.

**Cross-links:**
- Revert commit `2e099721` — Track 3 backed out
- Original Track 3 commit `350bf9be` — the dead-API integration (now reverted)
- [`docs/env.md`](../env.md) §7 — LIFF + Messaging API credentials already set
- [Migration `0003_profiles_extended.sql`](../../supabase/migrations/0003_profiles_extended.sql) — `line_user_id` column ready

---

## 2026-05-17 · DBD juristic-person lookup — both API paths dead/blocked

**Symptom:** Juristic registration's "auto-fill company name + address from tax ID" doesn't populate. T-D1 smoke gate found `/api/dbd/[taxId]` returns 502.

**Root cause — two separate DBD failures:**

1. **`opendata.dbd.go.th/api/v1/*` (used by the register page client-side)** — DBD **retired the entire `api/v1/` namespace**. `api/v1/nameAndAddress` + `api/v1/juristicNameAll` now return **404** for every request. From a browser they fail as `TypeError: Failed to fetch` (no CORS headers on the dead endpoint).

2. **`opendata.dbd.go.th/api/3/action/datastore_search` (CKAN — used by the `/api/dbd/[taxId]` server route)** — the CKAN base is *up* (a bare `?resource_id=...&limit=1` returns 200), but adding a `filters={...}` query param with the Thai field name (`เลขที่ประจำตัวเสียภาษีอากร`) trips an **Incapsula (Imperva) WAF**. The response is HTTP 200 with an HTML `"Request Rejected"` body (`_Incapsula_Resource` script). Our route does `res.json()` on the HTML → throws → catch → returns 502. The WAF will block Vercel's server IPs in production too.

**Net:** server-side DBD juristic lookup is **not reliably possible** right now. `api/v1` is gone; CKAN is WAF-walled against programmatic calls.

**What to do:**
- **Register flow already degrades gracefully** — juristic customers fill company name/address **manually**. Registration completes. Not a launch blocker.
- `app/[locale]/(auth)/register/page.tsx::fetchCompany` — any non-OK / thrown fetch → `sawApiError = true` → shows the honest **"⚠️ ระบบค้นหาข้อมูลบริษัทไม่พร้อมใช้งาน กรุณากรอกด้วยตนเอง"** (`unavailable`) state, NOT the misleading "❌ ไม่พบข้อมูล" (`notfound`, which implies the tax ID is invalid). Fixed 2026-05-17 — `notfound` is now reserved for a genuine 200-with-empty-record.
- **`app/api/dbd/[taxId]/route.ts` is orphan code** — grep found ZERO consumers (the register page calls DBD client-side directly, not via this route). It's also WAF-blocked. Flag for post-launch cleanup (delete the route, or rebuild it against a working data source).
- **Post-launch:** if DBD auto-fill is worth restoring — options: (a) a paid TH juristic-data provider, (b) a headless-browser proxy that solves the Incapsula JS challenge (fragile), (c) check whether DBD published a new official API namespace. Track as a V2.1 nice-to-have, not revenue-critical.

**Test command to re-check DBD status later:**
```bash
# 404 = api/v1 still retired
curl -s -o /dev/null -w "%{http_code}\n" "https://opendata.dbd.go.th/api/v1/nameAndAddress?JuristicID=0105564077716"
# body containing _Incapsula = CKAN still WAF-blocked for programmatic calls
curl -s "https://opendata.dbd.go.th/api/3/action/datastore_search?resource_id=f092da60-5f9a-4ef4-813c-0b1395778a76&limit=1" | head -c 200
```

---

## [2026-05-30 evening] MOMO `container_no` ≠ cabinet — never write it to `tb_forwarder.fcabinetnumber`

**Context:** ภูม flagged `/admin/forwarders` showing cryptic "PR20260527-SEA02" / "MO20260523-SEA01" values where staff + customers expect a real cabinet like "GZS260525-2" / "GZE260516-1". The values were written by the MOMO → tb_forwarder propagation pipeline (`lib/integrations/momo-isolated/propagate.ts`) during Wave 30.6 (#230).

**Symptom / question:** Cabinet column on `/admin/forwarders` shows MOMO routing batch IDs (`PR20260527-SEA02`) instead of real PCS cabinets (`GZS260529-1`). Clicking the cabinet link goes to `/admin/report-cnt/PR20260527-SEA02` which 404s because nothing in our DB is keyed by that ID. ภูม:

> "หะ ทำไมเลขตู้ ขึ้น รอปิดตู้อะ ... ภูมิ ก็บอกไปแล้วไงว่าไอบรรทัดเนี้ย มันคือเลขตู้ที่ pacred ใช้จริง `cid: GZS260529-1` อันเนี้ย"

**Root cause — two layered traps:**

1. **MOMO's data model:** Their `/api/func/get/import_track` response has a `container_no` field that contains MOMO's **internal routing batch ID** (format `(PR|MO)YYYYMMDD-(SEA|EK)NN`), NOT the real container number. The REAL container/cabinet lives on `/api/func/get/container/closed/{range}` → `raw.cid` (format `GZ[ES]YYMMDD-N`). They share an ID only via `raw.track_details[].reTrack` = tracking number.

2. **Our propagation bug:** `lib/integrations/momo-isolated/propagate.ts` was filling `tb_forwarder.fcabinetnumber` with `m.containerNo` (routing batch) the moment any new tracking matched. Combined with the "forward-only safety" (never overwrite a non-empty cell), this LOCKED the wrong value in — the real cabinet from a later `container_closed` sync could never replace it.

**Fix / answer (commit `<TBD>`):**

1. Propagation now pre-loads the REAL cabinet per tracking from `momo_import_tracks.container_batch_no` (which sync.ts step 2.5 fills from `momo_container_closed.raw.cid`):
   ```ts
   const { data: cabinetRows } = await admin
     .from("momo_import_tracks")
     .select("momo_tracking_no, container_batch_no")
     .in("momo_tracking_no", trackings)
     .not("container_batch_no", "is", null);
   const realCabinetByTracking = new Map<string, string>();
   for (const r of cabinetRows ?? []) {
     if (r.momo_tracking_no && r.container_batch_no) {
       realCabinetByTracking.set(r.momo_tracking_no, r.container_batch_no);
     }
   }
   ```

2. Per-row cabinet write rule changed from "write `m.containerNo` if empty" → "write `realCabinet` if known and (empty OR currently a stale MOMO routing batch)":
   ```ts
   const MOMO_ROUTING_RX = /^(PR|MO)\d{8}-(SEA|EK)\d{2}$/;
   const current = f.fcabinetnumber?.trim() ?? "";
   const isEmpty = current === "";
   const isStaleRouting = MOMO_ROUTING_RX.test(current);
   if (realCabinet && realCabinet !== current && (isEmpty || isStaleRouting)) {
     updates.fcabinetnumber = realCabinet;
   }
   ```

3. Cron route accepts optional `?start=&end=` overrides (gated NODE_ENV !== production or valid CRON_SECRET Bearer) so ops can reseed wider windows after env outages without redeploy. Container closed *before* yesterday-window is now reachable manually.

4. One-off backfill `scripts/backfill-momo-cabinet.mjs` Step 5 propagates cabinet to `tb_forwarder` retroactively — fixes all rows that took the routing batch ID before this fix.

**Verification:**
- Re-ran sync + backfill 2026-05-30 evening:
  - SEA01 (`cid=GZS260525-2`): 1 row id=51981 ✅
  - SEA02 (`cid=GZS260529-1`): 5 rows id=51976-51980 ✅
- Pages: `/admin/forwarders` cabinet column → real `GZ*` cabinet · clickable link to `/admin/report-cnt/[cabinet]` works.
- Future cycle (mental walkthrough):
  - Empty + real cabinet known → fill it ✅
  - Empty + real cabinet UNKNOWN (container not closed yet) → skip (NULL stays) ✅ (no more routing-batch trap)
  - Stale routing batch + real cabinet known → replace ✅
  - Admin-set value (e.g. `GZE-MANUAL-001`) + real cabinet → skip (admin-set values never match `MOMO_ROUTING_RX`) ✅

**Why this matters next time:**

- Any time we propagate a partner's field to a customer-visible Pacred column, ASK: "is this the value our staff/customers actually use, or is it an internal partner ID?" MOMO's `container_no` looks like a cabinet (PR + date + dash + SEA + 2-digit) but isn't — they use `cid` for the real value. JMF / CargoCenter / SH / Sang may have similar splits.
- The "forward-only safety" pattern (never overwrite non-empty) is correct for IDEMPOTENT propagation but DEADLY when the first write is wrong. Pair it with a "replace stale" predicate (like `MOMO_ROUTING_RX`) so a follow-up sync can correct a bad initial value.
- Cron windows that are too narrow miss late-closing containers permanently. Either widen the window OR make it user-tunable via `?start=&end=` (as we did). Same fix likely applies to any other partner cron sync we have.
- When a UI mask (e.g. our "รอปิดตู้" amber chip) is being used to hide a stale value, that's a sign the underlying data model is wrong. Mask first to stop the bleed, fix root cause next.

**Cross-links:**
- [`lib/integrations/momo-isolated/propagate.ts`](../../lib/integrations/momo-isolated/propagate.ts) — the fixed propagation
- [`lib/integrations/momo-isolated/sync.ts`](../../lib/integrations/momo-isolated/sync.ts) — step 2.5 cabinet propagation (cid → container_batch_no)
- [`scripts/backfill-momo-cabinet.mjs`](../../scripts/backfill-momo-cabinet.mjs) — one-off retroactive fix
- [`app/api/cron/momo-sync/route.ts`](../../app/api/cron/momo-sync/route.ts) — manual reseed override
- [`app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx`](../../app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx) — UI mask for legacy stuck rows (now mostly defensive; backfill removed today's known instances)
- AGENTS.md §0c — verify-deep-flow rule (must trace propagation, not just observe symptom)

## [2026-06-29] MOMO closed-container harvest DROPPED weight/cbm + missed split trackings (warehouse couldn't bill)

**Context:** ภูม flag — ฝากนำเข้า MOMO sync มาแล้ว แต่ `tb_forwarder` ไม่มี **น้ำหนัก/คิว** (PR012 #52105 · tracking `1781683835`) ทั้งที่ MOMO ตู้ปิด `GZS260620-2` มี `515kg · 1.6267คิว` ครบ. พนักงานคิดราคา/วางบิลไม่ได้ (commit `64984394`).

**Symptom / question:** MOMO sync เข้าแล้ว แต่ weight/cbm ใน tb_forwarder = 0. ภูม ตั้งสมมติฐานถูก: "sync มาตอน MOMO ยังไม่มีข้อมูล → commit สร้าง row weight=0 → MOMO อัพเดตทีหลัง แต่ระบบเราไม่ re-pull."

**Root cause (TWO bugs in one harvest, `sync.ts` step 2.5):**
1. **Dropped metrics.** Each closed-container `track_details[]` entry = `{reTrack, kg, cbm, width, height, length}`. The harvest walked it for the **cabinet (cid) only** — it `.update()`-ed `container_batch_no` + status and **never copied `kg`/`cbm`** → committed `tb_forwarder` inherited `weight_kg=0/cbm=0` from the staging row.
2. **Split-tracking key mismatch.** MOMO splits one tracking into `"<base>-i/n"` parcels (`1781515241-1/3`, `-2/3`, `-3/3`), but the `momo_import_tracks` row is keyed by the **BASE** (`1781515241`). The harvest `.in("momo_tracking_no", reTracks)` matched the **suffixed** reTracks → never hit the base row → split trackings lost BOTH cabinet AND weight (`container_batch_no=null`, `weight_kg=0`).

**Fix (commit `64984394` · 3 parts):**
- **`aggregateTrackDetailMetrics`** (`lib/admin/momo-raw-helpers.ts` · pure · +11 test): `track_details[]` → `{tracking → {kg,cbm}}` emitting a key for BOTH the exact reTrack (own metric) AND the base (SUM across `-i/n` parcels). Strip suffix `/-\d+(\/\d+)?$/` so a legit hyphen like `CBX260620-SEA07` stays intact.
- **`sync.ts` harvest:** write `weight_kg`/`cbm` per tracking (only when MOMO carries them `>0` — never clobber).
- **`propagate.ts`:** fill `tb_forwarder.fweight/fvolume` from staging for ALREADY-committed rows — **fill-when-empty** (`!(fweight>0) && !(fvolume>0)`), so a staff edit / billed row is never overwritten (money-safe). New `metricWrites` counter.
- **Backfill:** `scripts/backfill-momo-track-metrics-2026-06-29.mjs` (dry-run→`--apply`) re-derives + fills committed rows. DEV: fixed 7 forwarders (52105=515kg · 52095=971kg [split SUM 554+338+79] · …). **เดฟ runs the same on prod.**

**Why this matters next time:** when a partner sends **aggregate-then-split** records (a closed container with per-parcel `track_details`), the join key on the parcel side is often the **base** tracking — match on the stripped base, and **SUM** the split parcels back to it. And when you harvest a field for one purpose (cabinet), check whether the SAME loop should also carry the adjacent money fields (weight/cbm) — a partial harvest is a silent zero downstream. The early-warning sign: a tb_forwarder row with a cabinet but `fweight=0`, or a split-tracking row with `container_batch_no=null`.

**Cross-links:** the [2026-05-30] cabinet-propagation entry above (same harvest, the cabinet half) · `lib/integrations/momo-isolated/{sync,propagate}.ts` · AGENTS.md §0e (verify the consumer's table — a synced row ≠ a complete row)
