# Legacy PCS vendor assets — integrator copy manifest

D1 faithful-port (ADR-0017). This folder stages the legacy PCS Cargo customer-portal
vendor JavaScript / CSS so the transcribed `(protected)` screens get their 1:1
Bootstrap-4 + jQuery interactivity (`data-toggle` modals / tabs / dropdowns /
collapse) and the DataTables tables behave like the legacy.

The transcription agent's sandbox **blocks file copies from the legacy source path**
(`C:\xampp\htdocs\pcscargo\`) and the two largest files exceed the read-tool size
cap — so they could not be staged in-place without risking byte-drift on a
load-bearing minified bundle. They are listed below for a **verbatim byte-for-byte
copy** (a faithful port requires the legacy's exact files, unchanged).

## Already staged by the agent (text files, written verbatim)

- `datatables/js/dataTables.bootstrap4.min.js`   — DataTables Bootstrap-4 integration (SpryMedia)
- `datatables/js/dataTables.responsive.min.js`   — DataTables Responsive 2.2.3
- `datatables/css/dataTables.bootstrap4.min.css` — DataTables Bootstrap-4 CSS
- `datatables/css/responsive.dataTables.min.css` — DataTables Responsive CSS

## TO COPY — run these (verbatim `cp`, do not edit)

The legacy paths are on เดฟ's machine. `<repo>` = the pacred-web repo root.

| Source (legacy, absolute)                                                              | Dest (in this repo)                                            |
|----------------------------------------------------------------------------------------|----------------------------------------------------------------|
| `C:\xampp\htdocs\pcscargo\member\assets\js\vendors\js\vendors.min.js`                   | `<repo>\public\legacy\pcs\vendor\js\vendors.min.js`            |
| `C:\xampp\htdocs\pcscargo\member\assets\plugins\datatables.net\js\jquery.dataTables.min.js` | `<repo>\public\legacy\pcs\vendor\datatables\js\jquery.dataTables.min.js` |

PowerShell:
```powershell
Copy-Item "C:\xampp\htdocs\pcscargo\member\assets\js\vendors\js\vendors.min.js" `
          "$PWD\public\legacy\pcs\vendor\js\vendors.min.js"
Copy-Item "C:\xampp\htdocs\pcscargo\member\assets\plugins\datatables.net\js\jquery.dataTables.min.js" `
          "$PWD\public\legacy\pcs\vendor\datatables\js\jquery.dataTables.min.js"
```

### `vendors.min.js` — what it is (verified by the agent)

The legacy `member/include/header.php` loads exactly this one file
(`assets/js/vendors/js/vendors.min.js`, ~525 KB). It is a single concatenated
bundle, in this order:

1. **jQuery v3.4.1**
2. **Popper.js** (for Bootstrap-4 dropdown/tooltip positioning)
3. **Bootstrap v4.3.1** JS

The `(protected)` layout (`app/[locale]/(protected)/layout.tsx`) loads this file
via `next/script` with `strategy="afterInteractive"`. Bootstrap-4 JS auto-wires
every `[data-toggle]` document-wide on load, so the statically-rendered legacy
markup (modals, tabs, dropdowns, collapse) becomes interactive 1:1 — no per-screen
JS needed. Until the file is copied the `<script src>` simply 404s (non-fatal:
pages still render, just without the legacy interactivity — i.e. the current
state).

### `jquery.dataTables.min.js` — what it is

DataTables **1.10.19** core (SpryMedia). Used by the legacy `#myTable` lists
(e.g. `address.php`). See "DataTables follow-up" below — the per-screen `.DataTable()`
init is intentionally NOT wired yet.

## FontAwesome — NOT staged here, by design (still 1:1)

The legacy customer portal does **not** ship a local FontAwesome — `header.php`
L173 loads it from a CDN:
`https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.9.0/css/all.css` (FA Free
**5.9.0**). The faithful reproduction of "what the legacy does" is therefore the
**same CDN `<link>`**, which the `(protected)` layout renders directly. No webfont
files to copy. (If the team later wants FA self-hosted, that is a separate change
and must pin **5.9.0** to stay faithful.)

## DataTables follow-up (flagged — not done)

The legacy DataTables init is **per-screen with per-table options** — e.g.
`assets/js/pages/address/page.address.js` calls `$('#myTable').DataTable({...})`
with screen-specific `columnDefs` and a mobile/desktop branch. A single global
`.DataTable()` init would diverge from the legacy per-screen behaviour, so it was
deliberately left for a per-screen follow-up. The DataTables **library** (core +
bootstrap4 + responsive, JS + CSS) is staged so each screen can add its own
1:1 init script later. Until then the transcribed tables render statically with
the legacy DataTables classes (visually identical at rest), exactly as the
current transcriptions already do.
