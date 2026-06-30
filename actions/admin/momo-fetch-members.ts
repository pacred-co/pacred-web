"use server";

/**
 * Admin > MOMO > "พัสดุที่ขาด" — auto-fill the SET B member codes from MOMO web.
 * 2026-06-29 (ภูม · login-replication).
 *
 * SET B parcels (closed-container orphans) have no member code in the partner
 * API feed, so staff used to read each one off the MOMO web by hand. This action
 * logs in to the MOMO web (master account, server-side) and resolves the member
 * code (cn_usercode) for a batch of tracking numbers in one shot.
 *
 * READ-ONLY against MOMO + against our DB — it only RETURNS a { tracking →
 * member } map; the staff still reviews + clicks "เพิ่มเข้าระบบ" per parcel
 * (which goes through the guarded addMissingMomoParcel). No writes here.
 *
 * 🔒 Uses lib/integrations/momo-web/client, which never fetches cost fields.
 */

import { z } from "zod";
import { withAdmin, type AdminActionResult } from "./common";
import { isMomoWebConfigured, resolveMembersByTracking } from "@/lib/integrations/momo-web/client";

const schema = z.object({
  trackings: z.array(z.string()).min(1).max(2000),
});

export async function fetchMissingMembersFromMomo(
  rawInput: unknown,
): Promise<AdminActionResult<{ map: Record<string, string>; resolved: number; total: number }>> {
  return withAdmin<{ map: Record<string, string>; resolved: number; total: number }>(
    ["super", "ops", "warehouse", "accounting"],
    async () => {
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) return { ok: false, error: "ข้อมูลแทรคกิ้งไม่ถูกต้อง" };

      if (!isMomoWebConfigured()) {
        return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
      }

      const trackings = [...new Set(parsed.data.trackings.map((t) => t.trim()).filter(Boolean))];
      if (trackings.length === 0) return { ok: true, data: { map: {}, resolved: 0, total: 0 } };

      try {
        const map = await resolveMembersByTracking(trackings);
        return { ok: true, data: { map, resolved: Object.keys(map).length, total: trackings.length } };
      } catch (e) {
        console.error("[momo-fetch-members] failed", e);
        return {
          ok: false,
          error: e instanceof Error ? `ดึงข้อมูลจาก MOMO ไม่สำเร็จ: ${e.message}` : "ดึงข้อมูลจาก MOMO ไม่สำเร็จ",
        };
      }
    },
  );
}
