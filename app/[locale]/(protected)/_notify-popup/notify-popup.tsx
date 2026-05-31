import { createAdminClient } from "@/lib/supabase/admin";
import { NotifyPopupClient } from "./notify-popup-client";

/**
 * Customer login-popup announcement (server loader).
 *
 * 2026-06-01 — Faithful port of `member/include/all-script.php` L615-691
 * (the "แสดงการแจ้งเตือนปกติ" block):
 *   1. read this customer's acknowledged popup ids from `tb_notify_read`
 *      (WHERE userID = '$userID')
 *   2. SELECT * FROM tb_notify
 *      WHERE NOW() BETWEEN dateStart AND dateExp AND ID NOT IN (<read ids>)
 *      ORDER BY ID DESC  — and show the top (most recent) one.
 *
 * Reads `tb_notify` + `tb_notify_read` directly so it reaches ALL 8,898
 * migrated customers (join key = userid = member_code). Renders nothing if
 * there is no unread, in-window announcement.
 */

type NotifyRow = {
  id:      number;
  title:   string;
  content: string | null;
  url:     string | null;
};

export async function NotifyPopup({ memberCode }: { memberCode: string }) {
  if (!memberCode) return null;

  const admin = createAdminClient();

  // 1. ids this customer already acknowledged.
  const { data: readRows, error: readErr } = await admin
    .from("tb_notify_read")
    .select("popid")
    .eq("userid", memberCode);
  if (readErr) {
    console.error(`[tb_notify_read list] failed`, { code: readErr.code, message: readErr.message, memberCode });
    return null; // fail-safe — never block the page on a popup
  }
  const readIds = (readRows ?? []).map((r) => (r as { popid: number }).popid);

  // 2. latest in-window announcement not yet acknowledged.
  const nowIso = new Date().toISOString();
  let query = admin
    .from("tb_notify")
    .select("id, title, content, url")
    .lte("datestart", nowIso)
    .gte("dateexp", nowIso)
    .order("id", { ascending: false })
    .limit(1);
  if (readIds.length > 0) {
    query = query.not("id", "in", `(${readIds.join(",")})`);
  }
  const { data: rows, error: notifyErr } = await query;
  if (notifyErr) {
    console.error(`[tb_notify unread] failed`, { code: notifyErr.code, message: notifyErr.message, memberCode });
    return null;
  }

  const row = (rows?.[0] ?? null) as NotifyRow | null;
  if (!row) return null;

  return (
    <NotifyPopupClient
      id={row.id}
      title={row.title}
      content={row.content}
      url={row.url}
    />
  );
}
