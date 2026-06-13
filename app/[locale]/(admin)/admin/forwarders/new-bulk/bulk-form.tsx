"use client";

/**
 * Client form for /admin/forwarders/new-bulk — BULK forwarder create.
 *
 * Shape (3 sections + rows table):
 *   1. Pick ONE customer (shared)
 *   2. Pick shared shipping options (carrier / transport / address / tax-doc)
 *   3. Edit N rows of {tracking, detail, amount}
 *   4. Submit → call `adminCreateForwarder` N times sequentially · per-row
 *      status (pending → success #ID / error message)
 *
 * Re-uses the audited customer/address pickers + the audited
 * `adminCreateForwarder` action verbatim — zero new write path (the action
 * already runs withAdmin + audit log + RBAC gate per row).
 */

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminCreateForwarder,
  fetchUsersByGroup,
  fetchAddressesByUserid,
  searchCustomers,
  type CustomerOption,
  type CustomerSearchResult,
  type AddressOption,
} from "@/actions/admin/forwarders-new";

// Mirror single form — 7 clean member-type groups · same as /admin/customers.
const CUSTOMER_GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: "general",    label: "ลูกค้าทั่วไป" },
  { value: "vip",        label: "VIP" },
  { value: "svip",       label: "SVIP" },
  { value: "corporate",  label: "นิติบุคคล" },
  { value: "credit",     label: "เครดิต" },
  { value: "comparison", label: "คิดค่าเทียบ (CPS)" },
  { value: "freight",    label: "ลูกค้า Freight" },
];

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

function customerLabel(c: CustomerOption | null | undefined): string {
  if (!c) return "—";
  const name = `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim();
  return `${c.userID} · ${name || c.userTel || "(ไม่มีชื่อ)"}`;
}

function addressFullLine(a: AddressOption): string {
  const lastname = a.addresslastname ? ` ${a.addresslastname}` : "";
  return `คุณ${a.addressname}${lastname} · ${a.addressno} · ต.${a.addresssubdistrict} อ.${a.addressdistrict} จ.${a.addressprovince} ${a.addresszipcode}`;
}

// ── Row state ──────────────────────────────────────────────
type RowStatus = "idle" | "pending" | "success" | "error";
type Row = {
  /** Stable React key — random when row is added · NOT submitted. */
  key: string;
  trackingChn: string;
  detail: string;
  amount: string;
  status: RowStatus;
  /** Server response: id on success · message on error. */
  resultId?: number;
  errorMsg?: string;
};

function makeEmptyRow(): Row {
  return {
    key: `row-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    trackingChn: "",
    detail: "",
    amount: "1",
    status: "idle",
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

  // ── Customer picker (mirrors single form simplified) ──────
  const [group, setGroup]                           = useState<string>("");
  const [coid, setCoid]                             = useState<string>(presetCoid ?? "");
  const [users, setUsers]                           = useState<CustomerSearchResult[]>(
    presetUser ? [{ ...presetUser, coID: presetCoid ?? null }] : [],
  );
  const [usersLoading, setUsersLoading]             = useState(false);
  const [userid, setUserid]                         = useState<string>(presetUser?.userID ?? "");
  const [userFilter, setUserFilter]                 = useState<string>("");
  const [userPickerOpen, setUserPickerOpen]         = useState(false);
  const [pickedCustomer, setPickedCustomer]         = useState<CustomerOption | null>(presetUser ?? null);
  const [searchResults, setSearchResults]           = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading]           = useState(false);
  const userPickerRef                               = useRef<HTMLDivElement | null>(null);

  // ── Shared shipping options ───────────────────────────────
  const [shipBy, setShipBy]                         = useState<string>("");
  const [addresses, setAddresses]                   = useState<AddressOption[]>(presetAddresses);
  const [addressesLoading, setAddressesLoading]     = useState(false);
  const [addressId, setAddressId]                   = useState<number | null>(
    presetAddresses.find((a) => a.isMain)?.addressid ?? presetAddresses[0]?.addressid ?? null,
  );
  const [transportType, setTransportType]           = useState<TransportType>("1");
  const [taxDocPref, setTaxDocPref]                 = useState<string>("receipt");

  // ── Rows (default 5 empty rows so admin can fill ทันที) ──
  const [rows, setRows] = useState<Row[]>(() => [
    makeEmptyRow(), makeEmptyRow(), makeEmptyRow(), makeEmptyRow(), makeEmptyRow(),
  ]);

  // ── Feedback ──
  const [error, setError]       = useState<string | null>(null);
  const [summary, setSummary]   = useState<{ ok: number; failed: number; total: number } | null>(null);

  // ── Outside-click for user picker ─────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setUserPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ── Group-filtered customer loader ─────────────────────────
  async function onGroupChange(g: string) {
    setGroup(g);
    setUserid("");
    setPickedCustomer(null);
    setAddresses([]);
    setAddressId(null);
    if (!g) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    const res = await fetchUsersByGroup(g as Parameters<typeof fetchUsersByGroup>[0]);
    setUsersLoading(false);
    if (res.ok) {
      setUsers(res.data?.users ?? []);
    } else {
      setError(`โหลดรายชื่อลูกค้าไม่สำเร็จ: ${res.error}`);
      setUsers([]);
    }
  }

  // ── Universal customer search (debounced) ─────────────────
  useEffect(() => {
    if (group) return; // group-mode uses pre-loaded list
    const q = userFilter.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const res = await searchCustomers(q);
      if (cancelled) return;
      setSearchLoading(false);
      if (res.ok) setSearchResults(res.data?.users ?? []);
      else setSearchResults([]);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userFilter, group]);

  // ── Pick handler — adopts customer's own coID + loads addresses ──
  async function onUserPick(picked: CustomerOption, pickedCoid?: string | null) {
    setUserid(picked.userID);
    setPickedCustomer(picked);
    if (pickedCoid !== undefined) {
      const c = (pickedCoid ?? "").trim().slice(0, 10) || "-";
      setCoid(c);
    }
    setUserFilter("");
    setUserPickerOpen(false);

    setAddressesLoading(true);
    const res = await fetchAddressesByUserid(picked.userID);
    setAddressesLoading(false);
    if (res.ok) {
      const list = res.data?.addresses ?? [];
      setAddresses(list);
      setAddressId(list.find((a) => a.isMain)?.addressid ?? list[0]?.addressid ?? null);
    } else {
      setError(`โหลดที่อยู่ไม่สำเร็จ: ${res.error}`);
      setAddresses([]);
      setAddressId(null);
    }
  }

  // ── filtered list for type-ahead within the group-loaded customers ──
  const filteredGroupUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.userID} ${u.userName ?? ""} ${u.userLastName ?? ""} ${u.userTel ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [userFilter, users]);

  const selectedUser = useMemo(
    () =>
      (pickedCustomer && pickedCustomer.userID === userid ? pickedCustomer : null) ??
      users.find((u) => u.userID === userid) ??
      (presetUser?.userID === userid ? presetUser : null),
    [userid, users, presetUser, pickedCustomer],
  );

  // ── Row helpers ─────────────────────────────────────────────
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

  // Rows ที่ "มีของจริง" (มี tracking+detail) = ตัวที่จะ submit
  const submittableRows = useMemo(
    () => rows.filter((r) => r.trackingChn.trim() && r.detail.trim()),
    [rows],
  );
  const allRowsValid = submittableRows.length > 0 && submittableRows.every((r) => {
    const n = parseInt(r.amount, 10);
    return Number.isFinite(n) && n >= 1 && n <= 10000;
  });

  // ── Submit · sequential per-row · update status live ────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    // Validate global shared fields first
    if (!coid || !userid) { setError("กรุณาเลือกลูกค้าก่อน"); return; }
    if (!shipBy) { setError("กรุณาเลือกบริษัทขนส่ง"); return; }
    if (shipBy !== "PCS" && !addressId) { setError("กรุณาเลือกที่อยู่จัดส่ง"); return; }
    if (submittableRows.length === 0) { setError("กรุณากรอกอย่างน้อย 1 รายการ (tracking + รายละเอียด)"); return; }
    if (!allRowsValid) { setError("รายการบางแถวมีข้อมูลไม่ครบ — ตรวจ tracking · รายละเอียด · จำนวน (1-10000)"); return; }

    // Lock all submittable rows to pending state
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
      // Sequential — each call has audit log + RBAC + INSERT · we keep them
      // serial so admin can see progress + the action's audit_log entries stay
      // in order. Network cost per row is small (no cover upload).
      for (const r of submittableRows) {
        const amountNum = parseInt(r.amount, 10) || 1;
        const res = await adminCreateForwarder({
          coid,
          customerUserid: userid,
          trackingChn:    r.trackingChn.trim(),
          detail:         r.detail.trim(),
          amount:         amountNum,
          shipBy,
          addressId:      shipBy === "PCS" ? null : addressId,
          transportType,
          warehouseName:  "", // server auto-detects from tracking
          taxDocPref,
        });
        if (res.ok) {
          ok++;
          setRows((prev) =>
            prev.map((x) =>
              x.key === r.key ? { ...x, status: "success", resultId: res.data?.id } : x,
            ),
          );
        } else {
          failed++;
          setRows((prev) =>
            prev.map((x) =>
              x.key === r.key ? { ...x, status: "error", errorMsg: res.error } : x,
            ),
          );
        }
      }
      setSummary({ ok, failed, total: submittableRows.length });
      // If every row succeeded → redirect after a brief celebration
      if (failed === 0 && ok > 0) {
        setTimeout(() => {
          router.push("/admin/forwarders");
          router.refresh();
        }, 1500);
      }
    });
  }

  const rowsDirty = rows.some((r) => r.trackingChn || r.detail);

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

      {/* ── SECTION 1: เลือกลูกค้า ────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">1</span>
          เลือกลูกค้า <span className="text-red-500">*</span>
          <span className="text-[10px] font-normal text-muted">(ทุกรายการในใบนี้ใช้ลูกค้าเดียวกัน)</span>
        </h2>

        <div className="grid gap-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-muted mb-1">
              ประเภทสมาชิก <span className="text-muted">· ไม่บังคับ</span>
            </label>
            <select
              value={group}
              onChange={(e) => onGroupChange(e.target.value)}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              <option value="">— ทุกประเภท —</option>
              {CUSTOMER_GROUP_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">เลือกเพื่อกรอง — หรือพิมพ์ค้นหาด้านขวาได้เลย</p>
          </div>

          <div className="md:col-span-8" ref={userPickerRef}>
            <label className="block text-xs font-medium text-muted mb-1">
              รหัส / ชื่อ / เบอร์ <span className="text-red-500">*</span>
            </label>
            {selectedUser ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
                <span className="text-emerald-700">✓</span>
                <span className="flex-1 truncate">{customerLabel(selectedUser)}</span>
                <button
                  type="button"
                  onClick={() => { setUserid(""); setPickedCustomer(null); setAddresses([]); setAddressId(null); }}
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={userFilter}
                  onChange={(e) => { setUserFilter(e.target.value); setUserPickerOpen(true); }}
                  onFocus={() => setUserPickerOpen(true)}
                  placeholder={group ? "พิมพ์ค้นหา PR1234 / ชื่อ / เบอร์ ในกลุ่มนี้" : "พิมพ์ PR1234 หรือ ชื่อ หรือ เบอร์"}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
                {userPickerOpen && (
                  <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                    {/* Group-mode list */}
                    {group ? (
                      usersLoading ? (
                        <p className="px-3 py-3 text-center text-xs text-muted">กำลังโหลด...</p>
                      ) : filteredGroupUsers.length === 0 ? (
                        <p className="px-3 py-3 text-center text-xs text-muted">ไม่พบลูกค้าในกลุ่มนี้</p>
                      ) : (
                        filteredGroupUsers.slice(0, 100).map((u) => (
                          <button
                            type="button"
                            key={u.userID}
                            onClick={() => onUserPick(u, u.coID)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-50"
                          >
                            <span className="font-mono text-xs text-primary-700">{u.userID}</span>
                            <span className="ml-2">{`${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "(ไม่มีชื่อ)"}</span>
                            {u.userTel && <span className="ml-2 text-xs text-muted">{u.userTel}</span>}
                          </button>
                        ))
                      )
                    ) : userFilter.trim().length < 2 ? (
                      <p className="px-3 py-3 text-center text-xs text-muted">พิมพ์อย่างน้อย 2 ตัวอักษร เพื่อค้นหา</p>
                    ) : searchLoading ? (
                      <p className="px-3 py-3 text-center text-xs text-muted">กำลังค้นหา...</p>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-center text-xs text-muted">ไม่พบลูกค้าที่ตรงกับ &ldquo;{userFilter}&rdquo;</p>
                    ) : (
                      searchResults.slice(0, 50).map((u) => (
                        <button
                          type="button"
                          key={u.userID}
                          onClick={() => onUserPick(u, u.coID)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-50"
                        >
                          <span className="font-mono text-xs text-primary-700">{u.userID}</span>
                          <span className="ml-2">{`${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "(ไม่มีชื่อ)"}</span>
                          {u.userTel && <span className="ml-2 text-xs text-muted">{u.userTel}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── SECTION 2: ตัวเลือกขนส่ง (shared) ────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">2</span>
          ตัวเลือกขนส่ง <span className="text-[10px] font-normal text-muted">(ใช้กับทุกรายการในใบนี้)</span>
        </h2>

        <div className="space-y-4">
          {/* Carrier */}
          <div className="grid gap-3 md:grid-cols-2">
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

          {/* Address picker — hidden when PCS pickup */}
          {shipBy !== "PCS" && shipBy !== "" && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">ที่อยู่จัดส่ง <span className="text-red-500">*</span></label>
              {!userid ? (
                <p className="text-xs text-muted italic px-3 py-2.5 rounded-xl bg-surface-alt/40">กรุณาเลือกลูกค้าก่อน เพื่อโหลดที่อยู่</p>
              ) : addressesLoading ? (
                <p className="text-xs text-muted px-3 py-2.5">กำลังโหลดที่อยู่...</p>
              ) : addresses.length === 0 ? (
                <p className="text-xs text-amber-700 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  ลูกค้านี้ยังไม่มีที่อยู่บันทึกไว้ — ขอที่อยู่ลูกค้าแล้วเพิ่มที่ /admin/customers/{userid}
                </p>
              ) : (
                <select
                  value={addressId ?? ""}
                  onChange={(e) => setAddressId(Number(e.target.value))}
                  disabled={pending}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                >
                  {addresses.map((a) => (
                    <option key={a.addressid} value={a.addressid}>
                      {a.isMain ? "[ที่อยู่หลัก] " : ""}{addressFullLine(a)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

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

      {/* ── SECTION 3: รายการ ─────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">3</span>
            รายการ <span className="text-[10px] font-normal text-muted">(กรอกเฉพาะแถวที่จะใช้ — แถวว่างจะถูกข้าม)</span>
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

        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
              <tr>
                <th className="px-2 py-2 w-10 text-center">#</th>
                <th className="px-3 py-2 text-left">เลข Tracking *</th>
                <th className="px-3 py-2 text-left">รายละเอียดสินค้า *</th>
                <th className="px-3 py-2 text-right w-24">จำนวน *</th>
                <th className="px-2 py-2 w-24 text-center">สถานะ</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const filledIn = !!(r.trackingChn.trim() || r.detail.trim());
                return (
                  <tr key={r.key} className={`border-t border-border align-top ${
                    r.status === "success" ? "bg-emerald-50/40" :
                    r.status === "error"   ? "bg-red-50/40" :
                    r.status === "pending" ? "bg-amber-50/40" :
                    filledIn               ? "bg-primary-50/20" : ""
                  }`}>
                    <td className="px-2 py-2 text-center text-xs text-muted">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.trackingChn}
                        onChange={(e) => updateRow(r.key, { trackingChn: e.target.value })}
                        disabled={pending}
                        placeholder="เช่น 1780629608"
                        className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={r.detail}
                        onChange={(e) => updateRow(r.key, { detail: e.target.value })}
                        disabled={pending}
                        placeholder="เช่น เสื้อยืดผู้หญิง · กล่อง 1"
                        className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={r.amount}
                        onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                        disabled={pending}
                        className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt"
                      />
                    </td>
                    <td className="px-2 py-2 text-center text-xs">
                      {r.status === "success" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          ✓ #{r.resultId}
                        </span>
                      )}
                      {r.status === "error" && (
                        <span
                          title={r.errorMsg ?? ""}
                          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700"
                        >
                          ✗ {r.errorMsg?.slice(0, 24) ?? "error"}
                        </span>
                      )}
                      {r.status === "pending" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          ⏳ กำลังบันทึก
                        </span>
                      )}
                      {r.status === "idle" && (
                        filledIn
                          ? <span className="text-[10px] text-muted">พร้อมส่ง</span>
                          : <span className="text-[10px] text-muted/50">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        disabled={pending || rows.length <= 1}
                        title="ลบแถวนี้"
                        className="text-muted hover:text-red-600 disabled:opacity-30"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-alt/40">
                <td colSpan={6} className="px-3 py-2 text-right text-xs text-muted">
                  จะส่ง <strong className="text-foreground">{submittableRows.length}</strong> รายการ จากทั้งหมด {rows.length} แถว
                  {rowsDirty && submittableRows.length === 0 && (
                    <span className="ml-2 text-amber-700">⚠ ต้องกรอกทั้ง tracking + รายละเอียดให้ครบจึงจะส่งได้</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── Sticky bottom CTA ────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 backdrop-blur shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex flex-col text-xs leading-tight">
            <span className="text-muted">
              ลูกค้า: <strong className="text-foreground">{customerLabel(selectedUser).slice(0, 40)}</strong> ·{" "}
              ขนส่ง: <strong className="text-foreground">{shipBy ? (SHIP_BY_OPTIONS.find((s) => s.value === shipBy)?.label.slice(0, 16) ?? shipBy) : "—"}</strong>
            </span>
            <span className="text-base font-bold mt-0.5">
              จะส่ง <span className="text-primary-600">{submittableRows.length}</span> รายการพร้อมกัน
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
              disabled={pending || submittableRows.length === 0 || !userid || !shipBy}
              className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {pending ? `⏳ กำลังบันทึก... (${submittableRows.filter((r) => r.status === "success").length}/${submittableRows.length})`
                       : `📦 บันทึก ${submittableRows.length} รายการ`}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
