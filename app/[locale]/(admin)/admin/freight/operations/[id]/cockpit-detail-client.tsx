"use client";

/**
 * W4 — Freight Ops Cockpit per-job detail panel (client island).
 *
 * Stage-aware workspace over one freight shipment:
 *   - 4 stage cards (PRICING / SALES / DOC / ACC) with status pill cycler +
 *     section assignment dropdown + per-stage checklist.
 *   - DOC stage carries the operator P&L SNAPSHOT editor (cost + revenue →
 *     profit). Display-only — NO money mutation (see action header).
 *   - Commission panel = a STUB (reads the existing invoice total; the
 *     commission ledger is a later wave → degrades gracefully).
 *
 * Confirm-before-mutate (AGENTS.md §0f) via the shared useConfirmDialogs.
 * Role-gating is enforced by the SERVER actions; this UI shows the controls
 * for managers but every write re-checks on the server.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Coins, Flag, Plus, Trash2, Check } from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import {
  adminSetFreightStageStatus,
  adminAssignFreightStageOwner,
  adminToggleFreightUrgent,
  adminUpsertFreightChecklist,
  adminRecordDocStageCost,
  type CockpitDetail, type CockpitChecklistItem,
} from "@/actions/admin/freight-ops-cockpit";
import {
  FREIGHT_OPS_STAGES, FREIGHT_OPS_STAGE_LABEL,
  type FreightOpsStage, type FreightOpsStageStatus,
} from "@/lib/validators/freight-ops";

export type AdminOption = { id: string; name: string };

type ActionResult = { ok: true; data?: unknown } | { ok: false; error?: string };

const STAGE_ACCENT: Record<FreightOpsStage, string> = {
  pricing: "border-emerald-200 bg-emerald-50/30",
  sales:   "border-blue-200 bg-blue-50/30",
  docs:    "border-purple-200 bg-purple-50/30",
  acc:     "border-amber-200 bg-amber-50/30",
};
const STAGE_HEAD: Record<FreightOpsStage, string> = {
  pricing: "text-emerald-800",
  sales:   "text-blue-800",
  docs:    "text-purple-800",
  acc:     "text-amber-800",
};

const STATUS_CYCLE: Record<FreightOpsStageStatus, FreightOpsStageStatus> = {
  "":          "in_progress",
  in_progress: "done",
  done:        "",
};
const STATUS_PILL: Record<FreightOpsStageStatus, string> = {
  "":          "bg-gray-100 text-gray-600 border-gray-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  done:        "bg-green-100 text-green-800 border-green-300",
};
const STATUS_TEXT: Record<FreightOpsStageStatus, string> = {
  "":          "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  done:        "เสร็จ",
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STAGE_STATUS_KEY: Record<FreightOpsStage, keyof Pick<CockpitDetail, "pricingStatus" | "salesStatus" | "docsStatus" | "accStatus">> = {
  pricing: "pricingStatus",
  sales:   "salesStatus",
  docs:    "docsStatus",
  acc:     "accStatus",
};
const STAGE_ASSIGN_KEY: Record<FreightOpsStage, keyof Pick<CockpitDetail, "assignedPricingAdminId" | "assignedSalesAdminId" | "assignedDocAdminId" | "assignedAccAdminId">> = {
  pricing: "assignedPricingAdminId",
  sales:   "assignedSalesAdminId",
  docs:    "assignedDocAdminId",
  acc:     "assignedAccAdminId",
};

export function CockpitDetailClient({
  detail,
  adminOptions,
  canManage,
  canViewPnl,
  isSuper,
}: {
  detail: CockpitDetail;
  adminOptions: AdminOption[];
  canManage: boolean;
  /** super/accounting only — gates the P&L link (the p-and-l page rejects other roles). audit SF-3 */
  canViewPnl: boolean;
  isSuper: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  const shipmentId = detail.shipmentId;

  function run(fn: () => Promise<ActionResult>) {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) router.refresh();
        else setErr(res.error ?? "ทำรายการไม่สำเร็จ");
      } catch {
        // A role-denied server action (requireAdmin) THROWS rather than returning
        // {ok:false}; without this catch the rejection is unhandled. Show a friendly
        // permission/error toast instead of a silent crash. (audit SF-2)
        setErr("ไม่มีสิทธิ์ทำรายการนี้ หรือเกิดข้อผิดพลาดชั่วคราว");
      }
    });
  }

  async function onCycleStatus(stage: FreightOpsStage, current: FreightOpsStageStatus) {
    const next = STATUS_CYCLE[current];
    const ok = await confirm(
      `เปลี่ยนสถานะขั้น ${FREIGHT_OPS_STAGE_LABEL[stage]}\nจาก "${STATUS_TEXT[current]}" → "${STATUS_TEXT[next]}"?`,
    );
    if (!ok) return;
    run(() => adminSetFreightStageStatus({ freight_shipment_id: shipmentId, stage, status: next }));
  }

  function onAssign(stage: FreightOpsStage, adminId: string) {
    run(() =>
      adminAssignFreightStageOwner({
        freight_shipment_id: shipmentId,
        stage,
        admin_id: adminId || null,
      }),
    );
  }

  async function onToggleUrgent() {
    const next = !detail.isUrgent;
    const ok = await confirm(next ? "ทำเครื่องหมายงานนี้เป็น 'ด่วน'?" : "ยกเลิกเครื่องหมาย 'ด่วน'?");
    if (!ok) return;
    run(() => adminToggleFreightUrgent({ freight_shipment_id: shipmentId, is_urgent: next }));
  }

  const adminName = (id: string | null) =>
    id ? (adminOptions.find((a) => a.id === id)?.name ?? id.slice(0, 8)) : "—";

  return (
    <div className="space-y-5">
      {dialogs}

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold font-mono">{detail.jobNo ?? "—"}</h1>
              <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] text-muted">
                {detail.shipmentStatusLabel}
              </span>
              <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] text-muted">
                {detail.transportModeLabel}
              </span>
              {detail.isUrgent && (
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                  🔴 ด่วน
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{detail.customerName}</p>
            <p className="text-[11px] text-muted">
              {detail.memberCode ? `${detail.memberCode} · ` : ""}
              {detail.containerCode ? `ตู้ ${detail.containerCode} · ` : ""}
              {detail.blNo ? `B/L ${detail.blNo} · ` : ""}
              {detail.incoterm ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canViewPnl && (
              <Link
                href={`/admin/freight/shipments/${shipmentId}/p-and-l`}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
              >
                📈 P&amp;L
              </Link>
            )}
            <Link
              href={`/admin/freight/shipments/${shipmentId}`}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
            >
              เปิด shipment เต็ม →
            </Link>
            {canManage && (
              <button
                type="button"
                disabled={pending}
                onClick={onToggleUrgent}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  detail.isUrgent
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-border hover:bg-surface-alt"
                }`}
              >
                <Flag className="h-3.5 w-3.5" /> {detail.isUrgent ? "ยกเลิกด่วน" : "ทำเป็นด่วน"}
              </button>
            )}
          </div>
        </div>

        {/* spine reference figures (read-only · authoritative) */}
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <RefFig label="มูลค่า commercial (spine)" value={thb(detail.commercialValueThb)} />
          <RefFig label="VAT (spine)" value={thb(detail.vatThb)} />
          <RefFig label="อากร duty (spine)" value={thb(detail.dutyThb)} />
          <RefFig label="invoice (USD)" value={detail.invoiceTotalUsd != null ? `$${detail.invoiceTotalUsd.toLocaleString()}` : "—"} />
        </dl>
      </header>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ {err}</div>
      )}

      {/* ── 4 stage cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {FREIGHT_OPS_STAGES.map((stage) => {
          const status = detail[STAGE_STATUS_KEY[stage]] as FreightOpsStageStatus;
          const assignedId = detail[STAGE_ASSIGN_KEY[stage]] as string | null;
          const items = detail.checklist.filter((c) => c.stage === stage);
          return (
            <section key={stage} className={`rounded-2xl border ${STAGE_ACCENT[stage]} p-3.5 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={`text-sm font-bold ${STAGE_HEAD[stage]}`}>{FREIGHT_OPS_STAGE_LABEL[stage]}</h2>
                {canManage ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onCycleStatus(stage, status)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${STATUS_PILL[status]}`}
                    title="กดเพื่อเปลี่ยนสถานะ"
                  >
                    {STATUS_TEXT[status]}
                  </button>
                ) : (
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[status]}`}>
                    {STATUS_TEXT[status]}
                  </span>
                )}
              </div>

              {/* assignment */}
              <div>
                <label className="block text-[11px] text-muted mb-0.5">ผู้รับผิดชอบ</label>
                {canManage ? (
                  <select
                    disabled={pending}
                    value={assignedId ?? ""}
                    onChange={(e) => onAssign(stage, e.target.value)}
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="">— ยังไม่มอบหมาย —</option>
                    {adminOptions.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm">{adminName(assignedId)}</p>
                )}
              </div>

              {/* DOC-stage cost snapshot editor — MONEY-internal (cost/profit),
                  gated on canViewPnl (ultra/accounting/pricing only). Server
                  also nulls the snapshot fields for non-cost roles. */}
              {stage === "docs" && canViewPnl && (
                <CostSnapshotEditor
                  shipmentId={shipmentId}
                  cost={detail.costSnapshot}
                  revenue={detail.revenueSnapshot}
                  profit={detail.profitSnapshot}
                  defaultRevenue={detail.commercialValueThb}
                  canManage={canManage}
                  pending={pending}
                  confirm={confirm}
                  onRun={run}
                />
              )}

              {/* checklist */}
              <ChecklistBlock
                shipmentId={shipmentId}
                stage={stage}
                items={items}
                canManage={canManage}
                pending={pending}
                confirm={confirm}
                onRun={run}
              />
            </section>
          );
        })}
      </div>

      {/* ── Commission STUB ─────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Coins className="h-4 w-4" /> ค่าคอมมิชชั่น (Commission)
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {detail.invoiceNo
            ? `อ้างอิงใบกำกับ ${detail.invoiceNo} · ยอด $${(detail.invoiceTotalUsd ?? 0).toLocaleString()}`
            : "ยังไม่มีใบกำกับ freight สำหรับงานนี้"}
        </p>
        <p className="mt-1 text-[11px] text-amber-700">
          ⏳ ระบบบัญชีค่าคอมมิชชั่น freight (commission ledger) จะมาใน wave ถัดไป — ส่วนนี้แสดงยอดอ้างอิงเท่านั้น
        </p>
      </section>

      {!isSuper && (
        <p className="text-[11px] text-muted">
          หมายเหตุ: บางการเปลี่ยนสถานะถูกจำกัดตามบทบาท (server-side) — ถ้ากดแล้วขึ้น error สิทธิ์ แปลว่าขั้นนั้นเป็นของทีมอื่น
        </p>
      )}
    </div>
  );
}

function RefFig({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-mono tabular-nums text-xs">{value}</dd>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Cost snapshot editor (DOC stage) — operator P&L · display-only
// ──────────────────────────────────────────────────────────────
function CostSnapshotEditor({
  shipmentId, cost, revenue, profit, defaultRevenue,
  canManage, pending, confirm, onRun,
}: {
  shipmentId: string;
  cost: number | null;
  revenue: number | null;
  profit: number | null;
  defaultRevenue: number | null;
  canManage: boolean;
  pending: boolean;
  confirm: (m: string) => Promise<boolean>;
  onRun: (fn: () => Promise<ActionResult>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [costDraft, setCostDraft] = useState(cost != null ? String(cost) : "");
  const [revDraft, setRevDraft] = useState(
    revenue != null ? String(revenue) : defaultRevenue != null ? String(defaultRevenue) : "",
  );

  async function save() {
    const ok = await confirm(
      "บันทึก snapshot ต้นทุน/รายได้ของงานนี้?\n⚠️ ตัวเลขนี้แสดงผลใน cockpit เท่านั้น — ไม่กระทบยอดเงินจริง/ภาษี/บิล",
    );
    if (!ok) return;
    onRun(() =>
      adminRecordDocStageCost({
        freight_shipment_id: shipmentId,
        cost_snapshot_thb: costDraft,
        revenue_snapshot_thb: revDraft,
      }),
    );
    setEditing(false);
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-white/60 dark:bg-surface p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-purple-800">P&amp;L snapshot (แสดงผลเท่านั้น)</span>
        {canManage && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-purple-700 hover:underline">
            แก้ไข
          </button>
        )}
      </div>
      {!editing ? (
        <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
          <Fig label="รายได้" value={thb(revenue)} />
          <Fig label="ต้นทุน" value={thb(cost)} />
          <Fig label="กำไร" value={thb(profit)} tone={profit != null && profit < 0 ? "neg" : "pos"} />
        </dl>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="block text-[11px] text-muted">รายได้ (฿)</span>
            <input
              type="number" min={0} step="0.01" inputMode="decimal"
              value={revDraft} onChange={(e) => setRevDraft(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm text-right tabular-nums"
              placeholder="0.00"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-muted">ต้นทุน (฿)</span>
            <input
              type="number" min={0} step="0.01" inputMode="decimal"
              value={costDraft} onChange={(e) => setCostDraft(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm text-right tabular-nums"
              placeholder="0.00"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button" disabled={pending} onClick={save}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก…" : "บันทึก snapshot"}
            </button>
            <button
              type="button" disabled={pending}
              onClick={() => { setEditing(false); setCostDraft(cost != null ? String(cost) : ""); setRevDraft(revenue != null ? String(revenue) : defaultRevenue != null ? String(defaultRevenue) : ""); }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const cls = tone === "neg" ? "text-red-600" : tone === "pos" ? "text-green-700" : "";
  return (
    <div className="rounded border border-border bg-surface-alt/30 px-2 py-1">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-mono tabular-nums text-[11px] font-semibold ${cls}`}>{value}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Per-stage checklist
// ──────────────────────────────────────────────────────────────
function ChecklistBlock({
  shipmentId, stage, items, canManage, pending, confirm, onRun,
}: {
  shipmentId: string;
  stage: FreightOpsStage;
  items: CockpitChecklistItem[];
  canManage: boolean;
  pending: boolean;
  confirm: (m: string) => Promise<boolean>;
  onRun: (fn: () => Promise<ActionResult>) => void;
}) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const item = draft.trim();
    if (!item) return;
    onRun(() => adminUpsertFreightChecklist({ freight_shipment_id: shipmentId, stage, item }));
    setDraft("");
  }
  function toggle(it: CockpitChecklistItem) {
    onRun(() =>
      adminUpsertFreightChecklist({ id: it.id, freight_shipment_id: shipmentId, stage, done: !it.done }),
    );
  }
  async function remove(it: CockpitChecklistItem) {
    const ok = await confirm(`ลบรายการ "${it.item}"?`);
    if (!ok) return;
    onRun(() =>
      adminUpsertFreightChecklist({ id: it.id, freight_shipment_id: shipmentId, stage, delete: true }),
    );
  }

  return (
    <div>
      <p className="text-[11px] text-muted mb-1">เช็คลิสต์</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted italic">— ยังไม่มีรายการ —</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-[12px]">
              <button
                type="button"
                disabled={pending || !canManage}
                onClick={() => toggle(it)}
                className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                  it.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 bg-white"
                } disabled:opacity-50`}
                aria-label={it.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"}
              >
                {it.done && <Check className="h-3 w-3" />}
              </button>
              <span className={it.done ? "line-through text-muted" : ""}>{it.item}</span>
              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(it)}
                  className="ml-auto text-muted hover:text-red-600 disabled:opacity-50"
                  aria-label="ลบ"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            placeholder="เพิ่มรายการ…"
            maxLength={300}
            className="flex-1 rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-[12px]"
          />
          <button
            type="button"
            disabled={pending || !draft.trim()}
            onClick={addItem}
            className="inline-flex items-center gap-0.5 rounded-lg bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> เพิ่ม
          </button>
        </div>
      )}
    </div>
  );
}
