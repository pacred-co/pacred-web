import { PagePlaceholder } from "@/components/sections/page-placeholder";
import { SearchBar } from "@/components/sections/search-bar";

export default function DashboardPage() {
  return (
    <>
      <SearchBar />
      <PagePlaceholder title="Dashboard" />
    </>
  );
}
