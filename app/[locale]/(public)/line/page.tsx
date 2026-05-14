import { redirect } from "next/navigation";
import { LINE_OA } from "@/components/seo/site";

// 307 temporary — search engines won't cache. Swap for `permanentRedirect`
// (308) if/when the LINE OA channel is final.
//
// shortUrl preserves brandable analytics on the LINE OA console; we
// could swap to LINE_OA.addFriendUrl for the @pacred deep-link form
// once we've confirmed the analytics tradeoff with Pacred owner.
export default function LineRedirect() {
  redirect(LINE_OA.shortUrl);
}
