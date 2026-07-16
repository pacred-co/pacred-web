/**
 * AUDIT-B part 2 — READ-ONLY. Two questions the part-1 scan raised:
 *
 *  (A) GENUINELY-CORRUPT detail rows = a suffixed "-N/M" row whose
 *      (famount,fweight,fvolume) ≈ its group's BARE-BASE aggregate (it "got the
 *      aggregate"). This is convention-robust (compares to the aggregate, NOT to
 *      weight_kg×qty which is ambiguous per-piece-vs-total in momo_box_detail).
 *
 *  (B) CODE-FIX blast radius, PLATFORM-WIDE (not just the momo universe): every
 *      BARE (suffix-0) tb_forwarder row that has ≥1 "-N" suffixed sibling in the
 *      same base+userid — with weight>0 and money — so we can PROVE the count-SOT
 *      change (drop a bare-with-siblings money-0 row REGARDLESS of weight) never
 *      drops a legitimate real anchor.
 *
 * NO writes. SELECT only.
 * RUN: node scripts/audit-momo-box-blast-radius-2b-2026-07-16.mjs
 */
import pg from "pg";

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const suffixOf = (t) => {
  const m = /-(\d+)(?:\/\d+)?$/.exec((t ?? "").trim());
  return m ? Number(m[1]) : 0;
};
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const relDiff = (a, b) => {
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d < 1e-9 ? 0 : Math.abs(a - b) / d;
};
const money2 = (n) => Number(num(n).toFixed(2));
const MONEY_SUM = (r) =>
  num(r.ftotalprice) + num(r.ftransportprice) + num(r.fpriceupdate) +
  num(r.fshippingservice) + num(r.pricecrate) + num(r.ftransportpricechnthb) + num(r.priceother);

async function main() {
  await client.connect();
  const out = [];

  // ── (B) PLATFORM-WIDE: find every base+userid group that has a bare row AND a suffixed sibling ──
  // We can't cheaply GROUP BY baseOf() in SQL, so pull the candidate universe: any row whose
  // ftrackingchn contains a "-<digits>" suffix (the siblings) OR is a bare base that MIGHT own them.
  // Strategy: pull all rows with a numeric suffix, derive their bases, then pull the bare rows for
  // those bases, then reconstruct groups in JS.
  const { rows: suffixed } = await client.query(
    `SELECT id, ftrackingchn, famount, fweight, fvolume, ftotalprice,
            ftransportprice, fpriceupdate, fshippingservice, pricecrate,
            ftransportpricechnthb, priceother, fstatus, userid, fcabinetnumber
       FROM tb_forwarder
      WHERE ftrackingchn ~ '-[0-9]+(/[0-9]+)?$'`,
  );
  const baseUserSet = new Set();
  const bases = new Set();
  for (const r of suffixed) {
    bases.add(baseOf(r.ftrackingchn));
    baseUserSet.add(`${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`);
  }
  // Pull the bare rows for those bases (exact tracking = base).
  const baseList = Array.from(bases);
  const { rows: bareRows } = await client.query(
    `SELECT id, ftrackingchn, famount, fweight, fvolume, ftotalprice,
            ftransportprice, fpriceupdate, fshippingservice, pricecrate,
            ftransportpricechnthb, priceother, fstatus, userid, fcabinetnumber
       FROM tb_forwarder
      WHERE ftrackingchn = ANY($1::text[])`,
    [baseList],
  );

  // Reconstruct groups: key = base::userid → { bare, siblings[] }
  const groups = new Map();
  const ensure = (key) => {
    if (!groups.has(key)) groups.set(key, { bare: [], siblings: [] });
    return groups.get(key);
  };
  for (const r of suffixed) ensure(`${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`).siblings.push(r);
  for (const r of bareRows) {
    const key = `${r.ftrackingchn}::${r.userid ?? ""}`;
    if (groups.has(key)) groups.get(key).bare.push(r);
  }

  // For every group that has BOTH a bare row and ≥1 sibling: classify each bare row.
  const bareWithSiblings = [];
  for (const [key, g] of groups) {
    if (g.bare.length === 0 || g.siblings.length === 0) continue;
    const sibWeight = money2(g.siblings.reduce((a, s) => a + num(s.fweight), 0));
    const sibAmount = g.siblings.reduce((a, s) => a + Math.round(num(s.famount)), 0);
    for (const b of g.bare) {
      const w = num(b.fweight);
      const money = MONEY_SUM(b);
      const cls =
        money > 0
          ? "MONEY>0 → KEPT (unaffected by fix)"
          : w === 0
            ? "weight0+money0 → already dropped (no change)"
            : relDiff(w, sibWeight) <= 0.05
              ? "weight>0+money0, weight≈Σsib → REDUNDANT AGGREGATE (fix now drops · SAFE)"
              : "weight>0+money0, weight≠Σsib → ⚠️ AMBIGUOUS (fix would drop — REVIEW)";
      bareWithSiblings.push({
        key, id: b.id, tracking: b.ftrackingchn, userid: b.userid, fstatus: b.fstatus,
        famount: Math.round(num(b.famount)), fweight: w, money,
        siblingCount: g.siblings.length, sibWeight, sibAmount, cls,
      });
    }
  }

  out.push("═══════════════════════════════════════════════════════════════════════");
  out.push("AUDIT-B/2 — CODE-FIX blast radius (PLATFORM-WIDE · READ-ONLY)");
  out.push("═══════════════════════════════════════════════════════════════════════");
  out.push(`suffixed rows: ${suffixed.length} · distinct bases with a suffixed sibling: ${bases.size}`);
  out.push(`bare rows that co-exist with ≥1 suffixed sibling (same base+userid): ${bareWithSiblings.length}`);
  out.push("");
  out.push("The code fix (drop a bare-with-siblings row when money=0, REGARDLESS of weight) only");
  out.push("CHANGES behavior for the 'weight>0+money0' rows. Every such row below must be a redundant");
  out.push("aggregate (weight≈Σsiblings) for the fix to be safe. MONEY>0 rows are KEPT (money-guard).");
  out.push("───────────────────────────────────────────────────────────────────────");
  const byClass = new Map();
  for (const r of bareWithSiblings) byClass.set(r.cls, (byClass.get(r.cls) ?? 0) + 1);
  for (const [c, n] of byClass) out.push(`   ${n.toString().padStart(3)} × ${c}`);
  out.push("───────────────────────────────────────────────────────────────────────");
  // Print only the rows the fix actually changes (weight>0 + money0) + any ambiguous.
  const changed = bareWithSiblings.filter((r) => r.money === 0 && r.fweight > 0);
  out.push(`Rows the fix CHANGES (money0 + weight>0): ${changed.length}`);
  for (const r of changed) {
    out.push(`  id ${r.id} | ${r.tracking} | ${r.userid} | fstatus=${r.fstatus} | ${r.cls}`);
    out.push(`      bare famount=${r.famount} fweight=${r.fweight}  ||  siblings(${r.siblingCount}) Σamount=${r.sibAmount} Σweight=${r.sibWeight}`);
  }
  out.push("");
  // Also print the MONEY>0 bare-with-siblings (kept, but they mean a botched split needing DATA reconcile).
  const priced = bareWithSiblings.filter((r) => r.money > 0);
  out.push(`MONEY>0 bare-with-siblings (KEPT by money-guard · but a bare aggregate that is ALSO priced = a`);
  out.push(`botched split → over-counts until DATA-reconciled): ${priced.length}`);
  for (const r of priced) {
    out.push(`  id ${r.id} | ${r.tracking} | ${r.userid} | fstatus=${r.fstatus} | bare famount=${r.famount} fweight=${r.fweight} money=${money2(r.money)} | siblings(${r.siblingCount}) Σamount=${r.sibAmount} Σweight=${r.sibWeight}`);
  }

  console.log(out.join("\n"));
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
