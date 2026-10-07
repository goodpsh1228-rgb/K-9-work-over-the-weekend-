// ─────────────────────────────────────────────────────────────
// 로그인 화면 (/login) — 애플식: 큰 제목 하나, 조용한 설명, 알약 입력칸과 파란 버튼
// 이미 로그인한 상태면 바로 /home 으로 보냅니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentMember()) redirect("/home");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-20 pb-10">
      <h1 className="text-center text-[40px] leading-[1.1] font-semibold tracking-[-0.02em]">군견훈육중대 주말출근 관리체계</h1>
      <p className="mt-3 mb-10 text-center text-[21px] leading-[1.19] text-muted">이름과 비밀번호로 로그인하세요.</p>
      <LoginForm />
      <p className="mt-8 text-center text-sm text-muted">비밀번호를 잊었으면 관리자에게 초기화를 요청하세요.</p>
    </main>
  );
}
