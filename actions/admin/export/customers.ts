"use server";

/**
 * "Export all filtered" CSV for /admin/customers (owner directive 2026-06-07).
 * Mirrors the golden /admin/leads pattern.
 *
 * DRIFT-FREE: this action replicates the EXACT query the customers list renders
 * for its on-screen rows (app/[locale]/(admin)/admin/customers/page.tsx) — same
 * tb_users select + same `type` (userCompany) / `group` (userCompany|userCredit|
 * userComparison) / `adminidsale` (adminIDSale) / `q` (escaped .or ilike) filters
 * + same tb_wallet / tb_address / tb_corporate batch-joins + the same derived
 * status / VIP / birthday / company-name-fallback row mapping. The ONLY
 * difference is no pagination: one capped page of up to EXPORT_CAP rows instead
 * of the 50-row window. The CSV columns + value-mapping match the page's
 * CsvButton exactly (17 cols).
 *
 * COLUMN-IDENTICAL columns (= page CsvButton, byte-for-byte):
 *   userID · fullName · type · status · tel · email · address · birthday · vip ·
 *   lineId · facebook · adminIDSale · wallet · registered · juristic_tax_id ·
 *   juristic_company · juristic_status
 *
 * AUDIT: writes one admin_export_log row (dataset "customers") with the active
 * filters. PII surface (name/addr/line/fb) — RBAC matches the page exactly
 * (ops/sales_admin/accounting; super implicit).
 *
 * Note (per the surface hint): with no filter the customer base (~8,898) exceeds
 * EXPORT_CAP (10,000)? No — it's under, so a no-filter export is whole. If the
 * base ever grows past the cap the export flags `truncated` and the page warns.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { logAdminExport } from "../export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import { isGeneralCoid } from "@/lib/forwarder/coid";

// Safety cap for the unpaginated "ทั้งหมด" pull. tb_users has ~8,898 rows, so
// 10,000 comfortably covers the full base with no filter; a no-filter export
// that ever exceeds this flags `truncated` (expected — the page warns).
const EXPORT_CAP = 10000;

// Page-level role gate — IDENTICAL to page.tsx requireAdmin(...).
const ROLES = ["ops", "sales_admin", "accounting"] as const;

// ── Filter mapping — IDENTICAL to GROUP_CFG in page.tsx (the col side). ──
const GROUP_COL: Record<string, string | undefined> = {
  general: undefined,
  vip: undefined,
  svip: undefined,
  corporate: "userCompany",
  credit: "userCredit",
  comparison: "userComparison",
};

// tb_corporate.corporatestatus → keyword — IDENTICAL to CORP_STATUS_TO_KEYWORD.
const CORP_STATUS_TO_KEYWORD: Record<string, "pending" | "verified" | "rejected"> = {
  "1": "pending",
  "2": "verified",
  "3": "rejected",
};

function guessLegacyDocMime(filename: string | null): string {
  if (!filename) return "application/octet-stream";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

/** Resolve a tb_corporate row's cert + ภพ20 filenames → signed-URL doc entries. */
async function resolveLegacyCorpDocs(
  corporatefile: string | null,
  corporatefile20: string | null,
): Promise<{ label: string; url: string; mime: string }[]> {
  const docs: { label: string; url: string; mime: string }[] = [];
  const [certUrl, vatUrl] = await Promise.all([
    resolveLegacyUrl(corporatefile, "file"),
    resolveLegacyUrl(corporatefile20, "file"),
  ]);
  if (certUrl) docs.push({ label: "หนังสือรับรองบริษัท", url: certUrl, mime: guessLegacyDocMime(corporatefile) });
  if (vatUrl) docs.push({ label: "ภ.พ.20", url: vatUrl, mime: guessLegacyDocMime(corporatefile20) });
  return docs;
}

// ── Display helpers — IDENTICAL to page.tsx. ──

/** True for any legacy `coid` that signals a non-default VIP tier.
 *  General = ''/'PR'/'PCS'/'GENERAL' (coid.ts SOT · 'PR' post-0182). */
function isVipCoid(coid: string | null | undefined): boolean {
  return !isGeneralCoid(coid);
}

/** Parse YYYY-MM-DD or ISO into { dm, age }. Returns nulls on failure. */
function formatBirthday(raw: string | null | undefined): { dm: string; age: number | null } {
  if (!raw) return { dm: "—", age: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { dm: "—", age: null };
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  if (age < 0 || age > 120) return { dm: `${dd}/${mm}`, age: null };
  return { dm: `${dd}/${mm}`, age };
}

/** Compact one-liner for a tb_address row. Picks the most-specific parts. */
function summarizeAddress(
  a:
    | {
        addressno: string | null;
        addresssubdistrict: string | null;
        addressdistrict: string | null;
        addressprovince: string | null;
        addresszipcode: string | null;
      }
    | undefined,
): string {
  if (!a) return "—";
  const parts = [a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function deriveStatus(u: { userActive: string | null; userStatus: string | null }): "active" | "incomplete" | "suspended" {
  if (u.userStatus === "0") return "suspended";
  if (u.userActive === "0" || u.userActive === "") return "incomplete";
  return "active";
}

export type CustomersExportFilter = {
  type?: string;
  group?: string;
  adminidsale?: string;
  q?: string;
};

type Row = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
  userEmail: string | null;
  userActive: string | null;
  userStatus: string | null;
  adminIDSale: string | null;
  userRegistered: string | null;
  coID: string | null;
  userLineID: string | null;
  userFacebook: string | null;
  userBirthday: string | null;
};

type AddressRow = {
  addressid: number;
  userid: string;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

type CorpInfo = { taxId: string; companyName: string; corpStatus: "pending" | "verified" | "rejected" };

/**
 * Export the ENTIRE filtered customer list (all pages, capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Replicates the page's exact filtered
 * query (only difference: no pagination) so the export can never drift from the
 * table. Writes an admin_export_log audit row (PII walk-off trail — owner
 * directive).
 */
export async function exportCustomersAll(
  filter: CustomersExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Gate identity (same roles as the page). On a gate failure requireAdmin
  // redirects, so we never leak rows to an unauthorized caller.
  await requireAdmin([...ROLES]);
  const admin = createAdminClient();

  // ── tb_users (unpaginated · capped) — IDENTICAL select + filters to page.tsx
  // but .range(0, EXPORT_CAP-1) instead of the 50-row page window (no count).
  let q = admin
    .from("tb_users")
    .select(`
      userID, userName, userLastName, userCompany,
      userTel, userEmail, userActive, userStatus, adminIDSale, userRegistered,
      coID, userLineID, userFacebook, userBirthday
    `)
    .order("userRegistered", { ascending: false })
    .range(0, EXPORT_CAP - 1);

  // `type` filter — IDENTICAL to page.tsx.
  if (filter.type === "personal") q = q.neq("userCompany", "1");
  if (filter.type === "juristic") q = q.eq("userCompany", "1");

  // `group` filter — IDENTICAL mapping to page.tsx (GROUP_CFG col side).
  const group = typeof filter.group === "string" && filter.group in GROUP_COL ? filter.group : null;
  const groupCol = group ? GROUP_COL[group] : undefined;
  if (groupCol) q = q.eq(groupCol, "1");

  // `adminidsale` filter — IDENTICAL to page.tsx.
  const adminidsale =
    typeof filter.adminidsale === "string" && filter.adminidsale.trim() !== ""
      ? filter.adminidsale.trim()
      : null;
  if (adminidsale) q = q.eq("adminIDSale", adminidsale);

  // `q` search — IDENTICAL escape + .or ilike to page.tsx.
  const term = typeof filter.q === "string" && filter.q.trim() !== "" ? filter.q : null;
  if (term) {
    const esc = term.replace(/[\\%_,]/g, (m) => "\\" + m);
    q = q.or(`userID.ilike.%${esc}%,userTel.ilike.%${esc}%,userName.ilike.%${esc}%,userLastName.ilike.%${esc}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error(`[exportCustomersAll] tb_users failed`, { code: error.code, message: error.message });
    return { rows: [], truncated: false };
  }
  const userRows = (data ?? []) as unknown as Row[];
  const userIds = userRows.map((r) => r.userID);

  // ── Batch-join tb_wallet — IDENTICAL to page.tsx.
  const walletByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: wallets, error: walletsErr } = await admin
      .from("tb_wallet")
      .select("userid, wallettotal")
      .in("userid", userIds);
    if (walletsErr) {
      console.error(`[exportCustomersAll] tb_wallet failed`, { code: walletsErr.code, message: walletsErr.message });
    }
    for (const w of (wallets ?? []) as { userid: string; wallettotal: number | null }[]) {
      walletByUser.set(w.userid, Number(w.wallettotal ?? 0));
    }
  }

  // ── Batch-join tb_address (main = lowest addressid, addressstatus='1') —
  // IDENTICAL to page.tsx.
  const addressByUser = new Map<string, AddressRow>();
  if (userIds.length > 0) {
    const { data: addresses, error: addressesErr } = await admin
      .from("tb_address")
      .select("addressid, userid, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
      .in("userid", userIds)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: true });
    if (addressesErr) {
      console.error(`[exportCustomersAll] tb_address failed`, { code: addressesErr.code, message: addressesErr.message });
    }
    for (const a of (addresses ?? []) as unknown as AddressRow[]) {
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

  // ── Batch-join tb_corporate (juristic columns + status) — the same legacy
  // SOT the page reads for its juristic CSV columns + company-name fallback.
  // (The page also resolves signed doc URLs for the inline review widget; the
  // CSV needs only taxId/companyName/corpStatus, but we keep the read shape
  // faithful — docs are resolved + discarded so the query/filter is identical.)
  const juristicByMember = new Map<string, CorpInfo>();
  if (userIds.length > 0) {
    const { data: corps, error: corpsErr } = await admin
      .from("tb_corporate")
      .select("userid, corporatenumber, corporatename, corporateaddress, corporatestatus, corporatefile, corporatefile20")
      .in("userid", userIds);
    if (corpsErr) {
      console.error(`[exportCustomersAll] tb_corporate failed`, { code: corpsErr.code, message: corpsErr.message });
    }
    const corpList = (corps ?? []) as {
      userid: string;
      corporatenumber: string | null;
      corporatename: string | null;
      corporateaddress: string | null;
      corporatestatus: string | null;
      corporatefile: string | null;
      corporatefile20: string | null;
    }[];
    // Resolve signed doc URLs concurrently (faithful to the page's read), then
    // discard — the CSV only surfaces taxId/companyName/corpStatus.
    await Promise.all(corpList.map((c) => resolveLegacyCorpDocs(c.corporatefile, c.corporatefile20)));
    for (const c of corpList) {
      juristicByMember.set(c.userid, {
        taxId: c.corporatenumber ?? "",
        companyName: c.corporatename ?? "",
        corpStatus: CORP_STATUS_TO_KEYWORD[c.corporatestatus ?? "1"] ?? "pending",
      });
    }
  }

  // ── Map to CSV rows — SAME keys/value-mapping as the page CsvButton (the
  // tableRows derivation + the inline rows.map merged into one pass).
  const rows: CsvRow[] = userRows.map((r) => {
    const birthday = formatBirthday(r.userBirthday);
    const fb = (r.userFacebook ?? "").trim();
    const corp = juristicByMember.get(r.userID) ?? null;
    const personalName = `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim();
    const companyName = (corp?.companyName ?? "").trim();
    const displayName = personalName || companyName || "—";
    const isJuristic = r.userCompany === "1" || juristicByMember.has(r.userID);
    const status = deriveStatus(r);
    const vip = isVipCoid(r.coID);
    const wallet = walletByUser.get(r.userID) ?? 0;

    return {
      userID: r.userID,
      fullName: displayName,
      type: isJuristic ? "นิติบุคคล" : "บุคคล",
      status,
      tel: r.userTel ?? "",
      email: r.userEmail ?? "",
      address: summarizeAddress(addressByUser.get(r.userID)),
      birthday: birthday.dm + (birthday.age ? ` (อายุ ${birthday.age})` : ""),
      vip: vip ? "VIP" : "",
      lineId: (r.userLineID ?? "").trim(),
      facebook: fb,
      adminIDSale: r.adminIDSale ?? "",
      wallet: wallet.toFixed(2),
      registered: r.userRegistered ? r.userRegistered.slice(0, 10) : "",
      juristic_tax_id: corp?.taxId ?? "",
      juristic_company: corp?.companyName ?? "",
      juristic_status: corp?.corpStatus ?? "",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "customers",
    filters: {
      type: filter.type ?? "",
      group: group ?? "",
      adminidsale: adminidsale ?? "",
      q: term ?? "",
    },
    rowCount: rows.length,
    truncated,
  });
  return { rows, truncated };
}
