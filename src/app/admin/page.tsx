// ─────────────────────────────────────────────────────────────
// 관리자 메뉴 (/admin) — 관리자 기능을 한곳에 모은 화면
// 홈에는 "관리자 메뉴" 버튼 하나만 두고, 세부 기능은 여기서 고릅니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Page } from "@/components/ui";

// 메뉴 목록: [주소, 제목, 설명]
const GROUPS: { title: string; items: [string, string, string][] }[] = [
  {
    title: "근무일",
    items: [
      ["/admin/duty-days", "공휴일 추가", "공휴일·평일 출근일 추가, 근무 없음 처리, 날짜별 동 인원 설정"],
    ],
  },
  {
    title: "인원",
    items: [
      ["/admin/members", "인원 관리 · 삭제", "계급, 진료반, 비밀번호 초기화, 관리자 지정, 비활성화·삭제"],
      ["/admin/members/import", "인원 일괄 등록", "엑셀/CSV 목록으로 한 번에 등록"],
      ["/admin/exclusions", "추첨 제외 인원", "특정 인원을 골라 다시 풀 때까지 추첨에서 제외"],
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
  return (
    <Page title="관리자 메뉴">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        명단 수정과 카카오톡 복사는 각 근무일 화면(추첨 후)에 있습니다.
      </p>
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
