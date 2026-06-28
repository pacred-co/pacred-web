"use server";

/**
 * Exec-cockpit EMPLOYEE AUDIT (owner 2026-06-28 · "audit พนักงานทุกคน ทำอะไร ถึงไหน
 * งานติดอะไร") — read-only workload + stuck-work matrix per responsible admin.
 *
 * Responsible admin = the customer's SALES rep (tb_users.adminIDSale) + CS
 * (tb_users.adminIDCS) — owner answer #5 (admin-side only, no customer front-end).
 * "งานติด/ค้าง" = days-in-current-stage (now − fdatestatus[fstatus] stamp); ≥
 * STUCK_DAYS flags it (owner #8: show the day-count + the stage's responsible
 * admin so they can be alerted). Read-only · degrades to [] on any error (§0c).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logger } from "@/lib/logger";
import { LEGACY_FORWARDER_STATUS, type LegacyForwarderCode } from "@/lib/legacy-status-map";
import type { AdminAuditRow } from "./reports-cockpit-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };

const LIMIT = 8000;
const STUCK_DAYS = 7;
/** fstatus → the column stamped when the order ENTERED that stage (fstatus 1 = fdate). */
const STAGE_STAMP: Record<string, string> = {
  "2": "fdatestatus2", "3": "fdatestatus3", "4": "fdatestatus4",
  "5": "fdatestatus5", "6": "fdatestatus6",
};

type ActiveFwd = {
  userid: string | null;
  fstatus: string | null;
  fdate: string | null;
  fdatestatus2: string | null; fdatestatus3: string | null; fdatestatus4: string | null;
  fdatestatus5: string | null; fdatestatus6: string | null;
};

function daysInStage(r: ActiveFwd, now: number): number {
  const stampCol = STAGE_STAMP[r.fstatus ?? ""];
  const raw = (stampCol ? (r as unknown as Record<string, string | null>)[stampCol] : null) ?? r.fdate;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export async function getCockpitAdminAudit(): Promise<Ok<{ rows: AdminAuditRow[]; stuckDays: number }> | Err> {
  await requireAdmin(["super", "accounting", "ops", "sales_admin"]);
  try {
    const admin = createAdminClient();
    const now = Date.now();

    // Active (in-flight) forwarders only — fstatus 1..6, exclude done(7)/cancel(99).
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("userid, fstatus, fdate, fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus5, fdatestatus6")
      .in("fstatus", ["1", "2", "3", "4", "5", "6"])
      .limit(LIMIT);
    if (error) { logger.error("reports", "cockpit-audit forwarder query failed", error); return { ok: false, error: error.message }; }
    const fwd = (data ?? []) as ActiveFwd[];

    // Resolve each customer's rep + CS (chunked .in()).
    const ids = Array.from(new Set(fwd.map((r) => (r.userid ?? "").trim()).filter(Boolean)));
    const repOf = new Map<string, string>();
    const csOf = new Map<string, string>();
    const adminIds = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data: us, error: uErr } = await admin
        .from("tb_users").select('"userID","adminIDSale","adminIDCS"').in("userID", chunk);
      if (uErr) { logger.error("reports", "cockpit-audit tb_users failed", uErr); continue; }
      for (const u of (us ?? []) as { userID: string; adminIDSale: string | null; adminIDCS: string | null }[]) {
        const rep = (u.adminIDSale ?? "").trim(); const cs = (u.adminIDCS ?? "").trim();
        if (rep) { repOf.set(u.userID, rep); adminIds.add(rep); }
        if (cs) { csOf.set(u.userID, cs); adminIds.add(cs); }
      }
    }
    // admin id → display name.
    const nameOf = new Map<string, string>();
    const adminList = Array.from(adminIds);
    if (adminList.length) {
      const { data: aRows, error: aErr } = await admin
        .from("tb_admin").select('"adminID","adminName","adminLastName","adminNickname"').in("adminID", adminList);
      if (aErr) logger.error("reports", "cockpit-audit tb_admin failed", aErr);
      for (const a of (aRows ?? []) as { adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null }[]) {
        nameOf.set(a.adminID, a.adminNickname?.trim() || [a.adminName, a.adminLastName].filter(Boolean).join(" ").trim() || a.adminID);
      }
    }

    // Aggregate per responsible admin (rep + cs both counted, role-tagged).
    type Acc = { key: string; role: "เซลล์" | "CS"; active: number; stuck: number; worstDays: number; worstStage: string };
    const accs = new Map<string, Acc>();
    const bump = (id: string, role: Acc["role"], days: number, stage: string) => {
      const k = `${role}:${id}`;
      const a = accs.get(k) ?? { key: id, role, active: 0, stuck: 0, worstDays: 0, worstStage: "" };
      a.active += 1;
      if (days >= STUCK_DAYS) { a.stuck += 1; if (days > a.worstDays) { a.worstDays = days; a.worstStage = stage; } }
      accs.set(k, a);
    };
    for (const r of fwd) {
      const uid = (r.userid ?? "").trim(); if (!uid) continue;
      const days = daysInStage(r, now);
      const stageLabel = LEGACY_FORWARDER_STATUS[(r.fstatus ?? "") as LegacyForwarderCode]?.thai ?? r.fstatus ?? "";
      const rep = repOf.get(uid); const cs = csOf.get(uid);
      if (rep) bump(rep, "เซลล์", days, stageLabel);
      if (cs) bump(cs, "CS", days, stageLabel);
    }

    const rows: AdminAuditRow[] = Array.from(accs.values())
      .map((a) => ({
        adminId: a.key,
        adminName: nameOf.get(a.key) ?? a.key,
        role: a.role,
        active: a.active,
        stuck: a.stuck,
        worstDays: a.worstDays,
        worstStage: a.worstStage,
      }))
      .sort((x, y) => y.stuck - x.stuck || y.active - x.active)
      .slice(0, 20);

    return { ok: true, data: { rows, stuckDays: STUCK_DAYS } };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "cockpit-audit threw", err);
    return { ok: false, error: err.message };
  }
}
