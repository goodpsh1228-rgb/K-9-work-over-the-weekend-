// ─────────────────────────────────────────────────────────────
// 로그인 화면 (/login)
// 이미 로그인한 상태면 바로 /home 으로 보냅니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { Page } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentMember()) redirect("/home");
  return (
    <Page title="주말·공휴일 출근 투표">
      <LoginForm />
      <p className="mt-6 text-xs text-zinc-500">
        비밀번호를 잊었으면 관리자에게 비밀번호 초기화를 요청하세요.
      </p>
    </Page>
  );
}
