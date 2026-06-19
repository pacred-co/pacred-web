import assert from "node:assert";
import { parseTaemReconcile, parseTaemDate } from "./taem-reconcile-parser";

let pass = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); pass++; };

// ── header-mapped paste (real แต้ม "MOMO Pacred" shape) ──
{
  const header = ["ftrackingchn","Container Name","Trans","SM Date","SM Number","Branch","Product","Dum","Type","Code","Tracking","W.","L.","H.","Total Parcel","Wt.","Vol.","Total Wt.","Total Vol."].join("\t");
  const r1 = ["0004065","GZS260528-1","SEA","","","","","","电器/มอก./M","PCS99","","","","","1","","","869","2.51712"].join("\t");
  const r2 = ["616035273","GZS260528-1","SEA","","","","","","普通货物/ทั่วไป/A","PCS10190","","","","","2","","","36","0.132352"].join("\t");
  const note = ["1779529270","กระสอบรวม","","","","","","","","","","","","","","","","",""].join("\t");
  const { rows, headerSeen } = parseTaemReconcile([header, r1, r2, note].join("\n"));
  ok(headerSeen, "header detected");
  ok(rows.length === 3, "3 data lines parsed");
  ok(rows[0].tracking === "0004065" && rows[0].container === "GZS260528-1", "row1 tracking+container");
  ok(rows[0].trans === "SEA" && rows[0].code === "PCS99", "row1 trans+code");
  ok(rows[0].totalWt === 869 && Math.abs(rows[0].totalVol! - 2.51712) < 1e-9, "row1 wt+vol");
  ok(rows[0].parcel === 1, "row1 parcel");
  ok(rows[0].isData === true, "row1 isData");
  ok(rows[1].isData === true && rows[1].totalVol === 0.132352, "row2 data");
  ok(rows[2].isData === false && rows[2].note === "กระสอบรวม", "note row flagged + note carried");
}

// ── note variants are all isData=false ──
{
  const header = ["ftrackingchn","Container Name"].join("\t"); // partial header → canonical fills rest
  const notes = [
    ["1781515241","ยังไม่ปิดตู้ออกมาเลยไม่ทราบข้อมูลนอกจาก momo"],
    ["1780555730","ซ้ำกับ 1/6"],
    ["31302385041784","ไม่พบข้อมูล สักแหล่งข้อมูลเลย"],
  ].map((c) => c.join("\t"));
  const { rows } = parseTaemReconcile([header, ...notes].join("\n"));
  ok(rows.length === 3, "3 note rows");
  ok(rows.every((r) => !r.isData), "all note rows isData=false");
  ok(rows[0].note!.includes("ยังไม่ปิดตู้"), "note text preserved");
}

// ── no header → canonical column order ──
{
  const line = ["1780559528","GZS260605-1","SEA","","","","","","普通货物/ทั่วไป/A","PR040","","","","","1","","","1770","8.22528"].join("\t");
  const { rows, headerSeen } = parseTaemReconcile(line);
  ok(!headerSeen, "no header");
  ok(rows.length === 1 && rows[0].code === "PR040" && rows[0].totalWt === 1770, "canonical parse");
  ok(rows[0].isData, "canonical isData");
}

// ── comma thousands + EK/GZE/GZA container detection ──
{
  const ek = ["X1","EK260601-1","ROAD","","","","","","A","PR1","","","","","2","","","1,234.50","0.5"].join("\t");
  const gza = ["X2","GZA260601-1","AIR","","","","","","A","PR2","","","","","1","","","10","0.1"].join("\t");
  const { rows } = parseTaemReconcile([ek, gza].join("\n"));
  ok(rows[0].totalWt === 1234.5, "comma stripped");
  ok(rows[0].isData && rows[1].isData, "EK + GZA recognised as containers");
}

// ── continuation row: empty container but real wt/vol → isData=true ──
{
  // 1779955936-2 inherits the parent's container (empty cell) but has measurements
  const cont = ["1779955936-2","","SEA","","","","","","药和食物/อย./O","PR10601","","","","","40","","","520","1.764"].join("\t");
  const { rows } = parseTaemReconcile(cont);
  ok(rows.length === 1, "continuation row parsed");
  ok(rows[0].container === null, "continuation container empty");
  ok(rows[0].totalWt === 520 && rows[0].totalVol === 1.764, "continuation wt/vol");
  ok(rows[0].isData === true, "continuation isData=true (measurements present)");
  ok(rows[0].note === null, "continuation has no note");
}

// ── note row WITH a container code but NO measurements → isData=false ──
{
  const note = ["X9","GZS260528-2","","","","","","","","","","","","","","","","",""].join("\t");
  const { rows } = parseTaemReconcile(note);
  ok(rows[0].isData === false, "container without measurements = note");
  ok(rows[0].note === "GZS260528-2", "note carries the container text");
}

// ── blank lines + row with no tracking skipped ──
{
  const { rows } = parseTaemReconcile("\n\t\tGZS260528-1\tSEA\n\n");
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
  const header = ["ftrackingchn","Container Name","Trans","SM Date","etd","eta","Type","Code","Total Parcel","Total Wt.","Total Vol."].join("\t");
  const r1 = ["0004065","GZS260528-1","SEA","2026-05-20","2026-05-23","2026-06-05","A","PR040","1","869","2.51712"].join("\t");
  // continuation row: etd/eta blank → null (no garbage)
  const r2 = ["616035273","","SEA","","","","A","PR041","2","36","0.13"].join("\t");
  const { rows } = parseTaemReconcile([header, r1, r2].join("\n"));
  ok(rows[0].etd === "2026-05-23", "etd mapped by header name");
  ok(rows[0].eta === "2026-06-05", "eta mapped by header name");
  ok(rows[0].isData === true, "etd/eta row still isData");
  ok(rows[1].etd === null && rows[1].eta === null, "blank etd/eta → null");
}

// ── no header: canonical etd/eta indices (4/5) date-guarded ──
{
  // Container Name · Trans · SM Date · etd · eta … (canonical positions)
  const line = ["1780559528","GZS260605-1","SEA","2026-06-01","2026-06-02","2026-06-18","","","普通货物/ทั่วไป/A","PR040","","","","","1","","","1770","8.22528"].join("\t");
  const { rows, headerSeen } = parseTaemReconcile(line);
  ok(!headerSeen, "no header (etd/eta canonical)");
  ok(rows[0].etd === "2026-06-02", "canonical etd at index 4");
  ok(rows[0].eta === "2026-06-18", "canonical eta at index 5");
}

console.log(`taem-reconcile-parser.test.ts — ${pass} passed`);
