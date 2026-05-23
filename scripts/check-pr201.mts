import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

console.log("target:", url);

const { data: pr201 } = await admin
  .from("profiles")
  .select("id, member_code, first_name, last_name, phone, email, created_at")
  .eq("member_code", "PR201")
  .maybeSingle();
console.log("\nPR201 row:", pr201);

// Look for orphan test auth users
const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const orphans = list.users.filter(
  (u) =>
    u.email?.includes("live-shape-") ||
    u.email?.includes("trigger-smoke") ||
    u.email?.includes("test.pacred.invalid"),
);
console.log(`\norphan test users: ${orphans.length}`);
for (const u of orphans) {
  console.log("  cleaning up:", u.id, u.email, u.phone);
  await admin.auth.admin.deleteUser(u.id);
}

// Now scan for what trigger SHOULD pick — recompute lowest-vacant ourselves
console.log("\nrecomputing lowest vacant…");
const codes = new Set<string>();
let maxN = 0;
let p = 0;
const pageSize = 1000;
while (true) {
  const { data, error } = await admin.from("profiles").select("member_code").range(p, p + pageSize - 1);
  if (error) throw error;
  for (const r of data ?? []) {
    const mc = r.member_code as string | null;
    if (!mc) continue;
    codes.add(mc);
    const m = mc.match(/^PR(\d+)$/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > maxN) maxN = n;
    }
  }
  if ((data ?? []).length < pageSize) break;
  p += pageSize;
}
console.log(`  total codes: ${codes.size}`);
console.log(`  max PR<n>: ${maxN}`);

const vacant: number[] = [];
for (let n = 1; n <= maxN + 1 && vacant.length < 20; n++) {
  if (!codes.has(`PR${n}`)) vacant.push(n);
}
console.log(`  first 20 vacant: ${vacant.join(", ")}`);
console.log(`  PR201 ใน vacant set? ${vacant.includes(201)}`);
console.log(`  PR201 ใน codes set?  ${codes.has("PR201")}`);
