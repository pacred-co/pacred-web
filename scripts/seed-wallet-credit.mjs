/**
 * One-off dev seed: credit a wallet via wallet_transactions insert.
 *
 * Usage (from repo root):
 *   node --dns-result-order=ipv4first --env-file=.env.local scripts/seed-wallet-credit.mjs <email> <amount>
 *
 * Example:
 *   node --dns-result-order=ipv4first --env-file=.env.local scripts/seed-wallet-credit.mjs pcscargosocial@gmail.com 1600
 *
 * What it does:
 *   1. Looks up auth.users by email
 *   2. Resolves to profile_id (= user.id)
 *   3. Inserts wallet_transactions { kind: 'deposit', status: 'completed',
 *      amount: +<n>, bucket: 'main', note: 'dev seed' }
 *   4. wallet_recompute_balance trigger auto-updates wallet.balance
 *   5. Prints before/after balance
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local. Service role bypasses
 * RLS — ONLY use for dev seeding, never expose to the app.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const [, , emailArg, amountArg] = process.argv;
const email  = emailArg;
const amount = Number(amountArg);
if (!email || !Number.isFinite(amount) || amount <= 0) {
  console.error("Usage: node scripts/seed-wallet-credit.mjs <email> <amount>");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// 1. Find user by email via auth.admin.listUsers (paginated; limit 1000 is fine for dev)
const { data: usersList, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (usersErr) { console.error("listUsers failed:", usersErr.message); process.exit(2); }
const user = usersList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.error(`No auth.user found for email ${email}`); process.exit(3); }
const profileId = user.id;
console.log(`✓ Found user: ${user.email}  (profile_id=${profileId})`);

// 2. Get profile name + member code
const { data: profile } = await admin
  .from("profiles")
  .select("member_code, first_name, last_name")
  .eq("id", profileId)
  .maybeSingle();
console.log(`  → ${profile?.member_code ?? "—"}  ${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`);

// 3. Show current wallet balance
const { data: walletBefore } = await admin
  .from("wallet")
  .select("balance, cashback_balance, credit_balance")
  .eq("profile_id", profileId)
  .maybeSingle();
console.log(`  Balance BEFORE: main=฿${Number(walletBefore?.balance ?? 0).toFixed(2)} cashback=฿${Number(walletBefore?.cashback_balance ?? 0).toFixed(2)} credit=฿${Number(walletBefore?.credit_balance ?? 0).toFixed(2)}`);

// 4. Insert the deposit wallet_tx
const { data: tx, error: txErr } = await admin
  .from("wallet_transactions")
  .insert({
    profile_id:    profileId,
    bucket:        "main",
    amount:        amount,                  // positive = credit
    kind:          "deposit",
    status:        "completed",
    note:          "dev seed (scripts/seed-wallet-credit.mjs)",
  })
  .select("id, amount")
  .single();
if (txErr) { console.error("Insert failed:", txErr.message); process.exit(4); }
console.log(`✓ Inserted wallet_tx ${tx.id}  amount=+฿${Number(tx.amount).toFixed(2)}`);

// 5. Confirm balance updated by trigger
const { data: walletAfter } = await admin
  .from("wallet")
  .select("balance")
  .eq("profile_id", profileId)
  .maybeSingle();
console.log(`✓ Balance AFTER:  main=฿${Number(walletAfter?.balance ?? 0).toFixed(2)}`);
console.log(`✓ Done.`);
