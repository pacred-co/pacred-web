"use client";

/**
 * Sitting G — UI mount for the 3 Phase-2 header-edit handlers shipped
 * server-side in sitting-F P0-13 commit (e337fe85):
 *
 *   - adminUpdateOrderAddress  → haddress* fields
 *   - adminSwitchOrderTransport → htransporttype
 *   - adminAddOrderNote        → hnote / hnoteuser
 *
 * Closes the §0d reachability gap from sitting F (server-side wired
 * but no buttons rendered). §0 DESIGN LATITUDE — single expandable
 * panel with 3 sub-sections, far cleaner than 3 separate modals or
 * 3 buttons in different parts of the page.
 *
 * Each sub-section is independent — admin can edit address without
 * touching transport, etc. Per-section "บันทึก" triggers only that
 * one action.
 *
 * Status gate: hides itself entirely for terminal hstatus '5' / '6'
 * (server-side guards already reject those, so the panel would just
 * show errors). For 1/2/3/4 all 3 edits are valid.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  adminUpdateOrderAddress,
  adminSwitchOrderTransport,
  adminAddOrderNote,
} from "@/actions/admin/service-orders-shop-workflow";

type Props = {
  hNo:                 string;
  hstatus:             string;
  // Current values (so the form pre-fills + the admin can see what's
  // there before editing).
  haddressname:        string | null;
  haddresslastname:    string | null;
  haddressno:          string | null;
  haddresssubdistrict: string | null;
  haddressdistrict:    string | null;
  haddressprovince:    string | null;
  haddresszipcode:     string | null;
  haddresstel:         string | null;
  haddressnote:        string | null;
  htransporttype:      string | null;
  hnote:               string | null;
  hnoteuser:           string | null;
};

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

export function AdminExtraEditsPanel(props: Props) {
  const { hNo, hstatus } = props;
  const router = useRouter();
  const [section, setSection] = useState<"address" | "transport" | "note" | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok,  setOk]  = useState<string | null>(null);

  // ── Address edit ──────────────────────────────────────────────
  const [addr, setAddr] = useState({
    haddressname:        props.haddressname        ?? "",
    haddresslastname:    props.haddresslastname    ?? "",
    haddressno:          props.haddressno          ?? "",
    haddresssubdistrict: props.haddresssubdistrict ?? "",
    haddressdistrict:    props.haddressdistrict    ?? "",
    haddressprovince:    props.haddressprovince    ?? "",
    haddresszipcode:     props.haddresszipcode     ?? "",
    haddresstel:         props.haddresstel         ?? "",
    haddressnote:        props.haddressnote        ?? "",
  });

  // ── Transport switch (state hoisted before any conditional) ──
  const [newTransport, setNewTransport] = useState(props.htransporttype ?? "1");
  // ── Note add (state hoisted before any conditional) ──
  const [noteText, setNoteText] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"0" | "1">("0");

  // Terminal statuses — skip rendering entirely AFTER all hooks have
  // been called (React rules-of-hooks).
  if (hstatus === "5" || hstatus === "6") return null;

  function clearMessages() { setErr(null); setOk(null); }

  function saveAddress() {
    clearMessages();
    startTransition(async () => {
      const res = await adminUpdateOrderAddress({ hNo, ...addr });
      if (res.ok) {
        setOk("บันทึกที่อยู่จัดส่งเรียบร้อย");
        router.refresh();
      } else setErr(res.error);
    });
  }

  // ── Transport switch action ───────────────────────────────────
  function saveTransport() {
    clearMessages();
    if (newTransport === (props.htransporttype ?? "1")) {
      setErr("รูปแบบขนส่งเหมือนเดิม — ไม่มีอะไรเปลี่ยน");
      return;
    }
    startTransition(async () => {
      const res = await adminSwitchOrderTransport({ hNo, htransporttype: newTransport as "1" | "2" | "3" });
      if (res.ok) {
        setOk(`สลับรูปแบบขนส่งเป็น ${TRANSPORT_LABEL[newTransport] ?? newTransport} เรียบร้อย`);
        router.refresh();
      } else setErr(res.error);
    });
  }

  // ── Note add action (hnote=text, hnoteuser='0'/'1' visibility) ─
  function saveNote() {
    clearMessages();
    const trimmed = noteText.trim();
    if (!trimmed) { setErr("กรุณากรอกหมายเหตุก่อนบันทึก"); return; }
    startTransition(async () => {
      const res = await adminAddOrderNote({
        hNo,
        hnote:     trimmed,
        hnoteuser: noteVisibility,
      });
      if (res.ok) {
        setOk(noteVisibility === "1"
          ? "เพิ่มหมายเหตุ (ลูกค้าเห็น) เรียบร้อย"
          : "เพิ่มหมายเหตุภายในเรียบร้อย");
        setNoteText("");
        router.refresh();
      } else setErr(res.error);
    });
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 dark:bg-blue-50/5 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-blue-700">
          ปรับแก้ไขรายละเอียดเพิ่มเติม
        </p>
        <p className="text-[10px] text-muted">เลือกสิ่งที่ต้องการแก้ — บันทึกแยกแต่ละส่วน</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={section === "address"   ? "primary" : "outline"} type="button"
                onClick={() => { clearMessages(); setSection(section === "address"   ? null : "address"); }}>
          📍 ที่อยู่จัดส่ง
        </Button>
        <Button size="sm" variant={section === "transport" ? "primary" : "outline"} type="button"
                onClick={() => { clearMessages(); setSection(section === "transport" ? null : "transport"); }}>
          🚚 สลับขนส่ง
        </Button>
        <Button size="sm" variant={section === "note"      ? "primary" : "outline"} type="button"
                onClick={() => { clearMessages(); setSection(section === "note"      ? null : "note"); }}>
          📝 เพิ่มหมายเหตุ
        </Button>
      </div>

      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
      {ok  && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</div>}

      {section === "address" && (
        <div className="rounded-md border border-border bg-white dark:bg-surface p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded border px-2 py-1.5" placeholder="ชื่อ"      value={addr.haddressname}     onChange={(e) => setAddr({ ...addr, haddressname:     e.target.value })} />
            <input className="rounded border px-2 py-1.5" placeholder="นามสกุล"  value={addr.haddresslastname} onChange={(e) => setAddr({ ...addr, haddresslastname: e.target.value })} />
          </div>
          <input className="rounded border px-2 py-1.5 w-full" placeholder="บ้านเลขที่ / ถนน" value={addr.haddressno}          onChange={(e) => setAddr({ ...addr, haddressno:          e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded border px-2 py-1.5" placeholder="ตำบล/แขวง" value={addr.haddresssubdistrict} onChange={(e) => setAddr({ ...addr, haddresssubdistrict: e.target.value })} />
            <input className="rounded border px-2 py-1.5" placeholder="อำเภอ/เขต" value={addr.haddressdistrict}    onChange={(e) => setAddr({ ...addr, haddressdistrict:    e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded border px-2 py-1.5" placeholder="จังหวัด"   value={addr.haddressprovince}   onChange={(e) => setAddr({ ...addr, haddressprovince:   e.target.value })} />
            <input className="rounded border px-2 py-1.5" placeholder="รหัสไปรษณีย์" value={addr.haddresszipcode} onChange={(e) => setAddr({ ...addr, haddresszipcode:    e.target.value })} />
          </div>
          <input className="rounded border px-2 py-1.5 w-full" placeholder="เบอร์โทร"    value={addr.haddresstel}  onChange={(e) => setAddr({ ...addr, haddresstel:  e.target.value })} />
          <input className="rounded border px-2 py-1.5 w-full" placeholder="หมายเหตุที่อยู่ (ขั้นไป สำหรับ ส่ง)" value={addr.haddressnote} onChange={(e) => setAddr({ ...addr, haddressnote: e.target.value })} />
          <Button size="sm" type="button" onClick={saveAddress} disabled={pending}>บันทึกที่อยู่</Button>
        </div>
      )}

      {section === "transport" && (
        <div className="rounded-md border border-border bg-white dark:bg-surface p-3 space-y-2 text-xs">
          <p className="text-muted">ปัจจุบัน: {TRANSPORT_LABEL[props.htransporttype ?? ""] ?? "—"}</p>
          <div className="flex gap-2 flex-wrap">
            {(["1", "2", "3"] as const).map((t) => (
              <label key={t} className={`flex items-center gap-1.5 rounded border px-2 py-1.5 cursor-pointer ${newTransport === t ? "bg-primary-50 border-primary-500" : ""}`}>
                <input type="radio" name="transport" value={t} checked={newTransport === t} onChange={() => setNewTransport(t)} />
                {TRANSPORT_LABEL[t]}
              </label>
            ))}
          </div>
          <Button size="sm" type="button" onClick={saveTransport} disabled={pending}>
            สลับเป็น {TRANSPORT_LABEL[newTransport]}
          </Button>
        </div>
      )}

      {section === "note" && (
        <div className="rounded-md border border-border bg-white dark:bg-surface p-3 space-y-2 text-xs">
          <textarea
            className="rounded border px-2 py-1.5 w-full h-20 text-xs"
            placeholder="ข้อความหมายเหตุที่ต้องการเพิ่ม"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="note-vis" value="0" checked={noteVisibility === "0"} onChange={() => setNoteVisibility("0")} />
              ภายในแอดมิน (ซ่อนจากลูกค้า)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="note-vis" value="1" checked={noteVisibility === "1"} onChange={() => setNoteVisibility("1")} />
              ลูกค้าเห็นด้วย
            </label>
          </div>
          {props.hnote     && <p className="text-[10px] text-muted">หมายเหตุภายในล่าสุด: {props.hnote.slice(0, 140)}{props.hnote.length > 140 ? "…" : ""}</p>}
          {props.hnoteuser && <p className="text-[10px] text-muted">หมายเหตุลูกค้าล่าสุด: {props.hnoteuser.slice(0, 140)}{props.hnoteuser.length > 140 ? "…" : ""}</p>}
          <Button size="sm" type="button" onClick={saveNote} disabled={pending}>เพิ่มหมายเหตุ</Button>
        </div>
      )}
    </div>
  );
}
