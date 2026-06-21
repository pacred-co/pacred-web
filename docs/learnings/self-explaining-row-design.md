# Self-explaining rows — the platform list-design standard (owner 2026-06-22)

> **Owner directive (verbatim intent):** *"เราชอบการอธิบายข้อมูลแบบนี้ในรายการแถว … ถ้ามีรูปก็ดึงมา … ถ้าของลูกค้าคนเดียวกัน หรือชิปเมนต์ หรือออเดอร์เดียวกัน หรืออะไรที่กรุ๊ปกันได้ก็กรุ๊ป … ต้องทำให้วิเคราะห์ได้ตั้งแต่เห็นรายการนั้นๆ แล้ว ว่ามันคืออะไร ของใคร ทำอะไร อยู่สถานะไหน รายละเอียดที่เกี่ยวข้องมีอะไร รูปมีไหมรูปอะไร ให้พนักงานทำอะไร เปิดมาตั้งแต่วันที่เท่าไร … ปรับใช้กับทั้ง platform ตามความเหมาะสมของแต่ละหัวข้อ … พัฒนาต่อยอดเอา"*

The reference the owner praised: the **`/admin/wallet?view=tx` rows** — thumbnail + clear Thai label + customer + "what it pays" one-liner + at-a-glance status pill + handler + opened date + same-customer-amount pairs **collapsed to one row**. Make every list row on the platform read like that.

## The rule: a row must be analyzable AT A GLANCE — no studying, no cross-referencing

A staff member (or customer, or partner) should understand a row the instant they see it, without opening it or mentally joining tables. If they have to click in to find out "what is this / whose is it / what do I do", the row failed.

## The 8-point row checklist (score every list surface against this)

For each row, can the reader instantly see:

1. **คืออะไร (what)** — a clear Thai type/kind label. **Never a raw code** (`type 8`, `status 4`, `fstatus`). One human label per kind.
2. **ของใคร (whose)** — owner name + member code (+ phone where useful). If many rows share an owner/shipment/order → **group them** (see below).
3. **ทำอะไร (action/event)** — what this row represents in plain words ("ชำระค่าฝากนำเข้า #F52093", "เติมเงินโดยแอดมิน").
4. **สถานะไหน (status)** — a **state-encoding colored pill** (use the SOT configs: `service-order-status.ts` HSTATUS_CFG · `forwarder-status.ts` FSTATUS_CFG · etc.). Readable at a glance — never a near-invisible tint, never a bare number.
5. **รายละเอียดที่เกี่ยวข้อง (details)** — the key linked refs the reader needs: order#, container, tracking, amount, bank — as compact secondary text or chips.
6. **รูปภาพ (image)** — if a relevant image exists (slip / product cover / profile / cabinet photo), pull it as a **thumbnail** in the row. Use `components/admin/slip-image.tsx` for slips (handles PDF + image + missing-file fallback). Tell the reader what the image is.
7. **ให้พนักงานทำอะไร (next-action)** — the obvious next step: a row action button, or a hint ("รอตรวจสลิป", "กดยืนยันเพื่อตัดจ่าย"). Reachability §0d — the action must be ≤1 click from the row.
8. **เปิดมาวันที่เท่าไร (opened-date)** — the created date/time in Thai format (`formatThaiDateTime` · Asia/Bangkok · DD/MM/YY HH.MM น.).

## Grouping — collapse what belongs together

If rows share a natural key, **group them into one logical row** with an expandable detail, instead of N confusing repeats:
- same customer + same amount + the "เติม-แล้วจ่าย" pair → ONE row (the slip-bearing one), expandable "ดูรายการย่อย".
- same **container** (fcabinetnumber) → group the per-tracking rows under the container.
- same **shipment / order** (reforder / hno) → group the linked items.
- same **customer** on a queue → cluster or badge "(3 รายการ)".

Grouping rules: show the meaningful aggregate on the header row (the real total, the count), keep the breakdown one click away, and **never double-count money** when aggregating (see `momo-bill-header.ts` / the wallet pair-collapse for the precedent).

## How to apply (per surface — adapt, don't force)

Not every point fits every surface — apply what's meaningful for that list:
- A **payment/slip** queue → all 8 (esp. image + next-action + group pairs).
- A **forwarder/container** list → status pill + customer + tracking + cabinet + cost + group-by-container.
- A **customer** list → avatar + code + tier pill + balance + order-count + last-activity.
- A **driver/dispatch** board → job status + customer + address + group-by-driver/route.

Reuse, don't reinvent: the status SOT configs, `SlipImage`, `formatThaiDateTime`, the pair-collapse helpers. When you touch ANY list surface, bring its rows up to this standard as part of the change.

## Anti-patterns
- ❌ A raw enum in a cell (`type 8`, `fstatus 2`) — the reader can't decode it.
- ❌ A bare amount + name with no "what/why" — forces the reader to open the row.
- ❌ N near-identical rows for one logical thing (the same customer+amount twice) — group them.
- ❌ A slip/image that exists but isn't shown — pull the thumbnail.
- ❌ A status shown only as text, or as an invisible tint — use a readable colored pill.
- ❌ Dev jargon in the UI (`Wave 7.2`, table names, `→ Wave 8`) — plain Thai only.

## Cross-links
- [`pacred-design-philosophy.md`](pacred-design-philosophy.md) — the broader "steal the workflow logic, apply our own polish" philosophy.
- AGENTS.md §0c (verify-deep-flow) · §0d (reachability) · §0f (product-quality concept) — the row standard is the at-a-glance arm of §0f.
- `lib/admin/service-order-status.ts` · `lib/admin/forwarder-status.ts` — the status-pill SOTs.
- `components/admin/slip-image.tsx` — the PDF/image/missing-safe thumbnail.

## Rollout status (platform audit 2026-06-22 · 7-surface fan-out)

The GOLD reference = `/admin/wallet?view=tx` (done). Rollout, prioritized:

| Surface | Priority | Has now | Next applied / TODO |
|---|---|---|---|
| `/admin/wallet?view=tx` | — | GOLD (thumbnail · plain labels · pair-collapse · status) | ✅ reference |
| `/admin/forwarders` (รายการนำเข้า) | P0 | MOMO-sibling group · thumbnail · FSTATUS pill | ✅ **next-action hint** (SOT `FSTATUS_CFG.next/act`) · TODO: cabinet-group · thumbnail at row-start |
| `/admin/service-orders` (ฝากสั่งซื้อ) | P1 | hstatus pill · cover thumbnail · date | ✅ **next-action hint** (SOT `HSTATUS_CFG.next/act`) · TODO: thumbnail-left · group same-customer pending |
| `/admin/yuan-payments` (โอนหยวน) | P1 | paystatus pill · ¥ amount | TODO: **slip thumbnail** (SlipImage · resolveLegacyUrlMap) · group same-customer |
| `/admin/customers` (ลูกค้า) | P0 | code · tier · status | TODO: **profile avatar** · last-activity · order-count signal |
| `/admin/report-cnt` (รายการตู้) | P1 | grouped-by-cabinet · fstatus + pay pill | TODO: owner name/phone · cabinet photo · next-action |
| `/admin/drivers` + `logistics-board` | P0 | board grouped-by-stage | TODO: **group drivers list by driver** (counts + collapsible batches) · transport icon already |
| `/admin` dashboard queue tabs | P0 | slip queue = GOLD | TODO: bring the OTHER tabs (forwarder/shop queues) up to the same row (thumbnail + type + next-action) |

**Pattern applied this round:** the `next`/`act` fields on the status SOTs (`HSTATUS_CFG` / `FSTATUS_CFG`) — the "ให้พนักงานทำอะไรต่อ" hint rendered under the status pill (🔔 + rose when an action is due). Because it lives in the SOT, it surfaces on every list/detail that reads the status — extend the same way for the remaining surfaces.
