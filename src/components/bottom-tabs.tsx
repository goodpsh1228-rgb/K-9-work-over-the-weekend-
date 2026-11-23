"use client";
// ─────────────────────────────────────────────────────────────
// 화면 아래 고정 탭 — 애플식 반투명 유리(frosted) 바
//   주말출근 투표 (홈·라인업·근무일·관리자 화면)  /  휴가 계산기
//   배경은 흰색 80% + 흐림 효과, 윗선은 가는 테두리, 그림자 없음.
//   로그인·비밀번호 변경·점검 화면에서는 보이지 않습니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN = ["/login", "/change-password", "/emergency", "/status"];

// 선 모양 아이콘 (색은 글자색을 따라감: 선택하면 파랑)
function BallotIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 13h16v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z" />
      <path d="M8 13V4.5A.5.5 0 0 1 8.5 4h7a.5.5 0 0 1 .5.5V13" />
      <path d="m10 8.5 1.6 1.6L14.5 7" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  );
}

export function BottomTabs({ officer = false }: { officer?: boolean }) {
  const path = usePathname();
  if (path === "/" || HIDDEN.some((h) => path.startsWith(h))) return null;
  const onLeave = path.startsWith("/leave");
  const onAdmin = officer && path.startsWith("/admin");
  const tab = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-xs ${active ? "font-semibold text-link" : "font-normal text-muted"}`;
  return (
    <>
      {/* 탭에 가려지지 않도록 화면 맨 아래 빈 공간 */}
      <div aria-hidden className="h-24" />
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-md">
          <Link href="/home" data-press className={tab(!onLeave && !onAdmin)} aria-current={!onLeave && !onAdmin ? "page" : undefined}>
            <BallotIcon />
            {officer ? "홈" : "주말출근 투표"}
          </Link>
          {officer ? (
            // 간부 계정에는 휴가 계산기가 없고, 대신 관리자 메뉴로 바로 갈 수 있음
            <Link href="/admin" data-press className={tab(path.startsWith("/admin"))} aria-current={path.startsWith("/admin") ? "page" : undefined}>
              <GearIcon />
              관리자 메뉴
            </Link>
          ) : (
            <Link href="/leave" data-press className={tab(onLeave)} aria-current={onLeave ? "page" : undefined}>
              <CalendarIcon />
              휴가 계산기
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
