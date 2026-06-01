#!/usr/bin/env -S node
/**
 * provision-admins-2026-06-02.mjs — create/ensure the 15 Pacred admins + the
 * `admin_center` routing bucket, FLEXIBLE login (phone + email + member-code),
 * password '123456'.
 *
 *   DRY-RUN (default):  tsx scripts/provision-admins-2026-06-02.mjs
 *   APPLY:              tsx scripts/provision-admins-2026-06-02.mjs --apply
 *
 * For EACH of the 15 (mirrors actions/admin/admins.ts:adminCreateNew exactly):
 *   1. auth.admin.createUser({ phone:E.164, email:admin_xxx@pacred.co.th,
 *        password:'123456', phone_confirm:true, email_confirm:true }) → uid
 *      → so phone OR email OR member-code all sign in.
 *   2. profiles INSERT  (id=uid, member_code auto by trigger, status='active', is_active=true)
 *   3. admins UPSERT    (profile_id, role='super', is_active=true)         [onConflict profile_id,role]
 *   4. admin_contact_extras UPSERT (profile_id, legacy_admin_id=admin_xxx) [the customer→rep bridge]
 *   5. tb_admin UPSERT  (adminID=admin_xxx clean, name/nick/tel/email, adminStatusA='1',
 *        adminStatusSale='1' ONLY for admin_pee + admin_may, adminPass=passTam('123456'))
 *
 * admin_center: tb_admin-only routing bucket (adminStatusSale='' → not in the
 *   round-robin pool, but a valid adminIDSale target with a resolvable name).
 *   It gets NO auth/profiles/admins row — it is not a login, and a `super`
 *   admins row would wrongly add it to pickLeastLoadedSalesRep candidacy.
 *
 * IDEMPOTENT: the 3 already on prod (PR132 ป๊อบ / PR112 เดฟ / PR009 ภูม) are
 *   detected by phone/email and UPDATED in place (ensure admins.super +
 *   admin_contact_extras.legacy_admin_id + tb_admin), never recreated.
 *   Re-running the whole script is safe (upserts + existence checks).
 *
 * Rollback-safe: on a step ≥2 failure for a NEW admin, the freshly-created
 *   auth user is deleted so the next run starts clean (mirrors adminCreateNew).
 *
 * Verified prod state used by the dry-run plan (2026-06-02): tb_admin had 13
 *   legacy rows; admins had 3 super rows; admin_contact_extras was empty.
 */

import {
  loadEnv,
  makeClient,
  ADMINS,
  CENTER,
  passTam,
} from "./_admin-roster-2026-06-02.mjs";

const APPLY = process.argv.includes("--apply");
const PASSWORD = "123456";
const LEGACY_PASS = passTam(PASSWORD);

const c = (s) => s; // (placeholder for optional color; keep plain for log files)
function log(...a) {
  console.log(...a);
}
function section(title) {
  console.log("\n" + "─".repeat(74));
  console.log(title);
  console.log("─".repeat(74));
}

async function main() {
  const env = loadEnv();
  const db = makeClient(env);

  section(`provision-admins-2026-06-02  ${APPLY ? "⚙️  APPLY" : "🔍 DRY-RUN (no writes)"}`);
  log(`target  : ${env.URL}`);
  log(`env file: ${env.envPath}`);
  log(`roster  : ${ADMINS.length} admins + 1 central (admin_center)`);
  log(`password: '${PASSWORD}' for all (Supabase auth; tb_admin.adminPass=passTam)`);
  log(`sales (round-robin): ${ADMINS.filter((a) => a.isSales).map((a) => a.username).join(", ")}`);

  // ── Pre-scan prod so the dry-run plan is accurate (read-only) ──
  section("Pre-scan (read-only)");
  const authUsers = await db.authListAllUsers();
  // ⚠️ Detect existing admins ONLY by the synthetic email (the unique,
  // collision-proof key) — NEVER by phone. Several roster phones collide
  // with EXISTING CUSTOMER auth.users (verified on prod 2026-06-02:
  // +66921313786→PR10901 TEST, +66944798231→PR130, +66941178515→PR147,
  // +66626034456→PR114). Matching by phone would "ensure" against a
  // customer's account → grant them super + overwrite their profile.
  // The phone map below is built ONLY to WARN about such collisions.
  const authByEmail = new Map();
  const authByPhone = new Map();
  for (const u of authUsers) {
    if (u.email) authByEmail.set(u.email.toLowerCase(), u);
    if (u.phone) authByPhone.set(normPhoneKey(u.phone), u);
  }
  log(`auth.users on prod        : ${authUsers.length}`);

  const { rows: existingTbAdmin } = await db.rest(
    `tb_admin?select=adminID,adminNickname,adminStatusSale,adminTel`,
  );
  const tbAdminIds = new Set(existingTbAdmin.map((r) => r.adminID));
  log(`tb_admin rows on prod     : ${existingTbAdmin.length}`);

  const { rows: existingExtras } = await db.rest(
    `admin_contact_extras?select=profile_id,legacy_admin_id`,
  );
  const extrasByLegacy = new Map(
    existingExtras.filter((e) => e.legacy_admin_id).map((e) => [e.legacy_admin_id, e]),
  );
  log(`admin_contact_extras rows : ${existingExtras.length}`);

  // ── Plan + (optionally) execute per admin ──
  const summary = { created: 0, ensured: 0, tbAdminUpsert: 0, errors: 0 };

  for (const a of ADMINS) {
    section(`${a.username}  —  ${a.person} (${a.nick})  role=${a.role}${a.isSales ? "  ⭐ SALES" : ""}`);
    log(`login keys : phone ${a.phone}  ·  email ${a.email}  ·  member-code (auto PR…)`);

    // Detect an existing admin ONLY by the synthetic email (collision-proof).
    // NEVER by phone — a customer may already own this phone.
    const existingAuth = authByEmail.get(a.email.toLowerCase()) ?? null;

    // For the 3 known existing admins (a.exists set), resolve their uid via
    // member_code so we ensure THEIR profile, not a phone-colliding customer's.
    let existingByCode = null;
    if (!existingAuth && a.exists) {
      const { rows } = await db.rest(`profiles?select=id,phone,email&member_code=eq.${a.exists}`);
      existingByCode = rows[0] ?? null;
    }
    const isExisting = Boolean(existingAuth) || Boolean(existingByCode);

    // Phone-collision = the phone is held by an auth.user that is NOT this
    // admin's own resolved account. (When the admin already exists and owns
    // the phone on their own auth row, that's not a collision — even if their
    // legacy auth row has a null email so the email-map didn't match it.)
    const resolvedUid = existingAuth?.id ?? existingByCode?.id ?? null;
    const phoneOwner = authByPhone.get(normPhoneKey(a.phone));
    const phoneCollides = Boolean(phoneOwner) && phoneOwner.id !== resolvedUid;

    if (isExisting) {
      const uid = existingAuth?.id ?? existingByCode?.id;
      log(`STATUS     : EXISTS → ensure (no recreate)  uid=${uid}` + (a.exists ? `  member_code=${a.exists}` : ""));
    } else {
      log(`STATUS     : NEW → will create auth + profiles + admins + extras`);
    }
    if (phoneCollides) {
      log(`  ⚠ PHONE COLLISION: ${a.phone} is already held by a DIFFERENT auth.user (uid=${phoneOwner.id}).`);
      log(`    → admin will be created/ensured with email-only login; phone login for this number resolves to the other account.`);
      log(`    → owner should reconcile (rename the customer's phone or pick a different staff phone).`);
    }

    if (!APPLY) {
      // Dry-run: print the exact plan.
      log("PLAN:");
      if (!isExisting) {
        const createPhone = phoneCollides ? "(omit — collision)" : a.phone;
        log(`  1. auth.createUser  phone=${createPhone} email=${a.email} password='${PASSWORD}' (phone_confirm+email_confirm)`);
        log(`  2. profiles INSERT  id=<uid> first_name=${a.nameFirst} last_name=${a.nameLast} phone=${phoneCollides ? "(omit — collision)" : a.phone} status=active`);
      } else {
        log(`  1. auth.createUser  SKIP (exists)`);
        log(`  2. profiles ENSURE  status=active is_active=true` + (phoneCollides ? " (phone left as-is — collision)" : " · ensure phone/email present"));
      }
      log(`  3. admins UPSERT    role=${a.role} is_active=true  (onConflict profile_id,role)`);
      log(`  4. extras UPSERT    legacy_admin_id=${a.username}` + (extrasByLegacy.has(a.username) ? "  (already present)" : ""));
      log(
        `  5. tb_admin UPSERT  adminID=${a.username} name="${a.nameFirst} ${a.nameLast}" nick=${a.nick} tel=${a.phoneDigits} ` +
          `adminStatusA=1 adminStatusSale=${a.isSales ? "1" : "''"} adminPass=passTam('${PASSWORD}')` +
          (tbAdminIds.has(a.username) ? "  (row exists → update)" : "  (new row)"),
      );
      continue;
    }

    // ── APPLY ──
    try {
      // uid resolved ONLY from email-match or member-code (never phone).
      let uid = existingAuth?.id ?? existingByCode?.id ?? null;
      if (uid && existingByCode && !existingAuth) {
        log(`  ↪ resolved existing uid via member_code ${a.exists}: ${uid}`);
      }

      let createdAuthThisRun = false;
      if (!uid) {
        // 1. create auth user. Include phone ONLY when it doesn't collide with
        // a customer's auth.users row — else create email-only (admin still
        // logs in via email + member-code). Belt-and-braces: if a create with
        // phone still fails on uniqueness (race), retry without the phone.
        const basePayload = {
          email: a.email,
          password: PASSWORD,
          phone_confirm: true,
          email_confirm: true,
          user_metadata: {
            first_name: a.nameFirst,
            last_name: a.nameLast,
            provisioned_via: "provision-admins-2026-06-02",
            provisioned_at: new Date().toISOString(),
            legacy_admin_id: a.username,
          },
        };
        let created;
        if (phoneCollides) {
          created = await db.authCreateUser(basePayload);
          log(`  1. auth.createUser  OK (email-only — phone collision)  uid=${created.id}`);
        } else {
          try {
            created = await db.authCreateUser({ ...basePayload, phone: a.phone });
            log(`  1. auth.createUser  OK  uid=${created.id}`);
          } catch (e) {
            if (/phone|already|registered|duplicate/i.test(e.message)) {
              created = await db.authCreateUser(basePayload);
              log(`  1. auth.createUser  OK (email-only — phone rejected: ${e.message})  uid=${created.id}`);
            } else {
              throw e;
            }
          }
        }
        uid = created.id;
        createdAuthThisRun = true;
      } else {
        log(`  1. auth.createUser  SKIP (uid=${uid})`);
      }

      try {
        // 2. profiles (insert if missing; ensure active + phone/email present)
        const { rows: profRows } = await db.rest(`profiles?select=id&id=eq.${uid}`);
        if (profRows.length === 0) {
          await db.restWrite("POST", "profiles", {
            id: uid,
            email: a.email,
            first_name: a.nameFirst,
            last_name: a.nameLast,
            // omit phone when a customer already holds it (avoid profiles.phone
            // unique-ish confusion); the admin logs in via email + member-code.
            phone: phoneCollides ? null : a.phone,
            account_type: "personal",
            status: "active",
            is_active: true,
            register_with: "email",
          });
          log(`  2. profiles INSERT  OK${phoneCollides ? " (phone omitted — collision)" : ""}`);
        } else {
          await db.restWrite("PATCH", `profiles?id=eq.${uid}`, {
            status: "active",
            is_active: true,
          });
          log(`  2. profiles ENSURE  OK (status=active)`);
        }

        // 3. admins role grant (UPSERT — idempotent)
        await db.restWrite(
          "POST",
          "admins?on_conflict=profile_id,role",
          {
            profile_id: uid,
            role: a.role,
            is_active: true,
            granted_at: new Date().toISOString(),
          },
          { prefer: "resolution=merge-duplicates,return=minimal" },
        );
        log(`  3. admins UPSERT    OK  role=${a.role}`);

        // 4. admin_contact_extras — the customer→rep bridge (legacy_admin_id).
        //    UPSERT on profile_id (one extras row per admin).
        await db.restWrite(
          "POST",
          "admin_contact_extras?on_conflict=profile_id",
          {
            profile_id: uid,
            display_name: a.nick,
            nickname: a.nick,
            company: "pacred",
            employee_type: "full_time",
            legacy_admin_id: a.username,
          },
          { prefer: "resolution=merge-duplicates,return=minimal" },
        );
        log(`  4. extras UPSERT    OK  legacy_admin_id=${a.username}`);

        // 5. tb_admin upsert (clean adminID; sales flag; legacy hash).
        await upsertTbAdmin(db, {
          adminID: a.username,
          adminName: a.nameFirst,
          adminLastName: a.nameLast,
          adminNickname: a.nick,
          adminTel: a.phoneDigits,
          adminEmail: a.email,
          adminStatusSale: a.isSales ? "1" : "",
          isNew: !tbAdminIds.has(a.username),
        });
        log(`  5. tb_admin UPSERT  OK  adminStatusSale=${a.isSales ? "1" : "''"}`);

        summary.tbAdminUpsert++;
        if (createdAuthThisRun) summary.created++;
        else summary.ensured++;
      } catch (stepErr) {
        // Rollback the freshly-created auth user so the next run is clean.
        if (createdAuthThisRun && uid) {
          log(`  ⚠ rolling back auth.user ${uid} after failure: ${stepErr.message}`);
          await db.authDeleteUser(uid).catch((e) =>
            log(`  ⚠ rollback deleteUser failed: ${e.message}`),
          );
        }
        throw stepErr;
      }
    } catch (e) {
      summary.errors++;
      console.error(`  ✗ ${a.username} FAILED: ${e.message}`);
    }
  }

  // ── admin_center (tb_admin-only bucket) ──
  section(`${CENTER.username}  —  ${CENTER.nick}  (routing bucket · NOT a login · NOT in round-robin)`);
  if (!APPLY) {
    log("PLAN:");
    log(`  • tb_admin UPSERT  adminID=${CENTER.username} nick=${CENTER.nick} tel=${CENTER.phoneDigits} adminStatusA=1 adminStatusSale='' (excluded from pool)` + (tbAdminIds.has(CENTER.username) ? "  (exists → update)" : "  (new row)"));
    log(`  • NO auth / profiles / admins row (a 'super' admins row would wrongly add it to the round-robin candidates)`);
  } else {
    try {
      await upsertTbAdmin(db, {
        adminID: CENTER.username,
        adminName: CENTER.nameFirst,
        adminLastName: CENTER.nameLast,
        adminNickname: CENTER.nick,
        adminTel: CENTER.phoneDigits,
        adminEmail: CENTER.email,
        adminStatusSale: "", // never in the round-robin pool
        isNew: !tbAdminIds.has(CENTER.username),
      });
      log(`  ✓ tb_admin UPSERT  OK  adminID=${CENTER.username} adminStatusSale='' (valid assign target, excluded from pool)`);
      summary.tbAdminUpsert++;
    } catch (e) {
      summary.errors++;
      console.error(`  ✗ admin_center FAILED: ${e.message}`);
    }
  }

  // ── Summary ──
  section("Summary");
  if (!APPLY) {
    // NEW = no synthetic-email auth row AND not one of the 3 known existing.
    const newCount = ADMINS.filter(
      (a) => !(authByEmail.has(a.email.toLowerCase()) || a.exists),
    ).length;
    // Recompute resolved uid per admin (email-match → member-code) to drop
    // own-phone false-positives. member-code lookups need a round-trip, so do
    // it once here for the roll-up.
    const collisions = [];
    for (const a of ADMINS) {
      const eAuth = authByEmail.get(a.email.toLowerCase());
      let rUid = eAuth?.id ?? null;
      if (!rUid && a.exists) {
        const { rows } = await db.rest(`profiles?select=id&member_code=eq.${a.exists}`);
        rUid = rows[0]?.id ?? null;
      }
      const owner = authByPhone.get(normPhoneKey(a.phone));
      if (owner && owner.id !== rUid) collisions.push(a);
    }
    log(`DRY-RUN — nothing written.`);
    log(`  would CREATE (new auth+profiles+admins+extras): ${newCount}`);
    log(`  would ENSURE (existing — matched by email/member-code): ${ADMINS.length - newCount}`);
    log(`  would UPSERT tb_admin rows                     : ${ADMINS.length + 1} (15 + admin_center)`);
    if (collisions.length) {
      log(`  ⚠ PHONE COLLISIONS (created email-only · owner must reconcile): ${collisions.map((a) => `${a.username}(${a.phone})`).join(", ")}`);
    }
    log(`\nRun with --apply to execute.`);
  } else {
    log(`created : ${summary.created}`);
    log(`ensured : ${summary.ensured}`);
    log(`tb_admin upserted : ${summary.tbAdminUpsert}`);
    log(`errors  : ${summary.errors}`);
  }

  if (summary.errors > 0) process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// tb_admin upsert — camelCase-quoted columns. Fills every NOT NULL column.
// PostgREST upsert: POST with Prefer resolution=merge-duplicates on adminID.
// NOT NULL set (from 0081 schema): adminID, adminStatusA, adminPass, adminName,
//   adminLastName, adminEmail, adminEmailOrg, adminStatus, adminStatusSale,
//   adminPicture, adminTel, adminType, department, section, companyType,
//   adminDel, adminNickname, adminTMP, adminTelOrg, salaryType, adminIDCreate,
//   nationalIDCard, salary, statusResetPass, nationalIDCardFile,
//   copyHouseRegistrationFile, resumeFile, religion, nationality,
//   maritalStatus, adminLineTokenNotify, bearer_token.
// ─────────────────────────────────────────────────────────────
async function upsertTbAdmin(db, f) {
  const nowIso = new Date().toISOString();
  const row = {
    adminID: f.adminID,
    adminStatusA: "1", // active
    adminPass: LEGACY_PASS, // passTam('123456') — login uses Supabase auth; this is for legacy parity
    adminName: f.adminName,
    adminLastName: f.adminLastName,
    adminEmail: f.adminEmail,
    adminEmailOrg: 0,
    adminStatus: "", // legacy "สิทธิ์การเข้าถึงข้อมูล" — empty (Pacred RBAC lives in admins.role)
    adminStatusSale: f.adminStatusSale, // '1' for sales reps, '' otherwise
    adminPicture: "user.jpg",
    adminRegistered: nowIso,
    adminTel: f.adminTel,
    adminType: "1", // full-time employee
    department: "0",
    section: "0",
    companyType: "1", // Cargo (default — no work-type segregation per owner)
    adminDel: "", // '' = not deleted
    adminNickname: f.adminNickname,
    adminTMP: "0", // not temporarily paused
    adminTelOrg: 0,
    salaryType: "2",
    adminIDCreate: "admin_dev", // provisioned by the overhaul (lead)
    nationalIDCard: "",
    salary: 0,
    statusResetPass: "0",
    nationalIDCardFile: "",
    copyHouseRegistrationFile: "",
    resumeFile: "",
    religion: "",
    nationality: "",
    maritalStatus: "",
    adminLineTokenNotify: "",
    bearer_token: "",
  };
  // On update of an existing row, don't overwrite adminRegistered.
  if (!f.isNew) delete row.adminRegistered;

  await db.restWrite(
    "POST",
    "tb_admin?on_conflict=adminID",
    row,
    { prefer: "resolution=merge-duplicates,return=minimal" },
  );
}

/** Normalize a phone to a comparable key (strip non-digits, drop leading 66/0). */
function normPhoneKey(p) {
  let d = String(p).replace(/\D/g, "");
  if (d.startsWith("66")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d;
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
