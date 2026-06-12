"use client";

/**
 * Go-Live Control Panel — client surface.
 *
 * Renders every go-live lever as a card with a live readiness pill + the safe
 * control to advance it. ALL mutations route through existing audited super-only
 * server actions (adminUpdateBusinessConfig · adminSetFreightCommissionTierConfirmed) —
 * this component adds NO new write path. Every money/tax flip is gated behind a
 * consequence-spelling confirm dialog (§0f). FX/GL are edited inline (parse-then-save).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminUpdateBusinessConfig } from "@/actions/admin/business-config";
import { adminSetFreightCommissionTierConfirmed } from "@/actions/admin/freight-commission";
import type { GoLiveStatus, GoLiveRoleKey } from "@/lib/admin/go-live-status";
import type { FreightCommissionTierView } from "@/actions/admin/freight-commission";

type Readiness = "live" | "ready" | "waiting" | "blocked" | "info";

const PILL: Record<Readiness, { label: string; cls: string }> = {
  live:    { label: "🟢 เปิดแล้ว",    cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  ready:   { label: "🟡 พร้อมเปิด",   cls: "bg-amber-100 text-amber-800 border-amber-300" },
  waiting: { label: "⚪ รอข้อมูล",     cls: "bg-gray-100 text-gray-700 border-gray-300" },
  blocked: { label: "🔴 ต้องตั้งก่อน", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  info:    { label: "⚪ ภายนอก",       cls: "bg-gray-100 text-gray-700 border-gray-300" },
};

const ROLE_LABEL: Record<GoLiveRoleKey, string> = {
  pricing: "Pricing (ใส่ต้นทุน · 3-number)",
  warehouse: "Warehouse (โกดัง · worker-app)",
  freight_export_doc: "Freight Doc Export (ใบขนส่งออก)",
  freight_import_doc: "Freight Doc Import (ใบขนนำเข้า)",
};

function LeverCard({
  n,
  title,
  subtitle,
  readiness,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  readiness: Readiness;
  children: React.ReactNode;
}) {
  const pill = PILL[readiness];
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-mono text-muted">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-tight">{title}</h3>
          <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{subtitle}</p>
        </div>
        <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 whitespace-nowrap ${pill.cls}`}>
          {pill.label}
        </span>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold tracking-wider text-muted uppercase pt-2">{children}</h2>
  );
}

export function GoLivePanel({
  status,
  tiers,
}: {
  status: GoLiveStatus;
  tiers: FreightCommissionTierView[];
}) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /** Flip a {enabled} business_config flag with a consequence confirm. */
  async function flipFlag(key: string, turnOn: boolean, consequence: string) {
    const ok = await confirm(consequence);
    if (!ok) return;
    setBusyKey(key);
    startTransition(async () => {
      const res = await adminUpdateBusinessConfig({ key, value: { enabled: turnOn } });
      setBusyKey(null);
      if (!res.ok) {
        await alert(`เปิด/ปิดไม่สำเร็จ: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  async function confirmTier(tierId: string, confirmed: boolean, label: string) {
    const ok = await confirm(
      confirmed
        ? `ยืนยันเรทค่าคอม “${label}” ว่าถูกต้อง — เรทนี้จะเริ่มใช้คิดค่าคอมจริงเมื่อเปิดระบบ. ยืนยัน?`
        : `ยกเลิกการยืนยันเรท “${label}”? เรทที่ไม่ยืนยันจะไม่ถูกใช้คิดค่าคอม.`,
    );
    if (!ok) return;
    setBusyKey(`tier:${tierId}`);
    startTransition(async () => {
      const res = await adminSetFreightCommissionTierConfirmed({ tierId, confirmed });
      setBusyKey(null);
      if (!res.ok) {
        await alert(`ทำรายการไม่สำเร็จ: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  const shopYuanReadiness: Readiness = status.shopYuanEnabled ? "live" : "ready";
  const freightReadiness: Readiness = status.freightCommissionEnabled
    ? "live"
    : status.freightTierConfirmedCount > 0
      ? "ready"
      : "blocked";
  const fxReadiness: Readiness =
    !status.customsFxPending && status.customsFxCurrencyCount > 0 ? "live" : "waiting";
  const glReadiness: Readiness = status.peakGlFilled && !status.peakGlPending ? "live" : "waiting";

  return (
    <div className="space-y-3">
      {dialogs}

      {/* ─── A · Money / Tax go-live switches ─── */}
      <SectionHeading>A · สวิตช์เปิดระบบเงิน / ภาษี (พี่กดเปิดเมื่อพร้อม)</SectionHeading>

      <LeverCard
        n={1}
        title="ใบกำกับภาษี ฝากสั่ง / ฝากโอน (shop + yuan)"
        subtitle="เปิดแล้วระบบจะออกใบกำกับ ฝากสั่ง/ฝากโอน จริงตามที่ลูกค้าเลือกเอกสาร — ต้องผ่าน money-test + บัญชี sign-off ฐาน VAT ใบขนก่อน."
        readiness={shopYuanReadiness}
      >
        <FlagToggle
          on={status.shopYuanEnabled}
          busy={pending && busyKey === "tax_invoice.shop_yuan_enabled"}
          onLabel="เปิดออกใบกำกับ ฝากสั่ง/ฝากโอน"
          offLabel="ปิดไว้ (dormant)"
          onClick={(turnOn) =>
            flipFlag(
              "tax_invoice.shop_yuan_enabled",
              turnOn,
              turnOn
                ? "⚠️ เปิดระบบออกใบกำกับ ฝากสั่ง/ฝากโอน?\n\nหลังเปิด ระบบจะออกใบกำกับภาษีจริงทันทีตามที่ลูกค้าเลือกเอกสาร (มีผลต่อภาษี). ยืนยันว่า:\n• ทดสอบ money-loop ครบแล้ว\n• บัญชี sign-off ฐาน VAT ของใบขนแล้ว\n\nกดยืนยันเพื่อเปิด."
                : "ปิดระบบออกใบกำกับ ฝากสั่ง/ฝากโอน กลับเป็น dormant?",
            )
          }
        />
      </LeverCard>

      <LeverCard
        n={2}
        title="ค่าคอมมิชชั่น Freight (commission ledger)"
        subtitle="เปิดแล้วระบบจะเริ่มสะสมค่าคอม Freight จริงตามเรทที่ยืนยัน — เปิดได้ต่อเมื่อมีเรทที่ยืนยันแล้วอย่างน้อย 1 รายการ."
        readiness={freightReadiness}
      >
        <p className="text-[11px] text-muted">
          เรทที่ใช้งาน (active): <b>{status.freightTierActiveCount}</b> · ยืนยันแล้ว:{" "}
          <b className={status.freightTierConfirmedCount > 0 ? "text-emerald-700" : "text-rose-700"}>
            {status.freightTierConfirmedCount}
          </b>
        </p>

        {tiers.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {tiers.map((t) => {
              const label = `${t.serviceKind} · ${t.ratePct != null ? `${t.ratePct}%` : ""}${t.flatThb ? ` +฿${t.flatThb}` : ""}`;
              return (
                <div key={t.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] flex-wrap">
                  <span className="font-mono">{t.serviceKind}</span>
                  <span className="text-muted">
                    {t.ratePct != null ? `${t.ratePct}%` : ""}
                    {t.flatThb ? ` +฿${t.flatThb}` : ""} · WHT {t.whtPct}%
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {t.isOwnerConfirmed ? (
                      <>
                        <span className="text-emerald-700 font-semibold">✓ ยืนยันแล้ว</span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => confirmTier(t.id, false, label)}
                          className="text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => confirmTier(t.id, true, label)}
                        className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        ยืนยันเรท
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {status.freightTierConfirmedCount === 0 ? (
          <p className="text-[11px] text-rose-700">
            🔴 ยังเปิดระบบไม่ได้ — ต้องยืนยันเรทค่าคอมอย่างน้อย 1 รายการก่อน (กด “ยืนยันเรท” ด้านบน).
          </p>
        ) : (
          <FlagToggle
            on={status.freightCommissionEnabled}
            busy={pending && busyKey === "commission.freight_enabled"}
            onLabel="เปิดสะสมค่าคอม Freight"
            offLabel="ปิดไว้ (dormant)"
            onClick={(turnOn) =>
              flipFlag(
                "commission.freight_enabled",
                turnOn,
                turnOn
                  ? `⚠️ เปิดระบบสะสมค่าคอม Freight?\n\nหลังเปิด ระบบจะเริ่มคิด+สะสมค่าคอมจริงตามเรทที่ยืนยันแล้ว (${status.freightTierConfirmedCount} รายการ). ยืนยันว่าเรท + นโยบาย 50/50 ถูกต้องแล้ว?`
                  : "ปิดระบบสะสมค่าคอม Freight กลับเป็น dormant?",
              )
            }
          />
        )}
      </LeverCard>

      {/* ─── B · Accountant data (filled + editable) ─── */}
      <SectionHeading>B · ข้อมูลบัญชี (เติมแล้ว · แก้รายเดือนได้)</SectionHeading>

      <LeverCard
        n={3}
        title="เรทศุลกากร (มูลค่าสำแดง ใบขน · กรมศุล รายเดือน)"
        subtitle="THB ต่อ 1 หน่วยสกุลเงิน (เรทนำเข้ากรมศุล). ใช้คำนวณมูลค่าสำแดงบนใบขน. เดือนใหม่อัปเดตตัวเลข + คง pending:false."
        readiness={fxReadiness}
      >
        <JsonEditor
          label={`สกุลเงิน ${status.customsFxCurrencyCount} สกุล · pending: ${String(status.customsFxPending)}`}
          configKey="customs.fx_rates"
          consequence="⚠️ ค่านี้ใช้คำนวณ มูลค่าสำแดง (declared_value_thb) บนใบขน — กรอกเรทผิด = มูลค่าสำแดงเพี้ยน (THB ต่อ 1 หน่วยสกุลเงิน)."
          initialValue={status.customsFxRaw as Record<string, unknown>}
          busy={pending && busyKey === "customs.fx_rates"}
          setBusyKey={setBusyKey}
          startTransition={startTransition}
          confirm={confirm}
          alert={alert}
          router={router}
        />
      </LeverCard>

      <LeverCard
        n={4}
        title="PEAK GL (ผังบัญชี · CSV export)"
        subtitle="รหัสบัญชี GL สำหรับ PEAK CSV. selling = บัญชีรายได้, cost = บัญชีต้นทุน, declared = memo (ไม่ลง GL). กรอกครบ + pending:false ปิด banner."
        readiness={glReadiness}
      >
        <JsonEditor
          label={`selling=${status.peakGlRaw.selling || "—"} · cost=${status.peakGlRaw.cost || "—"} · pending: ${String(status.peakGlPending)}`}
          configKey="peak.gl_accounts"
          consequence="⚠️ รหัสนี้ใช้ใน PEAK CSV export (บัญชีรายได้ selling / ต้นทุน cost) — กรอกผิด = ลงบัญชี/กระทบยอด PEAK ผิด."
          initialValue={status.peakGlRaw as Record<string, unknown>}
          busy={pending && busyKey === "peak.gl_accounts"}
          setBusyKey={setBusyKey}
          startTransition={startTransition}
          confirm={confirm}
          alert={alert}
          router={router}
        />
      </LeverCard>

      {/* ─── C · Staff roles ─── */}
      <SectionHeading>C · มอบ role พนักงาน (กดเข้าไปจัดที่หน้า Admins)</SectionHeading>

      <LeverCard
        n={5}
        title="เปิดใช้ role งานเอกสาร / ต้นทุน / โกดัง"
        subtitle="มอบ role ให้พนักงานเพื่อเข้าถึงหน้าใส่ต้นทุน (Pricing) · worker-app โกดัง · ใบขนนำเข้า/ส่งออก."
        readiness={
          (Object.values(status.roleCounts) as number[]).some((c) => c > 0) ? "live" : "waiting"
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(status.roleCounts) as GoLiveRoleKey[]).map((rk) => (
            <div
              key={rk}
              className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-[11px]"
            >
              <span>{ROLE_LABEL[rk]}</span>
              <span
                className={`font-semibold ${status.roleCounts[rk] > 0 ? "text-emerald-700" : "text-gray-400"}`}
              >
                {status.roleCounts[rk]} คน
              </span>
            </div>
          ))}
        </div>
        <Link
          href="/admin/admins"
          className="inline-block rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
        >
          ไปหน้าจัดการพนักงาน (มอบ role) →
        </Link>
      </LeverCard>

      {/* ─── D · External / infra checklist ─── */}
      <SectionHeading>D · ของภายนอก / โครงสร้าง (พี่ดำเนินการนอกระบบ)</SectionHeading>

      <LeverCard
        n={6}
        title="RECEIPT_TOKEN_SECRET (ความปลอดภัย QR ใบเสร็จ)"
        subtitle="ลายเซ็น QR ใบเสร็จสาธารณะ. ถ้ายังไม่ตั้ง ระบบ fallback ไปใช้ service-role-key (เสี่ยง) — ตั้งใน Vercel prod env แล้ว redeploy."
        readiness={status.receiptSecretSet ? "live" : "blocked"}
      >
        <p className="text-[11px] text-muted">
          {status.receiptSecretSet ? (
            <span className="text-emerald-700 font-semibold">✓ ตั้งค่าแล้วใน prod env.</span>
          ) : (
            <>
              <span className="text-rose-700 font-semibold">🔴 ยังไม่ตั้ง.</span>{" "}
              Vercel → Project → Settings → Environment Variables → เพิ่ม{" "}
              <code className="font-mono bg-surface-alt px-1 rounded">RECEIPT_TOKEN_SECRET</code> (สุ่ม
              ≥32 ตัวอักษร) → Production → Save → Redeploy.
            </>
          )}
        </p>
      </LeverCard>

      <LeverCard
        n={7}
        title="NETBAY (ยื่นใบขนอิเล็กทรอนิกส์)"
        subtitle="เครดิต e-filing กรมศุล. ยังไม่มี = ยื่นใบขนแบบ manual (ระบบสร้าง PDF ให้ได้)."
        readiness={status.netbaySet ? "live" : "info"}
      >
        <p className="text-[11px] text-muted">
          {status.netbaySet ? (
            <span className="text-emerald-700 font-semibold">✓ ตั้งค่า NETBAY env แล้ว.</span>
          ) : (
            <>⚪ รอ credential จากภายนอก — ระหว่างนี้ใช้ใบขน PDF + ยื่น manual ได้.</>
          )}
        </p>
      </LeverCard>

      <LeverCard
        n={8}
        title="contact@pacred.co (กล่องเมลติดต่อ)"
        subtitle="อีเมลที่อ้างใน FAQ. ต้องสร้างกล่องเมลจริงเพื่อรับเมลลูกค้า."
        readiness="info"
      >
        <p className="text-[11px] text-muted">⚪ สร้างกล่องเมล/forwarding ที่ผู้ให้บริการอีเมลของบริษัท.</p>
      </LeverCard>

      <LeverCard
        n={9}
        title="บัญชีทดสอบ (test customer / admin login)"
        subtitle="ใช้ตรวจ flow แบบล็อกอินจริง (§0c) ของทุกฟีเจอร์ที่ ship ไป — ปัจจุบันยังตรวจแบบ authed ไม่ได้."
        readiness="info"
      >
        <p className="text-[11px] text-muted">
          ⚪ ทำบัญชีทดสอบ (member_code + รหัสผ่าน) ส่งให้ทีม → ปลดบล็อกการตรวจ click-through แบบล็อกอินจริง.
        </p>
      </LeverCard>

      <p className="text-[11px] text-muted pt-2">
        หมายเหตุ: การกดเปิดสวิตช์เงิน/ภาษี (ข้อ 1–2) มีผลกับลูกค้า/ภาษีจริงทันที — ทุกการกดถูกบันทึก audit
        (before/after) พร้อมชื่อผู้กด. ข้อมูลบัญชี (ข้อ 3–4) แก้ได้ทุกเมื่อ.
      </p>
    </div>
  );
}

/** A two-button enable/disable control (ON/OFF) for an {enabled} flag. */
function FlagToggle({
  on,
  busy,
  onLabel,
  offLabel,
  onClick,
}: {
  on: boolean;
  busy: boolean;
  onLabel: string;
  offLabel: string;
  onClick: (turnOn: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={busy || on}
        onClick={() => onClick(true)}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          on
            ? "bg-emerald-600 text-white cursor-default"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {on ? `● ${onLabel}` : onLabel}
      </button>
      <button
        type="button"
        disabled={busy || !on}
        onClick={() => onClick(false)}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt disabled:opacity-50"
      >
        {!on ? `● ${offLabel}` : offLabel}
      </button>
      {busy && (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 animate-pulse">
          ⏳ กำลังบันทึก…
        </span>
      )}
    </div>
  );
}

/** Inline JSON editor for a json-typed business_config row. Parse-then-save. */
function JsonEditor({
  label,
  configKey,
  consequence,
  initialValue,
  busy,
  setBusyKey,
  startTransition,
  confirm,
  alert,
  router,
}: {
  label: string;
  configKey: string;
  /** Spelled into the confirm dialog so the editor names what it affects (§0f). */
  consequence: string;
  initialValue: Record<string, unknown>;
  busy: boolean;
  setBusyKey: (k: string | null) => void;
  startTransition: (cb: () => void) => void;
  confirm: (m: string) => Promise<boolean>;
  alert: (m: string) => Promise<boolean>;
  router: { refresh: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(initialValue, null, 2));
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErr("JSON ไม่ถูกต้อง — ตรวจวงเล็บ/คอมมา แล้วลองใหม่");
      return;
    }
    setErr(null);
    const ok = await confirm(`บันทึกค่า ${configKey}?\n\n${consequence}\n\nตรวจตัวเลข/รหัสให้ถูกก่อนบันทึก.`);
    if (!ok) return;
    setBusyKey(configKey);
    startTransition(async () => {
      const res = await adminUpdateBusinessConfig({ key: configKey, value: parsed });
      setBusyKey(null);
      if (!res.ok) {
        await alert(`บันทึกไม่สำเร็จ: ${res.error}`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted font-mono break-all">{label}</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
        >
          แก้ไขค่า
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (err) setErr(null); // clear the parse error as the user fixes it
            }}
            spellCheck={false}
            rows={Math.min(14, text.split("\n").length + 1)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[11px] leading-relaxed"
          />
          {err && <p className="text-[11px] text-rose-700">{err}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              บันทึก
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setText(JSON.stringify(initialValue, null, 2));
                setErr(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
            {busy && <span className="text-[11px] text-muted">กำลังบันทึก…</span>}
          </div>
        </div>
      )}
    </div>
  );
}
