import "server-only";

/**
 * รายงานลูกค้าสมัครใหม่แต่ยืนยัน OTP ไม่ผ่าน — READ-ONLY data layer.
 *
 * Faithful port of legacy `pcs-admin/report-otp-not-pass.php`
 * ("สมัครใหม่แต่ยืนยัน OTP ไม่ได้").
 *
 * ── Legacy logic (verified from source, §0b) ─────────────────────────────
 *   SELECT userRegistered, userTel, userName, userLastName, userEmail, type
 *   FROM tb_register
 *   WHERE DATE(userRegistered) BETWEEN $startDate AND $endDate   (default -7d)
 *
 *   Per row the legacy page:
 *     - checkTelRe($userTel)  → flags a bad phone format
 *                               ("มีความยาวไม่ตรง" / "รูปแบบเบอร์โทรผิด")
 *     - stNiti($type)         → 1=ทั่วไป / 2=นิติบุคคล
 *     - in_array(userTel, all tb_users.userTel) → "มีเบอร์นี้ในระบบแล้ว"
 *
 * `tb_register` = signups that STARTED registration (a pending row) but
 * never completed OTP verification → never became a `tb_users` row. So this
 * report = "people who tried to sign up but OTP did not pass / they dropped
 * off". The OTP-failed angle the prompt asks for: an unverified-signup row
 * whose phone is NOT yet in tb_users = stuck at the OTP step.
 *
 * tb_register schema (migration 0081, lowercase, verified):
 *   id · type[1=ทั่วไป/2=นิติบุคคล] · usertel · username · userlastname ·
 *   useremail · userregistered (timestamp) · coid · adminidsale · …
 *
 * READ-ONLY — no writes. Uses createAdminClient() (RLS bypass) like the
 * sibling report data layers (actions/admin/reports.ts).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const LIMIT = 20_000;

/** tb_register.type → label (legacy stNiti()). */
export const REGISTER_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป",
  "2": "นิติบุคคล",
};

export type OtpFailedRow = {
  id: string;
  /** Signup timestamp (tb_register.userregistered). */
  registered: string;
  /** Likely reason — faithful port of legacy checkTelRe() phone-format check. */
  reason: string;
  /** Phone number as entered (tb_register.usertel). */
  phone: string;
  /** First name (tb_register.username). */
  first_name: string;
  /** Last name (tb_register.userlastname). */
  last_name: string;
  /** Email (tb_register.useremail). */
  email: string;
  /** "1" | "2" — customer type. */
  type: string;
  /** Whether this phone already exists in tb_users (legacy in_array check). */
  already_in_system: boolean;
};

export type OtpFailedReport = {
  rows: OtpFailedRow[];
  totals: {
    total: number;
    badPhone: number;
    alreadyInSystem: number;
  };
};

/**
 * Faithful port of legacy `checkTelRe($phoneNumber)` (function.php L2879).
 * Returns a Thai reason string when the phone format looks wrong, "" when ok.
 *
 * Legacy:
 *   - must be 9–10 digits → else "มีความยาวไม่ตรง"
 *   - first digit must be 0 or 1 → else "รูปแบบเบอร์โทรผิด"
 */
function checkTelRe(phoneNumber: string): string {
  const tel = (phoneNumber ?? "").trim();
  if (!/^[0-9]{9,10}$/.test(tel)) return "มีความยาวไม่ตรง";
  if (tel.length !== 9 && tel.length !== 10) return "มีความยาวไม่ตรง";
  const firstDigit = tel.charAt(0);
  if (firstDigit !== "0" && firstDigit !== "1") return "รูปแบบเบอร์โทรผิด";
  return "";
}

/**
 * Fetch new-signup rows from tb_register in the window + flag each one.
 * Default window mirrors the legacy default of last 7 days (handled by the
 * caller's resolveDateRange(sp, 7)).
 */
export async function getOtpFailedReport(
  range: DateRange,
): Promise<Result<OtpFailedReport>> {
  try {
    const admin = createAdminClient();

    // Step 1 — pull pending-signup rows from tb_register.
    const { data, error } = await admin
      .from("tb_register")
      .select(
        "id, type, usertel, username, userlastname, useremail, userregistered",
      )
      .gte("userregistered", dayStartIso(range.from))
      .lte("userregistered", dayEndIso(range.to))
      .order("userregistered", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "otp-failed tb_register query failed", error);
      console.error("[otp-failed] tb_register query failed", error.message);
      return { ok: false, error: error.message };
    }

    type Raw = {
      id: number;
      type: string | null;
      usertel: string | null;
      username: string | null;
      userlastname: string | null;
      useremail: string | null;
      userregistered: string | null;
    };
    const raw = (data ?? []) as unknown as Raw[];

    // Step 2 — resolve which phones already exist in tb_users (legacy
    // in_array against the full userTel list). Pull only the phones we
    // actually need (the distinct set from this window) to keep it bounded.
    const phones = Array.from(
      new Set(raw.map((r) => (r.usertel ?? "").trim()).filter(Boolean)),
    );
    const existingPhones = new Set<string>();
    if (phones.length > 0) {
      const { data: users, error: uErr } = await admin
        .from("tb_users")
        .select("userTel")
        .in("userTel", phones)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "otp-failed tb_users phone lookup failed", uErr);
        console.error("[otp-failed] tb_users phone lookup failed", uErr.message);
      }
      type U = { userTel: string | null };
      for (const u of (users ?? []) as U[]) {
        if (u.userTel) existingPhones.add(u.userTel.trim());
      }
    }

    let badPhone = 0;
    let alreadyInSystem = 0;

    const rows: OtpFailedRow[] = raw.map((r) => {
      const phone = (r.usertel ?? "").trim();
      const reason = checkTelRe(phone);
      const inSystem = existingPhones.has(phone);
      if (reason) badPhone += 1;
      if (inSystem) alreadyInSystem += 1;
      return {
        id: String(r.id),
        registered: r.userregistered ?? "",
        reason,
        phone,
        first_name: r.username ?? "",
        last_name: r.userlastname ?? "",
        email: r.useremail ?? "",
        type: r.type ?? "",
        already_in_system: inSystem,
      };
    });

    return {
      ok: true,
      data: {
        rows,
        totals: {
          total: rows.length,
          badPhone,
          alreadyInSystem,
        },
      },
    };
  } catch (e) {
    logger.error("reports", "otp-failed crashed", e);
    console.error("[otp-failed] crashed", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}
