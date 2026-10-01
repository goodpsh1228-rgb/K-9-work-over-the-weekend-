// ─────────────────────────────────────────────────────────────
// 로그인 화면 (/login) — 템플릿의 "Welcome" 화면처럼 로고 + 환영 문구 + 입력칸
// 이미 로그인한 상태면 바로 /home 으로 보냅니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentMember()) redirect("/home");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-8 pt-16 pb-8">
      {/* 로고 자리: 보라 사각 안에 투표함 */}
      <div className="mx-auto flex size-24 items-center justify-center rounded-3xl bg-blue-600 text-5xl shadow-lg shadow-blue-600/30">
        <span aria-hidden>🗳️</span>
      </div>
      <h1 className="mt-8 text-center text-2xl font-bold tracking-tight text-foreground/85">군견훈육중대 주말출근 관리체계</h1>
      <p className="mt-2 mb-10 text-center text-sm text-zinc-500">이름과 비밀번호로 로그인하세요</p>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-blue-600">비밀번호를 잊었으면 관리자에게 초기화를 요청하세요.</p>
    </main>
  );
}
