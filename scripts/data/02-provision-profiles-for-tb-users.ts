/**
 * Data 02 · Provision auth.users + profiles for every tb_users orphan
 *
 * Wave 16 follow-up A · 2026-05-23
 *
 * BACKGROUND
 *   Survey 01 found ~8,896 tb_users rows with no matching profile.member_code.
 *   Without a profile, `lib/notifications/sendNotification(profileId, ...)`
 *   cannot push LINE/email — the FK `notifications.profile_id → profiles.id`
 *   requires the row to exist. Wave 16 P0-2 `adminCallPriceUser` falls back
 *   to SMS-only because of this.
 *
 *   The task: pre-provision profiles for every orphan so notifications can
 *   fire to all 8,898 migrated PCS customers, not just the few who have
 *   signed in via the legacy bridge.
 *
 * DESIGN — Path B (createUser-via-Admin-API)
 *   profiles.id has `references auth.users(id) on delete cascade` (the strict
 *   FK from schema.sql L13). Inserting a profile without a matching auth.user
 *   would fail the FK. The supported path is supabase-auth-admin createUser()
 *   + matching profile insert, per actions/admin/pcs-migration.ts L394-450.
 *
 *   IDENTIFIER CHOICE — **synthetic email** (legacySyntheticEmail(userid)):
 *     • Guaranteed unique per userid → fully idempotent
 *     • Uses RFC-2606 `.invalid` TLD → never collides with real addresses
 *     • Does not trigger welcome/confirmation send (email_confirm:true skips it,
 *       AND `.invalid` would fail SMTP delivery anyway — defence-in-depth)
 *     • Avoids phone-uniqueness collisions: two tb_users rows can share a phone
 *       (family members). Using real phone would force per-row collision
 *       handling on every call.
 *
 *   The REAL phone + email are stored in the `profiles` row so the
 *   notification sender (and any future LINE-link flow) routes correctly. The
 *   notifications path reads `profiles.email` + `profiles.line_user_id`, not
 *   `auth.users.email`.
 *
 * BRIDGE COMPATIBILITY (lib/auth/pcs-legacy-bridge.ts)
 *   The legacy bridge today creates a fresh auth.user with the customer's real
 *   phone on first signin. After this backfill that fresh-creation would
 *   create a SECOND auth.user (different uuid) and ensureLegacyProfile() would
 *   log "manual reconcile" — the customer could sign in but `getCurrentUser`
 *   would find no profile (profile.id ≠ auth.uid()) and the protected layout
 *   would bounce.
 *
 *   FIX: lib/auth/pcs-legacy-bridge.ts is updated in the same commit to:
 *     1. After findLegacyUser, look up the pre-provisioned auth.user via
 *        synthetic email (admin.auth.admin.getUserByEmail).
 *     2. If found → updateUserById to set password = typed_password.
 *     3. signInWithPassword via { email: syntheticEmail, password }.
 *     4. ensureLegacyProfile finds the existing profile → no-op.
 *
 *   Customers who haven't been pre-provisioned (e.g. AIGA / FCL / JET letter-
 *   only handles that have no PR-form member_code) follow the old createUser
 *   path unchanged.
 *
 * IDEMPOTENCY
 *   • Skip if `profiles.member_code = userid` already exists (any path:
 *     legacy bridge, pcs-migration, or a previous run of this script).
 *   • Skip if `auth.users.email = synthetic_email` already exists (we'd have
 *     created it on a previous run — re-link a profile if missing).
 *
 * NO WELCOME EMAILS
 *   • email_confirm: true — Supabase skips the confirmation send.
 *   • Synthetic `.invalid` email — even if a stray welcome trigger fires,
 *     SMTP cannot deliver to `.invalid` (RFC 2606).
 *   • Verified: `profiles_*_trigger` (schema.sql L52, L65) only set
 *     member_code + updated_at — no email sender.
 *   • No Supabase-auth trigger / webhook is currently configured (Pacred has
 *     not wired Auth Hooks per .env.example).
 *
 * USAGE
 *   pnpm tsx scripts/data/02-provision-profiles-for-tb-users.ts                # dry-run
 *   pnpm tsx scripts/data/02-provision-profiles-for-tb-users.ts --apply        # actually provision
 *   pnpm tsx scripts/data/02-provision-profiles-for-tb-users.ts --apply --limit 100   # cap one batch
 *
 *   Re-runnable — incremental on every run. Expected total time at default
 *   batching: ~15-30 min for 8,896 rows (Supabase Admin API ~150 ms/createUser).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── ENV LOADER ─────────────────────────────────────────────────────────────
function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error(`ERROR: .env.local not found at ${envPath}`);
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [
          l.slice(0, idx).trim(),
          l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

// ─── ARG PARSE ──────────────────────────────────────────────────────────────
interface Args { apply: boolean; limit: number | null; concurrency: number; }
function parseArgs(): Args {
  const a: Args = { apply: false, limit: null, concurrency: 4 };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === "--apply") a.apply = true;
    else if (v === "--limit") a.limit = Number(process.argv[++i]);
    else if (v === "--concurrency") a.concurrency = Number(process.argv[++i]);
  }
  return a;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Synthetic email (mirrors lib/auth/pcs-legacy-password.ts:legacySyntheticEmail) */
function legacySyntheticEmail(userid: string): string {
  return `pcs-legacy-${userid.trim().toLowerCase()}@users.pacred.invalid`;
}

/** Normalize Thai phone to E.164 (mirrors lib/utils/phone:normalizePhone). */
function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s-()]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("66")) return "+" + cleaned;
  if (cleaned.startsWith("0"))  return "+66" + cleaned.slice(1);
  return "+66" + cleaned;
}
function isUsablePhone(e164: string): boolean { return /^\+66\d{8,9}$/.test(e164); }

/** Map legacy usersex → profiles.sex enum (mirrors actions/admin/pcs-migration:mapSex). */
function mapSex(legacy: string | null): "male" | "female" | "other" | null {
  if (!legacy) return null;
  const s = legacy.trim();
  if (s === "ชาย" || s === "1" || s.toLowerCase() === "male" || s === "M")    return "male";
  if (s === "หญิง" || s === "2" || s.toLowerCase() === "female" || s === "F") return "female";
  if (s === "3" || s.toLowerCase() === "other")                                return "other";
  return null;
}

/** Map legacy companycustomer '1'/'2' → freight_type enum. */
function mapFreightType(legacy: string | null): "seafreight" | "cargo" | null {
  if (legacy === "1") return "seafreight";
  if (legacy === "2") return "cargo";
  return null;
}

/** Map legacy coid → customer_group. */
function mapCustomerGroup(legacy: string | null): string {
  if (!legacy) return "PR";
  const s = legacy.trim().toUpperCase();
  if (s.startsWith("VIP")) return "vip";
  return "PR";
}

/** Strong random password (32 hex). Customer never uses it directly — bridge
 *  resets it on first login via updateUserById per the bridge update. */
function generateRandomPassword(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── TB_USERS COLUMNS WE READ ───────────────────────────────────────────────
interface TbUserRow {
  userid:           string;
  username:         string | null;
  userlastname:     string | null;
  usertel:          string | null;
  useremail:        string | null;
  userstatus:       string;
  usersex:          string | null;
  userbirthday:     string | null;
  userregistered:   string | null;
  userlastlogin:    string | null;
  coid:             string | null;
  adminid:          string | null;
  adminidsale:      string | null;
  userrecom:        string | null;
  channel:          string | null;
  companycustomer:  string | null;
  shopuser:         string | null;
  usernote:         string | null;
  useractive:       string | null;
  userlineid:       string | null;
  userfacebook:     string | null;
  userpicture:      string | null;
  usercompany:      string | null;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const env  = loadEnvLocal();
  const url  = env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`  Data 02 · Provision auth.users + profiles for tb_users orphans`);
  console.log(`  Target  : ${url}`);
  console.log(`  Mode    : ${args.apply ? "APPLY (writes)" : "DRY-RUN (no writes)"}`);
  if (args.limit) console.log(`  Limit   : ${args.limit}`);
  console.log(`  Concur. : ${args.concurrency}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  // 1) Load EVERY existing profile.member_code into a Set so we can skip
  //    orphans that already have a profile.
  const codeSet = new Set<string>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("profiles")
        .select("member_code")
        .not("member_code", "is", null)
        .range(from, from + PAGE - 1)
        .returns<{ member_code: string }[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) codeSet.add(r.member_code);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Loaded ${codeSet.size} existing profile member_codes (skip-list).\n`);

  // 2) Walk tb_users; for each orphan, queue provisioning.
  let attempted = 0, created = 0, skipped = 0, linkedExisting = 0, failed = 0;
  const errors: Array<{ userid: string; reason: string }> = [];
  const sampleCreated: Array<{ userid: string; uuid: string; channel: string }> = [];

  const PAGE = 500;
  let from = 0;
  outer: while (true) {
    const { data: rows, error } = await sb
      .from("tb_users")
      .select(
        "userid, username, userlastname, usertel, useremail, userstatus, " +
        "usersex, userbirthday, userregistered, userlastlogin, coid, " +
        "adminid, adminidsale, userrecom, channel, companycustomer, " +
        "shopuser, usernote, useractive, userlineid, userfacebook, " +
        "userpicture, usercompany"
      )
      .order("userid", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<TbUserRow[]>();
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const orphans = rows.filter((r) => !codeSet.has(r.userid));

    // Process the batch with a small concurrency pool
    let idx = 0;
    async function worker(): Promise<void> {
      while (idx < orphans.length) {
        const myIdx = idx++;
        const row = orphans[myIdx];
        attempted++;
        try {
          const outcome = await provisionOne(sb, row, args.apply);
          if (outcome.kind === "created")        { created++;        if (sampleCreated.length < 10) sampleCreated.push({ userid: row.userid, uuid: outcome.uuid, channel: outcome.channel }); }
          else if (outcome.kind === "linked")    { linkedExisting++; if (sampleCreated.length < 10) sampleCreated.push({ userid: row.userid, uuid: outcome.uuid, channel: "linked-existing-auth" }); }
          else if (outcome.kind === "skipped")   { skipped++; }
          else if (outcome.kind === "dry")       { created++; }
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ userid: row.userid, reason: msg });
        }

        if (args.limit && attempted >= args.limit) return;
      }
    }
    const workers = Array.from({ length: args.concurrency }, () => worker());
    await Promise.all(workers);

    // Progress
    console.log(
      `  …batch [${from}–${from + rows.length - 1}] · orphans=${orphans.length} ·` +
      ` created=${created} linked=${linkedExisting} skipped=${skipped} failed=${failed}`,
    );

    if (args.limit && attempted >= args.limit) break outer;
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  RESULT`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`Mode                 : ${args.apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Attempted            : ${attempted}`);
  console.log(`Created (new pair)   : ${created}`);
  console.log(`Linked (existing auth): ${linkedExisting}`);
  console.log(`Skipped              : ${skipped}`);
  console.log(`Failed               : ${failed}`);
  if (errors.length > 0) {
    console.log(`\nFirst 20 errors:`);
    for (const e of errors.slice(0, 20)) console.log(`  ${e.userid} :: ${e.reason}`);
  }
  if (sampleCreated.length > 0) {
    console.log(`\nSample of created (first 10):`);
    for (const s of sampleCreated) console.log(`  ${s.userid.padEnd(10)} → ${s.uuid} (${s.channel})`);
  }

  if (!args.apply && attempted > 0) {
    console.log(`\n▶ DRY-RUN complete. Re-run with --apply to actually provision.`);
  }
}

// ─── PROVISION ONE ──────────────────────────────────────────────────────────

type Outcome =
  | { kind: "created"; uuid: string; channel: "synthetic-email" }
  | { kind: "linked"; uuid: string }                  // existing auth, profile re-link
  | { kind: "skipped" }                                // already has profile (race)
  | { kind: "dry" };                                   // dry-run

async function provisionOne(
  sb:    SupabaseClient,
  row:   TbUserRow,
  apply: boolean,
): Promise<Outcome> {
  const userid = row.userid;
  const syntheticEmail = legacySyntheticEmail(userid);

  // 1) Final guard: profile already exists for this member_code? Skip.
  //    (catches profiles created concurrently while this script runs)
  {
    const { data: existingProfile } = await sb
      .from("profiles")
      .select("id")
      .eq("member_code", userid)
      .maybeSingle();
    if (existingProfile) return { kind: "skipped" };
  }

  if (!apply) return { kind: "dry" };

  // 2) Does an auth.user with our synthetic email already exist? (Idempotent
  //    re-run: previous run created the auth.user but failed at profile insert.)
  let authUserId: string | null = null;
  {
    // getUserByEmail is not directly exposed on listUsers — we use listUsers
    // with a filter (currently undocumented but functional via filter:"").
    // Cheaper path: try to create + on collision, fall back to lookup.
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email:         syntheticEmail,
      password:      generateRandomPassword(),
      email_confirm: true,    // skip confirmation email; .invalid would bounce anyway
      user_metadata: {
        legacy_user_id:              userid,
        first_name:                  row.username,
        last_name:                   row.userlastname,
        legacy_provisioned:          true,
        legacy_provisioned_by_backfill: true,
        backfill_source:             "scripts/data/02-provision-profiles-for-tb-users.ts",
      },
    });

    if (createErr) {
      // Most likely: synthetic email already exists from a prior run.
      // Look it up via listUsers (page-search). Cheap because it's rare.
      const lookup = await findAuthUserBySyntheticEmail(sb, syntheticEmail);
      if (!lookup) {
        // Real failure (not a collision) — surface.
        throw new Error(`createUser: ${createErr.message}`);
      }
      authUserId = lookup;
    } else {
      authUserId = created.user!.id;
    }
  }

  if (!authUserId) throw new Error("authUserId resolved null");

  // 3) Insert the profile row. Use REAL phone + email so notifications route
  //    correctly (sender reads profiles.email, not auth.users.email).
  const e164  = normalizePhone(row.usertel ?? "");
  const phone = isUsablePhone(e164) ? e164 : (row.usertel ?? null);

  const { error: profErr } = await sb.from("profiles").insert({
    id:                 authUserId,
    account_type:       row.usercompany === "1" ? "juristic" : "personal",
    member_code:        userid,                       // = tb_users.userid (PR<n>)
    first_name:         row.username ?? null,
    last_name:          row.userlastname ?? null,
    phone,
    email:              row.useremail ?? null,
    status:             row.useractive === "1" ? "active" : "incomplete",
    sex:                mapSex(row.usersex),
    birthday:           row.userbirthday ?? null,
    line_id:            row.userlineid ?? null,
    facebook_url:       row.userfacebook ?? null,
    customer_group:     mapCustomerGroup(row.coid),
    freight_type:       mapFreightType(row.companycustomer),
    shop_user:          row.shopuser === "1",
    sales_admin_id:     row.adminidsale ?? null,
    admin_id:           row.adminid ?? null,
    recommended_by:     row.userrecom ?? null,
    referral_channel:   row.channel ?? null,
    note:               row.usernote ?? null,
    is_active:          row.useractive === "1",
    register_with:      "email",                       // closest to legacy
    last_login_at:      row.userlastlogin ?? null,
    migrated_from_pcs:  true,
    legacy_pcs_user_id: userid,
  });

  if (profErr) {
    // Profile insert failed — don't leave a dangling auth.user (idempotent
    // re-run will re-create cleanly).
    await sb.auth.admin.deleteUser(authUserId).catch(() => {});
    throw new Error(`profile insert: ${profErr.message}`);
  }

  return { kind: "created", uuid: authUserId, channel: "synthetic-email" };
}

/** Find an existing auth.user by exact email match. Used on idempotent re-runs
 *  where the synthetic email already exists from a previous (interrupted) run.
 *  listUsers paginates — cap at 100 pages × 1000 = 100k users (well past
 *  Pacred's needs). */
async function findAuthUserBySyntheticEmail(
  sb:    SupabaseClient,
  email: string,
): Promise<string | null> {
  // The Supabase admin API doesn't expose a getUserByEmail() helper, but
  // listUsers({ filter }) accepts a partial filter. We page through and
  // match exactly. For 9k users in 9 pages this is bounded.
  const PER = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PER });
    if (error) throw error;
    if (!data?.users?.length) return null;
    for (const u of data.users) {
      if (u.email && u.email.toLowerCase() === email.toLowerCase()) return u.id;
    }
    if (data.users.length < PER) return null;
  }
  return null;
}

main().catch((e) => { console.error(e); process.exit(1); });
