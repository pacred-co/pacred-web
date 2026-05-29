/**
 * DBD (กรมพัฒนาธุรกิจการค้า) juristic-person response parser + compare engine.
 *
 * Pure module (no `server-only`) so it can be unit-tested with tsx without
 * spinning up Next.js — same pattern as lib/china-search/url-allow-list.ts.
 * The server action (actions/admin/customers.ts · "use server") imports this;
 * the client compare panel (juristic-actions.tsx) imports the TYPES + the
 * `computeCompareRows()` helper for rendering.
 *
 * ── Faithful to legacy ──────────────────────────────────────────────
 * Legacy `pcs-admin/include/pages/check-juristic/{home,compare}.php` fetched
 *   GET http://hexvapes.com/check-juristic-person/?juristic_id=<13-digit>
 * (a third-party DBD scraper proxy — a "borrowed" interim API, like the PCS/TTP
 * APIs noted in docs/runbook/pcs-scrub-plan.md) and decoded a JSON body of
 * shape:
 *   { status: 200, data: [ { OrganizationJuristicNameTH, ...EN, ...Type,
 *     ...RegisterDate, ...Status, JuristicObjectiveTextTH/EN, ...RegisterCapital,
 *     ...BranchName, OrganizationJuristicAddress: { fullAddressTH, fullAddressEN }
 *   } ] }
 * `status != 200` (or empty data) = "ไม่พบข้อมูล" (not found).
 *
 * compare.php then built a 2-column table (DBD vs PCS GROUP) and highlighted
 * a row red (`bg-danger`) when the DBD value differed from the customer-
 * submitted value, for: corporateNumber, corporateName (TH), corporateNameEN,
 * and corporateAddress (TH). We reproduce that mismatch logic in
 * `computeCompareRows()` — Pacred stores TH name + address (no EN name yet),
 * so only those three are flagged; DBD-only fields render without a mismatch.
 */

/** Typed view of one DBD juristic-person record (data[0]). All string-coerced. */
export type DbdJuristic = {
  /** ชื่อนิติบุคคล (ภาษาไทย) */
  nameTH: string;
  /** ชื่อนิติบุคคล (ภาษาอังกฤษ) */
  nameEN: string;
  /** ประเภทนิติบุคคล */
  type: string;
  /** วันที่จดทะเบียนจัดตั้ง */
  registerDate: string;
  /** สถานะของนิติบุคคล (e.g. "ยังดำเนินกิจการอยู่") */
  status: string;
  /** วัตถุประสงค์ (ภาษาไทย) */
  objectiveTH: string;
  /** วัตถุประสงค์ (ภาษาอังกฤษ) */
  objectiveEN: string;
  /** ทุนจดทะเบียน (บาท) — raw numeric (may be 0 / NaN-safe 0) */
  registerCapital: number;
  /** ชื่อสาขาของนิติบุคคล */
  branchName: string;
  /** ที่อยู่ (ภาษาไทย) */
  addressTH: string;
  /** ที่อยู่ (ภาษาอังกฤษ) */
  addressEN: string;
};

/** The Pacred-side juristic data (from the `corporate` row) we compare against. */
export type PacredJuristic = {
  /** เลขทะเบียนนิติบุคคล / เลขผู้เสียภาษี (corporate.tax_id) */
  taxId: string;
  /** ชื่อบริษัท (corporate.company_name) */
  companyName: string | null;
  /** ที่อยู่บริษัท (corporate.company_address) */
  companyAddress: string | null;
};

/**
 * Result payload of the `lookupDbdJuristic` server action. Defined here (a
 * plain lib) rather than in the "use server" action file, because a "use
 * server" module may only export async functions (per
 * docs/learnings/nextjs-16-quirks.md) — type exports living beside the action
 * are the clean way to share its shape with the client compare panel.
 */
export type DbdLookupData = {
  /** false = DBD_LOOKUP_URL env not set → manual-check mode (link to dbd.go.th). */
  configured: boolean;
  /** Parsed DBD record, or null = ไม่พบข้อมูล / not fetched. */
  dbd: DbdJuristic | null;
  /** Pacred-side data for the compare table. */
  pacred: PacredJuristic;
  /** The 13-digit tax id queried. */
  taxId: string;
  /** true when a previously-cached payload was served (live fetch failed). */
  cached: boolean;
  /** ISO timestamp of the cached payload's fetch time, or null. */
  fetchedAt: string | null;
  /** Set when configured but the live fetch failed — shown as a soft warning. */
  warning?: string;
};

/** One row in the DBD-vs-Pacred compare table. */
export type CompareRow = {
  /** Stable key for React. */
  key: string;
  /** Thai label (legacy "รายการ" column). */
  label: string;
  /** Value from DBD ("" when DBD didn't return it). */
  dbdValue: string;
  /** Value from Pacred ("" / null when we don't store this field). */
  pacredValue: string | null;
  /** true only when BOTH sides have a value and they differ — highlight red. */
  mismatch: boolean;
  /** When the row is the status row, the UI shows a badge instead of plain text. */
  isStatus?: boolean;
};

const DBD_ACTIVE_STATUS = "ยังดำเนินกิจการอยู่";

/** Did DBD report the company as currently operating? (green badge vs red.) */
export function isActiveStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim() === DBD_ACTIVE_STATUS;
}

/** Safe string coercion — null/undefined/objects → "". */
function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Safe number coercion — non-numeric → 0 (legacy number_format(…,2) on null = 0.00). */
function n(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Thousands-separated, 2-decimal baht — legacy number_format($capital, 2). */
export function formatCapital(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parse the raw DBD proxy response body into a typed record.
 *
 * Accepts the already-JSON-decoded value (object) OR a raw string (decodes it).
 * Returns `null` when status != 200, data missing/empty, or the body is
 * unparseable — the caller renders "ไม่พบข้อมูล" (legacy behaviour).
 */
export function parseDbdResponse(raw: unknown): DbdJuristic | null {
  let body: unknown = raw;
  if (typeof raw === "string") {
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;
  // Legacy gate: `if ($json['status']==200)`. Accept number 200 or "200".
  if (s(obj.status) !== "200") return null;

  const data = obj.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const d = data[0];
  if (!d || typeof d !== "object") return null;
  const r = d as Record<string, unknown>;

  const addr = (r.OrganizationJuristicAddress ?? {}) as Record<string, unknown>;

  return {
    nameTH:          s(r.OrganizationJuristicNameTH),
    nameEN:          s(r.OrganizationJuristicNameEN),
    type:            s(r.OrganizationJuristicType),
    registerDate:    s(r.OrganizationJuristicRegisterDate),
    status:          s(r.OrganizationJuristicStatus),
    objectiveTH:     s(r.JuristicObjectiveTextTH),
    objectiveEN:     s(r.JuristicObjectiveTextEN),
    registerCapital: n(r.OrganizationJuristicRegisterCapital),
    branchName:      s(r.OrganizationJuristicBranchName),
    addressTH:       s(addr.fullAddressTH),
    addressEN:       s(addr.fullAddressEN),
  };
}

/**
 * Build the DBD-vs-Pacred compare rows (legacy compare.php Section 1).
 *
 * `queriedTaxId` is the 13-digit number the admin searched (legacy used the
 * GET `juristic_id` for the DBD "เลขทะเบียนนิติบุคคล" cell). Mismatch is
 * flagged ONLY where Pacred actually stores the field AND both differ:
 *   - tax_id ≠ queried number
 *   - company_name ≠ DBD nameTH
 *   - company_address ≠ DBD addressTH
 * All other rows are DBD-only reference (no mismatch highlight).
 */
export function computeCompareRows(
  dbd: DbdJuristic,
  pacred: PacredJuristic,
  queriedTaxId: string,
): CompareRow[] {
  const eq = (a: string, b: string | null) =>
    (a ?? "").trim() === (b ?? "").trim();

  return [
    {
      key: "taxId",
      label: "เลขทะเบียนนิติบุคคล",
      dbdValue: queriedTaxId,
      pacredValue: pacred.taxId,
      mismatch: !!pacred.taxId && !eq(queriedTaxId, pacred.taxId),
    },
    {
      key: "nameTH",
      label: "ชื่อนิติบุคคล (ภาษาไทย)",
      dbdValue: dbd.nameTH,
      pacredValue: pacred.companyName,
      mismatch: !!dbd.nameTH && !!pacred.companyName && !eq(dbd.nameTH, pacred.companyName),
    },
    {
      key: "nameEN",
      label: "ชื่อนิติบุคคล (ภาษาอังกฤษ)",
      dbdValue: dbd.nameEN,
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "type",
      label: "ประเภทนิติบุคคล",
      dbdValue: dbd.type,
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "registerDate",
      label: "วันที่จดทะเบียนจัดตั้ง",
      dbdValue: dbd.registerDate,
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "status",
      label: "สถานะของนิติบุคคล",
      dbdValue: dbd.status,
      pacredValue: null,
      mismatch: false,
      isStatus: true,
    },
    {
      key: "objectiveTH",
      label: "วัตถุประสงค์ (ภาษาไทย)",
      dbdValue: dbd.objectiveTH,
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "objectiveEN",
      label: "วัตถุประสงค์ (ภาษาอังกฤษ)",
      dbdValue: dbd.objectiveEN,
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "capital",
      label: "ทุนจดทะเบียน (บาท)",
      dbdValue: dbd.registerCapital > 0 ? formatCapital(dbd.registerCapital) : "",
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "branchName",
      label: "ชื่อสาขาของนิติบุคคล",
      dbdValue: dbd.branchName,
      pacredValue: null,
      mismatch: false,
    },
    {
      key: "addressTH",
      label: "ที่อยู่บริษัท (ภาษาไทย)",
      dbdValue: dbd.addressTH,
      pacredValue: pacred.companyAddress,
      mismatch: !!dbd.addressTH && !!pacred.companyAddress && !eq(dbd.addressTH, pacred.companyAddress),
    },
    {
      key: "addressEN",
      label: "ที่อยู่บริษัท (ภาษาอังกฤษ)",
      dbdValue: dbd.addressEN,
      pacredValue: null,
      mismatch: false,
    },
  ];
}

/**
 * Build the DBD lookup URL from a template + tax id.
 *
 * The env `DBD_LOOKUP_URL` is a template. Two forms are accepted:
 *   - contains `{taxId}` → replaced in place
 *   - otherwise → the tax id is appended (so the legacy
 *     "…?juristic_id=" value works verbatim)
 * Returns null when the template is empty/unset (= manual-check mode).
 */
export function buildDbdLookupUrl(template: string | undefined | null, taxId: string): string | null {
  const tpl = (template ?? "").trim();
  if (!tpl) return null;
  const id = encodeURIComponent(taxId.trim());
  if (tpl.includes("{taxId}")) return tpl.replace(/\{taxId\}/g, id);
  return tpl + id;
}
