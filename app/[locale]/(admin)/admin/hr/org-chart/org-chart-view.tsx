import { type OrgUnit, deptTotals, positionState, type OrgState } from "@/lib/admin/hr-org";

/**
 * ผังองค์กร Pacred — render (owner draft v6 · 2026-08-03).
 * CEO → Manager·AUDIT/QC → 9 แผนก (band 1/2) → ตำแหน่ง.
 * สี 5 สถานะตามนิยาม owner · เส้น half-segment (ไม่ลากเกินขอบ).
 */

const STATE_BOX: Record<OrgState, string> = {
  vacant:  "bg-[#c62828] text-white border border-[#a51f1f]",
  short:   "bg-white border-2 border-red-600 [&_.nm]:text-red-700",
  waiting: "bg-[#f3f2f1] border-2 border-dashed border-gray-400 text-gray-600",
  over:    "bg-blue-50 border-2 border-blue-400",
  filled:  "bg-[#f2fbf4] border-2 border-emerald-500",
};

function countLine(label: string, have: number, quota: number) {
  if (quota === 0 && have === 0) return null;
  return <span className="block">{label} {have}/{quota}</span>;
}

/** ก้าน + เส้นแนวนอน half-segment เหนือกล่อง (เหมือนดราฟ) */
function Connector({ level }: { level: "dept" | "pos" }) {
  const c = level === "dept" ? "#c9c5c2" : "#d9d5d2";
  return (
    <>
      <span
        className="absolute top-0 left-0 h-0.5"
        style={{ right: "50%", background: c }}
        data-edge="l"
      />
      <span className="absolute top-0 h-0.5" style={{ left: "50%", right: 0, background: c }} data-edge="r" />
      <span className="absolute top-0 left-1/2 h-3 w-0.5 -translate-x-1/2" style={{ background: c }} />
    </>
  );
}

function PositionBox({ p }: { p: OrgUnit }) {
  const st = positionState(p);
  return (
    <div className="relative flex flex-col px-1 pt-3 first:[&>[data-edge=l]]:hidden last:[&>[data-edge=r]]:hidden">
      <Connector level="pos" />
      <div className={`flex-1 rounded-xl px-3 py-2.5 text-center shadow-sm min-w-[112px] max-w-[168px] ${STATE_BOX[st]}`}>
        {p.isHead && st === "waiting" && (
          <span className="mb-0.5 block text-[10px] font-semibold text-amber-700">หัวหน้า</span>
        )}
        <div className="nm text-[13px] font-semibold leading-tight">{p.nameTh}</div>
        <div className="mt-1 text-[10.5px] leading-snug">
          {p.isHead && st === "waiting" ? (
            <span>ว่าง 0/1 · รอเลื่อนคนในทีม</span>
          ) : (
            <>
              {countLine("พนักงาน", p.haveEmployee, p.quotaEmployee)}
              {countLine("ฝึกงาน", p.haveInternship, p.quotaInternship)}
              {countLine("พาร์ทเนอร์", p.havePartner, p.quotaPartner)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeptCol({ dept }: { dept: OrgUnit }) {
  const t = deptTotals(dept);
  return (
    <div className="relative flex flex-col items-center px-3.5 pt-4 first:[&>[data-edge=l]]:hidden last:[&>[data-edge=r]]:hidden">
      <Connector level="dept" />
      <div className="min-w-[150px] rounded-xl bg-[#161616] px-3 py-2.5 text-center text-white shadow-sm">
        <div className="text-[13px] font-semibold leading-tight">{dept.nameTh}</div>
        <div className="mt-1 text-[10.5px] leading-snug text-gray-300">
          {countLine("พนักงาน", t.hE, t.qE)}
          {t.qI > 0 && countLine("ฝึกงาน", t.hI, t.qI)}
          {t.qP > 0 && countLine("พาร์ทเนอร์", t.hP, t.qP)}
        </div>
      </div>
      {dept.children.length > 0 && (
        <>
          <span className="my-0 h-3 w-0.5 bg-[#d9d5d2]" />
          <div className="flex items-stretch">
            {dept.children.map((p) => <PositionBox key={p.id} p={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

/** กล่องหัวเดี่ยว (Manager·AUDIT/QC) — ดำ พร้อมโน้ต */
function HeadBox({ head }: { head: OrgUnit }) {
  return (
    <div className="rounded-xl bg-[#161616] px-4 py-3 text-center text-white shadow-md">
      <div className="text-sm font-semibold leading-tight">{head.nameTh}</div>
      {head.note && <div className="mt-1 text-[11px] leading-snug text-gray-300">{head.note}</div>}
    </div>
  );
}

export function OrgChartView({ root }: { root: OrgUnit }) {
  const ceo = root.children.find((c) => c.code === "ceo");
  const head = ceo?.children.find((c) => c.kind === "position"); // Manager·AUDIT/QC
  const depts = (head?.children ?? []).filter((c) => c.kind === "department");
  const band1 = depts.filter((d) => d.band === 1);
  const band2 = depts.filter((d) => d.band !== 1);

  const trunk = (h: number) => <div className="mx-auto w-0.5 bg-[#c9c5c2]" style={{ height: h }} />;

  return (
    <div className="overflow-x-auto pb-2 scrollbar-x-visible">
      <div className="mx-auto w-max">
        <div className="flex justify-center">
          <div className="rounded-xl bg-primary-600 px-12 py-3.5 text-[17px] font-bold text-white shadow-lg">CEO</div>
        </div>
        {trunk(26)}
        <div className="flex justify-center">{head && <HeadBox head={head} />}</div>
        {trunk(30)}
        <p className="mb-1 text-center text-[11px] text-gray-500">
          ทุกแผนกอยู่ใต้ <b>{head?.nameTh}</b> (คนเดียวกัน · คุมทุกแผนก + เป็นด่านตรวจก่อนถึง CEO)
        </p>
        <div className="flex w-max justify-center">
          {band1.map((d) => <DeptCol key={d.id} dept={d} />)}
        </div>
        {trunk(30)}
        <div className="flex w-max justify-center">
          {band2.map((d) => <DeptCol key={d.id} dept={d} />)}
        </div>
      </div>
    </div>
  );
}
