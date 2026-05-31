# 🟢 Save-point — 2026-06-01 · เดฟ · admin-backend faithful-port backlog CLEARED

**State:** `main` = `dave-pacred` = **`9bdd7d74`** (0/0 · prod · Vercel auto-deploys) · all pushed · every commit gated `pnpm verify` EXIT 0 + `pnpm build` EXIT 0. Working tree clean. dev standby :3000.

This was a marathon multi-wave session (owner: "ลุยมาให้จบให้ครบก่อน ค่อยลุยส่วนตัดสินใจ" / "แยกร่างทำได้เลย ทั้งของภูมิกับปอน"). The whole **admin-backend faithful-port backlog is essentially cleared** — what remains is owner DECISIONS + ACTIVATION, not codeable-solo work.

---

## 🚀 Shipped this session (the full arc)
**เดฟ-direct:** Theme A forwarder `[fNo]` editor (tombstone money dead-write + payment/address/transport/cover/owner/cost-adjust/fShipBy/amountCount/**fCredit**) · Theme B general-rate editor → tb_rate_g_* · reports VAT7-fidelity + 5-orphan reachability · register phone-exists code reveal · the verified member-code investigation (no bug — trigger lowest-vacant correct; PR10891 = migrated legacy numbers).

**Parallel worktree agents (proven pattern — flat Agent + isolation:worktree + disjoint files + tsc/tsx-only + merge-serial + verify-once):**
- Reports: daily-profit SVG graph + shops recompute-live + sales-monthly (tb_sales_report 17k)
- Settings: 144-cell forwarder default-cost matrix editor (tb_settings)
- staff-purge ADR-0022 + FK-remap runbook (review-only)
- forwarder ops P1-6/7/9 (cnt-payment+slip / bill-4to5 / saveNote)
- 2 monitoring reports (search-demand tb_history_key / sms-usage tb_sms_hs)
- 4 org-channel registries (tell/line/wechat/domainname)
- agent-commission payout report (tb_user_sales*)
- printAll box-labels + printDriver picking slip (Pacred brand)
- customer forwarder self-cancel + reverse-image search wiring (ปอน lane)
- tb_notify broadcast + customer login-popup repoint (M-1 · FG-1)
- **#23 admin-push shop disbursement** (tb_shop_pay_h/sub + hShopPay flip)
- **combine-bill editable per-bill detail** (tb_bill line items)
- **single-row driver-assign on real rows** (reuse bulkAssignDriver)
- **HR pivot** attendance/leave/recruitment → tas_*/tb_post_job

~20 commits · main a7e69375…9bdd7d74.

---

## 📌 REMAINING — all need owner/teammate (no clean-solo faithful work left)

### B — owner DECISION
- **bill-to-override** — Pacred-original; tb_forwarder has no bill-to column → owner picks: add a column (migration on 47k rows) vs side-table. THEN ~30min to build.
- **TTP integration** + **MK/MX/Sang sheet adapters** — ก๊อต partner-API lane.

### C — ACTIVATION (code ready, pluggable)
- **LINE_STAFF_GROUP_ID** — owner adds @pacred bot to the real staff LINE group → read real groupId (current `C61f…` from chat.line.biz = OA-Manager id, NOT a pushable groupId; wire-test 404). Then P1-24 staff-notify fires.
- **13-admin recreate + staff-purge** (ADR-0022 + `scripts/staff-purge-analysis.mjs` ready · owner/ภูม) → unblocks P1-15 sales-rep auto-assign + sales-monthly rep names + HR `adminid` resolution. (Confirmed: `admin_contact_extras` EMPTY + live admin codes have ZERO overlap with the 13-row tb_admin roster.)
- **ปอน migrate 3 corporate readers** (ADR-0021) → then the rebuilt `corporate` write is removable.

### D — verification gap (§0c)
- Customer flows (login popup / reverse-image search / forwarder self-cancel) shipped but NOT click-tested with a customer session (preview has admin session). **Popup is currently INERT** (tb_notify has 0 active-window rows → renders null for all). Recommend a customer-session click-through before relying on these.

### E — owner-deferred
- OTP `EMERGENCY_OTP_BYPASS` — waiting on ThaiBulkSMS corporate-route speed.

### F — cleanup
- Stale locked worktrees (this session's earlier waves + old preserved WIP from prior sessions) — prunable. The OLD preserved WIP branches (a1eb72903/a6ce5501/a8205b63/… + wf_b0c5a02b-*) should be reconciled, not blind-deleted.

---

## ▶️ RESUME
```bash
cd /Users/dev/pacred-web && git fetch origin --prune && git checkout dave-pacred && git pull origin main --no-edit
git rev-list --left-right --count origin/main...HEAD   # expect 0 0
cat docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md   # verified gap status
cat docs/decisions/0022-staff-purge-and-reregister.md          # the staff-purge plan
# dev: preview "pacred-1to1" on :3000
```
**Teammates:** ภูม Poom-pacred + ปอน InwPond007 → `git pull origin main` (all lanes integrated).
**Next:** owner decides B (bill-to) + activates C (LINE group, 13-admins, corporate readers). HR work-time-clock (tas_historydataold CSV) + applicant-tracking are flagged Phase-C follow-ups.
