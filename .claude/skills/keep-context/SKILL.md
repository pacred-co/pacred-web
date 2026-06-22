---
name: keep-context
description: Fire on EVERY turn of a long/multi-topic chat session — keep a coherent running understanding of the whole conversation so replies never lose the thread, never re-ask what the owner already answered, never drop one of a multi-part request, and resurface relevant earlier decisions. The anti-"แชทยาวแล้วคุยกันไม่รู้เรื่อง / ลืมที่คุยกันไป" gate. Pairs with session-continuity (that one saves WORK; this one keeps the CONVERSATION coherent).
---

# Keep Context — the conversation stays coherent end-to-end

> **Why (owner):** *"keep context ต่อแชท คุยกันรู้เรื่อง แชทไม่หาย ตลอดห้องแชท session."* In a long session the owner drops many asks, answers, and decisions. If I lose the thread — re-ask something already answered, drop one part of a 4-part message, forget a decision we made an hour ago — it wastes the owner's time and erodes trust. This skill keeps the whole chat coherent.

## The 4 rules

### 1. Enumerate EVERY part of a multi-part message — drop nothing
The owner often sends one message with several asks ("1. … 2. … เสร็จแล้วลุยต่อ"). Before replying, list every distinct ask/sub-ask. Address each one explicitly. If you can't do one, say so — never silently skip it. End the turn by confirming which parts are done vs still open.

### 2. Never re-ask what's already answered — scan back first
Before asking the owner anything (or assuming a default), scan the session: did they already answer this, state a preference, or make this decision earlier? Owner decisions persist for the whole session (and often beyond — check memory/CLAUDE.md save-points). Re-asking a settled question ("ใช้ wallet ไหม?" when they already said "ถอด wallet ทุกจุด") is the #1 trust-killer. If it WAS answered, act on it; cite it ("ตามที่พี่บอกว่า …").

### 3. Maintain a running session ledger (the thread's memory)
Keep a live model of the session in the **TaskList** + the durable **save-point** (session-continuity RULE 3): the owner's distinct requests, decisions made, what's done / in-flight / pending. This is what you reconstruct the thread from after a context compaction. When the session is long, open a turn with a one-line recap of where we are so the owner knows you're tracking ("ตอนนี้: B2 เสร็จ · กำลังจะต่อ B1 · เหลือ 4 owner-input items").

### 4. Resurface relevant earlier context proactively
When a new ask connects to something earlier, link them: "เรื่องนี้ต่อจากที่พี่บอกตอน … / เราเคยตัดสินใจว่า … แล้ว". This shows the thread is intact and prevents re-deciding. If the owner contradicts an earlier decision, flag the contradiction kindly + confirm which wins — don't silently follow the latest and leave the codebase half-on-each.

## On resume after a context compaction
The summary + the CLAUDE.md top save-point + memory carry the thread. On the FIRST turn after a compaction: read the save-point + scroll the recent owner messages, reconstruct (a) the active task, (b) open owner asks, (c) decisions in force — THEN reply. Don't reply from a half-loaded thread.

## Anti-patterns
- ❌ Answering only part 1 of a "1./2./3." message and moving on.
- ❌ Re-asking a question the owner answered earlier in the session.
- ❌ "Starting fresh" after a compaction without re-reading the save-point + recent messages.
- ❌ Re-deciding something already decided (re-litigating "wallet vs slip" mid-session).
- ❌ Losing a deferred ask the owner mentioned once ("เดี๋ยวมาเก็บงานต่อ") — it stays on the ledger until done or the owner drops it.

## Cross-links
- [`session-continuity`](../session-continuity/SKILL.md) — saves the WORK + the verify-before-done gate; this saves the CONVERSATION. Use both.
- [`team-collision-check`](../team-collision-check/SKILL.md) — keep context about what TEAMMATES are doing, not just this chat.
