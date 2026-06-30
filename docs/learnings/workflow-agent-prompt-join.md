# Workflow `agent()` prompt must be a STRING — `.join('\n')` your arrays (2026-06-30)

**The bug (bit me 3× in one session):** in a `Workflow` script, `agent()`'s first arg is the prompt STRING.
If you build the prompt as an array of lines and forget `.join('\n')`, the array is coerced → the subagent
receives `[object Object]` / "[object]" as its task → it reports "no task instruction" and does NOTHING
(working tree stays clean, no error thrown). The phase silently no-ops.

```js
// ❌ WRONG — array reaches the agent as "[object]" → empty task → no work
const x = await agent([
  'line 1',
  'line 2',
], { label: 'foo' })

// ✅ RIGHT — join into one string
const x = await agent([
  'line 1',
  'line 2',
].join('\n'), { label: 'foo' })

// ✅ ALSO fine — a template string
const y = await agent(`line 1\nline 2`, { label: 'bar' })
```

**Why it kept slipping:** the `parallel([...])` BUILD lanes I wrote as `() => agent([...].join('\n'), …)`
(joined → worked), but the SEQUENTIAL phase calls `await agent([...], …)` I wrote WITHOUT `.join` (freight
workflow's Design+Foundation phases, the wire workflow's Audit+Wire phases) → those phases no-op'd. The
downstream lanes then "improvised" without the foundation (e.g. the freight build lanes shipped code but the
migration foundation never landed → I hand-wrote mig 0233 to match).

**Rules:**
1. EVERY `agent(...)` call's first arg must be a string. If it's an array, `.join('\n')` it. Grep your
   Workflow script for `agent([` and confirm each ends with `].join('\n')` (or is a template string).
2. The result tells you: a phase that returns "no task instruction / [object] / I completed the handshake
   and stopped" = it got a malformed prompt — NOT that the work is impossible. Re-run that phase fixed, or
   recover with a single `Agent` call (string prompt) — that's what unblocked both workflows this session.
3. A failed early phase silently breaks later phases (they build on a missing foundation). After any
   Workflow, VERIFY the artifacts actually landed (`ls` the migration, `git status` the files) before
   trusting the "complete" status.

Related: [[parallel-agent-sprints]] · the build-exit-from-log lesson (task/bash exit ≠ build exit).
