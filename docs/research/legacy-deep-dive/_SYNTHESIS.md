# Legacy PCS Cargo deep-dive — SYNTHESIS · 2026-05-28 ดึก

> **Trigger:** ภูม flag *"ไม่เป็นโลจิก ไม่เป็นอัตโนมัติ ... รายการนำเข้ามาจากไหน ตู้ใครคีย์ แม่งมั่วไปหมด ... แกทำมาผิด หรือระบบเดิมแม่งมั่วมาแต่แรก"*
> **Method:** 4 parallel read-only audit agents · legacy source at `D:\REALSHITDATAPCS\pcsc\public_html\member\`
> **Period:** 2026-05-28 afternoon → ดึก · ~3 hours wallclock

## §0 The 1-sentence answer for ภูม

**ระบบเดิม "เป็นโลจิก" + "ดูเหมือนอัตโนมัติ" จริง — แต่ทำได้เพราะมี 5 auto-flips + review-grid UX + per-role queue filtering ที่ Pacred ยังขาด · ไม่ใช่เราทำผิด · แค่ port ยังไม่ครบ.**

## §1 ภูม's 5 ถาม · ตอบจาก 4 agents

| ภูม ถาม | คำตอบ |
|---|---|
| **"รายการนำเข้ามาจากไหน?"** | 11 paths INSERT tb_forwarder · 10 ใน 11 = manual per-row · 1 = JMF webhook (partner หยุดใช้แล้ว). Source: Agent 1 §2 |
| **"ตู้ใครคีย์?"** | MOMO/CN/Sheets sync stage data ใน `tb_tmp_*` → admin คลิก "สร้างใหม่" บน review form → commit ลง tb_forwarder พร้อมเลขตู้ที่ prefill จาก stage. **Admin คีย์ (ผ่าน prefill) · ไม่ใช่ MOMO**. Source: Agent 2 §3 |
| **"คีย์ตู้แล้วสถานะเปลี่ยนเอง?"** | ✅ **TRUE** · handler update 4 fields ใน **ONE atomic UPDATE** (fStatus + fCabinetNumber + fDateToThai + fDateContainerClose). UX feels auto. Source: Agent 2 §7 |
| **"เราทำผิด?"** | **บางส่วน** · 5 gaps specific (ดู §3) — review-grid UX · per-role menu · status-transition gates · QA queues · noti unification |
| **"ระบบเดิมมั่ว?"** | **บางส่วน** · notification fabric ใน legacy = wildly inconsistent (cnt-payment fully wired · admin-dropdown half · bulk-bill commented out). status-dropdown มี 3 variants quirk (status 2/3/4 ไม่ stamp date · 1/5/6/7 stamp). Source: Agent 3 §7 |

## §2 The 5 critical AUTO transitions ที่ทำให้ legacy "feel automatic"

(Agent 3 §6 · these are what's missing in Pacred to make ภูม รู้สึกว่ามัน "อัตโนมัติ")

| # | Auto transition | Trigger | Pacred status |
|---|---|---|---|
| 1 | **Sheets/Partner-API sync → fStatus 2/3** | cron read upstream → INSERT or UPDATE stage → admin commit | ⚠️ **ภูม no cron**; manual entry only (Wave 17 ports the form, not the cron) |
| 2 | **Barcode parity → fStatus 4** | scan-driven · `if (fi2Amount >= fAmount) UPDATE fstatus='4'` | ⚠️ **Pacred ported barcode pages but parity-flip needs verify** (Wave 17 #83 said "wired AJAX" — but does it match this exact condition?) |
| 3 | **Wallet pay → fStatus 6** | when paid (wallet/PromptPay/bank), system flips fstatus 5→6 | ⚠️ **Pacred has wallet but no fstatus-flip cron observing payments** |
| 4 | **Driver photo upload → fStatus 7** | driver mobile uploads delivery proof → fstatus 6.1→7 | ⚠️ **Pacred has driver mobile but defer per AGENT 4 §5** |
| 5 | **Cnt-payment approval → cnt rows update** | manager approves cnt → cntStatus 1→2 + fStatus side-effect | ⚠️ **Pacred has the form but the approval gate per `cnt-hs.php:185`** ? need verify |

## §3 The 12 Pacred gaps · prioritized (synthesis of all 4 agent §8/§9 sections)

### 🔴 P0 — blocks "feels automatic" launch readiness

| # | Gap | Source | Effort | Why this matters |
|---|---|---|---|---|
| **G1** | Pacred ขาด **review-grid commit UX** สำหรับ MOMO/CN/Sheets — admin ต้องเห็น staged rows + 1-click "สร้างใหม่/อัปเดต" per row | Agent 1 §2 · Agent 2 §3 | ~3-4 ชม per source × 3 = ~10 ชม | ภูม's "ไม่เป็นโลจิก" main symptom |
| **G2** | Atomic-update guarantee — เมื่อ admin commit, ต้องเปลี่ยน fstatus + fcabinetnumber + fdatetothai + fdatecontainerclose ใน **1 UPDATE** ไม่ใช่ 4 calls | Agent 2 §7 | ~2 ชม audit + fix per handler | "เปลี่ยนตู้แล้วสถานะเปลี่ยนเอง" หาย ถ้าแยก 4 calls |
| **G3** | Barcode parity-flip (fi2Amount ≥ fAmount → fstatus=4) ที่ scan driver — verify Pacred wires the exact condition | Agent 3 §6 #3 | ~1 ชม verify + 1 ชม fix ถ้าผิด | Warehouse staff workflow ติดอยู่ ถ้า flip ไม่อัตโนมัติ |
| **G4** | Per-role menu filtering (`getRoleMenu(deptKey, sectionKey)`) — Pacred แสดง full sidebar ทุก role | Agent 4 §6 | ~3-4 ชม (lib/admin/sidebar-menu.ts mod + per-role filter table) | "Sidebar รก" ของ ภูม + staff งงเมนูเยอะ |
| **G5** | Status-transition gates (`requireDepartmentKey([...])`) — ใครก็คลิกเปลี่ยน status ได้ใน Pacred · legacy hard-code owner | Agent 4 §6 | ~2 ชม (require-admin wrap + per-action role list) | Audit/control gap · Warehouse ไม่ควรกด "บันทึกชำระเงิน" ของ Accounting |
| **G6** | Action queue filtering (default `?q=N` per-role on landing) — Pacred แสดง raw list · legacy filter pre-applied | Agent 4 §6 | ~2 ชม (per-page useEffect/searchParams) | "เปิดมาแล้วงงข้อมูลเต็มไปหมด" |

### 🟠 P1 — should fix but not launch blocker

| # | Gap | Source | Effort |
|---|---|---|---|
| **G7** | Notification unification — funnel ALL fstatus transitions ผ่าน 1 helper ที่ respect `NOTIFY_BYPASS` | Agent 3 §7 | ~3 ชม |
| **G8** | tb_log_forwarder_status writes — ทุก UPDATE fstatus ต้อง append log row (Pacred Wave 24 มี audit log แต่ไม่ครบ) | Agent 3 §9 | ~2 ชม audit + patch missing call-sites |
| **G9** | Wallet → fstatus 6 auto-flip — observer cron/trigger | Agent 3 §6 #4 | ~2 ชม (cron-poll OR trigger-based) |
| **G10** | Status dropdown 3-variant quirk (status 2/3/4 don't stamp fDateStatusN) — Pacred should fix legacy bug instead of mimic | Agent 3 §4 quirk note | ~1 ชม (1 ifelse cleanup) |

### 🟡 P2 — defer ถ้าจ้าง QA day-1

| # | Gap | Source | Effort |
|---|---|---|---|
| **G11** | **QAAndQC 11 overdue queues** — delayedPayment / orderCancellation / ownerlessProducts / etc. — Pacred ไม่มีเลย | Agent 4 §4 | ~8-10 ชม (port 11 queues) · defer ถ้า no-QA |
| **G12** | Driver mobile UI — keep on legacy day-1 | Agent 4 §5 | defer Phase C |

## §4 Pacred Phase 1 launch — minimum-viable role set (Agent 4 §5)

| Role | Pacred role enum | Phase 1? | Has screens? | Gaps |
|---|---|---|---|---|
| CEO | super | ✅ | ✅ | Sidebar over-permissive |
| Manager | super (?) or new manager enum | ✅ | ✅ | Same |
| Sales | sales | ✅ | partial | Sales-call follow-up missing |
| CSPurchasing (ล่ามจีน) | interpreter | ✅ | partial | cart review · cnt-payment initiate |
| Accounting | accounting | ✅ | ✅ | bulk-bill + cnt approval |
| QAAndQC | qa | 🟡 ถ้าจ้าง | ❌ 11 queues missing | G11 above |
| Warehouse | warehouse | ✅ | partial | barcode parity verify (G3) |
| Driver | driver | ❌ defer | mobile not built | G12 above |
| HR | ops (?) | 🟡 | partial | admin-table + admin-profile |
| ITDT | super | ✅ | ✅ | n/a |

→ **Phase 1 MUST-WORK roles: CEO + Manager + Sales + CSPurchasing + Accounting + Warehouse** (6 roles)
→ **Defer: QAAndQC (ถ้าไม่จ้าง) · Driver · all Freight**

## §5 Concrete next-session action order (Agent 3 §9 + synthesis priorities)

### Step A — Phase 1 launch-blockers (priority ranking after this audit)

1. ~~B-1 NOTIFY_BYPASS~~ ✅ **DONE** (พี่เดฟ commit `0ac8b34`)
2. **B-2** S3 rotate (5 นาที · ภูม manual)
3. **B-3** 13 admins recreate — **but only AFTER confirming role-mapping rule** (use `companyType+department+section` from tb-admin-13-row-reference.md, NOT adminType)
4. **NEW B-6** G1+G2 (review-grid UX + atomic-update) — biggest "feels auto" win — **~12-14 ชม** with 2-3 parallel agents
5. **NEW B-7** G3+G4+G5+G6 (barcode parity · per-role menu · transition gates · queue filters) — **~10 ชม**
6. **B-4** Click-through audit (~5-7 ชม) — wait until B-6+B-7 land
7. ~~B-5~~ Schema drift = **batch 2a done · batch 2b (tb_forwarder family) defer page-by-page per พี่เดฟ**

### Step B — P1/P2 batch (after launch)

- G7 notification unification
- G8 audit-log gap fill
- G9 wallet → fstatus 6 observer
- G10 status-dropdown stamp-date cleanup
- G11 QAAndQC 11 queues (if QA hired)

## §6 Decision asks for ภูม / พี่ป๊อป

| # | Question | Why we need it |
|---|---|---|
| **D1** | Launch strategy: **soft (beta cohort 50-100)** หรือ **hard (all 8,898)**? | Beta = catch missing auto-flips early · hard = max revenue but risk SMS spam หาก G7 ยังไม่ funnel |
| **D2** | Launch date — มี hard date ไหม? | จะตัด G3-G10 vs land all ก่อน |
| **D3** | QA staff day-1? | บอก G11 priority (block launch หรือ defer) |
| **D4** | Driver mobile UI — keep on legacy หรือ build now? | บอก G12 priority |
| **D5** | "Sidebar รก" — รับว่า per-role filter ก่อนเปิด? | บอก G4 priority |
| **D6** | Manager role enum — แยกออกจาก super หรือไม่? | ภูม จะ provision รายชื่อ Manager แยก หรือ super หมด |

## §7 References — 4 agent reports

| Agent | File | Coverage |
|---|---|---|
| 1 | `01-tb-forwarder-intake-paths.md` | 11 INSERT paths · MOMO/CN/Sheets upstream URLs · automatic vs manual |
| 2 | `02-cabinet-lifecycle.md` | 12 fcabinetnumber writers · auto-flip illusion · MOMO stage flow · barcode auto |
| 3 | `03-fstatus-state-machine.md` | 8 status values · 31 UPDATE sites · 5 auto-flips · notification mess · 12 Pacred gaps |
| 4 | `04-staff-workflow-by-role.md` | 7 Cargo roles · cnt-payment workflow · cargo flow per status · launch MVP roles · 11 QA queues |

## §8 Honest assessment

**ภูม ไม่ได้ทำผิดเรื่อง logic** · Pacred port code ทำได้ดี (Wave 1-25 ครอบคลุม 80%+ ของ feature surface).

**Gap หลัก = UX patterns + auto-flips** ที่ทำให้ "รู้สึกอัตโนมัติ":
1. ไม่มี review-grid UX (staff ต้องคีย์เอง ที่จริงควรแค่ click commit)
2. ไม่มี 5 auto-flips (cron sync · barcode parity · wallet pay · driver upload · cnt approval)
3. ไม่มี per-role filtering (UX = "งง")

**Legacy "มั่ว" จริงในบางจุด:**
- noti fabric inconsistent (Pacred ทำดีกว่าได้ ผ่าน 1 helper)
- status-dropdown 3 variants (เก่า bug fix ได้)
- adminType ไม่ใช่ role (Pacred enum design ดีกว่าอยู่แล้ว · แค่ recreate 13 admins ต้อง map ถูก)

**Recommendation:** สร้าง B-6 + B-7 (12-14 ชม รวม) ก่อน B-4 click-through. Soft-launch beta cohort 50-100 first (D1).

---

**End synthesis · 2026-05-28 ดึก · ready for ภูม + พี่เดฟ review**
