# 🏠 ปอน save-point — 2026-05-19 (กลับไปทำงานคอมบริษัท)

> **Resume guide + work summary.** ปอน กำลังย้ายไปทำงานบนคอมบริษัท — เปิดไฟล์นี้
> ก่อนเป็นอันดับแรกบนเครื่องใหม่ แล้วค่อยอ่าน [`briefs/podeng.md`](../briefs/podeng.md).
>
> **Branch:** `podeng` · push แล้ว · **synced ขึ้น `dave`** (`2b800fb`).
> **Author:** ปอน-lane (Claude) · **Date:** 2026-05-19

---

## 1. งานที่ session นี้ส่งแล้ว (อยู่บน `podeng` แล้ว)

**Ads-launch batch** — commit `5cceacb` (push แล้วก่อนหน้านี้). เตรียมยิง ads
2026-05-20 (Google/YouTube/FB/LINE). ทั้งหมดเป็น marketing infra + tooling +
docs — **ไม่แตะ product code ลูกค้า** (นั่นคือ D1 Phase-B):

- [`docs/research/ads-launch-action-plan-2026-05-20.md`](ads-launch-action-plan-2026-05-20.md) — แผนยิง ads + กลยุทธ์ติดอันดับ 1 + checklist เชื่อมต่อ
- [`docs/research/podeng-tooling-2026-05-20.md`](podeng-tooling-2026-05-20.md) — วิเคราะห์ workflow ปอน + เครื่องมือ
- `scripts/check-connections.mjs` → `pnpm check:connections` — เช็ค env เชื่อมต่อ analytics/ads/monitor
- `scripts/audit-images.mjs` → `pnpm audit:images` — จับรูปหนักที่ฉุด LCP
- 2 skills: `legacy-fidelity-check` (gate "copy ของเดิม 100%" ของ owner) · `landing-conversion-audit` (เช็ค landing ก่อนยิงแอด)
- `AGENTS.md` §2 — บันทึกบรีฟ owner 2026-05-19 + index skill/doc ใหม่

---

## 2. สถานะ repo ตอน save-point — วิเคราะห์อัพเดท

**🔥 D1 Phase-B กำลังเดินเร็วมาก.** เดฟ spawn worktree-agent 4 ตัวทำ Phase-B
wave-1 แบบขนาน — และ **ทั้ง 4 slice landed บน `dave` หมดแล้ว** ภายใน ~1 วัน:

| Slice | Domain | commit | สถานะ |
|---|---|---|---|
| Customer **9-icon launchpad home** | หน้าบ้าน (ปอน) | `4ac5d9d` | ✅ landed → dave |
| Customer **order-flow legacy fidelity** | หน้าบ้าน (ปอน) | `8dfd5f3` | ✅ landed → dave |
| Admin **per-role RBAC sidebar + badges** | หลังบ้าน (ภูม) | `8a23823` | ✅ landed → dave |
| Admin **container tb_cnt payment ledger** | หลังบ้าน (ภูม) | `8f6054c` | ✅ landed → dave |

ไฟล์ใหม่ฝั่งหน้าบ้านที่เข้ามา: `components/sections/pcs-icon-grid.tsx` ·
`pcs-launchpad-header.tsx` · `pcs-sales-rep-card.tsx` · `pcs-wallet-card.tsx` —
นี่คือ **9-icon launchpad** (จุด fidelity gap #1 ใน [`d1-fidelity-customer.md`](d1-fidelity-customer.md)).

**branch อื่น:**
- `Poom` (`8c713fb`) — ภูม landed B-auth (legacy PCS password bridge) + save-point
- `claude/frosty-bhaskara-a38ced` — R&D: 8-specialist deep-dive + master synthesis
- `claude/nervous-montalcini-fa9819` — admin-nav: container-payments sidebar item
- `hotfix/auth-unblock` (`3912ad2`) — ⚠️ ยัง **ไม่ได้ merge เข้า dave** (ดู §4)

`podeng` ตอนนี้ = `dave` ล่าสุด (`2b800fb`) + ads-launch batch + ไฟล์นี้.

---

## 3. D1 Phase-B — บทบาทของปอนต่อจากนี้

ตาม commit `e81d4e9` (เดฟ): **Phase-B เป็น agent-wave-driven** — เดฟ + Claude
spawn worktree-agent ทำ rework, landed บน dave ทีละ wave. **4 slice ของ wave-1
"off-limits" สำหรับ rework คู่ขนาน** — แต่ละ slice มีเจ้าของคนเดียว.

**ปอนทำอะไรต่อ (ไม่ใช่ลงมือ rework เอง):**
1. `git pull` dave → **review + verify แต่ละ slice ที่ landed เทียบกับ legacy PCS** — ใช้ skill `legacy-fidelity-check` (โดยเฉพาะ 2 slice หน้าบ้าน: 9-icon home + order-flow)
2. ping เดฟ ก่อนหยิบ slice ใหม่ (กัน 2 คนชนกัน)
3. งานรอง: ถ้าเดฟมอบหมาย → support ads launch — รัน `landing-conversion-audit` + `pnpm audit:images` กับหน้า ad-destination

อย่าเปิด rework คู่ขนานกับ wave ที่กำลังรัน — ตามกฎ e81d4e9.

---

## 4. ค้างให้เดฟ (จาก ads-launch batch — ดูแผนเต็มใน [ads-launch doc](ads-launch-action-plan-2026-05-20.md))

1. 🔴 **Tracking ปิดอยู่** — `NEXT_PUBLIC_GTM_ID` ไม่ได้ตั้ง → ยิง ads = ยิงตาบอด. แก้ = dashboard task ~30-60 นาที
2. **รูป 105 ไฟล์ 112.5 MB** เกินงบ → LCP ช้า → Quality Score ตก (`pnpm audit:images`)
3. ⚠️ **`hotfix/auth-unblock` ยังไม่เข้า `dave`** — fix signup ที่ prod (signup = ปลายทาง conversion ของแอด). ต้องยืนยัน live บน prod + back-merge เข้า dave

---

## 5. 🖥️ RESUME GUIDE — เปิดงานต่อบนคอมบริษัท

```bash
# 1. ดึงงานล่าสุด
git fetch origin
git checkout podeng && git pull origin podeng

# 2. env — .env.local ไม่อยู่ใน git (เป็น secret) ดู §6
cp .env.example .env.local        # ถ้ายังไม่มีไฟล์
vercel env pull .env.local        # ทางลัด: ดึงค่าจาก Vercel (ต้อง vercel login ก่อน)

# 3. ติดตั้ง + รัน
pnpm install
pnpm dev
```

แล้วอ่าน: [`briefs/podeng.md`](../briefs/podeng.md) → [`STRATEGY.md`](../STRATEGY.md) → ไฟล์นี้ → §3 ข้างบน

---

## 6. env / ย้ายเครื่อง — ทำไม `.env.local` ไม่อยู่ใน git

`.env.local` มี secret จริง (Supabase service-role key, `OTP_PEPPER` ฯลฯ) —
**ห้าม commit ขึ้น git เด็ดขาด** (ขึ้น GitHub = รั่วถาวรใน history). ถูกตั้ง
gitignored มาตั้งแต่ต้น. ย้ายเครื่องแบบปลอดภัย 2 ทาง:

1. **`vercel env pull`** — ดึงทุก var ที่ตั้งใน Vercel ลง `.env.local` ใหม่ (เร็วสุด)
2. copy ไฟล์ `.env.local` จากเครื่องเดิมตรงๆ ผ่าน **1Password / AirDrop / USB** — ไม่ผ่าน git

📋 checklist ครบทุก var (36 ตัว) + แหล่งที่มาของแต่ละค่า → [`docs/env.md`](../env.md)
§"Complete .env.local inventory — machine-move checklist". env.md เขียนชัดว่า
*"Values live only in .env.local + Vercel — never in this doc"* — เลยไม่จดค่าจริงลงที่นั่น.

---

## Cross-links

- [`briefs/podeng.md`](../briefs/podeng.md) — ปอน role brief (force-read)
- [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 direction
- [`research/d1-fidelity-customer.md`](d1-fidelity-customer.md) — 11-screen Phase-B rework spec
- [`research/ads-launch-action-plan-2026-05-20.md`](ads-launch-action-plan-2026-05-20.md) · [`podeng-tooling-2026-05-20.md`](podeng-tooling-2026-05-20.md)
- [`STRATEGY.md`](../STRATEGY.md) — master single-read

*Save-point — supersede ด้วยไฟล์ใหม่เมื่อ session ถัดไป.*
