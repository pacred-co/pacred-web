# Learnings — reconciling duplicate / overlapping feature work

> Append-only. Newest first. Captures hard-won integration lessons so the next
> agent/dev reconciles overlapping branch work without losing the better version.

---

## 2026-06-04 — Two devs built the SAME feature independently → reconcile by legacy-fidelity, not by "whoever's already in main"

**Context.** เดฟ (this session) and ภูม (Poom-pacred) both, on the same day,
built the per-shop ฝากสั่งซื้อ entry for `/admin/service-orders/[hNo]/edit`
(เลขออเดอร์ร้านจีน + tracking ราย ร้าน · legacy `update3.php`/`update4.php`).
เดฟ's `ShopChinaPanel` shipped to main first (76e6fe16); ภูม's `ShopFieldsBoard`
came in via a later merge.

**What worked.** Don't default to "mine's already in main, keep it." Compare
BOTH against the legacy source (owner directive: อิง legacy เป็นหลัก) and adopt
the more faithful one:
- ภูม's `ShopFieldsBoard` was **status-aware** (status 3 = shop-order-number
  only; status 4 = tracking + locks the number + "ตรวจสอบรายการนำเข้า" link;
  status 5 = read-only) — matching legacy `update3`→`update4` exactly. He also
  added the batch actions `adminMarkShopOrderOrdered({shops:[...]})` +
  `adminUpdateShopTracking` + a check-tracking API route.
- เดฟ's `ShopChinaPanel` showed all fields at all statuses — less faithful.
- → **Adopted ภูม's wholesale** (`git checkout origin/Poom-pacred -- <2 conflict
  files>`), **deleted เดฟ's duplicate** (`shop-china-panel.tsx` +
  `adminSetShopTracking`), then **grafted the one legacy field ภูม's board
  missed** (per-line `¥ cPriceUpdate`, legacy `update3.php` L85) onto ภูม's board.

**The pattern.** When two branches overlap on one feature:
1. Read BOTH implementations + the legacy SOT (§0b).
2. Pick the more legacy-faithful base (NOT the one already merged).
3. Take it wholesale for the conflict files; delete the loser's duplicate
   files + now-superseded actions (verify zero callers first — grep).
4. Graft any legacy field/behavior the winner is missing from the loser.
5. build + verify (real exit codes) before committing the merge.

**Anti-pattern.** Blind `git merge` then `git checkout --theirs` leaves the
auto-merge frankenstein (BOTH imports survive — e.g. the edit page kept both
`ShopChinaPanel` AND `ShopFieldsBoard`). Force the canonical file version with
`git checkout <branch> -- <file>`, then delete the orphaned duplicate by hand.

**Also captured:** running `next build` while a `next dev` server is live on
Windows corrupts the shared `.next` → the dev server then serves stale 404s for
valid routes (a status-2/3 order's `/edit` 404'd until `.next` was cleared +
dev restarted; the production `build` itself was clean). When a dev page 404s
but `pnpm build` + `pnpm verify` are EXIT 0, suspect `.next` contention first:
`rm -rf .next` + restart dev. See also [[ci-and-deploy-gotchas]].
