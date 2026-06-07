"use server";

/**
 * Export-all (CSV) for /admin/contact-messages — the website /contact form
 * inbox (contact_messages table).
 *
 * The page (app/[locale]/(admin)/admin/contact-messages/page.tsx) lists every
 * contact_messages row ordered by created_at DESC, optionally narrowed by an
 * `?status=` chip (new / read / replied / closed), joined to profiles for the
 * sender's member_code + name, paginated 50/page. The on-screen "⬇ CSV หน้านี้"
 * downloads only the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด"
 * button — the ENTIRE filtered result set (capped at EXPORT_CAP) — then writes
 * an admin_export_log audit row (PII: customer name + contact — owner directive
 * 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter + join the page runs
 *   .from("contact_messages")
 *   .select(... profile:profiles!profile_id ( member_code, first_name, last_name ))
 *   .order("created_at",{ascending:false})
 *   [+ .eq("status", status) when a status chip is active]
 * unpaginated (capped). The CSV columns mirror the page's CsvButton cols 1:1.
 *
 * RBAC matches the page. The page route is gated by the (admin) layout
 * requireAdmin() (any admin role) — this action mirrors that with a plain
 * requireAdmin() (any admin role).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the active
 * { status } filter.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// Mirrors the page's STATUS_LABEL (Thai label per status).
const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  read: "อ่านแล้ว",
  replied: "ตอบกลับแล้ว",
  closed: "ปิดเรื่อง",
};

type ProfileShape = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
};

type ContactRaw = {
  id: string;
  profile_id: string | null;
  name: string | null;
  contact: string | null;
  subject: string | null;
  message: string | null;
  status: string | null;
  source_url: string | null;
  ip: string | null;
  created_at: string | null;
  profile: ProfileShape | ProfileShape[] | null;
};

/** Active filters the page passes through (the status chip, if any). */
export type ContactMessagesExportFilter = {
  /** Active status chip (new | read | replied | closed); omit for "ทั้งหมด". */
  status?: string;
};

/**
 * Export the entire filtered contact-message inbox (the active status chip, if
 * any, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact filtered query + profiles join, unpaginated. Writes
 * an admin_export_log audit row.
 */
export async function exportContactMessagesAll(
  filter: ContactMessagesExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Any admin role (matches the (admin) layout requireAdmin() gating the page).
  await requireAdmin();

  const { status } = filter;
  const admin = createAdminClient();

  // SAME filter + join as the page; capped (fetch one extra to detect truncation).
  let q = admin
    .from("contact_messages")
    .select(`
      id, profile_id, name, contact, subject, message, status,
      source_url, user_agent, ip, created_at, updated_at,
      profile:profiles!profile_id ( member_code, first_name, last_name )
    `)
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.error(`[exportContactMessagesAll contact_messages] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as ContactRaw[];
  const truncated = all.length > EXPORT_CAP;
  const sliced = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = sliced.map((r) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    const memberCode = profile?.member_code ?? "";
    const senderProfile = profile
      ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
      : r.profile_id === null
        ? "guest"
        : "";
    const row: CsvRow = {
      created_at: (r.created_at ?? "").slice(0, 10),
      name: r.name ?? "",
      member_code: memberCode,
      sender_profile: senderProfile,
      contact: r.contact ?? "",
      subject: r.subject ?? "",
      message: r.message ?? "",
      status: STATUS_LABEL[r.status ?? ""] ?? r.status ?? "",
      source_url: r.source_url ?? "",
      ip: r.ip ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "contact-messages",
    filters: { status: status ?? null },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
