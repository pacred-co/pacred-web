# 🧾 ภูม save-point · 2026-06-12 — MOMO/forwarders fixes + printAll PCS scan→print + cart cleanup

> **Resume ที่บ้าน:** `git fetch origin && git checkout Poom-pacred && git pull origin Poom-pacred` (ต้องมี `.env.local` = **DEV** `lozntlidlqqzzcaathnm` ก่อน). **Branch Poom-pacred = `4dd29b66`** (3 commits session นี้ · `pnpm verify` EXIT 0 ทุก commit). **prod ไม่ถูกแตะเลย** — พี่เดฟตรวจงานแล้ว merge เข้า main/prod เอง.

## ✅ งานที่ทำ + push (Poom-pacred)

| commit | งาน |
|---|---|
| `8c513a3f` | (1) count "เลขพัสดุ" ตัดหัวบิล MOMO → #52003 = **8 ไม่ใช่ 9** · (2) +คอลัมน์ **CG_NO** + **ขนาด ก×ย×ส** ในตารางย่อย · ลบ text **"MO…"** · (3) ปุ่ม **ดูพัสดุ** มาคอลัมน์แรก (Container Closed) · (4) **printAll สแกน→พิมพ์ แบบ PCS** |
| `8f0c1e05` | หน้า **สรุป(ใช้งาน)** + **review grid** ปรับสวย (visual-only · money-isolation verified) |
| `4dd29b66` | ลบกล่อง **"ค่าขนส่งจีน → ไทย (ประมาณการ)"** ออกจาก /cart (พี่ป๊อปไม่เอา) |

## 🔍 รายละเอียด + ที่อยู่ไฟล์

- **count fix** (`forwarders-table.tsx`) — badge + breakdown header ใช้ `countableGroupMembers()` (helper เดียวกับที่ Σ กล่อง/น้ำหนักใช้ · `lib/admin/momo-bill-header.ts`) → ตัดแถวหัวบิล (bare zero-weight) · ตารางย่อยนับกล่องจริง 1..N · แถวหัวบิลติดป้าย "หัวบิล". **Display-count only · ไม่มี money write.**
- **CG_NO** (`forwarders/page.tsx`) — join จาก `momo_import_tracks.raw->>CG_NO` ด้วย `momo_tracking_no = ftrackingchn` (bounded/best-effort · null→"—"). **เช็คกับ DEV จริง: match 8/8** (เช่น `1780629608-1/8 → CG80645859566`).
- **ขนาด** — `tb_forwarder.fwidth/flength/fheight` (เพิ่มใน select + Row type ทั้ง page.tsx + forwarders-table.tsx).
- **printAll PCS** — `barcode/gateway/page.tsx` case `from` → `/admin/printAll?fNo=<id>&autoprint=1` (สแกนกล่อง→ป้ายพิมพ์เลย 1 สเต็ป) · NEW `printAll/print-all-picker.tsx` = ช่องสแกน/พิมพ์ + เลขตู้ ในหน้า printAll (ไม่ต้องเด้งไปรายงานตู้) · `<AutoPrintOnLoad>` ยิง `window.print()` ตอน `?autoprint=1`.
- **review/สรุป polish** — Tailwind/structure only · ผมไล่ diff ยืนยัน `commitOne/commitAll/setRowField/commit actions/state hooks` **ไม่ถูกแตะ**.
- **cart** — เอา `<ImportPriceEstimate />` ออก + ลบไฟล์ orphan `import-price-estimate.tsx` (การ์ด รถ/เรือ/ตีลัง ด้านบนยังอยู่).

## 👀 ต้องเทสที่บ้าน (login authed — §0c · headless ผมเทสไม่ได้)
1. **#52003** → "8 เลขพัสดุ" + กดคลี่ → CG_NO/ขนาด ขึ้น
2. **กล้องมือถือ + เครื่องสแกน** ยิงกล่อง → ป้ายพิมพ์เด้ง (auto-print ~0.5 วิ)
3. หน้า **สรุป** + **review** + **printAll** หน้าตาโอเคมั้ย
4. **/cart** → กล่องประมาณการสีน้ำเงินหายแล้ว

## 🔴 carryover (พี่เดฟ — prod)
- **prod = พี่เดฟ merge + จัดการเอง** (ผมไม่แตะ prod)
- MOMO rate backfill: **DEV ทำแล้ว** (48 rows) · code auto-price going-forward อยู่ใน commit เก่าแล้ว · prod `--apply` = `scripts/backfill-momo-forwarder-rates.mjs --apply` พี่เดฟกดเอง (dry-run ก่อน)
