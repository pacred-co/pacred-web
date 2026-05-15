/**
 * One-off dev: list auth.users + their profiles for picking which one
 * to seed-credit. Run from repo root.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
const profiles = await admin.from("profiles").select("id, member_code, first_name, last_name, phone, account_type").limit(1000);
const profById = new Map((profiles.data ?? []).map((p) => [p.id, p]));

const wallets = await admin.from("wallet").select("profile_id, balance").limit(1000);
const walletById = new Map((wallets.data ?? []).map((w) => [w.profile_id, w]));

console.log(`\n${usersList.users.length} auth.users:\n`);
for (const u of usersList.users) {
  const p = profById.get(u.id);
  const w = walletById.get(u.id);
  console.log(
    `  ${(u.email ?? "—").padEnd(35)}  ` +
    `${(p?.member_code ?? "—").padEnd(10)}  ` +
    `${(p?.first_name ?? "")} ${(p?.last_name ?? "")}`.padEnd(35) +
    `  ฿${Number(w?.balance ?? 0).toFixed(2)}`,
  );
}
