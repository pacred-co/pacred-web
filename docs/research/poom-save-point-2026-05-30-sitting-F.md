# 🌙 Save-point 2026-05-30 — Sitting F · Tier-D bundle SHIPPED (ภูม)

> **Session context:** ภูมิ ลุยยาวๆ ตามกฎ §0.1 SYNC CADENCE (push at save-point ONLY · pong เดฟ ตอน lane chunk เสร็จ). Tier-D bundle (P0-13 + P0-16 + P0-13/P1-10 + P1-13) ship เป็น batch เดียว.
>
> **Branch state:** `Poom-pacred` — 3 new feature commits + 1 handoff doc tick + 1 save-point doc (this file). Sync with `dave-pacred` at session start (merged P0-15 print + P0-19 pay-on-behalf + §0.1 directive). **Diverged since · ready for เดฟ batch-merge.**

---

## ✅ ที่ ship รอบนี้ — 3 feature commits + 1 doc

| commit | งาน |
|---|---|
| `a303f375` | **P0-16 / Tier-D D2** — per-item refund (NEW `actions/admin/service-orders-refund.ts`) |
| `82c9a6ca` | **P1-13** — yuan refund-modal repoint to tb_payment (`actions/admin/yuan-payments.ts`) |
| (next) | **P0-13 + P1-10 / Tier-D D1+D3** — 5-tab shop UPDATE workflow + tb_promotion carry |
| (last) | docs(handoff): tick Tier-D items + this save-point doc |

**Verify gates (all green before commit):**
- `pnpm lint` → 0 errors / 99 warnings (warnings = baseline)
- heap-bumped `pnpm typecheck` → exit 0
- Unit tests: 43/43 (P0-16) + 40/40 (P0-13) = **83/83 new asserts**

---

## 🟢 Tier-D bundle = Tier-D ปิดหมด (3/3 D1-D3)

| Tier-D | งาน | สถานะ |
|---|---|---|
| **D1** | 5-tab shop UPDATE workflow | ✅ ภูม sitting-F (Phase 1 ครบ · 3 Phase-2 handlers ติด server side · UI mount Phase 2 = follow-up) |
| **D2** | repayItem per-item refund | ✅ ภูม sitting-F |
| **D3** | tb_promotion carry on 4→5 spawn | ✅ ภูม sitting-F (เป็นส่วนหนึ่งของ D1 spawn-handler) |

Plus bonus:
- **P1-13** refund-modal repoint = unblock P0-11's refund button (sitting-E) บน real legacy IDs

---

## 🟠 9 follow-up flags (จาก agent P0-13 honest list)

1. **Phase 2 UI mounts** — `adminUpdateOrderAddress` + `adminSwitchOrderTransport` + `adminAddOrderNote` server-side แล้ว · UI button ยังไม่ wire (≤30 min/each follow-up sitting)
2. **Crate toggle + IPC reassign** — UI design ยังไม่มี (small modal needed)
3. **Phase 3 cron auto-flip 4→5** — out of scope ตาม brief (Phase 1 admin-initiated เพียงพอ)
4. **SMS on ordered+completed transitions** — wired only on QUOTE (legacy ทำเหมือนกัน · Pacred อยากเพิ่ม = ~5 min/each)
5. **Legacy LINE Notify** — intentionally NOT wired (EOL Apr 2025 · LINE OA push canonical แล้ว)
6. **cshippingnumber bulk UPDATE** — เขียนค่าเดียวกันทุก tb_order line ของ hno เดียว · legacy update3 ใส่ per-shop ได้ · audit trail intact via hnote append
7. **No idempotency on QUOTE re-fire** — admin ต้อง rollback 2→1 ก่อน re-quote (legacy เหมือนกัน)
8. **adminAddOrderNote** — ไม่ push 3-channel ตอน hnoteuser flip = '1' (legacy saveNote ทำ · ต้อง notify helper แยก)
9. **tb_order.cshippingnumber** — Zod cap 500 chars ตาม schema · ยาวกว่านี้ Zod reject

---

## 🔧 ของที่ค้นพบระหว่างทำ (handoff updates)

- **P1-27 paydeposit batch-settle ALREADY DONE** ใน `actions/admin/wallet-hs.ts` (P0-9 `adminApproveWalletDeposit` L572-769 + reject path L1004-1080). Handoff §1 ที่ว่า "only P1-27 remains" = stale. Cascade by hno-prefix + sibling type='2'/'4' flip + parent flip ทำครบ. ก๊อต money-loop gate ใกล้ขึ้น main มาก.
- **P1-10 tb_promotion carry** = part of P0-13 spawn-handler (not separate). Carry pattern: SELECT existing promos WHERE hno=origHno → per (promoid × newFno) INSERT new row dedup idempotent.

---

## 🤝 Handshake สำหรับ เดฟ (per §0.1 cadence)

**Lane เสร็จแล้ว · พี่เดฟ batch-merge เข้า dave-pacred ได้เลย:**

- ภูมิ lane ที่จับใน batch นี้: `actions/admin/service-orders-refund.ts` (NEW) + `actions/admin/service-orders-shop-workflow.ts` (NEW) + `actions/admin/yuan-payments.ts` (P1-13 modify) + 2 NEW client forms + legacy-view.tsx (+3 imports · +3 conditional renders)
- **Zero file-collision** กับ เดฟ lane: ไม่แตะ `actions/cart.ts` / `actions/service-order.ts` / `(protected)/*` / `actions/wallet-tb.ts` / `actions/payment-tb.ts` (เดฟ-owned)
- **No DB schema changes** (no new migration · ทุก column verified vs 0081 · ห้ามเดา enforced)
- ก๊อต production gate: ใหม่ๆทั้งหมด covered โดย unit tests (83 asserts) แต่ qa-flow-simulator wallet-delta gate ยังไม่ extend ครอบ refund flow ใหม่ — flag for next ก๊อต gate run

**Verify Pacred ตอนนี้ใช้งานได้ end-to-end:**
- หน้า `/admin/service-orders/[hNo]` (legacy-view) → กดปุ่ม action ตาม hstatus → flow ปิดถึง 5 (completed + tb_forwarder auto-created)
- หน้า `/admin/yuan-payments/[id]` → กด "คืนเงิน + แนบสลิป" → tb_payment + tb_wallet + tb_wallet_hs เคลื่อนเงินจริง (was graceful "not_found" pre-fix)
- หน้า `/admin/service-orders/[hNo]` items list → ยังไม่มีปุ่ม "คืนเงินรายการนี้" mounted (UI mount = next sitting · backend ready)

---

## 🎯 Sitting G+ pickup (ภูมิ session ถัดไป OR เดฟ ตัดสิน)

Lane-chunk ที่เหลือ:

| Item | Effort | Notes |
|---|---|---|
| **P1-5 earn-trigger** | M ~1-2h | ADR-0019 D-B spec ready (4 agent codes · 1% - 3% WHT) · INSERT tb_user_sales on fStatus='7' |
| **Phase 2 UI mounts** (3 handlers from P0-13) | S ~30min/each | adminUpdateOrderAddress + adminSwitchOrderTransport + adminAddOrderNote · server-side ready · just wire buttons |
| **Per-item refund UI mount** | S ~30min | "คืนเงินรายการนี้" button + reason modal in items table on legacy-view |
| **Crate toggle + IPC reassign** | M ~2h | UI design + admin-picker |
| **Phase 3 cron auto-flip 4→5** | S ~1h | Cron-initiated complement of spawn-handler |
| **adminAddOrderNote 3-channel push** | S ~30min | Trigger when hnoteuser flips '1' |
| **resolveLegacyAdminId consolidate** | S ~10min | Master-fidelity L147 · 3 duplicates → 1 lib/auth helper |
| **forwarder Phase B detail handlers** P1-6/7/9 | M ~1-2h each | cnt-payment slip, bill-to-customer per-row, saveNote LINE push |

---

## ⚠️ ที่ยังต้องคน (ก๊อต/ภูมิ/พี่ป๊อป decision)

1. **ก๊อต co-sign ADR-0018** + re-run qa-flow บน CI (ก่อน money-loop ขึ้น main) — extended wallet-delta gate from sitting-D already covers withdraw + yuan paths; new P0-16 refund + P1-13 yuan-refund paths NOT extended yet
2. **P0-12 decision** (paystatus '2'→'1' SOD vs current one-step) — touches Tier-A1 contract · ก๊อต co-sign needed
3. **P0-10c column gap** (tb_users.adminidupdate + userdateactive doesn't exist) — ภูมิ confirm whether to remove the 2 nonexistent column writes
4. **2 cron decisions** จาก sitting-D — sales-daily-digest type='2' vs JOIN · expire-driver-assignments endtime vs 17h-fixed
5. **LINE OA quota upgrade** (B2 dependency) — ก๊อต Vercel env

---

_เดฟ pulls `Poom-pacred`, batch-merges into `dave-pacred`, gates (lint/tsc/test:unit/build), pings ก๊อต. ภูมิ goes heads-down on next lane-chunk per §0.1._
