---
name: print-verify
description: Verify a printable document ACTUALLY prints right — before anyone burns paper. Fires on "พิมพ์ไม่ออก" · "ตกกระดาษ" · "หน้าขาวเบิ้ล" · "ชื่อไฟล์ผิด" · "ต้อง save PDF ไปปริ้นข้างนอก" · "print looks wrong", and BEFORE shipping any change to a page with window.print()/PrintButton. Print lives in @media print — a world that build, tsc, lint and normal render NEVER touch, so every other gate reports green while the paper is broken.
---

# Print verify — กระดาษคือหลักฐาน ไม่ใช่ build

> **Why (owner · 2026-07-23/24).** Staff had been "saving PDF and printing outside" for
> months because printed pages came out with the app's menus on them. It was reported
> fixed — then the owner printed a real PDF and sent it back: menus still on the paper,
> a blank page after every real page, the form cut in half, and the filename still
> `Claude.pdf`. **Every one of those shipped with tsc 0 · lint 0 · build 0.**
> Print is invisible to every normal gate. This skill is the gate.

## RULE 0 — the only real proof is the PDF

`build ผ่าน` / `grep เจอ class` / `หน้าจอสวย` prove **nothing** about paper.

| gate | proves | does NOT prove |
|---|---|---|
| tsc · lint · build | it compiles | anything below |
| screenshot | the screen | the paper |
| `grep .no-print` | the class exists | that a rule hides it |
| `<title>` in the file | a tag exists | **which tag the browser uses** |

If you cannot show a real PDF, the honest status is
*"shipped + gated · ยังไม่ได้พิมพ์จริง"* — **not "พิมพ์ได้แล้ว"**.

## The 6 checks (run on the live page, before claiming anything)

Paste into the browser tool on the actual document URL:

```js
(() => {
  const mm = px => px / (96/25.4);
  // 1) กฎ print โหลดจริงไหม
  let printRules = 0, hidesNoPrint = false;
  for (const sh of [...document.styleSheets]) { let r; try { r = sh.cssRules } catch { continue }
    for (const x of r) if (x.type === CSSRule.MEDIA_RULE && String(x.conditionText).includes('print')) {
      printRules++; for (const i of x.cssRules) if ((i.selectorText||'').includes('.no-print')) hidesNoPrint = true; } }
  // 2) ของลอยที่จะติดกระดาษ
  const floating = [...document.querySelectorAll('*')].filter(e => {
    const s = getComputedStyle(e);
    if (!['fixed','sticky'].includes(s.position)) return false;
    if (e.offsetWidth < 30 || e.offsetHeight < 20) return false;
    const c = (e.className||'').toString();
    return !c.includes('print:hidden') && !c.includes('no-print');
  }).map(e => (e.className||'').toString().slice(0,45) || e.id);
  // 3) หน้ากระดาษ (ปรับ selector ตามเอกสาร)
  const unit = document.querySelector('.receipt-page, .print-area, .wht-form');
  return JSON.stringify({ printRules, hidesNoPrint, ของลอยที่จะติดกระดาษ: floating,
    ความสูงหน่วยเอกสาร_mm: unit ? +mm(unit.getBoundingClientRect().height).toFixed(1) : null,
    title: document.title }, null, 1);
})()
```

- [ ] **1. กฎโหลดจริง** — `printRules > 0` และ `hidesNoPrint === true`
- [ ] **2. ของลอย = []** — ต้องเช็ค **ทั้งจอกว้างและจอแคบ** (คนละ element กัน · ดู L-4)
- [ ] **3. ชื่อไฟล์** — `curl -s <url> | grep -oE '<title[^>]*>[^<]*</title>' | head -1`
      **ตัวแรกเท่านั้นที่นับ** (ดู L-1)
- [ ] **4. มี `@page`** — ของหน้าเอง หรือค่าตั้งต้นกลาง
- [ ] **5. จำนวนหน้า** — ความสูง ÷ (297 − margin บน+ล่าง) ต้องตรงกับที่ควรเป็น
- [ ] **6. เอกสารมีเงื่อนไข** — บล็อกถูกฝั่ง + มีทางออก + อธิบายบนจอ (ดู L-6)

## 5 กับดักที่เจอจริง (แต่ละอันเคยผ่าน build)

**L-1 · `<title>` ใน body ไม่ชนะ metadata** — Next แปะ title จาก layout ให้ทุกหน้าอยู่แล้ว
ตัวที่เขียนใน body เป็นตัวที่ 2 และเบราว์เซอร์ใช้ตัวแรก → PDF ได้ชื่อ generic **เงียบสนิท**
```
❌ <title>{docNo}</title>
✅ export const metadata = { title: { absolute: "…" } }
✅ generateMetadata(...) → { title: { absolute: docNo } }     // absolute = ไม่ต่อ "| Pacred"
```

**L-2 · `min-h-screen` = หน้าขาวเบิ้ล** — 100vh ตอนพิมพ์ = เต็มหน้ากระดาษ → padding ที่เกิน
แค่ 1px ล้นไปสร้างหน้าเปล่า → 2 แผ่นออกมา 4 แผ่น
```css
@media print { .min-h-screen, .h-screen { min-height: 0 !important; height: auto !important; } }
```
⚠️ อย่าเหมา `min-height` ที่ตั้งเป็น **mm** — พวกนั้นตั้งใจให้เต็มหน้า
ตระกูลเดียวกัน: `break-after` บน element ตัวสุดท้าย (ต้องมี `:last-child { break-after: auto }`)

**L-3 · ไม่มี `@page` = กระดาษตามใจเครื่อง** (บางเครื่อง Letter → ตกขอบ)
ตั้งค่าตั้งต้นกลาง `@page { size: A4 portrait }` · หน้าที่มีขนาดเฉพาะประกาศเองใน `<style>`
ของหน้า ซึ่งอยู่ท้ายเอกสาร = มาทีหลัง = ชนะ

**L-4 · อย่าไล่แก้ทีละตัว** — แก้แถบขวา desktop แล้วบอกจบ แต่ owner พิมพ์จากจอแคบ →
โดนแถบล่างมือถือ (คนละ element) → **ยิง JS ไล่ทุก element ที่ลอย ทั้ง 2 ความกว้าง**
และ class ที่พึ่ง "กฎที่อยู่ที่อื่น" = สัญญาที่ไม่มีใครตรวจ → **ประกาศกฎกลางเสมอ**

**L-5 · เอกสารถูกตัดคาหน้า**
```css
@media print { .doc-unit { break-inside: avoid; page-break-inside: avoid; } }
```
อยากให้ลง 1 แผ่น → **วัดก่อน อย่าเดา** (`mm(el.getBoundingClientRect().height)`) ·
บีบได้แค่ **line-height + padding** — ห้ามลดขนาดฟอนต์ (เอกสารต้องอ่านออก/เซ็นได้)

**L-6 · gate ต้องอยู่ถูกฝั่งของเหตุการณ์เงิน** — guard ตัวเดียวถูกเรียกทั้ง *ก่อนจ่าย* (ป้องกันได้จริง)
และ *หลังเงินเข้าแล้ว* (กันอะไรไม่ได้ มีแต่งานค้าง) · แยก **ช่องที่คิดเงิน** ออกจาก **ช่องที่แค่พิมพ์
บนเอกสาร** · gate ที่ทำให้ลูกค้าตัน → **แก้ด้วยการให้เครื่องมือ ไม่ใช่ปลด gate**

## Scope

**ทำ:** `@media print` · `@page` · `.no-print` · break/pagination · document title/filename ·
เงื่อนไขก่อนพิมพ์ · ไล่ตรวจทุกหน้าที่มี `window.print()`/`PrintButton`
**ไม่ทำ (บอก owner ตรงๆ):** เครื่องพิมพ์ไม่โผล่ในหน้าต่างพิมพ์ · ไดรเวอร์ · เครือข่าย ·
Chrome จำปลายทางล่าสุดเป็น "Save as PDF" — พวกนี้อยู่ฝั่งเครื่องผู้ใช้ **ไม่ใช่บั๊กโค้ด**

## เกี่ยวข้อง
`docs/learnings/print-pipeline.md` (ฉบับเต็ม) · `session-continuity` (RULE 1 · proof) ·
`mobile-first-verify` (จอแคบ = คนละ element) · AGENTS.md §0c
