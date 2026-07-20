---
name: session-continuity
description: Fire on any LONG / multi-item / "run long / ยาวๆ / ทำหมดเลย" session, when context is filling, before reporting anything "done / เสร็จ", and at session close. Prevents work-loss across context compaction AND the "บอกผ่านๆ เสร็จ พอดูจริงบัคเหมือนเดิม" failure (claiming done without verifying the live user-visible outcome). Keeps a durable save-point so work continues within ONE session.
---

# Session Continuity — never lose work, never claim done without proof

> **Why this exists (owner, 2026-06-21, verbatim-ish).** A bug was "fixed" 3–4 times across one long session — each time reported เสร็จ, each time still broken on the live page. *"เอาโทเค่นไปเผาเล่นมาหรอ บอกผ่านๆ เสร็จๆ พอไปดูจริง บัคเหมือนเดิม."* Two root causes: (1) **done was declared from a green build, never from the live surface**; (2) **across context compaction the real symptom + exact next step were lost**, so the same shallow fix was retried. This skill kills both.

## RULE 1 — "เสร็จ / done" REQUIRES live proof (the hard gate)

Before you write the word **done / เสร็จ / fixed / แก้แล้ว** about any user-visible change, you MUST have just produced proof from the **actual running surface** — not the build, not the diff, not the types.

- **UI / page / list / flow** → open it on the live site (Chrome MCP) or `preview_*`, and **assert the user-visible outcome in the requirement's own words.** Owner said "1 row not 2" → run a count in the page (`document.querySelectorAll('table tbody tr')`), confirm it's 1, quote the number. "รูปขึ้น" → confirm the `<img>` rendered. Screenshot for the owner.
- **Deploy lag is real** — after pushing to `main`, the old build serves for minutes. Re-load until the page reflects the new code (a known marker changed), THEN assert. Do NOT verify against the stale deploy and call it done.
- **Money mutation you can't safely test on prod** → say exactly that: *"shipped + gated (typecheck/lint/build 0) · NOT live-verified (money path)"*. That is an honest status; **"เสร็จ" is not.**
- **Build/typecheck/lint green ≠ done.** They prove it compiles, not that the bug is gone. The slip-queue bug passed every gate while still showing 2 rows.

If you cannot show the proof, you cannot say done. Say "shipped, ยังไม่ verify" + what's needed to verify.

## RULE 2 — fix the SYMPTOM the owner sees, not an adjacent thing

When the owner points at a screenshot, the deliverable is **that screenshot changing**. Before coding, restate the exact visible symptom ("PR7429 ฿2,085.93 shows on 2 rows; must be 1"). After deploying, reproduce the owner's exact view + confirm the symptom is gone. Adding a thumbnail / detail / guard "around" the bug while the 2 rows remain = not fixed. If 3 attempts haven't moved the visible symptom, STOP adding adjacent polish — re-derive the symptom from the live DOM + data (probe prod) until you can explain WHY the 2 rows exist, then kill that cause.

## RULE 3 — the SAVE-POINT (survive context compaction)

Context will compact mid-session. Protect against amnesia continuously, not at the end:

- **Task ledger is the SOT.** Use TaskCreate/TaskUpdate so the live list always shows done / in-progress / next. One task per shippable unit. Mark `in_progress` when you start, `completed` only after RULE 1 proof.
- **After every shipped unit**, leave a one-line "exact next step" (file:line or command) in the active task or a scratch note — so a fresh window resumes without re-deriving.
- **When context is near-full OR at session close**, write a SAVE-POINT to BOTH `memory/` (one entry, the durable index) AND the AGENTS.md top save-point block + the relevant `docs/research/*.md`. The save-point must contain: branch + HEAD, what shipped (with commits), what's IN-FLIGHT (file:line + the half-done state), the EXACT next command/step, owner decisions still open, and creds/gotchas (chat-only secrets stay chat-only). A good save-point lets a cold start continue in one read.
- **Secrets**: never persist chat-only secrets (DB passwords) to a file — keep them in chat; reference "see chat" in the save-point.

## RULE 4 — long-run discipline ("run long / ยาวๆ / ทำหมดเลย")

- Work in **small shippable units**, gate + commit + (deploy+verify) each, push at save-points. Small blast radius beats one giant commit.
- **Money / migration / RBAC paths**: gate hard (typecheck·lint·build, never piped through `| tail`), dry-run + backup before any prod data write, and FLAG (don't blind-apply) anything whose correct value needs owner/accounting judgment. "ห้ามทำบัค งานหาย" outranks speed.
- Don't pile risky money changes into the exhausted tail of a huge turn — but DO keep the save-point current so the next unit starts clean.

## The loop

```
RESTATE the visible symptom  →  PROBE source/prod until you know the real cause
  →  fix the CAUSE (smallest unit)  →  gate (tc·lint·build, real exit code)
  →  deploy  →  RELOAD live until new code serves  →  ASSERT the user-visible outcome
  →  only now mark the task done + say "เสร็จ" (with the proof)
  →  update the SAVE-POINT (ledger + memory + AGENTS.md)  →  next unit
```

## Anti-patterns (each one happened — do not repeat)
- ❌ "เสร็จแล้วครับ" right after a green build, without opening the live page.
- ❌ Verifying against a stale deploy (old build still serving) and calling it done.
- ❌ Adding thumbnails / detail / a guard "around" a bug while the owner's exact symptom (2 rows) is untouched.
- ❌ Re-fixing the same reported bug a 3rd time because the live symptom was never reproduced.
- ❌ Letting context compact with no save-point → the next window re-derives + repeats the shallow fix.

## Cross-links
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — the build/route gate (necessary, NOT sufficient — this skill adds the live-surface assertion on top).
- [`qa-flow-simulator`](../qa-flow-simulator/SKILL.md) — assert a real end-to-end outcome, not a 200.
- AGENTS.md §0c (verify-deep-flow) + §0d (reachability) — the discipline this skill operationalises into a hard "no-done-without-proof" gate.
