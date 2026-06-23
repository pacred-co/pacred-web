import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCmsArticle } from "@/actions/admin/cms-articles";
import { ArticleEditor } from "../article-editor";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireAdmin(["super", "ultra", "manager", "sales_admin", "sales", "ops"]);
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const res = await getCmsArticle({ id: numId });
  if (!res.ok || !res.data) notFound();

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <ArticleEditor initial={res.data.article} canApprove={roles.includes("ultra")} />
    </main>
  );
}
