// DEPRECATED — wave-1 reinterpretation artefact (D1 / ADR-0017).
//
// This file was the wave-1 "inspired-by" Tailwind report table that the
// owner rejected (it diverged from legacy PCS Cargo). The faithful-port
// transcription replaced it: `report/page.tsx` is now a 1:1 transcription
// of the legacy `member/report-user-sales.php` and renders the legacy
// `#myTable` markup directly (no separate component, no `actions/sales`).
//
// Kept as an empty module only because this spawned worktree agent
// cannot delete files — flagged for the integrator to `git rm`.
export {};
