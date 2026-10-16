// ─────────────────────────────────────────────────────────────
// 로그인 화면 (/login) — 애플식: 군견(위장무늬 셰퍼드) 아이콘, 큰 제목 + 작은 소제목, 알약 입력칸과 파란 버튼
// 이미 로그인한 상태면 바로 /home 으로 보냅니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import Image from "next/image";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentMember()) redirect("/home");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-20 pb-10">
      {/* 홈 화면 아이콘과 같은 그림(public/icon-512.png)을 둥근 사각형으로 */}
      <div className="mb-6 flex justify-center">
        <Image src="/icon-512.png" alt="" width={96} height={96} priority className="rounded-[22px]" />
      </div>
      {/* 제목: "군견훈육중대"는 크게, "주말출근 관리체계"는 약간 작게 소제목처럼 */}
      <h1 className="mb-10 text-center font-display font-black tracking-[-0.02em]">
        <span className="block text-[40px] leading-[1.1]">군견훈육중대</span>
        <span className="mt-1.5 block text-[26px] leading-[1.15] font-bold">주말출근 관리체계</span>
      </h1>
      <LoginForm />
      <p className="mt-8 text-center text-sm text-muted">비밀번호를 잊었으면 관리자에게 초기화를 요청하세요.</p>
    </main>
  );
}
