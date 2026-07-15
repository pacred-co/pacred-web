"use client";

/**
 * ✏️ แก้ผู้ซื้อ (บนเอกสาร) — /admin/billing-run/[id] (owner 2026-07-15).
 *
 * A customer who upgraded to นิติบุคคล AFTER a bill was issued (e.g. PR002) had the
 * document frozen with the old บุคคลธรรมดา snapshot. This edits the buyer identity
 * (ชื่อ/ประเภท/เลขภาษี/ที่อยู่ออกบิล) → adminSetBillingRunBuyerIdentity, which writes
 * the invoice snapshot + mirrors it onto the linked ใบเสร็จ. The print + detail read
 * the snapshot → they update on router.refresh. "ดึงข้อมูลนิติบุคคลปัจจุบัน" one-click
 * prefills from the customer's CURRENT registered company (tb_corporate). Confirm-
 * before-mutate §0f. DISPLAY-only for money (see the action's docblock).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminSetBillingRunBuyerIdentity } from "@/actions/admin/billing-run";

export type BuyerIdentityValue = {
  isJuristic: boolean;
  buyerName: string;
  buyerTaxId: string;
  buyerAddress: string;
  buyerBranch: string;
};

export function BillingRunBuyerEditor({
  invoiceId,
  current,
  liveCorp,
  isPaid,
}: {
  invoiceId: number;
  current: BuyerIdentityValue;
  /** The customer's CURRENT registered company (tb_corporate) for the prefill button — null if not juristic. */
  liveCorp: { name: string; taxId: string; address: string } | null;
  /** true → warn that the WHT display changes when flipping a settled bill to นิติ (collected money stays). */
  isPaid: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [isJuristic, setIsJuristic] = useState(current.isJuristic);
  const [name, setName] = useState(current.buyerName);
  const [taxId, setTaxId] = useState(current.buyerTaxId);
  const [address, setAddress] = useState(current.buyerAddress);
  const [branch, setBranch] = useState(current.buyerBranch);

  function prefillFromCorp() {
    if (!liveCorp) return;
    setIsJuristic(true);
    setName(liveCorp.name);
    setTaxId(liveCorp.taxId);
    setAddress(liveCorp.address);
    setBranch("");
    setErr(null);
  }

  async function save() {
    setErr(null);
    if (!name.trim()) { setErr("กรอกชื่อผู้ซื้อ / ชื่อบริษัท"); return; }
    if (isJuristic && !/^\d{13}$/.test(taxId.trim())) { setErr("นิติบุคคลต้องมีเลขผู้เสียภาษี 13 หลัก"); return; }

    const msg = [
      `บันทึกข้อมูลผู้ซื้อบนเอกสารเป็น:`,
      ``,
      `ประเภท: ${isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"}`,
      `ชื่อ: ${name.trim()}`,
      isJuristic ? `เลขภาษี: ${taxId.trim()}` : ``,
      address.trim() ? `ที่อยู่: ${address.trim()}` : ``,
      ``,
      `จะอัพเดทหัวชื่อทั้งใบวางบิล + ใบเสร็จที่ผูกกันให้ตรงกันทันที`,
      isPaid && isJuristic
        ? `\n⚠️ ใบนี้ชำระแล้ว — เปลี่ยนเป็นนิติจะแสดง WHT 1% บนใบวางบิล (ยอดเงินที่เก็บจริงไม่เปลี่ยน · ใบเสร็จยอดคงเดิม)`
        : ``,
    ].filter((l) => l !== ``).join("\n");
    if (!(await confirm(msg))) return;

    startTransition(async () => {
      const res = await adminSetBillingRunBuyerIdentity(invoiceId, {
        isJuristic,
        buyerName: name.trim(),
        buyerTaxId: taxId.trim(),
        buyerAddress: address.trim(),
        buyerBranch: branch.trim(),
      });
      if (!res.ok) { setErr(res.error ?? "บันทึกไม่สำเร็จ"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-2">⚠ {err}</div>}
      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setErr(null); }} className="text-xs font-medium text-sky-600 hover:underline">
          ✏️ แก้ชื่อ/ที่อยู่ผู้ซื้อ (บนเอกสาร)
        </button>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-border bg-surface-alt/40 p-3">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted">ประเภท</span>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" checked={!isJuristic} onChange={() => setIsJuristic(false)} /> บุคคลธรรมดา
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" checked={isJuristic} onChange={() => setIsJuristic(true)} /> นิติบุคคล
            </label>
            {liveCorp && (
              <button type="button" onClick={prefillFromCorp} className="ml-auto text-xs font-medium text-emerald-600 hover:underline">
                ↓ ดึงข้อมูลนิติบุคคลปัจจุบัน
              </button>
            )}
          </div>

          <div>
            <label className="text-xs text-muted">{isJuristic ? "ชื่อบริษัท" : "ชื่อ-นามสกุล"}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm" placeholder={isJuristic ? "บริษัท ... จำกัด" : "ชื่อ นามสกุล"} />
          </div>

          {isJuristic && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
                <input value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))} inputMode="numeric" className="w-full rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm font-mono" placeholder="0105564077716" />
              </div>
              <div>
                <label className="text-xs text-muted">สาขา (ถ้ามี)</label>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm" placeholder="สำนักงานใหญ่" />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted">ที่อยู่ (ออกบิล/ภาษี)</label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm" placeholder="ที่อยู่จดทะเบียนบริษัท" />
          </div>

          {isPaid && isJuristic && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              ⚠️ ใบนี้ชำระแล้ว — เปลี่ยนเป็นนิติจะแสดง WHT 1% บนใบวางบิล · <b>ยอดเงินที่เก็บจริงไม่เปลี่ยน</b> (ใบเสร็จยอดคงเดิม)
            </div>
          )}

          <div className="flex gap-2 pt-0.5">
            <button type="button" disabled={pending} onClick={save} className="rounded-md bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-700 disabled:opacity-50">
              {pending ? "กำลังบันทึก…" : "บันทึก + อัพเดทเอกสาร"}
            </button>
            <button type="button" disabled={pending} onClick={() => { setOpen(false); setErr(null); }} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
