# MOMO aggregate-on-one-row error · reconcile-stamp gate gotcha · cross-project Supabase import (2026-07-09)

Three durable learnings from the 2026-07-09 owner-driven session (เดฟ).

## 1. MOMO "aggregate on one customer row" = ราคาบานเป็นหลักหมื่น (audit signal)

**Symptom (customer complained · PR146 #52403):** a single customer's forwarder row showed
`3525 kg / 24.6472 CBM / dims 0×0×0 → ฿91,194.64` when the real parcel was `30 boxes ×
30×25×183cm × 14kg = 4.1175 CBM / 420 kg → ~฿15,234`. MOMO had attributed the WHOLE
container's (or a sack's) weight+CBM onto one customer's tracking row.

**Root:** MOMO's early API data (before the container closes + before the packing list)
puts an aggregate weight/CBM on a row. `fvolume`/`fweight` are stored as **TEXT**, and the
customer page displays `fweight` directly + `famountcount==='1' ? fvolume : fvolume*famount`.
Dims columns are `fwidth/flength/fheight` (NOT `flong/fhigh` — that mistake made a `.eq` miss).

**The audit query that finds these** (unbilled `fstatus<5` · `famountcount='1'`):
```sql
SELECT id,userid,ftrackingchn,fcabinetnumber,famount,fweight,fvolume,ftotalprice
FROM tb_forwarder WHERE famountcount='1' AND fstatus<'5' AND fvolume>9 ORDER BY fvolume DESC;
```
`fvolume > 9 CBM` on ONE customer row is almost always a container-aggregate error; a
density `fweight/fvolume > 400 kg/CBM` on general cargo confirms it.

**Fix rules:**
- **CBM-basis rows** (`KGPerCBM < ค่าเทียบ 250`): correct `fvolume` from the real dims
  (a geometric fact) → `ftotalprice = fvolume × frefrate` (proportional · same rate). Weight
  is secondary (doesn't drive the price). Safe to correct from the customer's stated dims when
  unbilled (`fstatus<5`).
- **Multi-row / basis-flip (dense) cases** (e.g. PR067 · packing base = 5 boxes but system split
  into `-2`/`-4` = 13 boxes across 2 rows): **DO NOT auto-guess the split** — the packing list
  only has the base aggregate. Flag for the warehouse to verify via the packing-upload tool.
  The reconcile-before-bill gate (mig 0245) blocks billing until reconciled → safe.
- **Display:** dims `0×0×0` → show `—` (not the confusing "0 × 0 × 0 ซม.") — the CBM row still shows.

## 2. Reconcile-stamp gate gotcha — a SCRIPT backfill skips the stamp → blocks billing

The reconcile-before-bill gate (mig 0245 · `container_packing_reconcile`) refuses a NEW ใบวางบิล
for a container that has no reconcile stamp. The stamp is written ONLY by `applyMomoPacking`
(the packing-upload tool). **If you backfill packing data via a `scripts/*.mjs` (not the tool),
the container is corrected-but-NOT-stamped → the gate blocks staff from collecting money.**

→ After a script backfill of packing data, **also stamp every touched container**:
```js
await s.from("container_packing_reconcile").upsert(
  containers.map(c => ({ container_no: c, reconciled_by: "backfill-XXXX", tracking_count: n })),
  { onConflict: "container_no" });
```
The `container_packing_reconcile` columns are `container_no(PK)/reconciled_at/reconciled_by(varchar20)/
rows_updated/boxes_short/advanced/tracking_count` — NOT `shipment_count` (a wrong guess wasted a query).

## 3. Cross-project Supabase import (DOC BOT → MAIN DB) — the working pattern

To copy a whole external Supabase project's tables into the main DB (owner: "ย้าย DB DOC BOT
เข้า DB หลัก"):
- **Connect via the session pooler** `aws-1-ap-southeast-1.pooler.supabase.com:5432` with user
  `postgres.<REF>` (the direct `db.<ref>.supabase.co` is IPv6-only → times out; aws-0 migrated to
  aws-1). A password with `@`/`.` → `encodeURIComponent`.
- **A `.mjs` that `import pg` MUST live inside the repo** (node resolves `node_modules` from the
  file's dir — a `/tmp` script → `ERR_MODULE_NOT_FOUND`).
- **Read source (pg) → INSERT into each dest (prod + dev) with `ON CONFLICT (pk) DO NOTHING`** =
  idempotent + lossless. Preserve the source `id`/PK. `jsonb` columns → `JSON.stringify` the param.
- **Land into `<source>_*` tables, NOT the clean canonical table.** The DOC BOT `hs_codes` (749 ·
  20 empty codes · 138 dup groups) is a messy product→code bot-lookup; merging it blind into the
  clean `hs_codes` (133) would pollute it. Land into `doc_bot_hs_codes` faithfully → reconcile the
  good entries later as a "develop further" step.

## 4. ค่าส่งไทย default REVERSED — ต้นทาง (prepaid Flash+margin), COD manual-only

Owner 2026-07-09 reversed the 2026-07-08 COD-default (`ad31a708`): `derivePayMethodForDelivery`
now returns `"1"` (ต้นทาง / prepaid) for ALL carriers+zones. The auto-fill charges the REAL Flash
cost (`calPriceFlash` by zip zone + weight/size · `lib/tools/flash-price.ts`) + a `TH_SHIPPING_PROFIT_MARGIN`
(15% · in the owner's 5-20 range · admin-editable). COD `"2"` is now a MANUAL admin choice only
(when the customer asks for เอกชน ปลายทาง COD). Own-fleet เหมาๆ keeps its flat ฿100 + ต้นทาง.
Billed `fstatus 5/6/7` frozen · unresolvable zone → ฿50 floor.

## 5. In-house ZH→TH translate = free gtx + cache (no paid key)

`lib/translate/zh-to-th.ts`: Google gtx free endpoint (`translate.googleapis.com/translate_a/single?
client=gtx&sl=auto&tl=th&dt=t`) primary + MyMemory fallback + `containsCJK` guard + a
`translation_cache` table (mig 0246 · sha256 key · on-demand button-click). No paid API key.
Reusable `<TranslateButton text={zh} />` — extends platform-wide (owner wanted OCR-style in-house).

## 6. Flash = นัดรับที่โกดัง (pickup), integrated via the Flash back-office WEB Import file

Owner: Flash comes to PICK UP at our warehouse (not us delivering). We can only reach the Flash
back-office web (no public API) → the integration = a CSV export of the "ข้อมูลผู้รับ" in the
Flash Import format (`actions/admin/export/flash-pickup.ts` · on the Express tab) that staff upload
into the Flash นัดรับ form. COD amount = `computeForwarderCollectTotal` for `paymethod='2'` ONLY.
