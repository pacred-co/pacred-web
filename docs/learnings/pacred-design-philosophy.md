# Pacred design philosophy — workflow vs UI (CORE · read FIRST)

> ภูม taught this 2026-05-23 after a Wave 11 fidelity port where the agent
> shipped a "legacy 1:1" page that missed the legacy's product thumbnails,
> didn't build the new-entry form, and copied the legacy's plain Bootstrap-4
> look instead of polishing the UI. The agent had been waiting for ภูม to
> flag mismatches instead of proactively comparing. This file captures
> the lesson so future agents (and future ภูม sessions) don't repeat it.

---

## The rule, in one line

**Legacy PCS Cargo = workflow source of truth. Our UI = our design — better than legacy.**

We are NOT pixel-cloning the PHP. We are stealing the **logic**:

- What data each page shows (which `tb_*` columns surface · what they mean)
- What buttons do (which mutations · which status transitions · which side effects)
- What flow connects pages (status `1 → 2 → 3 → 4 → 5 → 6 → 7` · who clicks what · what notifies whom)
- Which fields the operator actually uses daily (vs decorative)

And **applying our own design** — Tailwind + Lucide icons + cleaner typography + better spacing + clear status chips + readable tables — to that logic. The owner's quote:

> "เราแค่ copy ระบบการทำงาน ส่วนหน้าตาเราเอามาปรับให้สวยเอง เพราะ PCS เอาตรงๆ
> เว็บมันยังไม่ค่อยสวยเลย 55555"

Translation: "We just copy the working system, and we polish the look ourselves
because PCS's UI isn't very pretty to begin with."

### What this means concretely

| Aspect | Legacy = source | Our design = ours |
|---|---|---|
| Data fields shown in a row | ✅ match legacy (incl. thumbnails, source badges, stage dates) | — |
| Button labels + actions | ✅ match legacy ("ดูข้อมูล" not "View") | — |
| Status transitions / SQL filters | ✅ match legacy exactly | — |
| Which roles see what | ✅ match legacy permissions | — |
| Table column ORDER | ✅ usually match legacy (muscle memory) | — |
| Table column LAYOUT (padding · font · row chrome) | — | ✅ our Tailwind design |
| Empty states · loading · error states | — | ✅ our cleaner UX |
| Mobile layout | — | ✅ our responsive design |
| Chip / badge / button styling | — | ✅ our brand tokens |
| Form layout · validation messages · transitions | — | ✅ our polished forms |

### Anti-pattern (what NOT to do)

❌ Ship a "faithful port" by copying the legacy's Bootstrap-4 markup verbatim,
keeping the plain `<table class="table-bordered">`, ugly default form
controls, low-contrast text. Then defend it as "matches legacy".

❌ Wait for ภูม to flag mismatches between our page and legacy. Make ภูม
open the legacy in another tab and screenshot the differences.

❌ Ship "Wave N" of a page where some columns/features are missing without
saying anything, leaving ภูม to discover them by clicking around.

### Right pattern (what TO do)

✅ Before shipping a faithful-port page:
   1. Open the legacy `.php` file (under `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\pcscargo\member\pcs-admin\`)
   2. List every data field surfaced in the legacy UI
   3. List every button + what it does (open the click-handler PHP)
   4. List every filter + URL param
   5. Write the Pacred page with the SAME logic but our design (Tailwind cards, chips, icons)
   6. Browser-verify side-by-side: open the legacy screenshot the owner sent (or PHP rendered locally) + our page. Compare every visible element.
   7. If something legacy shows that we don't (e.g. product thumbnail · pay-status icons · row deeplink colors) — **add it** before commit.
   8. If something ภูม flagged as "not yet implemented" (e.g. /new form, slip upload) — **banner it explicitly** in the UI ("ยังไม่เปิด — Wave 12") instead of silently linking to a redirect.

✅ Proactively tell ภูม what's complete vs what's stubbed when finishing a wave:
   - "Wave 11 ships the legacy 14-column layout + 4 top tabs (DONE)"
   - "+ เพิ่มรายการให้ลูกค้า button = stub (redirects to list) — Wave 12 will build the form"
   - "Product thumbnails = ADDED (was missing in first pass)"
   - This lets ภูม decide priorities without first having to discover the gaps.

✅ Ask before implementing if unsure:
   - "Should the row thumbnail link to the cover image full-size or the product detail page?"
   - "When admin clicks 'อัปเดต' button vs 'ดูข้อมูล' — should they land on different pages or same page with edit-mode flag?"
   - "Is the legacy's [feature] still in active use, or can we defer to Wave 12?"

### How to capture this lesson going forward

Every faithful-port wave from now on must include — IN THE SAME COMMIT, before push:

1. **A "Legacy vs Pacred" diff section** in the commit message:
   ```
   Legacy ref:    pcs-admin/forwarder.php L<line> · screenshot 2026-05-23
   Logic copied:  [list every behaviour copied]
   UI polished:   [list every design improvement vs the legacy]
   Stubbed:       [list every feature that's bannered "Wave N+1"]
   Verified:      [browser-checked routes + the legacy comparison method]
   ```

2. **A "Wave X is partial" banner in the UI** for any feature deferred:
   ```tsx
   <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
     Wave 11 = read + 4 top tabs · "+ เพิ่มรายการ" form → Wave 12
   </div>
   ```

3. **A pre-ship browser side-by-side check** documented in the smoke results:
   - Screenshot of our page
   - Note any element legacy shows that we don't surface

---

## Sibling principles (apply alongside)

- **Mobile-first** for customer-facing — but admin pages are desktop-first (operators use 24" monitors)
- **Faithful first, then improve** — the workflow port doesn't bring opinions. Add Pacred-only enhancements as a Phase C layer, not inside a port.
- **Don't preempt brand cleanup** — PCS/TTP/ไอแต้ม names stay until ก๊อต confirms API switchover (per `docs/runbook/pcs-scrub-plan.md`)
- **Save-points-only pushes** — don't churn Vercel build

---

## Cross-links

- [`AGENTS.md`](../../AGENTS.md) — should reference this file in §0
- [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — the D1 decision
- [`.claude/skills/legacy-fidelity-check/SKILL.md`](../../.claude/skills/legacy-fidelity-check/SKILL.md) — fidelity audit playbook
- Wave 11 commit `c407e93` — example of where this principle WASN'T followed (the partial fidelity port that prompted ภูม to teach this)
- Wave 11 follow-up commit (this commit) — the corrected version + thumbnail + banner + design polish
