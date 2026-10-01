// ─────────────────────────────────────────────────────────────
// 로그인 후 첫 화면 (/home)
// 다가오는 근무일 목록 + 날짜마다 투표 상태(투표 예정/투표 중/마감)와 내 응답을 보여 줍니다.
// 날짜를 누르면 그날의 투표 화면(/day/날짜)으로 이동합니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { logoutAction } from "@/app/auth-actions";
import { Page } from "@/components/ui";
import { getDutyDays, homeRange } from "@/lib/duty-days-server";
import { addAbsenceAction } from "@/app/absences/actions";
import { AbsenceForm } from "@/components/absence-form";
import { MyRankSelect } from "@/components/my-rank-select";
import { updateMyRankAction } from "./actions";
import { Card, Notice } from "@/components/ui";
import { CountdownCard } from "@/components/countdown-card";
import { addDays, formatShort, kstMoment, mondayOf, todayKST, weekday } from "@/lib/kst";
import { getMyStates, type MyState } from "@/lib/day-board";
import { STATUS_LABEL, votingStatus, votingWindow } from "@/lib/voting";
import { getFridayChecker } from "@/lib/duty-days-server";
import { runPendingDrawsSafely } from "@/lib/draw-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const me = await requireMember();
  // 안전장치: 마감됐는데 아직 추첨 안 된 날이 있으면 지금 추첨 (정기 실행이 늦거나 실패했을 때 대비)
  await runPendingDrawsSafely();
  const { from, to } = homeRange(); // 오늘 ~ 다음 주 일요일 (한국 날짜)
  // 필요한 정보를 동시에(병렬로) 읽어 기다리는 시간을 줄임
  const db = getSupabaseAdmin();
  const [days, myState, fridayIsDuty, { data: drawRows }, { data: myRows }, { data: posts }] = await Promise.all([
    getDutyDays(from, to),
    getMyStates(me.id, from, to),
    getFridayChecker(from, to), // 금요일 공휴일 주는 화요일 마감
    db.from("draws").select("duty_date, clinic_shortage, general_shortage").gte("duty_date", from).lte("duty_date", to),
    db.from("assignments").select("duty_date, post_id").eq("member_id", me.id).gte("duty_date", from).lte("duty_date", to),
    db.from("posts").select("id, name"),
  ]);
  const now = new Date();
  // 입대일을 넣었는지 (넣었으면 계급 자동) — SQL 0009 전이면 칸이 없어 오류 → 입력 안 한 것으로
  const { data: svc } = await db.from("members").select("enlist_date").eq("id", me.id).maybeSingle();
  const enlisted = Boolean(svc?.enlist_date);
  const myStatus = (date: string) => votingStatus(date, fridayIsDuty(date), now, me.rank); // 내 계급 기준
  const overall = (date: string) => votingStatus(date, fridayIsDuty(date), now); // 투표 전체 기준

  // 추첨이 끝난 날짜와 내 배정 (배지에 "출근·동 이름" / "미출근" 표시)
  const drawn = new Map((drawRows ?? []).map((d) => [d.duty_date as string, d]));
  const postName = new Map((posts ?? []).map((p) => [p.id as number, p.name as string]));
  // 날짜 → 내 배정 자리 이름 (운전병은 "관리 2동 + 주말 운전" 처럼 두 곳일 수 있음)
  const myPost = new Map<string, string>();
  for (const r of myRows ?? []) {
    const name = postName.get(r.post_id) ?? "";
    const prev = myPost.get(r.duty_date as string);
    myPost.set(r.duty_date as string, prev ? `${prev} + ${name}` : name);
  }
  // 보라 카드의 남은 시간: 투표 중이면 마감까지, 열리기 전이면 (내 계급 기준) 시작까지, 없으면 다음 주 월요일까지
  const nextOpen = days.find((d) => !drawn.has(d.date) && overall(d.date) !== "closed");
  let countdown: { title: string; target: Date; sub: string };
  if (nextOpen) {
    const win = votingWindow(nextOpen.date, fridayIsDuty(nextOpen.date));
    const cover = `대상 ${formatShort(win.coverFrom)} ~ ${formatShort(win.coverTo)} 근무일`;
    countdown =
      myStatus(nextOpen.date) === "open"
        ? { title: "이번 주 투표 마감까지", target: win.closesAt, sub: `${formatShort(win.closeDate)} 21:00 마감 · ${cover}` }
        : overall(nextOpen.date) === "open"
          ? { title: "내 투표 시작까지", target: win.juniorOpensAt, sub: `${me.rank ?? "계급 미지정"}은(는) 화요일 00:00부터 · ${cover}` }
          : { title: "투표 시작까지", target: win.seniorOpensAt, sub: `${formatShort(win.monday)} 00:00 시작 · ${cover}` };
  } else {
    const monday = addDays(mondayOf(todayKST()), 7);
    countdown = { title: "다음 투표 시작까지", target: kstMoment(monday, 0), sub: `${formatShort(monday)} 00:00 시작` };
  }

  return (
    <Page title="군견훈육중대 주말출근 관리체계">
      {/* 내 정보: 이름 첫 글자 동그라미 + 이름 + 계급·구분 */}
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
          {me.name.slice(0, 1)}
        </div>
        <div>
          <p className="text-lg leading-tight font-semibold">{me.name}</p>
          <p className="text-sm text-zinc-500">{me.is_admin ? "관리자" : "인원"}</p>
        </div>
      </div>
      {/* 내 구분 표시 */}
      <p className="mt-3 space-x-2 text-sm">
        {/* 내 계급: 드롭다운에서 직접 바꿀 수 있음. 입대일이 있으면 매월 1일 자동 진급 */}
        <MyRankSelect action={updateMyRankAction} current={me.rank} />
        {enlisted && <span className="text-xs text-zinc-500">자동 진급 중</span>}
        {me.is_admin && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">관리자</span>}
        {me.is_clinic && <span className="rounded bg-teal-100 px-2 py-0.5 text-teal-800">진료반</span>}
        {me.is_driver && <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-800">운전병</span>}
      </p>

      {/* 계급·입대일 안내: 입대일을 넣으면 계급이 자동으로 진급됨 */}
      {!enlisted && (
        <div className="mt-3">
          <Notice kind="warn">
            <Link href="/leave" className="font-semibold underline">
              📅 휴가 계산기
            </Link>
            에서 입대일을 입력하면 계급이 매월 1일 자동으로 진급됩니다.
            {me.rank === null && " (계급이 없으면 화요일부터만 투표할 수 있습니다)"}
          </Notice>
        </div>
      )}

      {/* 남은 시간 카드 (템플릿의 보라 그라데이션 카드) */}
      <div className="mt-4">
        <CountdownCard title={countdown.title} target={countdown.target.toISOString()} sub={countdown.sub} />
      </div>

      {/* 휴가·부상·외출/면회·전역 면제 입력 — 맨 위에 바로 입력 */}
      <Card className="mt-4 p-4">
        <p className="mb-2 text-sm font-semibold">휴가·부상·외출 등 제외 입력</p>
        {msg && <div className="mb-2"><Notice kind="success">{msg}</Notice></div>}
        {error && <div className="mb-2"><Notice kind="error">{error}</Notice></div>}
        <AbsenceForm action={addAbsenceAction} back="/home" />
        <Link href="/absences" className="mt-2 block text-right text-sm text-zinc-500 underline">
          내 기록 보기·삭제
        </Link>
      </Card>

      {/* 다가오는 근무일 목록 (다음 주 일요일까지): 누르면 투표 화면으로 */}
      <h2 className="mt-8 mb-3 text-xl font-semibold">다가오는 근무일</h2>
      {days.length === 0 ? (
        <p className="text-sm text-zinc-500">다음 주 일요일까지 근무일이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {days.map((d) => (
            <li key={d.date}>
              {/* 근무일 카드: 왼쪽 보라 날짜 칸 + 오른쪽 이름·상태 (템플릿의 후보 카드 모양) */}
              <Link
                href={`/day/${d.date}`}
                className="flex overflow-hidden rounded-lg bg-white shadow-[0_4px_12px_rgba(15,16,32,0.08)] dark:bg-zinc-900"
              >
                {/* 화면 낭독기용 날짜·이름 (예: "10/3(토) 개천절") — 눈에는 안 보임 */}
                <span className="sr-only">{`${formatShort(d.date)} ${d.label}`}</span>
                <span aria-hidden className="flex w-20 shrink-0 flex-col items-center justify-center bg-blue-600 py-3 text-white">
                  <span className="text-xl leading-tight font-bold">{`${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}`}</span>
                  <span className="text-xs font-semibold opacity-90">{"일월화수목금토"[weekday(d.date)]}요일</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-3 py-3">
                <span aria-hidden className="text-sm font-semibold">{d.label}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs">
                  {drawn.has(d.date) ? (
                    <>
                      {myPost.has(d.date) ? (
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 font-semibold text-white">출근·{myPost.get(d.date)}</span>
                      ) : (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500">미출근</span>
                      )}
                      {me.is_admin && drawn.get(d.date)!.clinic_shortage + drawn.get(d.date)!.general_shortage > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                          부족 {drawn.get(d.date)!.clinic_shortage + drawn.get(d.date)!.general_shortage}
                        </span>
                      )}
                      <span className="text-zinc-500">추첨 완료 ›</span>
                    </>
                  ) : (
                    <>
                      <StateBadge state={myState(d.date)} status={myStatus(d.date)} />
                      <span className="text-zinc-500">
                        {overall(d.date) === "open" && myStatus(d.date) === "before" ? "화요일부터" : STATUS_LABEL[overall(d.date)]} ›
                      </span>
                    </>
                  )}
                </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-6 space-y-2">
        {me.is_admin && (
          <>
            <MenuLink href="/admin">🛠 관리자 메뉴</MenuLink>
          </>
        )}
        <MenuLink href="/stats">📊 출근 기록·통계</MenuLink>
        <MenuLink href="/change-password">비밀번호 변경</MenuLink>
      </nav>

      {/* 로그아웃 버튼: 누르면 서버 액션이 쿠키를 지우고 로그인 화면으로 보냅니다 */}
      <form action={logoutAction} className="mt-8">
        <button type="submit" className="h-14 w-full rounded-lg border border-blue-600 px-4 font-semibold text-blue-600">
          로그아웃
        </button>
      </form>
    </Page>
  );
}

// 내 응답 표시: 희망(동 이름) / 미희망 / 제외 / 미응답(투표 중일 때만 주황색으로 강조)
function StateBadge({ state, status }: { state: MyState; status: "before" | "open" | "closed" }) {
  if (state.kind === "want")
    return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">희망·{state.postName}</span>;
  if (state.kind === "decline") return <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-700">미희망</span>;
  if (state.kind === "excluded") return <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500">제외</span>;
  if (status === "open") return <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-800">미응답</span>;
  return null;
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg bg-white px-4 py-3 text-base font-medium shadow-[0_4px_12px_rgba(15,16,32,0.08)] dark:bg-zinc-900"
    >
      {children} →
    </Link>
  );
}
