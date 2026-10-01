// ─────────────────────────────────────────────────────────────
// 관리자 메뉴 (/admin) — 관리자 기능을 한곳에 모은 화면
// 홈에는 "관리자 메뉴" 버튼 하나만 두고, 세부 기능은 여기서 고릅니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Notice, Page } from "@/components/ui";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { HOLIDAYS_LAST_YEAR } from "@/lib/holidays";
import { todayKST } from "@/lib/kst";

// 메뉴 목록: [주소, 제목, 설명]
const GROUPS: { title: string; items: [string, string, string][] }[] = [
  {
    title: "근무일",
    items: [
      ["/admin/duty-days", "공휴일 추가", "공휴일·평일 출근일 추가(한 해 목록 붙여넣기), 근무 없음 처리, 날짜별 동 인원 설정"],
      ["/admin/posts", "동 설정", "동 이름·기본 인원 변경, 새 동 추가, 사용 중지"],
    ],
  },
  {
    title: "인원",
    items: [
      ["/admin/members", "인원 관리 · 삭제", "계급, 진료반, 비밀번호 초기화, 관리자 지정, 비활성화·삭제"],
      ["/admin/members/import", "인원 일괄 등록", "엑셀/CSV 목록으로 한 번에 등록"],
      ["/absences", "휴가·부상 (전체)", "모든 인원의 휴가·부상 기록 보기, 대신 입력·삭제"],
    ],
  },
  {
    title: "기록 · 점검",
    items: [
      ["/admin/audit", "변경 이력", "누가·언제·무엇을 바꿨는지"],
      ["/status", "서버 점검", "데이터베이스 연결과 SQL 적용 상태"],
    ],
  },
];

export default async function AdminMenuPage() {
  await requireAdmin(); // 관리자가 아니면 홈으로
  // 공휴일 갱신 알림: 내장 목록 마지막 해의 10월부터, 다음 해 공휴일이 하나도 등록되지 않았으면
  const today = todayKST();
  const nextYear = Math.max(HOLIDAYS_LAST_YEAR, Number(today.slice(0, 4))) + 1;
  let needHolidays = false;
  if (today >= `${nextYear - 1}-10-01`) {
    const { count } = await getSupabaseAdmin()
      .from("duty_day_overrides")
      .select("duty_date", { head: true, count: "exact" })
      .eq("kind", "add")
      .gte("duty_date", `${nextYear}-01-01`)
      .lte("duty_date", `${nextYear}-12-31`);
    needHolidays = !count;
  }
  return (
    <Page title="관리자 메뉴">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        명단 수정과 카카오톡 복사는 각 근무일 화면(추첨 후)에 있습니다.
      </p>
      {needHolidays && (
        <div className="mb-4">
          <Notice kind="warn">
            {nextYear}년 공휴일이 아직 등록되지 않았습니다.{" "}
            <Link href="/admin/duty-days#import" className="font-semibold underline">
              공휴일 목록 붙여넣기
            </Link>
            로 등록해 주세요. (등록 전까지는 주말만 자동으로 근무일이 됩니다)
          </Notice>
        </div>
      )}
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-zinc-500">{g.title}</h2>
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {g.items.map(([href, title, desc]) => (
                <li key={href}>
                  <Link href={href} className="block px-4 py-3">
                    <span className="font-medium">{title} →</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{desc}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Link href="/home" className="mt-6 block text-center text-sm text-zinc-500 underline">
        홈으로
      </Link>
    </Page>
  );
}
