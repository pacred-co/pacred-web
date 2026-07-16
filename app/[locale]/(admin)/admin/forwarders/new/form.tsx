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
 * Cascade order (ภูม flag round 10 — member-type group replaces the raw
 * tb_co dropdown · same clean categories /admin/customers uses):
 *   member-type group picked → fetchUsersByGroup → user list refreshed
 *     (OR no group → universal direct search across all coIDs · round 9)
 *   user picked → adopt the customer's own coID + fetchAddressesByUserid
 *   fShipBy='PCS' → hide address picker (use hardcoded PCS pickup)
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
  type CustomerGroup,
  type AddressOption,
} from "@/actions/admin/forwarders-new";
import { resolveBillingIdentity, corpRowFromName } from "@/lib/admin/customer-identity";
import { getPrivateCarrierOptionsForProvince } from "@/lib/cart/ship-by-eligibility";
import { compressImageFile } from "@/lib/image-compress";

// Clean member-type categories — same 7 buckets /admin/customers uses in its
// "ตามประเภท" menu (ภูม flag round 10). Replaces the raw tb_co dropdown which
// listed junk coID rows (OOAEOM.VIP / SALE.PEPO / SWAN / …). Picking one
// filters the customer picker to that type.
const CUSTOMER_GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: "general",    label: "ลูกค้าทั่วไป" },
  { value: "vip",        label: "VIP" },
  { value: "svip",       label: "SVIP" },
  { value: "corporate",  label: "นิติบุคคล" },
  { value: "credit",     label: "เครดิต" },
  { value: "comparison", label: "คิดค่าเทียบ (CPS)" },
  { value: "freight",    label: "ลูกค้า Freight" },
];

// 🔴 CLOSED CARRIER LIST (owner 2026-07-14) — "บังคับให้เลือกให้ใส่แค่ที่มีในไฟล์ที่ส่งให้เท่านั้น ·
// ไม่ให้เลือกหรือให้ใส่ นอกเหนือจาก data ตรงนี้". The legacy `optionHShipByCart()` 47-carrier list is
// GONE: the ขนส่งเอกชน options come from the owner's workbook, FILTERED BY THE SELECTED ADDRESS'S
// PROVINCE (getPrivateCarrierOptionsForProvince). Own-fleet (PCS/PCSF) stays a preset — it is
// Pacred's own delivery, valid anywhere. The server re-checks (checkCarrierForProvince).

/** Pacred's own delivery — always offered (not a "ขนส่งเอกชน"). */
const OWN_FLEET_OPTIONS: { value: string; label: string }[] = [
  { value: "PCS", label: "🏬 รับเองโกดัง Pacred (สมุทรสาคร)" },
];

// Legacy modal has ONLY two transport types (forwarder.php L838-841).
// "3 = แอร์" exists in the schema but isn't offered at create-time.
const TRANSPORT_OPTIONS = [
  { value: "1" as const, label: "🚛 ขนส่งทางรถ — ประมาณ 5-7 วัน"  },
  { value: "2" as const, label: "🚢 ขนส่งทางเรือ — ประมาณ 12-16 วัน" },
];

type TransportType = (typeof TRANSPORT_OPTIONS)[number]["value"];

// 2026-06-04 ภูม flag — โกดังประเทศจีน picker + auto-detect from tracking.
// Codes per WAREHOUSE_NAME_LABEL in actions/admin/reports-profit-types.ts.
// Empty value = ยังไม่ระบุ (admin fills in later via /edit when goods arrive).
const WAREHOUSE_OPTIONS: { value: "" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"; label: string }[] = [
  { value: "",  label: "— ยังไม่ระบุ (admin เลือกตอนของถึงโกดังจีน) —" },
  { value: "1", label: "1 · แสง (Sang)" },
  { value: "2", label: "2 · CTT" },
  { value: "3", label: "3 · MK" },
  { value: "4", label: "4 · MX" },
  { value: "5", label: "5 · JMF" },
  { value: "6", label: "6 · GOGO" },
  { value: "7", label: "7 · Cargo Center" },
  { value: "8", label: "8 · MOMO" },
];

type WarehouseCode = (typeof WAREHOUSE_OPTIONS)[number]["value"];

/**
 * Best-effort tracking → warehouse heuristic.
 *
 * Only two prefixes have a documented Pacred convention:
 *   - "MO" prefix → 8 (MOMO)        — per lib/admin/commit-momo-row-core.ts:398
 *     where MOMO-pulled rows get fIDorCO=`MO${trackingNo}` (the Pacred system
 *     identity), and the canonical MOMO warehouse code is 8.
 *   - "CC" prefix → 7 (Cargo Center) — per actions/admin/api-forwarder-manual.ts:42
 *     where both CN + MOMO legacy manual entry pages use fIDorCOPrefix="CC"
 *     with fWarehouseName="7". When the raw tracking the admin types itself
 *     starts with CC, it's almost certainly a Cargo Center route.
 *
 * Everything else (Sang/CTT/MK/MX/JMF/GOGO) is a vendor-issued tracking with
 * no Pacred-side prefix convention (carrier-side trackings vary too wildly to
 * regex reliably) — return null so the field stays empty; admin fixes the
 * warehouse later in /admin/forwarders/[fNo]/edit when goods physically
 * arrive at China warehouse.
 *
 * Match is case-insensitive · uses `startsWith` after trim.
 */
function guessWarehouseFromTracking(tracking: string): WarehouseCode | null {
  const t = tracking.trim().toUpperCase();
  if (!t) return null;
  if (t.startsWith("MO")) return "8";
  if (t.startsWith("CC")) return "7";
  return null;
}

// Juristic-aware display name for a picked/listed customer — นิติบุคคล shows
// the company name (not the contact person) when it's known.
function customerDisplayName(c: CustomerOption): string {
  return resolveBillingIdentity({
    userCompany: c.userCompany,
    userName: c.userName,
    userLastName: c.userLastName,
    corp: corpRowFromName(c.corporatename ?? undefined),
  }).name;
}

function customerLabel(c: CustomerOption | null | undefined): string {
  if (!c) return "—";
  const name = customerDisplayName(c);
  return `${c.userID} · ${name || c.userTel || "(ไม่มีชื่อ)"}`;
}

function addressFullLine(a: AddressOption): string {
  const lastname = a.addresslastname ? ` ${a.addresslastname}` : "";
  return `คุณ${a.addressname}${lastname} · ${a.addressno} · ต.${a.addresssubdistrict} อ.${a.addressdistrict} จ.${a.addressprovince} ${a.addresszipcode}`;
}

export function AdminForwarderNewForm({
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

  // ─── member-type group + user cascade ────────────────────────────
  // `group` drives the clean member-type filter (general/vip/svip/corporate/
  // credit/comparison/freight). `coid` is still the field the create action
  // validates + audits — it's filled from the CHOSEN customer's own coID in
  // onUserPick, so the order keys off real data regardless of which group (or
  // the universal search) was used to find them.
  const [group, setGroup]             = useState<string>("");
  const [coid, setCoid]               = useState<string>(presetCoid ?? "");
  // group-loaded customers carry their own coID (CustomerSearchResult) so
  // onUserPick can adopt the picked customer's tier — same shape the direct
  // search returns. The preset (from ?q=) has no coID handy here; presetCoid
  // is passed separately and onUserPick's pickedCoid is optional.
  const [users, setUsers]             = useState<CustomerSearchResult[]>(
    presetUser ? [{ ...presetUser, coID: presetCoid ?? null }] : [],
  );
  const [usersLoading, setUsersLoading] = useState(false);
  const [userid, setUserid]           = useState<string>(presetUser?.userID ?? "");
  const [userFilter, setUserFilter]   = useState<string>("");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const userPickerRef = useRef<HTMLDivElement | null>(null);
  // Direct customer search (ภูม flag round 9) — used when NO coID tier is
  // picked. Lets staff find ANY customer by PR-code / name / phone, bypassing
  // the coID-first cascade (which can't reach the "PR"-coid majority).
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // The chosen customer object — needed for the "✓ selected" chip when the
  // pick came from the direct search (that customer isn't in the coid-loaded
  // `users` list).
  const [pickedCustomer, setPickedCustomer] = useState<CustomerOption | null>(presetUser ?? null);

  // ─── tracking · detail · amount · cover ─────────────────────────
  const [trackingChn, setTrackingChn] = useState<string>("");
  const [detail, setDetail]           = useState<string>("");
  const [amount, setAmount]           = useState<string>("1");

  // ─── โกดังประเทศจีน (warehouseName · 2026-06-04 ภูม flag · revised) ─
  // - Default = "" (ยังไม่ระบุ) per legacy `forwarder.php` which doesn't
  //   set fWarehouseName on INSERT.
  // - Auto-fill from tracking prefix (MO→8, CC→7, etc.) — same logic
  //   that MOMO cron uses when it pulls.
  // - NO manual dropdown (ภูม 2026-06-04: "ถ้าพนักงานมันกดกันผิดมั่วตายเลย")
  //   → if auto-detect misses (unknown prefix) ค่าจะว่าง · admin แก้ใน
  //   /admin/forwarders/[fNo]/edit ภายหลังถ้าจำเป็น.
  const [warehouseName, setWarehouseName]       = useState<WarehouseCode>("");
  const [warehouseAutoFilled, setWarehouseAutoFilled] = useState<boolean>(false);
  // 2026-06-04 (ภูม flag #2) — extra signals from `/api/admin/forwarders/
  // check-tracking` AJAX. Called on a 600ms debounce after the admin stops
  // typing in the tracking field. Surfaces:
  //   - `duplicateRow`: an existing tb_forwarder row with the same
  //     ftrackingchn (legacy `scriptfTrackingCHN.php` red-warn behavior),
  //   - `warehouseHint`: what the SERVER says the warehouse should be
  //     (priority: momo_import_tracks lookup > MO prefix > CC prefix).
  //   - `warehouseHintNote`: human-readable note for the chip.
  const [duplicateRow, setDuplicateRow] = useState<{ id: number; userid: string | null } | null>(null);
  const [warehouseHintNote, setWarehouseHintNote] = useState<string | null>(null);
  const [trackingChecking, setTrackingChecking] = useState<boolean>(false);
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

  // ─── GAP 10 — tax-document choice (was silently defaulted) ───────
  // receipt = ไม่รับเอกสาร (no VAT doc) · tax_invoice = ใบกำกับภาษี ·
  // customs = ใบขนสินค้า. Persists to tb_forwarder.tax_doc_pref → the detail
  // page badge + the issuance flow read it. Billing snapshot (for VAT docs)
  // is completed later on the detail/edit page; the quick-add captures the
  // CHOICE so back-office isn't left guessing.
  const [taxDocPref, setTaxDocPref] = useState<string>("receipt");

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

  // ─── auto-detect warehouse from tracking prefix (2026-06-04 ภูม) ───
  // Inlined into the tracking onChange handler (handleTrackingChange) below —
  // React 19's `react-hooks/set-state-in-effect` rule rejects setState inside
  // useEffect for cascading-render reasons; doing the work in the change
  // handler also makes the data flow easier to follow (1 source of truth =
  // the keystroke).
  function applyTrackingAutoDetect(nextTracking: string) {
    const guess = guessWarehouseFromTracking(nextTracking);
    if (guess !== null) {
      setWarehouseName(guess);
      setWarehouseAutoFilled(true);
    } else if (warehouseAutoFilled) {
      // Tracking doesn't match any known prefix — clear any prior auto-fill
      // so the displayed chip disappears on a typo correction.
      setWarehouseName("");
      setWarehouseAutoFilled(false);
    }
  }

  // ─── 2026-06-04 (ภูม flag #2) ─────────────────────────────────────
  // Debounced AJAX check: every 600ms after the admin pauses typing in the
  // tracking field, hit `/api/admin/forwarders/check-tracking`. The server
  // returns:
  //   - `duplicate`: row in tb_forwarder with the same ftrackingchn (show
  //     a red badge "เลขซ้ำ #51234" so admin doesn't double-open the order),
  //   - `warehouse + source`: best-known warehouse + where it came from
  //     (momo-sync = authoritative, beats client-side prefix guess).
  // This is the smart equivalent of legacy scriptfTrackingCHN.php + a new
  // MOMO sync hint pacred enhancement (legacy didn't have).
  useEffect(() => {
    const tracking = trackingChn.trim();
    let cancelled = false;

    // Always schedule a 600ms tick — empty-tracking handling lives INSIDE
    // the callback (React 19's `react-hooks/set-state-in-effect` rule
    // forbids setState directly in the effect body).
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (!tracking) {
        setDuplicateRow(null);
        setWarehouseHintNote(null);
        setTrackingChecking(false);
        return;
      }
      setTrackingChecking(true);
      try {
        const r = await fetch(
          `/api/admin/forwarders/check-tracking?t=${encodeURIComponent(tracking)}`,
          { cache: "no-store" },
        );
        if (cancelled || !r.ok) return;
        const j = (await r.json()) as {
          ok: boolean;
          duplicate: { id: number; userid: string | null } | null;
          warehouse: string | null;
          source: "momo-sync" | "mo-prefix" | "cc-prefix" | null;
          note?: string;
        };
        if (cancelled || !j.ok) return;
        setDuplicateRow(j.duplicate);
        // server's warehouse hint wins over client prefix guess when source
        // = "momo-sync" (authoritative). When source = mo-prefix / cc-prefix,
        // client guessed the same — no override needed.
        if (j.source === "momo-sync" && j.warehouse) {
          setWarehouseName(j.warehouse as WarehouseCode);
          setWarehouseAutoFilled(true);
        }
        setWarehouseHintNote(j.note ?? null);
      } catch {
        // network error → ignore (the form still validates server-side)
      } finally {
        if (!cancelled) setTrackingChecking(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trackingChn]);

  // ─── direct customer search (no group needed) — ภูม flag round 9 ──
  // Runs only when NO member-type group is chosen (the group path filters its
  // own loaded list client-side). All setState lives INSIDE the timer callback
  // — React 19's `react-hooks/set-state-in-effect` forbids setState in the body.
  useEffect(() => {
    const q = userFilter.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (group || q.length < 2) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      const res = await searchCustomers(q);
      if (cancelled) return;
      setSearchResults(res.ok ? (res.data?.customers ?? []) : []);
      setSearchLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userFilter, group]);

  // ─── when member-type group changes → fetch users for that group ──
  async function onGroupChange(next: string) {
    setGroup(next);
    setUserid("");
    setUserFilter("");
    setCoid("");
    setPickedCustomer(null);
    setAddresses([]);
    setAddressId(null);
    setSearchResults([]);
    setFieldErrors((p) => { const n = new Set(p); n.delete("coid"); n.delete("userid"); return n; });

    if (!next) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    const res = await fetchUsersByGroup(next as CustomerGroup);
    setUsersLoading(false);
    if (res.ok) {
      setUsers(res.data?.users ?? []);
    } else {
      setUsers([]);
      setError(`โหลดรายชื่อสมาชิกไม่สำเร็จ: ${res.error}`);
    }
  }

  // ─── when user picked → fetch their addresses ─────────────────
  // pickedCoid is supplied by the direct-search path (the customer's own
  // coID) so the tier/validation/audit stay consistent without the staff
  // having to know which tb_co bucket they live in.
  async function onUserPick(picked: CustomerOption, pickedCoid?: string | null) {
    setUserid(picked.userID);
    setPickedCustomer(picked);
    if (pickedCoid !== undefined) {
      // adopt the customer's own coID (fallback "-" for the rare null — the
      // field is only the tier label + audit log; the order keys off userID,
      // which adminCreateForwarder re-verifies server-side).
      const c = (pickedCoid ?? "").trim().slice(0, 10) || "-";
      setCoid(c);
    }
    setUserFilter("");
    setUserPickerOpen(false);
    setFieldErrors((p) => { const n = new Set(p); n.delete("userid"); n.delete("coid"); return n; });

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
    () =>
      (pickedCustomer && pickedCustomer.userID === userid ? pickedCustomer : null) ??
      users.find((u) => u.userID === userid) ??
      (presetUser?.userID === userid ? presetUser : null),
    [userid, users, presetUser, pickedCustomer],
  );

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.addressid === addressId) ?? null,
    [addresses, addressId],
  );

  // ขนส่งเอกชน ที่วิ่งจริงในจังหวัดปลายทาง (owner's workbook · CLOSED). Empty until an address
  // is picked → the <select> then shows the empty-state instead of a free list.
  const privateCarriers = useMemo(
    () => getPrivateCarrierOptionsForProvince(selectedAddress?.addressprovince ?? ""),
    [selectedAddress],
  );
  // A carrier that does NOT serve the picked province must not stay silently selected (the
  // province can change under it when the staff re-picks the address). Derived during render —
  // never a setState-in-effect: `shipByEff` is what the <select> shows AND what we submit, so a
  // stale pick simply falls back to the "— กรุณาเลือก —" placeholder and the form blocks.
  const shipByEff =
    !shipBy || shipBy === "PCS" || shipBy === "PCSF" || privateCarriers.some((c) => c.id === shipBy)
      ? shipBy
      : "";

  // ─── cover handlers ─────────────────────────────────────────────
  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0] ?? null;
    if (!raw) { setError(null); updateCoverPreview(null); return; }
    // Compress in-browser (fails soft → original) so a normal 3–8 MB phone
    // photo isn't bounced outright and can't trip the Server-Action
    // bodySizeLimit. The >5 MB guard remains as a fallback for genuinely huge
    // files (the bucket helper caps at 5 MB).
    const f = await compressImageFile(raw, { maxDim: 1600, quality: 0.82 }).catch(() => raw);
    if (f.size > 5 * 1024 * 1024) {
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
    setGroup("");
    setCoid("");
    setUsers([]);
    setSearchResults([]);
    setPickedCustomer(null);
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
    setTaxDocPref("receipt");
    setWarehouseName("");
    setWarehouseAutoFilled(false);
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
    if (!shipByEff)            errs.add("shipBy");
    if (shipByEff !== "PCS" && !addressId) errs.add("addressId");

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
          shipBy:         shipByEff,
          addressId:      shipByEff === "PCS" ? null : addressId,
          transportType:  transportType,
          warehouseName:  warehouseName,
          taxDocPref:     taxDocPref,
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
          {/* member-type group (clean categories · same as /admin/customers) */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ประเภทสมาชิก <span className="text-muted">· ไม่บังคับ</span>
            </label>
            <select
              value={group}
              onChange={(e) => onGroupChange(e.target.value)}
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("coid")}`}
            >
              <option value="">— กรุณาเลือก —</option>
              {CUSTOMER_GROUP_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">เลือกเพื่อกรองตามกลุ่ม — หรือพิมพ์ค้นหาลูกค้าทางขวาได้เลย (ทุกกลุ่ม)</p>
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
                  onClick={() => {
                    // Full reset back to the universal search (don't strand the
                    // admin inside the member-type group from a prior pick).
                    setUserid("");
                    setUserFilter("");
                    setGroup("");
                    setCoid("");
                    setPickedCustomer(null);
                    setUsers([]);
                    setSearchResults([]);
                    setAddresses([]);
                    setAddressId(null);
                    setUserPickerOpen(true);
                  }}
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
                    group
                      ? (usersLoading ? "กำลังโหลด..." : `ค้นหาในกลุ่มนี้ · PR1234 · ชื่อ · เบอร์ (${users.length} คน)`)
                      : "พิมพ์ค้นหาลูกค้า · PR1234 · ชื่อ · เบอร์ — ทุกกลุ่ม"
                  }
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("userid")}`}
                  disabled={pending}
                  autoComplete="off"
                />
                {userPickerOpen && (group ? !usersLoading : userFilter.trim().length >= 1) && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                    {group ? (
                      /* ── group filter: pick from the group-loaded list ── */
                      filteredUsers.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted">ไม่พบสมาชิกในกลุ่มนี้</div>
                      ) : (
                        filteredUsers.map((u) => (
                          <button
                            key={u.userID}
                            type="button"
                            onClick={() => onUserPick(u, u.coID)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-alt"
                          >
                            <span className="font-mono text-primary-600">{u.userID}</span>
                            <span className="mx-1.5 text-muted">·</span>
                            <span>{customerDisplayName(u) || "(ไม่มีชื่อ)"}</span>
                            {u.userTel && <span className="ml-2 text-xs text-muted">{u.userTel}</span>}
                          </button>
                        ))
                      )
                    ) : (
                      /* ── direct search across ALL coIDs (ภูม flag round 9) ── */
                      searchLoading ? (
                        <div className="px-4 py-3 text-sm text-muted">กำลังค้นหา...</div>
                      ) : userFilter.trim().length < 2 ? (
                        <div className="px-4 py-3 text-sm text-muted">พิมพ์อย่างน้อย 2 ตัวอักษร</div>
                      ) : searchResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted">ไม่พบลูกค้า &ldquo;{userFilter.trim()}&rdquo;</div>
                      ) : (
                        searchResults.map((u) => (
                          <button
                            key={u.userID}
                            type="button"
                            onClick={() => onUserPick(u, u.coID)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-alt"
                          >
                            <span className="font-mono text-primary-600">{u.userID}</span>
                            <span className="mx-1.5 text-muted">·</span>
                            <span>{customerDisplayName(u) || "(ไม่มีชื่อ)"}</span>
                            {u.userTel && <span className="ml-2 text-xs text-muted">{u.userTel}</span>}
                            {u.coID && <span className="ml-2 rounded bg-surface-alt px-1.5 text-[11px] text-muted">{u.coID}</span>}
                          </button>
                        ))
                      )
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
              const next = e.target.value;
              setTrackingChn(next);
              setFieldErrors((p) => { const n = new Set(p); n.delete("trackingChn"); return n; });
              applyTrackingAutoDetect(next);
            }}
            maxLength={50}
            placeholder="เลข Tracking"
            disabled={pending}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("trackingChn")}`}
            required
          />
        </div>

        {/* ─── feedback chips (2026-06-04 ภูม flag · 3 signals) ─────────
            1. 🔴 DUPLICATE warning — มี tb_forwarder row นี้อยู่แล้ว
               (legacy scriptfTrackingCHN.php "มีรายการซ้ำ" red text)
            2. ⏳ checking spinner — กำลังตรวจ DB
            3. 🟢 warehouse auto-detect — MOMO sync (authoritative) /
               prefix guess (fallback) */}
        {duplicateRow && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            ⚠️ <strong>เลขนี้มีรายการซ้ำในระบบแล้ว!</strong>
            <a
              href={`/admin/forwarders/${duplicateRow.id}`}
              target="_blank"
              rel="noreferrer"
              className="ml-1 underline hover:text-red-900"
            >
              ดูออเดอร์ #{duplicateRow.id}
              {duplicateRow.userid ? ` (${duplicateRow.userid})` : ""} ↗
            </a>
          </div>
        )}
        {trackingChecking && !duplicateRow && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-alt px-3 py-1 text-xs text-muted">
            ⏳ กำลังตรวจสอบกับ MOMO sync · DB...
          </div>
        )}
        {warehouseName && warehouseAutoFilled && !trackingChecking && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            🏬 ตรวจจับโกดังอัตโนมัติ: <strong>{WAREHOUSE_OPTIONS.find((o) => o.value === warehouseName)?.label.split(" - ")[1] ?? warehouseName}</strong>
            <span className="text-emerald-600/70">
              ({warehouseHintNote ?? "จาก prefix tracking"} · แก้ภายหลังใน /edit)
            </span>
          </div>
        )}

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
                รูปสินค้า <span className="text-[11px] text-muted">(ไม่บังคับ · max 5MB)</span>
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
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white hover:bg-black/80"
                    >
                      × ลบ
                    </button>
                  </div>
                  <p className="text-[11px] text-muted truncate">{coverFile.name}</p>
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
            <strong>&ldquo;Pacred เหมาๆ (50 บ.) — กทม + ปริมณฑล&rdquo;</strong>
          </div>
        )}

        {/* Address picker. 2026-07-14 (owner · CLOSED carrier list): this now comes BEFORE the
            carrier <select> — the ขนส่งเอกชน options are derived from the delivery PROVINCE, so the
            address has to be chosen first. fShipBy='PCS' still swaps in the warehouse-pickup box. */}
        {shipBy === "PCS" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-medium">📍 ที่อยู่: รับเองที่โกดัง Pacred (สมุทรสาคร)</p>
            <p className="mt-1 text-xs leading-relaxed">
              48/2 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130 (S&T WAREHOUSE219)<br />
              โทร 02-421-3325
            </p>
          </div>
        ) : (
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
        )}

        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            บริษัทขนส่ง <span className="text-red-500">*</span>
          </label>
          <select
            value={shipByEff}
            onChange={(e) => {
              setShipBy(e.target.value);
              setFieldErrors((p) => { const n = new Set(p); n.delete("shipBy"); return n; });
            }}
            disabled={pending}
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("shipBy")}`}
            required
          >
            <option value="">— กรุณาเลือกบริษัทขนส่ง —</option>
            <optgroup label="Pacred (ส่งเอง)">
              {freeShipping && (
                <option value="PCSF">📦 Pacred เหมาๆ (50 บ.) — กทม + ปริมณฑล</option>
              )}
              {OWN_FLEET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
            {privateCarriers.length > 0 && (
              <optgroup
                label={`ขนส่งเอกชน ที่วิ่ง จ.${selectedAddress?.addressprovince ?? ""} (${privateCarriers.length})`}
              >
                {privateCarriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.note ? ` — ${c.note}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {privateCarriers.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              {selectedAddress
                ? `ยังไม่มีขนส่งเอกชนที่วิ่ง จ.${selectedAddress.addressprovince} ในไฟล์พื้นที่ขนส่ง — ตรวจจังหวัดในที่อยู่`
                : "เลือกที่อยู่จัดส่งก่อน ระบบจะขึ้นรายชื่อ “ขนส่งเอกชน” ที่วิ่งในจังหวัดนั้นให้เลือก (เลือกได้เฉพาะที่มีในไฟล์พื้นที่ขนส่งของบริษัท)"}
            </p>
          )}
        </div>

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

        {/* GAP 10 — เอกสารภาษี (was silently defaulted to ไม่รับเอกสาร) */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            เอกสารภาษี (ลูกค้าต้องการ)
          </label>
          <select
            value={taxDocPref}
            onChange={(e) => setTaxDocPref(e.target.value)}
            disabled={pending}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
          >
            <option value="receipt">ไม่รับเอกสาร (ใบเสร็จ · ไม่มี VAT)</option>
            <option value="tax_invoice">ใบกำกับภาษี (VAT 7% · มูลค่าสินค้า)</option>
            <option value="customs">ใบขนสินค้า (VAT 7% · ค่าบริการ)</option>
          </select>
          <p className="mt-1 text-[11px] text-muted">
            เลือกตามที่ลูกค้าต้องการ — รายละเอียดผู้เสียภาษี (เลขผู้เสียภาษี/ที่อยู่) กรอกเพิ่มได้ในหน้ารายละเอียด
          </p>
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
