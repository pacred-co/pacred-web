import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dev cockpit — ภูม's personal mission-control panel on /admin/board/inbox.
 *
 * 2026-06-29 (ภูม) — owner asked for a hi-tech "dev team" overview gated to
 * his user ALONE: live MOMO health + stuck order/cabinet counts, each an LED
 * + a ≤1-click link to the page that fixes it. Read-only (counts + 1 limit).
 *
 * Gate is an allowlist (NOT a role) — ภูม chose "เฉพาะ user ของภูมิ". Easy to
 * extend later by adding a member_code / login_id.
 */

export const DEV_COCKPIT_MEMBER_CODES = ["AD008"]; // ภูม · Pasit Pappornpisit
export const DEV_COCKPIT_LOGIN_IDS = ["admin_poom"]; // ภูม

export function isDevCockpitAdmin(
  memberCode: string | null | undefined,
  loginId: string | null | undefined,
): boolean {
  const mc = (memberCode ?? "").toUpperCase();
  const li = (loginId ?? "").toLowerCase();
  return DEV_COCKPIT_MEMBER_CODES.includes(mc) || DEV_COCKPIT_LOGIN_IDS.includes(li);
}

export type CockpitTone = "ok" | "warn" | "alert" | "info";

export type CockpitMetric = {
  key: string;
  label: string;
  value: string;
  tone: CockpitTone;
  hint: string;
  href: string | null;
};

export type CockpitGroup = {
  title: string;
  icon: string;
  metrics: CockpitMetric[];
};

export type DevCockpit = {
  groups: CockpitGroup[];
  alertCount: number;
  warnCount: number;
};

/** Server-side relative-time (called in an async loader, not a render body). */
function relativeThai(fromIso: string | null): { label: string; minutes: number | null } {
  if (!fromIso) return { label: "—", minutes: null };
  const ms = Date.now() - new Date(fromIso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return { label: "เมื่อกี้นี้", minutes: 0 };
  if (min < 60) return { label: `${min} นาทีก่อน`, minutes: min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { label: `${hr} ชม. ${min % 60} น. ก่อน`, minutes: min };
  return { label: `${Math.floor(hr / 24)} วันก่อน`, minutes: min };
}

/**
 * Build the cockpit data. All queries are cheap (head:true counts + one
 * limit-1). MOMO scope = fwarehousename '8'. Never mutates.
 */
export async function loadDevCockpit(admin: SupabaseClient): Promise<DevCockpit> {
  const [lastSync, pendingCommit, weightZero, f4, f5, f6] = await Promise.all([
    admin
      .from("momo_import_tracks")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("momo_import_tracks")
      .select("id", { count: "exact", head: true })
      .is("committed_at", null),
    admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fwarehousename", "8")
      .in("fstatus", ["4", "5", "6", "7"])
      .or("fweight.is.null,fweight.eq.0"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "4"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "5"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "6"),
  ]);

  const syncRow = lastSync.data as { last_synced_at: string | null } | null;
  const sync = relativeThai(syncRow?.last_synced_at ?? null);
  const syncTone: CockpitTone =
    sync.minutes === null ? "alert" : sync.minutes <= 15 ? "ok" : sync.minutes <= 60 ? "warn" : "alert";

  const pc = pendingCommit.count ?? 0;
  const wz = weightZero.count ?? 0;
  const c4 = f4.count ?? 0;
  const c5 = f5.count ?? 0;
  const c6 = f6.count ?? 0;

  const groups: CockpitGroup[] = [
    {
      title: "สุขภาพ MOMO",
      icon: "🛰",
      metrics: [
        {
          key: "sync",
          label: "SYNC ล่าสุด",
          value: sync.label,
          tone: syncTone,
          hint: "cron ดึง MOMO ทุก 10 นาที · เกิน 1 ชม. = ผิดปกติ",
          href: "/admin/api-forwarder-momo/sync",
        },
        {
          key: "commit",
          label: "รอ COMMIT",
          value: String(pc),
          tone: pc > 0 ? "warn" : "ok",
          hint: "sync มาแล้ว รอตรวจ+กรอก เข้า tb_forwarder",
          href: "/admin/api-forwarder-momo/review",
        },
        {
          key: "weight0",
          label: "น้ำหนัก = 0",
          value: String(wz),
          tone: wz > 0 ? "alert" : "ok",
          hint: "ถึงไทยแล้วแต่ไม่มีน้ำหนัก — คิดราคา/วางบิลไม่ได้",
          href: "/admin/api-forwarder-momo/missing",
        },
      ],
    },
    {
      title: "ออเดอร์ / ตู้ ค้างสถานะ",
      icon: "📦",
      metrics: [
        {
          key: "f4",
          label: "ถึงไทย · รอจัดการ",
          value: String(c4),
          tone: c4 > 0 ? "warn" : "ok",
          hint: "รอตั้งราคา / ส่งรอชำระ",
          href: "/admin/forwarders?status=4",
        },
        {
          key: "f5",
          label: "รอชำระเงิน",
          value: String(c5),
          tone: c5 > 0 ? "warn" : "ok",
          hint: "รอลูกค้าโอน / วางบิล",
          href: "/admin/forwarders?status=5",
        },
        {
          key: "f6",
          label: "เตรียมส่ง · รอจัดรถ",
          value: String(c6),
          tone: c6 > 0 ? "warn" : "ok",
          hint: "รอมอบงานคนขับ",
          href: "/admin/forwarders?status=6",
        },
      ],
    },
  ];

  const all = groups.flatMap((g) => g.metrics);
  return {
    groups,
    alertCount: all.filter((m) => m.tone === "alert").length,
    warnCount: all.filter((m) => m.tone === "warn").length,
  };
}
