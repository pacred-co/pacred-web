/**
 * Sales-roster SOT — the LIVE set of active sales reps, data-driven.
 *
 * Owner directive (2026-06-15): "ให้มันผูกกันหมดออโต้" — stop hardcoding the
 * sales team count. EVERY sales surface (the customer-facing team carousel, the
 * round-robin lead assignment, admin rep filters/dropdowns) must read this ONE
 * source, so designating a rep (toggle `adminStatusSale`) auto-updates all of
 * them with zero code change.
 *
 * The pool is the LEGACY model the round-robin already uses
 * (`lib/admin/assign-sales-rep.ts`): `tb_admin` WHERE adminStatusA='1' (active
 * staff) AND adminStatusSale='1' (flagged as a sales rep). The picked
 * `tb_admin.adminID` is exactly what `tb_users.adminIDSale` stores, so it
 * round-trips into the customer's assigned-rep display.
 *
 * Server-only — reads `tb_admin` (camelCase per migration 0113).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUsableImageSrc } from "@/lib/admin/usable-image-src";
import { logger } from "@/lib/logger";

const SCOPE = "sales-roster";

export type SalesRep = {
  /** Legacy `tb_admin.adminID` — the value stored in `tb_users.adminIDSale`. */
  adminID: string;
  /** Short display name — nickname when set, else first name. */
  name: string;
  /** Full name (first + last) for formal contexts. */
  fullName: string;
  /** Raw phone (tel: href after stripping). */
  phone: string;
  /** Display phone (0xx-xxx-xxxx). */
  phoneDisplay: string;
  /** `tb_admin.adminPicture` ONLY when it's a usable next/image src (a "/" path
   *  or an http(s) URL); null otherwise — a bare legacy filename like "user.jpg"
   *  is coerced to null so no consumer can crash next/image. UI supplies the
   *  fallback (logo / character art / initial). */
  photo: string | null;
};

/** "0617799299" → "061-779-9299" (Thai mobile/landline display). */
function displayPhone(s: string): string {
  const d = s.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("0")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return s.trim();
}

type Row = {
  adminID: string | null;
  adminName: string | null;
  adminLastName: string | null;
  adminNickname: string | null;
  adminTel: string | null;
  adminPicture: string | null;
};

/** tb_admin row → SalesRep (null when no adminID). Shared by all roster fetchers. */
function mapAdminRow(r: Row): SalesRep | null {
  const id = r.adminID?.trim();
  if (!id) return null;
  const nick = r.adminNickname?.trim();
  const first = r.adminName?.trim() ?? "";
  const last = r.adminLastName?.trim() ?? "";
  const tel = (r.adminTel ?? "").trim();
  const pic = r.adminPicture?.trim();
  return {
    adminID: id,
    name: nick || first || id,
    fullName: `${first} ${last}`.trim() || nick || id,
    phone: tel,
    phoneDisplay: tel ? displayPhone(tel) : "",
    // Null anything next/image can't load. A bare legacy filename ("user.jpg")
    // crashed every roster consumer's <Image> → home `/` error boundary 2026-06-22.
    photo: isUsableImageSrc(pic) ? pic : null,
  };
}

/**
 * The LIVE active roster for a position flag — flagged staff, ordered for stable
 * display + deterministic round-robin tie-breaks. Returns [] (never throws) on a
 * read error so a consuming page degrades gracefully (the round-robin keeps its
 * own never-null central fallback in assign-sales-rep.ts).
 */
async function getActiveRosterByFlag(
  flag: "adminStatusSale" | "adminStatusCS",
): Promise<SalesRep[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID, adminName, adminLastName, adminNickname, adminTel, adminPicture")
    .eq("adminStatusA", "1")
    .eq(flag, "1")
    .order("adminID", { ascending: true });
  if (error) {
    logger.warn(SCOPE, "active roster lookup failed", { flag, reason: error.message });
    return [];
  }
  return ((data ?? []) as Row[]).map(mapAdminRow).filter((r): r is SalesRep => r !== null);
}

/** Active sales reps (adminStatusSale='1'). The customer's `adminIDSale` points here. */
export async function getActiveSalesReps(): Promise<SalesRep[]> {
  return getActiveRosterByFlag("adminStatusSale");
}

/** Active CS reps (adminStatusCS='1' · migration 0141). The customer's `adminIDCS` points here. */
export async function getActiveCsReps(): Promise<SalesRep[]> {
  return getActiveRosterByFlag("adminStatusCS");
}

/**
 * Purchaser reps (ตำแหน่ง "สั่งซื้อ" = ฝากสั่งซื้อ · owner ยืนยัน 2026-07-29). Roster = the DISTINCT
 * `tb_header_order.adminidpurchaser` (mig 0241) actually assigned, resolved to names via tb_admin
 * (legacy · admin_web) และ profiles (modern admin เช่น เบญจพร=มะนาว · adminidpurchaser = profiles.id
 * ตัดสั้น 20 ตัว). เอา ปอนด์ (admin_pond = ชูเกียรติ/owner) ออก. ไม่มี tb_admin flag สำหรับ purchaser.
 */
/**
 * Resolve modern-admin display names for TRUNCATED profiles.id values. `adminidpurchaser` stores
 * profiles.id ตัดสั้น 20 ตัว สำหรับ modern admin (เช่น เบญจพร=มะนาว). profiles.id เป็น uuid → `.like`
 * prefix ใช้ไม่ได้ → ดึง admin (is_active) profiles มา prefix-match ใน JS. คืน Map<truncatedId, name>.
 */
export async function resolveModernAdminNames(truncatedIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = truncatedIds.filter((id) => id.includes("-"));
  if (wanted.length === 0) return out;
  const admin = createAdminClient();
  const { data: adminRows, error: aerr } = await admin.from("admins").select("profile_id").eq("is_active", true);
  if (aerr) {
    logger.warn(SCOPE, "modern-admin roster failed", { reason: aerr.message });
    return out;
  }
  const profileIds = [
    ...new Set(
      ((adminRows ?? []) as { profile_id: string | null }[]).map((a) => a.profile_id).filter((x): x is string => !!x),
    ),
  ];
  if (profileIds.length === 0) return out;
  const profs: { id: string; first_name: string | null; last_name: string | null }[] = [];
  for (let i = 0; i < profileIds.length; i += 300) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", profileIds.slice(i, i + 300));
    if (error) {
      logger.warn(SCOPE, "modern-admin profiles lookup failed", { reason: error.message });
      continue;
    }
    for (const p of (data ?? []) as typeof profs) profs.push(p);
  }
  for (const tid of wanted) {
    const match = profs.find((p) => p.id.startsWith(tid));
    if (match) out.set(tid, `${match.first_name ?? ""} ${match.last_name ?? ""}`.trim() || tid);
  }
  return out;
}

export async function getActivePurchaserReps(): Promise<SalesRep[]> {
  const admin = createAdminClient();
  const seen = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("tb_header_order")
      .select("adminidpurchaser")
      .neq("adminidpurchaser", "")
      .range(from, from + pageSize - 1);
    if (error) {
      logger.warn(SCOPE, "purchaser scan failed", { reason: error.message });
      break;
    }
    const rows = (data ?? []) as unknown as { adminidpurchaser: string | null }[];
    for (const r of rows) {
      const id = (r.adminidpurchaser ?? "").trim();
      if (id && id !== "admin_pond") seen.add(id); // เอา ปอนด์(owner) ออก
    }
    if (rows.length < pageSize) break;
  }
  if (seen.size === 0) return [];

  const ids = [...seen];
  const reps: SalesRep[] = [];
  const resolved = new Set<string>();
  // legacy · tb_admin (เช่น admin_web = เว็บ)
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname, adminTel, adminPicture")
      .in("adminID", ids.slice(i, i + 300));
    if (error) {
      logger.warn(SCOPE, "purchaser tb_admin lookup failed", { reason: error.message });
      continue;
    }
    for (const r of (data ?? []) as Row[]) {
      const rep = mapAdminRow(r);
      if (rep) {
        reps.push(rep);
        resolved.add(rep.adminID);
      }
    }
  }
  // modern · profiles.id ตัดสั้น (uuid → prefix-match ใน JS)
  const modernNames = await resolveModernAdminNames(ids.filter((i) => !resolved.has(i)));
  for (const [tid, name] of modernNames) {
    reps.push({ adminID: tid, name, fullName: name, phone: "", phoneDisplay: "", photo: null });
  }
  reps.sort((a, b) => a.adminID.localeCompare(b.adminID));
  return reps;
}
