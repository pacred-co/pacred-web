# 🌙 ภูม save-point — 2026-05-24 ค่ำ (Wave 14 complete · พักแล้ว · พรุ่งนี้ว่ากันใหม่)

> **อ่านไฟล์นี้ก่อนทุกอย่าง** พรุ่งนี้เปิดมา. ครอบคลุม: Wave 14 batch (1 commit ของวันนี้) ·
> 47-gap fidelity audit · top 3 P0 fix queue · phantom discovery · resume commands

---

## 📦 1 new commit ลง `Poom-pacred` แล้ว (วันนี้)

`d287992 feat(wave-14): forwarder edit dimensions (12-C ภาค 2) + fidelity audit`

5 files · +1,365 LOC · 2 parallel agents + 1 orchestrator stream

(Plus pull วันนี้ตอนเช้า — 79 commits ของภูมิ Wave 9/12-D/13/13.1 + Migration 0095 + Brand re-theme + Backfill 02-06.)

---

## ✅ Wave 14 — 3 streams done parallel

### Stream 1 (Agent D) — Wave 12-C ภาค 2 forwarder edit dimensions
4 files · ~860 LOC implementation:
- `actions/admin/forwarders-edit.ts` (217) — `adminUpdateForwarderDimensions` server action · UPDATE `tb_forwarder` dimensions + per-item `chinawoodencratefee*` loop + audit log
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx` (229) — server component · read-only context strip + Wave banner
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/edit-form.tsx` (414) — **pure Tailwind** (NO pcs-legacy per AGENTS.md §0a) · live-CBM preview · radio chips · per-item crate w/ bulk buttons · sticky save bar
- `[fNo]/page.tsx` modified — "✏️ แก้ไขขนาด/น้ำหนัก" entry button (green Wave tag) in BOTH branches (rebuilt + legacy renderer)

### Stream 2 (Agent B) — Fidelity audit 5 admin pages
1 file · 282 LOC doc:
- `docs/audit/fidelity-gap-2026-05-24.md` — **47 gaps** documented (18 🔴 workflow · 22 🟠 polish · 7 🟢 intentional Pacred-better)

### Stream 3 (Me) — orchestration + QA + phantom discovery
- Browser-verified 3 admin pages via Chrome MCP (brand red theme + 12 VIP tier cards + Wave 12-C v2 form)
- 10 routes smoke 307 (no 500) on PROD Supabase
- **Phantom discovery:** Phase A migration `tb_priceuser_*` ไม่เคยมีจริง · Wave 9 ภูมิรู้แล้ว · ของจริงคือ `tb_rate_vip_*` + `tb_hs_rate_custom_*` + `tb_customrate_hs` ทั้งหมดอยู่บน prod + Wave 12-D ภูมิทำ edit forms ไปแล้ว → ไม่ต้อง migrate, ไม่ต้อง build, **Phase A backlog item closed**.

---

## 🚨 Top 3 P0 fixes (จาก fidelity audit) — รอภูมิเลือกพรุ่งนี้

| # | Fix | LOC | Why |
|---|---|---|---|
| **1** | `/admin/wallet` **per-customer balance summary view** | ~150 | Paradigm gap — legacy default = per-customer balance summary · Pacred default = tx list. Ops ตอบ "PR3963 มียอดเท่าไร?" ในคลิกเดียวไม่ได้ตอนนี้ |
| **2** | `/admin/yuan-payments` **default-60d date filter** | ~60 | Smallest fix · stops "old paid rows ทับ today's pending" confusion ทันที |
| **3** | `/admin/forwarders` **ยอดค้างชำระ column** | ~80 | Money-chasing เร็วขึ้น · port legacy `calPriceForwarderMain()` formula |

**Total ~290 LOC · est. 3 ชม รวม**

### Other 🔴 workflow gaps (ใน audit doc — not top 3 but still must-fix eventually)

- `/admin/forwarders` ขาด 7 columns เพิ่ม (diffDateTimeNow elapsed-time · VIP/SVIP/SaleAdmin badges · ETA range · cabinet-number link · print-status badges · pallet location · default 30-day window) + ขาด delete + bulk-move-special actions
- `/admin/customers` ขาด 5 columns (main address จาก `tb_address` · birthday/age · VIP badge · LINE ID · Facebook) + ขาด password-reset action
- `/admin/yuan-payments` paytype label mismatch (legacy 3 values · Pacred 4 — verify ก่อน fix)
- `/admin/cnt-hs` deliberate Wave-after-pilot stubs (inline เพิ่มไฟล์ AJAX modal · select-pay composer · addPay form) — ไม่ต้องด่วน

### 6 open verification items ผมต้องตรวจก่อน fix
- `wallet-approve.ts` (logic ตรงกับ legacy ไหม)
- `customer-row-actions.tsx`
- `/admin/customers/[id]`
- prod `tb_payment.paytype` enum (3 vs 4 values)
- `/admin/forwarders/new` stub status
- `/admin/yuan-payments/new` stub status

---

## 🚨 Pending ภูม actions (ค้างจาก save-point เก่า + ใหม่)

### 1. 🔴 ROTATE S3 access key (security · ค้างจาก 2026-05-23 save-point)
S3 key `e913d7da34ca0089638f100afb74c972` ใน `.env.local` ยังเป็นตัวที่ leak ในแชท. ภูมิตัดสินใจ "ปล่อยไว้ก่อน" ตอนนี้ · ลบเมื่อจบ backfill ทั้งหมด → Supabase Dashboard → Storage → S3 Access Keys → delete row + ลบ 4 บรรทัด SUPABASE_S3_* ออกจาก `.env.local`

### 2. (Optional) Apply migration `0094_view_sales_by_rep.sql` (ค้างจาก Wave 8)
`/admin/reports/sales-by-rep` ขึ้น error banner จนกว่าจะ apply. Idempotent · safe re-run.

### 3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน (จาก migration 0095)
PR120-124 → PR10900-10903 · ถ้ายังไม่เคย login ก็ skip ได้.

---

## 🌅 Resume commands พรุ่งนี้เปิดเครื่อง

```bash
# 1. Pull latest (อาจมี commits ใหม่จากเดฟ/podeng)
cd C:\Users\Admin\pacred-web\pacred-web
git fetch origin
git checkout Poom-pacred
git pull --ff-only origin Poom-pacred
git log --oneline -5    # ต้องเห็น d287992 อยู่ด้านบนสุด (+ commits ใหม่ถ้ามี)

# 2. .env.local — ไม่ต้องแก้ (ยัง PROD Supabase ตามที่ภูมิแปะ env วันนี้)
grep NEXT_PUBLIC_SUPABASE_URL .env.local
# ต้องเป็น https://yzljakczhwrpbxflnmco.supabase.co

# 3. Install + dev
pnpm install
pnpm dev    # localhost:3000

# 4. (Optional) Browser smoke
# /admin                              → dashboard (brand red sidebar)
# /admin/forwarders/<fNo>/edit        → Wave 12-C ภาค 2 edit form
# /admin/rates/custom-user → VIP tier matrix · ลอง edit ดู
# /admin/wallet → 1,470 pending · checkboxes พร้อม bulk approve
```

---

## 🎯 พรุ่งนี้ตัดสิน — 6 ตัวเลือก

| # | งาน | est. | คำแนะนำ |
|---|---|---|---|
| **A** | ลุย Top 3 P0 ทันที — wallet balance + yuan filter + forwarder ยอดค้าง (~290 LOC) | 3 ชม | ✨ สูงสุด · operator productivity ดีขึ้นชัด |
| **B** | ลุยแค่ #2 yuan date filter (smallest win) | 30 นาที | ✨ Quick visible fix |
| **C** | Browser-test Wave 12-C ภาค 2 edit page on prod (กรอก dimensions ดู wallet/CBM/crate ทำงานจริงไหม) | 15 นาที | ✨ Verify ที่ทำไปก่อนใช้จริง |
| **D** | Apply migration 0094 + ภูมิ rotate S3 key (pending actions) | 10 นาที | Cleanup |
| **E** | ลุย 🔴 workflow gap อื่น (forwarders 7 cols / customers 5 cols / pwd-reset) | 4-6 ชม | Deeper · fidelity-first |
| **F** | Merge `dave-pacred` ถ้ามี update | 1-2 ชม | Customer-side sync |

แนะนำลำดับ: **D (5 นาที cleanup) → B (30 นาที quick win) → A (3 ชม Top 3 P0)**

---

## 📊 รวมสถิติ Wave 14 (วันนี้)

- 1 commit · 5 files · +1,365 LOC
- 2 parallel agents + 1 orchestrator stream
- 0 merge conflicts
- TSC clean · 10 routes smoke 307 · 3 browser screenshots verified
- 47 gaps documented (audit doc)
- 1 phantom discovered (Phase A migration ไม่จำเป็น)

**Wave 7.3 → 8 → 14 รวมตั้งแต่ home-machine sprint (5 sessions):**
| Session | Commits | Highlight |
|---|---|---|
| 2026-05-22 home | 4 | Wave 7.3 + Wave 8 A/B/C |
| 2026-05-23 work | 10 | Wave 9 + 12-C v2 + 12-D + 13 + 13.1 + Migration 0095 + Backfill 84K files + brand re-theme |
| 2026-05-24 home | 1 | Wave 14 forwarder edit + fidelity audit |
| **รวม** | **15** | — |

---

## 📣 Notified

- **พี่เดฟ** — Wave 14 forwarder edit done · ของผมไม่ pixel-clone Bootstrap (ตาม §0a) · audit doc สำหรับดู P0 gaps ที่ค้าง
- **พี่ก๊อต** — migration 0094 ยังต้อง apply · S3 key ใน env ยังต้อง rotate (deferred per ภูมิ)
- **ปอน** — ไม่มี frontend impact วันนี้ · brand red theme ภูมิ ship ก่อนแล้ว

ภูมิพักดีๆ พรุ่งนี้ตื่นมาตัดสินจาก 6 ตัวเลือก. 🌙
