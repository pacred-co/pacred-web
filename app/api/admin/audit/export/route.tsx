/**
 * U4-1 — Admin audit-log CSV export.
 *
 * Per UPGRADE_PLAN §4 U4-1 "admin supervisory layer — audit-log
 * search/filter/EXPORT". The /admin/audit page surfaces rows;
 * this endpoint downloads a filtered CSV for offline analysis
 * (compliance reports, anomaly investigation, account-by-account
 * activity dumps for HR/ops).
 *
 * Accepts the SAME query params as the page:
 *   ?admin=PR001         — exact member_code of the acting admin
 *   ?action=rate_general — prefix match (LIKE 'prefix%')
 *   ?target_type=forwarder
 *   ?target_id=<uuid>
 *   ?from=2026-05-01     — created_at >=
 *   ?to=2026-05-31       — created_at <= (end-of-day inclusive)
 *   ?limit=5000          — caps at 10,000 max
 *
 * Role: super only (matches /admin/audit page gate).
 *
 * Response: text/csv with attachment Content-Disposition;
 * filename includes the BKK date for easy spreadsheet sorting.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminAction } from "@/actions/admin/common";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_EXPORT_ROWS = 10_000;
const DEFAULT_LIMIT   = 1000;

type AuditRow = {
  id:          string;
  admin_id:    string;
  action:      string;
  target_type: string;
  target_id:   string;
  payload:     Record<string, unknown> | null;
  created_at:  string;
  admin:
    | { member_code: string | null; first_name: string | null; last_name: string | null }
    | { member_code: string | null; first_name: string | null; last_name: string | null }[]
    | null;
};

/**
 * RFC 4180-ish CSV cell escaper. Wraps in double quotes when the
 * cell contains comma, double-quote, CR or LF; doubles any embedded
 * double-quotes. Plain ASCII without these characters passes through
 * unquoted for compact output.
 */
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  // Role gate — mirrors the page.
  const { user } = await requireAdmin(["super"]);
  const adminId  = user.id;

  const url    = new URL(req.url);
  const sp     = url.searchParams;
  const admin  = createAdminClient();

  const adminFilter = sp.get("admin")?.trim().toUpperCase() ?? null;
  const action      = sp.get("action")?.trim() ?? null;
  const targetType  = sp.get("target_type")?.trim() ?? null;
  const targetId    = sp.get("target_id")?.trim() ?? null;
  const fromStr     = sp.get("from")?.trim() ?? null;
  const toStr       = sp.get("to")?.trim()   ?? null;
  const limit       = Math.min(
    Math.max(parseInt(sp.get("limit") ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1),
    MAX_EXPORT_ROWS,
  );

  // Resolve admin filter to profile_id first (mirror /admin/audit).
  let adminFilterId: string | null = null;
  if (adminFilter) {
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id")
      .eq("member_code", adminFilter)
      .maybeSingle<{ id: string }>();
    if (profileErr) {
      console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
    }
    adminFilterId = profile?.id ?? "__not_found__";
  }

  let q = admin
    .from("admin_audit_log")
    .select(`id, admin_id, action, target_type, target_id, payload, created_at,
      admin:profiles!admin_id(member_code, first_name, last_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (adminFilterId)  q = q.eq("admin_id", adminFilterId);
  if (action)         q = q.like("action", `${action}%`);
  if (targetType)     q = q.eq("target_type", targetType);
  if (targetId)       q = q.eq("target_id", targetId);
  if (fromStr)        q = q.gte("created_at", fromStr);
  if (toStr) {
    // End-of-day inclusive — append T23:59:59 if it's a bare date.
    const t = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? `${toStr}T23:59:59` : toStr;
    q = q.lte("created_at", t);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as AuditRow[];

  // Build CSV — header + per-row.
  const lines: string[] = [];
  lines.push([
    "created_at_iso",
    "created_at_bkk",
    "admin_member_code",
    "admin_name",
    "admin_id",
    "action",
    "target_type",
    "target_id",
    "payload_json",
  ].join(","));

  for (const r of rows) {
    const a = Array.isArray(r.admin) ? r.admin[0] ?? null : r.admin;
    const name = a
      ? [a.first_name, a.last_name].filter(Boolean).join(" ").trim()
      : "";
    const bkk = new Date(r.created_at).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "short",
      timeStyle: "medium",
    });
    lines.push([
      csvCell(r.created_at),
      csvCell(bkk),
      csvCell(a?.member_code ?? ""),
      csvCell(name),
      csvCell(r.admin_id),
      csvCell(r.action),
      csvCell(r.target_type),
      csvCell(r.target_id),
      csvCell(r.payload),
    ].join(","));
  }

  // BOM so Excel opens the UTF-8 CSV without mojibake on Thai cells.
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  // Best-effort audit log of the export itself (don't block on failure).
  void logAdminAction(adminId, "admin_audit_log.export", "admin_audit_log", "csv", {
    rows: rows.length,
    limit,
    filters: {
      admin: adminFilter ?? null,
      action: action ?? null,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
      from: fromStr ?? null,
      to: toStr ?? null,
    },
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
  const filenameParts = [
    "pacred-audit",
    today,
    adminFilter ?? "",
    action ?? "",
    targetType ?? "",
  ].filter(Boolean).join("_").replace(/[^a-zA-Z0-9._-]/g, "-");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameParts}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
