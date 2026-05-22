"use client";

/**
 * Client form for /admin/forwarders/new — talks to `adminCreateForwarder`
 * in actions/admin/forwarders-new.ts.
 *
 * Design (per docs/learnings/pacred-design-philosophy.md):
 *   - Tailwind card-section layout (NOT the legacy plain-Bootstrap form)
 *   - Combobox customer picker with type-ahead filter (not raw <select>)
 *   - Section cards: 🏭 ต้นทาง+ขนส่ง · 📦 สินค้า · 📸 รูป · 📐 ขนาด · 📮 ที่อยู่
 *   - Sticky submit at bottom (long form, don't make operator scroll up)
 *   - Image upload with thumbnail preview + remove button
 *   - Inline field-level errors + a soft top toast for global feedback
 *
 * On success → redirect to /admin/forwarders/<newId> (the detail page).
 */

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminCreateForwarder } from "@/actions/admin/forwarders-new";

export type CustomerLite = {
  userid:       string;
  username:     string | null;
  userlastname: string | null;
  usertel:      string | null;
  useremail:    string | null;
};

function labelCustomer(c: CustomerLite | null | undefined): string {
  if (!c) return "—";
  const name = `${c.username ?? ""} ${c.userlastname ?? ""}`.trim();
  return `${c.userid} · ${name || c.usertel || c.useremail || "(ไม่มีชื่อ)"}`;
}

const WAREHOUSE_OPTIONS = [
  { value: "1", label: "🏭 กวางโจว (Guangzhou)" },
  { value: "2", label: "🏭 อี้อู (Yiwu)" },
] as const;

const TRANSPORT_OPTIONS = [
  { value: "1", label: "🚛 รถ (EK) · 5-7 วัน" },
  { value: "2", label: "🚢 เรือ (SEA) · 12-16 วัน" },
  { value: "3", label: "✈️ เครื่องบิน (AIR) · 3-5 วัน" },
] as const;

const CRATE_OPTIONS = [
  { value: "2", label: "ไม่ตีลังไม้" },
  { value: "1", label: "ตีลังไม้ (มีค่าบริการ)" },
] as const;

type WarehouseChina = (typeof WAREHOUSE_OPTIONS)[number]["value"];
type TransportType  = (typeof TRANSPORT_OPTIONS)[number]["value"];
type CrateOption    = (typeof CRATE_OPTIONS)[number]["value"];

export function AdminForwarderNewForm({
  preset,
  recent,
}: {
  preset: CustomerLite | null;
  recent: CustomerLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Customer picker (combobox)
  const [userid, setUserid]             = useState<string>(preset?.userid ?? "");
  const [customerFilter, setCustFilter] = useState<string>("");
  const [pickerOpen, setPickerOpen]     = useState<boolean>(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Source + transport
  const [warehouseChina, setWarehouseChina] = useState<WarehouseChina>("1");
  const [transportType,  setTransportType]  = useState<TransportType>("2");
  const [crate, setCrate]                   = useState<CrateOption>("2");

  // Tracking
  const [trackingChn, setTrackingChn] = useState<string>("");
  const [trackingTh,  setTrackingTh]  = useState<string>("");

  // Product
  const [detail, setDetail] = useState<string>("");
  const [amount, setAmount] = useState<string>("1");
  const [weight, setWeight] = useState<string>("");
  const [volume, setVolume] = useState<string>("");

  // Cover image
  const [coverFile, setCoverFile]       = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Address
  const [addressName, setAddressName]               = useState<string>("");
  const [addressLastName, setAddressLastName]       = useState<string>("");
  const [addressNo, setAddressNo]                   = useState<string>("");
  const [addressSubdistrict, setAddressSubdistrict] = useState<string>("");
  const [addressDistrict, setAddressDistrict]       = useState<string>("");
  const [addressProvince, setAddressProvince]       = useState<string>("");
  const [addressZipcode, setAddressZipcode]         = useState<string>("");
  const [addressTel, setAddressTel]                 = useState<string>("");
  const [addressNote, setAddressNote]               = useState<string>("");

  // Admin note
  const [note, setNote] = useState<string>("");

  // Feedback
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  // ── Customer combobox: close on outside click ────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Customers visible in the dropdown — filter by type-ahead, but always
  // include the preselected/selected customer so they don't vanish.
  const filteredCustomers = useMemo(() => {
    const q = customerFilter.trim().toLowerCase();
    const pool: CustomerLite[] = recent.slice();
    if (preset && !pool.find((c) => c.userid === preset.userid)) {
      pool.unshift(preset);
    }
    if (!q) return pool;
    return pool.filter((c) => {
      const hay = `${c.userid} ${c.username ?? ""} ${c.userlastname ?? ""} ${c.usertel ?? ""} ${c.useremail ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customerFilter, recent, preset]);

  const selectedCustomer = useMemo(() => {
    if (!userid) return null;
    return (
      recent.find((c) => c.userid === userid) ??
      (preset?.userid === userid ? preset : null)
    );
  }, [userid, recent, preset]);

  // ── Cover image preview lifecycle ────────────────────────────────────
  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > 5 * 1024 * 1024) {
      setError("ไฟล์รูปใหญ่เกิน 5 MB");
      e.target.value = "";
      setCoverFile(null);
      return;
    }
    setError(null);
    setCoverFile(f);
  }

  function removeCover() {
    setCoverFile(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function resetForm() {
    setUserid(preset?.userid ?? "");
    setCustFilter("");
    setWarehouseChina("1");
    setTransportType("2");
    setCrate("2");
    setTrackingChn("");
    setTrackingTh("");
    setDetail("");
    setAmount("1");
    setWeight("");
    setVolume("");
    setCoverFile(null);
    setAddressName("");
    setAddressLastName("");
    setAddressNo("");
    setAddressSubdistrict("");
    setAddressDistrict("");
    setAddressProvince("");
    setAddressZipcode("");
    setAddressTel("");
    setAddressNote("");
    setNote("");
    setError(null);
    setSuccess(null);
    setFieldErrors(new Set());
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  // ── Submit ────────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const errs = new Set<string>();
    if (!userid)                            errs.add("userid");
    if (!trackingChn.trim())                errs.add("trackingChn");
    if (!detail.trim())                     errs.add("detail");
    if (!addressName.trim())                errs.add("addressName");
    if (!addressNo.trim())                  errs.add("addressNo");
    if (!addressSubdistrict.trim())         errs.add("addressSubdistrict");
    if (!addressDistrict.trim())            errs.add("addressDistrict");
    if (!addressProvince.trim())            errs.add("addressProvince");
    if (!/^\d{5}$/.test(addressZipcode.trim())) errs.add("addressZipcode");
    if (!addressTel.trim())                 errs.add("addressTel");

    const weightNum = parseFloat(weight.replace(/,/g, "")) || 0;
    const volumeNum = parseFloat(volume.replace(/,/g, "")) || 0;
    const amountNum = parseInt(amount, 10) || 1;

    if (weightNum < 0) errs.add("weight");
    if (volumeNum < 0) errs.add("volume");

    setFieldErrors(errs);
    if (errs.size > 0) {
      setError("กรอกข้อมูลให้ครบช่องที่ขีดเส้นแดง");
      return;
    }

    startTransition(async () => {
      const result = await adminCreateForwarder(
        {
          customerUserid:     userid,
          warehouseChina,
          transportType,
          trackingChn:        trackingChn.trim(),
          trackingTh:         trackingTh.trim() || undefined,
          detail:             detail.trim(),
          amount:             amountNum,
          weight:             weightNum,
          volume:             volumeNum,
          addressName:        addressName.trim(),
          addressLastName:    addressLastName.trim() || undefined,
          addressNo:          addressNo.trim(),
          addressSubdistrict: addressSubdistrict.trim(),
          addressDistrict:    addressDistrict.trim(),
          addressProvince:    addressProvince.trim(),
          addressZipcode:     addressZipcode.trim(),
          addressTel:         addressTel.trim(),
          addressNote:        addressNote.trim() || undefined,
          crate,
          note:               note.trim() || undefined,
        },
        coverFile ?? undefined,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const newId = result.data?.id;
      setSuccess(`บันทึกสำเร็จ — รายการ #${newId} กำลังพาไปหน้ารายละเอียด...`);
      // Brief pause so the operator sees the success, then jump.
      setTimeout(() => {
        if (newId) {
          router.push(`/admin/forwarders/${newId}`);
        } else {
          router.push("/admin/forwarders");
        }
        router.refresh();
      }, 800);
    });
  }

  const hasFieldError = (k: string) => fieldErrors.has(k);
  const errCls = (k: string) =>
    hasFieldError(k)
      ? "border-red-400 ring-1 ring-red-200 focus:border-red-500 focus:ring-red-300"
      : "border-border focus:border-primary-500 focus:ring-primary-200";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Global toast feedback */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✓ {success}
        </div>
      )}

      {/* ── CUSTOMER ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          👤 เลือกลูกค้า{" "}
          <span className="ml-1 text-red-500">*</span>
        </h2>

        <div ref={pickerRef} className="relative">
          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-green-300 bg-green-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-green-900 truncate">
                  ✓ {labelCustomer(selectedCustomer)}
                </div>
                {selectedCustomer.usertel && (
                  <div className="text-xs text-green-700 mt-0.5">
                    เบอร์ {selectedCustomer.usertel}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserid("");
                  setCustFilter("");
                  setPickerOpen(true);
                }}
                className="rounded-md border border-green-300 bg-white px-2.5 py-1 text-xs text-green-700 hover:bg-green-100"
                disabled={pending}
              >
                เปลี่ยน
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={customerFilter}
                onChange={(e) => {
                  setCustFilter(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                placeholder="ค้นหา · PR1234 · ชื่อ · เบอร์ · email..."
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm outline-none focus:ring-2 ${errCls("userid")}`}
                disabled={pending}
                autoComplete="off"
              />
              {pickerOpen && (
                <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                  {filteredCustomers.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted">
                      ไม่พบ — ใช้ <code className="rounded bg-surface-alt px-1.5">?q=PR####</code> ใน URL
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.userid}
                        type="button"
                        onClick={() => {
                          setUserid(c.userid);
                          setCustFilter("");
                          setPickerOpen(false);
                          setFieldErrors((prev) => {
                            const n = new Set(prev);
                            n.delete("userid");
                            return n;
                          });
                        }}
                        className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-alt"
                      >
                        <span className="font-mono text-primary-600">{c.userid}</span>
                        <span className="mx-1.5 text-muted">·</span>
                        <span>{`${c.username ?? ""} ${c.userlastname ?? ""}`.trim() || "(ไม่มีชื่อ)"}</span>
                        {c.usertel && (
                          <span className="ml-2 text-xs text-muted">{c.usertel}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="mt-1.5 text-xs text-muted">
                เลือกจากสมาชิกล่าสุด 50 ราย · ถ้าไม่เจอ ใช้{" "}
                <code className="rounded bg-surface-alt px-1.5">/admin/forwarders/new?q=PR1234</code>
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── ORIGIN + TRANSPORT ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          🏭 ต้นทาง + รูปแบบขนส่ง
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              โกดังจีน <span className="text-red-500">*</span>
            </label>
            <select
              value={warehouseChina}
              onChange={(e) => setWarehouseChina(e.target.value as WarehouseChina)}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            >
              {WAREHOUSE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              รูปแบบการขนส่ง <span className="text-red-500">*</span>
            </label>
            <select
              value={transportType}
              onChange={(e) => setTransportType(e.target.value as TransportType)}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            >
              {TRANSPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Tracking จีน (CHN) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={trackingChn}
              onChange={(e) => {
                setTrackingChn(e.target.value);
                if (fieldErrors.has("trackingChn")) {
                  setFieldErrors((p) => {
                    const n = new Set(p); n.delete("trackingChn"); return n;
                  });
                }
              }}
              placeholder="เช่น YT2401234567890"
              maxLength={50}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("trackingChn")}`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Tracking ไทย (TH)
            </label>
            <input
              type="text"
              value={trackingTh}
              onChange={(e) => setTrackingTh(e.target.value)}
              placeholder="ปกติจะกรอกตอนสินค้าถึงไทย"
              maxLength={50}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            การตีลังไม้
          </label>
          <div className="flex gap-2">
            {CRATE_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => setCrate(o.value)}
                disabled={pending}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition ${
                  crate === o.value
                    ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                    : "border-border bg-white text-muted hover:bg-surface-alt"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📦 รายละเอียดสินค้า
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1">
              รายละเอียด <span className="text-red-500">*</span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => {
                setDetail(e.target.value);
                if (fieldErrors.has("detail")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("detail"); return n; });
                }
              }}
              rows={4}
              maxLength={2000}
              placeholder="เช่น เสื้อผ้า · กระเป๋า · อะไหล่รถยนต์"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("detail")}`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              จำนวนกล่อง
            </label>
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              น้ำหนัก (kg)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="เช่น 5.50 · ปล่อยว่างถ้ายังไม่ทราบ"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("weight")}`}
            />
            <p className="mt-1 text-xs text-muted">วัดจริงตอนเข้าโกดัง — กรอกประมาณการได้</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ปริมาตร (CBM · m³)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="เช่น 0.05000"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("volume")}`}
            />
            <p className="mt-1 text-xs text-muted">CBM = กว้าง × ยาว × สูง (m) — ปล่อยว่างก็ได้</p>
          </div>
        </div>
      </section>

      {/* ── COVER IMAGE ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📸 รูปสินค้า <span className="ml-1 text-xs font-normal text-muted">(ไม่บังคับ · max 5MB)</span>
        </h2>

        {!coverFile ? (
          <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt px-6 py-8 text-sm text-muted hover:bg-surface-alt/70 hover:border-primary-300 transition">
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCoverChange}
              disabled={pending}
              className="hidden"
            />
            <span className="text-center">
              📷 แตะเพื่อถ่ายรูป หรือเลือกไฟล์
              <br />
              <span className="text-xs">JPG · PNG · WEBP · ขนาดไม่เกิน 5 MB</span>
            </span>
          </label>
        ) : (
          <div className="flex items-start gap-4">
            <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-surface-alt">
              {coverPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPreview}
                  alt="preview"
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={removeCover}
                disabled={pending}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-black/80"
                aria-label="remove image"
              >
                × ลบ
              </button>
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium truncate">{coverFile.name}</div>
              <div className="text-xs text-muted mt-0.5">
                {(coverFile.size / 1024).toFixed(1)} KB · {coverFile.type}
              </div>
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={pending}
                className="mt-2 rounded-md border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
              >
                เลือกไฟล์อื่น
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── DELIVERY ADDRESS ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📮 ที่อยู่จัดส่งในไทย <span className="text-red-500">*</span>
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ชื่อผู้รับ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={addressName}
              onChange={(e) => {
                setAddressName(e.target.value);
                if (fieldErrors.has("addressName")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("addressName"); return n; });
                }
              }}
              maxLength={200}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressName")}`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              นามสกุล
            </label>
            <input
              type="text"
              value={addressLastName}
              onChange={(e) => setAddressLastName(e.target.value)}
              maxLength={200}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              เบอร์ติดต่อ <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={addressTel}
              onChange={(e) => {
                setAddressTel(e.target.value);
                if (fieldErrors.has("addressTel")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("addressTel"); return n; });
                }
              }}
              maxLength={10}
              inputMode="numeric"
              placeholder="08x-xxx-xxxx"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressTel")}`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              รหัสไปรษณีย์ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={addressZipcode}
              onChange={(e) => {
                setAddressZipcode(e.target.value);
                if (fieldErrors.has("addressZipcode")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("addressZipcode"); return n; });
                }
              }}
              maxLength={5}
              inputMode="numeric"
              placeholder="10110"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressZipcode")}`}
              required
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            ที่อยู่ (เลขที่ · ซอย · ถนน) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={addressNo}
            onChange={(e) => {
              setAddressNo(e.target.value);
              if (fieldErrors.has("addressNo")) {
                setFieldErrors((p) => { const n = new Set(p); n.delete("addressNo"); return n; });
              }
            }}
            maxLength={255}
            placeholder="เช่น 123/45 ซอย 5 ถ.สุขุมวิท"
            disabled={pending}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressNo")}`}
            required
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ตำบล/แขวง <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={addressSubdistrict}
              onChange={(e) => {
                setAddressSubdistrict(e.target.value);
                if (fieldErrors.has("addressSubdistrict")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("addressSubdistrict"); return n; });
                }
              }}
              maxLength={255}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressSubdistrict")}`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              อำเภอ/เขต <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={addressDistrict}
              onChange={(e) => {
                setAddressDistrict(e.target.value);
                if (fieldErrors.has("addressDistrict")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("addressDistrict"); return n; });
                }
              }}
              maxLength={255}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressDistrict")}`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              จังหวัด <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={addressProvince}
              onChange={(e) => {
                setAddressProvince(e.target.value);
                if (fieldErrors.has("addressProvince")) {
                  setFieldErrors((p) => { const n = new Set(p); n.delete("addressProvince"); return n; });
                }
              }}
              maxLength={255}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressProvince")}`}
              required
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            หมายเหตุที่อยู่ (ไม่บังคับ)
          </label>
          <textarea
            value={addressNote}
            onChange={(e) => setAddressNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="เช่น โทรก่อนส่ง 30 นาที · ฝากไว้ที่ป้อมยาม"
            disabled={pending}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
          />
        </div>
      </section>

      {/* ── ADMIN NOTE ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📝 หมายเหตุภายใน (admin only)
        </h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="เหตุผลที่บันทึกแทนลูกค้า — เช่น 'ลูกค้าโทรมาขอ admin บันทึก · นัดรับเย็นนี้'"
          disabled={pending}
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
        />
      </section>

      {/* ── STICKY ACTIONS ────────────────────────────────────────────
          Position sticky so the operator can submit without scrolling
          back to the top — long form, important UX. */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
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
              <span className="text-xs text-red-600">
                ยังขาด {fieldErrors.size} ช่อง
              </span>
            )}
            <button
              type="submit"
              disabled={pending || !userid}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังบันทึก..." : "✓ บันทึกรายการ"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
