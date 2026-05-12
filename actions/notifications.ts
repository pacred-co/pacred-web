"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/notifications/types";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// LIST + unread count
// ────────────────────────────────────────────────────────────
export async function listMyNotifications(limit = 50): Promise<ActionResult<NotificationRow[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // We can't join through the FK directly without a foreign-table policy
  // visible to the user. Simpler: two queries — list + read-set.
  const [notifsRes, readsRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, category, severity, title, body, link_href, reference_type, reference_id, delivered_line_at, delivered_email_at, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notification_reads")
      .select("notification_id, read_at")
      .eq("profile_id", user.id),
  ]);

  if (notifsRes.error) return { ok: false, error: notifsRes.error.message };

  type ReadRow = { notification_id: string; read_at: string };
  const readMap = new Map<string, string>(
    (readsRes.data ?? []).map((r: ReadRow) => [r.notification_id, r.read_at]),
  );

  type NotifBase = Omit<NotificationRow, "read_at">;
  const out: NotificationRow[] = (notifsRes.data ?? []).map((n: NotifBase) => ({
    ...n,
    read_at: readMap.get(n.id) ?? null,
  }));

  return { ok: true, data: out };
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count: total } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);

  const { count: read } = await supabase
    .from("notification_reads")
    .select("notification_id", { count: "exact", head: true })
    .eq("profile_id", user.id);

  return Math.max(0, (total ?? 0) - (read ?? 0));
}

// ────────────────────────────────────────────────────────────
// MARK READ
// ────────────────────────────────────────────────────────────
export async function markRead(notificationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("notification_reads")
    .upsert(
      { profile_id: user.id, notification_id: notificationId },
      { onConflict: "profile_id,notification_id", ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");      // bell badge in NavBar
  return { ok: true };
}

export async function markAllRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Fetch unread notification ids first, then upsert reads in one query.
  const { data: notifs } = await supabase
    .from("notifications")
    .select("id")
    .eq("profile_id", user.id);

  const ids = (notifs ?? []).map((n) => n.id);
  if (ids.length === 0) return { ok: true };

  const rows = ids.map((id) => ({ profile_id: user.id, notification_id: id }));
  const { error } = await supabase
    .from("notification_reads")
    .upsert(rows, { onConflict: "profile_id,notification_id", ignoreDuplicates: true });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
