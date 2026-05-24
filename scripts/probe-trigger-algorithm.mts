/**
 * Probe what algorithm the generate_member_code trigger is actually running.
 *
 * Method: do 5 successive INSERTs and observe what codes get assigned.
 *
 * Expected if lowest-vacant scanner works:  PR10, PR11, PR12, PR13, PR14
 *   (or whichever the lowest vacant slots are; client-side scan said PR10+)
 * Expected if simple max+1:                 PR10904, PR10905, ...
 * Expected if broken-retry-after-skip:      PR201, PR202, ... (current behavior)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log("target:", url);

const createdIds: string[] = [];

try {
  for (let i = 0; i < 5; i++) {
    const phone = `669999${(Date.now() + i).toString().slice(-6)}`;
    const email = `probe-${Date.now()}-${i}@test.pacred.invalid`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      phone,
      email,
      password: "Probe-Throwaway-2026",
      phone_confirm: true,
      email_confirm: true,
    });
    if (cErr || !created.user) {
      console.error(`[${i}] createUser failed:`, cErr);
      break;
    }
    createdIds.push(created.user.id);

    const { error: iErr } = await admin.from("profiles").insert({
      id:           created.user.id,
      account_type: "personal",
      first_name:   `Probe${i}`,
      last_name:    "Test",
      phone,
      email:        null,
      services:     [],
      status:       "active",
    });
    if (iErr) {
      console.error(`[${i}] insert failed: code=${iErr.code} msg=${iErr.message} details=${iErr.details}`);
      // Continue — we want to see all 5 results
    } else {
      const { data: row } = await admin
        .from("profiles")
        .select("member_code")
        .eq("id", created.user.id)
        .maybeSingle();
      console.log(`[${i}] assigned: ${row?.member_code}`);
    }
  }
} finally {
  console.log("\nCleanup…");
  for (const id of createdIds) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`  cleaned ${createdIds.length} test users`);
}
