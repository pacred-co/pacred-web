import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * แปลงรหัสเซล (`tb_users.adminIDSale` เช่น "admin_center") → ชื่อคน (owner 2026-08-05
 * "หน้าอื่นๆ ยังขึ้นบัคเป็นรหัส uid sales · แสดงผลหยาบจัด"). batch ทีเดียวสำหรับ
 * หน้า list — เร็วกว่า resolve ทีละ userid (sales-rep-contact.ts เหมาะ 1 คน).
 *
 * source = tb_admin (แหล่งเดียวข้อมูลพนักงาน · mig 0292) → ชื่อเล่นถ้ามี ไม่งั้น
 * ชื่อ-นามสกุล · fallback = รหัสเดิม (ไม่หายไปเฉยๆ).
 */
export async function resolveSaleRepNameMap(
  codes: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(codes.map((c) => (c ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID,adminName,adminLastName,adminNickname")
    .in("adminID", uniq);
  if (error) {
    console.error("[sale-rep-names] resolve failed", { code: error.code, message: error.message });
    return out; // fail-soft: ปล่อยให้ caller ใช้รหัสเดิม (ไม่ล้มทั้งหน้า)
  }
  for (const a of (data ?? []) as {
    adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null;
  }[]) {
    const nn = (a.adminNickname ?? "").trim();
    const full = [a.adminName, a.adminLastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
    out.set(a.adminID, nn || full || a.adminID);
  }
  return out;
}

/** ป้ายแสดงเซล: ชื่อคน (fallback รหัส) · "—" ถ้าไม่มี. ใช้กับ map ที่ resolve แล้ว */
export function saleRepLabel(code: string | null | undefined, map: Map<string, string>): string {
  const c = (code ?? "").trim();
  if (!c) return "—";
  return map.get(c) ?? c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ชื่อพนักงานทั้งระบบ (owner 2026-08-06 "id uid พนักงานยังมีบัคเต็มอยู่เลย ทุกคนหนะครับ
 * ... เอาชื่อเล่นให้เหมือนกันไปเลยก็ได้") — จอไหนก็ตามที่เคยพ่นรหัสดิบ (admin_may /
 * sys-live / uuid) ให้ resolve ผ่านตัวนี้ แล้วโชว์ **ชื่อเล่น** เป็นมาตรฐานเดียวกัน.
 *
 * รหัสพนักงานในระบบมี 4 ทรง (mig 0292 · spine = tb_admin.adminID == profiles.admin_login_id):
 *   1. legacy login-id  `admin_may`            → tb_admin.adminID
 *   2. member_code      `AD020` / `PR321`      → profiles.member_code (คนขับ fdadminid ใช้ทรงนี้)
 *   3. profiles.id เต็ม `uuid 36 ตัว`          → profiles.id  (เช่น committed_by)
 *   4. profiles.id ตัดสั้น 20 ตัว              → prefix-match (เช่น uploaded_by · adminidpurchaser)
 * ────────────────────────────────────────────────────────────────────────── */

/** token ที่ระบบ/cron เขียนเอง — ไม่ใช่คน → โชว์ "ระบบ" ไม่ใช่ token ดิบ */
const SYSTEM_ACTOR_TOKENS = new Set([
  "system", "sys", "sys-live", "cron", "auto", "bot", "robot",
  "momo", "momo-cron", "migration", "seed", "-",
]);

/** true = token นี้คือระบบ/cron ไม่ใช่พนักงาน */
export function isSystemActor(code: string | null | undefined): boolean {
  return SYSTEM_ACTOR_TOKENS.has((code ?? "").trim().toLowerCase());
}

const UUID_HEAD = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const MEMBER_CODE = /^(AD|PR)\d{2,}$/i;

/** uuid เต็ม 36 ตัว */
function isFullUuid(s: string) { return UUID_HEAD.test(s) && s.length === 36; }
/** uuid ตัดสั้น (ขึ้นต้นเหมือน uuid แต่ไม่ครบ 36) */
function isTruncatedUuid(s: string) { return UUID_HEAD.test(s) && s.length < 36; }

type AdminRow = {
  adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null;
};
/** ชื่อเล่นก่อนเสมอ → ชื่อจริง → รหัส (มาตรฐานเดียวทั้งระบบ) */
function pickName(nick: string | null, first: string | null, last: string | null, fallback: string) {
  const nn = (nick ?? "").trim();
  if (nn) return nn;
  const full = [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return full || fallback;
}

/**
 * uuid (เต็ม/ตัดสั้น) → ชื่อพนักงาน. profiles → admin_login_id → tb_admin (เอาชื่อเล่น).
 * batch · fail-soft (คืน map ว่าง ให้ caller ใช้ค่าเดิม ไม่ล้มทั้งหน้า).
 */
export async function resolveStaffNameByProfileId(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map((i) => (i ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;

  const full = uniq.filter(isFullUuid);
  const truncated = uniq.filter(isTruncatedUuid);
  if (!full.length && !truncated.length) return out;

  const admin = createAdminClient();
  type Prof = { id: string; admin_login_id: string | null; first_name: string | null; last_name: string | null };
  const profs: Prof[] = [];

  // uuid เต็ม → query ตรง (ครอบทุก profile ไม่ว่า active หรือไม่)
  for (let i = 0; i < full.length; i += 300) {
    const { data, error } = await admin
      .from("profiles")
      .select("id,admin_login_id,first_name,last_name")
      .in("id", full.slice(i, i + 300));
    if (error) {
      console.error("[staff-names] profiles by id failed", { code: error.code, message: error.message });
      continue;
    }
    for (const p of (data ?? []) as Prof[]) profs.push(p);
  }

  // uuid ตัดสั้น → prefix-match ไม่ได้ใน SQL → ดึงแถวพนักงาน (admin_login_id ไม่ null) มาเทียบใน JS
  let staffProfs: Prof[] = [];
  if (truncated.length) {
    const { data, error } = await admin
      .from("profiles")
      .select("id,admin_login_id,first_name,last_name")
      .not("admin_login_id", "is", null);
    if (error) {
      console.error("[staff-names] staff profiles scan failed", { code: error.code, message: error.message });
    } else {
      staffProfs = (data ?? []) as Prof[];
      profs.push(...staffProfs);
    }
  }

  // เติมชื่อเล่นจาก tb_admin (แหล่งเดียวข้อมูลพนักงาน)
  const loginIds = [...new Set(profs.map((p) => (p.admin_login_id ?? "").trim()).filter(Boolean))];
  const nickByLogin = new Map<string, AdminRow>();
  for (let i = 0; i < loginIds.length; i += 300) {
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID,adminName,adminLastName,adminNickname")
      .in("adminID", loginIds.slice(i, i + 300));
    if (error) {
      console.error("[staff-names] tb_admin by login failed", { code: error.code, message: error.message });
      continue;
    }
    for (const a of (data ?? []) as AdminRow[]) nickByLogin.set(a.adminID, a);
  }

  const nameOfProfile = (p: Prof) => {
    const a = p.admin_login_id ? nickByLogin.get(p.admin_login_id.trim()) : undefined;
    return pickName(
      a?.adminNickname ?? null,
      a?.adminName ?? p.first_name,
      a?.adminLastName ?? p.last_name,
      p.admin_login_id?.trim() || p.id.slice(0, 8),
    );
  };

  const byId = new Map<string, Prof>(profs.map((p) => [p.id, p] as [string, Prof]));
  for (const id of full) {
    const p = byId.get(id);
    if (p) out.set(id, nameOfProfile(p));
  }
  for (const t of truncated) {
    const p = staffProfs.find((x) => x.id.startsWith(t));
    if (p) out.set(t, nameOfProfile(p));
  }
  return out;
}

/**
 * ตัว resolve กลางของทั้งระบบ — รับรหัสพนักงานทรงไหนก็ได้ (login-id / member_code /
 * uuid เต็ม / uuid ตัดสั้น) คืน Map<token, ชื่อเล่น>. token ที่เป็นระบบ/cron จะไม่อยู่ใน map
 * (ให้ `staffLabel` แปลงเป็น "ระบบ" ตอนแสดงผล).
 */
export async function resolveStaffNameMap(
  tokens: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(tokens.map((t) => (t ?? "").trim()).filter(Boolean))]
    .filter((t) => !isSystemActor(t));
  const out = new Map<string, string>();
  if (!uniq.length) return out;

  const uuids = uniq.filter((t) => isFullUuid(t) || isTruncatedUuid(t));
  const memberCodes = uniq.filter((t) => MEMBER_CODE.test(t));
  const legacy = uniq.filter((t) => !uuids.includes(t) && !memberCodes.includes(t));

  // 1) legacy login-id → tb_admin (ตัวเดิม · ชื่อเล่นก่อน)
  if (legacy.length) {
    for (const [k, v] of await resolveSaleRepNameMap(legacy)) {
      if (v !== k) out.set(k, v); // ไม่ set ถ้า resolve ไม่ได้ (ปล่อยให้ label ใช้รหัสเดิม)
    }
  }

  // 2) uuid → profiles
  if (uuids.length) {
    for (const [k, v] of await resolveStaffNameByProfileId(uuids)) out.set(k, v);
  }

  // 3) member_code (AD###/PR### เช่น fdadminid ของคนขับ) → profiles.member_code → tb_admin
  if (memberCodes.length) {
    const admin = createAdminClient();
    type P = { member_code: string | null; admin_login_id: string | null; first_name: string | null; last_name: string | null };
    const rows: P[] = [];
    for (let i = 0; i < memberCodes.length; i += 300) {
      const { data, error } = await admin
        .from("profiles")
        .select("member_code,admin_login_id,first_name,last_name")
        .in("member_code", memberCodes.slice(i, i + 300));
      if (error) {
        console.error("[staff-names] profiles by member_code failed", { code: error.code, message: error.message });
        continue;
      }
      for (const p of (data ?? []) as P[]) rows.push(p);
    }
    const loginIds = [...new Set(rows.map((r) => (r.admin_login_id ?? "").trim()).filter(Boolean))];
    const nickByLogin = new Map<string, AdminRow>();
    for (let i = 0; i < loginIds.length; i += 300) {
      const { data, error } = await admin
        .from("tb_admin")
        .select("adminID,adminName,adminLastName,adminNickname")
        .in("adminID", loginIds.slice(i, i + 300));
      if (error) {
        console.error("[staff-names] tb_admin by member login failed", { code: error.code, message: error.message });
        continue;
      }
      for (const a of (data ?? []) as AdminRow[]) nickByLogin.set(a.adminID, a);
    }
    for (const r of rows) {
      if (!r.member_code) continue;
      const a = r.admin_login_id ? nickByLogin.get(r.admin_login_id.trim()) : undefined;
      const name = pickName(
        a?.adminNickname ?? null,
        a?.adminName ?? r.first_name,
        a?.adminLastName ?? r.last_name,
        r.member_code,
      );
      if (name !== r.member_code) out.set(r.member_code, name);
    }
  }

  return out;
}

/**
 * ป้ายแสดงพนักงานมาตรฐานเดียวทั้งระบบ — **ชื่อเล่น** ถ้า resolve ได้ · "ระบบ" ถ้าเป็น
 * cron/ระบบ · "—" ถ้าว่าง · fallback = รหัสเดิม (ข้อมูลไม่หายไปเฉยๆ).
 */
export function staffLabel(
  code: string | null | undefined,
  map: Map<string, string>,
  opts?: { empty?: string },
): string {
  const c = (code ?? "").trim();
  if (!c) return opts?.empty ?? "—";
  if (isSystemActor(c)) return "ระบบ";
  return map.get(c) ?? c;
}
