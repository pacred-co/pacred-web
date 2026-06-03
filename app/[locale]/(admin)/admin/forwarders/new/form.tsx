"use client";

/**
 * Client form for /admin/forwarders/new — 1:1 legacy modal port.
 *
 * Wave 12-C v2 (2026-05-23 REWRITE). Mirrors `pcs-admin/forwarder.php` modal
 * (L754-852) — 9 cascading fields, address picked from the customer's
 * tb_address rows (NOT typed), only รถ/เรือ in the transport dropdown.
 *
 * Per docs/learnings/pacred-design-philosophy.md:
 *   - Legacy = workflow source (field list · cascade order · INSERT shape)
 *   - Pacred = UI source (Tailwind cards · combobox · live preview · friendly errors)
 *
 * Cascade order:
 *   coID picked → fetchUsersByCoid → user list refreshed
 *   user picked → fetchAddressesByUserid → address list refreshed
 *   fShipBy='PCS' → hide address picker (use hardcoded PCS pickup)
 */

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminCreateForwarder,
  fetchUsersByCoid,
  fetchAddressesByUserid,
  type CustomerOption,
  type AddressOption,
} from "@/actions/admin/forwarders-new";

type CoidOption = { coid: string; coname: string };

// Legacy `optionHShipByCart()` from pcs-admin/include/function.php L411-464.
// Hardcoded list — same values/labels as legacy. "PCSF" is gated by the
// freeShipping flag from tb_settings (passed as prop).
const SHIP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "PCS",  label: "🏬 รับเองโกดัง Pacred (สมุทรสาคร)"        },
  { value: "2",    label: "Flash Express"                  },
  { value: "3",    label: "J.K. เอ็กซ์เพรส"                 },
  { value: "21",   label: "นิ่มซี่เส็งขนส่ง 1988"             },
  { value: "5",    label: "Nim Express"                    },
  { value: "6",    label: "S & J ขนส่งด่วนสุพรรณบุรี"       },
  { value: "7",    label: "SB สมใจขนส่ง"                   },
  { value: "9",    label: "เคพีเอ็น (2017)"                 },
  { value: "10",   label: "เฟิร์ส เอ็กเพรส ขนส่ง"           },
  { value: "11",   label: "ไปรษณีย์ไทย"                     },
  { value: "12",   label: "จันทร์สว่างขนส่ง"                 },
  { value: "13",   label: "ธนามัย ขนส่งด่วน"                },
  { value: "14",   label: "บุญอนันต์ขนส่ง"                   },
  { value: "15",   label: "พี.เจ. ด่วนอีสาน ขนส่ง"           },
  { value: "16",   label: "มะม่วงขนส่ง"                      },
  { value: "17",   label: "วันชนะ แอนด์ วันณิสา ขนส่ง"      },
  { value: "18",   label: "สมพงษ์อุบลรัตน์ ขนส่ง"            },
  { value: "19",   label: "อาร์.ซี.อาร์ เพลส (r.c.r. place)" },
  { value: "20",   label: "ตองสอง ขนส่ง"                    },
  { value: "22",   label: "ธนาไพศาล ขนส่ง"                   },
  { value: "23",   label: "PL ขนส่งด่วน"                     },
  { value: "24",   label: "J&T Express"                     },
  { value: "25",   label: "มังกรทองขนส่ง 2019"               },
  { value: "26",   label: "PM ชลบุรี ขนส่งด่วน"              },
  { value: "27",   label: "ทรัพย์ปรีชา"                       },
  { value: "28",   label: "พัฒนาเอ็กซ์เพลส"                   },
  { value: "29",   label: "หาดใหญ่ทัวร์"                      },
  { value: "30",   label: "หาดใหญ่ โอ.พี. 2012"              },
  { value: "31",   label: "อาร์.ซี.เอ็กซเพรส"                 },
  { value: "32",   label: "สี่สหาย"                           },
  { value: "33",   label: "แพปลา​สมบัติ​วัฒนา"                },
  { value: "34",   label: "ทวีทรัพย์ระยอง"                    },
  { value: "35",   label: "ศิริสมบูรณ์"                        },
  { value: "36",   label: "นิวสอง อัศวินขนส่ง"                },
  { value: "37",   label: "โชคสถาพรขนส่ง"                    },
  { value: "38",   label: "ทรัพย์สมบูรณ์ถาวร"                  },
  { value: "39",   label: "MNB Transport"                   },
  { value: "40",   label: "หจก.โชคพูลทรัพย์ขนส่ง 2014"        },
  { value: "41",   label: "สิรินครขนส่ง"                       },
  { value: "42",   label: "พาณิชย์การขนส่ง KSD"               },
  { value: "43",   label: "นวรรณขนส่ง"                        },
  { value: "44",   label: "กุญชรมณี ขนส่ง"                    },
  { value: "45",   label: "เอ็มพอร์ท โลจิสติกส์"                },
  { value: "46",   label: "ซี.เอ็น.ทรานสปอร์ต"                },
];

// Legacy modal has ONLY two transport types (forwarder.php L838-841).
// "3 = แอร์" exists in the schema but isn't offered at create-time.
const TRANSPORT_OPTIONS = [
  { value: "1" as const, label: "🚛 ขนส่งทางรถ — ประมาณ 5-7 วัน"  },
  { value: "2" as const, label: "🚢 ขนส่งทางเรือ — ประมาณ 12-16 วัน" },
];

type TransportType = (typeof TRANSPORT_OPTIONS)[number]["value"];

function customerLabel(c: CustomerOption | null | undefined): string {
  if (!c) return "—";
  const name = `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim();
  return `${c.userID} · ${name || c.userTel || "(ไม่มีชื่อ)"}`;
}

function addressFullLine(a: AddressOption): string {
  const lastname = a.addresslastname ? ` ${a.addresslastname}` : "";
  return `คุณ${a.addressname}${lastname} · ${a.addressno} · ต.${a.addresssubdistrict} อ.${a.addressdistrict} จ.${a.addressprovince} ${a.addresszipcode}`;
}

export function AdminForwarderNewForm({
  coidList,
  freeShipping,
  presetUser,
  presetCoid,
  presetAddresses,
}: {
  coidList:        CoidOption[];
  freeShipping:    boolean;
  presetUser:      CustomerOption | null;
  presetCoid:      string | null;
  presetAddresses: AddressOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ─── coID + user cascade ─────────────────────────────────────────
  const [coid, setCoid]               = useState<string>(presetCoid ?? "");
  const [users, setUsers]             = useState<CustomerOption[]>(
    presetUser ? [presetUser] : [],
  );
  const [usersLoading, setUsersLoading] = useState(false);
  const [userid, setUserid]           = useState<string>(presetUser?.userID ?? "");
  const [userFilter, setUserFilter]   = useState<string>("");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const userPickerRef = useRef<HTMLDivElement | null>(null);

  // ─── tracking · detail · amount · cover ─────────────────────────
  const [trackingChn, setTrackingChn] = useState<string>("");
  const [detail, setDetail]           = useState<string>("");
  const [amount, setAmount]           = useState<string>("1");
  const [coverFile, setCoverFile]     = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  // Track current blob URL outside React state for unmount cleanup —
  // the useEffect that watches coverPreview can't safely reach it from cleanup.
  const coverPreviewUrlRef = useRef<string | null>(null);

  // ─── cover preview blob-URL lifecycle (event-handler managed) ───
  // Set + revoke URLs in the same call so we never leak. setCoverFile
  // wraps this so every cover-change site stays consistent.
  function updateCoverPreview(nextFile: File | null) {
    // Revoke the previous URL (regardless of whether new one is null)
    if (coverPreviewUrlRef.current) {
      URL.revokeObjectURL(coverPreviewUrlRef.current);
      coverPreviewUrlRef.current = null;
    }
    if (nextFile) {
      const url = URL.createObjectURL(nextFile);
      coverPreviewUrlRef.current = url;
      setCoverPreview(url);
    } else {
      setCoverPreview(null);
    }
    setCoverFile(nextFile);
  }

  // ─── shipBy + address cascade ───────────────────────────────────
  const [shipBy, setShipBy]                   = useState<string>("");
  const [addresses, setAddresses]             = useState<AddressOption[]>(presetAddresses);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressId, setAddressId]             = useState<number | null>(
    presetAddresses.find((a) => a.isMain)?.addressid ?? presetAddresses[0]?.addressid ?? null,
  );

  // ─── transport type ─────────────────────────────────────────────
  const [transportType, setTransportType] = useState<TransportType>("1");

  // ─── feedback ───────────────────────────────────────────────────
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  // ─── user-picker outside click ──────────────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setUserPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ─── cover image preview unmount cleanup ────────────────────────
  // URL.createObjectURL/.revokeObjectURL is driven by updateCoverPreview()
  // in event handlers (above); this effect only revokes the URL on unmount
  // so we don't leak a blob if the form is dismissed while a file is staged.
  useEffect(() => {
    return () => {
      if (coverPreviewUrlRef.current) {
        URL.revokeObjectURL(coverPreviewUrlRef.current);
        coverPreviewUrlRef.current = null;
      }
    };
  }, []);

  // ─── when coID changes → fetch users for that tier ─────────────
  async function onCoidChange(next: string) {
    setCoid(next);
    setUserid("");
    setUserFilter("");
    setAddresses([]);
    setAddressId(null);
    setFieldErrors((p) => { const n = new Set(p); n.delete("coid"); return n; });

    if (!next) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    const res = await fetchUsersByCoid(next);
    setUsersLoading(false);
    if (res.ok) {
      setUsers(res.data?.users ?? []);
    } else {
      setUsers([]);
      setError(`โหลดรายชื่อสมาชิกไม่สำเร็จ: ${res.error}`);
    }
  }

  // ─── when user picked → fetch their addresses ─────────────────
  async function onUserPick(picked: CustomerOption) {
    setUserid(picked.userID);
    setUserFilter("");
    setUserPickerOpen(false);
    setFieldErrors((p) => { const n = new Set(p); n.delete("userid"); return n; });

    setAddressesLoading(true);
    const res = await fetchAddressesByUserid(picked.userID);
    setAddressesLoading(false);
    if (res.ok) {
      const list = res.data?.addresses ?? [];
      setAddresses(list);
      setAddressId(list.find((a) => a.isMain)?.addressid ?? list[0]?.addressid ?? null);
    } else {
      setAddresses([]);
      setAddressId(null);
      setError(`โหลดที่อยู่ไม่สำเร็จ: ${res.error}`);
    }
  }

  // ─── filtered users by type-ahead ───────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.userID} ${u.userName ?? ""} ${u.userLastName ?? ""} ${u.userTel ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [userFilter, users]);

  const selectedUser = useMemo(
    () => users.find((u) => u.userID === userid) ?? (presetUser?.userID === userid ? presetUser : null),
    [userid, users, presetUser],
  );

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.addressid === addressId) ?? null,
    [addresses, addressId],
  );

  // ─── cover handlers ─────────────────────────────────────────────
  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    // Legacy modal sets data-max-file-size="9M" but the bucket helper caps at 5MB.
    // Keep the form limit at the helper limit so the user gets a clear error early.
    if (f && f.size > 5 * 1024 * 1024) {
      setError("ไฟล์รูปใหญ่เกิน 5 MB");
      e.target.value = "";
      updateCoverPreview(null);
      return;
    }
    setError(null);
    updateCoverPreview(f);
  }

  function removeCover() {
    updateCoverPreview(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function resetForm() {
    setCoid("");
    setUsers([]);
    setUserid("");
    setUserFilter("");
    setTrackingChn("");
    setDetail("");
    setAmount("1");
    updateCoverPreview(null);
    setShipBy("");
    setAddresses([]);
    setAddressId(null);
    setTransportType("1");
    setError(null);
    setSuccess(null);
    setFieldErrors(new Set());
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  // ─── submit ─────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const errs = new Set<string>();
    if (!coid)                 errs.add("coid");
    if (!userid)               errs.add("userid");
    if (!trackingChn.trim())   errs.add("trackingChn");
    if (!detail.trim())        errs.add("detail");
    if (!shipBy)               errs.add("shipBy");
    if (shipBy !== "PCS" && !addressId) errs.add("addressId");

    setFieldErrors(errs);
    if (errs.size > 0) {
      setError("กรอกข้อมูลให้ครบช่องที่ขีดเส้นแดง");
      return;
    }

    const amountNum = parseInt(amount, 10) || 1;

    startTransition(async () => {
      const result = await adminCreateForwarder(
        {
          coid:           coid,
          customerUserid: userid,
          trackingChn:    trackingChn.trim(),
          detail:         detail.trim(),
          amount:         amountNum,
          shipBy:         shipBy,
          addressId:      shipBy === "PCS" ? null : addressId,
          transportType:  transportType,
        },
        coverFile ?? undefined,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const newId = result.data?.id;
      setSuccess(`บันทึกสำเร็จ — รายการ #${newId} กำลังพาไปหน้ารายละเอียด...`);
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
      {/* ─── Global toast feedback ──────────────────────────────── */}
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

      {/* ─── COID + USER (cascading picker) ─────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          👤 เลือกสมาชิก <span className="text-red-500">*</span>
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {/* coID */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ประเภทสมาชิก (coID) <span className="text-red-500">*</span>
            </label>
            <select
              value={coid}
              onChange={(e) => onCoidChange(e.target.value)}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("coid")}`}
              required
            >
              <option value="">— กรุณาเลือก —</option>
              {coidList.map((c) => (
                <option key={c.coid} value={c.coid}>
                  {c.coid}{c.coname && c.coname !== c.coid ? ` · ${c.coname}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">เลือกก่อน → รายชื่อสมาชิกจะกรองตาม</p>
          </div>

          {/* userID (cascaded) */}
          <div ref={userPickerRef}>
            <label className="block text-xs font-medium text-muted mb-1">
              รหัสสมาชิก (userID) <span className="text-red-500">*</span>
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
                  onClick={() => { setUserid(""); setUserFilter(""); setAddresses([]); setAddressId(null); setUserPickerOpen(true); }}
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
                  value={userFilter}
                  onChange={(e) => { setUserFilter(e.target.value); setUserPickerOpen(true); }}
                  onFocus={() => setUserPickerOpen(true)}
                  placeholder={
                    !coid
                      ? "เลือก coID ก่อน..."
                      : usersLoading
                      ? "กำลังโหลด..."
                      : `ค้นหา · PR1234 · ชื่อ · เบอร์ (${users.length} คน)`
                  }
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("userid")}`}
                  disabled={pending || !coid || usersLoading}
                  autoComplete="off"
                />
                {userPickerOpen && coid && !usersLoading && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                    {filteredUsers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted">ไม่พบสมาชิกใน coID นี้</div>
                    ) : (
                      filteredUsers.map((u) => (
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
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── PRODUCT DETAILS ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📦 รายละเอียดนำเข้าสินค้า
        </h2>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            เลข Tracking <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={trackingChn}
            onChange={(e) => {
              setTrackingChn(e.target.value);
              setFieldErrors((p) => { const n = new Set(p); n.delete("trackingChn"); return n; });
            }}
            maxLength={50}
            placeholder="เลข Tracking"
            disabled={pending}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("trackingChn")}`}
            required
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              รายละเอียด <span className="text-red-500">*</span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => {
                setDetail(e.target.value);
                setFieldErrors((p) => { const n = new Set(p); n.delete("detail"); return n; });
              }}
              rows={6}
              maxLength={500}
              placeholder="รายละเอียด"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("detail")}`}
              required
            />
            <p className="mt-1 text-[11px] text-muted">{detail.length} / 500</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">จำนวน</label>
              <input
                type="number"
                min={1}
                max={10000}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
              <p className="mt-1 text-[11px] text-muted">default = 1</p>
            </div>

            {/* Cover image */}
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                รูปสินค้า <span className="text-[10px] text-muted">(ไม่บังคับ · max 5MB)</span>
              </label>
              {!coverFile ? (
                <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-alt px-3 py-5 text-xs text-muted hover:bg-surface-alt/70 hover:border-primary-300 transition">
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
                    📷 แตะเพื่อถ่ายรูป<br />หรือเลือกไฟล์
                  </span>
                </label>
              ) : (
                <div className="space-y-2">
                  <div className="relative h-24 w-full overflow-hidden rounded-xl border border-border bg-surface-alt">
                    {coverPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverPreview} alt="preview" className="h-full w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={removeCover}
                      disabled={pending}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white hover:bg-black/80"
                    >
                      × ลบ
                    </button>
                  </div>
                  <p className="text-[10px] text-muted truncate">{coverFile.name}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── SHIPPING + ADDRESS ──────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          🚚 ข้อมูลการจัดส่ง
        </h2>

        {freeShipping && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            *บริษัทอยู่ในช่วงโปรโมชั่นจัดส่งฟรี ในพื้นที่ กทม. และปริมณฑล —
            หากที่อยู่ปลายทางอยู่ในพื้นที่ ให้เลือก{" "}
            <strong>&ldquo;PCS เหมาๆ (50 บ.) — กทม + ปริมณฑล&rdquo;</strong>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            บริษัทขนส่ง <span className="text-red-500">*</span>
          </label>
          <select
            value={shipBy}
            onChange={(e) => {
              setShipBy(e.target.value);
              setFieldErrors((p) => { const n = new Set(p); n.delete("shipBy"); return n; });
            }}
            disabled={pending}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("shipBy")}`}
            required
          >
            <option value="">— กรุณาเลือกบริษัทขนส่ง —</option>
            {freeShipping && (
              <option value="PCSF">📦 PCS เหมาๆ (50 บ.) — กทม + ปริมณฑล</option>
            )}
            {SHIP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Address picker — hidden when fShipBy='PCS' (use hardcoded pickup). */}
        {shipBy === "PCS" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-medium">📍 ที่อยู่: รับเองที่โกดัง Pacred (สมุทรสาคร)</p>
            <p className="mt-1 text-xs leading-relaxed">
              48/3 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130 (S&T WAREHOUSE219)<br />
              โทร 02-421-3325
            </p>
          </div>
        ) : shipBy ? (
          <div className="mt-4">
            <label className="block text-xs font-medium text-muted mb-1">
              ที่อยู่ในการจัดส่ง <span className="text-red-500">*</span>
              {userid && (
                <a
                  href={`/admin/users/${userid}?action=add-address`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-[11px] text-primary-600 hover:underline"
                >
                  + เพิ่มที่อยู่ใหม่
                </a>
              )}
            </label>
            {!userid ? (
              <p className="rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-muted">
                เลือกสมาชิกก่อนเพื่อโหลดที่อยู่ของลูกค้า
              </p>
            ) : addressesLoading ? (
              <p className="rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-sm text-muted">
                กำลังโหลดที่อยู่...
              </p>
            ) : addresses.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                ลูกค้ายังไม่มีที่อยู่ — กรุณาเพิ่มที่อยู่ก่อน (
                <a
                  href={`/admin/users/${userid}?action=add-address`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-600 underline"
                >เปิดหน้าโปรไฟล์ลูกค้า</a>)
              </p>
            ) : (
              <>
                <select
                  value={addressId ?? ""}
                  onChange={(e) => {
                    const n = e.target.value ? parseInt(e.target.value, 10) : null;
                    setAddressId(n);
                    setFieldErrors((p) => { const n2 = new Set(p); n2.delete("addressId"); return n2; });
                  }}
                  disabled={pending}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("addressId")}`}
                  required
                >
                  {addresses.map((a) => (
                    <option key={a.addressid} value={a.addressid}>
                      {a.isMain ? "[ที่อยู่หลัก] " : ""}{addressFullLine(a)}
                    </option>
                  ))}
                </select>
                {selectedAddress && (
                  <div className="mt-2 rounded-lg bg-surface-alt/50 px-3 py-2 text-[11px] text-muted leading-relaxed">
                    👤 {selectedAddress.addressname} {selectedAddress.addresslastname}<br />
                    📍 {selectedAddress.addressno} · ต.{selectedAddress.addresssubdistrict} อ.{selectedAddress.addressdistrict} จ.{selectedAddress.addressprovince} {selectedAddress.addresszipcode}<br />
                    📞 {selectedAddress.addresstel}{selectedAddress.addresstel2 ? ` · ${selectedAddress.addresstel2}` : ""}
                    {selectedAddress.addressnote && (<><br />📝 {selectedAddress.addressnote}</>)}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        {/* Transport type — รถ / เรือ ONLY (legacy modal L838-841) */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            รูปแบบการขนส่งระหว่างประเทศจีน-ไทย <span className="text-red-500">*</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRANSPORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setTransportType(o.value)}
                disabled={pending}
                className={`rounded-xl border px-4 py-3 text-sm text-left transition ${
                  transportType === o.value
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

      {/* ─── STICKY ACTIONS ─────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetForm}
            disabled={pending}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>

          <div className="flex items-center gap-3">
            {fieldErrors.size > 0 && (
              <span className="text-xs text-red-600">ยังขาด {fieldErrors.size} ช่อง</span>
            )}
            <button
              type="submit"
              disabled={pending || !coid || !userid || !shipBy}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังบันทึก..." : "✓ บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
