"use server";

/**
 * /admin/service-orders — FULL-filtered CSV export (owner directive 2026-06-07).
 *
 * Mirrors the /admin/leads golden reference (actions/admin/leads.ts →
 * exportLeadsAll). The page at app/[locale]/(admin)/admin/service-orders/page.tsx
 * builds its filtered list of tb_header_order rows INLINE; this action replicates
 * that EXACT filtered query (status tab · 90d/explicit date window · keyword
 * .or() across hno/htitle/userid) with the ONLY difference being no per-page
 * pagination — one capped page of up to EXPORT_CAP rows instead of the 50-row
 * window. The CSV row shape + columns are byte-identical to the page's CsvButton.
 *
 * Every full export writes one admin_export_log audit row (PII walk-off trail).
 *
 * Per AGENTS.md §0c / CLAUDE_TECHNICAL.md — every Supabase query destructures
 * `error`. Per Rule A — the filter is passed in already-derived from the page so
 * there is ZERO chance of the export re-deriving a different WHERE clause.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import { isGeneralCoid } from "@/lib/forwarder/coid";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

const EXPORT_CAP = 10000;

// Legacy STATUS_LABEL — mirrors the page (hstatus is varchar(2): "1".."6" + "40").
const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "40": "ถึงโกดังจีน", // owner 2026-06-16 · MOMO arrival
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

type SortField = "id" | "hdate" | "hno" | "userid" | "price" | "hstatus" | "hdateupdate";

const SORT_COL: Record<SortField, string> = {
  id: "id",
  hdate: "hdate",
  hno: "hno",
  userid: "userid",
  price: "htotalpriceuser",
  hstatus: "hstatus",
  hdateupdate: "hdateupdate",
};

/**
 * The already-derived filter state the page computed from its URL params.
 * Passing the derived values (not the raw URL) guarantees the export's WHERE
 * clause matches the page's exactly — no re-derivation, no drift.
 */
export type ServiceOrdersExportFilter = {
  /** legacy hstatus "1".."6", or undefined for "all" */
  statusFilter?: string;
  /** inclusive lower bound on hdate (YYYY-MM-DD), or null for "no lower bound" */
  effectiveFrom?: string | null;
  /** inclusive upper bound on hdate (YYYY-MM-DD), or null for "no upper bound" */
  effectiveTo?: string | null;
  /** keyword matched against hno/htitle/userid, or undefined */
  keyword?: string;
  /** server-side sort field (same default as the page: "hdate") */
  sort?: SortField;
  /** sort direction (same default as the page: "desc") */
  dir?: "asc" | "desc";
};

type RawHeaderOrder = {
  id: number;
  hno: string;
  hstatus: string;
  hdate: string | null;
  hdateupdate: string | null;
  hdatepayment: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | null;
  hshippingchn: number | null;
  hshippingservice: number | null;
  hrate: number | null;
  adminidcreate: string | null;
  adminidupdate: string | null;
  userid: string;
};

type RawUserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  coID: string | null;
  adminIDSale: string | null;
};

type RawCorpRow = { userid: string };

export async function exportServiceOrdersAll(
  filter: ServiceOrdersExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same role gate as the page (ops/sales/accounting work this list).
  await requireAdmin(["ops", "sales", "accounting"]);

  const admin = createAdminClient();

  const currentSort: SortField = filter.sort ?? "hdate";
  const currentDir: "asc" | "desc" = filter.dir === "asc" ? "asc" : "desc";

  // ── Main query — IDENTICAL filter to the page, minus .range() pagination.
  // (The page selects more columns for its richer table; the export only needs
  //  the CSV columns, but the WHERE/order are byte-for-byte the same.)
  let q = admin
    .from("tb_header_order")
    .select(
      "id,hno,hstatus,hdate,hdateupdate,hdatepayment,htitle,hcount," +
        "htotalpricechn,hshippingchn,hshippingservice,hrate," +
        "adminidcreate,adminidupdate,userid",
    )
    .order(SORT_COL[currentSort], { ascending: currentDir === "asc", nullsFirst: false })
    .limit(EXPORT_CAP);

  if (filter.statusFilter) {
    q = q.eq("hstatus", filter.statusFilter);
  }

  if (filter.effectiveFrom) q = q.gte("hdate", filter.effectiveFrom);
  if (filter.effectiveTo) q = q.lte("hdate", filter.effectiveTo + "T23:59:59");

  if (filter.keyword) {
    const escaped = filter.keyword.replace(/[%,*()]/g, ""); // keep simple — same as page
    q = q.or(
      `hno.ilike.%${escaped}%,htitle.ilike.%${escaped}%,userid.ilike.%${escaped}%`,
    );
  }

  const { data: headerRows, error: headerErr } = await q;
  if (headerErr) {
    console.error("[exportServiceOrdersAll] tb_header_order list failed", {
      code: headerErr.code,
      message: headerErr.message,
    });
    return { rows: [], truncated: false };
  }
  const raw = (headerRows ?? []) as unknown as RawHeaderOrder[];

  // ── 2nd query: tb_users (customer name + VIP tier + sales rep) — same as page.
  const uniqueUserIds = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  let usersByUserId = new Map<string, RawUserRow>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,coID,adminIDSale")
      .in("userID", uniqueUserIds);
    if (userErr) {
      console.error("[exportServiceOrdersAll] tb_users join failed", {
        userIdCount: uniqueUserIds.length,
        error: userErr.message,
      });
    }
    usersByUserId = new Map(
      ((userRows ?? []) as unknown as RawUserRow[]).map((u) => [u.userID, u]),
    );
  }

  // ── 3rd query: tb_corporate to flag นิติบุคคล — same as page.
  let corporateUserIds = new Set<string>();
  if (uniqueUserIds.length > 0) {
    const { data: corpRows, error: corpErr } = await admin
      .from("tb_corporate")
      .select("userid")
      .in("userid", uniqueUserIds);
    if (corpErr) {
      console.error("[exportServiceOrdersAll] tb_corporate join failed", {
        error: corpErr.message,
      });
    }
    corporateUserIds = new Set(
      ((corpRows ?? []) as unknown as RawCorpRow[]).map((c) => c.userid),
    );
  }

  // นิติบุคคล → company name (not the contact person). One batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, uniqueUserIds);

  // ── Shape into CSV rows — IDENTICAL keys/values/money math to the page's
  //    CsvButton mapping (see service-orders/page.tsx L596-621).
  const rows: CsvRow[] = raw.map((r): CsvRow => {
    const user = usersByUserId.get(r.userid);
    const name = user
      ? resolveBillingIdentity({
          userCompany: user.userCompany,
          userName: user.userName,
          userLastName: user.userLastName,
          corp: corpRowFromName(corpNames.get(r.userid)),
        }).name || null
      : null;
    const coid = user?.coID ?? null;
    const isVip = !isGeneralCoid(coid);
    const vipTier = isVip ? coid : null;
    const isCorporate = corporateUserIds.has(r.userid);
    const salesRep = user?.adminIDSale && user.adminIDSale !== "" ? user.adminIDSale : null;

    const htotalpricechn = Number(r.htotalpricechn ?? 0);
    const hshippingchn = Number(r.hshippingchn ?? 0);
    const hshippingservice = Number(r.hshippingservice ?? 0);
    const hrate = Number(r.hrate ?? 0);
    const totalThb = (htotalpricechn + hshippingchn) * hrate + hshippingservice;

    return {
      id: r.id,
      hno: r.hno,
      status: STATUS_LABEL[r.hstatus] ?? r.hstatus,
      hdate: r.hdate ?? "",
      hdatepayment: r.hdatepayment ?? "",
      hdateupdate: r.hdateupdate ?? "",
      userid: r.userid,
      customerName: name ?? "",
      vipTier: vipTier ?? "",
      isCorporate: isCorporate ? "นิติบุคคล" : "",
      salesRep: salesRep ?? "",
      htitle: r.htitle ?? "",
      hcount: Number(r.hcount ?? 1),
      yuanGoods: htotalpricechn.toFixed(2),
      yuanShipChina: hshippingchn.toFixed(2),
      rate: hrate.toFixed(4),
      shipService: hshippingservice.toFixed(2),
      totalThb: totalThb.toFixed(2),
      adminCreate: r.adminidcreate ?? "",
      adminUpdate: r.adminidupdate ?? "",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;

  // ── Audit (best-effort · never blocks the export). ──────────────────────
  await logAdminExport({
    dataset: "service-orders",
    filters: {
      statusFilter: filter.statusFilter ?? null,
      effectiveFrom: filter.effectiveFrom ?? null,
      effectiveTo: filter.effectiveTo ?? null,
      keyword: filter.keyword ?? null,
      sort: currentSort,
      dir: currentDir,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
