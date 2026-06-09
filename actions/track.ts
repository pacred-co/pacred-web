"use server";

/**
 * Public no-login parcel tracking (Task 2 · ปอน · 2026-06-02).
 *
 * The headline "ไม่ต้องโทรถาม" USP — a customer pastes the China-courier
 * tracking number they were given and sees a status timeline, WITHOUT
 * logging in. Reads the canonical `tb_forwarder` (47k+ rows) by
 * `ftrackingchn`, the same number the customer types.
 *
 * ⚠️ PRIVACY (this is a PUBLIC endpoint — flagged for เดฟ review · G-15):
 *   - Returns ONLY non-sensitive logistics fields: tracking number, status
 *     label, stage dates, origin-warehouse CITY, a coarse ETA. It NEVER
 *     returns customer name / phone / userID / cost / profit / address.
 *   - The money state (fstatus=5 "รอชำระเงิน") is shown to the public as the
 *     NEUTRAL "อยู่ระหว่างดำเนินการ" — an unauthenticated viewer is never told
 *     a balance is owed.
 *   - On any error or no-match it returns `{ found: false }` (a friendly
 *     not-found) — it never 500s and never reveals whether a code exists.
 *
 * 🛈 RATE-LIMIT (wired W8 2026-06-09): lookups are now capped at 100/hour/IP
 *   (RATE_LIMITS.publicTrack · Upstash-backed, in-memory fallback). The page is
 *   ad-linked, so this tolerates a real visitor checking a handful of parcels
 *   while blocking a script enumerating the 50-char courier numbers. Over the
 *   cap → a friendly `{ found: false, rateLimited: true }` (never 500).
 *
 * `tb_*` is RLS-locked to service_role → this reads through the admin client.
 */

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import type { PublicTrackResult } from "./track-types";

// The 7-stage flow (tb_forwarder.fstatus). Step 5 is deliberately NEUTRAL in
// public (legacy "รอชำระเงิน" → money state hidden from unauthenticated view).
const STATUS_LABEL_PUBLIC: Record<number, string> = {
  1: "รอสินค้าเข้าโกดังจีน",
  2: "สินค้าถึงโกดังจีนแล้ว",
  3: "กำลังส่งมาประเทศไทย",
  4: "สินค้าถึงประเทศไทยแล้ว",
  5: "อยู่ระหว่างดำเนินการ",
  6: "เตรียมส่ง",
  7: "ส่งแล้ว",
};

// tb_forwarder.fwarehousechina — comment in migration 0081: '1=กวางโจว,2=อี้อู'.
const WAREHOUSE_CITY: Record<string, string> = {
  "1": "กวางโจว (Guangzhou)",
  "2": "อี้อู (Yiwu)",
};

type Row = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fwarehousechina: string | null;
  fdatestatus2: string | null;
  fdatestatus3: string | null;
  fdatestatus4: string | null;
  fdatestatus5: string | null;
  fdatestatus6: string | null;
  fdatestatus7: string | null;
  fdatetothai: string | null;
};

function fmtThaiDate(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function getPublicTrackStatus(
  rawCode: string,
): Promise<PublicTrackResult> {
  const code = (rawCode ?? "").trim();
  // Require a plausible courier number — guards against scraping the table
  // with short/blank inputs and against an empty `.eq` query.
  if (code.length < 4) return { found: false };

  // IP rate-limit — the ad-linked safety gate (100/hour/IP). Best-effort: any
  // failure inside the limiter falls back to in-memory (lib/rate-limit), and we
  // never let it 500 the public page — on an unexpected throw we proceed.
  try {
    const ip = getClientIpFromHeaders(await headers());
    const rl = await rateLimit("publicTrack", ip);
    if (!rl.success) {
      console.warn("[getPublicTrackStatus] rate-limited", { ip, reset: rl.reset });
      return { found: false, rateLimited: true };
    }
  } catch (err) {
    console.error("[getPublicTrackStatus] rate-limit check threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    // fall through — availability over strict limiting
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(
        "id, ftrackingchn, fstatus, fwarehousechina, fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus5, fdatestatus6, fdatestatus7, fdatetothai",
      )
      .eq("ftrackingchn", code)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<Row>();

    if (error) {
      // Never leak the error to the public — log + friendly not-found.
      console.error("[getPublicTrackStatus] failed", {
        code: error.code,
        message: error.message,
      });
      return { found: false };
    }
    if (!data) return { found: false };

    const status = Number(data.fstatus) || 0;
    const dateByStep: Record<number, string | null> = {
      1: null,
      2: fmtThaiDate(data.fdatestatus2),
      3: fmtThaiDate(data.fdatestatus3),
      4: fmtThaiDate(data.fdatestatus4),
      5: fmtThaiDate(data.fdatestatus5),
      6: fmtThaiDate(data.fdatestatus6),
      7: fmtThaiDate(data.fdatestatus7),
    };

    const stages = [1, 2, 3, 4, 5, 6, 7].map((step) => ({
      step,
      label: STATUS_LABEL_PUBLIC[step],
      date: dateByStep[step],
      done: status > step,
      current: status === step,
    }));

    // Coarse, non-committal ETA — never a hard promise.
    const etaToThai = fmtThaiDate(data.fdatetothai);
    let etaText: string | null;
    if (status >= 7) etaText = "จัดส่งสำเร็จแล้ว";
    else if (status === 3 && etaToThai) etaText = `คาดว่าถึงไทยประมาณ ${etaToThai}`;
    else if (status <= 2) etaText = "อยู่ระหว่างเตรียม/ขนส่งจากจีน";
    else etaText = "อยู่ระหว่างดำเนินการในไทย";

    return {
      found: true,
      tracking: data.ftrackingchn ?? code,
      statusCode: status,
      statusLabel: STATUS_LABEL_PUBLIC[status] ?? "อยู่ระหว่างดำเนินการ",
      warehouse: WAREHOUSE_CITY[data.fwarehousechina ?? ""] ?? null,
      etaText,
      stages,
    };
  } catch (err) {
    // DB fully down etc. — render the not-found state, never 500 the public page.
    console.error("[getPublicTrackStatus] threw", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { found: false };
  }
}
