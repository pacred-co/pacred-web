# 🟢 Save-point — 2026-05-31 · เดฟ autonomous session (close-out)

**State:** `main` = `dave-pacred` = **`2da000cc`** (0/0 · prod · Vercel auto-deploys) · everything pushed · working tree clean (only `.claude/settings.local.json` machine-local noise).

---

## 🚀 SHIPPED to main this session (5 batches)

### Batch 0 — integrate teammates
- **ภูม Poom-pacred** (11 commits): P0-13 5-tab shop UPDATE · P0-16 per-item refund · P1-5 earn-trigger · P1-10 promo carry · P1-13 refund repoint · bug#2 hnote · ws polyfill (qa-flow Node<22 compat).
- **ปอน InwPond007** (1,913 LOC): `/payment-due` NEW page (cross-service ต้องชำระ) · address-book CRUD popups (P1-29) · payment-due-count API + sidebar badge.

### Batch 1 — 4-agent parallel (worktree-isolated, disjoint, no host-thrash)
- **A · P0-19 Phase 3** slip-top-up (wallet ไม่พอ → admin slip ส่วนต่าง → จ่ายจังหวะเดียว · `tb_wallet`/`_hs`/`_paydeposit`)
- **B · P1-16** register seed `tb_wallet`+`tb_cash_back` · juristic→`tb_corporate`
- **C · P1-18** getShipBy carrier picker + checkFreeArea (func-first; ปอน styles)
- **D · P0-23** commission earn→withdraw E2E on `tb_user_sales` (Path A) + **ADR-0020**

### Batch 2 — เดฟ + 2 agents
- **E · P0-23 admin pay-out** `/admin/sales-payouts` repoint dead→`tb_user_sales_admin_pay` (status 2→3 + slip · `AND status=2` guard)
- **F · Corporate SOT** 4 เดฟ-lane readers `corporate`→`tb_corporate` (match shipped P0-18) · **ADR-0021**
- **P1-15** sales-rep assign at REGISTER not approve (`lib/admin/assign-sales-rep.ts`)

### Batch 3 — ภูม sitting-H + notify
- **ภูม sitting-H** integrated: PEAK accounting (tax-invoices 7-tab + receipts explorer)
- **P1-24** staff-group LINE notify (`lib/notifications/staff-group.ts`) wired into both yuan-create paths
- **P1-23** investigated → **NOT a real gap** (legacy gates only `walletTotal>0`; Pacred already covers)

### Earlier same session
- Poom-pacred + InwPond007 integrate · qa-flow ws polyfill · CRON_SECRET generated (owner set on Vercel) · OTP confirmed env-gated correct.

**Gate discipline (every ship):** `pnpm verify` EXIT 0 · all DB tests pass · qa-flow wallet-delta 17/0 · `pnpm build` EXIT 0.

---

## 🔑 3 ACTIVATION items — code is pluggable, waiting on owner/teammate

| # | Action | Unlocks | How |
|---|---|---|---|
| 1 | Set **`LINE_STAFF_GROUP_ID`** on Vercel prod + `.env.local` | P1-24 staff-group notify starts firing | Add @pacred OA bot (channel 2009931373) to the internal staff LINE group → read `groupId` (`Cxxxx…`) from the join webhook event |
| 2 | **ภูม recreate 13 admins** via `/admin/admins/new` | P1-15 sales-rep auto-assign (register + approve) | reference `docs/research/tb-admin-13-row-reference.md` · ~45 min · prod `admins` currently has 0 active sales reps so assignment returns null until done |
| 3 | **ปอน migrate 3 customer-UI corporate readers** | Lets the rebuilt `corporate` write be removed (final corporate cleanup) | `service-payment/[id]`, `service-import/[fNo]/receipt`, `register/page.tsx` → read `tb_corporate` by userid (ADR-0021 checklist) |

---

## 🔍 Legacy source findings (owner gave full legacy bypass)
- **customer ฝากโอน self-submit does NOT exist in legacy** — yuan was ADMIN-created on behalf via `pcs-admin/payment.php` (the ONLY `INSERT INTO tb_payment` in the entire tree). Pacred's customer self-submit is a Pacred-added feature.
- Legacy customer portal = router + `include/pages/<feature>/` handlers (NO `member/*.php`).
- The `lineNotify*` family all POST to `notify-api.line.me` = **LINE Notify API, EOL Apr 2025** (dead). Staff pings must move to LINE OA push.

## 🧠 New ADRs / learnings this session
- **ADR-0018** wallet-SOT (`tb_wallet`) · **ADR-0019** handshakes · **ADR-0020** commission-SOT (`tb_user_sales`) · **ADR-0021** corporate-SOT (`tb_corporate`)
- `docs/learnings/php-port-patterns.md` — **casing landmine**: `tb_users`/`tb_admin`/`tb_co` are camelCase on prod (`userID`,`userShipBy`,`coID`); ALL other `tb_*` lowercase. Migration file 0081 LIES. tsc can't catch a wrong column string — only a prod-hitting DB test does.
- **Orchestration pattern that works:** flat `Agent` calls + `isolation:"worktree"` + disjoint-files-verified-before-spawn + agents FORBIDDEN `pnpm build`/`pnpm dev` (tsc+tsx only) + merge serial + verify once. No host-thrash. (Avoid the 119-agent Workflow `{schema}` bonfire.)

---

## 🔴 Remaining work by lane (เดฟ-backend solo is EXHAUSTED — rest needs lane/source)

| Item | Owner | Blocked by |
|---|---|---|
| P1-3 forwarder `[fNo]` dual-mode UUID→legacy (detail edit/cost/driver/bill panels render rebuilt-schema-only) | **ภูม** adm-09 | big rewrite in ภูม's lane; pattern = his shipped P0-14. Coordinate. |
| P1-20 forwarder.ts dead-write cluster cleanup | เดฟ/ภูม | has preserved WIP branch `worktree-agent-a6ce5501` — reconcile, don't re-derive |
| P1-19/22/29/30 + `/service-payment/add` UI · P1-30 reverse-image search UI | **ปอน** | customer-frontend lane |
| P0-12 yuan manual-create self-approve + notify | **ภูม** | adm-11 lane |
| OTP `EMERGENCY_OTP_BYPASS` flip | owner | deferred until ThaiBulkSMS corporate route fast |

---

## ▶️ RESUME (new session — copy-paste)

```bash
cd /Users/dev/pacred-web
git fetch origin --prune
git checkout dave-pacred && git pull origin main --no-edit
git rev-list --left-right --count origin/main...HEAD   # expect 0  0
head -60 CLAUDE.md                                      # this session's top section
cat docs/research/save-point-2026-05-31-dave-autonomous.md   # this file
pnpm dev   # port 3000 (or use .claude/launch.json "pacred-1to1")
```

**Teammates first thing:** ภูม + ปอน run `git pull origin main` (Poom-pacred 28 behind · InwPond007 54 behind · all their work already integrated).

**Pickup options next session:**
- **A** — Set `LINE_STAFF_GROUP_ID` → wire-test P1-24 staff notify end-to-end (needs the group + bot)
- **B** — เดฟ enters ภูม lane (with go-ahead): P1-3 forwarder `[fNo]` dual-mode rewrite (~3-4h)
- **C** — Reconcile preserved WIP branches (cust-03 forwarder `worktree-agent-a6ce5501` · P0-19 slip-ph done · dashboard de-bloat → hand to ปอน)
- **D** — Integrate next ภูม/ปอน push (branch-integrate-loop) + ship
```
