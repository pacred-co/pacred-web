# ปอน lost-pages audit · 2026-05-28

> Audit triggered by ปอน's complaint **"หน้าของผมหายไปไหนหมด"** (my pages disappeared).
> Run from worktree `claude/hopeful-almeida-359e44` against `origin/main = 51a7f408` and `origin/podeng = c6ca71fb`.

## §0 TL;DR — restore list

**STATUS: ALL ปอน WORK IS ALREADY ON MAIN. Nothing else to restore.**

The single c6ca71fb commit that was missing has already been restored to main as `51a7f408 fix(restore): cherry-pick ปอน's c6ca71fb LCL tracking pages — lost on prior merge` (Thu May 28 15:28:53 +0700, เดฟ + Claude Opus 4.7). All 9 files are byte-identical between origin/podeng and origin/main.

| Priority | File | Action | Risk |
|---|---|---|---|
| ✅ DONE | `app/[locale]/(protected)/service-import/_tracking/container-card.tsx` | Restored via cherry-pick 51a7f408 | None — byte-identical to podeng |
| ✅ DONE | `app/[locale]/(protected)/service-import/_tracking/stage-tabs.tsx` | Restored via cherry-pick 51a7f408 | None — byte-identical |
| ✅ DONE | `app/[locale]/(protected)/service-import/_tracking/tracking-page.tsx` (980 lines) | Restored via cherry-pick 51a7f408 | None — byte-identical |
| ✅ DONE | `app/[locale]/(protected)/service-import/air/page.tsx` | Restored via cherry-pick 51a7f408 | None |
| ✅ DONE | `app/[locale]/(protected)/service-import/sea/page.tsx` | Restored via cherry-pick 51a7f408 | None |
| ✅ DONE | `app/[locale]/(protected)/service-import/truck/page.tsx` | Restored via cherry-pick 51a7f408 | None |
| ✅ DONE | `components/legacy/pcs-left-menu.tsx` (sidebar LCL accordion) | Restored via cherry-pick 51a7f408 | None |
| ✅ DONE | `components/legacy/pcs-left-menu-accordion.tsx` (PcsLeftMenuSubAccordion export) | Restored via cherry-pick 51a7f408 | None |
| ✅ DONE | `components/sections/search-bar.tsx` (mobile keyword strip hide) | Restored via cherry-pick 51a7f408 | None |

**No additional ปอน work was found missing.** This audit verified the c6ca71fb 9-file restore and also scanned all `M` / `D` / `A` diffs across podeng↔main for hidden ปอน changes — none exist.

---

## §1 ปอน's c6ca71fb commit (the missing one — now restored)

### Why it went missing

`origin/podeng` HEAD is `c6ca71fb feat(service-import): LCL cargo tracking pages — truck/sea/air by ftransporttype` (Thu May 28 12:01:06 +0700, PCSCARGO author = ปอน).

- merge-base of `origin/podeng` and `origin/main` = `5b109943` (May 27 19:58 evening).
- ปอน pushed `c6ca71fb` to `origin/podeng` at 12:01 May 28.
- At ~12:30-13:33 May 28, ปอน switched to a NEW branch `InwPond007` and committed `0cfc405c feat(service-import + service-order): full-width layout + legacy-style table header + Guangzhou warehouse address fix` directly on top of work that came AFTER her podeng base.
- เดฟ merged `InwPond007` → main as `80528602` at 13:33-14:00 area.
- That merge included `0cfc405c` but **NOT `c6ca71fb`** — because `c6ca71fb` had never been merged into the `InwPond007` lineage. The `podeng` branch was effectively abandoned with one un-merged commit on top.
- ปอน then noticed "หน้าของผมหายไปไหนหมด" because her brand-new `/service-import/air`, `/sea`, `/truck` routes and the `_tracking/*` shared components had no entry on main.

### The 9 files restored

All restored verbatim by `51a7f408` (cherry-pick — NOT merge, because podeng is 21 commits behind main and a merge would revert ภูม's wave-25 work):

```
app/[locale]/(protected)/service-import/_tracking/container-card.tsx    (43 lines, NEW)
app/[locale]/(protected)/service-import/_tracking/stage-tabs.tsx        (99 lines, NEW)
app/[locale]/(protected)/service-import/_tracking/tracking-page.tsx     (980 lines, NEW — heavy lifter)
app/[locale]/(protected)/service-import/air/page.tsx                    (16 lines, NEW — transport type 3)
app/[locale]/(protected)/service-import/sea/page.tsx                    (13 lines, NEW — transport type 2)
app/[locale]/(protected)/service-import/truck/page.tsx                  (14 lines, NEW — transport type 1)
components/legacy/pcs-left-menu-accordion.tsx                           (modified — added PcsLeftMenuSubAccordion export, +42/-0)
components/legacy/pcs-left-menu.tsx                                     (modified — LCL nested accordion + 3 new SubSubLink children, +50/-23)
components/sections/search-bar.tsx                                      (modified — mobile chip strip hidden < 768px, +9/-0)
```

**Verification (this audit):**
- `git diff origin/podeng..origin/main -- <each-file>` → empty for all 9 files (byte-identical)
- `git show 51a7f408 --stat` → 9 files, 1243 insertions, 23 deletions — matches `git show c6ca71fb --stat` exactly

---

## §2 Hidden silent deletes earlier in history

Scanned full `git diff --name-status origin/main..origin/podeng` (636 lines of diff). After accounting for the `51a7f408` restore, the remaining differences fall into 4 categories — **none of them are lost ปอน work**:

### §2.1 PODENG has files MAIN does NOT have (44 `A` files on podeng-side)

All are ภูม's older admin lineage (`employees.ts`, `pcs-container-payments.ts`, `warehouse/containers/[code]/*`, `lib/warehouse/*`, `rates/custom-*`, etc.). Last-touched author check confirmed:

| File | Last-podeng-author | Conclusion |
|---|---|---|
| `app/[locale]/(admin)/admin/accounting/container-payments/page.tsx` | เดฟ (8f6054c3) | Wave 1 D1 work, retired by ภูม wave-25 on main |
| `app/[locale]/(admin)/admin/hr/employees/page.tsx` | เดฟ (43d7101e) | Phase 2 Wave 2, retired by ภูม wave-25 |
| `app/[locale]/(admin)/admin/warehouse/containers/[code]/page.tsx` | ภูม (99809536) | Old V3 container UX, retired by Poom wave-25 |
| `lib/warehouse/containers.ts` + 8 sibling lib files | ภูม / เดฟ | Old V3 warehouse infra |
| `actions/admin/employees.ts` + `actions/admin/pcs-container-payments.ts` | เดฟ | Phase 2 actions retired on main |

These are **intentional deletions on main** (ภูม's wave-25 sweep refactored the admin stack). Podeng simply hasn't received those deletes because it's 21 commits behind. They are NOT ปอน work and should NOT be restored.

### §2.2 PODENG has files DELETED relative to main (`D` files, ~120+ admin pages + actions)

All are ภูม's NEW admin work on main (wave-22 → wave-25) that podeng never pulled. Spot-checked authors:

- `actions/admin/{admin-profile,api-forwarder-manual,barcode-import,carrier-manual,cart,cnt-hs,cnt-payment,combine-bill,...}.ts` — all ภูม (wave-19 → wave-24)
- `app/[locale]/(admin)/admin/{accounting/cargo,accounting/forwarder,admins/[id],api-forwarder-*,api-sheets-*,barcode/*,cnt-hs,drivers/work,forwarder-action,forwarder-check,...}` — all ภูม

These are **brand new admin features on main** that simply never reached podeng. Not ปอน work. No restore needed.

### §2.3 PODENG has older content on `M` files

Spot-checked the ones in ปอน's territory:

| File | Last-podeng-author | Last-main-author | Conclusion |
|---|---|---|---|
| `components/sections/service.tsx` | ปอน (138ee060) | ภูม wave-23 P1-14 (ba494715) | Main is AHEAD (ภูม theme normalize on top of ปอน's redesign) |
| `components/legacy/pcs-carousel.tsx` | เดฟ (ec931f1b) | ภูม lint fix (38c8d304) | Main is AHEAD |
| `components/sections/navbar.tsx` | ปอน (7ce57e93) | เดฟ auth fidelity (d5f46290) | Main is AHEAD |
| `app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/[port]/page.tsx` | ปอน (f755d1c5) | ภูม codemod (d8d3e5a8) | Main is AHEAD |
| `app/[locale]/(public)/book-start/page.tsx` | ภูม (9566e85d) | ภูม codemod (d8d3e5a8) | Main is AHEAD |
| `messages/th.json` | ปอน (a08e7290) | เดฟ + ภูม (1a9fd8c2) | Main is AHEAD — includes login fidelity revert (intentional, per d5f46290 commit message) |
| `messages/en.json` | (similar) | (similar) | Main is AHEAD |
| `public/images/gwanzhou.txt` | ปอน (0cfc405c via InwPond007) | ปอน (0cfc405c via main) | Main has the NEWER ปอน address |

**No silently-overwritten ปอน work found.** Where main differs from podeng on a file ปอน last touched, it's because (a) ภูม layered a codemod/lint/theme pass on top, or (b) เดฟ applied a fidelity fix that intentionally reverted a placeholder. Neither destroys ปอน's structural work.

### §2.4 The `.claude/launch.json` rename

`"name": "pacred-1to1"` (podeng) → `"name": "pacred-web"` (main). Not ปอน work. Just an IDE config tweak.

---

## §3 In-place image refreshes ปอน may have done

Per memory `podeng_brand_asset_convention.md`, ปอน refreshes images in-place (same filename, new bytes). Checked:

```
git diff --name-status origin/main..origin/podeng -- public/images/customertheme/   → no diffs
git diff --name-status origin/main..origin/podeng -- public/images/                 → only gwanzhou.txt (text file, main is ahead)
git diff --name-status origin/main..origin/podeng -- public/legacy/pcs/             → 1 modified CSS (admin-base.css, ภูม-authored), 15 deleted admin CSS (ภูม wave deletions, not ปอน)
```

**Conclusion: no in-place image refreshes hiding on podeng that main is missing.** All of ปอน's image refresh work (`e21fd2e1 chore(assets): brand asset updates + cleanup`) is on both branches per `git branch -a --contains e21fd2e1`.

---

## §4 ADMIN pages on the diff (NOT ปอน — ภูม's deletions; FYI only)

For completeness — the bulk of the 636-line `git diff` between main and podeng is ภูม's wave-22 → wave-25 admin refactor:

- **Deleted from main, still on podeng:** ~31 actions/admin/*.ts files (admin-profile, api-forwarder-manual, barcode-import, carrier-manual, cart, cnt-hs, cnt-payment, combine-bill, customers-reset-pwd, driver-work, forwarder-check, forwarder-cost, forwarders-edit, forwarders-new, organization-email, product-search, rate-edits, report-cnt-cost-update, report-cnt-detail, service-orders-spawn, tb-bulk, wallet-hs, wallet-trans, warehouse-history, yuan-payments-tb).
- **Added to main, not on podeng:** the camelCase batch 2a renames (`tb_cnt` / `tb_cnt_item` / `tb_check_forwarder` per `54c7b22d`), wave-25 dashboards, integration commit `1a9fd8c2`, fidelity-auth-screens-2026-05-28 audit doc.
- **Deleted from podeng, still on main:** `.claude/skills/{debug-mantra,management-talk}/SKILL.md`, `.claude/settings.local.json`, plus a handful of admin client components.

**None of these are ปอน's lane.** They represent ภูม + เดฟ work that diverged from `podeng` after May 27 19:58 (the merge-base). If/when ปอน's `podeng` branch is reset to track `dave-pacred` again, the cleanest path is a fresh branch off main, NOT a merge from `podeng` (which would revive these dead admin files and revert wave-25).

---

## §5 Restore plan

**Status: COMPLETE. No action required.**

The cherry-pick already shipped in `51a7f408` (May 28 15:28 +0700). Verified by this audit:

1. ✅ All 9 files from `c6ca71fb` exist on `origin/main` with byte-identical content to `origin/podeng`.
2. ✅ Cherry-pick was clean (commit message reports zero conflicts).
3. ✅ Build green at `NODE_OPTIONS="--max-old-space-size=8192" pnpm build` (per commit message).
4. ✅ No other ปอน work is hiding on `podeng` — checked all `M` / `A` / `D` files in customer-facing dirs (`(public)/`, `(protected)/`, `components/sections/`, `components/legacy/`, `public/legacy/pcs/`, `public/images/`, `messages/`).

**Follow-up housekeeping (optional, not blocking):**

1. **Reset `origin/podeng` to track current `origin/main` HEAD** — currently `podeng` is 21 commits behind main + 1 commit ahead (the now-merged `c6ca71fb`). For ปอน's next sprint, push a force-with-lease update of `podeng` to `origin/main` so her starting base is clean and she doesn't accidentally merge stale state back in. The cleanest path:
   ```
   # On a fresh checkout:
   git fetch origin
   git checkout -B podeng origin/main
   git push origin podeng --force-with-lease
   ```
   This preserves the historical content (still in main via 51a7f408) and saves ปอน from the next "หายไปไหน" surprise.

2. **Tell ปอน the LCL pages are live** — she can verify at `/service-import/truck`, `/service-import/sea`, `/service-import/air` and the sidebar LCL accordion under "บริการฝากนำเข้า → LCL แชร์ตู้/รวมตู้".

3. **Add to `docs/learnings/parallel-agent-sprints.md`** (or wherever the team captures branch-management lessons): when ปอน works on `podeng` AND simultaneously on `InwPond007`, the second branch's merge to main can silently abandon work on the first. Mitigation: before merging `InwPond007`, run `git rev-list --left-right --count InwPond007...podeng` and merge `podeng` into `InwPond007` first if `podeng` has unique commits.

---

## §6 Audit metadata

| Field | Value |
|---|---|
| Audit date | 2026-05-28 |
| Auditor | Claude Opus 4.7 (1M context) — agent run on `claude/hopeful-almeida-359e44` worktree |
| Worktree HEAD at audit time | `51a7f408` (= origin/main, restore commit) |
| `origin/main` HEAD | `51a7f408 fix(restore): cherry-pick ปอน's c6ca71fb LCL tracking pages — lost on prior merge` |
| `origin/podeng` HEAD | `c6ca71fb feat(service-import): LCL cargo tracking pages — truck/sea/air by ftransporttype` |
| `origin/InwPond007` HEAD | `0cfc405c feat(service-import + service-order): full-width layout + legacy-style table header + Guangzhou warehouse address fix` |
| Merge-base main / podeng | `5b109943 docs(learnings): 4 entries from today's camelCase pilot + ปอน-merge session` (May 27 19:58 +0700) |
| `main` vs `podeng` divergence | main +251 commits, podeng +1 commit (`c6ca71fb`, already cherry-picked) |
| Tools used | `git log` / `git diff` / `git show` / `git ls-tree` / `git branch -a --contains` / `git merge-base` |
| Files inspected | 636 diff lines, 9 `A`-on-podeng-only-then-restored, 44 `A`-on-podeng (all ภูม/เดฟ admin), ~120+ `D`-on-podeng (all ภูม/เดฟ admin), ~25 `M` (ภูม codemod / theme passes on top of ปอน's structural work, no content lost) |
