# แต้ม reconcile — applied + held-for-review (2026-06-19)

Source: `Pacred 2026-06-19.xlsx` · sheet "MOMO Pacred" (89 rows) — แต้ม's authoritative
per-tracking ground truth (container · transport · box · total weight · total volume).
Owner: *"ข้อมูลที่ถูกต้องที่ชัวร์เอาจากฝั่งแต้ม · อัปเดตให้ตรง · 24 รายการที่ยังไม่เก็บตังลูกค้าจัดได้เลย
· 2 เรื่องเงินทำเป็นรีวิวรอไว้ก่อน"*.

Repeatable tool: **/admin/api-forwarder-momo/warehouse-reconcile** (paste sheet →
preview → apply). The one-off below was run via that action's exact logic.

---

## ✅ APPLIED (2026-06-19) — 23 non-billed rows, owner-authorised

Updated the measurement basis (fweight / fvolume / famount / famountcount='1' /
fcabinetnumber / ftransporttype) to แต้ม's values on **23** forwarders that are
fstatus 1-4 (not yet billed — customer not charged), then **re-derived the sell price**
via the canonical `computeAndFillForwarderImportRate` (kg-vs-CBM ค่าเทียบ + any manual
rate honoured). Result: **basisUpdated=23 · repriced=23 · repriceFailed=0** (no silent ฿0).

- Backup of the pre-change values: `/tmp/taem-apply-backup-2026-06-19.json` (23 rows,
  with frefrate/frefprice/ftotalprice — restorable).
- Notable real corrections: `801738086049` (#52090) 0→4kg/0.033คิว · `910056206478`
  (#52088) คิว 0.135→0.270 · `112938377410` (#52093) คิว 0.153→0.306 + box 1→2 ·
  `6968866` (#52073) คิว 0.07→2.09 (this customer bills by kg @40, so total unchanged —
  but the คิว is now correct for container/reporting).
- Skipped: billed rows (fstatus 5/6/7) + all `1779955936*` (held below).

⚠️ Audit note: run as a one-off owner-authorised script (not the UI action), so it did
NOT write a `logAdminAction` row. The /tmp backup + this doc are the trail. Future
reconciles should go through the UI tool (which logs `taem_reconcile.apply`).

---

## 🔴 HELD FOR REVIEW (owner decision — NOT touched) — only ONE item left

### 1. #52089 `616035273` — BILLED but undercounted  ← the only open item
- fstatus=6 (เตรียมส่ง · already billed). Pacred: wt 18 / vol 0.066. แต้ม: wt **36** /
  vol **0.132** — the bill was computed on **half** the real volume → **under-billed**.
- **Decision needed:** issue a top-up bill for the difference, or accept the loss.
  (Updating the basis now would desync the issued bill, so the tool skips it.)

## ✅ RESOLVED — `1779955936` (+ `-2..-5`) (2026-06-19, owner: "ทำต่อให้จบ")
- The split sub-rows DO exist (#52052 parent + #52053–#52056 children) — "missing ~1 ton"
  was a recon artifact (the strict parser didn't match the empty-container continuation
  rows). Nothing was missing.
- Children #52053–56 already matched แต้ม exactly; only the parent #52052 had a sub-µ
  precision diff (vol 0.310860→0.310856). **Applied #52052 (re-priced).** All
  1779955936* rows now exact. Backup `/tmp/taem-1779-backup.json`.
- Tool fix shipped: `cabDiff` now ignores แต้ม's empty-container continuation rows (they
  were perpetually flagged "จะอัปเดต" against Pacred's real cabinet).

---

## The other 31 sheet rows (no action)
แต้ม has no data yet — container not closed / กระสอบรวม / ซ้ำ / ไม่พบ. The tool flags
them note-only and skips. Re-run the reconcile once แต้ม closes those containers.
