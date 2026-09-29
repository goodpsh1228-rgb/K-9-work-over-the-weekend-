// ─────────────────────────────────────────────────────────────
// 로그인 후 첫 화면 (/home)
// 지금은 다가오는 근무일 목록만 보여 주고, 5단계에서 희망/미희망 투표 기능이 붙습니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { logoutAction } from "@/app/auth-actions";
import { Page } from "@/components/ui";
import { getDutyDays, viewRange } from "@/lib/duty-days-server";
import { formatShort } from "@/lib/kst";

export default async function HomePage() {
  const me = await requireMember();
  const { from, to } = viewRange(); // 오늘 ~ 60일 뒤 (한국 날짜)
  const days = await getDutyDays(from, to);
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

      {/* 다가오는 근무일 목록 (5단계에서 각 날짜에 희망/미희망 버튼이 붙습니다) */}
      <h2 className="mt-6 mb-2 text-lg font-bold">다가오는 근무일</h2>
      {days.length === 0 ? (
        <p className="text-sm text-zinc-500">앞으로 60일 안에 근무일이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {days.map((d) => (
            <li key={d.date} className="flex items-center justify-between px-3 py-2">
              <span className="font-semibold">{formatShort(d.date)}</span>
              <span className="text-sm text-zinc-500">{d.label}</span>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-6 space-y-2">
        {me.is_admin && (
          <>
            <MenuLink href="/admin/duty-days">근무일 관리 (관리자)</MenuLink>
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
