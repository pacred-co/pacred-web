"use client";

/**
 * Customers table — client-side sortable + quick-filter + inline juristic review.
 * เดฟ 2026-05-30 (owner directives):
 *
 *  A) "หัวข้อทำให้กรองเรียงได้ด้วย" — every meaningful column header is now a
 *     click-to-sort toggle (asc → desc), plus a quick text filter over the
 *     loaded rows. Sort idiom mirrors report-cnt container-detail-client.
 *
 *  B) "คลิ๊กตรวจหน้านี้เลยได้ไหมแบบทีละคน พอกดคนไหน ก็ขยายคอนเท้นลงมา อ่านๆ
 *     ดูๆ ตรวจ แล้วก็ย่อ … ขยายย่อ ตรวจ approve ได้เลย" (owner 2026-05-29) —
 *     EVERY row is now click-to-expand (chevron in the รหัส cell + a row-body
 *     click; the member-code Link, the Facebook link, and the action cell all
 *     stopPropagation so they never trigger expand). One row open at a time
 *     (accordion). The expand renders <CustomerExpandPanel>: a read-only detail
 *     grid + the per-row actions (Approve/ระงับ/reset password) + — for a
 *     นิติบุคคล with a pending corporate review — the same <JuristicInlineReview>
 *     that the old "ตรวจนิติบุคคล" button used (DBD compare + hover-zoom docs +
 *     approve/reject). The separate review button is gone — one unified expand.
 *
 * The server page (page.tsx) pre-computes every display value + the juristic
 * bundle, so this stays a pure serializable-props client component.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ChevronDown, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown, Building2 } from "lucide-react";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { ResetPwdButton } from "./reset-pwd-button";
import { HoverZoomImage } from "@/components/admin/hover-zoom-image";
import {
  computeCompareRows,
  isActiveStatus,
  type DbdLookupData,
} from "@/lib/dbd/parse-juristic";
import { lookupDbdJuristic, verifyJuristic, rejectJuristic } from "@/actions/admin/customers";

export type DerivedStatus = "active" | "incomplete" | "suspended";

export type JuristicBundle = {
  profileId: string;
  /** Legacy member code (tb_users.userID) — the key the juristic actions use (P0-18). */
  userid: string;
  taxId: string;
  companyName: string;
  companyAddress: string;
  corpStatus: "pending" | "verified" | "rejected";
  docs: { label: string; url: string; mime: string }[];
  /** For the top review queue card header (corporate-driven, may not be in tb_users). */
  memberCode?: string;
  customerName?: string;
  /** Contact phone (tb_users.userTel) — shown on the pending-review queue card. */
  phone?: string;
};

export type CustomerTableRow = {
  userID: string;
  /** Profile avatar signed URL (tb_users.userimage → "profile" bucket). null = no image. */
  avatarUrl: string | null;
  isJuristic: boolean;
  status: DerivedStatus;
  fullName: string;
  tel: string;
  email: string;
  address: string;
  birthdayDm: string;
  birthdayAge: number | null;
  vip: boolean;
  lineId: string;
  facebook: string;
  isFbUrl: boolean;
  adminIDSale: string;
  wallet: number;
  registered: string | null; // ISO
  /** Present only for juristic customers with a pending-review corporate row. */
  juristic: JuristicBundle | null;
};

const STATUS_CFG: Record<DerivedStatus, { label: string; className: string; rank: number }> = {
  incomplete: { label: "รอ Approve", className: "bg-amber-50 text-amber-700 border-amber-200", rank: 0 },
  active:     { label: "ใช้งาน",     className: "bg-green-50 text-green-700 border-green-200", rank: 1 },
  suspended:  { label: "ระงับ",      className: "bg-red-50 text-red-700 border-red-200",       rank: 2 },
};

type SortKey =
  | "userID" | "type" | "name" | "address" | "age" | "vip"
  | "sale" | "status" | "wallet" | "registered";
type SortDir = "asc" | "desc";

function sortValue(r: CustomerTableRow, k: SortKey): string | number {
  switch (k) {
    case "userID":     return r.userID.toLowerCase();
    case "type":       return r.isJuristic ? 1 : 0;
    case "name":       return r.fullName.toLowerCase();
    case "address":    return r.address.toLowerCase();
    case "age":        return r.birthdayAge ?? -1;
    case "vip":        return r.vip ? 1 : 0;
    case "sale":       return (r.adminIDSale || "").toLowerCase();
    case "status":     return STATUS_CFG[r.status].rank;
    case "wallet":     return r.wallet;
    case "registered": return r.registered ? Date.parse(r.registered) : 0;
  }
}

export function CustomersTable({ rows }: { rows: CustomerTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>("registered");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  const view = useMemo(() => {
    const term = filter.trim().toLowerCase();
    let out = rows;
    if (term) {
      out = rows.filter((r) =>
        r.userID.toLowerCase().includes(term) ||
        r.fullName.toLowerCase().includes(term) ||
        r.tel.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.adminIDSale.toLowerCase().includes(term),
      );
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return out;
  }, [rows, filter, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="กรองในหน้านี้: รหัส / ชื่อ / เบอร์ / อีเมล / เซลล์"
          className="rounded-lg border border-border px-3 py-1.5 text-sm w-72"
        />
        <span className="text-xs text-muted">
          {view.length === rows.length ? `${rows.length} รายการ` : `${view.length} / ${rows.length} รายการ`}
        </span>
        <span className="text-[11px] text-muted ml-auto">คลิกหัวคอลัมน์เพื่อเรียง · เลื่อนซ้าย-ขวา ⇆</span>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th k="userID"     {...{ sortKey, sortDir, toggleSort }}>รหัส</Th>
                <Th k="type"       {...{ sortKey, sortDir, toggleSort }}>ประเภท</Th>
                <Th k="name"       {...{ sortKey, sortDir, toggleSort }}>ชื่อ</Th>
                <th className="px-4 py-3">เบอร์ / อีเมล</th>
                <Th k="address"    {...{ sortKey, sortDir, toggleSort }}>ที่อยู่หลัก</Th>
                <Th k="age"        {...{ sortKey, sortDir, toggleSort }}>วันเกิด / อายุ</Th>
                <Th k="vip"        {...{ sortKey, sortDir, toggleSort }}>VIP</Th>
                <th className="px-4 py-3">LINE</th>
                <th className="px-4 py-3">Facebook</th>
                <Th k="sale"       {...{ sortKey, sortDir, toggleSort }}>เซลล์ผู้ดูแล</Th>
                <Th k="status"     {...{ sortKey, sortDir, toggleSort }}>สถานะ</Th>
                <Th k="wallet" align="right" {...{ sortKey, sortDir, toggleSort }}>ยอดกระเป๋า</Th>
                <Th k="registered" {...{ sortKey, sortDir, toggleSort }}>สมัครเมื่อ</Th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-12 text-center text-sm text-muted">ไม่พบลูกค้าตามที่กรอง</td></tr>
              )}
              {view.map((r) => {
                const cfg = STATUS_CFG[r.status];
                const isOpen = expanded === r.userID;
                const toggle = () => setExpanded(isOpen ? null : r.userID);
                return (
                  <FragmentRow key={r.userID}>
                    <tr
                      onClick={toggle}
                      className={`cursor-pointer border-t border-border align-top ${isOpen ? "bg-primary-50/40 dark:bg-primary-900/10" : "hover:bg-surface-alt/30"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggle(); }}
                            aria-expanded={isOpen}
                            title={isOpen ? "ย่อ" : "ขยายเพื่อตรวจ"}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${isOpen ? "bg-primary-100 text-primary-700" : "text-muted hover:bg-surface-alt hover:text-foreground"}`}
                          >
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <CustomerAvatar src={r.avatarUrl} name={r.fullName} code={r.userID} />
                          <Link href={`/admin/customers/${r.userID}`} onClick={(e) => e.stopPropagation()} className="text-primary-600 hover:underline">{r.userID}</Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${r.isJuristic ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                          {r.isJuristic ? "นิติบุคคล" : "บุคคล"}
                        </span>
                        {r.juristic && (
                          <span className={`ml-1 rounded-full border px-1.5 py-0.5 text-[11px] ${
                            r.juristic.corpStatus === "verified" ? "bg-green-50 text-green-700 border-green-200"
                            : r.juristic.corpStatus === "rejected" ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {r.juristic.corpStatus === "verified" ? "ตรวจแล้ว" : r.juristic.corpStatus === "rejected" ? "ปฏิเสธ" : "รอตรวจ"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{r.fullName}</td>
                      <td className="px-4 py-3 text-xs">
                        <div>{r.tel || "—"}</div>
                        <div className="text-muted">{r.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[260px]"><div className="truncate" title={r.address}>{r.address}</div></td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {r.birthdayDm}{r.birthdayAge !== null && <span className="ml-1 text-muted">({r.birthdayAge} ปี)</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.vip ? <span className="rounded-full border bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-[11px] font-medium uppercase">VIP</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">{r.lineId ? <span className="font-mono">{r.lineId}</span> : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 text-xs max-w-[180px]">
                        {r.facebook ? (
                          r.isFbUrl
                            ? <a href={r.facebook} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="text-primary-600 hover:underline truncate inline-block max-w-full" title={r.facebook}>{r.facebook.replace(/^https?:\/\/(www\.)?/, "")}</a>
                            : <span className="truncate inline-block max-w-full" title={r.facebook}>{r.facebook}</span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{r.adminIDSale || "—"}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>{cfg.label}</span></td>
                      <td className="px-4 py-3 text-right font-mono text-xs">฿{r.wallet.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.registered ? new Date(r.registered).toLocaleDateString("th-TH") : "—"}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CustomerRowActions id={r.userID} status={r.status} currentSalesRep={r.adminIDSale} />
                          <ResetPwdButton userid={r.userID} />
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-border bg-surface-alt/20">
                        <td colSpan={14} className="px-4 py-4">
                          <CustomerExpandPanel row={r} />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Small fragment helper so the row + its expansion share one key cleanly.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Profile avatar thumbnail (self-explaining-row standard · owner 2026-06-22).
 * Renders a small rounded avatar from the resolved signed URL; on a missing /
 * broken image (or no URL at all) falls back to a neutral initials circle —
 * never a broken <img>. Deterministic tint per member-code so the same
 * customer always gets the same colour.
 */
const AVATAR_TINTS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];
function CustomerAvatar({ src, name, code }: { src: string | null; name: string; code: string }) {
  const [failed, setFailed] = useState(false);
  const initials =
    (name.trim() ? name.trim() : code).slice(0, 2).toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  const tint = AVATAR_TINTS[hash % AVATAR_TINTS.length];

  if (!src || failed) {
    return (
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold ${tint}`}
        title={name || code}
        aria-hidden
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name || code}
      className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

/**
 * One read-only detail field — label above, value below. Keeps the expand grid
 * scannable for the "อ่านๆ ดูๆ ตรวจ" review pass.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-xs text-foreground break-words">{children}</dd>
    </div>
  );
}

/**
 * The per-row expand body (owner 2026-05-29 inline-review).
 * Read-only customer detail grid + the same row actions (so staff can
 * "approve ได้เลย" without scrolling back to the จัดการ column) + the juristic
 * doc-review panel when the customer is a นิติบุคคล with a corporate row.
 */
function CustomerExpandPanel({ row: r }: { row: CustomerTableRow }) {
  const cfg = STATUS_CFG[r.status];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-white dark:bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CustomerAvatar src={r.avatarUrl} name={r.fullName} code={r.userID} />
            <span className="font-mono text-sm font-semibold text-primary-700">{r.userID}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>{cfg.label}</span>
            {r.vip && <span className="rounded-full border bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-[11px] font-medium uppercase">VIP</span>}
          </div>
          <Link href={`/admin/customers/${r.userID}`} className="text-xs font-medium text-primary-600 hover:underline">→ ดูโปรไฟล์เต็ม</Link>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="รหัสสมาชิก"><span className="font-mono">{r.userID}</span></Field>
          <Field label="ชื่อ">{r.fullName || "—"}</Field>
          <Field label="ประเภท">{r.isJuristic ? "นิติบุคคล" : "บุคคล"}</Field>
          <Field label="สถานะ"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>{cfg.label}</span></Field>
          <Field label="เบอร์โทร">{r.tel || "—"}</Field>
          <Field label="อีเมล">{r.email || "—"}</Field>
          <Field label="วันเกิด / อายุ">{r.birthdayDm || "—"}{r.birthdayAge !== null && <span className="ml-1 text-muted">({r.birthdayAge} ปี)</span>}</Field>
          <Field label="VIP">{r.vip ? "ใช่" : "—"}</Field>
          <Field label="LINE">{r.lineId ? <span className="font-mono">{r.lineId}</span> : "—"}</Field>
          <Field label="Facebook">
            {r.facebook ? (
              r.isFbUrl
                ? <a href={r.facebook} target="_blank" rel="noreferrer noopener" className="text-primary-600 hover:underline break-all">{r.facebook.replace(/^https?:\/\/(www\.)?/, "")}</a>
                : <span className="break-all">{r.facebook}</span>
            ) : "—"}
          </Field>
          <Field label="เซลล์ผู้ดูแล"><span className="font-mono">{r.adminIDSale || "—"}</span></Field>
          <Field label="ยอดกระเป๋า"><span className="font-mono">฿{r.wallet.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></Field>
          <Field label="สมัครเมื่อ">{r.registered ? new Date(r.registered).toLocaleDateString("th-TH") : "—"}</Field>
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
            <dt className="text-[11px] uppercase tracking-wide text-muted">ที่อยู่หลัก</dt>
            <dd className="mt-0.5 text-xs text-foreground break-words">{r.address || "—"}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-[11px] font-medium text-muted">การจัดการ:</span>
          <CustomerRowActions id={r.userID} status={r.status} currentSalesRep={r.adminIDSale} />
          <ResetPwdButton userid={r.userID} />
        </div>
      </div>

      {r.juristic && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 dark:bg-blue-900/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h3 className="text-xs font-semibold text-blue-800 dark:text-blue-300">ตรวจสอบนิติบุคคล</h3>
            <span className="text-[11px] text-muted">เทียบ DBD + ตรวจเอกสาร แล้วอนุมัติได้เลย</span>
          </div>
          <JuristicInlineReview bundle={r.juristic} />
        </div>
      )}
    </div>
  );
}

/**
 * Top-of-page juristic review queue (corporate-driven · owner 2026-05-30).
 * Reads the `corporate` review rows directly (like the old /admin/juristic-check),
 * so it surfaces EVERY juristic customer awaiting review — including re-
 * registrations whose tb_users identity sits under a different member_code
 * (phone-dupe) and so never appear in the tb_users-driven list below. Each card
 * expands to the same inline review (DBD compare + hover-zoom docs + approve).
 */
export function PendingJuristicReviews({ bundles }: { bundles: JuristicBundle[] }) {
  const [open, setOpen] = useState<string | null>(bundles.length === 1 ? bundles[0].profileId : null);
  if (bundles.length === 0) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">นิติบุคคลรอตรวจสอบ ({bundles.length})</h2>
        <span className="text-[11px] text-muted">ตรวจเอกสาร + เทียบ DBD แล้วอนุมัติได้เลย — ไม่ต้องเข้าหน้าอื่น</span>
      </div>
      <div className="space-y-2">
        {bundles.map((b) => {
          const isOpen = open === b.profileId;
          return (
            <div key={b.profileId} className="rounded-lg border border-border bg-white dark:bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : b.profileId)}
                className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-alt/40"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                {b.memberCode && <span className="font-mono text-xs text-primary-600">{b.memberCode}</span>}
                <span className="font-medium">{b.companyName || b.customerName || "—"}</span>
                {b.customerName && b.companyName && <span className="text-xs text-muted">· {b.customerName}</span>}
                <span className="font-mono text-xs text-muted">{b.taxId}</span>
                {b.phone && <span className="font-mono text-xs text-muted">📞 {b.phone}</span>}
                <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">รอตรวจ</span>
              </button>
              {isOpen && (
                <div className="border-t border-border p-3">
                  <JuristicInlineReview bundle={b} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Th({
  k, children, align = "left", sortKey, sortDir, toggleSort,
}: {
  k: SortKey;
  children: React.ReactNode;
  align?: "left" | "right";
  sortKey: SortKey | null;
  sortDir: SortDir;
  toggleSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-primary-700 ${active ? "text-primary-700 font-semibold" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {children}
        {active ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
}

// ── Inline juristic review (legacy check-juristic merged into the row) ──
function JuristicInlineReview({ bundle }: { bundle: JuristicBundle }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dbd, setDbd] = useState<DbdLookupData | null>(null);
  const [dbdPending, startDbd] = useTransition();
  const [dbdErr, setDbdErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actErr, setActErr] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);

  function runDbd() {
    setDbdErr(null);
    startDbd(async () => {
      const res = await lookupDbdJuristic({ userid: bundle.userid });
      if (res.ok) setDbd(res.data ?? null);
      else setDbdErr(res.error ?? "ผิดพลาด");
    });
  }
  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setActErr(null); setActMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { setActMsg("บันทึกแล้ว"); router.refresh(); }
      else setActErr(res.error ?? "ผิดพลาด");
    });
  }

  const rows = dbd?.dbd ? computeCompareRows(dbd.dbd, dbd.pacred, dbd.taxId || bundle.taxId) : [];
  const mismatch = rows.filter((r) => r.mismatch).length;
  const dbdUrl = `https://datawarehouse.dbd.go.th/company/show/${encodeURIComponent(bundle.taxId)}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* LEFT — company info + DBD compare */}
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-white dark:bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div><span className="text-muted">เลขนิติบุคคล:</span> <span className="font-mono font-semibold">{bundle.taxId || "—"}</span></div>
            <a href={dbdUrl} target="_blank" rel="noopener noreferrer" className="ml-auto rounded border border-border px-2 py-1 text-xs text-primary-600 hover:bg-surface-alt">เปิด DBD DataWarehouse ↗</a>
          </div>
          <div className="mt-1"><span className="text-muted">ชื่อบริษัท:</span> {bundle.companyName || "—"}</div>
          <div className="mt-1"><span className="text-muted">ที่อยู่:</span> {bundle.companyAddress || "—"}</div>
        </div>

        <div className="rounded-lg border border-border bg-white dark:bg-surface p-3">
          {!dbd && !dbdPending && (
            <button type="button" onClick={runDbd} className="rounded bg-primary-50 border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">
              🔎 ตรวจสอบกับ DBD
            </button>
          )}
          {dbdPending && <p className="text-center text-xs text-muted py-3">กำลังดึงข้อมูล DBD…</p>}
          {dbdErr && <p className="text-xs text-red-700">ผิดพลาด: {dbdErr}</p>}
          {dbd && !dbd.configured && (
            <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
              DBD auto-lookup ยังไม่เปิดใช้งาน — เทียบด้วยตนเองที่ลิงก์ด้านบน + เอกสารทางขวา
            </p>
          )}
          {dbd?.dbd && (
            <>
              <p className={`mb-2 rounded px-2 py-1 text-[11px] font-medium ${mismatch > 0 ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                {mismatch > 0 ? `⚠️ ${mismatch} รายการไม่ตรง DBD (แถวแดง)` : "✅ ข้อมูลหลักตรงกับ DBD"}
              </p>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-alt text-left text-[11px] uppercase text-muted">
                    <tr><th className="px-2 py-1.5 w-1/4">รายการ</th><th className="px-2 py-1.5">DBD</th><th className="px-2 py-1.5">Pacred</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className={`border-t border-border align-top ${row.mismatch ? "bg-red-50" : ""}`}>
                        <td className="px-2 py-1.5 text-muted">{row.label}</td>
                        <td className="px-2 py-1.5">
                          {row.isStatus
                            ? (row.dbdValue ? <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${isActiveStatus(row.dbdValue) ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{row.dbdValue}</span> : <span className="text-muted/50">—</span>)
                            : (row.dbdValue || <span className="text-muted/50">—</span>)}
                        </td>
                        <td className="px-2 py-1.5">{row.pacredValue ? <span className={row.mismatch ? "font-medium text-red-700" : ""}>{row.pacredValue}</span> : <span className="text-muted/40">{row.pacredValue === null ? "(ไม่ได้เก็บ)" : "—"}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* approve / reject */}
        {bundle.corpStatus === "pending" ? (
          <div className="rounded-lg border border-border bg-white dark:bg-surface p-3 space-y-2">
            {actErr && <div className="text-[11px] text-red-700">{actErr}</div>}
            {actMsg && <div className="text-[11px] text-green-700">{actMsg}</div>}
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => act(() => verifyJuristic({ userid: bundle.userid }))}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">✅ อนุมัติสถานะบริษัท</button>
              <button type="button" disabled={pending} onClick={() => { if (!reason.trim()) { setActErr("ระบุเหตุผลก่อนปฏิเสธ"); return; } act(() => rejectJuristic({ userid: bundle.userid, reason })); }}
                className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">❌ ไม่อนุมัติ</button>
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลปฏิเสธ (กรอกก่อนกดไม่อนุมัติ)" className="w-full text-[11px] rounded border border-border px-2 py-1" />
          </div>
        ) : (
          <p className={`rounded-lg border px-3 py-2 text-xs ${bundle.corpStatus === "verified" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {bundle.corpStatus === "verified" ? "✅ ยืนยันสถานะบริษัทแล้ว" : "❌ ปฏิเสธสถานะบริษัทแล้ว"}
          </p>
        )}
      </div>

      {/* RIGHT — documents with hover-zoom */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">เอกสารแนบ (เลื่อนเมาส์บนรูปเพื่อขยายอ่านเลข)</p>
        {bundle.docs.length === 0 ? (
          <p className="rounded-lg border border-border bg-white dark:bg-surface p-6 text-center text-xs text-muted">ไม่มีเอกสารแนบ</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {bundle.docs.map((d) => (
              <div key={d.url}>
                <p className="mb-0.5 text-[11px] font-medium">{d.label}</p>
                <HoverZoomImage src={d.url} alt={d.label} mime={d.mime} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
