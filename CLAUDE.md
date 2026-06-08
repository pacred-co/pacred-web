@AGENTS.md
@CLAUDE_TECHNICAL.md

---

# 🔭 2026-06-08 — เดฟ: full-scope gap analysis (cargo+freight) + customer reachability sweep + 2 builds · read FIRST

**branch `claude/beautiful-swartz-7cde53` off `dave-pacred`/`main` (`5f344b8f` · all branches 0/0 in-sync · nothing to integrate). 2 commits this session, gate-green, **NOT pushed** (customer-facing nav unverified-when-authed — owner skipped test-login). `pnpm verify`+`typecheck` EXIT 0. localhost :3000 live.** Owner gave the complete `olddata dev` data (cargo+freight · 3.8GB) + "ทำหมด" (do all: ใบกำกับ ฝากสั่ง/ฝากโอน + acquisition/CRM + reachability + freight + cargo-chat). Ran a **5-agent customer reachability audit** + a **4-agent full-scope gap analysis**. **🟢 Headline: platform ~90% built — gaps are last-mile wiring, not from-scratch.** Full file-level roadmap per stream + gates → **[`docs/research/full-scope-gap-2026-06-08.md`](docs/research/full-scope-gap-2026-06-08.md)** (read FIRST for what's next).

**SHIPPED (committed local, NOT pushed):**
1. **`9b80e07e` customer reachability (§0d):** audit = surface link-clean + legacy-complete (0 404 / 0 missing legacy fn / 0 §0e dead-write / 0 money bug). All orphans traced to the DEAD `components/sections/protected-sidebar.tsx` (live customer nav = `components/legacy/pcs-left-menu.tsx` — wire new customer features THERE). Wired 5 orphans + th/en i18n: `/service-import/receipts`+`/shipments` (import accordion) · `/refunds` (cash-wallet) · `/pay` (top-level) · `/my-issues` (user-pill).
2. **`c6ce6e73` sales→CS handoff (CEO §5):** `logLeadCall('closed')` → auto-assign CS (`pickLeastLoadedCsRep`→`tb_users.adminIDCS`, only if none) + เคลียร์/แอร์ bypass checkbox. Best-effort (never fails the call log).

**🟡 STAGED (spec'd in the gap doc · NOT built):** freight **RFQ leads-inbox** (`/admin/freight/leads` — THE missing link: public `freight_quote` leads land in DB+LINE but sales can't see/triage/convert; admin `/admin/freight/quotes` reads a DIFFERENT table `freight_quotes` · highest-value freight delta · ~1 day) · **ใบกำกับ ฝากสั่ง/ฝากโอน** (🔴 money/tax-critical — shop pref is a §0e dead-write, yuan has no selector; needs migration 0148 + accounting sign-off on ใบขน VAT base + a TEST-order money-loop test → WON'T auto-ship untested) · CRM depth (tag system · activity timeline · lead-kanban) · cargo small fixes (tracking-freshness · Lalamove field · จองรถ LINE block · missing-item report). **Next free migration = 0148.**

**🔴 NEEDS OWNER:** (a) **push the 2 commits** to dave-pacred→main? (auto-deploys prod · reachability nav is customer-facing + NOT authed-verified) OR give a **test customer login** (member_code+pw) so I §0c-verify authed flows + the tax-invoice money-loop · (b) **accounting sign-off** on ใบขน VAT base · (c) carryover: Supabase refresh-token-reuse-interval · Vercel env (TAMIT-2026·Sentry client DSN·FB — เดฟ HAS `VERCEL_TOKEN` now, can set on request) · staff photos · employee_code. **⚠️ CLAUDE.md >2000 lines — archive overdue (§12).**

---

# 📤 2026-06-07 — เดฟ: member polish + CSV-export ทั้ง platform + i18n leak-kill+guard + dashboard FOUC + full team-merge · read FIRST

**main = `dave-pacred` = `92f5f9ba`+ · pushed dave-pacred (→ main this session per owner "จบงานได้เลย") · `pnpm verify` + `pnpm build` EXIT 0 (REAL · every save-point) · migrations 0143–0147 ALL applied prod (verified live) · localhost :3000.** Owner-driven long run (many "ต่อเลย/ลุยเลย/ทำให้จบทีเดียว"). Everyone's work integrated; nothing lost. SHIPPED (each gated + pushed dave-pacred):

1. **🔀 Full team-merge** — ภูม (Poom-pacred: 13 commits CSV/report-cnt/avatar + docs) + ปอน (InwPond007: 6 commits **i18n EN sweep** + un-nest 198 namespaces). Conflicts (10 files = ปอน `t()` vs เดฟ bloat-className) **resolved keeping BOTH** (i18n content + compact className). Reviewed ภูม's merge → fixed **2 real bugs**: CSV **formula-injection** (HIGH · `=cmd` in customer name runs in Excel) + **avatar filename-vs-URL** broke /sales. Both branches now 0-behind dave-pacred.
2. **📤 CSV export — ครบทุก admin list (~72 surfaces)** — page "⬇ CSV หน้านี้" + "⬇ CSV ทั้งหมด" (drift-free export-all = page's exact filtered query unpaginated, cap 10k) + **migration 0147 `admin_export_log`** PII-export audit (applied prod). Coverage: 14 (ภูม) + 10 accounting + 11 QA + 7 freight/misc + 30 remaining. Shared `components/admin/csv-button.tsx` (formula-injection-safe + UTF-8 BOM) + `actions/admin/export/<dataset>.ts` per surface + `actions/admin/export-log.ts`. Only 3 non-lists skipped (dashboard · ad-hoc quote-tool · cargothai sync snapshot).
3. **🎨 Member content polish** — 66 pages compacted to the `/service-import/estimate` scale (owner's "กล่องไม่ยืด อยู่ในหน้าเดียว"): killed `text-4xl/5xl` · `p-8/10/12` · `shadow-lg/xl/2xl/custom` · `animate-pulse` · `rounded-3xl`. + **styled file-upload buttons** (`components/ui/styled-file-input.tsx`) replacing raw `<input type=file>` (member + 9 admin).
4. **🌐 i18n raw-key leak KILLED + GUARDED** (owner screenshot: sidebar showed `pcsAdminNav.wallet.title`) — ปอน's sweep wired `t()`/labelKey but never added entries → next-intl rendered the raw key (audit:i18n checks PARITY only, not key-existence). Fixed **61 keys**: pcsAdminNav 15 + shopOrderPayModal 14 + customerWhtUpload 24 (last 2 were DOUBLE-NESTED — un-nest pass missed them) + freightQuoteWizard 7 + notifications 1. NEW guard **`scripts/i18n-key-audit.mjs`** (wired into `audit:all`→`verify`) → 0 leaks + can't regress.
5. **🎠 Dashboard FOUC "บวม → ย่อ" FIXED** — the promo Slick carousel rendered all slides STACKED until client jQuery init collapsed them, every load. Standard Slick anti-FOUC in blocking `legacy-overrides.css` (`:not(.slick-initialized)` → show 1st slide only). Verified: pre-init 1 slide · CLS=0. Swept rest: no other jQuery-FOUC (slick=dashboard only · modals hidden · tam-counter intentional).

**🟢 STATE:** dave-pacred green · migrations all on prod · CSV/i18n/polish/FOUC done · this session pushed to **main** (owner "จบงานได้เลย"). **🔴 carryover (owner/external · unchanged):** Vercel env (TAMIT-2026 · Sentry DSN · FB tokens · **Supabase refresh-token-reuse-interval** = the random-logout durable fix) · employee_code numbers · staff photos · ใบขน VAT · freight cost-side. Learnings updated: `member-sidebar-contact-and-i18n-traps.md` · `nextjs-16-quirks.md` (Slick FOUC) · `parallel-agent-sprints.md` (workflow worktree-confusion + {schema} fragility).

---

# 🔧 2026-06-06 PM — เดฟ: 2 RED bugs + staff/login/warehouse + incidents→0 + กอต-PR038 + 💰 wallet-rework DESIGNED · read FIRST

**main = `dave-pacred` = `b46e8bd4`+ (this ADR doc) · all pushed to dave-pacred + main (+ Poom-pacred/InwPond007/podeng made equal) · `pnpm verify` + `pnpm build` EXIT 0 (REAL) · tree clean · localhost :3000 live (admin Tadsakorn-super tab).** Owner live-driven, big batch. SHIPPED (each gated + pushed):
1. **🟢 Realtime/stale-data RED bug FIXED** (`lib/cache/revalidate-chrome.ts` → 29 actions): unstable_cache badges (`pcs-chrome`·`admin-sidebar-counts`·`wallet-system-totals`) had 744 `revalidatePath`/0 `revalidateTag` → 60 s stale. Now bust on every mutation (Next-16 `revalidateTag(tag,{expire:0})`). **NEEDS owner live-confirm.**
2. **🟠 Random-logout RED bug = INFRA not code:** root-caused from auth-js source (getSession/getClaims-no-arg `_callRefreshToken` within 90 s margin, no autoRefreshToken gate → prefetch-concurrent rotation race · RSC can't persist rotated cookie). My code "fix" was a verified no-op → reverted. **DURABLE FIX = Supabase Dashboard → Auth → Sessions → "refresh token reuse interval" ~10 s (ก๊อต/owner).** Learning: `docs/learnings/supabase-auth-rotation-and-realtime.md`.
3. **register popup rep PHOTO** · **employee_code login DECOUPLED from email** (ป๊อป 690601/PR132 + Tadsakorn 690603/PR112 had no email → now phone-login) · **admin pw min 8→6** (123456 unblocked).
4. **🚚 Warehouse/driver staff LOADED** (the dump was inside `REALSHITDATAPCS.rar` — `bsdtar -xOf … pcsc_main.sql | sed` streams one table): dept3/sec6=warehouse (มาร์ค admin_alongkor·แหวน admin_saiu_4·เบียร์) + sec7=driver (ป๊อด·แมน·พุด) → loaded to prod tb_admin (adminPass preserved, adminStatus set 6/7) → login by legacy id+pass via `pcs-legacy-admin-bridge.ts`. Learning: `php-port-patterns.md`. ⚠️ not login-tested.
5. **/admin/incidents 98 → 0** (closed 95 transient/fixed + fixed 🚢 emoji-as-next/image + extracted calPriceForwarderSumCompany→`lib/forwarder/calc-company-total.ts` (4 copies→1) + deleted orphan WalletCounter).
6. **กอต → PR038** (owner "ยึด 038 · ล้าง 019"): PR038 = super + 690604 + admin_got identity (displays like peers); PR019 wiped to empty inactive slot. **Toey phone = 0992531415 set.**
7. **💰 BIG: wallet/payment rework DESIGNED (NOT built — money-critical):** ฝากสั่งซื้อ to pay by QR+slip (mirror forwarder), drop forced wallet-topup, wallet→optional cashback/discount. **`docs/decisions/0028-…md`** — ⚠️ found the trap: `tb_wallet_hs.type='2'`=CREDIT (approve `+=`) → naive shop-slip approve would ADD money. DO NOT ship until full money loop browser-tested on a TEST order ("ของานละเอียด").

**🔴 PENDING (owner):** Supabase refresh-token setting (bug 2) · set pw 123456 all staff + test logins (warehouse/driver/กอต 690604/เตย) · **the wallet rework = careful build + browser-test next (ADR-0028 ready).** CRM/quote-compare/cockpit/kpi = already built. **⚠️ CLAUDE.md >2000 lines → archive (§12).**

---

# 🔐 2026-06-06 AM — เดฟ: refund UI-verified LIVE + login-by-id + employee-code + staff photos + ภูม-merge · read FIRST

**main = `dave-pacred` = `ad848e17`+ (+ create-form employee_code) · all pushed · `pnpm verify` EXIT 0 + `pnpm build` EXIT 0 (REAL exit codes) · prod migrations 0143·**0144** APPLIED · tree clean (local `.claude/launch.json` autoPort:false kept for the preview server).** Live-driven with the owner — localhost preview on :3000 (admin Tadsakorn-super + customer PR321). This session:

1. **💸 /refunds — FULL UI LOOP VERIFIED LIVE** (เดฟ drove · owner watched · `c2332ed9`): customer picker showed #14734 → ส่งคำขอ → admin สร้าง RF-260606-0001 → อนุมัติ → **จ่ายเงินคืน** → `tb_wallet_hs #105479 type-5 +฿1` + PR321 wallet ฿-732.58→-731.58 (real balance moved) + paid_wallet_hs_id linkage → **cleaned up, residue 0, wallet restored exactly.** §0e dead-write trap CLOSED + UI-proven (the PM-2 repoint + fno→id fix confirmed correct end-to-end). No customer comms.
2. **🔑 Login flexible — พิมพ์ user-id ได้** (owner: "เกมเขา login ด้วย id กันทั้งนั้น" · `edf7f07a`): `actions/auth.ts` resolves a bare **`admin_xxx`** → `admin_xxx@pacred.co.th` (native email signin) + a bare **5-8 digit employee_code** → profiles.employee_code → email. Email/phone/PR-code + both legacy bridges UNTOUCHED (additive). Verified: admin_may→email + employee_code resolve + dup rejected (409).
3. **🆔 Employee code (รหัสพนักงาน · format YYMMNO e.g. 690601)** — migration **0144** (`profiles.employee_code` text + partial-unique · applied prod) + field on **/admin/admins/[id]/edit AND /new** + the login key (#2). Owner fills the running numbers ("ไล่ใส่เอง").
4. **📷 Staff photos** — the `public/images/Character_Icon/` files ARE the real photos → linked `avatar_url` for **admin_may/pee/ploy/win** (verified rendering live on /admin/admins). Toey/Visit (=admin_pop · no login-admin) left for owner.
5. **🔀 ภูม-merge** (`ad848e17`) — integrated origin/Poom-pacred `65c478c6` (forwarder edit/detail 8-step + `<FreightBreakdownTable>` · his lane) into main; **hand-resolved the only money-path conflict** (`service-order/[hNo]/page.tsx` — kept BOTH เดฟ's ship-by/address-edit block AND ภูม's `computeRawTotal` 2dp-precision display). InwPond007 already in.

**📋 ADMIN ACCESS LIST (15 · all super · active):** login id = **`admin_pond/got/win/nat/vam/web/jane/aom/may/pee/ploy/gring`** (= `admin_xxx@pacred.co.th` · pw 123456 · พิมพ์แค่ `admin_xxx` ก็ได้) · **PR009** (ภูม · poombaba1441@gmail.com) · **PR112** (Tadsakorn 📷) · **PR132** (วิสิฐ) — 3 ตัวท้าย = PR-code/เบอร์ (ไม่มี admin_xxx email).

**🔴 PENDING (owner):** ใส่เลข employee_code ต่อคน · ส่งรูปสตาฟจริงจากปอน (อีก 11 คนยังไม่มี · มีแค่ may/pee/ploy/win + Tadsakorn) · จะ provision admin_xxx short-login ให้ PR009/112/132 มั้ย · carryover (Vercel env TAMIT-2026/Sentry/FB · Lane A 16-col diff · Lane D LINE · ใบขน VAT). **⚠️ CLAUDE.md > 2000 บรรทัด → archive (§12).**

---

# 🧾 2026-06-05 PM-2 — เดฟ: 4-task batch (ต้นทุนตู้ public-CSV · migrations 0141/0142/0143 · /refunds §0e repoint) · read FIRST

**main = `dave-pacred` = `bd0cba61` · all pushed · `pnpm verify` EXIT 0 + `pnpm build` EXIT 0 (REAL exit codes) · Vercel auto-deploys main · prod migrations 0141·0142·0143 APPLIED+verified · tree clean.** Also merged **origin/InwPond007** (ปอน · `bd0cba61` · 1 file `lcl-price-cards.tsx` — Term-notes inline + Guangzhou LCL display prices · clean · gated). **🔵 HANDOFF → ภูม:** main พร้อมให้ดึง — `git fetch origin && git checkout Poom-pacred && git merge origin/main` (ภูม's own `65c478c6` forwarder batch ยังอยู่บน Poom-pacred · merge main เข้าไปได้งานผมครบ · ทิศทางถูก). Owner 4-task batch — all done:
1. **🚚 ต้นทุนตู้ ไอแต้ม Sheet → auto-sync INVISIBLE (`92677f2d`):** discovered the sheet is **public-CSV-readable** → `readSheetPublicCsv()` (docs.google export `?format=csv&gid=`, no auth, **adds no viewer = ไอแต้มไม่รู้ตัว**) is now the PRIMARY path in `container-cost-sheet-adapter` (service-account = fallback only). **Killed the ก๊อต `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` blocker entirely** (= task 4 "งานก๊อตทำมาเลย"). Verified end-to-end: cron populated prod cache **452 parcels / ฿326,969.47** (exact match).
2. **🗄 migrations 0141 + 0142 → prod (เอาขึ้นเลย):** `0141_customer_cs_assignment` (tb_users.adminIDCS + tb_admin.adminStatusCS) + `0142_container_cost_sheet_cache`. Both applied + verified (direct host · pooler tenant-fail expected).
3. **💸 /refunds §0e repoint (customer money · เลนผม · `f186005f`):** the refund money path wrote/read the **rebuilt 0-row twins** (wallet_transactions/forwarders/service_orders/yuan_payments) = reachable dead-write trap (admin mark-paid → green toast → **real wallet never moved**; customer source-picker showed 0 orders). Repointed end-to-end → live `tb_*`: credit = **tb_wallet_hs type='5' status='2' + tb_wallet.wallettotal++** (mirrors deposit-approve EXACTLY · compensate on flip-fail) · ceiling = Σ settled tb_wallet_hs DEBITS (fwd type4/reforder=id · order type2/reforder=hno · yuan type6/reforder=payment.id) · identity = profiles.member_code ← refund_requests.profile_id · customer picker+verify read tb_* via admin client. **Migration 0143** (APPLIED prod · additive/safe) = `refund_requests.paid_wallet_hs_id` bigint + widened paid CHECK (either linkage). **✅ VERIFIED on real prod data** (เดฟ ran it himself · `594b1c7a`) — **caught + fixed a real bug:** tb_forwarder has **NO `fno` column** (114 cols · keyed by integer `id`) → the first repoint guessed `fno` and would have thrown on EVERY forwarder refund; repointed all 6 forwarder spots → `id` (= the type-4 debit reforder · simpler). Proven on real rows: ceiling collected forwarder ฿330 (reforder=id) · order ฿176.54 (reforder=hno) · yuan ฿12,127.50 (reforder=payment.id) · type-5 credit insert accepts all NOT-NULL cols (then deleted, residue 0). tb_wallet increment = byte-identical to proven deposit-approve path. **No customer comms touched** (mark-paid = ledger + audit only). **✅✅ FULL UI LOOP VERIFIED LIVE (เดฟ + owner · localhost preview · admin Tadsakorn-super + customer PR321):** customer picker showed #14734 (was 0) → ส่งคำขอ wrote refund_request → admin สร้าง RF-260606-0001 → อนุมัติ (confirm dialog) → **จ่ายเงินคืน** (confirm dialog) wrote tb_wallet_hs #105479 type-5 +฿1.00 + PR321 wallet ฿-732.58→฿-731.58 (real balance moved) + refund_requests.paid_wallet_hs_id=105479 / tx_id=null → **ALL cleaned up, residue 0, wallet restored ฿-732.58 exactly.** §0e trap closed + UI-proven.

**🔴 STILL PENDING (carryover):** Lane A 16-col diff browser-test บนตู้ TEST · migration 0142 already applied (was carryover, now done) · Vercel env (TAMIT-2026 · Sentry · FB · 3 missing admins) · Lane D LINE env + คนขับ-link · ภูม interpreter-badge · accounting ใบขน VAT. **⚠️ CLAUDE.md > 2000 lines → archive old sections (§12).**

---

# 🔱 2026-06-05 PM — เดฟ: team-merge + 4-lane parallel build (ต้นทุนตู้ Sheet-sync · นิติ WHT · ค่าเทียบ/เครดิต/VIP · driver P1) · read FIRST

**main = `dave-pacred` = `2afa6496` · all pushed · `next build` EXIT 0 (REAL exit · `rm -rf .next` ก่อน · direct `node next build`) + `pnpm test:unit` 134/0 + `pnpm lint` 0-errors · clean tree.** Owner: *"แยกร่างแบ่งทำเลย แก้ให้จบจะส่งงานแล้ว เอาของน้องๆทุกคนมารวมอัพเดทก่อนรัน"* → (1) **integrate teammates FIRST** (`0a40e9af`): merged origin/Poom-pacred (17 · PDF CJK-font ใบแจ้งหนี้ · profile dual-write · cart-URL normalize · wallet 0.01 rounding · resolveLegacyAdminId varchar(20) overflow · MOMO history) + origin/InwPond007 (1 · LCL redesign) — **clean ทั้งคู่**. (2) **4 worktree agents ขนาน → รวม-serial + review money ด้วยมือ + build-รวม-ครั้งเดียว + push** (proven flat-Agent+worktree pattern · ไม่มี conflict ทั้ง 4):

- **🚚 Lane A — ปรับต้นทุนตู้จาก Google Sheet ของแสง + sync ต่อเนื่อง (MONEY · `99de74ec`):** `lib/integrations/google-sheets/container-cost-sheet-adapter.ts` = faithful port `check-sang-cost.php` + `report-cnt.php?action=cost-update` (cutCon · searchUserIDandTrackingCHN · A/D/E/H/X→1/2/3/5/4 · per-tracking SUM col O · strip "1,234" comma) reads sheet `13ufkMUoYG…` `main!A2:P`. **(a)** worklist `/admin/forwarders/container-cost-check` (จับคู่ ชื่อตู้ vs `fcabinetnumber` พบ/ไม่พบ) **(b)** 16-col Sheet-vs-PCS diff รายพัสดุ (ไฮไลต์แดง) บน `report-cnt/[fNo]` + action `adminApplyContainerCostFromSheet` เขียน **`fcosttotalprice` (owner-locked = live cost · เหมือน legacy `upCostSheet`)** · gate `["super","ops","accounting"]` · **lock ถ้าตู้จ่ายแล้ว** (tb_cnt_item) · **cabinet-guard** (fid ต้องอยู่ในตู้ กัน payload ปลอม) · before/after audit · confirm-gated **(c)** cron `/api/cron/sync-container-cost-sheet` `*/20 * * * *` → cache table (migration **0142** · RLS deny-all). **🔴 ACTIVATION:** ต้อง (1) `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` env (ก๊อต) (2) **apply migration 0142 to prod** — ก่อน 2 ข้อนี้ degrade graceful (banner "ยังไม่ตั้งค่า"). **⚠️ ยังไม่ click-test บน live (ไม่มี Sheets cred ใน worktree).**
- **🏛 Lane B — นิติบุคคล (MONEY/TAX · `dc859f67`):** **1% WHT ตอนสมัคร = legacy ถูกอยู่แล้ว** (derive จาก juristic flag · userCompany='1'+tb_corporate · **ไม่มี per-customer WHT flag ใน legacy** · gate ≥1000) → สกัด inline เป็น `legacyReceiptAmount()` ใน `lib/tax/wht.ts` + 12 tests กัน drift (auto-issue-receipt repoint · **ไม่มี money drift** · behavior เป๊ะ) · **PR047 ไม่มีชื่อ/เบอร์ fix ต้นเหตุ** (`saveJuristicStep2` hydrate `userName`←companyName guarded + list/card fallback `corporatename`+เบอร์) · **status label นิติกลับด้าน fix** (`'1'`=รอตรวจสอบ `'2'`=อนุมัติแล้ว `'3'`=ไม่ผ่าน ตรง `statusComp()`) · **เลือก/เปลี่ยนเซลล์ตอน approve** (`approveCustomer(id,{salesRepId})` validate active tb_admin · dialog+select · round-robin ยัง default · CS มีอยู่แล้ว).
- **📋 Lane C — list pages + VIP tier (`313b8475`):** `/admin/customers/comparison` (ค่าเทียบ tb_users userComparison='1' + แก้/ลบ/เพิ่ม) · `/admin/customers/credit` (เครดิต + คงเหลือ=วงเงิน−tb_credit.creditvalue · ลบถ้า outstanding=0) · `/admin/settings/vip-tiers` (สร้าง/แก้ชื่อ/ลบ tier tb_co + auto-seed 16+16 tb_rate_vip_* · กันลบ tier ที่มีคนใช้) · ใช้ action `users-pricing.ts` เดิม. **catch:** `tb_rate_vip_kg.rkg`/`rcbm` NOT NULL ไม่มี default ใน Postgres → seed `0` sentinel.
- **🛻 Lane D — driver P1 (`65eb188a`):** LINE แจ้งคนขับ + staff-group ตอน `createDriverBatch` (best-effort หลัง commit · `void` fire-and-forget · ใช้ `sendNotification`(driver `profiles.line_user_id`)+`notifyStaffGroup` แทน legacy `getTokenLineDriver`/`sendLine2`). photo→`fStatus='7'` **มีอยู่แล้ว Wave 26** (verified). **🔴 ACTIVATION:** คนขับ link LINE `/liff/link` + `LINE_STAFF_GROUP_ID` + `LINE_PUSH_BYPASS=false`.

**🔴 HANDOFF / activation (owner/ก๊อต):** Lane A = env `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` + **apply migration 0142 prod** + click-test 16-col diff บนตู้ TEST status 1-2 · Lane D = LINE env + คนขับ link · **admin_mind/admin_hear** = roster-link เป็น **data** (`adminIDUpdate` ประวัติ · ผูกบัญชีทีมจัดซื้อปัจจุบัน · ก๊อต/owner — ไม่ใช่บั๊ก/โค้ด). **⚠️ §0c:** Lane A/C ยังไม่ browser-click-test (gate=typecheck+lint+build เท่านั้น) — Lane A ต้อง cred, Lane C click-through dialog บน authed session. **⚠️ CLAUDE.md ทะลุ 2000 บรรทัด → archive sections เก่าด่วน (§12).**

---

# 🔎 2026-06-05 — เดฟ resume long-run: CUSTOMER-flow legacy-fidelity audit + 4 fixes · read FIRST

**main = `dave-pacred` = `89c7d789` · all pushed · `next build` EXIT 0 + `pnpm verify` EXIT 0 (gate-real-exit via direct `node next build` — NOT the flaky pnpm script-shell) · teammates 0/0 · clean tree.** Resumed the overnight (synced the 15 platform-tidy + ภูม-CRM commits). Ran a **3-agent CUSTOMER-flow legacy-fidelity audit** (vs legacy `…\Desktop\newrealdatapcs\pcscargo\member\*.php`) → fixed (each gated + pushed · เดฟ-lane · **NO collision** with ภูม-admin / ปอน-member-UI):
- **6 broken wallet-history order links → 404** (§0d · `/shops/detail/` `/forwarder/detail/` `/service-order/detail/` → real `/service-order/{hNo}` + `/service-import/{fNo}`) · **`createYuanPayment` → SLIP-ONLY** (removed dead `wallet_transactions` write · latent double-spend · §0e) · **ฝากโอน eligibility gate** (NEW `lib/payment/yuan-eligibility.ts` · both create actions · legacy `payment.php` L256-276 · closes deep-link bypass) · **delete-main-address parity** (refuse · legacy `deleteAddress.php`).
- **🔀 Customer-code SWAP `PR10683↔PR121` on prod (owner op · MOMO warehouse "121" collision · `685bb15a`):** พิสิฏฐ์ กุมมาลือ **PR10683→PR121** (his goods are recorded at the MOMO warehouse under "121") · นาย สนใจพาณิชย์ **PR121→PR045** (lowest CLEAN free gap). Tool `scripts/swap-userid-pr10683-pr121.mjs` **introspects `information_schema`** for every `userid`/`userID`/`member_code` col (16 tables · beyond ภูม's hardcoded 9) → ONE atomic txn (free PR121 everywhere, then reuse it). ⚠️ **landmine: a PR free in `tb_users` may be TAKEN in `profiles.member_code` (its own UNIQUE)** — first try PR015 hit `profiles_member_code_key` → ROLLBACK (zero harm) → the gap must be clean in BOTH registries + zero-rows in every swap table → PR045. PR10683 fully vacated; พิสิฏฐ์'s MOMO staging row now under PR121. Memory [`pending-pr10683-pr121-swap`] = DONE (the reusable precedent).
- **🛒 ฝากสั่งซื้อ — customer inline-edit carrier + delivery address (`89c7d789`):** the shop-order detail page rendered carrier + address READ-ONLY; legacy `shops.php` L1470-1551 lets the customer change both on a non-completed order. `actions/service-order-legacy.ts` (`updateLegacyShopOrderShipBy`/`...Address` → `tb_header_order` `hno+userid`) + 2 inline forms (`shop-order-edit-{ship-by,address}-form.tsx`) + shared `lib/legacy/customer-address-options.ts`. **§0b gate fix:** legacy gates `hStatus!=5` (NOT `≤2` as the audit draft said) + we also lock `'6'`; PCS pickup → payMethod=1 + warehouse address + address-edit refused. Mirrors the proven forwarder twin · typecheck+lint+verify+build EXIT 0 · 152 editable orders on prod. ⚠️ **NOT click-tested on a live authed order** (preview flaky) — change carrier + re-pick address on a status 1-4 TEST order.

**🚩 HANDOFFS — full tables in [`docs/research/customer-flow-fidelity-audit-2026-06-05.md`](docs/research/customer-flow-fidelity-audit-2026-06-05.md):** customer money loop is faithful (writes live `tb_*`, no create/cart/pay dead-writes). Open: **`/refunds` = Potemkin** (customer source-picker + `adminMarkRefundPaid` both on rebuilt-empty twins incl. dead `wallet_transactions` → inert/contact-team-fallback for all; cross-lane ภูม + owner: full-repoint vs contact-team-only) · **shop-order customer ship-by/address inline-edit ✅ DONE this run** (`89c7d789` · see the bullet above · ⚠️ not click-tested) · avatar→`tb_users.userPicture` mirror (filename-vs-URL) · slip-top-up at checkout · withdraw KYC (pwd+docs+gate) · address maps-pin. **Deferred verify:** ฝากสั่งซื้อ `/edit` admin per-shop board NOT browser-click-tested (build+verify+route-307 green; prior-session §0c). ⚠️ **CLAUDE.md = 1900+ lines → archive old sections soon (§12).**

---

# 🌆 2026-06-05 LATE-PM SAVE-POINT — read FIRST on home computer (ภูม สั่ง "save · ให้คอมที่บ้านทำงานต่อเนื่อง")

**Branch:** `Poom-pacred` (= HEAD this commit · pushed) · `main` / `dave-pacred` lanes unchanged (this is ภูม-lane work only). ภูม browser session at `/admin/forwarders/52017` was live-testing when he closed work.

**Resume:** `git fetch && git checkout Poom-pacred && git pull --no-edit` → read **[`docs/research/poom-save-point-2026-06-05-late-pm.md`](docs/research/poom-save-point-2026-06-05-late-pm.md)** FIRST (canonical resume · 9 sections: A-I work shipped · browser-test queue · report-cnt fix plan ภูม approved Option A).

**🚀 What landed (one combined save-point commit · 17 files · +1,400 / −650):**
- **A**·**B**·**C**·**D**·**E**·**F**·**G** = pre-compaction work (full-precision display · per-shop tracking inputs · fwarehousename "" fix · ใบเสร็จ 404 smart-route · `"use server"` array-export bomb fix · server-side fstatus auto-advance · PCS-faithful 1-card /admin/forwarders/[fNo]/edit form with 10 new fields)
- **H** (TODAY) = 8-step status pipeline · fstatus=6 split visually into "เตรียมส่ง" (no driver) vs "กำลังจัดส่ง" (driver dispatched · `tb_forwarder_driver_item.fdistatus=''`) per legacy `function.php` L1218-1233 · on /edit AND /detail
- **I** (TODAY) = NEW `<FreightBreakdownTable>` async server component · N per-item rows ¥ (from `tb_order`) + ¥ subtotal + ∑ ฿ legacy 16-col freight breakdown + WHT 1% for juristic ≥ ฿1000 · replaces old `<ForwarderItemsTable>` on /edit AND /detail

**Gates:** typecheck EXIT 0 · lint 0 errors / 138 warnings (pre-existing) · smoke /admin/forwarders/52017 + /edit = 307. ⚠️ NOT yet click-tested on prod (ภูม wants to verify at home).

**🟡 Browser-test ที่บ้าน (~10 min):**
1. /admin/forwarders/52017/edit — 8 pills + 3-item breakdown table + PCS edit form
2. /admin/forwarders/52017 (detail) — same 8 pills + same breakdown table · NO duplicate items table below
3. Pick fstatus=6 forwarder with driver → pill "กำลังจัดส่ง" highlights
4. Juristic order ≥ ฿1000 → WHT 1% column appears in ∑ row
5. Mobile 360px — 8 pills wrap to 2 rows cleanly

**🔴 ภูม approved next batch (Option A · 2-3h · report-cnt audit):**
1. **B1 backfill `tb_cnt_item`** — `tb_cnt` 970 rows have CSV in `cntName` but child `tb_cnt_item` is 0 rows → every cabinet shows "ยังไม่จ่าย" falsely · SQL backfill script (dry-run + `--apply` per AGENTS §11)
2. **B2 tab badge fix** — currently shows **8.8×** overcount (283 rows / 32 containers · 46,339 rows / 5,603 containers) · need RPC `count_distinct_cabinets` (next migration `0141`) + repoint 6 calls
3. **B5 wire bloat** — succeed-tab pulls 46k rows (~12-23MB JSON) per page-load · new RPC `get_container_summary` does SUM/GROUP_BY server-side · cuts wire 88×
4. B3 (air pill missing) + B4 (redundant pre-sort) = defer · cosmetic

**⚠️ Cleanup carry-over:**
- `app/[locale]/(admin)/admin/forwarders/[fNo]/forwarder-items-table.tsx` = ORPHAN after this batch (no callers in /admin/forwarders/*) — audit at home + delete in next batch if no other surface needs it.

> The เดฟ overnight Mac work below (member relabel + audits + tests + perf) is on **`dave-pacred`** lane = main, no collision with this Poom-pacred batch. Keep both contexts available — read this section first, then below for full project state.

---

# 🌙 2026-06-05 OVERNIGHT (Mac · เดฟ · owner asleep 02:00→08:00 ICT): platform-tidy — member relabel + customer+admin audits (CLEAN) + 13 test files + perf-investigate + learnings · read FIRST

**main = `dave-pacred` = `f0829c29`+ (+ this doc) · all pushed · `pnpm verify && pnpm build` → CHAIN=0 (REAL exit codes · every save-point) · both branches 0/0 · dev server on :3000 (nohup · serves `/Users/dev/pacred-web` · runtime app current; test-only commits not re-pulled — no runtime effect).** Autonomous "เก็บงานทั้ง platform ให้เรียบร้อย" run — **NO collision** with ภูม (admin `/admin/**` · `actions/admin/**` · `lib/admin/**`) or ปอน (member-frontend redesign · `components/sections|ui`); only shared backend / lib / tests / docs touched. Guardrails held: no customer comms · no bugs/data-loss · gate-real-exit · save-points.

**🚀 Shipped + pushed (each gated REAL-exit):**
- **🅼 Member sidebar + dashboard relabel (owner directive · `be49c398`+`97890d77`):** บริการฝากนำเข้า→**บริการนำเข้า** · NEW **บริการส่งออก** accordion (greyed coming-soon · เร็วๆนี้ · export routes not built → no 404) · บริการฝากชำระ/โอน→**บริการฝากชำระสินค้า** · dashboard cards: ฝากนำเข้าสินค้า→**นำเข้าสินค้า** · NEW **ส่งออกสินค้า** card (เทา coming-soon) · ฝากชำระเงิน→**ฝากชำระสินค้า** · **removed the กระเป๋าสตางค์เงินสด card** (KEPT in sidebar). Verified live in Chrome (PR321). กระเป๋าเงินสด data-fetch + dead vars also removed.
- **🧪 Test coverage +13 files / ~195 assertions (`70e90641`→`f0829c29`):** the revenue/eligibility/status/booking pure logic that had ZERO tests — `wallet-math` · `sales-commission/calc` · `forwarder/outstanding` · `cashback/note-tag` · `forwarder/reconfirm-gate` · `promo/catalog` · `cart/ship-by-eligibility` · `etax/build-xml` · `legacy-status-map` · `legacy-image` · `carrier/registry` · `thai-provinces` · `booking/service-config` (incl. a mapper↔config-drift integrity check). All green; no bugs surfaced (modules were already correct). Wired into `pnpm test:unit`.
- **🔎 Customer-surface audit = CLEAN:** §0c bare-Supabase-destructure = **0 platform-wide** (cart.ts §0c sweep this session was the last) · NO live dead-write traps (createDeposit/createWithdraw = dead tombstones; the live deposit flow = LegacyDepositForm→`submitLegacyWalletDeposit`→`tb_wallet_hs`).
- **🔎 ADMIN-surface §0e re-audit = CLEAN (handoff for ภูม · `docs/research/admin-deadwrite-reaudit-2026-06-05.md`):** **0 OPEN dead-write traps** remain (the 4 big-audit-flagged surfaces all fixed/neutralized). Deferred for ภูม (read-only, I did NOT touch admin code): delete 4 tombstoned dead-writer modules in cleanup · interpreter-badge reads empty `commissions` (wire `tb_withdraw_comm_interpreter_h`) · 6 `wallet_transactions` dead-twin READS in reconciliation/refund/freight flows (logic-brittleness · PEAK lane).
- **⚡ Perf investigated · NO blind changes (§0f #4 no-regression):** `/api/payment-due-count` already optimal (Promise.all + indexed head-counts; dev 1.6-3.6s ≠ prod) · the Supabase auth `Failed to fetch` ×87 was a **TRANSIENT stale-session burst** (self-cleared on a fresh dev restart — not a code bug) · real prod P95 = the now-live Sentry.
- **📚 Learnings + dev-server sync:** ci-and-deploy +1 ([2026-06-05] — the shared `:3000` dev server runs from the MAIN checkout not your worktree → edits invisible until push + `git -C <main> pull`; `setsid`≠macOS use `nohup … &`; stale `.next` after a big pull → kill + rm + restart; transient auth burst). Synced `/Users/dev/pacred-web` (was **38 commits behind** — owner had been reviewing a stale app) + restarted dev clean.

**🔴 PENDING (owner / team · no-collision items I deliberately did NOT touch):**
- **`deposit-form.tsx` orphan** (calls dead `createDeposit`→rebuilt empty table; the deposit page renders `LegacyDepositForm` instead) + `createDeposit`/`createWithdraw` dead tombstones → safe to delete when the rebuilt `wallet*` tables retire (ปอน UI + `actions/wallet.ts` · keep-one-sprint policy → flagged, not deleted).
- **Mobile launchpad "กระเป๋าพักเงิน" tile** — hide to match the desktop dashboard? (owner decision · ปอน lane · mobile already pairs นำเข้า/ส่งออก).
- Carryover: Vercel env (`PACRED_TAMIT_DETAIL_URL`-2026 · `THAIBULKSMS_FORCE` · FB tokens · 3 missing admins) · 🚢 Freight cost-side `tb_freight_rate_*` table + monthly FX + markup-tier (owner/accounting) · ภูม interpreter-badge · accounting ใบขน VAT sign-off.

---

# 💻 2026-06-04 PM — เดฟ WINDOWS SESSION CLOSE → Mac move: env-fix + ฝากสั่งซื้อ admin 1:1 + full-team merge · read FIRST

**main = `dave-pacred` = (this session-close commit) · all pushed · `next build` EXIT 0 + `pnpm verify` EXIT 0 (REAL exit codes — direct `node next build`, NOT via the flaky pnpm script-shell) · Vercel auto-deploys main.** Resume on Mac: `git fetch origin && git pull origin main` → read this. ⚠️ **Mac needs `.env.local` first** (prod keys don't travel — memory [`local-dev-env-and-legacy-path`] + the 2026-06-04-night section below). **Legacy source on THIS Windows box = `C:\Users\Admin\Desktop\newrealdatapcs\pcscargo\member{,\pcs-admin}`** (42 customer + 187 admin `.php` + `pcsc_main.sql` dumps · AGENTS.md §0a/§0b corrected this session; the big `REALSHITDATAPCS.rar` = 35GB full backup, not extracted); on Mac use the `/Users/dev/Desktop/...` path.

**🚀 Shipped + pushed this session (each gated REAL-exit · branch-integrate-loop):**
- **🔧 ENV reconciled** — local `.env.local` was stale DEV keys + placeholders (= the "กดค้าง/error เพียบ" bug) → rewritten to PROD (`yzljakczhwrpbxflnmco`) + owner's new tokens (TAMIT-2026 / LINE-login / LIFF / Vercel / Sentry / Cloudflare / MOMO / S3 / hCaptcha / CRON) · `OTP_BYPASS=true` (เดฟ directive · **ก๊อต handles OTP on prod, works** — `EMERGENCY_OTP_BYPASS` not needed; memory [`prod-env-debugging`]). DB pw confirmed `Jirayus40x.`. เดฟ now HAS a Vercel token (read prod env only; **no prod-env changes** made).
- **🛒 ฝากสั่งซื้อ admin 1:1 (headline · owner "admin flow ยังไม่ 1:1")** — deep-audited legacy `shops.php`(135K)+`detail.php`(59K)+`update.php`(72K) (2 read-only agents) → closed gaps: **per-shop board** (เลขออเดอร์ร้าน + tracking ราย ร้าน · status-aware = legacy update3/update4 · 3 ร้าน=3 บล็อก) + **¥ cPriceUpdate ต่อชิ้น** (update3 L85) + **auto-cancel ค้างจ่าย** (`lib/service-order/auto-expire.ts` · detail.php L73 · recoverable) + **เปลี่ยนที่อยู่จาก address book** (`adminUpdateOrderAddress` · กัน hShipBy=PCS). Wires the 4 orphan line-edit actions (§0d) · all `tb_*` · confirm-before-mutate (§0f). ⚠️ **ภูม built the per-shop board too (more faithful) → adopted ภูม's `ShopFieldsBoard`, dropped my dup panel** (legacy-first reconcile — learning [`feature-reconciliation`](docs/learnings/feature-reconciliation.md)).
- **🔀 Full-team merge (origin/Poom-pacred + origin/InwPond007 now 0-ahead):** ภูม Poom-pacred (forwarder new/edit UX · detail↔edit split · MOMO-review image zoom) + ปอน InwPond007 (**styled-dialog sweep** `components/ui/confirm.tsx` app-wide · customs rebrand · mobile UX — ปอน rebased → merged clean, 1 trivial conflict + 1 dup-import fixed).

**🔴 PENDING (Mac / owner / team):**
- **#7 cleanup** — `adminQuoteShopOrder` + `adminUpdateServiceOrder` verified ZERO-caller (safe to tombstone) · print-stamp `hPrintBill` = render-write anti-pattern → both **deferred** (cosmetic).
- **Owner Vercel env (เดฟ has token, did NOT change prod):** confirm `PACRED_TAMIT_DETAIL_URL`=`…/api-product-2026` · `THAIBULKSMS_FORCE`=`corporate` · FB 8 tokens · 3 missing admins.
- **🚢 Freight cost-side** (`tb_freight_rate_*` + monthly FX + markup-tier) · **ใบขน VAT** accounting sign-off · **ภูม interpreter-badge** confirm.
- ⚠️ ฝากสั่งซื้อ `/edit` money-flow **NOT click-tested by me on prod** (build+verify+route-307 green · earlier 200 renders · preview-browser flaky after many restarts + `.next` contention from running prod builds beside dev). **Mac: login admin → open a status-3/4 order → verify per-shop save + auto-cancel + address re-pick on a TEST order.**

---

# 🌆 2026-06-04 EVENING — ภูม session (Poom-pacred ที่ทำงาน → กลับบ้านต่อ) · merged into main 2026-06-04 PM (เดฟ)

> ภูม's evening save-point (his work is now merged into main — see the 💻 PM section above). Kept for the learnings + browser-test list.

**Branch:** `Poom-pacred` (HEAD `691060cb` at the time · now in main)
**Full save-point:** [`docs/research/poom-save-point-2026-06-04-evening.md`](docs/research/poom-save-point-2026-06-04-evening.md) (workflow ของภูม + decision tree + browser-test list)

**7 commits (ce403fb5 → 691060cb · all merged):** `/admin/forwarders/new` ลบ dropdown โกดัง · auto-detect ONLY · Smart tracking lookup + Step pills icons · **Per-shop status-aware `<ShopFieldsBoard>`** (legacy update3/update4) · step-pills sync detail↔edit · PR023 mapping · MOMO review thumbnail + multi-image lightbox.

**🧠 Key insights (captured in [`docs/learnings/partner-apis-quirks.md`](docs/learnings/partner-apis-quirks.md) + [`docs/learnings/php-port-patterns.md`](docs/learnings/php-port-patterns.md)):**
1. **MOMO `user_code` = legacy `tb_users.ID` (integer PK zero-padded)** — ไม่ใช่ string userID. MOMO `"023"` = ID 23 = `PR1395`; `"99"` = ID 99 = `PR089`.
2. **MOMO `raw.images[]` = GROUND TRUTH** — เปิดดูรูปก่อนเชื่อ field อื่น (ภูม เปิดรูป user_code "023" → ป้ายจริง "PR025" → MOMO operator กรอกผิด).
3. **Per-shop array loop** — legacy `update3.php` loops `$_POST['cNameShop'][]` → port = Zod array + WHERE `hno+cnameshop` per shop. `name="...[]"` = backend loops.
4. **Status-aware UI** — legacy แยกไฟล์ (update3/update4) → port = component เดียว + `isStatus3`/`isStatus4` flags.

**🔴 รอ ภูม:** PR023/PR99 mapping (default = ทาง 3 "ไม่ทำ Pacred · เซลแจ้ง MOMO" เพราะมีหลักฐานป้ายจริง).

**⚠️ Anti-patterns:** ไม่ trust MOMO field (เปิดรูปก่อน) · ไม่ใส่ dropdown ให้ admin เลือกอะไรที่ส่งผลข้อมูล ("พนักงานกดผิดมั่วตาย") · ไม่ port single-value where legacy = per-shop array · ไม่ลืม sync UI 2 หน้าที่ใช้ component เดียวกัน.

---

# 🌙 2026-06-04 NIGHT — OVERNIGHT CONTINUATION (Mac · เดฟ · owner asleep → closes AM): profile-pic + UX-confirm + estimator + brand-r2 + badges + perf + 🚢 FREIGHT engine · read FIRST

**main = `dave-pacred` = `5f55efa5`+ · 10+ night save-points pushed · `pnpm verify && pnpm build` → CHAIN=0 (REAL exit codes) · both branches 0/0 · Vercel build RESTORED.** Continuation of the 🌅 run below (same day). Standing quality rules now in **AGENTS.md §0f** + memory [`ui_quality_concept_2026_06_04`]. Full night detail in [`reachability_audit_2026_06_04`] memory.

**🚢 PHASE D FREIGHT — rate engine SHIPPED (owner "ลุยเลย" · 3 gated increments · all real-exit + pushed):** The freight quote-builder priced line items by HAND (`computeQuoteTotals` just summed typed prices). Now it auto-prices from the REAL AXELRA rate cards (`/Users/dev/Desktop/olddata dev/.../แบบฟรอมออกราคา IMPORT .xlsx`). **(1)** `lib/freight/rate-model.ts` + `rate-engine.ts` — `composeFreightQuote(spec)`: incoterm→scope→pick Thai-customs + China-freight lines→price (truck/tier/per-CBM·KG·ตู้)→VAT 7%→≤15k/ตู้ margin guard→commission (1%/5%/5% −3% WHT). **26 grounded tests** reproduce the real sheet totals EXACTLY (CIF AIR 4W=10211/6W=13301 · CIF SEA LCL 4W=13511/6W=14801). **(2)** auto-fill UI on `/admin/freight/quotes/[id]` (`adminComposeQuoteFromRateCard` + `RateCardAutoFill` panel · draft-only · styled confirm-before-mutate · **INTERNAL only, zero customer comms**). **(3)** `chinaCostPending` honesty flag — the COST side is a monthly, FX-dependent (35฿/USD), per-port×carrier USD matrix + markup-tier policy (เฟรท 30/25/20/15/10%) → **cannot be honestly hardcoded** (would go stale + "มั่ว"); so the engine flags EXW/CFR profit as **"กำไรขั้นต้น (ยังไม่รวมต้นทุนเฟรทจีน)"** instead of presenting gross-as-net. CIF/FOB show true "กำไร". **🔴 HANDOFF (owner/ภูม/accounting):** true China margin needs an admin-editable `tb_freight_rate_*` table + monthly FX + markup-tier config (a build, not a hardcode) — spec'd in [`docs/research/freight-rate-engine-2026-06-04.md`](docs/research/freight-rate-engine-2026-06-04.md).

**🔴 PROCESS BUG FOUND + FIXED — never gate via `| tail`.** The 🌅 run's first 2 night save-points (estimator `fc2107aa`, brand `dd35140f`) were gated through `pnpm build 2>&1 | tail` — which returns **tail's** exit code, masking 2 real `next build` failures (estimator `setState` sync-in-`useEffect`; `revalidateTag` 1-arg `TS2554`). So **Vercel couldn't deploy those** (site kept last-good — no data lost). Both fixed + the build restored in `7f63d60a`. **RULE (AGENTS.md §0f): gate with `pnpm build > /tmp/x 2>&1; echo $?` and read the REAL exit code before claiming green/pushing.**

**🚀 Shipped this night (7 save-points · each gated real-exit + pushed):**
- **Customer import price ESTIMATOR** `/service-import/estimate` — live ทางรถ/เรือ/แอร์(soon) + ตีลัง recalc (owner's "ราคานิ่งจัด" fix). Reuses the verified `resolveForwarderRate`; CUSTOMER-SAFE (strips margin/floor/tier). **Flow-recheck:** legacy pricing = admin-set-after-warehouse (`calPrice.php`, NOT customer-live) → estimator is a NEW enhancement; address-select (`cart-address-shipby`) + shipment-reassign (`adminReassignForwarderOwner`) already EXIST. Doc: [`docs/research/order-pricing-flow-recheck-2026-06-04.md`](docs/research/order-pricing-flow-recheck-2026-06-04.md).
- **🅰 Brand sweep round-2** — 19 visible "PCS"/stale-"กทม" labels → "Pacred (สมุทรสาคร)". All 6 customer PDF docs + public pages confirmed already-clean; `366/49`=a customer's own addr (kept). `หนองแขม` free-ship allowlist FLAGGED (pricing rule may need to follow the warehouse). Doc: [`docs/research/brand-pcs-leak-sweep-2026-06-04.md`](docs/research/brand-pcs-leak-sweep-2026-06-04.md).
- **🖼 PROFILE PICTURE WIRED** (owner "เรื่องเด็ด" · customer **AND** staff) — was a dead modal (customer) + URL-only "Wave 23" field (staff). Customer: `actions/profile-avatar.ts` + `profile/profile-avatar-upload.tsx`. Staff: `actions/admin/avatar-upload.ts` (super) + `components/admin/admin-avatar-upload-field.tsx` → wired into `admins/[id]/edit` + `admins/new`. Both → `avatars` bucket → `profiles.avatar_url`. Render-verified; mechanism = the proven prod promo-image uploader. ⚠️ **literal file-pick test = a 30-sec owner manual confirm** (couldn't automate: Chrome not auth'd to the preview).
- **✅ Confirm-before-mutate** (กันคนลั่น) — native `confirm()` on 9 staff money/state/comms buttons (forwarder + service-order mark-paid, withdraw approve, yuan approve/reject, shop-payout transfer/reject, period soft-close, freight quote approve/**send-to-customer**/accept). Customer side was already guarded.
- **🔢 Badge accuracy** (อย่ามั่ว) — customer sidebar counts verified read canonical `tb_*` (correct `fstatus=5`/`hstatus=2`/`paystatus=1` filters). **FIXED** admin sidebar `salesPayout` badge: was reading the empty rebuilt `sales_payouts` (0 rows) → repointed to `tb_user_sales_admin_pay` status='2' (= pending, **empirically verified** vs the `[id]` page `isPending===2`; currently 0 = correct). Dashboard `sales_payouts` (customer "เบิกค่าสินค้า") left as intentional Phase-C native-empty. Interpreter `commissions` badge flagged (missing table · ภูม).
- **⚡ Perf survey** ([`docs/research/performance-survey-2026-06-04.md`](docs/research/performance-survey-2026-06-04.md)) — the obvious DB indexes **already exist** (migration 0109's 23 partial indexes cover userid/fstatus/hstatus/paystatus on the hot tables; agent over-flagged). Remaining = `.ilike("%term%")` searches needing Phase-C `pg_trgm` GIN + regression-risk CODE-CHANGES — **none auto-applied** (the "ห้ามทำงานบัค" guardrail). **Headline: set `NEXT_PUBLIC_SENTRY_DSN` in Vercel** → the already-wired Sentry then MEASURES the real prod P95 (the honest fix vs guess-optimizing the busiest tables). + banner-img `sizes` perf fix.

**🟢 OWNER-AUTHORIZED 1-4 — DONE this session ("ทำเลย 1 2 3 4"):**
1. ✅ **Migrations `0137`·`0139`·`0140` APPLIED to prod** (direct-host · 150/72/160ms · each verified live via REST · `scripts/apply-migration-generic.mjs`). NEXT FREE = **0141**.
2. ✅ **`NEXT_PUBLIC_SENTRY_DSN` set in Vercel prod** (env id `18cDBhSlvVqu334X` · target=production · `SENTRY_DSN` server-side already existed; the CLIENT one was the missing gate). Activates on the next deploy (= this push) → client Sentry perf monitoring live → measures the real prod P95.
3. ✅ **Profile-pic upload PROVEN end-to-end** (`scripts/test-avatar-upload.mjs`: 287 KB → `avatars` bucket → public URL → HTTP 200 image served → cleaned up). Both customer + staff use this verified mechanism — "ใช้ได้จริง" confirmed.
4. **Cross-person (advanced as far as safe):** ภูม — interpreter-`commissions` badge source enriched IN-CODE with the concrete lead (`tb_withdraw_comm_interpreter_h` status='2' = รอจ่าย · the comm-interpreter batch table); ภูม confirms before wiring (PAY flow is deferred). **ปอน — InwPond007 `fef7958f` (styled-dialogs · 73 files · 88 behind) deliberately NOT merged by me** — a stale-base merge would revert prod (งานหาย · the guardrail) → ปอน MUST `git pull origin main` to rebase, then their styled-dialog sweep lands clean on top of tonight's native `confirm()`s. Accounting — ใบขน VAT base + `หนองแขม` free-ship zone = policy decisions (documented in code/ADR).

**🔴 STILL PENDING (owner / team):** 🌅 Vercel list (`PACRED_TAMIT_DETAIL_URL`-2026 · `THAIBULKSMS_FORCE` · FB tokens · 3 missing admins) · ปอน InwPond007 rebase (now trivial — `fef7958f` IS in main) · accounting ใบขน VAT + free-ship-zone sign-off · ภูม interpreter-badge confirm · **🚢 FREIGHT cost-side decision** (owner/ภูม/accounting: admin-editable `tb_freight_rate_*` table + monthly FX 35฿/USD + markup-tier 30/25/20/15/10% — so EXW/CFR quotes show true net margin, not just กำไรขั้นต้น).
5. **Freight (Phase D):** realdata SOT = `/Users/dev/Desktop/olddata dev/data งานเก่า` (real LINE/WeChat chats + Excel + real prices) per [`ui_quality_concept_2026_06_04`].

---

# 🌅 2026-06-04 — AUTONOMOUS RUN (Mac · เดฟ): env reorg + Global Trade Group capture + Pacred branding swap + 4 build lanes A·B·C·E · read FIRST

**main = `dave-pacred` = (this 2026-06-04 push) · `pnpm verify` EXIT 0 (lint·typecheck·~280 tests·audits) · Vercel auto-deploys main.** Resume: `git fetch origin && git pull origin main` → read this. On a new machine do `.env.local` first (see 2026-06-03 below + memory [`reachability_audit_2026_06_04`] + [`global_trade_group_2026_06_04`]).

**🚀 Shipped + pushed (owner unlocked A-B-C-E-F · D deferred · ran 4 parallel isolated-worktree agents → merged serial → verify → push):**
- **🔵 ENV reorg** — `.env.local` rewritten clean (51 Vercel keys reconciled + owner's new tokens Vercel/Sentry/hCaptcha/Cloudflare) + Desktop mirror + `.env.example`. ⚠️ **OTP**: ก๊อต fixed ThaiBulk (signups OK now); note `OTP_BYPASS` is hard-ignored on prod — real lever is `EMERGENCY_OTP_BYPASS` (unset).
- **🏛 Global Trade Group** captured → [`docs/research/global-trade-group-2026-06-04.md`](docs/research/global-trade-group-2026-06-04.md): 6-entity holding · 3 tax-doc billing modes · launch stages · pricing · branding mandate.
- **🔎 Reachability/404 audit + fixes** → [`docs/research/reachability-deadflow-audit-2026-06-04.md`](docs/research/reachability-deadflow-audit-2026-06-04.md) (4 agents · 374 routes): dead `/service-order` ยกเลิก button → client island · `doGTranslate` console error killed (every protected page) · `/admin/learning` 404 → `/admin/board/inbox` · dashboard banner → `/cart` · **6 orphan admin routes wired** · **2 dead-code files tombstoned** (`rates.ts`/`wallet.ts`) · sidebar dup-key fix. Customer surface healthy (0 404, no dead-write traps); admin money faithful.
- **🅰 Branding** — Pacred stamp on all 6 legacy print pages (overwrote 2 old PCS stamp assets · `public/images/pacred-stamp.png` 284K from `/Users/dev/Desktop/stamppacred.png`) · footer chat LINE @PCSCARGO → Pacred LINE · search logo · self-pickup "โกดัง PCS / เพชรเกษม 77 / 02-444-7046" → Pacred สมุทรสาคร / 02-421-3325 (5 forms) · admin company options PCS→Pacred. ⏳ follow-up: add stamp IMAGE to modern @react-pdf templates (needs absolute-URL + render-test).
- **🅱 Tax-doc 3 modes** — per-order ใบกำกับ/ใบขน/ไม่รับเอกสาร + per-mode VAT base (`lib/tax/tax-doc-mode.ts` +44 tests). `'customs'` was a dead enum. **Default `tax_invoice` verified-unchanged.** ⚠️ **ใบขน VAT-base = accounting-policy interpretation (no legacy citation) → needs accounting sign-off before staff issue ใบขน** (1-line override flagged in code).
- **🅲 Pricing** — min-sell guardrail (`business_config pricing.min_sell_floor` + migration 0139 + 14 tests, hard-warn) · CBM/kg · รถ/เรือ/แอร์ quote-compare (`/admin/accounting/quote-compare/modes`).
- **🅴 CRM** — `/admin/crm` verified functional + reachable (fixed unlinked-LINE dead-end).
- **monitor** — Sentry already code-wired (gated on `NEXT_PUBLIC_SENTRY_DSN`); set locally. Prod-activate = 1 Vercel var (perf tradeoff).
- ✅ **admin login VERIFIED** — `admin_pee@pacred.co.th` / `123456` works (super). ⚠️ `admin_dev`/`pop`/`poom` do NOT exist as `admin_xxx@pacred.co.th` (only 12 of 15 roster have profiles).

**🔴 PENDING (owner / next session):**
1. **Migrations NOT applied prod:** `0137_pcs_sync` (ภูม) · `0139_min_sell_floor` (loader has defaults → optional) · `0140_yuan_tax_doc_pref` (metadata-only ADD COLUMN). **NEXT FREE = 0141.**
2. **Owner Vercel env:** TAMIT `-2026` · `THAIBULKSMS_FORCE=corporate` · Sentry activate (`NEXT_PUBLIC_SENTRY_DSN`) · FB 8 tokens · the 3 missing admin accounts. (เดฟ has Vercel token now — can set on request.)
3. **InwPond007** — 1 unmerged commit (`fef7958f` styled-dialogs · 70 files · 67 behind) → **ปอน `git pull origin main` to rebase** (hand-merge unsafe before a prod push). Then switch the new `cancel-order-button.tsx` (native confirm) to ปอน's global `confirm()`.
4. **ใบขน VAT-base accounting sign-off** (Lane B) · **D Freight FCL/LCL** deferred · customer-minor (profile image-upload unwired · @react-pdf stamp image).

---

# 💻 2026-06-03 — SESSION CLOSE + MACHINE MOVE (Windows คอมบริษัท → Mac บ้าน) · FULL TEAM MERGE + ฝากสั่งซื้อ detail REWRITE · read FIRST

**main = `dave-pacred` = `26a01caf` · pushed · `pnpm verify` EXIT 0 (lint·typecheck·test:unit·audit:all all green) · Vercel auto-deploys `main`.** Resume on Mac: `git fetch origin && git pull origin main` → read this section.

> ⚠️ **Mac needs `.env.local` first** (the Windows one doesn't travel). Per memory [`local-dev-env-and-legacy-path`]: local `.env.local` must hold the REAL **prod** Supabase keys (`yzljakczhwrpbxflnmco`) — a PLACEHOLDER `.env.local` (fake keys) is the root cause of *"กดอะไรก็ค้าง error เพียบ"* (public pages 200 but every DB click hangs). Owner provides the prod env paste. `OTP_BYPASS=true` STAYS (ThaiBulk corporate SMS too slow). `PACRED_TAMIT_DETAIL_URL` must be `…/api-product-2026` (bare `/api-product` = dead 404). Legacy PCS source (faithful-port SOT) on Windows was at `C:\Users\Admin\Desktop\newrealdatapcs\pcscargo\member\{,/pcs-admin}` — on Mac it's at `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/` per the `legacy-php-sweep` skill (AGENTS.md §0b's `D:\REALSHITDATAPCS` is wrong on both).

**🚀 Shipped + pushed this session (เดฟ integrator + ก๊อต/ภูม/ปอน — multiple verified batches):**
- **🔴 FULL-TEAM MERGE (2 rounds)** — round 1 (`cbc7ee06`): ปอน register split-screen + ภูม's 27 (search-E1 SKU picker · forwarder `[fNo]` read-only redesign+`/edit` · §0e tb_* pivots · yuan-bulk · momo-cron). round 2 / session-close (`9d6a791a`): ปอน +9 (register polish + **LCL-pricing** rebuild) + ภูม +21 (**ใบวางบิล R-2** billing-run admin+customer+print · **migration 0138_forwarder_invoice APPLIED prod by ภูม** · forwarders/edit PCS-style single-page · receipt/ใบส่งสินค้า redesign · `max-w` sweep 21 pages). **Read EVERY money-path conflict by hand** (the "diff-stat lies" trap) — notably KEPT เดฟ's §0e `notes/page.tsx` live-`tb_header_order` fix over ภูม's dead-read `service_orders` version; took ภูม's richer search-E1; renumbered ภูม's `0135_pcs_sync`→**`0137`** (collided with promo `0135`).
- **🔴 ฝากสั่งซื้อ admin detail REWRITE (`884c1a42` · owner directive "รื้อทั้งหน้าให้เหมือน legacy เป๊ะ")** — `/admin/service-orders/[hNo]` was read-only KV + 8 stacked forms, MISSING the editable per-item price table → CS/ล่าม ใช้ไม่ได้. **Decoded legacy `shops.php`/`update.php`/`update1-5.php` price+loop from source** (formula proven vs the HTML owner pasted: 2,120¥×5.01=10,621.20฿). Rewrote into ONE faithful page: 5-step bar · customer + inline-edits (hRate/transport/crate/shipBy/payMethod/address) · price breakdown + กำไร · **editable items table (จำนวน/¥ราคา/ค่าขนส่งจีน + live calc) + new action `adminSaveShopOrderItemsAndQuote`** (= legacy `update2`: per-item save → recompute hTotalPriceCHN/hShippingCHN/hTotalPriceUser → guard via `tb_wallet_hs.reforder` → hStatus=2 + hDatePayment+5d + 4-CH notify). Reused all ภูม's step-3/4/5 + inline actions. Built via worktree agent + **เดฟ reviewed the money action line-by-line**.
- **CI:** `.agents/` tooling added to md-link-audit `SKIP_DIRS` (pre-existing broken links, like `.claude`) · declared `PCS_SYNC_URL/TOKEN` + `SUPABASE_DB_PASSWORD` in `.env.example` (used-but-undeclared → audit:env).

**🔴 PENDING (next session / Mac):**
1. **ฝากสั่งซื้อ rewrite NOT browser-verified** — compiles (307 admin-gate) + money action reviewed, but the **save flow was NOT click-tested** (§0c). On Mac: login admin → open a status-1 ออเดอร์ → verify editable price table + live calc + "บันทึก+รอชำระเงิน" writes tb_order/tb_header_order correctly + 1→2 + notify. ⚠️ test on a TEST order (writes real prod data).
2. **Owner Vercel env (เดฟ no token):** `PACRED_TAMIT_DETAIL_URL`→`/api-product-2026` · `THAIBULKSMS_FORCE`→`corporate` (PM-8 TODOs, still open) · **pcs-sync activation:** apply migration **`0137`** + set `PCS_SYNC_URL`/`PCS_SYNC_TOKEN` + deploy `pcscargo.com/api/pacred-sync.php` (cron fails gracefully until then).
3. **Migrations:** `0137_pcs_sync` ⏳ NOT applied · `0138_forwarder_invoice` ✅ applied prod by ภูม. NEXT FREE = **0139**.
4. **ภูม + ปอน:** their branches moved during the merge (they kept working) — on resume they `git pull origin main` (their work IS in main; I did NOT force-distribute).

---

# 🏠 2026-06-02 PM-8 — SESSION CLOSE + MACHINE MOVE (→ บ้าน) · 2 PROD ENV INCIDENTS + Wave-A + ก๊อต/ปอน MERGED · read FIRST

**main = `dave-pacred` = (this session-close commit)+ · pushed · typecheck+lint+build EXIT 0 · prod LIVE (Vercel auto-deploys `main`).** Resume at home: `git fetch origin && git pull origin main` → read this section. Owner closed the company-computer session.

**🚀 Shipped + pushed this session (เดฟ + ก๊อต + ปอน — one verified batch):**
- **เดฟ Wave-A trust sweep** (`0a38c71d`) — killed the `/service-import/pending` **dead-read** (read rebuilt 0-row `forwarders` → all 8,898 migrated customers saw an EMPTY "รอชำระเงิน" screen via 3 nav entries) → redirect to `/service-import?q=5` (faithful tb_forwarder pending tab) + repoint mobile FAB + removed orphan `listForwarders`/`ForwarderSummary`/`forwarder-list.tsx` (§0e). Deleted dead `/api/settings-rate` endpoint. Fixed search-demand `sourceNote` (named the empty `tb_history_key`; data layer already reads `tb_search_history`). **A 4-agent audit confirmed the other big-audit Wave-A P1s (credit-line P1-5, config-split P1-11, VIP-rate, yuan-bulk orphan) were ALREADY CLOSED in PM-3/PM-4 → not re-implemented (avoided the stale-doc re-work trap).**
- **🔴 PROD INCIDENT #1 — "กดค้นหา/วาง link แล้ว api เก่าตาย, สั่งซื้อไม่ได้"** (`6200f463`) — China URL-paste product search dead on prod. Root cause: vendor retired `https://tamit-cloud.com/api-product` → **HTTP 404** (verified live); correct = `/api-product-2026`. The code default (`lib/china-search/index.ts:48`) is already -2026, **but Vercel prod `PACRED_TAMIT_DETAIL_URL` + `.env.example` still carried the dead URL → the env OVERRODE the good default.** Fixed `.env.example`. (AkuCargo keyword path also 404'd from external test — could be IP-allowlist; verify with ไอแต้ม.)
- **🔴 PROD INCIDENT #2 — registration OTP "Sent but not received" + rate-limit** (`.env.example THAIBULKSMS_FORCE`) — customer KIT CHAREON MUSICAL (พีท · 0909709898) couldn't register: ThaiBulkSMS dashboard shows "Sent" ×3 but customer never received → hit the 3/hour/phone cap ("สมัครเกินจำนวน"). **Key findings:** (a) **`OTP_BYPASS` is HARD-IGNORED on Vercel production** (`gateway.ts:52` forces it off when `VERCEL_ENV==="production"`) → setting it false/true does nothing; the real emergency lever is **`EMERGENCY_OTP_BYPASS=true`**. (b) SMS "Sent"≠"Delivered": "Pacred" sender ID is approved in ThaiBulkSMS's **Corporate pool**, but `.env.example` still said `THAIBULKSMS_FORCE=premium` (stale, same class as TAMIT) → wrong pool = accepted-but-undelivered → fixed to `corporate` (code default already corporate). Owner admin-created พีท via `/admin/customers/new` (no-OTP path · juristic needs the 13-digit Tax ID). ThaiBulk deferred ("ปล่อยไปก่อน").
- **ก๊อต (got-jirayus · merged from `origin/main` `bb09a8b0`+`ea02bc4f`)** — "เริ่มขยับ" = **comprehensive code-derived docs** (956 files · `docs/components/*` · `docs/database/*` per-table specs · `docs/test-cases/*` per-page manual test cases) + `fix: change path images` (china-shopping services page). No migrations.
- **ปอน (PCSCARGO · merged from `origin/InwPond007` ×3)** — `2f84df06` **public `/track/[code]` + `/track`** (CargoThai P2 — the no-login tracking GTM moat) + **LINE CRM thread panel** (`/admin/line-inbox` · `actions/admin/line-crm.ts`) + **address-flash** UX + **camera image-search** panel + `fix(i18n) BookingHero` + `fix(test)` Windows bracket-path quoting. No migrations.

**🟠 ภูม (Poom-pacred · 22 commits · NOT merged — needs RESYNC):** ภูม shipped a lot — §0e trust-sweeps (VIP/commission_*/service-orders tombstones), **search-E1** (SKU picker + per-SKU price + TAMIT-2026 endpoint + manual-price fallback + add-to-cart wire — the richer fix for INCIDENT #1's "ราคาไม่ขึ้น/รูปไม่ขึ้น" Tmall-per-SKU case), admin money-path pivots (forwarder/yuan/barcode → `tb_*`, commission→`tb_user_sales`), PCS-style forwarder `[fNo]` view, a 164-cast build-unblock. **NOT blind-merged** — his branch is **62 behind dave-pacred + overlaps เดฟ's trust-sweep + dave's `f4d72228` (search add-to-cart) + touches money paths**; a blind merge would revert prod files (learnings/parallel-agent-sprints "diff-stat LIES"). **➡️ Action next session: ภูม `git pull origin main` to rebase his 22 onto the new main → then it merges clean; OR เดฟ cherry-picks the non-overlapping ones with money-path diff review.** His work is SAFE on Poom-pacred — nothing lost. His search-E1 overlaps INCIDENT #1 — reconcile his richer version vs the env fix when integrating.

**🔴 OWNER TODO — Vercel env (prod · เดฟ has no Vercel token):**
1. `PACRED_TAMIT_DETAIL_URL` = `https://tamit-cloud.com/api-product-2026` (or DELETE) → unblocks China URL-paste search
2. `THAIBULKSMS_FORCE` = `corporate` (or DELETE) → unblocks OTP SMS delivery (Corporate-pool sender)
3. (optional) `EMERGENCY_OTP_BYPASS=true` ONLY if many signups stuck — fail-open, turn OFF after SMS fixed
→ Redeploy after (or it auto-redeploys on this push). Also check ThaiBulkSMS delivery-report (Sent vs Delivered) + "Pacred" sender approval per carrier.

> **Pattern (compounding · captured in memory `prod_env_staleness`):** when a vendor/API "ตาย" in prod but works locally, FIRST check whether a **Vercel env var is stale vs the code default + `.env.example`** — a SET-but-wrong env var OVERRIDES a correct code default. Hit twice this session (TAMIT detail URL + THAIBULKSMS_FORCE).

---

# 🌙 2026-06-02 PM-7 — OVERNIGHT AUTONOMOUS RUN (owner asleep · staff-CRUD backlog) · read FIRST

**main = `dave-pacred` = `6b183aef`+ · all pushed · build EXIT 0 each wave · prod LIVE · migrations 0136 applied.** Owner moved to the company computer, said "หยิบงาน code รันยาวยันเช้า · เดี๋ยวตื่นมาสรุป" → ran the §PM-6 #3.3 staff-CRUD backlog autonomously (codeable items that need NO owner login/token/decision). Pattern: flat Agent + worktree + disjoint + build-gate + push-per-wave (clean state always).

**🚀 Shipped overnight (each its own wave · merged + built + pushed + migration applied):**
- **CRUD: partner** (`daa0d73f`) — NEW `partners` table (**migration 0136 APPLIED prod** · isolated · RLS super-only) + admin directory CRUD at **`/admin/partners`** (list/add/edit/toggle/hard-delete · super) + sidebar (Handshake). MVP = external logistics/business partner directory (GOGO/JMF/TTP/MOMO/CargoThai/warehouse/customs/messenger/api_provider · 8 partner_type CHECK). 🟠 **3 OPEN-Q for owner:** (1) partner-portal *login role*? (built admin-internal only) (2) the 8 partner_type buckets right? (`last_mile` overlaps `carriers`) (3) link partner `code` ↔ MOMO/JMF integration configs? — answer → wire later (no schema change).
- **admin-create-customer + guarded hard-delete** (`6b183aef`) — `/admin/customers/new` (admin creates a customer w/o self-register/OTP: phone-collision guard → `auth.admin.createUser` → profiles → tb_users seed incl. round-robin sales + wallet + cashback · juristic→tb_corporate · reveal pw once) + a **hard-delete** danger-zone on `/admin/customers/[id]` (super-only · type-the-PR-code confirm · **REFUSES if the account has any orders / wallet balance / wallet history** → only truly-empty test/orphan rows · full audit snapshot). Closes the staff-CRUD gap (was soft-toggle only).

**🔴 STILL PENDING (need owner — kept for when พี่ wakes · all in `docs/research/RESUME-machine-move-2026-06-02.md`):**
1. **admin-login-verify** — `admin_pee` / `123456` (Claude can't type pw — owner logs in → confirm `/admin/admins` shows 15).
2. **5 phone-collisions** — owner sign-off per row → free the phones (detail table in RESUME §3.2).
3. **prod money spot-check** — approve 2-3 real test slips → confirm fstatus 5→6 + AR decrement + tax-invoice issuance (mutates real money/RD).
4. **partner CRUD 3 open-Q** (above) · **FB 8 env tokens** → scaffold `/api/webhooks/facebook`.
5. **QA full-loop admin-side** (member-side verified · `docs/research/qa-6systems-2026-06-01.md`).

> 🟢 Codeable backlog still open for a fresh run (no owner needed): freight_quote admin-review page (close the public freight funnel) · sales quote-comparison tool (CEO pricing) · more BI. ⚠️ This conversation hit context limit after 2 clean waves — a fresh session continues the loop with full headroom.

---

# 🏢 2026-06-02 PM-6 — SESSION CLOSE + MACHINE MOVE (→ คอมบริษัท) · read FIRST → then `docs/research/RESUME-machine-move-2026-06-02.md`

**main = `dave-pacred` = `origin/main` = `37078633`+ · all pushed · typecheck EXIT 0 · prod (Vercel auto-deploys `pacred.co.th`) LIVE.** Closing the home session to continue on the company computer. Resume: `git fetch origin && git pull origin main` → read [`docs/research/RESUME-machine-move-2026-06-02.md`](docs/research/RESUME-machine-move-2026-06-02.md) FIRST (carries the machine-local paths · the **5 phone-collision + login-verify pending** · the FB-token checklist · working-style — none of which travel with git).

**🚀 Shipped this session (all pushed + deployed):**
- **🔴 ADMIN OVERHAUL (the headline · owner directive)** — cleared the legacy-admin mess + provisioned a clean **15-admin roster** (`admin_pop/dev/pond/got/poom/win/nat/vam/web/jane/aom/may/pee/ploy/gring`) on prod: each = auth + profiles + `admins`(super) + `admin_contact_extras`(legacy_admin_id bridge) + `tb_admin` (the unification — login SOT = `admins`, sales-attribution SOT = `tb_admin`, linked via `legacy_admin_id`). **Login flexible** (เบอร์ + email `admin_xxx@pacred.co.th` + PR-code · pw `123456`). Created **`admin_center`** ("เซลส่วนกลาง" · routing bucket, no login) · **reset all 8,900 customers' `adminIDSale`→admin_center** (backup `scripts/backup-adminIDSale-*.json` · reversible) · **deleted 10 old messy `tb_admin`** (admin_admin_*, admin_ploypr01, admin_Warehouse). Code: **round-robin sales auto-assign** (legacy `tb_admin.adminStatusSale='1'` model · pool = พี `admin_pee` + เมย์ `admin_may`) + **register success popup** (PR-code + เซล + เบอร์) + **killed the sales-rep-change "death"** (all reassign paths now write live `tb_users.adminIDSale`; CRM accepts legacy rep). Scripts: `scripts/provision-admins-2026-06-02.mjs` + `reset-clear-admins-2026-06-02.mjs` (dry-run default · `--apply`). Roster + flow spec: [`docs/setup/staff-admin-provisioning-2026-06-02.md`](docs/setup/staff-admin-provisioning-2026-06-02.md).
- **AR-aging dedup** — canonical = ภูม's `/admin/accounting/ar-aging` (reconciled after his CSV enhancement); `/admin/reports/ar-aging` redirects there.
- **A+D receipt+tax-invoice** — removed dead forwarder-receipt orphan stack (orphan→redirect, deleted PDF route + `getForwarderByNo`, repointed 3 notifications→/invoice); rewired customer tax-invoice → ภูม's World-B `tb_forwarder_tax_invoice` (forwarder; shop/yuan deferred-banner); **ADR-0027** (`docs/decisions/0027-tax-invoice-sot.md`).
- **forwarder self-pickup address** → Pacred warehouse (สมุทรสาคร · 7 write-path files · legacy rows untouched).
- **/search add-to-cart** wired (dead RSC button → client island calling `addCartItem`).
- **margin-monitor "use server" fix** (caught via browser QA — a const-array value export blanked the page; tsc can't catch it → **always browser-verify after merge**).
- **ภูม sitting-I v4+v5 merged** — margin-monitor (CEO profit-cap ≤15k/ตู้) + quote-compare + margin-flag cron + e-Tax bulk XML + 2 withdraw payouts + ar-aging CSV + forwarders/[fNo] collapsible panels + MOMO PR99 scripts. **No work lost** (cherry-picked; ภูม pulls main when he resumes).
- **FB/IG integration guide** (owner directive · waiting on tokens) → [`docs/setup/facebook-integration-guide-2026-06-02.md`](docs/setup/facebook-integration-guide-2026-06-02.md). Found: Meta Pixel fires the **App ID** not a real Dataset (Events Manager empty → ads don't track) + no FB webhook (CRM FB/IG inbox = stub). Owner provides 8 env (`FACEBOOK_*` + real `NEXT_PUBLIC_FB_PIXEL_ID`) → scaffold `/api/webhooks/facebook` (mirror LINE).

**🔴 PENDING (next session · company computer):**
1. **VERIFY admin login** — `admin_pee` / `123456` (เบอร์ or email) → confirm login works + `/admin/admins` shows the clean 15. **NOT yet click-tested** (provision created the auth rows; login path unverified).
2. **5 phone-collisions** — ภูม/กอต/แนท/พลอย/กริ้ง are **email-only login** (their phone is held by an empty 0-order customer/test/orphan: PR10901/PR130/PR147/PR114 + 1 orphan). Owner sign-off → free the phones → phone login. (Detail in RESUME-2026-06-02 §collisions.)
3. **CRUD: partner** (no table/role/page yet — build) + admin-create-customer + admin-hard-delete (gaps; per the staff-CRUD audit).
4. **QA full-loop** (CEO ask) — member-side 3 systems verified; admin-side + the 🔴 tax-invoice issuance + slip-approve mark-paid still need the owner's prod spot-check.
5. **Owner to provide:** FB 8 env tokens · approve real test slips on prod (mark-paid + tax-invoice mutate money/RD).

---

# 🧳 2026-06-01 PM-5 — SESSION CLOSE + MACHINE MOVE · read FIRST → then `docs/research/RESUME-machine-move-2026-06-01.md`

**main = `dave-pacred` = `55e247be` · pushed · build EXIT 0 · prod LIVE.** Closing the home-machine session to continue on the work computer. Owner types only `sync main / pull dave-pacred มาทำงานต่อ` → **read [`docs/research/RESUME-machine-move-2026-06-01.md`](docs/research/RESUME-machine-move-2026-06-01.md) FIRST** (it carries everything that does NOT travel with git: machine-local paths, the owner-token inventory, the login protocol, env pointers, and the working-style/memory facts).

**Shipped in this close (all pushed):**
- **Promo manager** — owner can now เพิ่ม/แก้/เปิด-ปิดโปร + **อัปโหลดรูป** at **`/admin/settings/promos`** (Megaphone · multi-promo JSON in `business_config.promo.banners` · image→`avatars` public bucket · `/service-import` banner reads active promos, falls back to the legacy single promo). **Migration 0135 APPLIED prod via PostgREST** (IPv6 direct-DB was down → seed via `POST /rest/v1/business_config`; DDL still needs direct-DB/SQL-editor — see ledger + RESUME §2).
- **Member `/service-import` UX (from owner screenshot):** floating widgets decluttered (LINE bubble z-48 below pay-bar) · **pay-bar "ชำระเงิน" FIXED** (root cause = z-index: pay-bar z-44 sat *below* the LINE bubble z-51 → transparent overlap stole the tap → raised pay-bar to z-55; browser-verified click → pay modal opens with the 5 รอชำระ orders) · promo banner configurable.
- **Brand sweep** — admin receipt issuer → Pacred (TaxID `0105564077716` · KBANK `225-2-91144-0` · via site.ts). ⚠️ owner-TODO: **ตราปั๊ม+ลายเซ็น Pacred image assets** (still legacy PCS scans) · self-pickup **warehouse address** (ก๊อต confirm · no China warehouse addr in code) — owner bringing images.
- **ภูม sitting-I INTEGRATED** (Poom-pacred 14 commits · merged CLEAN · zero money-path overlap): commission Potemkin repoint (`/admin/commissions`+`/forwarder-sales` → live `tb_user_sales*` · **4,104 invisible earns now surface** · ADR-0026) · PEAK documents+CSV hubs · `/admin/accounting/ar-aging` · `/admin/forwarders/tran-th` (TH-transport batch) · menubar/orphan-wiring. **Build-fix:** his 5 `x as T[]` casts (written on a 34-behind base) failed typecheck against the newer base → `as unknown as T[]`. 🟠 **follow-up (non-blocker): DUPLICATE AR-aging** — dave `/admin/reports/ar-aging` vs ภูม `/admin/accounting/ar-aging` (both work · pick one canonical, redirect the other).
- **QA:** full-loop tester plan + proven env (Chrome + PR321 + admin auth, screenshots) in [`docs/research/qa-6systems-2026-06-01.md`](docs/research/qa-6systems-2026-06-01.md) — flow #1 (member ฝากนำเข้า/status/pay-bar) + the pay-button fix browser-verified; the rest TODO on the work computer (login protocol agreed).
- **Owner spot-check on prod (recommended):** approve 2-3 real test slips → confirm fstatus 5→6 advance + AR cockpit decrements (the PM-4 mark-paid fix · not click-tested by me = mutates real money).

---

# 🟢 2026-06-01 PM-4 — CEO "6 core systems done?" DEEP-AUDIT + FIX SPRINT · read FIRST

**main = `dave-pacred` = `685dd44b`+ · pushed · build EXIT 0 · no new migrations.** CEO asked if the 6 revenue systems (ฝากสั่งซื้อ·ฝากนำเข้า·โอนหยวน·ออกบิล·แจ้งเก็บเงิน·ออกใบเสร็จ) are TRULY done. Ran **4 read-only audit agents** (legacy PHP source + code + §0e) → **5 fix agents** (flat-Agent worktree pattern). **Verdict: all 6 money loops CLOSED + correct (no leak/double-spend) — but route-200 testing missed real gaps.** Shipped:
- 🔴 **#1 CEO-visible bug — paid forwarders stuck at fstatus=5 "รอชำระเงิน" → AR ฿917k overstated.** "mark-paid" was split (slip-approve minted receipt but no status flip; pay-on-behalf flipped but no receipt). **Fixed ALL approve paths** to advance fstatus 5→6 + mint receipt: `adminBulkApproveWalletHs` (tb-bulk · LIVE bulk) · `adminApproveWalletDeposit` (wallet-hs · LIVE single-row — was ERRORING on type='4', now full direct-slip branch) · `adminPayForwardersOnBehalf` (pay-user · +receipt). credit→clear fcredit (legacy L467/469) · idempotent eq-guard · best-effort. `adminApproveWalletHs` (wallet-trans) = DEAD (0 callers · tombstone).
- 🔴 **forwarder `/invoice` dead-write pay-button REMOVED** + customer rebuilt-twin orphan cleanup (-1424 LOC).
- 🔴 **shop dup dead "mark paid" button REMOVED** (read empty service_orders) + notes page repointed→tb_header_order + split-brain cart unified→/cart.
- 🟠 **yuan detail-approve** fixed (pending→อนุมัติสำเร็จ direct · drop phantom processing) + badge `.eq(paystatus,'1')`.
- money diffs (forwarder fstatus + wallet-hs type='4') reviewed line-by-line before merge. **Owner go/no-go: receipt still shows PCS Cargo brand** (not Pacred). Deferred: shop per-line pricing engine (big build). Detail: memory `big_audit_master_plan_2026_06_01.md` §PM-4.

---

# 🟢 2026-06-01 PM-3 — CRM + 3 MONEY ADRs + BI + pricing-guard SHIPPED · read FIRST

**main = `dave-pacred` = `1fb8ee6f`+ · all pushed · build EXIT 0 · typecheck/i18n 0 · NO new migrations** (all repoint/neutralize existing `tb_*`). Owner approved a batch + said run-long-parallel-ask-once-at-end. Ran **5 worktree agents** (proven pattern) + 2 self-built pieces:
- **CRM core** `/admin/crm` — omni-inbox (LINE real via ปอน's `Podeng_*`; **FB stubbed — no FB table in DB**) + customer-360 + **sales-rep routing** (`tb_users.adminIDSale` · new `actions/admin/crm.ts`) + funnel→`/admin/leads`. LINE↔customer mostly "ยังไม่ผูก" til manual-link; rep dropdown gated on 13-admin recreate.
- **ADR-0023 credit** ✅ — `getMyCredit`→`tb_users.userCreditValue`−`tb_credit.creditvalue`; paydown idempotent. 🛑 **prod-verify caught 2 agent bugs** (ห้ามเดา paid off): hs `type='3'` was a withdrawal-tab COLLISION (641 rows)→`'8'`; + missing NOT NULL `typenew`/`typeservice` (runtime INSERT fail).
- **ADR-0024 config** ✅ — `/admin/settings` neutralized→read-through hub (6 dead-write fields). **+ `/admin/rates` dead-read FIXED** → live `tb_settings` (ฝากโอน 4.93/ฝากสั่ง 4.97/ต้นทุน 4.84 · freeshipping flag · dropped rebuilt-only fee cards). browser-verified.
- **ADR-0025 cashback** ✅ **COMPLETE all paths** — debit `tb_cash_back`+hs idempotent; shop/yuan/deposit + **forwarder-slip approve/bulk** (wallet-trans.ts/tb-bulk.ts → spendCashbackAtCheckout · reject→refund · `357e9e2b`) all settle.
- **BI** `/admin/reports/{cockpit,ar-aging}` — exec cockpit (AR ฿917k · funnel) + AR-aging (buckets · top-50 debtors w/ phones). browser-verified real data.
- **pricing-guard** ✅ — `lib/pricing/margin-advisory.ts` + `<MarginAdvisoryNote>` (`blocks:false` ALWAYS · 6 tests). **Owner chose cockpit portfolio signal** → wired into `/admin/reports/cockpit` (MTD orders > ฿15k/ตู้: amber nudge if >0 else green · verified). Reusable block still plugs into freight per-container pricing (Theme 8) later.
- build-gate catch: cashback sync helpers broke `pnpm build` ("use server" only-async-exports, typecheck missed it) → moved to `lib/cashback/note-tag.ts`. Also: **prod deploys from branch `main`** (not dave-pacred) → `git push origin dave-pacred:main`.

**🔓 STILL OPEN (not เดฟ-solo):** **13-admin recreate (ADR-0022) gates CRM rep-routing + credit/commission visibility** (owner/ภูม) · FB omni-inbox waits ปอน's FB webhook. No เดฟ-solo chips left from this batch. Detail: memory `big_audit_master_plan_2026_06_01.md` §PM-3.

---

# 🧭 2026-06-01 PM — BIG AUDIT + MASTER PLAN + WAVE HANDOFF · read FIRST (supersedes-but-keeps the MARATHON section below)

**main = `dave-pacred` = `49368172`+ (0/0 · prod · Vercel auto-deploys) · all pushed.** Cross-machine resume: `git pull origin main` → read this section → **[`docs/research/big-audit-2026-06-01/_MASTER-PLAN.md`](docs/research/big-audit-2026-06-01/_MASTER-PLAN.md)** (THE canonical long-term plan) + per-lane briefs in [`docs/briefs/`](docs/briefs/).

**🎖 CEO DIRECTIVES (opening day · re-prioritises everything):** [`docs/research/ceo-directives-2026-06-01.md`](docs/research/ceo-directives-2026-06-01.md) — North Star = **business that self-runs ("ทำธุรกิจโดยไม่มีพี่ลงไปทำ")**; scale in 3-4mo via **CRM + Marketing(SEO/ads/content) + standardised-workflow+training**. Org chart → RBAC depts · Global Trade Group holding (multi-company long-term) · accounting **3 tax-doc modes** (ใบกำกับ/ใบขน/ไม่รับเอกสาร · VAT-7% bases → ภูม PEAK §3) · pricing **profit-cap ≤15k฿/ตู้ + sales quote-comparison tool** · **ACQUISITION KICKOFF NOW** (call AX-old + big-PCS · day-1 phone→close). **เดฟ urgent = `/admin/leads` call-queue** on the **6,936 callable cold-leads** (`tb_users.userActive=''`) + big-PCS ranking. New เดฟ order: acquisition→CRM→pricing→(BI feeds all).

**🌏 FREIGHT KNOWLEDGE ABSORBED (the AXELRA side · CEO gave `olddata dev` folder):** [`docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md`](docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md) (+ 4 cluster docs: chats·pricing·web-systems·customs-docs). **Pacred = 1 entity (`0105564077716`=AXELRA=Pacred) · 2 product lines: CARGO (PCS · ported) + FREIGHT (AXELRA · UN-BUILT, runs on Google Sheets).** Partner net: `pcs=ttp` · `momo=jmf(ไอแต้ม/TISO)` · all key into ONE CargoThai (Laravel); we consume it. **READY assets (build not discovery):** PJ-BOOK Prisma 10-model `freight_*` schema · AX BOOKING/JOB.html UX specs · CGTH = working Supabase `/track` rebuild · full rate cards + customs FORM kit + P'BEE PEAK pipeline + call-CDR tool. Freight = **new Theme 8** (FCL/LCL/AIR/cross-border-truck + customs brokerage ใบขน/NETBAY/Form-E/LOI/ตั๋วพ่วง + freight P&L/commission). Full-scope re-plan (short: acquisition+CRM+freight-quote-funnel+pricing-guard; long: freight ERP + customs automation + CargoThai-provider + unified portal/holding) in the master doc.

**🚀 Shipped this PM (all verified + pushed):** LINE staff-notify **LIVE on prod** (real groupId resolved via ปอน's Worker data · Flex cards + deep-links · Vercel env) · **NEW `/admin/line-inbox`** dashboard (reads ปอน's `Podeng_*` LINE data) · Notify Flex upgrade · **env yกเครื่อง** (full Vercel↔local inventory `docs/runbook/env-inventory.md` · +5 china-search vendor vars to prod · **MOMO_API_* creds set + token verified**) · **`/admin/settings` yuan_rate dead-write removed** (real rate = `/admin/settings/legacy-rates` → `tb_settings` rpdefault 4.93/rsdefault 4.97) · **404 `/service-import/…&pay=true`→`?pay=true`** + **`Cookies is not defined`** legacy-JS-order fix (both browser-verified via Chrome). ⚠️ OTP env untouched (owner cmd).

**🔬 THE BIG AUDIT (6 parallel agents · all 263 Supabase tables):** `docs/research/big-audit-2026-06-01/` — `_MASTER-PLAN.md` + 6 cluster docs + `_CONTEXT.md`. **Headline:** faithful port **substantially DONE** (legacy `tb_*` canonical · 147 rebuilt twins mostly 0-row · money loop closed · forwarder ~90%). 3 cross-cutting patterns: **(A)** Potemkin twins (mostly repointed) · **(B) reachable dead-write TRAPS** (admin edits→green toast→no effect: VIP-rate page, 3 commission pages — must sweep) · **(C) unmined data goldmine** (47,636 forwarder orders×114 cols w/ profit+timestamps · 104k wallet ledger · 6,937 never-contacted leads · 77k china categories — almost nothing analyzed → where 10× value is).

**📦 CargoThai blueprint** (owner+ภูม demo decoded): [`docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md`](docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md) — China-warehouse worker-app maps onto existing `tb_forwarder`/`tb_forwarder_item`/`tb_cnt`/`momo_sack` (~80% data ours). 4-phase: own-warehouse intake MVP → public `/track/{code}` (the GTM moat) → partner portal → API-as-a-service (inverse of MOMO consumption). = master-plan **Theme 7**.

**🗂 WAVE PLAN + per-lane handoff (everyone runs long):** [`docs/handoff-2026-06-01-waves.md`](docs/handoff-2026-06-01-waves.md)
- **เดฟ (เรา):** Wave A trust-sweep (Potemkin dead-write sweep + cashback + credit + config-split ADR) → Wave C BI/profit-analytics (the 10× · data all present) + CargoThai P1/P2 with ภูม/ปอน.
- **ปอน (frontend):** [`docs/briefs/podeng-wave-2026-06-01.md`](docs/briefs/podeng-wave-2026-06-01.md) — address delete/set-main · public `/track` · CRM omni-inbox · ad-ROAS · lead win-back.
- **ภูม (accounting/PEAK):** [`docs/briefs/poom-wave-2026-06-01.md`](docs/briefs/poom-wave-2026-06-01.md) — repoint 3 Potemkin commission pages (4,104 invisible earns) · port 2 legacy payout systems · PEAK-style accounting (receipts/tax-invoice/WHT/AR-aging/period-close) · e-Tax RD-86.
- **ก๊อต:** partner-API (GOGO/JMF/TTP) + CargoThai P4 API-as-a-service + LINE webhook consolidation co-decide.

**🔐 Owner-provided tokens (machine-local `/tmp/.cf-tok`,`.vc-tok`,`.momo-tok` · never committed):** Cloudflare + Vercel + MOMO — owner can revoke (kept this session for env/Worker work).

---

# 🟢 2026-06-01 — เดฟ MARATHON: faithful-port backlog CLEARED · read FIRST

**main = `dave-pacred` = `acc852d0` (0/0 · prod · deploy `dpl_833Gv…` READY) · all pushed.** Cross-machine resume: `git pull origin main` → read **[`docs/research/save-point-2026-06-01-dave-backlog-cleared.md`](docs/research/save-point-2026-06-01-dave-backlog-cleared.md)** (canonical) + **[`docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md`](docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md)** (verified gap status).

**➕ LINE/comms ต่อยอด batch (2026-06-01 PM · owner gave CF+Vercel API tokens):** **P1-24 staff-notify LIVE on prod** (groupId resolved + Flex cards + deep-links — see item 1 below) · **NEW `/admin/line-inbox` dashboard** (reads ปอน's `Podeng_*` LINE data — 52 customers/212 msgs · verified 307-gated + DB-layer-tested on prod) · **Notify Flex+deep-link upgrade** (`notifyStaffGroup(text,{url,title})`) · **env ykrueang**: full Vercel↔local inventory (`docs/runbook/env-inventory.md`) + **5 china-search vendor vars added to Vercel prod** (Laonet/Akucargo/TAMIT — were missing → search/reverse-image/tracking were broken in prod). Strategy: **[`docs/research/line-comms-strategy-2026-06-01.md`](docs/research/line-comms-strategy-2026-06-01.md)**. ⚠️ **OTP_BYPASS/OTP_PEPPER NOT touched** (owner: ห้ามแตะจนคอนเฟิม) · held for owner: `NEXT_PUBLIC_YUAN_RATE` (price-sensitive) + `MOMO_TOKEN` (verify usage) · CF+Vercel tokens machine-local+revocable.

**🔑 The 2026-05-30 "23 P0" was ~80% STALE** — re-verified at HEAD: money loop CLOSED (no double-spend), OTP NOT bypassed, settle paths work. This session then cleared the rest.

**SHIPPED (verify+build EXIT 0 each · pattern: flat Agent + isolation:worktree + disjoint files + tsc/tsx-only + merge-serial + verify-once):**
- **Forwarder `[fNo]` editor** (was dead on real rows): tombstone money dead-write `adminMarkForwarderPaid` + payment (ตัดกระเป๋า via faithful `adminPayForwardersOnBehalf`) + address re-pick + transport + cover + owner-reassign + cost-adjust + fShipBy + amountCount + **fCredit** (UPSERT fixes legacy 98%-silent-drop) + single-row driver-assign + **bill-to** (migration 0132 `tb_forwarder.fbilltoname`).
- **Theme B** general-rate editor → `tb_rate_g_*` (the engine tables; admin rate edits now take effect).
- **Reports:** VAT7 shops-only fidelity + 5-orphan reachability + daily-profit SVG graph + shops recompute-live + sales-monthly (tb_sales_report) + 2 monitoring reports (search/SMS) + agent-commission payout report.
- **Settings:** 144-cell forwarder default-cost matrix editor (tb_settings).
- **Forwarder-ops:** single-container cnt-payment+slip · bill-to-customer 4→5 · saveNote push · combine-bill editable detail · printAll/printDriver.
- **Customer (ปอน lane, owner-authorized):** forwarder self-cancel · reverse-image search · tb_notify broadcast + login-popup (M-1/FG-1) — **popup VERIFIED working** (customer-session test).
- **#23 admin-push shop disbursement** (tb_shop_pay_h/sub) · **HR pivot** attendance/leave/recruitment → tas_*/tb_post_job.
- **register phone-exists** code reveal · staff-purge **ADR-0022** + script (review-only).

**📌 REMAINING = ONLY owner-ACTIVATION + ก๊อต partner-API (no codeable-solo faithful work left):**
1. **LINE_STAFF_GROUP_ID** — ✅✅ **DONE + LIVE on prod 2026-06-01** (push-tested HTTP 200 · Vercel prod env set + redeployed `dpl_3JxNNS…` READY · `pacred.co.th` 200). Real staff groupId = **`C09344be50f51abbfb8ca9fddb24e10f9`** ("SA-MKT-PR Pacred", 14+bot=15 — matches owner's screenshot memberJoined 23:23 ICT). The `C61f…` that was in prod env = chat.line.biz OA-Manager chat-thread id (404, not pushable) — replaced. Found by READING ปอน's Cloudflare Worker data (captures every event to `Podeng_line_webhook_events`) — no deploy/edit to his Worker (owner directive: ต่อยอด ไม่ปิดกั้นน้อง). **`OTP_BYPASS`/`OTP_PEPPER` NOT touched** (owner: ห้ามแตะ OTP จนคอนเฟิม). Runbook + findings: **`docs/setup/line-staff-group-activation.md`**. (ปอน's Worker writes `Podeng_*` tables; our 0131 `line_*` unused — reconcile later, ปอน lane. CF+Vercel tokens owner-provided this session → owner can revoke; stored machine-local only, never committed.)
2. **Recreate 13 admins + run staff-purge** (owner/ภูม · ADR-0022 + `scripts/staff-purge-analysis.mjs`) → unblocks P1-15 sales-rep + report rep-names + HR adminid. (`admin_contact_extras` EMPTY + zero old↔new code overlap — confirmed.)
3. **ปอน migrate 3 corporate readers** (ADR-0021) → rebuilt `corporate` write removable.
4. **TTP + MK/MX/Sang sheet adapters** (ก๊อต partner-API).
5. **OTP bypass** (owner · waiting ThaiBulkSMS corporate-route speed).
6. Phase-C: HR work-time-clock (tas_historydataold CSV) + applicant-tracking.

**⚠️ §0c note:** customer flows (popup/image/self-cancel) verified render+no-crash with a customer session; NOT click-tested for destructive cancel (needs fstatus=1 data) + image-upload result (Laonet vendor may 403 from prod egress). Migrations 0132 applied prod. Test account PR015 password reset this turn (harmless test account).

**🧹 Local-only (won't follow to the work computer):** stale locked agent worktrees + dev server :3000. On the work computer just `git pull origin main` — everything is in the repo.

---

> 📚 **Older dated save-points (2026-05-19 → 2026-05-31) are archived** → [`docs/sprints/archive-claude-md-2026-05.md`](docs/sprints/archive-claude-md-2026-05.md) — moved out of this live context doc 2026-06-05 to stay under the AGENTS.md §12 2000-line cap. They are historical session save-points (all superseded / shipped-history). The recent save-points (2026-06-01+) above + all permanent sections below remain here.

---

# 🧬 Pacred DNA (load-bearing — read once, internalise forever)

**Company:** บริษัท แพคเรด (ประเทศไทย) จำกัด · **Pacred (Thailand) Co., Ltd.** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner **พี่ป๊อป Visit** (second-tier: เดฟ + ก๊อต).

**Scope:** ecosystem ของ import-export-customs-cargo-logistics (เคลียร์ศุลกากร · นำเข้า-ส่งออก · ขนส่งระหว่างประเทศ + ในประเทศ · ฝากสั่งซื้อ-ฝากโอน-ฝากขาย · ใบกำกับภาษี · ใบขนสินค้า · ขอคืนภาษี · ฟูมิเกชัน · แมสเซ็นเจอร์ · "และอื่นๆ ทั้งวงการ"). Markets ลำดับ: ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเล → อินโด → เมกา → อื่นๆ.

**Vision:** ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว. Full-loop service ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover ที่อื่น.

**Brand-split context (DON'T preempt cleanup):** Pacred = บริษัทใหม่ กำลังแยกจาก **PCS CARGO + TTP + ไอแต้ม**. บาง API ยัง "ยืม" เจ้าเก่าใช้ — ลบ reference เหล่านี้ **หลัง** ก๊อต confirm API switchover เสร็จ (ไม่ใช่ก่อน). Tracked in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

📋 **Full SOT:** [`docs/pacred-info.md`](docs/pacred-info.md) — addresses, phones, emails (7 depts), LINE OA, social, sales reps, JSON-LD code consumers
🧠 **Memory:** `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories)

---

# 🧭 CURRENT DIRECTION — D1: Pacred is a faithful port of PCS Cargo (2026-05-18)

**The direction changed on 2026-05-18.** The owner (พี่ป๊อป) reviewed the rebuilt-from-scratch Pacred app and **rejected it** — neither the UI nor the workflow logic-loop matches the legacy **PCS Cargo** system that staff and **~8,898 existing customers** use every day. Rebuilding fresh would force everyone to retrain.

**New direction (decision "D1"):** Pacred **becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** Not a reinterpretation; a faithful port. The canonical source of truth is **[ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)** — read it in full before any D1 work. It supersedes the "V2 = rebuilt owner-pleaser" framing of [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md).

**⚠️ Owner mandate (2026-05-19, verbatim):** *"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the original to **100% sameness FIRST**, then improve. The owner scolded the team on 2026-05-19 for screens still diverging from legacy PCS. Faithful first; improvements are Phase C only. Every Phase-B port runs through the `legacy-fidelity-check` skill.

**Three phases:**
- **Phase A — Data migration. ✅ DONE.** Ported the legacy `pcsc_main` (117 tables, ~8,898 customers, years of orders) into Pacred's PostgreSQL/Supabase. `PCS<n>` → `PR<n>` keeping the exact running number; custom auth so customers sign in with their existing password (no reset). *Status: Supabase **Pro upgrade done** (ก๊อต) · **all 117 tables loaded on dev + prod**, incl. the 3 log tables `tb_web_hs`/`tb_history_key`/`tb_history` backfilled post-Pro · **customer image + storage files uploaded to Supabase S3 prod** (`pcsracgo/public/member`) by ภูม 2026-05-24 · migrations `0081`-`0083`+`0087` on `main`.* Runbook: [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal + admin back-office — so its menus, job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy PCS system exactly**. Goal: staff + customers need *zero* retraining. *Status: **wave 1 done + integrated on `dave`** (customer 9-icon launchpad · order flow · admin per-role RBAC sidebar + badges · admin container `tb_cnt` payment ledger · legacy-auth bridge) — first-pass, not yet fidelity-verified. Waves 2+ in progress.*
- **Phase C — Pacred enhancements.** *Only after* the faithful port works, layer Pacred's own improvements on top. **Deferred — not cancelled.**

**What this means for prior work:**
- The launched rebuilt app (2026-05-17 production deploy) and its `profiles` + launch-era schema **coexist** with the ported `tb_*` schema during the transition, then retire.
- The **Tier 0/1/2/3 capability roadmap** and the **Phase-2 build queue** (booking flow · customer-intelligence · internal-chat · disbursement · china-ops · platform-observability) are **deferred to Phase C — not cancelled**, re-sequenced *after* the faithful port. [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) is the **D1 master phase plan** (current state · stages · work-lanes); its Phase-C appendix + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) describe that deferred work.
- In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1) **pauses**; the team pivots to Phase A/B.

**Decision lens (every task):** does this make the port **more faithful to PCS Cargo** — closer to *zero retraining* for staff and customers? Prefer work that moves Phase A (data migration) or Phase B (workflow fidelity) forward. De-prioritise anything that extends the rejected rebuild or belongs to the deferred Phase-C enhancements.

**Anti-patterns (under D1):**
- Extending the rejected rebuilt app or building Phase-C enhancements before the faithful port works
- Reinterpreting / "improving" the PCS workflow during Phase B — fidelity first; enhancements are Phase C
- V3 architecture redesign in this repo (V3 = `pacred-DPX`, separate repo — append ideas to `docs/v3-wishlist.md`)
- Shipping a stage before the quality gate is green (`pnpm verify` + build smoke + a functional pass)
- Scrub PCS/TTP/ไอแต้ม **before** ก๊อต API switchover (would break the revenue path)

---

# 🛑 STOP — Read your role brief FIRST (force-read every Claude Code session)

ทุก dev ใช้ Claude Code ทำงาน async บน worktree ของตัวเอง. ก่อนแตะ code หรือตอบคำถาม — **เปิด brief ของคุณก่อน**:

| ถ้าคุณคือ… | เปิดไฟล์นี้ก่อนทุกอย่าง | คุณจะรู้ทันที |
|---|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`docs/briefs/got.md`](docs/briefs/got.md) | P0/P1, ADRs ที่ต้อง lock, partner/tools picks |
| **เดฟ** (Project Lead / Integrator) | [`docs/briefs/dave.md`](docs/briefs/dave.md) | landing pivot, backend prep for ภูม, hardening |
| **ภูม** (Backend / Customer Portal / Admin) | [`docs/briefs/poom.md`](docs/briefs/poom.md) | container model, tax invoice, admin workflows |
| **ปอน** (Frontend / Landing / SEO / Marketing) | [`docs/briefs/podeng.md`](docs/briefs/podeng.md) | owner critiques, L-5 polish, SEO research |

📂 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map + onboarding flow + brief shape
📋 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (admin UI / RBAC system design)

**Why force-read?** แต่ละ brief สรุปว่า:
- คุณ own อะไร / ห้ามแตะอะไร (scope boundaries)
- งานต่อไปลำดับไหน (priority list — ไม่ต้อง re-derive จาก PORT_PLAN ทุกครั้ง)
- ติดอะไรอยู่ → ทำอะไรแทน (blockers + alternatives)
- Hand-off เข้า/ออก คุยกับใคร

อ่าน brief ก่อน → conversation รอบนี้ตรงเป้าตั้งแต่ tool call แรก. ข้าม brief = หลงเดิน.

---

# 👉 START HERE — ทีมงานทุกคน อ่านก่อนเริ่ม

📘 **[`docs/HANDBOOK.md`](docs/HANDBOOK.md)** = entry point — มี documentation map + quick start

**Canonical docs (อ่านครั้งเดียว ใช้ตลอด):**
- 👥 [`docs/team.md`](docs/team.md) — roles + permissions + branch + merge policy + daily workflow + §3.0 push-frequency cost rule (STRICTER — save-points only) + §6 self-directed mode + §9 Claude Code async collab
- 📐 [`docs/conventions.md`](docs/conventions.md) — code style + commit format + naming + DB rules + §13 docs rules (every .md ≤ 2000 lines · no duplication) + §14 pre-deploy smoke gate
- 🔐 [`docs/env.md`](docs/env.md) — every env var explained + production checklist (incl. §19 MOMO JMF)
- 🏢 [`docs/pacred-info.md`](docs/pacred-info.md) — company info SOT (addresses + phones + emails + LINE OA + sales reps)

**Role briefs (force-read — see top of file):**
- 🧑‍💻 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map for which brief is yours
- [`docs/briefs/got.md`](docs/briefs/got.md) · [`docs/briefs/dave.md`](docs/briefs/dave.md) · [`docs/briefs/poom.md`](docs/briefs/poom.md) · [`docs/briefs/podeng.md`](docs/briefs/podeng.md)
- 👷 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (system design input)

**🎯 Master strategy (single-read consolidation — all briefs + ADRs + plans condensed):**
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session, refer back as needed

**🛠 Skills kit (playbooks the agent follows when triggered):**
- [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md) — 16 skills: phase-verify-loop · bug-swarm-loop · debug-mantra · management-talk · audit-kpi-dashboard · test-coverage-writer · refactor-readability · performance-hunter · scholar-immortal · copyist-unlimited · legacy-php-sweep · qa-flow-simulator · branch-integrate-loop · mobile-first-verify · legacy-fidelity-check · landing-conversion-audit

**📚 Learnings (compounding knowledge — read before re-debugging):**
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — every agent / dev adds new entries via `scholar-immortal` skill

**Living docs (เดฟ updates):**
- 🧭 [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) — **THE current direction (D1)** — faithful PCS Cargo port, Phase A/B/C. Start here for "what's next".
- 🚀 [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — **the D1 master phase plan** — current state + the stages (A-final → B-0 → B-waves → C) + the work-lanes. The canonical "what's next" sequencing doc; deferred Phase-C/Tier detail kept as a labelled appendix.
- 🚚 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — **Phase A runbook ✅ DONE** — the `pcsc_main` (117 tables) → Supabase data migration; all 117 tables loaded on dev + prod (incl. 3 log tables backfilled post-Pro), customer images on S3 prod.
- 📋 [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) — sprint history + cargo/gap-hunt backlogs (Parts O–W; Part V = cargo-forensics, Part W = gap-hunt; ~1825 lines — watch the 2000-line cap)
- 📚 [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) — historic survey (Parts A–N — moved out to keep PORT_PLAN under 2000-line agent ceiling)
- 🏗 [`docs/architecture.md`](docs/architecture.md) — system diagrams + DB schema + auth + security
- 🏗 [`docs/architecture/container-centric-model.md`](docs/architecture/container-centric-model.md) — **NEW** warehouse/container/shipment spine (4 tables, RLS, status enums, CT-1..CT-8 implementation)
- 🤝 [`docs/integrations/momo-jmf.md`](docs/integrations/momo-jmf.md) — MOMO partner API spec (JWT, endpoint inventory TBD)
- 🧠 [`docs/PACRED-SECOND-BRAIN.md`](docs/PACRED-SECOND-BRAIN.md) — context notes + gotchas

**Reference (open เมื่อจำเป็น):**
- [`AGENTS.md`](AGENTS.md) — Next 16 breaking changes (สำหรับ Claude/AI)
- [`docs/decisions/*.md`](docs/decisions/) — ADRs (incl. 0010 V2/V3 version strategy, 0006 tax invoice, 0007 analytics, 0014 state transitions, 0015 withholding tax, 0016 freight value model)
- [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) — **NEW** LINE chat audit (จุดรั่ว + MOMO status enum canonical + workflows team really uses)
- [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) — **NEW** PHP cleanup sweep (~115 dead-code files + 6 NEW critical security findings + 5 minor port gaps)
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) — **NEW** decoded cargo/freight ops model (GZE truck / GZS sea · A/M/X/O/Z types · Form E / D-O / invoice-value engineering) + ไอแต้ม-chat problem catalog → PORT_PLAN Part V
- 🆕 [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) — capability synthesis (growth / operating-system / build-vs-buy) → the Tier 0/1/2/3 roadmap. **Deferred to Phase C by D1** ([ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)) — not the current "what's next".
- 🆕 [`docs/research/PACRED-MASTER-STRATEGY.md`](docs/research/PACRED-MASTER-STRATEGY.md) — **chained gap-hunt synthesis** — rolls the 5 source-code gap docs ([`docs/research/`](docs/research/_index.md)) into 4 problems: a 🔴 P0 security keystone (`driver`/`warehouse` RLS reach all money tables — fix launch-week), the 🔴 wallet-leak chain, the "islands with no bridges" flow-wiring workstream, and **[PORT_PLAN Part W](docs/PORT_PLAN.md)** backlog
- [`docs/audit/owasp-2026-05.md`](docs/audit/owasp-2026-05.md) — pre-launch security posture (note: superseded on RLS-vs-role-model by the master strategy §1)
- [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) — deep legacy PHP integrations audit (companion to legacy-cleanup-2026-05-16)
- [`docs/runbook/*.md`](docs/runbook/) — operational runbooks (PCS scrub + OTP rotation + cron + cargo smoke test T-D1)
- [`docs/setup/*.md`](docs/setup/) — onboarding guides (OAuth/Supabase/Vercel/LINE)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration runbook

**ทำงานครั้งแรก:**
1. **เปิด YOUR brief จาก [`docs/briefs/`](docs/briefs/)** ก่อนทุกอย่าง (force-read — see top of file)
2. อ่าน [`docs/HANDBOOK.md`](docs/HANDBOOK.md) → [`docs/team.md`](docs/team.md) → [`docs/conventions.md`](docs/conventions.md)
3. `cp .env.example .env.local` + fill values (ถามเดฟ) — รายละเอียดทุก var ใน [`docs/env.md`](docs/env.md)
4. รัน migration ที่ยังไม่ได้รัน — ดู [`supabase/migrations/README.md`](supabase/migrations/README.md)
5. หางานของตัวเอง: brief ของคุณ + [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) §"Work-split" (current per-role D1 work)
6. Sync branch ตามวิธีใน [`docs/team.md`](docs/team.md) §3 (น้อง pull จาก `dave` ไม่ใช่ `main`!) + §3.0 push-frequency rule (save-points only — sleep / machine change / location change / big batch done; per memory `push_frequency_strict`)

---

# Project Snapshot — pacred-web

Last updated: 2026-05-19 (D1 — Phase A data loaded to dev + prod · Phase B wave-1 integrated — see [ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md) + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md))

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + customer member portal + admin back-office. The rebuilt app launched 2026-05-17, but on **2026-05-18 the owner redirected the project (D1)** — Pacred is now a **faithful port of the legacy PCS Cargo system** (`PCS` → `PR`). Current work: **Phase A ✅ DONE** (legacy `pcsc_main` fully loaded to prod Supabase — all 117 tables incl. 3 log tables backfilled post-Pro · customer images on S3 prod) → **Phase B in progress** (workflow fidelity — wave 1 integrated on `dave-pacred`, 1:1 transcription continues on customer + admin lanes — wave-17+ work also accumulating on `Poom-pacred` for V3 features). See the "CURRENT DIRECTION — D1" section at the top of this file + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) for the full phase plan.

> 🎯 **Live state** — ดูที่ [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The "Auth & Backend State" section below and STRATEGY.md §9 describe the **rebuilt** app — that work is preserved + coexists with the ported `tb_*` schema during the D1 transition, but the rebuilt schema/workflow is no longer the target; the legacy PCS workflow is. Phase B reworks the app to match it.

## Stack
- Next.js **16.2.6** (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน [app/globals.css](app/globals.css) — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- **next-intl** ^4.11.1 — i18n (th/en) แบบ namespace ใน [messages/](messages/)
- **lucide-react** ^1.14.0 — icons (Lucide outline-style ทั้งโปรเจกต์)
- Package manager: **pnpm**

> หมายเหตุ: middleware อยู่ที่ [proxy.ts](proxy.ts) (ไม่ใช่ `middleware.ts` — เป็นรูปแบบของ Next 16)

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions

📐 Full convention rules → [`docs/conventions.md`](docs/conventions.md) (CANONICAL — code style + commit format + naming + DB rules + §13 docs rules ≤2000 lines · no duplication + §14 pre-deploy smoke gate).

**Hot tips you'll trip on:**
- Path alias `@/*` → `./*`; locale prefix `as-needed`; default locale TH; `Link` from `@/i18n/navigation` (NOT `next/link`)
- Tailwind v4 → `@theme inline` in [`app/globals.css`](app/globals.css) (no `tailwind.config.js`); brand red = `primary-600` (#B30000)
- Component split: section-level → [`components/sections/`](components/sections/); reusable UI → [`components/ui/`](components/ui/); default Server Component unless state needed
- i18n: TH+EN parity in [`messages/th.json`](messages/th.json) + [`messages/en.json`](messages/en.json); `pnpm audit:i18n` enforces

## Folder Structure

📁 **Live tree** is the authoritative source — `ls app/[locale]/` to see actual routes. High-level shape:

- `app/[locale]/(public)/` — marketing site + landing pages (no auth)
- `app/[locale]/(auth)/` — login/register/forgot — guests only; auto-redirect signed-in to `/`
- `app/[locale]/(protected)/` — customer portal (dashboard / orders / wallet / shipments / etc.) — `requireAuth()` gate
- `app/[locale]/(admin)/admin/*` — admin back-office — `requireAdmin()` gate per [ADR-0002](docs/decisions/0002-admin-architecture.md)
- `actions/` — Server Actions (`actions/auth.ts`, `actions/wallet.ts`, etc.); admin variants in `actions/admin/*`
- `lib/` — `supabase/{client,server,admin}.ts` · `auth/*` · `sms/gateway.ts` · `notifications/*` · `validators/*` (Zod) · `pdf/*` · `forwarder/calc-price.ts`
- `supabase/migrations/` — 0001..0087 numbered migrations (`0065` is an intentional unused gap; `0081`-`0083` = the D1 legacy `tb_*` schema/indexes/member-seq, applied to dev + prod; `0087` = a migration-view security fix — see [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) §9; next free number `0088`); see [`supabase/migrations/README.md`](supabase/migrations/README.md)
- `proxy.ts` (NOT `middleware.ts` — Next 16 rename) at repo root

## Auth & Backend State (rebuilt app — coexists during the D1 transition)

> ⚠️ **D1 note:** this section describes the **rebuilt** app's auth/backend (Phase 1-5 pre-D1). Under D1 it **coexists** with the ported legacy `tb_*` schema and the legacy-auth bridge (`lib/auth/pcs-legacy-bridge.ts` — migrated PCS customers sign in with their existing password, no reset) during the transition, then retires. Phase-B work reworks these surfaces onto the `tb_*` schema.

### What works
- **Supabase Auth** — email/phone + password. Social login (Google/Facebook OAuth + LINE) is gated OFF by default behind `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` → the buttons render greyed-out "COMING SOON" (legacy PCS was password-only; D1 defers social login to Phase C)
- **Legacy-auth bridge** — `lib/auth/pcs-legacy-password.ts` + `pcs-legacy-bridge.ts` — migrated PCS customers sign in with their **existing** PCS password (no reset) via a "เชื่อมต่อบัญชี PCS CARGO" login; the 79-char legacy hash is verified against the ported `tb_users.userpass`
- **DB** — profiles (auto-gen `PR001` member_code — PR + min-3-digit running no.), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live + current state

📊 **Live state snapshot** is in [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The lists below were Phase 1-5 historic — **current state lives in STRATEGY.md §9, not here**.

Shipped + in production: customer portal (`/service-order` · `/service-import` · `/service-payment` · `/wallet` +deposit/+history/+withdraw · `/refunds` · `/sales` · `/notifications` · `/shipments` +[code]) · `/admin/*` (60+ routes incl. accounting/container-costs · disbursements · refunds · migration/pcs-customers · search · system/crons · system/notifications) · tax-invoice flow · pay-from-wallet self-serve · customer credit line · staff RBAC console. **Post-launch U1/U2/U4 + Tier 0/1/2 features shipped on `dave`** — incl. `/contact` lead funnel · `/start-order` + `QuoteCTA` buy-bridge · `/admin/kpi` exec dashboard · `/admin/board` + `/admin/inbox` work-board. See STRATEGY.md §9 + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md).

## Architecture & Roadmap

📐 **Blueprint:** [`docs/architecture.md`](docs/architecture.md) — full diagrams, DB schema, auth flows, security model.

🎯 **Master strategy (single-read consolidation):** [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session.

📋 **Locked decisions (ADRs):** [`docs/decisions/`](docs/decisions/) — 17 ADRs + drafts. The high-leverage ones:
- **ADR-0017 — D1: Pacred = faithful PCS Cargo port** (the current direction — supersedes the "V2 = rebuilt owner-pleaser" framing of ADR-0010)
- ADR-0001 LINE Notify → Messaging API push (creds set; LIFF pending DV-2)
- ADR-0002 admin architecture (`is_admin()` SECURITY DEFINER + `admins` table)
- ADR-0003 China-search Option E (Track G code, prod=demo mode)
- ADR-0004 PromptPay-only pre-beta; Omise/2C2P/Stripe = post-beta ([decision matrix](docs/decisions/d7-payment-gateway-decision-matrix.md) ready)
- ADR-0006 tax invoice (RD Code 86)
- ADR-0007 GTM + Clarity + cookie A/B
- ADR-0010 V2 vs V3 (`pacred-dpx`) — note: the "V2 = rebuilt owner-pleaser" definition is superseded by ADR-0017 (V2 is now the faithful PCS port); V3 unaffected
- ADR-0014 customer self-service state transitions (admin-client-after-ownership-verify)
- ADR-0015/0016 ✅ Accepted 2026-05-16 (WHT model + freight value model)
- ADR-0011/0012/0013 (DRAFT — V3 RBAC granular + ERP shell + V2→V3 migration; deferred T+30d)

🌱 **Infra stack:** Vercel + Supabase Cloud · `proxy.ts` middleware · ThaiBulkSMS OTP (`OTP_BYPASS` flag) · `member_code` = `PR001` running — **PR + minimum 3 digits**, overflow-safe past PR999 (Postgres trigger `generate_member_code`, migration `0060`; **NO compat with PHP `PCS<num>`** — Pacred is new company).

---

# 🌐 Pacred Ecosystem (brand + service catalogue)

> **Pacred** = บริษัทใหม่ (ไม่ใช่ PCS Cargo เดิม) — เป็น **all-in-one shipping/customs/cargo platform** ที่กินรวบทุกบริการในห่วงโซ่นำเข้า-ส่งออก
>
> ระบบ PHP เก่าครอบคลุมเฉพาะฝั่ง **Cargo** (จีน-ไทย ฝากสั่ง/ฝากนำเข้า/ฝากโอน) เท่านั้น — Pacred ขยายไปฝั่ง **Freight** (FCL/LCL ระหว่างประเทศ + customs/clearance/export) ครบทั้ง ecosystem

## Brand & social channels
- **Company:** Pacred
- **LINE OA:** https://lin.ee/Yg3fU0I  *(แทน LINE Notify เดิม — LINE Notify EOL Apr 2025)*
- **YouTube:** https://www.youtube.com/@PacredShipping
- **Facebook:** https://www.facebook.com/PacredShippingCustomsClearanceImportExport/
- **TikTok:** https://www.tiktok.com/@pacred.co
- **Instagram:** https://www.instagram.com/pacred.co/

## Service catalogue

แต่ละบริการมี **landing page ของตัวเอง** ที่ `/services/<slug>` (public, ไม่ต้อง login) — กดจาก landing เพื่อ "ใช้บริการ" → redirect เข้าระบบหลังบ้าน (`/(protected)/...`) ที่ตรงกับ service นั้น

| # | Service (TH) | slug | กลุ่ม | สถานะ in PHP เดิม | Backend module (Next.js) |
|---|---|---|---|---|---|
| 1 | จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ (YY) | `customs-broker-matching` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 2 | ฝากสั่งซื้อสินค้า (China shopping cart) | `shop-order` | cargo | ✅ shops.php / cart.php | `(protected)/service-order/` |
| 3 | ฝากโอนชำระสินค้า (Yuan transfer / Alipay) | `yuan-transfer` | cargo | ✅ payment.php | `(protected)/service-payment/` |
| 4 | ฝากนำเข้าสินค้า — **FCL / LCL ทุกเทอม** (รถ/เรือ/แอร์) + **Cargo** (รถ/เรือ/แอร์) | `import` | both | 🟡 เฉพาะ cargo (forwarder.php) | `(protected)/service-import/` (รองรับ multi-mode) |
| 5 | ขอคืนภาษี (Tax refund) | `tax-refund` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 6 | เคลียร์สินค้าติดด่าน (รถ/เรือ/แอร์) | `customs-clearance` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 7 | ออกใบกำกับภาษี (Tax invoice) | `tax-invoice` | freight | partial (admin only ใน PHP) | TBD (ต่อยอดจาก receipts) |
| 8 | ออกใบขนสินค้า (Customs declaration form) | `shipping-document` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 9 | ส่งออกสินค้า (Export) | `export` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 10 | บริการฟูมิเกชัน (Fumigation) | `fumigation` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 11 | บริการฝากขายสินค้า (Consignment) | `consignment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 12 | บริการฝากจ่ายบริการ (Pay-on-behalf services) | `bill-payment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 13 | ขนส่งภายในประเทศ + ต่างประเทศ + แมสเซ็นเจอร์ (Logistics + Messenger) | `logistics` | both | ❌ ใหม่ทั้งหมด | TBD |

**กลุ่ม:**
- 🟦 **cargo** = ระบบเดิมจาก PHP `pcs-cargo` (จีน→ไทย, ฝากสั่ง/นำเข้า/โอน)
- 🟧 **freight** = ส่วนขยายใหม่ของ Pacred (international FCL/LCL, customs broker, export)
- 🟪 **both** = บริการที่ครอบคลุมทั้งสองฝั่ง
- ⬜ **new** = ฟีเจอร์ใหม่ที่ไม่เคยมีในเครือเดิม

## Routing convention (planned)

```
app/[locale]/(public)/
├─ page.tsx                       # home (มีแล้ว)
└─ services/
   ├─ page.tsx                    # ภาพรวมทุกบริการ (service grid)
   └─ [slug]/page.tsx             # landing แต่ละบริการ (dynamic, content จาก CMS หรือ MDX)

app/[locale]/(protected)/         # หลังบ้าน (ลูกค้า)
├─ service-order/                 # = slug shop-order
├─ service-payment/               # = slug yuan-transfer
├─ service-import/                # = slug import (รองรับ FCL/LCL/Cargo modes)
└─ ... (modules ใหม่ตาม service catalogue)
```

**หมายเหตุ:** อาจใช้ MDX-per-service หรือ Sanity/Payload CMS ถ้า marketing ต้องแก้ landing บ่อย — ตัดสินใจตอนเริ่ม Phase H (rebrand)

---

# 👥 Team & Branch workflow

> ⚠️ **CANONICAL doc moved to [`docs/team.md`](docs/team.md)** — full role/branch/merge policy + daily workflow + safety rules
> ห้าม duplicate รายละเอียดที่นี่ — อ่านที่ `docs/team.md` ครั้งเดียว ที่เดียว

**TL;DR:**

| คน | บทบาท | Branch | Push to main |
|---|---|---|---|
| **ก๊อต** | Senior Advisor | (review only) | ✅ |
| **เดฟ** | Project Lead | `dave` | ✅ |
| **ปอน** | Frontend & SEO | `podeng` | ❌ (own branch) |
| **ภูม** | Backend & Cargo Port | `Poom` | ❌ (own branch) |

**Daily sync (every morning):**
```bash
git checkout main && git pull origin main
git checkout <my-branch> && git merge main && git push origin <my-branch>
```

**Conflict / safety:** อย่าใช้ `--force` / `reset --hard` ถ้าไม่แน่ใจ — full safety rules ใน [`docs/team.md`](docs/team.md) §5

---

## Working with this codebase

### Add a section to home
- New component in [components/sections/](components/sections/)
- Import in [app/[locale]/(public)/page.tsx](app/[locale]/(public)/page.tsx)

### Add a new feature/system (pattern)
1. SQL: add table + RLS in `supabase/migrations/NNNN_<name>.sql`
2. Validator: Zod schema in `lib/validators/<name>.ts`
3. Server Action: mutations in `actions/<name>.ts` (`"use server"`)
4. Pages: under `app/[locale]/(protected)/<name>/` (auth-guarded)
5. i18n: add keys in [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) namespace
6. (optional) Realtime: subscribe via `supabase.channel(...)` in `"use client"` component

→ See [actions/orders.ts](actions/orders.ts) + [app/[locale]/(protected)/orders/](app/[locale]/(protected)/orders/) as a working reference

### Common edits
- Locale string → both `messages/th.json` + `messages/en.json`
- Theme color → `@theme inline` in [app/globals.css](app/globals.css)
- Auth check on a page → `await requireAuth()` from `lib/auth/require-auth.ts`
- Get current user → `await getCurrentUserWithProfile()` from `lib/auth/get-user.ts`
- Mutate Supabase from Server Action → `await createClient()` from `lib/supabase/server.ts`
- Bypass RLS (admin only) → `createAdminClient()` from `lib/supabase/admin.ts`

---

# 📋 Legacy PHP Port Plan (in progress)

> **Goal:** Port ทั้งระบบ PHP เดิม (`/Users/dev/Desktop/pcscargo/member/` บน Mac · `C:\xampp\htdocs\pcscargo\member\` บน Windows) มาเป็น Next.js + Supabase
> **Strategy:** เอา **logic + structure** มาก่อน ไม่ต้อง migrate data → ค่อย rebrand UI/UX + จัดกลุ่มใหม่ในเฟสถัดไป
> **Order:** ฝั่งลูกค้าก่อน (member portal) → ฝั่ง admin (back office)
>
> ⚠️ **Scope reminder:** PHP เดิมครอบทั้ง **cargo** (services #2, #3, #4-cargo-mode) **+ freight** (ใน `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, withdraw-commission-*}`) — services อื่น (`#1, #5-13`) ต้อง **build ใหม่ทั้งหมด** ในเฟสถัดไป (Phase I+)
>
> 🆕 **AUTHORITATIVE gap status (2026-05-16 night):** [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) — เดฟ-led 4-agent deep-sweep against 20,331 .php files + verification pass. Found **17 NEW DB tables** + **12 freight subdirs** + **24 admin polish items** that the prior `legacy-cleanup-2026-05-16` audit §6 missed. The deep-sweep audit replaces §6 "should-port" assessment; tables below remain useful as **customer-side / admin-side historical reference** but for current Sunday-night blockers + V2 long-phase backlog **read the deep-sweep doc + [PORT_PLAN Part V](docs/PORT_PLAN.md) V-E6..V-E12 / V-G / V-H**.

## Survey snapshot (สำรวจแล้ว 2026-05-12; updated 2026-05-16 deep-sweep)

- **PHP source:** `/Users/dev/Desktop/pcscargo/member/` (Mac) · `C:\xampp\htdocs\pcscargo\member\` (Windows) — 20,331 .php files / 2.2 GB
- **DB:** MySQL `pcsc_main` (110+ tables; full schema in legacy SQL dumps)
- **member_code เดิม:** `PCS<int>` (PHP) — **ทิ้งไม่ใช้**; Pacred ใช้ `PR001` running (PR + ขั้นต่ำ 3 หลัก)
- **Stack PHP:** mysqli plain SQL, mPDF (THSarabunNew), PHPMailer, Bootstrap 4

## Customer-side / Admin-side feature maps + migration concerns + integrations

**Authoritative live docs (read these, not duplicates below):**

| What you need | Where it lives |
|---|---|
| Per-feature port status + tasks | [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (most active) + archive Parts A-N |
| Master gap audit (20k file sweep) | [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) |
| Deep integrations + secrets inventory | [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) (TAMIT, JMF, LINE Notify, SMS, OAuth, mPDF) |
| Dead-code + security findings (S-1..S-6) | [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) §1-5 (§6 superseded by deep-sweep) |
| Cargo ops decoded (GZE/GZS / A-M-X-O-Z / Form E / D-O / "แผน VAT") | [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) |
| Chat-derived workflows (W-1..W-9) + leak holes (L-1..L-10) | [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) |
| Cutover dependency burn-down (F1-1..F1-8) | [`docs/runbook/legacy-cutover-tracker.md`](docs/runbook/legacy-cutover-tracker.md) |
| Per-task implementation specs (V-D / V-E / V-G / etc.) | [`docs/port-specs/`](docs/port-specs/) — 10 spec docs |
| Per-task ADR decisions | [`docs/decisions/`](docs/decisions/) — 16 ADRs + 5 plans/matrices |

## Phased roadmap

> **Historic Phase A-I list moved to:** [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (live) + [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) (Phase A-N historic).
>
> **Current state (2026-05-16):** Phase A-F ✅ shipped · Phase G admin back-office ~98% HR + ~50% ops + 60+ routes shipped · Phase H polish ongoing · Phase I expansion = V2 long-phase post-Monday-launch ([port-specs/](docs/port-specs/) for V-E6..V-E12 freight stack + V-G admin polish).

## Key references (อย่าลืม consult)

- **PHP source:** `/Users/dev/Desktop/pcscargo/` (Mac) · `C:\xampp\htdocs\pcscargo\` (Windows)
- **Admin source:** `<root>/member/pcs-admin/` (187 entry .php + 85 business-logic subdirs under `include/pages/`)
- **Helper catalogue:** `<root>/member/include/function.php` (2451 LOC) + `<root>/member/pcs-admin/include/function.php` (3500 LOC)
- **Schema dump:** legacy SQL dumps (see `docs/audit/legacy-cleanup-2026-05-16.md` §7)
- **Use legacy-php-sweep skill** (`.claude/skills/legacy-php-sweep/SKILL.md`) when porting any feature
