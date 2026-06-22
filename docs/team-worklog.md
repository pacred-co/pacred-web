# 🛠 Team worklog — who's building what RIGHT NOW (collision registry)

> **Purpose (owner 2026-06-22):** *"ทำงานกันเป็นทีม … อยากให้รู้ว่าเรื่องนี้ชนกันนะ … แบบที่ชนกันตรงๆ จริงจังๆ … จะได้ไม่เสียเวลา … ต้องรู้ว่าใครทำเรื่องไหน … ทุกคนใช้โค้ดเดียวกัน ใช้แผนเดียวกัน."*
>
> This is the **single place** every dev declares what they're touching, so we catch a REAL collision (same file / same DB table-change / same migration number / same feature-route) before two people redo or clobber each other's work. A shared *area* (both in "accounting") is **not** a collision — only a direct overlap is. Update your row when you START and when you FINISH. Read it before you start anything.
>
> **The collision skill that drives this:** [`.claude/skills/team-collision-check/SKILL.md`](../.claude/skills/team-collision-check/SKILL.md).

## How to use (30 seconds, every time)
1. **Before starting:** read the ACTIVE table below + `git log origin/dave-pacred..origin/<teammate-branch> --stat` for what they touched. If your feature/files/table/migration overlaps a teammate's ACTIVE row → coordinate FIRST (see the skill).
2. **Claim it:** add/update your ACTIVE row — feature, the key files/tables, your migration number (reserve from the [migration ledger](runbook/migration-ledger.md)), branch.
3. **When done:** move your row to DONE (or delete it) so the registry shows only live work.

## Shared anchors (the "แผนเดียวกัน / โค้ดเดียวกัน")
- **Trunk:** everyone bases on `dave-pacred` (= the integration branch); เดฟ promotes to `main` on the owner's go.
- **Migration numbers:** reserve the NEXT FREE here + in [`docs/runbook/migration-ledger.md`](runbook/migration-ledger.md) so two devs never grab the same number. **NEXT FREE migration = 0199.**
- **Plans:** the accounting build = [`docs/research/pay-and-accounting-gap-2026-06-21.md`](research/pay-and-accounting-gap-2026-06-21.md) (B1-B7). Port plan = [`docs/PORT_PLAN.md`](PORT_PLAN.md). UX standard = [`docs/learnings/self-explaining-row-design.md`](learnings/self-explaining-row-design.md) + AGENTS §0g/§0h.

---

## 🟢 ACTIVE — being worked on now
| Dev | Feature | Key files / tables / migration# | Branch | Started | Notes |
|---|---|---|---|---|---|
| _(none claimed — add your row before starting)_ | | | | | |

## ✅ RECENTLY DONE (keep ~2 weeks, then prune)
| Dev | Feature | Key files / migration# | Merged to | When |
|---|---|---|---|---|
| เดฟ | Accounting B2 — shop AP pay-out (`markShopDisbursementPaid`) | `actions/admin/shop-disbursement.ts` · `tb_shop_pay_h` · no mig | main | 2026-06-22 |
| เดฟ | UX: self-explaining rows + 11px floor + `<PageHeader>` (~50 pages) | `components/admin/page-header.tsx` + many admin pages | main | 2026-06-22 |
| ภูม | P0: `/admin/customers` blank fix — `tb_users` img col = `userPicture` (not userimage) | `customers/page.tsx` · service-order detail | main | 2026-06-22 |
| เดฟ | Payment-loop closure (D1 wallet-removal · A4 2-round · slip-queue 1-row · PDF slips) | `actions/admin/wallet-hs.ts` · `tb-bulk.ts` · mig 0197/0198 | main | 2026-06-22 |

## 🟡 NEXT / QUEUED (reserved so no one else starts it)
| Dev | Feature | Will touch (files / tables / migration#) | Note |
|---|---|---|---|
| เดฟ | Accounting **B1** — wire VAT into AR billing-run | `actions/admin/billing-run.ts` · `tb_forwarder_invoice` (extend) · **mig 0199** | money+migration · D5-gated (done) · fresh-context |
| _open_ | Accounting B3 (doc-registry · read-only) · B4 (reconcile repoint) · B5/B6/B7 | per the gap doc | B3/B4 safe-no-mig · B5-B7 large |
