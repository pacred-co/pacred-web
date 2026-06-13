"use client";

/**
 * Client form for /admin/forwarders/new-bulk — BULK forwarder create.
 *
 * v2 (2026-06-07 ภูม flag): "ไม่ใช่รายการที่เพิ่มหลายรายการ จะเป็นลูกค้า
 * คนเดียวกันไง" — bulk = ลูกค้าหลายคนในใบเดียว (ปกติแอดมินจะรับ tracking
 * จากลูกค้าหลายคนพร้อมกัน). v1 เป็นลูกค้าเดียว — pivot:
 *
 * Shape (1 shared section + per-row table):
 *   ── Shared (Section 1) — บริษัทขนส่ง · รูปแบบขนส่ง · เอกสารภาษี
 *      (ใช้ตัวเดียวกันทุก row · ปกติ batch มาจาก channel เดียว)
 *
 *   ── Per-row (Table) — # · ลูกค้า · Tracking · รายละเอียด · จำนวน
 *      · สถานะ · ✕
 *      เมื่อ user เลือกลูกค้า → adopt customer's coID + auto-load main
 *      address (no per-row address dropdown — รักษา UX ลื่น · ถ้าต้องการ
 *      address อื่นแก้ที่ /edit หลัง create)
 *
 *   ── Submit · sequential per-row · per-row status + error
 *
 * Re-uses the audited customer search action + `adminCreateForwarder`
 * verbatim — zero new write path.
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminCreateForwarder,
  fetchAddressesByUserid,
  searchCustomers,
  type CustomerOption,
  type CustomerSearchResult,
  type AddressOption,
} from "@/actions/admin/forwarders-new";

// Mirror single form — copied verbatim from legacy optionHShipByCart().
const SHIP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "PCS",  label: "🏬 รับเองโกดัง Pacred (สมุทรสาคร)" },
  { value: "2",    label: "Flash Express" },
  { value: "3",    label: "J.K. เอ็กซ์เพรส" },
  { value: "21",   label: "นิ่มซี่เส็งขนส่ง 1988" },
  { value: "5",    label: "Nim Express" },
  { value: "6",    label: "S & J ขนส่งด่วนสุพรรณบุรี" },
  { value: "7",    label: "SB สมใจขนส่ง" },
  { value: "9",    label: "เคพีเอ็น (2017)" },
  { value: "10",   label: "เฟิร์ส เอ็กเพรส ขนส่ง" },
  { value: "11",   label: "ไปรษณีย์ไทย" },
  { value: "12",   label: "จันทร์สว่างขนส่ง" },
  { value: "13",   label: "ธนามัย ขนส่งด่วน" },
  { value: "14",   label: "บุญอนันต์ขนส่ง" },
  { value: "15",   label: "พี.เจ. ด่วนอีสาน ขนส่ง" },
  { value: "16",   label: "มะม่วงขนส่ง" },
  { value: "17",   label: "วันชนะ แอนด์ วันณิสา ขนส่ง" },
  { value: "18",   label: "สมพงษ์อุบลรัตน์ ขนส่ง" },
  { value: "19",   label: "อาร์.ซี.อาร์ เพลส (r.c.r. place)" },
  { value: "20",   label: "ตองสอง ขนส่ง" },
  { value: "22",   label: "ธนาไพศาล ขนส่ง" },
  { value: "23",   label: "PL ขนส่งด่วน" },
  { value: "24",   label: "J&T Express" },
  { value: "25",   label: "มังกรทองขนส่ง 2019" },
  { value: "26",   label: "PM ชลบุรี ขนส่งด่วน" },
  { value: "27",   label: "ทรัพย์ปรีชา" },
  { value: "28",   label: "พัฒนาเอ็กซ์เพลส" },
  { value: "29",   label: "หาดใหญ่ทัวร์" },
  { value: "30",   label: "หาดใหญ่ โอ.พี. 2012" },
  { value: "31",   label: "อาร์.ซี.เอ็กซเพรส" },
  { value: "32",   label: "สี่สหาย" },
  { value: "33",   label: "แพปลา​สมบัติ​วัฒนา" },
  { value: "34",   label: "ทวีทรัพย์ระยอง" },
  { value: "35",   label: "ศิริสมบูรณ์" },
  { value: "36",   label: "นิวสอง อัศวินขนส่ง" },
  { value: "37",   label: "โชคสถาพรขนส่ง" },
  { value: "38",   label: "ทรัพย์สมบูรณ์ถาวร" },
  { value: "39",   label: "MNB Transport" },
  { value: "40",   label: "หจก.โชคพูลทรัพย์ขนส่ง 2014" },
  { value: "41",   label: "สิรินครขนส่ง" },
  { value: "42",   label: "พาณิชย์การขนส่ง KSD" },
  { value: "43",   label: "นวรรณขนส่ง" },
  { value: "44",   label: "กุญชรมณี ขนส่ง" },
  { value: "45",   label: "เอ็มพอร์ท โลจิสติกส์" },
  { value: "46",   label: "ซี.เอ็น.ทรานสปอร์ต" },
];

const TRANSPORT_OPTIONS = [
  { value: "1" as const, label: "🚛 ขนส่งทางรถ", hint: "≈ 5-7 วัน" },
  { value: "2" as const, label: "🚢 ขนส่งทางเรือ", hint: "≈ 12-16 วัน" },
];
type TransportType = (typeof TRANSPORT_OPTIONS)[number]["value"];

const TAX_DOC_OPTIONS = [
  { value: "receipt",     label: "📄 ไม่รับเอกสาร", hint: "ลูกค้าไม่ขอ" },
  { value: "tax_invoice", label: "🧾 ใบกำกับภาษี", hint: "VAT 7%" },
  { value: "customs",     label: "📜 ใบขนสินค้า",  hint: "ส่งออกเอง" },
];

function customerShortLabel(c: CustomerOption | null): string {
  if (!c) return "—";
  const name = `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim();
  return `${c.userID} · ${name || c.userTel || "(ไม่มีชื่อ)"}`;
}

// ── Per-row state ─────────────────────────────────────────────
type RowStatus = "idle" | "pending" | "success" | "error";
type Row = {
  /** Stable React key — random when row added · NOT submitted. */
  key: string;
  // Customer (per-row):
  customer: CustomerOption | null;   // null = ยังไม่เลือก
  coid: string;                       // customer's own coID (set on pick)
  addressId: number | null;           // auto = main address (loaded after pick)
  addressLoading: boolean;            // true while address fetch is in-flight
  // Tracking:
  trackingChn: string;
  detail: string;
  amount: string;
  // Submit status:
  status: RowStatus;
  resultId?: number;
  errorMsg?: string;
  // Inline customer-search UI state:
  search: string;
  searchOpen: boolean;
  searchResults: CustomerSearchResult[];
  searchLoading: boolean;
};

function makeEmptyRow(): Row {
  return {
    key: `row-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    customer: null,
    coid: "",
    addressId: null,
    addressLoading: false,
    trackingChn: "",
    detail: "",
    amount: "1",
    status: "idle",
    search: "",
    searchOpen: false,
    searchResults: [],
    searchLoading: false,
  };
}

export function AdminForwarderNewBulkForm({
  freeShipping,
  presetUser,
  presetCoid,
  presetAddresses,
}: {
  freeShipping:    boolean;
  presetUser:      CustomerOption | null;
  presetCoid:      string | null;
  presetAddresses: AddressOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── Shared shipping options (Section 1) ─────────────────────
  const [shipBy, setShipBy]               = useState<string>("");
  const [transportType, setTransportType] = useState<TransportType>("1");
  const [taxDocPref, setTaxDocPref]       = useState<string>("receipt");

  // ── Rows (default 5 empty) — multi-customer per row ─────────
  const [rows, setRows] = useState<Row[]>(() => {
    const defaults = [
      makeEmptyRow(),
      makeEmptyRow(),
      makeEmptyRow(),
      makeEmptyRow(),
      makeEmptyRow(),
    ];
    // If page opened with ?q=PR1234 preset, pre-fill the first row's customer
    // so admin opens the form ready (rest of the rows still empty).
    if (presetUser) {
      const main = presetAddresses.find((a) => a.isMain)?.addressid ?? presetAddresses[0]?.addressid ?? null;
      defaults[0] = {
        ...defaults[0],
        customer: presetUser,
        coid: (presetCoid ?? "").trim().slice(0, 10) || "-",
        addressId: main,
      };
    }
    return defaults;
  });

  // ── Feedback ─────────────────────────────────────────────────
  const [error, setError]     = useState<string | null>(null);
  const [summary, setSummary] = useState<{ ok: number; failed: number; total: number } | null>(null);

  // ── Row helpers ──────────────────────────────────────────────
  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow()]);
  }
  function addManyRows(n: number) {
    setRows((prev) => [...prev, ...Array.from({ length: n }, makeEmptyRow)]);
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // ── On-pick — adopt customer's coID + load main address ──────
  async function pickCustomer(rowKey: string, picked: CustomerSearchResult) {
    const coid = (picked.coID ?? "").trim().slice(0, 10) || "-";
    updateRow(rowKey, {
      customer: { userID: picked.userID, userName: picked.userName, userLastName: picked.userLastName, userTel: picked.userTel },
      coid,
      addressLoading: true,
      addressId: null,
      search: "",
      searchOpen: false,
      searchResults: [],
    });

    const res = await fetchAddressesByUserid(picked.userID);
    if (res.ok) {
      const list = res.data?.addresses ?? [];
      const mainId = list.find((a) => a.isMain)?.addressid ?? list[0]?.addressid ?? null;
      updateRow(rowKey, { addressLoading: false, addressId: mainId });
    } else {
      updateRow(rowKey, { addressLoading: false, addressId: null });
      setError(`โหลดที่อยู่ลูกค้า ${picked.userID} ไม่สำเร็จ: ${res.error}`);
    }
  }

  function clearCustomer(rowKey: string) {
    updateRow(rowKey, {
      customer: null,
      coid: "",
      addressId: null,
      search: "",
      searchOpen: false,
      searchResults: [],
    });
  }

  // ── Submittable rows (customer + tracking + detail filled · amount 1-10000) ──
  const submittableRows = rows.filter((r) => {
    if (!r.customer || !r.trackingChn.trim() || !r.detail.trim()) return false;
    const n = parseInt(r.amount, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10000) return false;
    // Address requirement: if shipBy != PCS, row must have addressId
    if (shipBy && shipBy !== "PCS" && !r.addressId) return false;
    return true;
  });

  // ── Submit · sequential per-row ──────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    if (!shipBy) { setError("กรุณาเลือกบริษัทขนส่ง"); return; }
    if (submittableRows.length === 0) {
      setError("กรุณากรอกอย่างน้อย 1 รายการ — ต้องมี ลูกค้า · tracking · รายละเอียด ครบทุกแถวที่จะส่ง");
      return;
    }

    // Lock submittable rows to pending state
    setRows((prev) =>
      prev.map((r) =>
        submittableRows.some((s) => s.key === r.key)
          ? { ...r, status: "pending" as RowStatus, resultId: undefined, errorMsg: undefined }
          : r,
      ),
    );

    startTransition(async () => {
      let ok = 0;
      let failed = 0;
      // Sequential — audit_log entries stay in order · admin sees progress
      for (const r of submittableRows) {
        const amountNum = parseInt(r.amount, 10) || 1;
        const res = await adminCreateForwarder({
          coid:           r.coid,
          customerUserid: r.customer!.userID,
          trackingChn:    r.trackingChn.trim(),
          detail:         r.detail.trim(),
          amount:         amountNum,
          shipBy,
          addressId:      shipBy === "PCS" ? null : r.addressId,
          transportType,
          warehouseName:  "", // server auto-detects from tracking prefix
          taxDocPref,
        });
        if (res.ok) {
          ok++;
          setRows((prev) =>
            prev.map((x) =>
              x.key === r.key ? { ...x, status: "success" as RowStatus, resultId: res.data?.id } : x,
            ),
          );
        } else {
          failed++;
          setRows((prev) =>
            prev.map((x) =>
              x.key === r.key ? { ...x, status: "error" as RowStatus, errorMsg: res.error } : x,
            ),
          );
        }
      }
      setSummary({ ok, failed, total: submittableRows.length });
      // If every row succeeded → redirect after brief celebration
      if (failed === 0 && ok > 0) {
        setTimeout(() => {
          router.push("/admin/forwarders");
          router.refresh();
        }, 1500);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* ── Global toast ──────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
        </div>
      )}
      {summary && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          summary.failed === 0
            ? "border-green-200 bg-green-50 text-green-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          {summary.failed === 0 ? "✅" : "⚠️"} สรุป: สร้างสำเร็จ <strong>{summary.ok}</strong>/{summary.total} รายการ
          {summary.failed > 0 && <> · ผิดพลาด <strong>{summary.failed}</strong> รายการ (ดูข้อความข้างแต่ละแถว)</>}
          {summary.failed === 0 && <> · กำลังพาไปหน้ารายการ...</>}
        </div>
      )}

      {/* ── SECTION 1: ตัวเลือกขนส่ง (shared) ────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">1</span>
          ตัวเลือกขนส่ง <span className="text-[10px] font-normal text-muted">(ใช้กับทุกรายการในใบนี้ · ลูกค้าแยกตามแถว)</span>
        </h2>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Carrier */}
            <div>
              <label className="block text-xs font-medium text-muted mb-1">บริษัทขนส่ง <span className="text-red-500">*</span></label>
              <select
                value={shipBy}
                onChange={(e) => setShipBy(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="">— กรุณาเลือก —</option>
                {freeShipping && <option value="PCSF">📦 PCSF · เหมาๆ 50 บาท</option>}
                {SHIP_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {shipBy === "PCS" && (
                <p className="mt-1 text-[11px] text-emerald-700">ลูกค้ามารับเองที่โกดัง Pacred (สมุทรสาคร) · ไม่ต้องเลือกที่อยู่</p>
              )}
              {shipBy && shipBy !== "PCS" && (
                <p className="mt-1 text-[11px] text-muted">ที่อยู่จัดส่งใช้ <strong>ที่อยู่หลัก</strong>ของลูกค้าแต่ละราย · ถ้าต้องการเปลี่ยน แก้ที่ /edit หลังสร้าง</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">รูปแบบขนส่งจีน-ไทย <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSPORT_OPTIONS.map((t) => (
                  <label
                    key={t.value}
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      transportType === t.value
                        ? "border-primary-500 bg-primary-50 text-primary-700"
                        : "border-border bg-white hover:bg-surface-alt"
                    }`}
                  >
                    <input type="radio" name="transport" value={t.value} checked={transportType === t.value} onChange={() => setTransportType(t.value)} className="sr-only" />
                    <span>{t.label}</span>
                    <span className="text-[10px] text-muted">{t.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Tax-doc choice */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">เอกสารภาษีของลูกค้า</label>
            <div className="grid grid-cols-3 gap-2">
              {TAX_DOC_OPTIONS.map((d) => (
                <label
                  key={d.value}
                  className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-xs transition ${
                    taxDocPref === d.value
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-border bg-white hover:bg-surface-alt"
                  }`}
                >
                  <input type="radio" name="taxdoc" value={d.value} checked={taxDocPref === d.value} onChange={() => setTaxDocPref(d.value)} className="sr-only" />
                  <span className="font-medium">{d.label}</span>
                  <span className="text-[10px] text-muted">{d.hint}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: รายการ (per-row customer) ───────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">2</span>
            รายการ <span className="text-[10px] font-normal text-muted">(เลือกลูกค้า + tracking ต่อแถว · แถวว่างจะถูกข้าม)</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addManyRows(5)}
              disabled={pending}
              className="rounded-md border border-border bg-white px-2.5 py-1 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              + 5 แถว
            </button>
            <button
              type="button"
              onClick={addRow}
              disabled={pending}
              className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
            >
              + เพิ่ม 1 แถว
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((r, idx) => (
            <BulkRow
              key={r.key}
              row={r}
              idx={idx}
              pending={pending}
              shipBy={shipBy}
              onPatch={(patch) => updateRow(r.key, patch)}
              onPick={(picked) => pickCustomer(r.key, picked)}
              onClear={() => clearCustomer(r.key)}
              onRemove={() => removeRow(r.key)}
              canRemove={rows.length > 1}
            />
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-border text-xs text-muted">
          จะส่ง <strong className="text-foreground">{submittableRows.length}</strong> รายการ จากทั้งหมด {rows.length} แถว
          {rows.some((r) => (r.customer || r.trackingChn || r.detail) && !submittableRows.some((s) => s.key === r.key)) && (
            <span className="ml-2 text-amber-700">⚠ บางแถวข้อมูลไม่ครบ (ต้องมี ลูกค้า · tracking · รายละเอียด · จำนวน)</span>
          )}
        </div>
      </section>

      {/* ── Sticky bottom CTA ────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 backdrop-blur shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex flex-col text-xs leading-tight">
            <span className="text-muted">
              ขนส่ง: <strong className="text-foreground">{shipBy ? (SHIP_BY_OPTIONS.find((s) => s.value === shipBy)?.label.slice(0, 24) ?? shipBy) : "—"}</strong>
              {shipBy && <> · {TRANSPORT_OPTIONS.find((t) => t.value === transportType)?.label}</>}
            </span>
            <span className="text-base font-bold mt-0.5">
              จะส่ง <span className="text-primary-600">{submittableRows.length}</span> รายการพร้อมกัน
              {submittableRows.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted">
                  ({new Set(submittableRows.map((r) => r.customer!.userID)).size} ลูกค้า)
                </span>
              )}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/forwarders")}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || submittableRows.length === 0 || !shipBy}
              className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {pending ? `⏳ กำลังบันทึก... (${rows.filter((r) => r.status === "success").length}/${submittableRows.length})`
                       : `📦 บันทึก ${submittableRows.length} รายการ`}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// <BulkRow> — one row in the bulk editor · 5 cells stacked on mobile,
// horizontal grid on desktop. Customer picker is inline (search input
// → autocomplete dropdown → select chip with "เปลี่ยน" link).
// ─────────────────────────────────────────────────────────────────────
function BulkRow({
  row,
  idx,
  pending,
  shipBy,
  onPatch,
  onPick,
  onClear,
  onRemove,
  canRemove,
}: {
  row: Row;
  idx: number;
  pending: boolean;
  shipBy: string;
  onPatch: (patch: Partial<Row>) => void;
  onPick: (picked: CustomerSearchResult) => void;
  onClear: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const searchRef = useRef<HTMLDivElement | null>(null);

  // outside-click close
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        onPatch({ searchOpen: false });
      }
    }
    if (row.searchOpen) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [row.searchOpen, onPatch]);

  // debounced search (uses universal searchCustomers action)
  useEffect(() => {
    const q = row.search.trim();
    if (q.length < 2) {
      // clear previous results if user emptied the field
      if (row.searchResults.length > 0 || row.searchLoading) {
        onPatch({ searchResults: [], searchLoading: false });
      }
      return;
    }
    let cancelled = false;
    onPatch({ searchLoading: true });
    const t = setTimeout(async () => {
      const res = await searchCustomers(q);
      if (cancelled) return;
      if (res.ok) {
        onPatch({ searchResults: res.data?.customers ?? [], searchLoading: false });
      } else {
        onPatch({ searchResults: [], searchLoading: false });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.search]);

  const filled = !!(row.customer || row.trackingChn || row.detail);
  const rowBg =
    row.status === "success" ? "bg-emerald-50/50 border-emerald-200" :
    row.status === "error"   ? "bg-red-50/50 border-red-200" :
    row.status === "pending" ? "bg-amber-50/50 border-amber-200" :
    filled                   ? "bg-primary-50/20 border-border" :
                               "bg-white border-border";

  return (
    <div className={`rounded-lg border p-3 ${rowBg}`}>
      <div className="flex items-start gap-2">
        {/* Row number */}
        <div className="shrink-0 flex flex-col items-center gap-1 pt-1">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-alt text-xs font-semibold text-muted">
            {idx + 1}
          </span>
        </div>

        {/* Main content — 2x grid on mobile, 4-col on desktop */}
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-2">
          {/* Customer (4 cols desktop) */}
          <div className="md:col-span-4 min-w-0" ref={searchRef}>
            {row.customer ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs">
                <span className="text-emerald-700">✓</span>
                <span className="flex-1 truncate font-medium" title={customerShortLabel(row.customer)}>
                  {customerShortLabel(row.customer)}
                </span>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={pending}
                  className="text-[10px] text-muted hover:text-foreground underline shrink-0"
                >
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={row.search}
                  onChange={(e) => onPatch({ search: e.target.value, searchOpen: true })}
                  onFocus={() => onPatch({ searchOpen: true })}
                  disabled={pending}
                  placeholder={`ลูกค้า — PR1234 / ชื่อ / เบอร์`}
                  className="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
                />
                {row.searchOpen && row.search.trim().length >= 2 && (
                  <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-white shadow-lg">
                    {row.searchLoading ? (
                      <p className="px-2.5 py-2 text-center text-[11px] text-muted">กำลังค้นหา...</p>
                    ) : row.searchResults.length === 0 ? (
                      <p className="px-2.5 py-2 text-center text-[11px] text-muted">ไม่พบลูกค้า</p>
                    ) : (
                      row.searchResults.slice(0, 30).map((u) => (
                        <button
                          type="button"
                          key={u.userID}
                          onClick={() => onPick(u)}
                          className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-primary-50"
                        >
                          <span className="font-mono text-[10px] text-primary-700">{u.userID}</span>
                          <span className="ml-1.5">{`${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "(ไม่มีชื่อ)"}</span>
                          {u.userTel && <span className="ml-1.5 text-[10px] text-muted">{u.userTel}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {row.searchOpen && row.search.trim().length > 0 && row.search.trim().length < 2 && (
                  <p className="absolute z-30 mt-1 w-full rounded-md border border-border bg-white px-2.5 py-2 text-center text-[11px] text-muted shadow-sm">
                    พิมพ์อย่างน้อย 2 ตัวอักษร
                  </p>
                )}
              </div>
            )}
            {row.addressLoading && (
              <p className="mt-1 text-[10px] text-muted">กำลังโหลดที่อยู่...</p>
            )}
            {row.customer && shipBy && shipBy !== "PCS" && !row.addressLoading && !row.addressId && (
              <p className="mt-1 text-[10px] text-amber-700">⚠ ลูกค้านี้ยังไม่มีที่อยู่ — เพิ่มที่ /admin/customers/{row.customer.userID}</p>
            )}
          </div>

          {/* Tracking (4 cols) */}
          <div className="md:col-span-4 min-w-0">
            <input
              type="text"
              value={row.trackingChn}
              onChange={(e) => onPatch({ trackingChn: e.target.value })}
              disabled={pending}
              placeholder="เลข Tracking · เช่น 1780629608"
              className="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
            />
          </div>

          {/* Detail (3 cols) */}
          <div className="md:col-span-3 min-w-0">
            <input
              type="text"
              value={row.detail}
              onChange={(e) => onPatch({ detail: e.target.value })}
              disabled={pending}
              placeholder="รายละเอียด · เช่น เสื้อยืด กล่อง 1"
              className="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
            />
          </div>

          {/* Amount (1 col) */}
          <div className="md:col-span-1 min-w-0">
            <input
              type="number"
              min={1}
              max={10000}
              value={row.amount}
              onChange={(e) => onPatch({ amount: e.target.value })}
              disabled={pending}
              placeholder="จำนวน"
              className="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
            />
          </div>
        </div>

        {/* Status + remove */}
        <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
          {/* Status chip */}
          <div className="text-[10px]">
            {row.status === "success" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                ✓ #{row.resultId}
              </span>
            )}
            {row.status === "error" && (
              <span
                title={row.errorMsg ?? ""}
                className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700"
              >
                ✗ {(row.errorMsg ?? "error").slice(0, 16)}
              </span>
            )}
            {row.status === "pending" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                ⏳ กำลังบันทึก
              </span>
            )}
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              title="ลบแถวนี้"
              className="text-muted hover:text-red-600 disabled:opacity-30 text-sm leading-none"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
