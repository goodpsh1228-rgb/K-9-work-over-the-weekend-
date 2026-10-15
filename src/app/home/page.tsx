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
import { addDays, formatShort, kstMoment, mondayOf, todayKST } from "@/lib/kst";
import { getMyStates, type MyState } from "@/lib/day-board";
import { STATUS_LABEL, votingStatus, votingWindow } from "@/lib/voting";
import { getFridayChecker } from "@/lib/duty-days-server";
import { runPendingDrawsSafely } from "@/lib/draw-server";
import { getLineup } from "@/lib/lineup";
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
  const [
    days,
    myState,
    fridayIsDuty,
    { data: drawRows },
    { data: myRows },
    { data: posts },
  ] = await Promise.all([
    getDutyDays(from, to),
    getMyStates(me.id, from, to),
    getFridayChecker(from, to), // 금요일 공휴일 주는 화요일 마감
    db
      .from("draws")
      .select("duty_date, clinic_shortage, general_shortage")
      .gte("duty_date", from)
      .lte("duty_date", to),
    db
      .from("assignments")
      .select("duty_date, post_id")
      .eq("member_id", me.id)
      .gte("duty_date", from)
      .lte("duty_date", to),
    db.from("posts").select("id, name"),
  ]);
  const now = new Date();
  const todayLineup = await getLineup(todayKST()); // 오늘 라인업 요약 (출근·불참 인원 수)
  const todayAbsent = new Set(todayLineup.absent.map((a) => a.id)).size;
  // 입대일을 넣었는지 (넣었으면 계급 자동) — SQL 0009 전이면 칸이 없어 오류 → 입력 안 한 것으로
  const { data: svc } = await db
    .from("members")
    .select("enlist_date")
    .eq("id", me.id)
    .maybeSingle();
  const enlisted = Boolean(svc?.enlist_date);
  const myStatus = (date: string) =>
    votingStatus(date, fridayIsDuty(date), now, me.rank); // 내 계급 기준
  const overall = (date: string) => votingStatus(date, fridayIsDuty(date), now); // 투표 전체 기준

  // 추첨이 끝난 날짜와 내 배정 (배지에 "출근·동 이름" / "미출근" 표시)
  const drawn = new Map(
    (drawRows ?? []).map((d) => [d.duty_date as string, d]),
  );
  const postName = new Map(
    (posts ?? []).map((p) => [p.id as number, p.name as string]),
  );
  // 날짜 → 내 배정 자리 이름 (운전병은 "관리 2동 + 주말 운전" 처럼 두 곳일 수 있음)
  const myPost = new Map<string, string>();
  for (const r of myRows ?? []) {
    const name = postName.get(r.post_id) ?? "";
    const prev = myPost.get(r.duty_date as string);
    myPost.set(r.duty_date as string, prev ? `${prev} + ${name}` : name);
  }
  // 보라 카드의 남은 시간: 투표 중이면 마감까지, 열리기 전이면 (내 계급 기준) 시작까지, 없으면 다음 주 월요일까지
  const nextOpen = days.find(
    (d) => !drawn.has(d.date) && overall(d.date) !== "closed",
  );
  let countdown: { title: string; target: Date; sub: string };
  if (nextOpen) {
    const win = votingWindow(nextOpen.date, fridayIsDuty(nextOpen.date));
    const cover = `대상 ${formatShort(win.coverFrom)} ~ ${formatShort(win.coverTo)} 근무일`;
    countdown =
      myStatus(nextOpen.date) === "open"
        ? {
            title: "이번 주 투표 마감까지",
            target: win.closesAt,
            sub: `${formatShort(win.closeDate)} 21:00 마감 · ${cover}`,
          }
        : overall(nextOpen.date) === "open"
          ? {
              title: "내 투표 시작까지",
              target: win.juniorOpensAt,
              sub: `${me.rank ?? "계급 미지정"}은(는) 화요일 00:00부터 · ${cover}`,
            }
          : {
              title: "투표 시작까지",
              target: win.seniorOpensAt,
              sub: `${formatShort(win.monday)} 00:00 시작 · ${cover}`,
            };
  } else {
    const monday = addDays(mondayOf(todayKST()), 7);
    countdown = {
      title: "다음 투표 시작까지",
      target: kstMoment(monday, 0),
      sub: `${formatShort(monday)} 00:00 시작`,
    };
  }

  return (
    <Page title={`${me.name} 님`}>
      {/* 내 구분: 계급(직접 바꿀 수 있음, 입대일이 있으면 매월 1일 자동 진급) + 역할 칩 */}
      <div className="-mt-3 flex flex-wrap items-center gap-2 text-sm">
        <MyRankSelect action={updateMyRankAction} current={me.rank} />
        {enlisted && <span className="text-xs text-muted">자동 진급 중</span>}
        {me.is_admin && <Chip tone="blue">관리자</Chip>}
        {me.is_clinic && <Chip tone="gray">진료반</Chip>}
        {me.is_driver && <Chip tone="gray">운전병</Chip>}
      </div>

      {/* 계급·입대일 안내: 입대일을 넣으면 계급이 자동으로 진급됨 */}
      {!enlisted && (
        <div className="mt-3">
          <Notice kind="warn">
            <Link href="/leave" className="text-link underline">
              휴가 계산기
            </Link>
            에서 입대일을 입력하면 계급이 매월 1일 자동으로 진급됩니다.
            {me.rank === null &&
              " (계급이 없으면 화요일부터만 투표할 수 있습니다)"}
          </Notice>
        </div>
      )}

      {msg && (
        <div className="mt-3">
          <Notice kind="success">{msg}</Notice>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {/* 핵심 ①: 투표 마감까지 남은 시간 (어두운 단색 타일) */}
      <div className="mt-4">
        <CountdownCard
          title={countdown.title}
          target={countdown.target.toISOString()}
          sub={countdown.sub}
        />
      </div>

      {/* 핵심 ②: 큰 버튼 둘 — 오늘 라인업 / 불참·휴가 입력 */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link href="/lineup" data-press className="flex min-h-[112px] flex-col justify-between rounded-[18px] bg-blue-600 p-4 text-white">
          <span className="text-lg font-black">오늘 라인업</span>
          <span className="text-sm">
            출근 {todayLineup.isDutyDay && !todayLineup.drawn ? "-" : todayLineup.presentCount}명 ·{" "}
            <b className={todayAbsent ? "rounded bg-orange-400 px-1.5 py-0.5 text-black" : ""}>불참 {todayAbsent}명</b>
          </span>
        </Link>
        <Link href="/absences" data-press className="flex min-h-[112px] flex-col justify-between rounded-[18px] border-2 border-blue-600 bg-card p-4 text-link">
          <span className="text-lg font-black">불참·휴가 입력</span>
          <span className="text-sm text-foreground/70">휴가·교육·당직오프·근무오프·외진</span>
        </Link>
      </div>

      {/* 다가오는 근무일 목록 (다음 주 일요일까지): 한 장의 카드 안에 줄마다 한 날짜. 누르면 투표 화면으로 */}
      <h2 className="mt-8 mb-3 text-[28px] leading-[1.14] font-display font-black tracking-[-0.02em]">
        다가오는 근무일
      </h2>
      {days.length === 0 ? (
        <p className="text-sm text-muted">
          다음 주 일요일까지 근무일이 없습니다.
        </p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {days.map((d) => (
              <li key={d.date}>
                <Link
                  href={`/day/${d.date}`}
                  className="flex min-h-[68px] items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold tracking-[-0.02em]">
                      {formatShort(d.date)}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {d.label}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {drawn.has(d.date) ? (
                      <>
                        {myPost.has(d.date) ? (
                          <Chip tone="solid">출근·{myPost.get(d.date)}</Chip>
                        ) : (
                          <Chip tone="gray">미출근</Chip>
                        )}
                        {me.is_admin &&
                          drawn.get(d.date)!.clinic_shortage +
                            drawn.get(d.date)!.general_shortage >
                            0 && (
                            <Chip tone="red">
                              부족{" "}
                              {drawn.get(d.date)!.clinic_shortage +
                                drawn.get(d.date)!.general_shortage}
                            </Chip>
                          )}
                        <span className="text-xs text-muted">추첨 완료</span>
                      </>
                    ) : (
                      <>
                        <StateBadge
                          state={myState(d.date)}
                          status={myStatus(d.date)}
                        />
                        <span className="text-xs text-muted">
                          {overall(d.date) === "open" &&
                          myStatus(d.date) === "before"
                            ? "화요일부터"
                            : STATUS_LABEL[overall(d.date)]}
                        </span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 부가 기능(덜 쓰는 것)은 작게: 빠른 불참 입력 · 통계 · 비밀번호 · 로그아웃 */}
      <details className="mt-10 text-sm text-muted">
        <summary className="cursor-pointer py-2">빠른 불참 입력 (홈에서 바로)</summary>
        <Card className="mt-2 p-4">
          <AbsenceForm action={addAbsenceAction} back="/home" />
          <p className="mt-3 text-xs text-muted">
            <Link href="/leave" className="text-link underline">
              휴가 계산기
            </Link>
            에 입력한 휴가·외출·면회는 기록마다 &quot;주말출근 제외로 보내기&quot;를 누르면 똑같이 추첨에서 제외됩니다.
          </p>
        </Card>
      </details>
      <nav className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        {me.is_admin && (
          <Link href="/admin" className="font-semibold text-foreground">
            관리자 메뉴
          </Link>
        )}
        <Link href="/stats">출근 기록·통계</Link>
        <Link href="/change-password">비밀번호 변경</Link>
        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-muted underline">
            로그아웃
          </button>
        </form>
      </nav>
    </Page>
  );
}

// 작은 알약 표시 (역할·상태). tone: blue=연한 파랑, solid=진한 파랑, gray=회색, orange=주황(미응답 경고), red=빨강
function Chip({
  tone,
  children,
}: {
  tone: "blue" | "solid" | "gray" | "orange" | "red";
  children: React.ReactNode;
}) {
  const color = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    solid: "bg-blue-600 text-white",
    gray: "bg-hairline/60 text-foreground/80",
    orange:
      "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  }[tone];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${color}`}>
      {children}
    </span>
  );
}

// 내 응답 표시: 희망(동 이름) / 미희망 / 제외 / 미응답(투표 중일 때만 주황색으로 강조)
function StateBadge({
  state,
  status,
}: {
  state: MyState;
  status: "before" | "open" | "closed";
}) {
  if (state.kind === "want")
    return <Chip tone="blue">희망·{state.postName}</Chip>;
  if (state.kind === "decline") return <Chip tone="gray">미희망</Chip>;
  if (state.kind === "excluded") return <Chip tone="gray">제외</Chip>;
  if (status === "open") return <Chip tone="orange">미응답</Chip>;
  return null;
}
