/**
 * scripts/backfill-ap-history-2026-07-01.mjs
 *
 * Import the ACC AP (เบิกเงิน) spreadsheet HISTORY into the first-class
 * ap_disbursement / ap_central_fund ledger (mig 0239). Spec:
 * docs/research/accounting-ap-2026-07-01/spec.md §5 Slice 1 step 4.
 *
 * ── WHAT THIS IS ──────────────────────────────────────────────────────
 * A REGISTER of PAST out-of-band disbursements — the read-only value win
 * (the sheet history becomes queryable). It writes ONLY the NEW ledger
 * tables. It NEVER touches any existing money table (tb_wallet* / tb_payment
 * / tb_cnt_pay* / tb_forwarder_invoice / tb_shop_pay* / tb_credit). No live
 * money moves — these rows describe transfers that already happened months ago.
 *
 * ── SOURCES (2 xlsx · owner-dropped) ──────────────────────────────────
 *   1. ACC - PACRED&PCS เบิกเงิน.xlsx      → ap_disbursement  (12 lane sheets)
 *   2. ข้อมูลการเบิก-จ่ายกองกลาง.xlsx        → ap_central_fund  (4 monthly sheets)
 * Parsed via a bundled Python (openpyxl) helper written to a temp file, since
 * the sheets carry Thai + heterogeneous per-lane column layouts.
 *
 * ── IDEMPOTENCY ───────────────────────────────────────────────────────
 * Each source row gets a deterministic key `[APX:<sheet>#<rowidx>]` stamped
 * into note (ap_disbursement) / note (ap_central_fund). A re-run SELECTs the
 * already-imported keys first and skips them — safe to run repeatedly. The
 * marker is invisible in the UI's main labels (lives at the end of note).
 *
 * ── SAFETY (AGENTS §11) ───────────────────────────────────────────────
 * DRY-RUN by default — prints the per-lane/entity WOULD-INSERT counts + a few
 * sample rows; writes NOTHING. `--apply` performs the inserts. Reads
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/backfill-ap-history-2026-07-01.mjs           # dry-run
 *   node --env-file=.env.local scripts/backfill-ap-history-2026-07-01.mjs --apply   # insert
 *   (optional) --limit=50   cap rows per sheet (smoke test)
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 0; // 0 = no cap

const DISB_XLSX = "C:/Users/Admin/Desktop/ข้อมูล data ต้นทุน บัญชี/ACC - PACRED&PCS เบิกเงิน.xlsx";
const CF_XLSX = "C:/Users/Admin/Desktop/ข้อมูล data ต้นทุน บัญชี/ข้อมูลการเบิก-จ่ายกองกลาง.xlsx";

const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// ════════════════════════════════════════════════════════════
// The Python parser (openpyxl). Emits a JSON file. Per-lane column maps —
// the sheets are NOT uniform (SEA/AIR/TRUCK share one shape; 6699/โชห่วย/
// ตั๋วชน/Export/คืนภาษี/ทั่วไป/Cargo/ปิดตรวจ/NNB each shift). 1-based cols.
// ════════════════════════════════════════════════════════════
const PY = String.raw`
# -*- coding: utf-8 -*-
import openpyxl, json, sys, datetime

DISB = sys.argv[1]
CF   = sys.argv[2]
OUT  = sys.argv[3]

def cell(ws, r, c):
    if not c: return None
    v = ws.cell(r, c).value
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v

def num(v):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return float(v)
    s = str(v).replace(",", "").replace("฿", "").strip()
    # pull the leading number out of things like "500 หัก 3%" / "150*4.58"
    import re
    m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)", s)
    return float(m.group(1)) if m else 0.0

def dstr(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None

def to_iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return datetime.datetime(v.year, v.month, v.day).isoformat()
    return None

# status → transfer_status enum
def map_status(s):
    if not s: return "requested"
    s = str(s).strip()
    if s in ("โอนแล้ว", "รับโอนแล้ว"): return "transferred"
    if s in ("ลค.ชำระเอง", "ลูกค้าจ่ายเอง", "ลูกค้าจ่ายเอง "): return "customer_paid"
    return "requested"   # ยังไม่ได้โอน / ไม่มีโอน / รอคอนเฟิร์ม / รอจ่าย เครดิต / ต้องการเบิก

# หมวดหมู่ → category enum
def map_category(s, is_refund_col=False):
    s = (s or "").strip()
    if is_refund_col: return "refund_correction"
    if "ทดรอง" in s: return "advance_passthrough"
    if "คืน" in s: return "refund_correction"
    return "service_cost"

# receipt-chase → receipt_status enum
def map_receipt(s):
    s = (s or "").strip()
    if "ได้รับใบเสร็จ" in s: return "received"
    if "ชื่อลูกค้า" in s: return "customer_named"
    if not s: return "pending"
    return "pending"

# vendor WHT: pull "58,000 หัก 1%" / "1500 หัก 3%" from a REMARK/note cell.
def parse_wht(remark):
    import re
    if not remark: return (None, None)
    s = str(remark)
    m = re.search(r"หัก\s*([0-9]+(?:\.[0-9]+)?)\s*%", s)
    pct = float(m.group(1)) if m else None
    g = re.match(r"^\s*([0-9][0-9,\.]*)\s*หัก", s)
    gross = float(g.group(1).replace(",", "")) if g else None
    return (gross, pct)

# ── per-lane column map: (lane_key, sheet_name, data_start_row, cols) ──
# cols indices are 1-based; None = column not present in that sheet.
LANES = [
  # SEA/AIR/TRUCK share: date2 name3 ship4 qo5 cat6 item7 note8 W9 R10 remark11 payee(L12 M13 N14) status15 tdate16 rstatus18 wht19
  ("sea","เบิกเงินทำงานSEA",2,
     dict(date=2,line=3,ship=4,qo=5,cat=6,item=7,note=8,w=9,r=10,remark=11,pn=12,pa=13,pb=14,st=15,td=16,rst=18,wht=19)),
  ("air","เบิกเงินทำงานAIR",3,
     dict(date=2,line=3,ship=4,qo=5,cat=6,item=7,note=8,w=9,r=10,remark=11,pn=12,pa=13,pb=14,st=15,td=16,rst=18,wht=19)),
  ("truck","เบิกเงินทำงานTRUCK",3,
     dict(date=2,line=3,ship=4,qo=5,cat=6,item=7,note=8,w=9,r=10,remark=11,pn=12,pa=13,pb=14,st=15,td=16,rst=18,wht=19)),
  # 6699: date2 line3 ship4 dochao5(→qo/invoice) cat6 item7 note8 W9 R10 remark11 payee(12-14) status15 td16 rst18 wht19
  ("tr_6699","PACRED เบิก6699 เบิกเงินทำงานTR",4,
     dict(date=2,line=3,ship=4,qo=5,cat=6,item=7,note=8,w=9,r=10,remark=11,pn=12,pa=13,pb=14,st=15,td=16,rst=18,wht=19)),
  # โชห่วย: date2 ship3 container4 cat5 item6 note7 W8 R9 remark10 payee(11-13) status14 td15 rst17 wht18
  ("sea_choho","PACRED เบิกเงินทำงาน SEA โชห่วย",2,
     dict(date=2,ship=3,container=4,cat=5,item=6,note=7,w=8,r=9,remark=10,pn=11,pa=12,pb=13,st=14,td=15,rst=17,wht=18)),
  # ตั๋วชน: date2 line3 ship4 receipt5 cat6 item7 note8 W9 R11 remark12 payee(13-15) status16 td17 rst19 wht20
  ("tua_chon","ตั๋วชน ลงข้อมูล",3,
     dict(date=2,line=3,ship=4,receipt=5,cat=6,item=7,note=8,w=9,r=11,remark=12,pn=13,pa=14,pb=15,st=16,td=17,rst=19,wht=20)),
  # Export: date2 line3 qo4 invoice5 receipt6 cat7 item8 note9 W10 R11 remark12 payee(13-15) status16 td17 rst19 wht20
  ("export","Export ลงข้อมูล",3,
     dict(date=2,line=3,qo=4,invoice=5,receipt=6,cat=7,item=8,note=9,w=10,r=11,remark=12,pn=13,pa=14,pb=15,st=16,td=17,rst=19,wht=20)),
  # คืนภาษี: date2 line3 product4 ship5 qo6 cat7 item8 note9 W10 R11 remark12 payee(13-15) status16 td17 rst19 wht20
  ("cn_vat_refund","เบิกเงินคืนภาษีโกดังจีน",4,
     dict(date=2,line=3,ship=5,qo=6,cat=7,item=8,note=9,w=10,r=11,remark=12,pn=13,pa=14,pb=15,st=16,td=17,rst=19,wht=20)),
  # ทั่วไป (OPEX): date2 W3 R4 item5 note6 wht7 payer8 payee(9-11) status12 td13 wcert15 ref16 receipt17
  ("general","เบิกเงินทั่วไป ",4,
     dict(date=2,w=3,r=4,item=5,note=6,whtnote=7,payer=8,pn=9,pa=10,pb=11,st=12,td=13,wcert=15,ref=16,receipt=17,expcat=5)),
  # Cargo (OPEX): date2 W3 item4(=expcat) note5 wht6 payer7 payee(8-10) status11 td12 wcert14 ref15 receipt16
  ("cargo","เบิกเงินทำงาน Cargo",3,
     dict(date=2,w=3,expcat=4,item=5,note=5,whtnote=6,payer=7,pn=8,pa=9,pb=10,st=11,td=12,wcert=14,ref=15,receipt=16)),
  # ปิดตรวจ: date3 W4 slip5 line6 product7 . ship9 qo10 term11 exim12 size13 port14 carrier15 item16 wht17 payer18 status19 accap20 recvstatus21 recvdate22 paydate23 note24
  ("close_inspect","ปิดตรวจ วิสิฐ",7,
     dict(date=3,w=4,line=6,item=16,ship=9,qo=10,note=24,whtnote=17,payer=18,st=19,td=23)),
  # NNB: date2 co3 qt4 invoice5 custpay6 order7 item8 W9 payer10 payee(11-13) status14 td15 note17
  ("nnb","NNBเบิกเงินสั่งซื้อสินค้าNNB - ",2,
     dict(date=2,line=3,qo=4,invoice=5,item=8,w=9,payer=10,pn=11,pa=12,pb=13,st=14,td=15,note=17)),
]

# Which lanes' category comes from a หมวดหมู่ column vs are OPEX (fixed service_cost).
CAT_COL_LANES = {"sea","air","truck","tr_6699","sea_choho","tua_chon","export","cn_vat_refund"}

out_disb = []
wb = openpyxl.load_workbook(DISB, data_only=True)
for lane, sheet, start, c in LANES:
    if sheet not in wb.sheetnames: continue
    ws = wb[sheet]
    seq = 0
    for r in range(start, ws.max_row + 1):
        item = cell(ws, r, c.get("item"))
        w  = num(cell(ws, r, c.get("w")))
        rf = num(cell(ws, r, c.get("r")))
        # Skip zero-money rows. The DB CHECK requires amount_withdraw>0 OR
        # amount_refund>0 — a sheet line with a label but no amount recorded
        # yet is an incomplete/not-yet-filled row, not a real disbursement.
        if w == 0 and rf == 0:
            continue
        seq += 1
        remark = cell(ws, r, c.get("remark"))
        whtnote = cell(ws, r, c.get("whtnote"))
        gross, pct = parse_wht(remark or whtnote)
        # category
        if lane in CAT_COL_LANES:
            cat = map_category(cell(ws, r, c.get("cat")))
        else:
            cat = map_category("")   # OPEX = service_cost by default
        if rf > 0 and w == 0:
            cat = "refund_correction"
        row = dict(
            key=f"{sheet}#{r}",
            lane=lane,
            entity="pacred",
            shipment_no=cell(ws, r, c.get("ship")),
            quotation_no=cell(ws, r, c.get("qo")),
            invoice_no=cell(ws, r, c.get("invoice")),
            receipt_no=cell(ws, r, c.get("receipt")),
            container_no=cell(ws, r, c.get("container")),
            customer_id=None,
            line_name=cell(ws, r, c.get("line")),
            category=cat,
            item_label=(item or "(ไม่ระบุรายการ)"),
            expense_category=cell(ws, r, c.get("expcat")) if "expcat" in c else None,
            note=cell(ws, r, c.get("note")),
            is_customer_named_receipt=bool(remark and "ชื่อลูกค้า" in str(remark)),
            amount_withdraw=round(w, 2),
            amount_refund=round(rf, 2),
            amount_gross=(round(gross,2) if gross else None),
            wht_pct=pct,
            wht_cert_no=cell(ws, r, c.get("wht")) or cell(ws, r, c.get("wcert")),
            source_account_key=None,
            payee_name=cell(ws, r, c.get("pn")),
            payee_account_no=(str(cell(ws, r, c.get("pa"))) if cell(ws, r, c.get("pa")) is not None else None),
            payee_bank=cell(ws, r, c.get("pb")),
            pay_channel=None,
            transfer_status=map_status(cell(ws, r, c.get("st"))),
            transferred_at=to_iso(cell(ws, r, c.get("td"))),
            receipt_status=map_receipt(cell(ws, r, c.get("rst"))),
            requested_at=to_iso(cell(ws, r, c.get("date"))),
        )
        out_disb.append(row)
wb.close()

# ── central fund ──
def parse_balance(v):
    import re
    if v is None: return None
    m = re.search(r"([0-9][0-9,\.]*)", str(v))
    return float(m.group(1).replace(",", "")) if m else None

out_cf = []
wb2 = openpyxl.load_workbook(CF, data_only=True)
for sheet in wb2.sheetnames:
    ws = wb2[sheet]
    # header row = the one whose col A == 'วันที่'; data starts after
    hdr = None
    for r in range(1, min(ws.max_row, 8) + 1):
        if str(cell(ws, r, 1)) == "วันที่":
            hdr = r; break
    if hdr is None: continue
    # detect a running-balance column (G on the newer monthly sheets)
    for r in range(hdr + 1, ws.max_row + 1):
        d = cell(ws, r, 1)
        item = cell(ws, r, 2)
        cny = num(cell(ws, r, 3))
        rate = num(cell(ws, r, 4))
        if not isinstance(d, (datetime.datetime, datetime.date)) and (item is None) and cny == 0:
            continue
        if item is None and cny == 0: continue
        thb = round(cny * rate, 2) if rate else num(cell(ws, r, 5))
        split = round(thb / 2, 2) if thb else num(cell(ws, r, 6))
        bal = parse_balance(cell(ws, r, 7))
        out_cf.append(dict(
            key=f"{sheet}#{r}",
            fund_key="china_warehouse",
            txn_date=dstr(d),
            item_label=(item or "(ไม่ระบุรายการ)"),
            amount_cny=round(cny, 2),
            fx_rate=round(rate, 4) if rate else 0,
            amount_thb=round(thb, 2),
            split_thb=split,
            balance_cny=bal,
            note=cell(ws, r, 10),
        ))
wb2.close()

json.dump({"disbursement": out_disb, "central_fund": out_cf}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("parsed", len(out_disb), "disbursement +", len(out_cf), "central_fund", file=sys.stderr)
`;

function runPythonParser() {
  const dir = mkdtempSync(join(tmpdir(), "ap-backfill-"));
  const pyFile = join(dir, "parse.py");
  const outFile = join(dir, "out.json");
  writeFileSync(pyFile, PY, "utf-8");
  const res = spawnSync("python", [pyFile, DISB_XLSX, CF_XLSX, outFile], {
    encoding: "utf-8",
  });
  if (res.status !== 0) {
    console.error("[python parse] failed:", res.stderr || res.stdout);
    process.exit(1);
  }
  console.error(res.stderr?.trim());
  return JSON.parse(readFileSync(outFile, "utf-8"));
}

// ════════════════════════════════════════════════════════════
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — pass --env-file=.env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n=== AP history backfill — ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"} ===\n`);

  const { disbursement, central_fund } = runPythonParser();

  // ── idempotency: load already-imported markers ──
  // Every backfilled row carries "[APX:<key>]" at the tail of note.
  const seenDisb = new Set();
  const seenCf = new Set();
  {
    const { data, error } = await supabase
      .from("ap_disbursement")
      .select("note")
      .ilike("note", "%[APX:%");
    if (error) { console.error("read ap_disbursement markers failed:", error.message); process.exit(1); }
    for (const r of data ?? []) {
      const m = /\[APX:(.+?)\]/.exec(r.note ?? "");
      if (m) seenDisb.add(m[1]);
    }
    const { data: cf, error: cfErr } = await supabase
      .from("ap_central_fund")
      .select("note")
      .ilike("note", "%[APX:%");
    if (cfErr) { console.error("read ap_central_fund markers failed:", cfErr.message); process.exit(1); }
    for (const r of cf ?? []) {
      const m = /\[APX:(.+?)\]/.exec(r.note ?? "");
      if (m) seenCf.add(m[1]);
    }
  }

  // ── build INSERT rows (skip already-imported keys) ──
  const perLane = {};
  const perStatus = {};
  const toInsertDisb = [];
  for (const d of disbursement) {
    if (LIMIT && (perLane[d.lane] ?? 0) >= LIMIT) continue;
    if (seenDisb.has(d.key)) continue;
    perLane[d.lane] = (perLane[d.lane] ?? 0) + 1;
    perStatus[d.transfer_status] = (perStatus[d.transfer_status] ?? 0) + 1;
    const noteWithMarker = `${d.note ? d.note + " " : ""}[APX:${d.key}]`;
    toInsertDisb.push({
      lane: d.lane, entity: d.entity,
      shipment_no: d.shipment_no, quotation_no: d.quotation_no,
      invoice_no: d.invoice_no, receipt_no: d.receipt_no, container_no: d.container_no,
      customer_id: d.customer_id, line_name: d.line_name,
      category: d.category, item_label: String(d.item_label).slice(0, 500),
      expense_category: d.expense_category, note: noteWithMarker,
      is_customer_named_receipt: d.is_customer_named_receipt,
      amount_withdraw: round2(d.amount_withdraw), amount_refund: round2(d.amount_refund),
      amount_gross: d.amount_gross != null ? round2(d.amount_gross) : null,
      wht_pct: d.wht_pct, wht_cert_no: d.wht_cert_no,
      source_account_key: d.source_account_key,
      payee_name: d.payee_name, payee_account_no: d.payee_account_no,
      payee_bank: d.payee_bank, pay_channel: d.pay_channel,
      transfer_status: d.transfer_status, transferred_at: d.transferred_at,
      receipt_status: d.receipt_status,
      requested_at: d.requested_at ?? new Date().toISOString(),
      legacy_admin_id: "xlsx-backfill",
    });
  }

  const toInsertCf = [];
  for (const c of central_fund) {
    if (seenCf.has(c.key)) continue;
    if (!c.txn_date) continue; // txn_date is NOT NULL
    toInsertCf.push({
      fund_key: c.fund_key, txn_date: c.txn_date,
      item_label: String(c.item_label).slice(0, 500),
      amount_cny: round2(c.amount_cny), fx_rate: c.fx_rate,
      amount_thb: round2(c.amount_thb), split_thb: c.split_thb, balance_cny: c.balance_cny,
      note: `${c.note ? c.note + " " : ""}[APX:${c.key}]`,
    });
  }

  // ── report ──
  console.log("ap_disbursement — WOULD INSERT (skipping already-imported):");
  for (const [lane, n] of Object.entries(perLane).sort()) console.log(`  ${lane.padEnd(14)} ${n}`);
  console.log(`  ${"TOTAL".padEnd(14)} ${toInsertDisb.length}  (skipped ${disbursement.length - toInsertDisb.length} already-in-DB/limited)`);
  console.log("  by transfer_status:", perStatus);
  console.log("\nap_central_fund — WOULD INSERT:", toInsertCf.length, `(skipped ${central_fund.length - toInsertCf.length})`);

  // sample rows
  console.log("\nsample ap_disbursement rows:");
  for (const r of toInsertDisb.slice(0, 3)) {
    console.log(`  [${r.lane}] ${r.shipment_no ?? "-"} · ${r.category} · "${r.item_label}" · เบิก ฿${r.amount_withdraw}/คืน ฿${r.amount_refund} · ${r.transfer_status}`);
  }
  console.log("sample ap_central_fund rows:");
  for (const r of toInsertCf.slice(0, 3)) {
    console.log(`  ${r.txn_date} · "${r.item_label}" · ¥${r.amount_cny} × ${r.fx_rate} = ฿${r.amount_thb} · หาร2 ฿${r.split_thb}`);
  }

  if (!APPLY) {
    console.log("\n(dry-run — nothing written. Re-run with --apply to insert.)\n");
    return;
  }

  // ── APPLY: chunked inserts ──
  const CHUNK = 500;
  let insDisb = 0, insCf = 0;
  for (let i = 0; i < toInsertDisb.length; i += CHUNK) {
    const slice = toInsertDisb.slice(i, i + CHUNK);
    const { error } = await supabase.from("ap_disbursement").insert(slice);
    if (error) { console.error(`ap_disbursement insert chunk @${i} failed:`, error.message); process.exit(1); }
    insDisb += slice.length;
    process.stdout.write(`\r  ap_disbursement inserted ${insDisb}/${toInsertDisb.length}`);
  }
  console.log();
  for (let i = 0; i < toInsertCf.length; i += CHUNK) {
    const slice = toInsertCf.slice(i, i + CHUNK);
    const { error } = await supabase.from("ap_central_fund").insert(slice);
    if (error) { console.error(`ap_central_fund insert chunk @${i} failed:`, error.message); process.exit(1); }
    insCf += slice.length;
    process.stdout.write(`\r  ap_central_fund inserted ${insCf}/${toInsertCf.length}`);
  }
  console.log(`\n\n✓ applied: ${insDisb} ap_disbursement + ${insCf} ap_central_fund rows.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
