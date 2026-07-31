/**
 * /admin/drivers/work — REDIRECT stub (ภูม 2026-07-31).
 *
 * งานคนขับ (ขึ้นรถ · ถ่ายส่ง · ส่งไม่ได้ + รูป) ถูกยุบมารวมไว้ในหน้ารายละเอียด
 * แต่ละงานแล้ว: /admin/drivers?view=todo → เปิดงาน → /admin/drivers/[fdid].
 * พนักงานทั้งโกดังและคนขับทำงานที่หน้าเดียวจบ (owner 2026-07-31 "พนักงานจะได้ไม่งง").
 *
 * เก็บ route ไว้ (ไม่ลบไฟล์) เพื่อกัน bookmark/ลิงก์เก่า 404 → เด้งไป view=todo.
 * ยังคง auth gate เดิม (driver/ops/super) และส่ง ?driver= ผ่านไปให้ ops/super ที่
 * กรองตามคนขับ.
 */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function DriverWorkRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; driver?: string }>;
}) {
  await requireAdmin(["driver", "ops", "super"]);
  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const driver = (sp.driver ?? "").trim();
  const target = driver
    ? `/admin/drivers?view=todo&driver=${encodeURIComponent(driver)}`
    : "/admin/drivers?view=todo";
  redirect({ href: target, locale });
}
