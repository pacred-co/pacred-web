import assert from "node:assert";
import { parseTaemReconcile, parseTaemDate } from "./taem-reconcile-parser";

let pass = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); pass++; };

// The real iTAM "Shipment Report" header (26 cols A→Z) — CONFIRMED 2026-06-22 against
// the owner's real packing-list xlsx (PR-TISO-GZS260622-1.xlsx · sheet "Shipment
// Report"). Tracking is col J (9); etd/eta are cols Y/Z (24/25).
const SR_HEADER = [
  "Container Name","Trans","SM Date","SM Number","Branch","Product","Dum","Type",
  "Code","Tracking","W.","L.","H.","Total Parcel","Wt.","Vol.","Total Wt.",
  "Total Vol.","Remark Number","CG.","Note.","Service fee.","status","return","etd","eta",
].join("\t");

// Build a 26-col Shipment-Report data row from named fields at their REAL indices.
type SF = "container"|"trans"|"smDate"|"type"|"code"|"tracking"|"parcel"|"totalWt"|"totalVol"|"etd"|"eta";
const IDX: Record<SF, number> = { container:0, trans:1, smDate:2, type:7, code:8, tracking:9, parcel:13, totalWt:16, totalVol:17, etd:24, eta:25 };
function srow(f: Partial<Record<SF, string>>): string {
  const cols = new Array(26).fill("");
  for (const k of Object.keys(f) as SF[]) cols[IDX[k]] = f[k]!;
  return cols.join("\t");
}

// ── header-mapped paste (real iTAM "Shipment Report" · real GZS260622 data) ──
{
  const r1 = srow({ container:"GZS260622-1", trans:"SEA", smDate:"2026/06/17", type:"普通货物/ทั่วไป/A", code:"PR015", tracking:"1781675788-1/4", parcel:"1", totalWt:"398", totalVol:"0.6555", etd:"2026-06-21", eta:"2026-07-05" });
  const r2 = srow({ container:"GZS260622-1", trans:"SEA", smDate:"2026/06/17", type:"普通货物/ทั่วไป/A", code:"PR053", tracking:"1782029840", parcel:"10", totalWt:"628", totalVol:"0.5025" });
  const note = srow({ tracking:"1779529270", container:"กระสอบรวม" });
  const { rows, headerSeen } = parseTaemReconcile([SR_HEADER, r1, r2, note].join("\n"));
  ok(headerSeen, "header detected (Container Name first)");
  ok(rows.length === 3, "3 data lines parsed");
  ok(rows[0].tracking === "1781675788-1/4" && rows[0].container === "GZS260622-1", "row1 tracking(J)+container(A)");
  ok(rows[0].trans === "SEA" && rows[0].code === "PR015", "row1 trans(B)+code(I)");
  ok(rows[0].type === "普通货物/ทั่วไป/A", "row1 type(H)");
  ok(rows[0].totalWt === 398 && Math.abs(rows[0].totalVol! - 0.6555) < 1e-9, "row1 totalWt(Q)+totalVol(R)");
  ok(rows[0].parcel === 1, "row1 parcel(N)");
  ok(rows[0].etd === "2026-06-21" && rows[0].eta === "2026-07-05", "row1 etd(Y)+eta(Z) by header name");
  ok(rows[0].isData === true, "row1 isData");
  ok(rows[1].isData === true && rows[1].totalVol === 0.5025, "row2 data");
  ok(rows[2].isData === false && rows[2].note === "กระสอบรวม", "note row flagged + note carried");
}

// ── note variants are all isData=false ──
{
  const notes = [
    srow({ tracking:"1781515241", container:"ยังไม่ปิดตู้ออกมาเลยไม่ทราบข้อมูลนอกจาก momo" }),
    srow({ tracking:"1780555730", container:"ซ้ำกับ 1/6" }),
    srow({ tracking:"31302385041784", container:"ไม่พบข้อมูล สักแหล่งข้อมูลเลย" }),
  ];
  const { rows } = parseTaemReconcile([SR_HEADER, ...notes].join("\n"));
  ok(rows.length === 3, "3 note rows");
  ok(rows.every((r) => !r.isData), "all note rows isData=false");
  ok(rows[0].note!.includes("ยังไม่ปิดตู้"), "note text preserved");
}

// ── no header → canonical column order (real Shipment-Report indices) ──
{
  const line = srow({ container:"GZS260605-1", trans:"SEA", type:"普通货物/ทั่วไป/A", code:"PR040", tracking:"1780559528", parcel:"1", totalWt:"1770", totalVol:"8.22528" });
  const { rows, headerSeen } = parseTaemReconcile(line);
  ok(!headerSeen, "no header");
  ok(rows.length === 1 && rows[0].code === "PR040" && rows[0].totalWt === 1770, "canonical parse");
  ok(rows[0].tracking === "1780559528" && rows[0].container === "GZS260605-1", "canonical tracking(J)+container(A)");
  ok(rows[0].isData, "canonical isData");
}

// ── comma thousands + EK/GZE/GZA container detection ──
{
  const ek = srow({ container:"EK260601-1", trans:"ROAD", type:"A", code:"PR1", tracking:"X1", parcel:"2", totalWt:"1,234.50", totalVol:"0.5" });
  const gza = srow({ container:"GZA260601-1", trans:"AIR", type:"A", code:"PR2", tracking:"X2", parcel:"1", totalWt:"10", totalVol:"0.1" });
  const { rows } = parseTaemReconcile([ek, gza].join("\n"));
  ok(rows[0].totalWt === 1234.5, "comma stripped");
  ok(rows[0].isData && rows[1].isData, "EK + GZA recognised as containers");
}

// ── continuation row: empty container but real wt/vol → isData=true ──
{
  const cont = srow({ tracking:"1779955936-2", trans:"SEA", type:"药和食物/อย./O", code:"PR10601", parcel:"40", totalWt:"520", totalVol:"1.764" });
  const { rows } = parseTaemReconcile(cont);
  ok(rows.length === 1, "continuation row parsed");
  ok(rows[0].container === null, "continuation container empty");
  ok(rows[0].totalWt === 520 && rows[0].totalVol === 1.764, "continuation wt/vol");
  ok(rows[0].isData === true, "continuation isData=true (measurements present)");
  ok(rows[0].note === null, "continuation has no note");
}

// ── note row WITH a container code but NO measurements → isData=false ──
{
  const note = srow({ tracking:"X9", container:"GZS260528-2" });
  const { rows } = parseTaemReconcile(note);
  ok(rows[0].isData === false, "container without measurements = note");
  ok(rows[0].note === "GZS260528-2", "note carries the container text");
}

// ── blank lines + row with no tracking skipped ──
{
  const { rows } = parseTaemReconcile("\n" + srow({ container:"GZS260528-1", trans:"SEA" }) + "\n\n");
  ok(rows.length === 0, "row without tracking skipped");
}

// ── parseTaemDate: formats + blanks + invalid ──
{
  ok(parseTaemDate("2026-05-23") === "2026-05-23", "ISO yyyy-mm-dd");
  ok(parseTaemDate("2026/5/3") === "2026-05-03", "slash year-first + zero-pad");
  ok(parseTaemDate("23/05/2026") === "2026-05-23", "day-first slash");
  ok(parseTaemDate("3-5-2026") === "2026-05-03", "day-first dash + zero-pad");
  ok(parseTaemDate("") === null, "blank → null");
  ok(parseTaemDate(null) === null, "null → null");
  ok(parseTaemDate("ยังไม่ปิดตู้") === null, "note text → null");
  ok(parseTaemDate("2026-02-30") === null, "Feb-30 rejected (real calendar check)");
  ok(parseTaemDate("2026-13-01") === null, "month 13 rejected");
}

// ── etd/eta captured by HEADER NAME (the authoritative path) ──
{
  const r1 = srow({ container:"GZS260528-1", trans:"SEA", smDate:"2026-05-20", type:"A", code:"PR040", tracking:"0004065", parcel:"1", totalWt:"869", totalVol:"2.51712", etd:"2026-05-23", eta:"2026-06-05" });
  const r2 = srow({ tracking:"616035273", trans:"SEA", type:"A", code:"PR041", parcel:"2", totalWt:"36", totalVol:"0.13" }); // etd/eta blank
  const { rows } = parseTaemReconcile([SR_HEADER, r1, r2].join("\n"));
  ok(rows[0].etd === "2026-05-23", "etd mapped by header name (col Y)");
  ok(rows[0].eta === "2026-06-05", "eta mapped by header name (col Z)");
  ok(rows[0].isData === true, "etd/eta row still isData");
  ok(rows[1].etd === null && rows[1].eta === null, "blank etd/eta → null");
}

// ── no header: canonical etd/eta indices (Y=24 / Z=25) date-guarded ──
{
  const line = srow({ container:"GZS260605-1", trans:"SEA", type:"普通货物/ทั่วไป/A", code:"PR040", tracking:"1780559528", parcel:"1", totalWt:"1770", totalVol:"8.22528", etd:"2026-06-02", eta:"2026-06-18" });
  const { rows, headerSeen } = parseTaemReconcile(line);
  ok(!headerSeen, "no header (etd/eta canonical)");
  ok(rows[0].etd === "2026-06-02", "canonical etd at col Y (24)");
  ok(rows[0].eta === "2026-06-18", "canonical eta at col Z (25)");
}

console.log(`taem-reconcile-parser.test.ts — ${pass} passed`);
