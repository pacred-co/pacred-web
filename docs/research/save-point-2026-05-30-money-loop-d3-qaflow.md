# 🌙 Save-point 2026-05-30 — Money-loop recovery + D-3 + qa-flow GREEN (เดฟ)

> **Session context:** เดฟ ทำบนเครื่อง Mac เดิม แต่ย้ายมาเมลสำรอง (เมลหลักติด limit) → ปิด session นี้ กลับเมลหลัก. งานทั้งหมด **push ขึ้น `dave-pacred` แล้ว** — session หน้าอ่าน doc นี้ + memory `money_loop_inflight_2026_05_30` ต่อได้เลย.
>
> **Branch:** `dave-pacred` HEAD = `9ef36e20`→ (see git log) · **ahead of main 15+ commits** · ยังไม่แตะ main (money-loop รอ ก๊อต gate).

## ✅ สิ่งที่ ship รอบนี้ (dave-pacred · ทุก local gate เขียว: lint/tsc/test:unit/build)

| commit | งาน |
|---|---|
| `db1d6d94` | ADR-0018 wallet SOT = tb_wallet + tb_wallet_hs (P0-1) |
| `8d4b9c2f` | **P0-2** Settle-1 — `actions/payment-tb.ts` yuan-from-wallet debit-on-submit · verified faithful vs legacy |
| `cb9f4220` | **P0-9** Settle-2 — `actions/admin/wallet-hs.ts` admin approve/reject + paydeposit cascade · verified faithful (fStatus='6' audit-claim ผิด · Pacred ถูก) |
| `aada41ee` | merge **InwPond007** (ปอน · LINE-OA webhook + service-import refactor + sidebar/team) · migration renumber 0125→**0131** |
| `9ef36e20` | fix(build) — install `@ericblade/quagga2` (undeclared, camera-scanner.tsx) + pin `NODE_OPTIONS=4096`. **2 breaks นี้ pre-existing บน main** (main build แดงมานานตั้งแต่ camera-scanner ลง) |
| `46379832` | **D-3** balance READ repoint → tb_wallet.wallettotal (member_code) − tb_wallet_hs status='1' overhang · signature เดิม 11 callers ไม่พัง · **ปลด P0-2 reachability** (/service-payment/add ปุ่มกระเป๋าเปิดให้ migrated) + P0-8 |
| `7e21fcbd` | fix(security) — `EMERGENCY_OTP_BYPASS` env-gated default-false (เดิม hardcoded true) |
| `d58c6fb5` | **D-4** qa-flow gate `tests/qa-flows/wallet-delta.ts` |

## 🟢 Verified จริง
- `pnpm verify` + `pnpm build` = เขียว (build ต้อง heap 4GB · pin แล้ว)
- **qa-flow D-4 gate RAN GREEN บน prod (Node 24)** — 8/8 · approve +Δ / debit −Δ / reject no-Δ / sentinel teardown · พิสูจน์ tb_wallet เคลื่อนเงินจริง (seed `QAFLOWTEST` + ลบทิ้ง · ไม่แตะลูกค้าจริง)
- Settle-1/2 + D-3 verified faithful vs legacy (workflow `wjmg72n4r` / `w3e1uzqdi` outputs · มี file:line)

## 🛠 Infra/prod ที่ทำ
- **Migration 0131_line_oa_inbox APPLIED prod** (413ms · 4 ตาราง LINE OA isolated · idempotent)
- **Node 24 installed (nvm) + set default** (engines repo ≥24 · เครื่องนี้ default เป็น 20 ซึ่งไม่มี WebSocket ทำให้ qa-flow/DB-tests รันไม่ได้). รัน gate: `nvm use 24 && node_modules/.bin/tsx --env-file=.env.local tests/qa-flows/wallet-delta.ts`
- `.env.local` = sync ครบ (ทุก secret prod) · S3 key ชุดเดิมใช้ต่อได้ (ไม่ต้อง rotate — เป็น hygiene เก่า ไม่ใช่ blocker · ถ้าจะ rotate = สร้าง key ใหม่ใน dashboard → update env ทุกที่ → ค่อย revoke เก่า · ห้ามลบเฉยๆ)

## 🔴 ค้าง — ต้องคน/credential (ผมทำ code prep หมดแล้ว)
1. **ThaiBulkSMS key จริง** (ก๊อต/owner) → เปิด OTP ใน prod ได้ · ระหว่างนี้คง `EMERGENCY_OTP_BYPASS=true` บน Vercel (ไม่งั้น register/forgot พัง เพราะส่ง SMS ไม่ได้)
2. **ก๊อต co-sign ADR-0018 (formal) + re-run qa-flow บน CI** ก่อน money-loop ขึ้น main (gate)
3. ADR-0018 มี note "impl complete + D-4 GREEN 2026-05-30" แล้ว (factual) · ตัว co-sign ชื่อ ก๊อต = ของเขา

## ▶️ Pickup (session หน้า — ผมทำต่อได้ไม่ติดใคร)
- **P0-9 reachability** — wire 3 surface (`slip-review-modal` / `bulk-approve-bar` / `actions-cell`) → ฟังก์ชันจริง (ตอนนี้ tombstone fail-loud · มีแค่ `/admin/wallet/[id]` ที่ทำงาน)
- **P0-7 withdraw WRITE** — `createWithdraw` → tb_wallet_hs (D-3 ทำ read ถูกแล้ว เหลือ write · co-ship กับ ภูม admin approve/refund P1-26)
- **P0-3/4/5** cart+order unify → tb_header_order/tb_cart · cancel hStatus='6' (เดฟ lane)
- ขยาย qa-flow ให้ครอบ Settle-1/2 funcs โดยตรง (ตอนนี้ใช้ adminApproveWalletHs/adminMarkServiceOrderPaidTb)

## Resume command
```bash
cd /Users/dev/pacred-web
git fetch origin && git checkout dave-pacred && git pull origin dave-pacred
nvm use 24            # gate/DB-tests ต้อง Node ≥24
git log --oneline -10
# อ่าน: memory money_loop_inflight_2026_05_30 + doc นี้ + docs/decisions/0018-wallet-sot.md
# pickup: P0-9 surfaces / P0-7 write / P0-3-5 cart
```

> งานเหลือทั้งหมด (23 P0 + 31 P1) = `docs/research/legacy-gap-2026-05-30/_MASTER.md` + work-split 4 lane (§6).
