// Import the ENTIRE DOC BOT database (blhdxmcmepmmdfmqqvdg) into the MAIN DB's
// doc_bot_* tables (mig 0249) — a faithful/lossless copy of the HS-code knowledge base.
// Owner 2026-07-09. Reads DOC BOT (pg) → inserts into main PROD + DEV (ON CONFLICT DO NOTHING).
// Default DRY-RUN (counts only). Pass --apply to write.
import pg from "pg";
const { Client } = pg;
const APPLY = process.argv.includes("--apply");

const SOURCE = { ref: "blhdxmcmepmmdfmqqvdg", pass: "Pacred40x.@", label: "DOC BOT" };
const DESTS = [
  { ref: "yzljakczhwrpbxflnmco", pass: "DqOzfEZVXfMHIryz", label: "MAIN PROD" },
  { ref: "lozntlidlqqzzcaathnm", pass: "n61OKDy28QcrB1ZJ", label: "MAIN DEV" },
];
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];

async function connect({ ref, pass, label }) {
  const enc = encodeURIComponent(pass);
  const attempts = [
    ...HOSTS.flatMap((h) => [
      `postgresql://postgres.${ref}:${enc}@${h}:5432/postgres`,
      `postgresql://postgres.${ref}:${enc}@${h}:6543/postgres`,
    ]),
    `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
  ];
  for (const conn of attempts) {
    try {
      const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
      await c.connect();
      return c;
    } catch { /* try next */ }
  }
  throw new Error(`cannot connect to ${label} (${ref})`);
}

// table → { cols (in order), pk (ON CONFLICT target) }
const TABLES = {
  doc_bot_hs_codes:            { cols: ["id","hs_code","th","en","fe","no","stat","note"], pk: "id" },
  doc_bot_hs_overrides:        { cols: ["id","user_id","keyword","correct_hs","note","created_at"], pk: "id" },
  doc_bot_conversation_history:{ cols: ["id","user_id","role","content","created_at"], pk: "id" },
  doc_bot_conversation_state:  { cols: ["user_id","state","data","updated_at"], pk: "user_id" },
  doc_bot_state:               { cols: ["user_id","mode","step","temp_name","temp_field"], pk: "user_id" },
};
// DOC BOT source table names (== dest minus the doc_bot_ prefix, except overrides).
const SRC_NAME = {
  doc_bot_hs_codes: "hs_codes",
  doc_bot_hs_overrides: "custom_hs_overrides",
  doc_bot_conversation_history: "conversation_history",
  doc_bot_conversation_state: "conversation_state",
  doc_bot_state: "bot_state",
};

const q = (c) => `"${c}"`;

async function run() {
  const src = await connect(SOURCE);
  console.log(`connected: ${SOURCE.label}`);
  // read all source rows
  const data = {};
  for (const [dest, { cols }] of Object.entries(TABLES)) {
    const srcTbl = SRC_NAME[dest];
    const { rows } = await src.query(`SELECT ${cols.map(q).join(",")} FROM public.${q(srcTbl)}`);
    data[dest] = rows;
    console.log(`  read ${srcTbl}: ${rows.length} rows`);
  }
  await src.end();

  console.log(`\n=== ${APPLY ? "APPLY" : "DRY-RUN"} → ${DESTS.length} dest ===`);
  if (!APPLY) {
    for (const dest of DESTS) console.log(`  ${dest.label}: would insert ${Object.entries(data).map(([t, r]) => `${t}=${r.length}`).join(" · ")}`);
    console.log("\n(dry-run · เพิ่ม --apply เพื่อ copy จริง)");
    return;
  }

  for (const destCfg of DESTS) {
    const c = await connect(destCfg);
    console.log(`\nconnected: ${destCfg.label}`);
    for (const [tbl, { cols, pk }] of Object.entries(TABLES)) {
      const rows = data[tbl];
      let ok = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        if (chunk.length === 0) continue;
        const params = [];
        const valuesSql = chunk.map((row) => {
          const ph = cols.map((col) => {
            params.push(col === "data" && row[col] != null ? JSON.stringify(row[col]) : row[col]);
            return `$${params.length}`;
          });
          return `(${ph.join(",")})`;
        }).join(",");
        const sql = `INSERT INTO public.${q(tbl)} (${cols.map(q).join(",")}) VALUES ${valuesSql} ON CONFLICT (${q(pk)}) DO NOTHING`;
        const res = await c.query(sql, params);
        ok += res.rowCount ?? 0;
      }
      const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM public.${q(tbl)}`);
      console.log(`  ${tbl}: inserted ${ok} · total now ${n}`);
    }
    await c.end();
  }
  console.log("\n✅ DOC BOT imported into MAIN prod + dev.");
}
run().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
