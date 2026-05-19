# ปอน — Work Claim · Brand-Asset Swap (2026-05-20)

> **To: เดฟ + ภูม** — coordination note (claim-before-build, per the
> faithful-port no-collision rule). ปอน is on `podeng`, synced to
> `faithful-port` (`e8a0ba0` · customer portal 12/24 transcribed).

## What ปอน is taking

**The brand-asset swap** — ปอน's task per the
[`faithful-port-plan.md`](../runbook/faithful-port-plan.md) work-split. The 1:1
transcription uses **legacy PCS placeholder assets** under `public/legacy/pcs/`
wherever an official Pacred `PR` asset does not exist yet. ปอน's job:

1. **Inventory** every legacy PCS placeholder image asset + which transcribed
   screen references it.
2. Where an official `PR` asset **exists** → swap it in (in-place under
   `public/` — *no edits to the transcribed screen files*).
3. Where **no `PR` asset exists** → keep the legacy placeholder (stays
   1:1-faithful) + log it in the **missing-PR-assets list** below, for the
   owner to source / commission.

## Non-collision — what ปอน is NOT touching

- ❌ **Customer-screen 1:1 transcription** — that is **เดฟ's active lane**
  (map · forwarder-table · print · pay · invoiceF · sales-report in flight;
  12/24 already on `faithful-port`).
- ❌ **Admin back-office** — **ภูม's lane**.
- ปอน edits **only `public/` asset files + this doc**. Zero overlap with the
  `.tsx` / `.css` screen files เดฟ's agents are writing.

## Open question for เดฟ

The auth screens — `login.php` · `register.php` · `forgot-password.php` — are
**not in เดฟ's current agent batch**. Were they transcribed 1:1, or should ปอน
pick them up next? (`93a4ce2` reads as a *polish* of the rebuilt auth pages, not
a 1:1 transcription from the legacy `.php`.) เดฟ — confirm; ปอน takes them next
round if they are free.

## Status

🟡 **In progress** — the full inventory + the missing-PR-assets list land in the
next push to `origin/podeng` (this same doc, updated).

---

*(inventory + missing-list appended below on the work push)*
