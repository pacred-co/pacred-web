/**
 * Shared admin roster + env/client helpers for the 2026-06-02 prod-auth overhaul.
 *
 * Consumed by:
 *   - scripts/provision-admins-2026-06-02.mjs   (create the 15 + admin_center)
 *   - scripts/reset-clear-admins-2026-06-02.mjs (reset adminIDSale + delete OLD admins)
 *
 * Source of truth for the roster:
 *   - docs/setup/staff-admin-provisioning-2026-06-02.md  (15 admins · roles · phones)
 *   - components/seo/site.ts  STAFF constant                (the 7 "TBD" phones)
 *
 * Login model (verified actions/auth.ts + lib/auth/require-admin.ts):
 *   Supabase auth (phone OR email OR member-code) + password → admins.profile_id check.
 *   We provision each admin with BOTH a phone (E.164) AND a synthetic
 *   admin_xxx@pacred.co.th email so phone + email + member-code all log in.
 *   Password = '123456' for everyone (owner directive — users rotate after).
 *
 * tb_admin landmine (verified on prod 2026-06-02): tb_admin + tb_users columns
 * are camelCase-quoted (adminID, adminStatusSale, adminIDSale). The three
 * sales-ref tables are LOWERCASE (tb_sales_report.sradminidsale,
 * tb_user_sales_admin_pay.admincreate, tb_org_tell_ships.adminid).
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────
// env + REST helpers (no SDK — pure PostgREST + GoTrue admin API)
// ─────────────────────────────────────────────────────────────

/**
 * Resolve .env.local. It's gitignored, so a `git worktree` checkout (where this
 * script may run) does NOT carry it — fall back to the repo root above the
 * `.claude/worktrees/<name>/` dir. Pass --env=/abs/path to override.
 */
function resolveEnvPath() {
  const cliArg = process.argv.find((a) => a.startsWith("--env="));
  if (cliArg) return cliArg.slice("--env=".length);

  const here = fileURLToPath(new URL(".", import.meta.url)); // .../scripts/
  const candidates = [
    new URL("../.env.local", import.meta.url).pathname, // sibling of scripts/ (normal checkout)
    // worktree: .../<repo>/.claude/worktrees/<name>/scripts/ → repo root is 4 up from scripts/
    here.replace(/\.claude\/worktrees\/[^/]+\/scripts\/?$/, ".env.local"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  // last resort: return the normal-checkout path so the error message is useful
  return candidates[0];
}

export function loadEnv() {
  const path = resolveEnvPath();
  if (!existsSync(path)) {
    throw new Error(
      `Cannot find .env.local at ${path}. Run from the repo root or pass --env=/abs/path/.env.local`,
    );
  }
  const raw = readFileSync(path, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !SERVICE) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return { URL: URL_, SERVICE, envPath: path };
}

export function makeClient({ URL, SERVICE }) {
  const restHeaders = (extra = {}) => ({
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
    ...extra,
  });

  /** PostgREST GET → parsed JSON rows (throws on HTTP error). */
  async function rest(path, { headers = {} } = {}) {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: restHeaders(headers) });
    const text = await r.text();
    if (r.status >= 300) {
      throw new Error(`GET ${path} → ${r.status}: ${text.slice(0, 300)}`);
    }
    return { rows: text ? JSON.parse(text) : [], range: r.headers.get("content-range") };
  }

  /** Count-only GET (HEAD with count=exact) → total integer. */
  async function count(path) {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      method: "HEAD",
      headers: restHeaders({ Prefer: "count=exact" }),
    });
    const cr = r.headers.get("content-range"); // "0-24/8890" or "*/0"
    if (!cr) return null;
    const total = cr.split("/")[1];
    return total === "*" ? 0 : Number(total);
  }

  /** PostgREST write (POST/PATCH/DELETE) → parsed JSON (throws on HTTP error). */
  async function restWrite(method, path, body, { prefer = "return=representation" } = {}) {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      method,
      headers: restHeaders({ Prefer: prefer }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (r.status >= 300) {
      throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  /** GoTrue admin: create a user. Returns the created user object. */
  async function authCreateUser(payload) {
    const r = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: restHeaders(),
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    if (r.status >= 300) {
      throw new Error(`auth.createUser → ${r.status}: ${text.slice(0, 400)}`);
    }
    return JSON.parse(text);
  }

  /** GoTrue admin: delete a user by uid (404 = already gone, treated as success). */
  async function authDeleteUser(uid) {
    const r = await fetch(`${URL}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: restHeaders(),
    });
    if (r.status >= 300 && r.status !== 404) {
      const text = await r.text();
      throw new Error(`auth.deleteUser(${uid}) → ${r.status}: ${text.slice(0, 300)}`);
    }
  }

  /** GoTrue admin: list users (one page). */
  async function authListUsers(page = 1, perPage = 200) {
    const r = await fetch(`${URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: restHeaders(),
    });
    const text = await r.text();
    if (r.status >= 300) {
      throw new Error(`auth.listUsers → ${r.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  }

  /** GoTrue admin: list ALL users (paged through). */
  async function authListAllUsers() {
    const all = [];
    for (let page = 1; page <= 200; page++) {
      const res = await authListUsers(page, 200);
      const users = res.users ?? res ?? [];
      if (!users.length) break;
      all.push(...users);
      if (users.length < 200) break;
    }
    return all;
  }

  return { URL, rest, count, restWrite, authCreateUser, authDeleteUser, authListUsers, authListAllUsers };
}

// ─────────────────────────────────────────────────────────────
// legacy pass_tam() — for tb_admin.adminPass of '123456'
// (login uses Supabase auth; this is set for completeness / legacy parity)
// mirror of lib/auth/pcs-legacy-password.ts
// ─────────────────────────────────────────────────────────────
function md5(s) {
  return createHash("md5").update(s, "utf8").digest("hex");
}
export function passTam(plaintext) {
  const a = md5(plaintext);
  const b = a.slice(0, 15);
  const c = md5(b);
  const d = a.split("").reverse().join("");
  return d + b + c;
}

// ─────────────────────────────────────────────────────────────
// The roster — 15 admins + 1 central routing bucket.
//
// phone   : E.164 +66… (Supabase auth phone + tb_admin.adminTel source)
// person  : Thai display name
// nick    : tb_admin.adminNickname
// nameFirst/nameLast : tb_admin.adminName / adminLastName
// isSales : owner directive — ONLY admin_pee + admin_may rotate in the
//           register round-robin → tb_admin.adminStatusSale='1'.
// exists  : the 3 already on prod (PR132/PR112/PR009) — ensure, never recreate.
//
// Email is SYNTHETIC admin_xxx@pacred.co.th (a login key — NOT a mailbox).
// Phones: roster doc values where present; STAFF constant for the 7 "TBD".
// ─────────────────────────────────────────────────────────────
const ROSTER = [
  // username        phone(E.164)        person      nick     first         last               isSales exists
  ["admin_pop",   "+66948782006", "พี่ป๊อป", "ป๊อบ",  "วิสิฐ",      "ศิลปเลิศลักษณ์",  false, "PR132"],
  ["admin_dev",   "+66991921177", "เดฟ",     "เดฟ",   "Tadsakorn",  "Nutteesri",       false, "PR112"],
  ["admin_poom",  "+66921313786", "ภูมิ",    "ภูมิ",  "Pasit",      "Pappornpisit",    false, "PR009"],
  ["admin_pond",  "+66958612835", "ปอน",     "ปอนด์", "ชูเกียรติ",  "ศรีเพ็ชร",        false, null],
  ["admin_got",   "+66944798231", "กอต",     "กอต",   "กอต",        "Pacred",          false, null],
  ["admin_win",   "+66627020448", "วิน",     "วิน",   "วัธนพงษ์",   "จันทเพชร",        false, null],
  ["admin_nat",   "+66941178515", "พี่แนท",  "แนต",   "วันดี",      "พริกใย",          false, null],
  ["admin_vam",   "+66661314733", "แวม",     "แวม",   "แวม",        "Pacred",          false, null],
  ["admin_web",   "+66626028456", "เว็บ",    "เว็บ",  "จตุพร",      "ปานพลอย",         false, null],
  ["admin_jane",  "+66811609304", "เจน",     "เจน",   "จุฑามณี",    "จุดอน",           false, null],
  ["admin_aom",   "+66632102537", "ออม",     "ออม",   "สรวิชญ์",    "กัวศรีนนท์",      false, null],
  ["admin_may",   "+66661253006", "เมย์",    "เมย์",  "เมย์",       "Pacred",          true,  null],
  ["admin_pee",   "+66617799299", "พี",      "พี",    "พีรชัย",     "ชื่นเปรื่อง",     true,  null],
  ["admin_ploy",  "+66626034456", "พลอย",    "พลอย",  "ขวัญเรือน",  "บัวหลาง",         false, null],
  ["admin_gring", "+66800588746", "กริ้ง",   "กริ๊ง", "อมินตรา",    "ไกรกิตติวุฒิ",    false, null],
];

export const ADMINS = ROSTER.map(
  ([username, phone, person, nick, nameFirst, nameLast, isSales, exists]) => ({
    username,
    phone, // E.164
    phoneDigits: phone.replace(/^\+66/, "0").replace(/\D/g, ""), // 0XXXXXXXXX for tb_admin.adminTel
    person,
    nick,
    nameFirst,
    nameLast,
    isSales,
    exists, // member_code of the existing prod row, or null
    email: `${username}@pacred.co.th`, // synthetic login key
    role: "super", // owner directive — all super for now
  }),
);

/**
 * The central routing bucket. NOT a login. NOT in the round-robin pool.
 * It only needs a tb_admin row so sales-rep-contact.ts can resolve the
 * name/phone for the 8,890 customers reset to adminIDSale='admin_center'.
 * adminStatusSale='' → never enters pickLeastLoadedSalesRep candidacy.
 */
export const CENTER = {
  username: "admin_center",
  nick: "เซลส่วนกลาง",
  nameFirst: "เซลส่วนกลาง",
  nameLast: "Pacred",
  phone: "+6624213325", // Pacred company main line 02-421-3325 (central · unique adminTel · tb_admin-only, no auth)
  phoneDigits: "0224213325",
  email: "admin_center@pacred.co.th",
};

/** The clean adminID set we KEEP (15 roster + central). Everything else in tb_admin is OLD. */
export const KEEP_ADMIN_IDS = new Set([...ADMINS.map((a) => a.username), CENTER.username]);
