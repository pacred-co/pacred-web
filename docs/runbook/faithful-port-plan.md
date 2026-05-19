# D1 Faithful-Port Plan — production launch this week

> **Owner directive (2026-05-19).** Pacred's customer portal + admin back-office
> become a **1:1 transcription** of the legacy PCS Cargo PHP system — rebuilt in
> Next.js, rebranded `PCS` → `PR`, **identical to the original 100%**.
> **`faithful-port` is the real production branch — it launches to real
> customers + staff THIS WEEK.**
>
> This doc is the plan + branch model + work-split **everyone follows**. The
> *how* (the transcription method) →
> [`faithful-port-transcription.md`](faithful-port-transcription.md).

---

## Branch model

| Branch | Role |
|---|---|
| **`faithful-port`** | 🚀 **PRODUCTION** — the real owner project, launches this week. Only tested, integrated 1:1 work lands here. |
| **`dave-pacred`** | เดฟ's 1:1 working branch **+ the integration branch** — `Poom-pacred` syncs here; merge + full test here *before* `faithful-port`. |
| **`Poom-pacred`** | ภูม's 1:1 working branch. push / pull-sync → `dave-pacred`. |
| ปอน's front-end branch | ปอน builds the front-end (marketing / landing) in the owner's style → merges into `faithful-port`. |
| `dave` · `Poom` | 🧊 **FROZEN** — the pre-pivot Next.js rebuild ("V3" / Track A). Untouched; resumed only after the faithful port ships. |

**Flow:** `Poom-pacred` + `dave-pacred` → integrate + test on `dave-pacred` →
`faithful-port` (production). ปอน's front-end → `faithful-port`.

Everyone opens **their own** branch and works there — except ปอน, who works the
front-end and merges straight to `faithful-port`. Sync daily; never push
half-built work to `faithful-port`.

---

## Work-split — parallel, no collision

| Who | Owns | Branch |
|---|---|---|
| **เดฟ** | Drive the 1:1 port · the **customer portal** screens · integrate at `dave-pacred` · the register/login production fix | `dave-pacred` |
| **ภูม** | Audit + transcribe the **admin back-office** — 187 `pcs-admin/*.php` screens, as faithful + complete as possible · split screen-batches to spawned agents | `Poom-pacred` |
| **ปอน** | The **front-end** (marketing / landing) in the owner's style → merge to `faithful-port` | own front-end branch |
| **ก๊อต** | **Fidelity review** — every screen 1:1 vs the legacy original · the borrowed-API watch · the production-launch gate | review |

**One owner per screen** — coordinate via เดฟ before claiming a batch, so two
people never transcribe the same file. ภูม keeps ปอน informed so the data
contract + the look stay aligned.

---

## Sequence — this week

1. **(urgent · parallel)** เดฟ — fix the broken register / login on the current
   production (`main`) so real customers can sign up + sign in now.
2. **Customer portal** — transcribe the ~25-30 real `member/*.php` screens
   (เดฟ + agents). Pilot `menu.php` ✅ done — it is the reference pattern.
3. **Admin back-office** — transcribe the 187 `pcs-admin/*.php` screens
   (ภูม + agents).
4. **Integrate** on `dave-pacred` → full `pnpm verify` + build + functional
   test → **`faithful-port` production launch**.
5. Phase C (the Tier 0/1/2/3 roadmap + the six systems) stays **deferred** —
   resumed on the frozen `dave` / `Poom` only after the faithful port ships.

---

## Pilot status — `menu.php` ✅ (the reference)

The 9-icon customer launchpad is transcribed 1:1
(`app/[locale]/(protected)/dashboard/`): verbatim legacy markup, legacy CSS
served as a static `<link>`, every legacy SQL query → `tb_*`. Verified — it
renders, it is mobile-clean (390px), build green. Two fidelity fixes applied:

- **Logo rebranded** — the wallet + sales-rep cards now use
  `public/images/pacred-logo-red.png` (was the legacy `PCS cargo` logo).
- **Chrome stripped for 1:1** — the Pacred app chrome (NavBar · the protected
  sidebar / mobile bottom-nav · the floating action menu) is removed from
  `(protected)/layout.tsx`. The legacy `member/*.php` screens are full-screen
  and carry their own chrome; the launchpad IS the navigation. The layout is
  now a minimal auth + TOS wrapper.

⚠️ **Open 1:1 question for เดฟ / ก๊อต:** the `TosGate` (TOS-accept modal) is
Pacred-added — the legacy PCS portal had none. It is kept for legal consent;
decide keep-vs-drop for strict 1:1.

## Brand assets

The Pacred logo lives at `public/images/pacred-logo-red.png` (+ `-white`). If a
more official `PR` brand asset turns up, swap it in `public/images/` +
`public/legacy/` later — flagged, non-blocking.
