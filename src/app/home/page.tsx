// ─────────────────────────────────────────────────────────────
// 로그인 후 첫 화면 (/home) — 지금은 임시 화면입니다.
// 5단계에서 근무일 목록과 희망/미희망 투표 화면이 여기에 들어옵니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { logoutAction } from "@/app/auth-actions";
import { Page } from "@/components/ui";

export default async function HomePage() {
  const me = await requireMember();
  return (
    <Page title="주말·공휴일 출근 투표">
      <p className="text-lg">
        <b>{me.name}</b> 님, 환영합니다.
      </p>
      {/* 내 구분 표시 */}
      <p className="mt-1 space-x-2 text-sm">
        {me.is_admin && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">관리자</span>}
        {me.is_clinic && <span className="rounded bg-teal-100 px-2 py-0.5 text-teal-800">진료반</span>}
      </p>

      <p className="mt-6 rounded-lg bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        근무일 투표 화면은 5단계에서 이곳에 만들어집니다.
      </p>

      <nav className="mt-6 space-y-2">
        {me.is_admin && (
          <>
            <MenuLink href="/admin/members/import">인원 일괄 등록 (관리자)</MenuLink>
            <MenuLink href="/status">서버 점검 화면 (관리자)</MenuLink>
          </>
        )}
        <MenuLink href="/change-password">비밀번호 변경</MenuLink>
      </nav>

      {/* 로그아웃 버튼: 누르면 서버 액션이 쿠키를 지우고 로그인 화면으로 보냅니다 */}
      <form action={logoutAction} className="mt-8">
        <button type="submit" className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700">
          로그아웃
        </button>
      </form>
    </Page>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-zinc-200 px-4 py-3 text-base dark:border-zinc-800"
    >
      {children} →
    </Link>
  );
}
