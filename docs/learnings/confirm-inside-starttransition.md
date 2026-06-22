# Learning — never `await confirm()` INSIDE `startTransition` (React 19 · the dialog won't open)

**Date:** 2026-06-22 · **Author:** เดฟ · **Trigger:** owner — the forwarder "ถอยสถานะ / ดันสถานะ" step buttons "ใช้จริงไม่ได้" (even as ultra). Clicking did nothing.

## Symptom
A button wired to a confirm-then-mutate handler silently does NOTHING on click — no dialog, no action, no error. Looks like a permission bug ("เราก็ ultra แล้วนี่") but isn't.

## Root cause
The handler was:
```tsx
function onRevert() {
  startTransition(async () => {
    if (!(await confirm(msg))) return;   // ← confirm INSIDE the transition
    const res = await revertForwarderStep({ fid });
    ...
  });
}
```
`confirm()` (our `components/ui/confirm.tsx`) opens the styled `<dialog>` by calling `setReq(...)` in the mounted `<ConfirmDialogHost>`. When that `setReq` runs **inside `startTransition`**, React 19 marks it as a **non-urgent transition update** and defers it — so `dialogRef.current.showModal()` (queued in a microtask) runs against a dialog whose `req` hasn't committed, and the dialog never reliably opens. The `await confirm()` promise then sits unresolved (or resolves false) → the action never runs. **Proven live on prod:** clicking opened no `dialog[open]` within 2.7s; after the fix it opens immediately.

It is NOT RBAC (`isGodRole` passes ultra) and NOT the server action (verified the revert UPDATE affects 1 row).

## The fix (canonical React-19 pattern)
Run the UI confirm/prompt/alert **before** `startTransition`; wrap only the server action in the transition:
```tsx
async function onRevert() {
  if (!(await confirm(msg))) return;     // confirm OUTSIDE the transition
  startTransition(async () => {
    const res = await revertForwarderStep({ fid });
    ...
  });
}
```
`onClick={onRevert}` with an async handler is fine (React ignores the returned promise).

## Scope (it was platform-wide)
12 files had the identical antipattern (forwarder-step-revert + cnt-cost-editor · freight quotes/leads triage · withdrawal/freight-th · notportage-combine · mark-ordered · lead-kanban closed-deal · missing-item-report · tag-chips). ~55 files already did it correctly. All 12 swept 2026-06-22.

## Rule
Any `startTransition(async () => { … await confirm()/prompt()/alert() … })` is a bug — the dialog is a UI interaction, not a state transition. **Grep for `startTransition(async` followed by `await confirm` whenever a confirm-gated button "does nothing".** Beware the false positive: action names like `confirmPhoneChange`/`confirmCsvImport` start with "confirm" but are NOT the dialog.

Related: §0f (confirm-before-mutate) · [[verify-deep-flow]] (a button that 200s but does nothing).
