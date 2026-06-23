import { requireAdmin } from "@/lib/auth/require-admin";
import { ArticleEditor } from "../article-editor";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const { roles } = await requireAdmin(["super", "ultra", "manager", "sales_admin", "sales", "ops"]);
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <ArticleEditor initial={null} canApprove={roles.includes("ultra")} />
    </main>
  );
}
