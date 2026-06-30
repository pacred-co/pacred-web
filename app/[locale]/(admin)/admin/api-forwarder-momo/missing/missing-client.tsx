"use client";

/**
 * /admin/api-forwarder-momo/missing — Client UI.
 *
 * 2026-06-29 (ภูม). Lists the MOMO parcels our tb_forwarder is still MISSING and
 * lets staff create the forwarder row in 1 click. There are TWO kinds of missing
 * parcel and this page shows BOTH (ภูม):
 *
 *   • SET A — "พร้อมเพิ่ม" (member KNOWN): parcels in the RICH `import_track`
 *     feed whose tracking is NOT yet in tb_forwarder. import_track returns the
 *     member (user_group+user_code), the real China tracking, weight/cbm/dims,
 *     type, status, container, sack — everything → auto-fill the member, just
 *     confirm + add (NO manual member input).
 *
 *   • SET B — "ต้องกรอกรหัสเอง" (member UNKNOWN): real parcels in the closed-
 *     container `track_details` whose base tracking is NOT in import_track AND
 *     NOT in tb_forwarder. MOMO genuinely sends no member for these → staff
 *     reads the member off the MOMO web UI + types it.
 *
 * Flow:
 *   1. pick a date range (default ~14 days) → "ค้นหา"
 *   2. fetch import_track + container_closed + track-completeness (3 feeds)
 *   3. Set A = import_track bases not in tb_forwarder
 *      Set B = container_closed track_details bases not in import_track AND not
 *              in tb_forwarder, with SACK-style reTracks filtered out
 *   4. render ONE table grouped Set A first, then Set B (rich columns)
 *   5. confirm → addMissingMomoParcel(...) → mark ✓ / show error inline
 *
 * Money-UX: never auto-submit; one explicit confirmed click per parcel.
 * Writes go ONLY through the addMissingMomoParcel server action; the MOMO reads
 * go through the existing admin-gated API routes.
 */

import { Fragment, useState, useTransition } from "react";
import { confirm } from "@/components/ui/confirm";
import {
  deriveModeFromCid,
  momoRawDisplay,
  baseTrackingOf,
  MOMO_SHIP_BY_TH,
} from "@/lib/admin/momo-raw-helpers";
import { addMissingMomoParcel, addMissingMomoParcelsBulk } from "@/actions/admin/momo-add-missing";
import { fetchMissingMembersFromMomo } from "@/actions/admin/momo-fetch-members";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";

/**
 * SACK / container codes leak into container_closed.track_details[].reTrack
 * (e.g. "CBX260621-EK06", "CBX260616-SEA01", "GZS260626-1") — those are sack /
 * cabinet identifiers, NOT real parcels. Drop them from Set B; keep only real
 * China trackings. Matches `<2-4 LETTERS><6+ digits>-<EK|SEA|GZ|AIR><opt digits>`.
 */
const SACK_RE = /^[A-Z]{2,4}\d{6,}-(EK|SEA|GZ|AIR)\d*/i;
function isSackCode(re: string): boolean {
  return SACK_RE.test(re.trim());
}

/**
 * A missing parcel, one row per BASE tracking (split "-i/n" merged).
 *
 * `kind` distinguishes the two sets:
 *   "A" = member KNOWN (from import_track) — show the auto-resolved member chip
 *   "B" = member UNKNOWN (from container_closed orphan) — show a member input
 */
type MissingParcel = {
  kind:       "A" | "B";
  base:       string;        // base tracking (the tb_forwarder.ftrackingchn key)
  cabinet:    string;        // container cid / container_no (passed to the action)
  member:     string;        // SET A: auto-resolved "PR###"; SET B: ""
  shipBy:     string;        // raw MOMO ship_by ("car"/"ship"/"air") | ""
  weightKg:   number;        // summed across this base's "-i/n" parcels
  cbm:        number;        // summed across this base's "-i/n" parcels
  pieces:     number;        // how many source rows folded into this base
  // ── rich (SET A only — from import_track via momoRawDisplay) ──
  width:      number;        // 0 when unknown
  length:     number;
  height:     number;
  productType:string;        // raw `type` — e.g. "fda"
  statusText: string;        // readable MOMO status (last reached phase label)
  containerNo:string;        // import_track routing batch (display only)
  sackNo:     string;        // import_track sack
};

/** Per-row submit state. */
type RowState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "added"; fid: number }
  | { kind: "error"; message: string };

type CompletenessHit = { inFwd: boolean; fid: number; fweight: number; fstatus: string | null };
type CompletenessMap = Record<string, CompletenessHit>;

/** num coercion (finite → value, else 0). */
function numOr0(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

/** Map raw MOMO ship_by → the action's enum, or undefined. */
function normalizeShipBy(raw: string): "car" | "ship" | "air" | undefined {
  const s = raw.trim().toLowerCase();
  return s === "car" || s === "ship" || s === "air" ? s : undefined;
}

/** raw ship_by → Thai label (falls back to the raw string, then "—"). */
function shipByTh(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "—";
  return MOMO_SHIP_BY_TH[s] ?? raw;
}

/** N days ago as YYYY-MM-DD. */
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Same unwrap the container-closed handling uses: bare array OR { data: [...] }. */
function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data;
  }
  return [];
}

// ── Export / copy: ONE column set shared by the clipboard-TSV + the Excel CSV ──
// keys map 1:1 to MissingParcel-derived cells (see rowCells); order = on-screen.
const EXPORT_COLS: CsvCol[] = [
  { key: "member",  label: "รหัสลูกค้า" },
  { key: "base",    label: "เลขพัสดุจีน" },
  { key: "weight",  label: "น้ำหนัก(กก.)" },
  { key: "cbm",     label: "คิว(ลบ.ม.)" },
  { key: "dims",    label: "ขนาด(กxยxส)" },
  { key: "type",    label: "ประเภท" },
  { key: "ship",    label: "ขนส่ง" },
  { key: "status",  label: "สถานะ" },
  { key: "cabinet", label: "ตู้" },
  { key: "sack",    label: "กระสอบ" },
];

/**
 * One MissingParcel → a flat CsvRow keyed by EXPORT_COLS. SET B columns that
 * only exist for SET A (dims/type/status/sack) are blank, exactly like the
 * table. `memberOverride` is the staff-typed code for a SET B row at the moment
 * of copy/export (SET A always uses the auto-resolved p.member).
 */
function rowCells(p: MissingParcel, memberOverride: string): CsvRow {
  const dims =
    p.kind === "A" && (p.width || p.length || p.height)
      ? `${p.width || 0}×${p.length || 0}×${p.height || 0}`
      : "";
  return {
    member:  p.kind === "A" ? p.member : memberOverride.trim().toUpperCase(),
    base:    p.base,
    weight:  p.weightKg || "",
    cbm:     p.cbm || "",
    dims,
    type:    p.kind === "A" ? p.productType : "",
    ship:    shipByTh(p.shipBy) === "—" ? "" : shipByTh(p.shipBy),
    status:  p.kind === "A" ? p.statusText : "",
    cabinet: p.cabinet,
    sack:    p.kind === "A" ? p.sackNo : "",
  };
}

/**
 * One TSV cell — formula-injection-safe (Excel runs `= + - @` and leading
 * TAB/CR as formulas on paste, same as a .csv import) + tab/newline stripped
 * so a value can't break the row/column grid. No RFC-4180 quoting: a pasted
 * TSV is tab-delimited plain text, not a quoted CSV.
 */
function tsvCell(value: string | number | null | undefined): string {
  let s = String(value ?? "").replace(/[\t\r\n]+/g, " ");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return s;
}

export function MomoMissingClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(daysAgoIso(14));
  const [end, setEnd]     = useState(today);

  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Missing parcels, Set A first then Set B, grouped by cabinet within each set.
  const [missing, setMissing] = useState<MissingParcel[]>([]);
  // SET B only: per-base member-code input.
  const [members, setMembers] = useState<Record<string, string>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  // SET B auto-fill from the MOMO web (login-replication).
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState<string | null>(null);
  // SET B "เพิ่มทั้งหมด" bulk-add.
  const [bulkAdding, startBulkAdd] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // ── Search: import_track + container_closed → completeness → keep the missing ──
  async function onSearch() {
    setBusy(true);
    setError(null);
    setSearched(false);
    setMissing([]);
    setRowStates({});
    try {
      const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

      // 1. fetch import_track + container_closed in parallel
      const [itRes, ccRes] = await Promise.all([
        fetch(`/api/admin/momo/import-track?${qs}`, { cache: "no-store" }),
        fetch(`/api/admin/momo/container-closed?${qs}`, { cache: "no-store" }),
      ]);

      const itJson = (await itRes.json().catch(() => null)) as
        | { ok?: boolean; data?: unknown; error?: string; message?: string } | null;
      const ccJson = (await ccRes.json().catch(() => null)) as
        | { ok?: boolean; data?: unknown; error?: string; message?: string } | null;

      if (!itRes.ok || !itJson?.ok) {
        setError(itJson?.message || itJson?.error || `ดึง Import Track ไม่สำเร็จ (HTTP ${itRes.status})`);
        setSearched(true);
        return;
      }
      if (!ccRes.ok || !ccJson?.ok) {
        setError(ccJson?.message || ccJson?.error || `ดึงตู้ปิดไม่สำเร็จ (HTTP ${ccRes.status})`);
        setSearched(true);
        return;
      }

      const importRecords = unwrapArray(itJson.data);
      const containers     = unwrapArray(ccJson.data);

      // 2. SET A source — import_track parcels by base tracking (rich).
      //    Use momoRawDisplay for member/dims/type/status; sum split "-i/n".
      type AccA = {
        cabinet: string; member: string; shipBy: string; weightKg: number; cbm: number;
        pieces: number; width: number; length: number; height: number;
        productType: string; statusText: string; containerNo: string; sackNo: string;
      };
      const byBaseA = new Map<string, AccA>();
      // every base seen in import_track (so Set B can exclude these)
      const importBases = new Set<string>();
      const allTrackings: string[] = [];

      for (const rec of importRecords) {
        if (!rec || typeof rec !== "object") continue;
        const d = momoRawDisplay(rec);
        const tracking = (d.tracking || "").trim();
        if (!tracking) continue;
        const base = baseTrackingOf(tracking);
        importBases.add(base);
        allTrackings.push(tracking);

        // last reached phase = current MOMO status (readable Thai)
        const reached = d.phases.filter((p) => p.at);
        const statusText = reached.length > 0 ? reached[reached.length - 1].label : "รอตรวจสอบสถานะ";
        const cabinet = (d.cabinet || d.containerNo || "").trim();

        const prev = byBaseA.get(base);
        if (prev) {
          prev.weightKg += d.weight;
          prev.cbm      += d.cbm;
          prev.pieces   += 1;
          if (!prev.member && d.memberCode) prev.member = d.memberCode;
          if (!prev.cabinet && cabinet) prev.cabinet = cabinet;
          if (!prev.shipBy && d.shipBy) prev.shipBy = d.shipBy;
        } else {
          byBaseA.set(base, {
            cabinet,
            member:      d.memberCode,
            shipBy:      d.shipBy,
            weightKg:    d.weight,
            cbm:         d.cbm,
            pieces:      1,
            width:       d.width,
            length:      d.length,
            height:      d.height,
            productType: d.productType,
            statusText,
            containerNo: d.containerNo,
            sackNo:      d.sackNo,
          });
        }
      }

      // 3. SET B source — container_closed track_details by base tracking.
      //    Keep ONLY real parcel trackings (drop sack/container codes), and
      //    exclude any base already seen in import_track.
      type AccB = { cabinet: string; shipBy: string; weightKg: number; cbm: number; pieces: number };
      const byBaseB = new Map<string, AccB>();

      for (const c of containers) {
        if (!c || typeof c !== "object") continue;
        const cr = c as Record<string, unknown>;
        const cabinet = typeof cr.cid === "string" ? cr.cid.trim() : "";
        if (!cabinet) continue;
        const shipBy = typeof cr.ship_by === "string" ? cr.ship_by.trim() : "";
        const td = Array.isArray(cr.track_details) ? cr.track_details : [];
        for (const t of td) {
          if (!t || typeof t !== "object") continue;
          const o = t as Record<string, unknown>;
          const re = typeof o.reTrack === "string" ? o.reTrack.trim() : "";
          if (!re) continue;
          if (isSackCode(re)) continue;          // sack / cabinet code → not a parcel
          const base = baseTrackingOf(re);
          if (importBases.has(base)) continue;   // already covered by Set A (rich)
          allTrackings.push(re);
          const kg = numOr0(o.kg);
          const cbm = numOr0(o.cbm);
          const prev = byBaseB.get(base);
          if (prev) {
            prev.weightKg += kg;
            prev.cbm += cbm;
            prev.pieces += 1;
            if (!prev.cabinet && cabinet) prev.cabinet = cabinet;
            if (!prev.shipBy && shipBy) prev.shipBy = shipBy;
          } else {
            byBaseB.set(base, { cabinet, shipBy, weightKg: kg, cbm, pieces: 1 });
          }
        }
      }

      if (byBaseA.size === 0 && byBaseB.size === 0) {
        setMissing([]);
        setSearched(true);
        return;
      }

      // 4. completeness → which bases are already in tb_forwarder (exclude BOTH sets)
      let completeness: CompletenessMap = {};
      if (allTrackings.length > 0) {
        const compRes = await fetch("/api/admin/momo/track-completeness", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackings: allTrackings }),
          cache: "no-store",
        });
        const compJson = (await compRes.json().catch(() => ({ map: {} }))) as { map?: CompletenessMap };
        completeness = compJson?.map ?? {};
      }

      const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

      // 5. build the rows — Set A (member known) first, then Set B (member unknown).
      const setA: MissingParcel[] = [];
      for (const [base, a] of byBaseA) {
        if (completeness[base]) continue; // already in tb_forwarder → skip
        setA.push({
          kind:        "A",
          base,
          cabinet:     a.cabinet,
          member:      a.member,
          shipBy:      a.shipBy,
          weightKg:    round6(a.weightKg),
          cbm:         round6(a.cbm),
          pieces:      a.pieces,
          width:       a.width,
          length:      a.length,
          height:      a.height,
          productType: a.productType,
          statusText:  a.statusText,
          containerNo: a.containerNo,
          sackNo:      a.sackNo,
        });
      }

      const setB: MissingParcel[] = [];
      for (const [base, b] of byBaseB) {
        if (completeness[base]) continue; // already in tb_forwarder → skip
        setB.push({
          kind:        "B",
          base,
          cabinet:     b.cabinet,
          member:      "",
          shipBy:      b.shipBy,
          weightKg:    round6(b.weightKg),
          cbm:         round6(b.cbm),
          pieces:      b.pieces,
          width:       0,
          length:      0,
          height:      0,
          productType: "",
          statusText:  "",
          containerNo: "",
          sackNo:      "",
        });
      }

      // group by cabinet within each set so same-ตู้ rows sit together
      const byCabinet = (a: MissingParcel, b: MissingParcel) =>
        a.cabinet === b.cabinet ? a.base.localeCompare(b.base) : a.cabinet.localeCompare(b.cabinet);
      setA.sort(byCabinet);
      setB.sort(byCabinet);

      setMissing([...setA, ...setB]);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการค้นหา");
      setSearched(true);
    } finally {
      setBusy(false);
    }
  }

  // ── Add one parcel ──────────────────────────────────────────────────────
  async function onAdd(p: MissingParcel) {
    // SET A → member is auto-resolved; SET B → member is typed.
    const member = (p.kind === "A" ? p.member : members[p.base] ?? "").trim();
    if (!member) {
      setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: "กรอกรหัสลูกค้าก่อน (PR…)" } }));
      return;
    }
    if (!/^PR\d+$/i.test(member)) {
      setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: "รหัสลูกค้าต้องเป็น PR#### เช่น PR145" } }));
      return;
    }

    const ok = await confirm(
      `ยืนยันเพิ่มพัสดุเข้าระบบ?\n\n` +
        `เลขแทรกกิ้ง: ${p.base}\n` +
        `ตู้: ${p.cabinet || "—"}\n` +
        `ลูกค้า: ${member.toUpperCase()}${p.kind === "A" ? " (จาก MOMO)" : " (กรอกเอง)"}\n` +
        `น้ำหนัก: ${p.weightKg || "—"} กก. · ${p.cbm || "—"} คิว`,
      { title: "เพิ่มพัสดุที่ขาด", confirmLabel: "เพิ่มเข้าระบบ" },
    );
    if (!ok) return;

    setRowStates((s) => ({ ...s, [p.base]: { kind: "saving" } }));
    try {
      const res = await addMissingMomoParcel({
        tracking:   p.base,
        cabinet:    p.cabinet,
        memberCode: member,
        weightKg:   p.weightKg,
        cbm:        p.cbm,
        shipBy:     normalizeShipBy(p.shipBy),
      });
      if (res.ok) {
        setRowStates((s) => ({ ...s, [p.base]: { kind: "added", fid: res.data?.fid ?? 0 } }));
      } else {
        setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: res.error } }));
      }
    } catch (e) {
      setRowStates((s) => ({ ...s, [p.base]: { kind: "error", message: e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ" } }));
    }
  }

  // ── Copy + Export: the on-screen rows as data (member read live for SET B) ──
  const [copied, setCopied] = useState(false);
  const exportRows: CsvRow[] = missing.map((p) => rowCells(p, members[p.base] ?? ""));

  async function onCopy() {
    // header + every row as tab-separated text (BOTH sets, in display order)
    const header = EXPORT_COLS.map((c) => c.label).join("\t");
    const body = exportRows
      .map((row) => EXPORT_COLS.map((c) => tsvCell(row[c.key])).join("\t"))
      .join("\n");
    const text = `${header}\n${body}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback for non-secure-context / older browsers
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่รองรับการคัดลอกอัตโนมัติ");
    }
  }

  // ── Auto-fill SET B member codes from the MOMO web (login-replication) ──────
  // Pulls every SET B base tracking, asks MOMO (master account, server-side) for
  // its cn_usercode, and fills the empty member inputs. Fill-when-empty: never
  // overwrites a code the staff already typed. Read-only — staff still confirms +
  // clicks "เพิ่มเข้าระบบ" per parcel.
  async function onAutofillMembers() {
    const setBBases = missing.filter((m) => m.kind === "B").map((m) => m.base);
    if (setBBases.length === 0) return;
    setAutofillBusy(true);
    setAutofillMsg(null);
    try {
      const res = await fetchMissingMembersFromMomo({ trackings: setBBases });
      if (res.ok) {
        const map = res.data?.map ?? {};
        setMembers((prev) => {
          const next = { ...prev };
          for (const [base, member] of Object.entries(map)) {
            if (member && !next[base]?.trim()) next[base] = member; // fill-when-empty
          }
          return next;
        });
        const got = res.data?.resolved ?? 0;
        setAutofillMsg(
          got > 0
            ? `✓ ดึงรหัสลูกค้าจาก MOMO ได้ ${got}/${setBBases.length} รายการ`
            : `MOMO ไม่มีรหัสลูกค้าของแบบ B เหล่านี้ (กรอกเองได้)`,
        );
      } else {
        setAutofillMsg(`⚠️ ${res.error}`);
      }
    } catch (e) {
      setAutofillMsg(`⚠️ ${e instanceof Error ? e.message : "ดึงไม่สำเร็จ"}`);
    } finally {
      setAutofillBusy(false);
    }
  }

  // ── SET B bulk-add: every Set B row whose member code is filled + valid ─────
  // Only Set B rows that already carry a PR#### member code are eligible. Rows
  // without a code are excluded from the batch (not sent). Already-added rows
  // (rowStates "added") are also skipped — they have no parcel left to create.
  function eligibleSetBRows(): MissingParcel[] {
    return missing.filter((p) => {
      if (p.kind !== "B") return false;
      if ((rowStates[p.base] ?? { kind: "idle" }).kind === "added") return false;
      const code = (members[p.base] ?? "").trim();
      return /^PR\d+$/i.test(code);
    });
  }

  async function onBulkAddSetB() {
    const rows = eligibleSetBRows();
    if (rows.length === 0) return;

    const ok = await confirm(
      `เพิ่มพัสดุแบบ B เข้าระบบทั้งหมด ${rows.length} รายการ?\n\n` +
        `(เฉพาะรายการที่กรอกรหัสลูกค้า PR#### แล้ว · รายการที่ยังไม่กรอกจะถูกข้าม · ` +
        `รายการที่มีในระบบอยู่แล้วจะถูกข้ามให้อัตโนมัติ ไม่เพิ่มซ้ำ)`,
      { title: "เพิ่มทั้งหมด (แบบ B)", confirmLabel: `เพิ่ม ${rows.length} รายการ` },
    );
    if (!ok) return;

    setBulkMsg(null);
    // mark every targeted row "saving" so the per-row buttons reflect progress
    setRowStates((s) => {
      const next = { ...s };
      for (const p of rows) next[p.base] = { kind: "saving" };
      return next;
    });

    startBulkAdd(async () => {
      try {
        const res = await addMissingMomoParcelsBulk(
          rows.map((p) => ({
            tracking:   p.base,
            cabinet:    p.cabinet,
            memberCode: (members[p.base] ?? "").trim(),
            weightKg:   p.weightKg,
            cbm:        p.cbm,
            shipBy:     normalizeShipBy(p.shipBy),
          })),
        );

        if (!res.ok) {
          // whole-batch reject (auth/validation) — revert the rows to idle
          setRowStates((s) => {
            const next = { ...s };
            for (const p of rows) next[p.base] = { kind: "idle" };
            return next;
          });
          setBulkMsg(`⚠️ เพิ่มไม่สำเร็จ: ${res.error}`);
          return;
        }

        const summary = res.data!;
        // fold each per-row result back into rowStates so each row shows ✓ / ⚠️
        setRowStates((s) => {
          const next = { ...s };
          for (const r of summary.results) {
            if (r.ok) {
              next[r.base] = { kind: "added", fid: r.fid ?? 0 };
            } else if (r.skipped) {
              // already in system → mark added too (it exists; nothing to do)
              next[r.base] = { kind: "added", fid: 0 };
            } else {
              next[r.base] = { kind: "error", message: r.error ?? "เพิ่มไม่สำเร็จ" };
            }
          }
          return next;
        });
        setBulkMsg(
          `✓ เพิ่มสำเร็จ ${summary.added} · ข้าม ${summary.skipped} · ผิดพลาด ${summary.failed}` +
            (summary.failed > 0 ? " (ดูแถวที่ขึ้น ⚠️ ด้านล่าง)" : ""),
        );
      } catch (e) {
        setRowStates((s) => {
          const next = { ...s };
          for (const p of rows) next[p.base] = { kind: "idle" };
          return next;
        });
        setBulkMsg(`⚠️ ${e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"}`);
      }
    });
  }

  const countA = missing.filter((m) => m.kind === "A").length;
  const countB = missing.filter((m) => m.kind === "B").length;
  const cabinetCount = new Set(missing.map((m) => m.cabinet).filter(Boolean)).size;
  // how many Set B rows are ready to bulk-add right now (member code filled)
  const eligibleSetBCount = eligibleSetBRows().length;

  return (
    <div className="space-y-5">
      {/* Search */}
      <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="block">
            <span className="text-xs font-semibold text-muted">วันที่เริ่ม (YYYY-MM-DD)</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted">วันที่สิ้นสุด</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={onSearch}
            disabled={busy}
            className="rounded-lg border border-sky-500 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          ระบบจะดึงพัสดุจาก MOMO (Import Track + ตู้ปิด) ในช่วงวันที่ → เทียบกับ tb_forwarder → แสดงเฉพาะพัสดุที่ MOMO มีแต่ยัง
          <strong className="text-red-600"> ไม่เข้าระบบ</strong> เป็น 2 แบบ:{" "}
          <strong className="text-emerald-700">แบบ A</strong> = MOMO ส่งรหัสลูกค้ามาครบ (กดเพิ่มได้เลย) ·{" "}
          <strong className="text-amber-700">แบบ B</strong> = MOMO ส่งไม่ครบ ต้องกรอกรหัสลูกค้าเอง (ดูจากหน้าเว็บ MOMO).
        </p>
      </section>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <strong>ผิดพลาด:</strong> {error}
        </div>
      )}

      {/* Results */}
      {searched && !error && (
        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
          {missing.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ ไม่พบพัสดุที่ขาด — ทุกพัสดุของ MOMO ช่วงนี้เข้าระบบครบแล้ว
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-bold text-red-700">
                    พบ {missing.length} พัสดุที่ขาด
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                    แบบ A (มีรหัส) {countA}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                    แบบ B (กรอกเอง) {countB}
                  </span>
                  <span className="text-muted">ใน {cabinetCount} ตู้</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {countB > 0 && (
                    <button
                      type="button"
                      onClick={onAutofillMembers}
                      disabled={autofillBusy || bulkAdding}
                      className="flex items-center gap-1.5 rounded-lg border border-violet-500 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 shrink-0"
                      title="ดึงรหัสลูกค้าของแบบ B จากเว็บ MOMO อัตโนมัติ (ไม่ต้องเปิดเว็บ MOMO เอง)"
                    >
                      {autofillBusy ? "กำลังดึง..." : `🔄 ดึงรหัสจาก MOMO (${countB})`}
                    </button>
                  )}
                  {countB > 0 && (
                    <button
                      type="button"
                      onClick={onBulkAddSetB}
                      disabled={bulkAdding || autofillBusy || eligibleSetBCount === 0}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0"
                      title={
                        eligibleSetBCount === 0
                          ? "กรอกรหัสลูกค้า (PR…) ของแบบ B ก่อน หรือกด 🔄 ดึงรหัสจาก MOMO"
                          : `เพิ่มแบบ B ที่กรอกรหัสแล้วทั้งหมด ${eligibleSetBCount} รายการเข้าระบบในครั้งเดียว`
                      }
                    >
                      {bulkAdding ? "กำลังเพิ่ม..." : `➕ เพิ่มทั้งหมด (แบบ B · ${eligibleSetBCount})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onCopy}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt shrink-0"
                    title="คัดลอกตารางนี้ (ทั้งแบบ A และ B) เป็นข้อความ วางลง Excel/แชทได้"
                  >
                    {copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอกเป็นข้อความ"}
                  </button>
                  <CsvButton
                    rows={exportRows}
                    cols={EXPORT_COLS}
                    filename={`momo-missing-${start}-${end}.csv`}
                  />
                </div>
              </div>

              {autofillMsg && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] text-violet-800">
                  {autofillMsg}
                </div>
              )}

              {bulkMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
                  {bulkMsg}
                </div>
              )}

              <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-surface-alt">
                    <tr className="whitespace-nowrap">
                      <th className="text-left px-2 py-2 border-b font-semibold">รหัสลูกค้า</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">เลขพัสดุจีน</th>
                      <th className="text-right px-2 py-2 border-b font-semibold">น้ำหนัก (กก.)</th>
                      <th className="text-right px-2 py-2 border-b font-semibold">คิว</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ก×ย×ส</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ประเภท</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ขนส่ง</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">สถานะ</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">ตู้</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">กระสอบ</th>
                      <th className="text-left px-2 py-2 border-b font-semibold">เพิ่มเข้าระบบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((p, i) => {
                      const prev = missing[i - 1];
                      // group header when the SET changes (A → B)
                      const isNewSet = i === 0 || prev.kind !== p.kind;
                      // sub-divider when the cabinet changes within the same set
                      const isNewCabinet = !isNewSet && prev.cabinet !== p.cabinet;

                      const st = rowStates[p.base] ?? { kind: "idle" as const };
                      const isAdded = st.kind === "added";
                      const isSaving = st.kind === "saving";
                      const mode = deriveModeFromCid(p.cabinet);
                      const dims =
                        p.width || p.length || p.height ? `${p.width || 0}×${p.length || 0}×${p.height || 0}` : "–";

                      return (
                        <Fragment key={p.base}>
                          {isNewSet && (
                            <tr>
                              <td
                                colSpan={11}
                                className={`px-3 py-1.5 text-[12px] font-bold ${
                                  p.kind === "A"
                                    ? "bg-emerald-50 text-emerald-800 border-y border-emerald-200"
                                    : "bg-amber-50 text-amber-800 border-y border-amber-200"
                                }`}
                              >
                                {p.kind === "A"
                                  ? "✅ พร้อมเพิ่ม — MOMO ส่งรหัสลูกค้าครบ"
                                  : "⚠️ ต้องกรอกรหัสลูกค้าเอง — MOMO ส่งไม่ครบ"}
                              </td>
                            </tr>
                          )}
                          <tr
                            className={`border-b align-top whitespace-nowrap hover:bg-sky-50/50 ${isAdded ? "bg-emerald-50/60" : ""} ${isNewCabinet ? "border-t-2 border-t-slate-200" : ""}`}
                          >
                            {/* รหัสลูกค้า — A: green chip (no input) · B: text input */}
                            <td className="px-2 py-2">
                              {p.kind === "A" ? (
                                <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-1 text-[12px] font-bold text-emerald-700">
                                  {p.member || "—"}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={members[p.base] ?? ""}
                                  onChange={(e) => setMembers((m) => ({ ...m, [p.base]: e.target.value }))}
                                  placeholder="PR…"
                                  disabled={isAdded || isSaving}
                                  className="w-24 rounded-lg border border-border px-2 py-1 text-[12px] font-mono uppercase disabled:bg-slate-100"
                                  onKeyDown={(e) => { if (e.key === "Enter" && !isAdded && !isSaving) onAdd(p); }}
                                />
                              )}
                            </td>
                            {/* เลขพัสดุจีน */}
                            <td className="px-2 py-2 font-mono">
                              {p.base}
                              {p.pieces > 1 && (
                                <span className="ml-1 rounded bg-slate-100 px-1 text-[11px] text-slate-600" title={`รวม ${p.pieces} พัสดุย่อย (-i/n)`}>
                                  ×{p.pieces}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {p.weightKg ? (
                                p.weightKg
                              ) : (
                                <span
                                  className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
                                  title="ของยังไม่ถึงโกดัง MOMO · ยังไม่ได้ชั่ง/วัด — ข้อมูลจะมาเมื่อถึงโกดัง"
                                >
                                  ⏳ รอ MOMO ชั่ง
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">{p.cbm || "—"}</td>
                            <td className="px-2 py-2 font-mono text-[11px] text-muted">{p.kind === "A" ? dims : "–"}</td>
                            <td className="px-2 py-2">
                              {p.kind === "A" && p.productType ? (
                                <span>
                                  {p.productType}
                                  {p.productType === "fda" && (
                                    <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">อย.</span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2 py-2">{shipByTh(p.shipBy)}</td>
                            <td className="px-2 py-2 text-[11px]">{p.kind === "A" ? (p.statusText || "—") : "—"}</td>
                            {/* ตู้ */}
                            <td className="px-2 py-2 font-mono">
                              {p.cabinet ? (
                                <span className="inline-flex items-center gap-1">
                                  {p.cabinet}
                                  {mode && (
                                    <span className={`rounded px-1 text-[11px] font-semibold ${mode === "เรือ" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                                      {mode}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2 py-2 font-mono text-[11px] text-muted">{p.kind === "A" ? (p.sackNo || "—") : "—"}</td>
                            {/* เพิ่มเข้าระบบ */}
                            <td className="px-2 py-2">
                              {isAdded ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
                                  ✓ เพิ่มแล้ว {st.fid ? `#${st.fid}` : ""}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onAdd(p)}
                                  disabled={isSaving}
                                  className="rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {isSaving ? "กำลังเพิ่ม..." : "เพิ่มเข้าระบบ"}
                                </button>
                              )}
                            </td>
                          </tr>
                          {st.kind === "error" && (
                            <tr className="border-b bg-red-50/70">
                              <td colSpan={11} className="px-3 py-1.5 text-[11px] text-red-700">
                                ⚠️ {st.message}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                ⇆ เลื่อนซ้าย-ขวาเพื่อดูทุกคอลัมน์ · พัสดุที่มีเลขย่อย (-i/n) รวมน้ำหนัก/คิวให้แล้ว (×N = จำนวนพัสดุย่อย) ·
                แบบ A ดึงข้อมูลครบจาก MOMO Import Track · แบบ B มีเฉพาะที่ตู้ปิดส่งมา (กรอกรหัสลูกค้าเอง)
                <br />
                พัสดุที่ขึ้น <span className="font-medium text-slate-600">⏳ รอ MOMO ชั่ง</span> = ยังไม่ถึงโกดังจีน MOMO เลยยังไม่มีน้ำหนัก/ขนาด
                (ไม่ใช่บัค) — เพิ่มเข้าระบบได้ แต่ต้องตั้งน้ำหนัก/เรทเองภายหลัง
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
