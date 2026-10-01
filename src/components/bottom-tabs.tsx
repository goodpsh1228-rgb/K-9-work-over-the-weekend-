"use client";
// ─────────────────────────────────────────────────────────────
// 화면 아래 고정 탭 (템플릿의 하단 메뉴 모양)
//   🗳️ 주말출근 투표 (홈·근무일·관리자 화면)  /  📅 휴가 계산기
//   로그인·비밀번호 변경·점검 화면에서는 보이지 않습니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN = ["/login", "/change-password", "/emergency", "/status"];

export function BottomTabs() {
  const path = usePathname();
  if (path === "/" || HIDDEN.some((h) => path.startsWith(h))) return null;
  const onLeave = path.startsWith("/leave");
  const tab = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-sm ${active ? "font-bold text-blue-600" : "font-medium text-zinc-500"}`;
  return (
    <>
      {/* 탭에 가려지지 않도록 화면 맨 아래 빈 공간 */}
      <div aria-hidden className="h-24" />
      <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="mx-auto flex max-w-md rounded-2xl bg-white shadow-[0_0_10px_rgba(0,0,0,0.18)] dark:bg-zinc-900">
          <Link href="/home" className={tab(!onLeave)} aria-current={!onLeave ? "page" : undefined}>
            <span className="text-2xl" aria-hidden>
              🗳️
            </span>
            주말출근 투표
          </Link>
          <Link href="/leave" className={tab(onLeave)} aria-current={onLeave ? "page" : undefined}>
            <span className="text-2xl" aria-hidden>
              📅
            </span>
            휴가 계산기
          </Link>
        </div>
      </nav>
    </>
  );
}
