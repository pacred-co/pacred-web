# Audit discipline — read the source, not the screenshot

> Captured 2026-05-25 ค่ำ after ภูม catch me shipping a fidelity-comparison report
> that missed 2 huge legacy pages (`report-cnt.php?id=` + `forwarder-check.php`).
> The pattern that caused the miss was: **I compared against the HTML ภูม pasted
> in chat, not against the legacy PHP source on disk**. ภูม said it like this:
> *"โหนี่ขนาดมี source code ให้นายเลยนะ ไล่ deep audit เพิ่มด่วนเลย อยากส่งงาน
> แล้วโดน Owner ไล่กลับบ้านหรือไง"*. Owner would have rejected the work.

---

## The rule

**When comparing Pacred to legacy PCS, the SOURCE OF TRUTH is the legacy PHP file on disk, not any screenshot or rendered HTML.** A rendered HTML view shows ONE mode of a multi-mode page — every legacy `*.php` file is usually a `switch ($_GET['page'])` or `if (isset($_GET['id']))` dispatcher with 2-6 modes hidden inside. The rendered HTML you see in a browser tab is one of them; the other modes are invisible until you `Read` the source.

## Concrete miss (the 2026-05-25 case)

| What I saw | What was hidden | What broke |
|---|---|---|
| `report-cnt.php` list view (`page=waiting/succeed`) | Mode-b: `?id=<container>` per-container drill-down — 2000+ LOC of detail view with cost-edit modal + 25-col DT + bulk-check submit | I told ภูม Pacred is "85% faithful" when it's actually missing the entire container-detail workflow |
| `forwarder-check.php` (didn't see it at all) | A whole separate page that owns the **bill-customer step** of the revenue pipeline | The revenue path is broken — no way to bulk-bill customers after รายการตรวจสอบแล้ว |
| Top menu's "ค่าตู้สินค้า" link | Real lifecycle: report-cnt → forwarder-check → cnt-hs · 3 pages, not 1 | I framed cnt-hs as the whole flow when it's just the END of the flow |

## The audit protocol I should have followed

When ภูม pastes a legacy HTML (or shows a screenshot, or describes a workflow):

### Step 1 — Identify the source PHP file
```bash
# From the URL in the HTML (e.g. `report-cnt.php?id=GZE0516179`)
ls -la "D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-cnt.php"
# Read it FULLY — not just the section that matches the HTML
```

### Step 2 — List all modes the file dispatches
Read the top 100 lines. Grep for:
- `$_GET['page']` · `$_GET['action']` · `$_GET['id']` · `$_POST['*']`
- `switch (` · `if (isset(`
- `include 'include/pages/<dir>/<file>.php'`

Each mode is potentially a **separate Pacred route**.

### Step 3 — Enumerate every include/page sub-handler
The big legacy pages (report-cnt.php · forwarder.php · cnt-hs.php) call `include 'include/pages/<dir>/<file>.php'` for sub-handlers (modals · AJAX endpoints · sub-tables). Each is a separate `actions/admin/*.ts` server action in Pacred. Use:
```bash
grep -r "include " <legacy-page>.php   # find every sub-handler
```

### Step 4 — Cross-reference Pacred for every legacy artifact
For each legacy mode + sub-handler, search Pacred:
```bash
Glob "app/[locale]/(admin)/admin/<feature>/**"
Grep -l "<legacy-table-name>" "app/[locale]/(admin)/admin/"
```

Mark: ✅ exists · ⚠️ stub · ❌ missing · 🔧 fallback-only.

### Step 5 — Build the diff table BEFORE answering ภูม
Don't write the answer until you have a per-file row of:
- legacy filename + LOC
- legacy mode/sub-handler
- pacred path (or NULL)
- status
- gap LOC estimate

Then surface as a markdown table. ภูม wants the table, not a narrative.

### Step 6 — Parallel agents when scope is wide
If the feature touches > 10 legacy files, dispatch 2+ agents in parallel:
- Agent A: enumerate LEGACY side
- Agent B: enumerate PACRED side
- (synchronously) you produce the diff

The 2026-05-25 audit used 4 agents (legacy×2 split by domain + pacred×2 split) and finished in ~12 min. Doing it serially would have taken an hour.

## Anti-patterns (what I did wrong before the catch)

❌ **Comparing to "what I see in the HTML"** — I scanned the pasted HTML for buttons + columns and listed them. But HTML only shows ONE mode of a multi-mode page; modes hidden behind `?id=` or `?action=` were invisible.

❌ **Defending the gap as "intentional Pacred UX divergence"** — I labeled the missing `forwarder-check.php` as "Pacred uses one-page flow" without checking if Pacred actually has the bill-customer step at all. (It didn't.)

❌ **Trusting my own previous audit** — I had already shipped a "fidelity check" Wave 14 morning. Building the next answer on top of that previous-audit's framing repeated its blind spots. Should have re-audited from PHP source for any new question.

❌ **Saying "~85% complete" without measuring** — sample-size of one HTML page can't yield a percentage. The deep audit found 5 P0 + 7 P1 missing pages = closer to 50% on the cnt/report-cnt/forwarder-check trio.

## What to do when ภูม catches a miss

1. **Acknowledge once, briefly** — no long apologies. ภูม wants action.
2. **Run the protocol above immediately** — parallel agents to enumerate both sides.
3. **Produce the diff table FIRST**, then the priority + plan.
4. **Capture the lesson here** (this file) so the next agent doesn't repeat.
5. **Add a Task per gap** so it shows in TaskList — ภูม sees the plan.

## When the protocol can be skipped (rare)

- The question is purely about ONE function in ONE file (e.g., "does our calc match the legacy formula") — read both, diff inline, done.
- The legacy PHP doesn't exist (Pacred-original feature with no precursor).
- ภูม explicitly says "skip audit, just build X" — but then re-audit before claiming faithful.

## Cross-links

- [`AGENTS.md`](../../AGENTS.md) §0b — the rule: deep-audit from source
- [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../audit/cargo-flow-deep-audit-2026-05-25.md) — the audit produced by the protocol
- [`docs/learnings/pacred-design-philosophy.md`](pacred-design-philosophy.md) — sibling rule: legacy = workflow truth, our UI = our design
- [`.claude/skills/legacy-fidelity-check/SKILL.md`](../../.claude/skills/legacy-fidelity-check/SKILL.md) — the executable form of these rules
