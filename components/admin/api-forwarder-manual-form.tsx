"use client";

/**
 * Shared client form for /admin/api-forwarder-momo/manual and
 * /admin/api-forwarder-cn/manual — Wave 17 P1-1+2.
 *
 * Why parameterized: legacy `pageManualUpdate.php` for MOMO and CN are
 * byte-identical (only the URL ribbon differs). The two routes wrap this
 * component with `carrier="momo"` or `carrier="cn"` and pass the matching
 * label + breadcrumb to the form.
 *
 * Per docs/learnings/pacred-design-philosophy.md:
 *   - Legacy = workflow source (14 input fields · date format · INSERT shape)
 *   - Pacred = UI source (Tailwind cards · single-row entry · sticky submit)
 *
 * Field source: legacy `pageManualUpdate.php` L271-520 — note the legacy
 * page actually displays a TABLE of rows (one per row from the upstream
 * `tb_tmp_forwarder_item_momo`). Each table row has its own <form> with the
 * 14 inputs + a submit button. The admin clicks "สร้างใหม่" / "อัปเดต..."
 * on individual rows to insert/update them ONE at a time.
 *
 * We've simplified to a SINGLE-entry form (one row at a time) — the legacy
 * batch-table flow depends on the `tb_tmp_forwarder_item_momo` API-staging
 * table which Wave 17 doesn't port (P2). Admin can still enter 1 row,
 * submit, get "เพิ่มอีก 1?" feedback, repeat.
 *
 * Cascade order:
 *   user search → onPick → fetch their addresses
 *   fShipBy='PCS' → hide address picker (use hardcoded PCS pickup)
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminApiForwarderManualInsert,
  fetchUsersByQuery,
  type Carrier,
  type ManualCustomerOption,
} from "@/actions/admin/api-forwarder-manual";
import { fetchAddressesByUserid, type AddressOption } from "@/actions/admin/forwarders-new";

// Same ship-by list as Wave 12-C v2 (legacy optionHShipBy/optionHShipByCart).
// "PCS" + numerical IDs from tb_ship_by. Mirrors components/admin pattern.
const SHIP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "PCS",  label: "🏬 รับเองโกดัง PCS กทม"        },
  { value: "2",    label: "Flash Express"                  },
  { value: "3",    label: "J.K. เอ็กซ์เพรส"                 },
  { value: "21",   label: "นิ่มซี่เส็งขนส่ง 1988"             },
  { value: "5",    label: "Nim Express"                    },
  { value: "11",   label: "ไปรษณีย์ไทย"                     },
  { value: "24",   label: "J&T Express"                     },
  { value: "1",    label: "DHL Express"                    },
  { value: "4",    label: "Kerry Express"                   },
];

const TRANSPORT_OPTIONS = [
  { value: "EK"  as const, label: "✈️ EK — ทางอากาศ (เร็ว)" },
  { value: "SEA" as const, label: "🚢 SEA — ทางเรือ (ประหยัด)" },
];

const PRODUCT_TYPE_OPTIONS = [
  { value: "1" as const, label: "ทั่วไป" },
  { value: "2" as const, label: "มอก." },
  { value: "3" as const, label: "อย./น้ำยา" },
  { value: "4" as const, label: "พิเศษ" },
];

const PRODUCT_COST_TYPE_OPTIONS = [
  { value: ""  as const, label: "— ไม่มีค่าใช้จ่ายเพิ่ม —" },
  { value: "1" as const, label: "ค่าตีลังไม้" },
  { value: "2" as const, label: "ค่าขนส่งในจีน (到付)" },
];

type TransportCode = (typeof TRANSPORT_OPTIONS)[number]["value"];
type ProductTypeCode = (typeof PRODUCT_TYPE_OPTIONS)[number]["value"];
type ProductCostCodeType = (typeof PRODUCT_COST_TYPE_OPTIONS)[number]["value"];

function customerLabel(c: ManualCustomerOption | null | undefined): string {
  if (!c) return "—";
  const name = `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim();
  return `${c.userID} · ${name || c.userTel || "(ไม่มีชื่อ)"}`;
}

function addressFullLine(a: AddressOption): string {
  const lastname = a.addresslastname ? ` ${a.addresslastname}` : "";
  return `คุณ${a.addressname}${lastname} · ${a.addressno} · ต.${a.addresssubdistrict} อ.${a.addressdistrict} จ.${a.addressprovince} ${a.addresszipcode}`;
}

// Today as dd/mm/yyyy — matches the legacy `daterangepicker` default format.
function todayDdMmYyyy(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

export function ApiForwarderManualForm({
  carrier,
  carrierLabel,
}: {
  carrier:      Carrier;
  carrierLabel: string;  // "MOMO" or "CargoCenter" — shown on the submit button + toast
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── identity inputs ─────────────────────────────────────
  const [productID, setProductID]   = useState("");
  const [smCode, setSmCode]         = useState("");
  const [tracking, setTracking]     = useState("");

  // ── customer picker ─────────────────────────────────────
  const [userQuery, setUserQuery]   = useState("");
  const [userResults, setUserResults] = useState<ManualCustomerOption[]>([]);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManualCustomerOption | null>(null);
  const [subUserID, setSubUserID]   = useState("");
  const userPickerRef = useRef<HTMLDivElement | null>(null);

  // ── package metrics ─────────────────────────────────────
  const [productQTY, setProductQTY]       = useState("1");
  const [productType, setProductType]     = useState<ProductTypeCode>("1");
  const [productWeight, setProductWeight] = useState("");
  const [productWidth, setProductWidth]   = useState("");
  const [productLength, setProductLength] = useState("");
  const [productHeight, setProductHeight] = useState("");
  const [productCBM, setProductCBM]       = useState("");

  // ── cost CHN ─────────────────────────────────────────────
  const [productCostCHN, setProductCostCHN] = useState("");
  const [productCostCHNType, setProductCostCHNType] = useState<ProductCostCodeType>("");

  // ── dates ────────────────────────────────────────────────
  const [date1, setDate1]               = useState<string>(todayDdMmYyyy());
  const [manifestDate, setManifestDate] = useState<string>("");

  // ── transport ────────────────────────────────────────────
  const [transportCode, setTransportCode] = useState<TransportCode>("EK");
  const [containerCode, setContainerCode] = useState("");

  // ── shipping ─────────────────────────────────────────────
  const [shipBy, setShipBy]                       = useState<string>("PCS");
  const [addresses, setAddresses]                 = useState<AddressOption[]>([]);
  const [addressesLoading, setAddressesLoading]   = useState(false);
  const [addressID, setAddressID]                 = useState<number | null>(null);

  // ── feedback ─────────────────────────────────────────────
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number; fIDorCO: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  // ── outside-click for user picker ───────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setUserPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ── debounce search ─────────────────────────────────────
  // Pattern note: React 19.2's lint rejects synchronous setState calls in
  // an effect body (it triggers cascading renders). We let the debounce
  // timer always run; the timer handler decides whether to fetch or clear.
  useEffect(() => {
    const q = userQuery.trim();
    const tooShort = !q || q.length < 2 || !!selectedUser;
    const handle = setTimeout(async () => {
      if (tooShort) {
        setUserResults([]);
        return;
      }
      const res = await fetchUsersByQuery(q);
      if (res.ok) {
        setUserResults(res.data?.users ?? []);
      } else {
        setUserResults([]);
      }
    }, tooShort ? 0 : 250);
    return () => clearTimeout(handle);
  }, [userQuery, selectedUser]);

  async function onUserPick(picked: ManualCustomerOption) {
    setSelectedUser(picked);
    setUserPickerOpen(false);
    setUserQuery("");
    setFieldErrors((p) => { const n = new Set(p); n.delete("userID"); return n; });

    // Load addresses
    setAddressesLoading(true);
    const res = await fetchAddressesByUserid(picked.userID);
    setAddressesLoading(false);
    if (res.ok) {
      const list = res.data?.addresses ?? [];
      setAddresses(list);
      setAddressID(list.find((a) => a.isMain)?.addressid ?? list[0]?.addressid ?? null);
    } else {
      setAddresses([]);
      setAddressID(null);
      setError(`โหลดที่อยู่ไม่สำเร็จ: ${res.error}`);
    }
  }

  function resetForm() {
    setProductID(""); setSmCode(""); setTracking("");
    setSelectedUser(null); setUserQuery(""); setSubUserID("");
    setProductQTY("1"); setProductType("1");
    setProductWeight(""); setProductWidth(""); setProductLength(""); setProductHeight(""); setProductCBM("");
    setProductCostCHN(""); setProductCostCHNType("");
    setDate1(todayDdMmYyyy()); setManifestDate("");
    setTransportCode("EK"); setContainerCode("");
    setShipBy("PCS"); setAddresses([]); setAddressID(null);
    setError(null);
    setFieldErrors(new Set());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const errs = new Set<string>();
    if (!productID.trim())     errs.add("productID");
    if (!smCode.trim())        errs.add("smCode");
    if (!tracking.trim())      errs.add("tracking");
    if (!selectedUser)         errs.add("userID");
    if (!productQTY)           errs.add("productQTY");
    if (!date1.trim())         errs.add("date1");
    if (!shipBy)               errs.add("shipBy");
    if (shipBy !== "PCS" && !addressID) errs.add("addressID");

    setFieldErrors(errs);
    if (errs.size > 0) {
      setError("กรอกข้อมูลให้ครบช่องที่ขีดเส้นแดง");
      return;
    }
    if (!selectedUser) return;  // narrow for TS

    startTransition(async () => {
      const result = await adminApiForwarderManualInsert(carrier, {
        productID:          productID.trim(),
        sm_code:            smCode.trim(),
        productTracking:    tracking.trim(),
        userID:             selectedUser.userID,
        subUserID:          subUserID.trim(),
        productQTY:         parseInt(productQTY, 10) || 1,
        productTypeCode:    productType,
        productWeightAll:   parseFloat(productWeight) || 0,
        productWidth:       parseFloat(productWidth) || 0,
        productLength:      parseFloat(productLength) || 0,
        productHeight:      parseFloat(productHeight) || 0,
        productCBMAll:      parseFloat(productCBM) || 0,
        productCostCHN:     parseFloat(productCostCHN) || 0,
        productCostCHNType: productCostCHNType,
        date1:              date1.trim(),
        manifest_date:      manifestDate.trim(),
        transport_code:     transportCode,
        container_code:     containerCode.trim(),
        fShipBy:            shipBy,
        addressID:          shipBy === "PCS" ? null : addressID,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      const data = result.data;
      if (data) {
        setSuccess({ id: data.id, fIDorCO: data.fIDorCO });
        // Keep the customer + ship-by + transport pre-filled · clear the
        // per-row inputs so admin can enter another row immediately.
        setProductID(""); setSmCode(""); setTracking("");
        setProductWeight(""); setProductWidth(""); setProductLength(""); setProductHeight(""); setProductCBM("");
        setProductCostCHN(""); setProductCostCHNType("");
        setContainerCode("");
        setManifestDate("");
      }
    });
  }

  const hasFieldError = (k: string) => fieldErrors.has(k);
  const errCls = (k: string) =>
    hasFieldError(k)
      ? "border-red-400 ring-1 ring-red-200 focus:border-red-500 focus:ring-red-300"
      : "border-border focus:border-primary-500 focus:ring-primary-200";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* ── Toasts ─────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✓ เพิ่มสำเร็จ — <strong>#{success.fIDorCO}</strong> (id={success.id}) ·{" "}
          <a
            href={`/admin/forwarders/${success.id}`}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-green-700"
          >ดูรายการที่เพิ่ม →</a>
          <span className="ml-3 text-xs text-green-700">
            พร้อมกรอกรายการถัดไป (ลูกค้า + ขนส่งยังจำไว้)
          </span>
        </div>
      )}

      {/* ── 1) Customer picker ─────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          👤 เลือกสมาชิก <span className="text-red-500">*</span>
        </h2>

        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          {/* userID search */}
          <div ref={userPickerRef}>
            <label className="block text-xs font-medium text-muted mb-1">
              ค้นหารหัสสมาชิก (userID / ชื่อ / เบอร์) <span className="text-red-500">*</span>
            </label>
            {selectedUser ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-green-300 bg-green-50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-green-900 truncate">
                    ✓ {customerLabel(selectedUser)}
                  </div>
                  {selectedUser.userTel && (
                    <div className="text-xs text-green-700 mt-0.5">เบอร์ {selectedUser.userTel}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedUser(null); setAddresses([]); setAddressID(null); setUserQuery(""); setUserPickerOpen(true); }}
                  className="rounded-md border border-green-300 bg-white px-2.5 py-1 text-xs text-green-700 hover:bg-green-100"
                  disabled={pending}
                >
                  เปลี่ยน
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => { setUserQuery(e.target.value); setUserPickerOpen(true); }}
                  onFocus={() => setUserPickerOpen(true)}
                  placeholder="พิมพ์ PR1234 · ชื่อ · เบอร์ (อย่างน้อย 2 ตัวอักษร)"
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("userID")}`}
                  disabled={pending}
                  autoComplete="off"
                />
                {userPickerOpen && userResults.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                    {userResults.map((u) => (
                      <button
                        key={u.userID}
                        type="button"
                        onClick={() => onUserPick(u)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-alt"
                      >
                        <span className="font-mono text-primary-600">{u.userID}</span>
                        <span className="mx-1.5 text-muted">·</span>
                        <span>{`${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "(ไม่มีชื่อ)"}</span>
                        {u.userTel && <span className="ml-2 text-xs text-muted">{u.userTel}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {userPickerOpen && userQuery.trim().length >= 2 && userResults.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted shadow-lg">
                    ไม่พบสมาชิก
                  </div>
                )}
              </div>
            )}
          </div>

          {/* subUserID */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              รหัสย่อย (ถ้ามี)
            </label>
            <input
              type="text"
              value={subUserID}
              onChange={(e) => setSubUserID(e.target.value)}
              maxLength={20}
              placeholder="เช่น PW2465"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
            />
          </div>
        </div>
      </section>

      {/* ── 2) Shipment identity ────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📦 รายการนำเข้า · รหัส / Tracking
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              productID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={productID}
              onChange={(e) => { setProductID(e.target.value); setFieldErrors((p) => { const n = new Set(p); n.delete("productID"); return n; }); }}
              maxLength={50}
              placeholder="ID จากระบบ MOMO/CN"
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("productID")}`}
              disabled={pending}
              required
            />
            <p className="mt-1 text-[11px] text-muted">จะถูกแปลงเป็น <code className="rounded bg-surface-alt px-1">CC{productID || "<id>"}</code> เป็น fIDorCO</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              SM Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={smCode}
              onChange={(e) => { setSmCode(e.target.value); setFieldErrors((p) => { const n = new Set(p); n.delete("smCode"); return n; }); }}
              maxLength={60}
              placeholder="SM-USERID-HNO"
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("smCode")}`}
              disabled={pending}
              required
            />
            <p className="mt-1 text-[11px] text-muted">ใช้แยกด้วย <code>-</code> ส่วนแรก = smPCS</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Tracking (CHN) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={tracking}
              onChange={(e) => { setTracking(e.target.value); setFieldErrors((p) => { const n = new Set(p); n.delete("tracking"); return n; }); }}
              maxLength={50}
              placeholder="เลข Tracking ฝั่งจีน"
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("tracking")}`}
              disabled={pending}
              required
            />
          </div>
        </div>
      </section>

      {/* ── 3) Package metrics ────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📐 ข้อมูลพัสดุ
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              จำนวน (กล่อง) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={productQTY}
              onChange={(e) => setProductQTY(e.target.value)}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("productQTY")}`}
              disabled={pending}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ประเภทสินค้า <span className="text-red-500">*</span>
            </label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductTypeCode)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
              required
            >
              {PRODUCT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">น้ำหนัก (kg)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={productWeight}
              onChange={(e) => setProductWeight(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">กว้าง (cm)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={productWidth}
              onChange={(e) => setProductWidth(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">ยาว (cm)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={productLength}
              onChange={(e) => setProductLength(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">สูง (cm)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={productHeight}
              onChange={(e) => setProductHeight(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">ปริมาตร CBM</label>
            <input
              type="number"
              min={0}
              step="0.00001"
              value={productCBM}
              onChange={(e) => setProductCBM(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
              placeholder="0.00000"
            />
          </div>
        </div>

        {/* Cost-CHN split (legacy productCostCHN + productCostCHNType) */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ค่าใช้จ่ายในจีน (บาท)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={productCostCHN}
              onChange={(e) => setProductCostCHN(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ประเภทค่าใช้จ่ายจีน
            </label>
            <select
              value={productCostCHNType}
              onChange={(e) => setProductCostCHNType(e.target.value as ProductCostCodeType)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending || parseFloat(productCostCHN || "0") === 0}
            >
              {PRODUCT_COST_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── 4) Transport + container + dates ──────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          🚚 ขนส่ง · ตู้ · วันที่
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ขนส่งทาง <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRANSPORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setTransportCode(o.value)}
                  disabled={pending}
                  className={`rounded-xl border px-4 py-2.5 text-sm text-left transition ${
                    transportCode === o.value
                      ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                      : "border-border bg-white text-muted hover:bg-surface-alt"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              เลขที่ตู้ (Cabinet)
            </label>
            <input
              type="text"
              value={containerCode}
              onChange={(e) => setContainerCode(e.target.value)}
              maxLength={50}
              placeholder="เช่น GZE25060001 (ถ้ามี)"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              วันที่เข้าโกดังจีน (dd/mm/yyyy) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={date1}
              onChange={(e) => { setDate1(e.target.value); setFieldErrors((p) => { const n = new Set(p); n.delete("date1"); return n; }); }}
              placeholder="วว/ดด/ปปปป"
              pattern="\d{1,2}/\d{1,2}/\d{4}"
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("date1")}`}
              disabled={pending}
              required
            />
            <p className="mt-1 text-[11px] text-muted">ใส่รูปแบบ dd/mm/yyyy เช่น 23/05/2026</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              วันที่ออกโกดังจีน (dd/mm/yyyy)
            </label>
            <input
              type="text"
              value={manifestDate}
              onChange={(e) => setManifestDate(e.target.value)}
              placeholder="ปล่อยว่างถ้ายังไม่ออก (สถานะ = 2)"
              pattern="\d{1,2}/\d{1,2}/\d{4}"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              disabled={pending}
            />
            <p className="mt-1 text-[11px] text-muted">ใส่ → สถานะ = 3 (ออกจีนแล้ว · ระบบจะคำนวณวันถึงไทย +7/+14 อัตโนมัติ)</p>
          </div>
        </div>
      </section>

      {/* ── 5) ShipBy + address ───────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📬 บริษัทขนส่งปลายทาง · ที่อยู่
        </h2>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            บริษัทขนส่งปลายทาง (fShipBy) <span className="text-red-500">*</span>
          </label>
          <select
            value={shipBy}
            onChange={(e) => { setShipBy(e.target.value); setFieldErrors((p) => { const n = new Set(p); n.delete("shipBy"); return n; }); }}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("shipBy")}`}
            disabled={pending}
            required
          >
            {SHIP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {shipBy === "PCS" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-medium">📍 ที่อยู่: รับเองที่โกดัง PCS กทม.</p>
            <p className="mt-1 text-xs leading-relaxed">
              บ้านเลขที่ 12 ซอย เพชรเกษม 77 แยก 3-6 · หนองค้างพลู · หนองแขม · กรุงเทพมหานคร · 10160<br />
              โทร 02-444-7046
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <label className="block text-xs font-medium text-muted mb-1">
              ที่อยู่ในการจัดส่ง <span className="text-red-500">*</span>
            </label>
            {!selectedUser ? (
              <p className="rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-muted">
                เลือกสมาชิกก่อนเพื่อโหลดที่อยู่
              </p>
            ) : addressesLoading ? (
              <p className="rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-muted">
                กำลังโหลดที่อยู่...
              </p>
            ) : addresses.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                ลูกค้ายังไม่มีที่อยู่ — กรุณาเปลี่ยนเป็น &ldquo;รับเองโกดัง PCS&rdquo; หรือเพิ่มที่อยู่ในโปรไฟล์ลูกค้า
              </p>
            ) : (
              <select
                value={addressID ?? ""}
                onChange={(e) => {
                  const n = e.target.value ? parseInt(e.target.value, 10) : null;
                  setAddressID(n);
                  setFieldErrors((p) => { const n2 = new Set(p); n2.delete("addressID"); return n2; });
                }}
                className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressID")}`}
                disabled={pending}
                required
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
      </section>

      {/* ── Sticky actions ─────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetForm}
            disabled={pending}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            ล้างฟอร์ม
          </button>

          <div className="flex items-center gap-3">
            {fieldErrors.size > 0 && (
              <span className="text-xs text-red-600">ยังขาด {fieldErrors.size} ช่อง</span>
            )}
            <button
              type="button"
              onClick={() => router.push(`/admin/api-forwarder-${carrier}`)}
              disabled={pending}
              className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
            >
              กลับ
            </button>
            <button
              type="submit"
              disabled={pending || !selectedUser || !productID.trim() || !smCode.trim() || !tracking.trim()}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังบันทึก..." : `✓ เพิ่ม 1 รายการ เข้า ${carrierLabel}`}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
