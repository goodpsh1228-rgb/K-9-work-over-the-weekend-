// ─────────────────────────────────────────────────────────────
// 사이트 첫 주소("/") — 로그인 여부에 따라 알맞은 화면으로 보내 줍니다.
//   로그인 안 함 → /login,  로그인 함 → /home
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";

export default async function Root() {
  const me = await getCurrentMember();
  redirect(me ? "/home" : "/login");
}
