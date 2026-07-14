import { getMomoContainerDetail } from "@/actions/admin/momo-container-detail";
import { Link } from "@/i18n/navigation";
import { ContainerDetailClient } from "./container-detail-client";

export const dynamic = "force-dynamic";

export default async function MomoContainerDetailPage({ params }: { params: Promise<{ cabinet: string }> }) {
  const { cabinet } = await params;
  const cab = decodeURIComponent(cabinet);
  const res = await getMomoContainerDetail(cab);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/momo-containers" className="hover:underline">← MOMO ตรวจตู้</Link>
        <span>/</span>
        <span className="font-mono font-semibold text-foreground">{cab}</span>
      </div>
      {!res.ok || !res.data ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
          โหลดตู้ไม่สำเร็จ{!res.ok ? `: ${res.error}` : ""}
        </div>
      ) : (
        <ContainerDetailClient d={res.data} />
      )}
    </div>
  );
}
