# Save-point — sitting-I v5 · 2026-06-02 ค่ำ · ปิด session ที่บ้าน

> **คอมที่ทำงานอ่านอันนี้ตอนเช้า — sync แล้วเริ่มต่อได้ทันที.**
>
> **Branch state:** `Poom-pacred = 147105e5` · pushed · origin synced (0/0)
>
> **Total session: 21+ commits today** — sitting-I v1-v3 (PEAK module 5/5) → v4 (CEO pricing pair + cron) → v5 (ภูม UX P0 fix) → **v5-after MOMO Q1+Q2** (ภูม flag ค่ำ · scripts + answer doc)

---

## 🧭 ทำอะไรไปแล้วในวันนี้

### Sitting-I main run (v1-v3) — landed earlier
PEAK module §3 fully closed (5/5 sub-surfaces):
- §3.1 PEAK Documents Lifecycle hub
- §3.2 AR-aging cockpit (= §4)
- §3.3 Period close (verified already shipped V-E9)
- §3.4 e-Tax (RD Code 86) export hub + bulk XML download
- §3.5 PEAK/FlowAccount CSV export hub

Plus brief tasks §1 + §5a (Potemkin commission repoint + ADR-0026), §4 AR-aging, §6 TH-transport reader, sitting-H-fix-1/2 menubar cascade bug, sitting-H FRG2605-00219 mPDF fix.

### Sitting-I continuation v4 (เย็นนี้) — **CEO pricing directive CLOSED**

CEO directive 2026-06-01 quote (CLAUDE.md PM):
> **"pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"**

Shipped the full feedback loop:

| Half | Tool | Path | Commit |
|---|---|---|---|
| 🔁 Retrospective | **Margin Monitor** | `/admin/accounting/margin-monitor` | `3096df7f` |
| 🔮 Forward-looking | **Sales Quote Comparison** | `/admin/accounting/quote-compare` | `06feb98e` |
| 🔔 Review loop | **Daily LINE staff-flag cron** | `/api/cron/margin-flag` (00:10 ICT) | `2a0e53c5` |

**Margin Monitor** — เปิดดูตู้ที่ส่งสำเร็จแล้วในช่วงเวลา: bucket per CEO cap (negative / 0-5k / 5-10k / 10-15k / 15k+) · top-20 over-cap (>฿15k · ลูกค้าควรได้ราคาดีกว่า) · top-20 negative (rate sheet error) · per-rep leaderboard with over-cap count · CSV export · default 90 days.

**Sales Quote Comparison** — sales rep input dimensions → ระบบเทียบ 9 carriers ให้ (CTT/Sang/MK/MX/MX-weight/JMF/CargoCenter/MOMO/GOGO) · sale rate via SVIP→VIP→general waterfall (resolve-rate.ts) · cost rate via tb_settings 144-cell matrix · per-carrier margin + bucket + CEO cap warnings · best-carrier recommendation · sharable GET-URL quotes.

**Margin-flag cron** — daily 00:10 ICT scans yesterday's deliveries · push over-cap (top 5) + loss (top 5) to LINE staff group with deep-link → Margin Monitor dashboard · quiet mode env-gated (`MARGIN_FLAG_QUIET=true`).

### Sitting-I continuation v5 (ดึกนี้) — **ภูม P0 UX flag closed**

ภูม flag 2026-06-02 ค่ำ:
> "หน้า /admin/forwarders พอกดดูข้อมูล มันขึ้นอะไรยาวมาก ทั้งยวงเลย... ดูกากกว่า PCS อีก... แบบนี้คือมั่วมากไม่สวยด้วย แก้ด่วน"

**Root cause:** Right-column action panels accreted as separate Wave/Theme additions without UX harmonization — Wave 23 → adm-09 re-sweep → Theme A → Theme bill-to ทุก wave เพิ่ม panel ใหม่ทับลงไป expanded ทั้งหมดในแถบเดียว → ดู cluttered + ยาวมาก

**Fix shipped `819c283d`:**
Wrap each interactive panel in CollapsibleCard (server-side `<details>` · no JS dep):

| Panel | Default state | Trigger logic |
|---|---|---|
| 💰 ชำระเงิน | open if payable | fstatus='5' OR fcredit='1' |
| 📝 อัปเดตสถานะ + ตู้ + Track | open ALWAYS | most-used workflow action |
| 🚚 มอบหมายคนขับ | open if fstatus='6' | ready-to-dispatch context |
| ✏️ แก้ไขที่อยู่/ขนส่ง/ราคา | closed | rare edit · open on demand |
| 🧾 ชื่อผู้รับใบกำกับ | closed | rare edit · open on demand |

Each card has icon + title + smart hint (e.g. "สถานะปัจจุบัน: 5" / "ใช้ชื่อผู้รับ default") + chevron-rotates-on-open. Added "⚡ Actions" section divider above the cards for visual hierarchy.

### Sitting-I after-hours — **ภูม MOMO review flag** (Q1+Q2)

ภูม flag 2026-06-02 ค่ำ (ที่ /admin/api-forwarder-momo/review):

**Q1 — PR99 candidate hunt:**
MOMO ส่ง userid "PR99" → ระบบขึ้น "ไม่มี PR99 ในระบบ" สีแดง (ตาม pattern 2026-05-30 ดึก ที่ PR9370→PR005 · PR1282→PR032 · PR1321→PR116)

Shipped 2 scripts (`147105e5`):
- **`scripts/investigate-pr99-candidate.mjs`** — READ-ONLY probe · list candidates · cross-ref tb_forwarder + MOMO raw
- **`scripts/rename-userid-to-pr99.mjs`** — ATOMIC rename 9 tables (tb_users + 8 FK refs) · idempotent · y/n confirm · collision check

**ภูม ต้องรันที่ prod ที่ทำงานพรุ่งนี้** (ผมไม่มี DB direct access):
```bash
pnpm tsx scripts/investigate-pr99-candidate.mjs       # หา candidate
# → แก้ const OLD_USERID ใน rename script
pnpm tsx scripts/rename-userid-to-pr99.mjs            # rename atomic
```

**Q2 — "ยังไม่ join cabinet (รอ container_closed sync)":**
อธิบายในเอกสาร `docs/research/momo-review-2-questions-2026-06-02.md`:
- คือ tracking ยังไม่ link real cabinet (cid · เช่น `GZS260525-2`)
- รอ MOMO ส่ง `container_closed` event มา + sync step 2.5 propagate
- **ใช้งานปกติได้** — admin commit ได้ · `fcabinetnumber` เป็น MOMO routing batch ก่อน · propagation overwrite อัตโนมัติทีหลัง
- แก้ได้ 3 ทาง: รอ cron 5 min / manual sync / date-range override

---

## ✅ ภูม brief priority matrix (poom-wave-2026-06-01.md) — FINAL

| # | Task | Eff | Pri | Status |
|---|---|---|---|---|
| **1** | Potemkin commission repoint | M | **P0** | ✅ shipped 2602a0da |
| **5a** | Commission-SOT ADR | S | **P0** | ✅ shipped (ADR-0026) |
| **2** | Batch payouts port | L | P1 | 🟡 MVP read-only · ⚠️ CREATE+PAY defer (ก๊อต co-sign) |
| **3** | PEAK module (5 sub-surfaces) | L | P1 | ✅ **5/5 DONE** |
| **4** | AR-aging cockpit | M | P1 | ✅ shipped 5b6cbc0a |
| **5b** | Auto-commission accrual | M | P1 | ⏸ defer (เดฟ wallet coord) |
| **6** | TH-transport grouping | M | P1 | 🟡 MVP read-only · ⚠️ CREATE defer |
| 🎖 | **CEO pricing directive** | L | **P0** | ✅ **Full loop shipped** (Monitor + Compare + Cron) |
| 🩹 | **ภูม UX P0** forwarder [fNo] collapsibles | S | **P0** | ✅ shipped 819c283d |

**Coverage:** 6 fully done · 2 MVP-shipped (write side deferred) · 1 needs-coord.

---

## 🗺 Pickup options พรุ่งนี้ (ที่ทำงาน) — เลือกตามแรงบันดาลใจ

### 🟢 A) D7 ใบขนสินค้า cargo customs-declaration (CEO 3-tax-doc trio close)
CEO brief mentions 3 modes: ใบกำกับ ✅ / **ใบขน** ⏸ NEXT / ไม่รับเอกสาร ✅
- Effort: **L (~6-8 h)** · port ใบขนสินค้า template + form + RD Form-86 backend
- Value: closes 3rd revenue-recognition path · ฝากนำเข้า full-customs cases

### 🟡 B) Per-customer margin baseline tracker (CRM activation)
Add section to `/admin/customers/[id]` แสดงประวัติ margin ของลูกค้าคนนี้ (avg / over-cap count / last 10 ตู้). ส่งสัญญาณให้ sales bid ต่ำกว่าได้กับลูกค้าประจำ.
- Effort: M (~3-4 h)
- Value: feeds CEO "ลูกค้าประจำควรได้ราคาดีกว่า" directive · activates Margin Monitor data into CRM

### 🟡 C) Save quote → tb_quotation row
ใน Sales Quote Comparison ปัจจุบัน — compute เป็น ephemeral (ไม่ save). ถ้า save → tb_quotation จะมี audit trail + ลูกค้าได้รับ link ใบเสนอราคา.
- Effort: M (~3-4 h)
- Value: closes the "quote → invoice" pipeline · enables follow-up

### 🟡 D) Per-customer cap policy (CEO advanced)
ใน CARGO_MENUBAR เพิ่ม config: ลูกค้า X = max margin ฿10k (override default ฿15k)
- Effort: M (~3-4 h)
- Value: CEO advanced cap policy · ลูกค้าระดับ SVIP

### 🔴 E) ก๊อต co-sign Tier B (write sides)
- B1 §2 batch payout CREATE side (sale + interpreter) — needs ก๊อต architectural review on tb_*_payout_h INSERT race-guard
- B2 §6 TH-transport batch CREATE — same pattern

### 🔴 F) เดฟ coord Tier C
- C1 §5b auto-accrual trigger — touches wallet → needs เดฟ wallet SOT alignment

### 🟢 G) D7 deep-audit only (no code · just plan)
ถ้าไม่อยากเขียน code วันแรก → ทำ deep-audit ของ legacy ใบขนสินค้า ตาม AGENTS.md §0b · enumerate all PHP modes + write spec → plan สำหรับ next sitting (effort: S ~2h)

---

## 🎯 Recommend: **A หรือ G** (D7 ใบขนสินค้า)

ถ้าพรุ่งนี้สดชื่น → A (ลุยเลย ~6-8h) · ถ้าง่วงๆ → G (audit + spec only)
ทั้งคู่ progress CEO 3-tax-doc trio · D7 เป็น last leg.

---

## ⚠️ Known issues (NOT introduced วันนี้ · pre-existing)

`pnpm typecheck` reports 5 errors in:
- `actions/admin/etax-export.ts:125`
- `actions/admin/forwarder-tran-th.ts:212`
- `actions/admin/wht-cert.ts:95`
- `actions/admin/withdraw-comm-batch.ts:178, 247`

ทั้ง 5 errors เป็น TS2352 "Conversion of type 'GenericStringError[]'" — caused by dynamic `.select(stringConcat)` losing the result type narrowing. **ไฟล์ใหม่ที่ผมเขียนใช้ `.maybeSingle<Record<...>>()` ให้ explicit types · ไม่ trigger pattern นี้.**

Recommend follow-up sitting: refactor 4 ไฟล์ pre-existing เพื่อ:
- Use static select strings (let PostgREST type inference work), OR
- Add `.returns<MyType>()` to each query

ไม่ block deploy (build still passes via Turbopack).

---

## 🔄 Resume commands (เช้าวันพรุ่งนี้ที่คอมที่ทำงาน)

```bash
cd C:/Users/Admin/pacred-web/pacred-web
git -C . fetch origin --prune
git -C . rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
head -60 CLAUDE.md                                                  # latest PM section
cat docs/research/poom-save-point-2026-06-02-sitting-I-v5-CLOSE.md  # this file
pnpm dev   # port 3000

# ที่ทำงาน browser-verify queue:
# 1. /admin/accounting/margin-monitor — กรอก date range · เห็น buckets + over-cap + per-rep
# 2. /admin/accounting/quote-compare — กรอกผม dimensions · เห็น 9-carrier table + best recommendation
# 3. /admin/forwarders/51986 — เห็น collapsible Actions (Status open default · Driver/Edit closed)
#    + click "📝 อัปเดตสถานะ" expand/collapse · same for "🚚 มอบหมายคนขับ" etc

# 🟦 MOMO Q1+Q2 follow-up (ภูม flag ค่ำ):
# 4. /admin/api-forwarder-momo/review — เห็น PR99 row + "ไม่มี PR99 ในระบบ" สีแดง
#    Q1: รัน 2 scripts ตามลำดับ — investigate ก่อน → rename
#    Q2: เข้าใจ "รอ container_closed sync" แล้ว · ใช้งานได้ปกติ · ถ้ารีบ manual sync
# 5. อ่าน docs/research/momo-review-2-questions-2026-06-02.md (full explanation + scripts usage)

# Pick from §"Pickup options" above (A-G) ตามอารมณ์ตอนเช้า
```

---

## 🟦 MOMO follow-up steps (ภูม Q1 ที่ทำงานพรุ่งนี้)

```bash
# Step 1 — Investigate PR99 candidate (READ-ONLY · ปลอดภัย รันบน prod)
pnpm tsx scripts/investigate-pr99-candidate.mjs

# ดูผล → เลือก candidate ที่ดูคุ้น (ปกติเป็น PR99xx ที่มี recent forwarder activity)

# Step 2 — แก้ rename script · ใส่ OLD_USERID
# เปิด scripts/rename-userid-to-pr99.mjs · แก้ const OLD_USERID = "PR99XX" → ตัวจริง

# Step 3 — รัน rename (atomic 9-table · y/n confirm · idempotent)
pnpm tsx scripts/rename-userid-to-pr99.mjs

# Step 4 — refresh review page · เห็น "พบใน tb_users" สีเขียว · กดสร้างใหม่ได้
```

**Q2 ไม่ต้องทำอะไร** — `⏳ ยังไม่ join cabinet` ใช้งานได้ปกติ · แค่ informational. ถ้ารีบ:
```bash
# Manual sync ที่ /admin/api-forwarder-momo/sync · กด "Sync MOMO ตอนนี้"
# หรือ date-range override:
curl 'http://localhost:3000/api/cron/momo-sync?start=2026-05-01&end=2026-06-02' \
  -H 'Authorization: Bearer $CRON_SECRET'
```

---

## 🎉 Closing remark

วันนี้ landed:
- **PEAK module §3 ปิด 5/5** (sitting-I v1-v3)
- **CEO pricing directive ปิดเต็ม loop** (sitting-I v4 — retrospective + forward-looking + cron review)
- **ภูม UX P0 ปิด** (sitting-I v5 — collapsible action panels)
- **MOMO Q1+Q2 ตอบ + 2 scripts ให้รัน** (v5-after — PR99 hunt + container_closed สาเหตุ)

21+ commits · 5 P0/P1 brief tasks done · 2 MVP-shipped · 1 needs-coord · 1 ภูม follow-up flag (PR99 rename).

**ภูม พักได้แล้ว · เช้าจะมีงาน clean สำหรับเริ่มต่อ — สงวนเวลาเปิดดูบราว์เซอร์ verify ก่อน · แล้วเลือก pickup option A-G ตามอารมณ์ตอนเช้า** ⚡

CEO directive ครบทั้งคู่:
- "pricing profit-cap ≤15k฿/ตู้" → 3 surfaces (Monitor + Compare + Cron · all wired)
- "sales quote-comparison tool" → /admin/accounting/quote-compare (live + sharable URL)

ภูม brief tasks ครบทั้ง P0 + 3/4 P1 (ที่เหลือต้อง coord ก๊อต+เดฟ).

ฝันดีครับ 🌙
