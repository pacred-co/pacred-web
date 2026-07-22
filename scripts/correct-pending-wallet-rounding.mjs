#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const expected = [
  { id: 105708, userid: "PR549", type: "1", status: "1", reforder: "", reforder2: null, from: 4019.41, to: 4019.40 },
  { id: 105712, userid: "PR549", type: "4", status: "1", reforder: "52588", reforder2: 105708, from: 530.15, to: 530.14 },
  { id: 105728, userid: "PR086", type: "1", status: "1", reforder: "", reforder2: null, from: 1075.15, to: 1075.14 },
  { id: 105732, userid: "PR086", type: "4", status: "1", reforder: "52559", reforder2: 105728, from: 385.11, to: 385.10 },
];

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db
  .from("tb_wallet_hs")
  .select("id,userid,type,status,reforder,reforder2,amount,date,dateslip,imagesslip")
  .in("id", expected.map((row) => row.id))
  .order("id", { ascending: true });
if (error) throw error;

for (const spec of expected) {
  const row = data.find((candidate) => candidate.id === spec.id);
  if (!row) throw new Error(`Precondition failed: missing tb_wallet_hs#${spec.id}`);
  for (const field of ["userid", "type", "status", "reforder", "reforder2"]) {
    if (row[field] !== spec[field]) {
      throw new Error(`Precondition failed: #${spec.id} ${field}=${row[field]} expected ${spec[field]}`);
    }
  }
  if (Math.round(Number(row.amount) * 100) !== Math.round(spec.from * 100)) {
    throw new Error(`Precondition failed: #${spec.id} amount=${row.amount} expected ${spec.from}`);
  }
}

const backupDir = path.resolve(process.cwd(), "..", "production-backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
const backupPath = path.join(backupDir, `wallet-rounding-${stamp}.json`);
await writeFile(backupPath, `${JSON.stringify({ createdAt: new Date().toISOString(), apply, rows: data }, null, 2)}\n`, { flag: "wx" });
console.log(`Backup: ${backupPath}`);

if (!apply) {
  console.log("Dry run passed; no database rows changed. Re-run with --apply to update four pending rows.");
}

if (apply) {
  const changed = [];
  try {
    for (const spec of expected) {
      const { data: updated, error: updateError } = await db
        .from("tb_wallet_hs")
        .update({ amount: spec.to })
        .eq("id", spec.id)
        .eq("status", "1")
        .eq("amount", spec.from)
        .select("id,amount")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) throw new Error(`Conditional update affected no row: #${spec.id}`);
      changed.push(spec);
    }
  } catch (updateFailure) {
    for (const spec of changed.reverse()) {
      await db.from("tb_wallet_hs").update({ amount: spec.from }).eq("id", spec.id).eq("status", "1").eq("amount", spec.to);
    }
    throw updateFailure;
  }

  const { data: verified, error: verifyError } = await db
    .from("tb_wallet_hs")
    .select("id,amount,status")
    .in("id", expected.map((row) => row.id))
    .order("id", { ascending: true });
  if (verifyError) throw verifyError;
  for (const spec of expected) {
    const row = verified.find((candidate) => candidate.id === spec.id);
    if (!row || row.status !== "1" || Math.round(Number(row.amount) * 100) !== Math.round(spec.to * 100)) {
      throw new Error(`Post-update verification failed: #${spec.id}`);
    }
  }
  console.log(JSON.stringify(verified, null, 2));
  console.log("Applied and verified four pending wallet rounding corrections.");
}
