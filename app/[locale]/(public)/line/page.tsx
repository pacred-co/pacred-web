import { redirect } from "next/navigation";

const LINE_OA_URL = "https://lin.ee/Yg3fU0I";

// 307 temporary — search engines won't cache. Swap for `permanentRedirect`
// (308) if/when the LINE OA channel is final.
export default function LineRedirect() {
  redirect(LINE_OA_URL);
}
