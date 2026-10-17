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
import { MyRankSelect } from "@/components/my-rank-select";
import { updateMyCohortAction, updateMyRankAction } from "./actions";
import { effectiveSquad } from "@/lib/squads";
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
  const lineupDate = addDays(todayKST(), 1); // 홈에는 내일 라인업을 보여 줌 (전날 미리 확인·수기 입력용)
  const todayLineup = await getLineup(lineupDate); // 내일 라인업 요약 (출근·불참 인원 수, 1차탑승)
  const todayAbsent = new Set(todayLineup.absent.map((a) => a.id)).size;
  // 입대일을 넣었는지 (넣었으면 계급 자동) — SQL 0009 전이면 칸이 없어 오류 → 입력 안 한 것으로
  const { data: svc } = await db
    .from("members")
    .select("enlist_date")
    .eq("id", me.id)
    .maybeSingle();
  const enlisted = Boolean(svc?.enlist_date);
  // 내 기수·반 (SQL 0015 전이면 칸이 없어 오류 → 기능 숨김)
  const { data: extra, error: extraErr } = await db.from("members").select("cohort, squad, is_clinic").eq("id", me.id).maybeSingle();
  const cohortReady = !extraErr;
  const myCohort = (extra?.cohort as number | null | undefined) ?? null;
  const mySquad = extra ? effectiveSquad(extra.squad as string | null, Boolean(extra.is_clinic)) : null;
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
        {/* 기수: 한 번 입력하면 고정(칩으로만 표시). 바꿔야 하면 관리자가 수정 */}
        {cohortReady && myCohort !== null && <Chip tone="blue">{myCohort}기</Chip>}
        {cohortReady && myCohort === null && (
          <form action={updateMyCohortAction} className="inline-flex items-center gap-1">
            <input
              name="cohort"
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              required
              placeholder="기수"
              aria-label="내 기수"
              className="h-8 w-[72px] rounded-full border border-orange-400 bg-card px-3 text-sm"
            />
            <button type="submit" className="h-8 rounded-full border border-blue-600 px-3 text-xs font-semibold text-link">
              기수 저장
            </button>
          </form>
        )}
        {mySquad && <Chip tone="gray">{mySquad}</Chip>}
        {me.is_admin && <Chip tone="blue">관리자</Chip>}
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

      {/* ───── 1순위 ① 휴가·불참 입력 (가장 크게) ───── */}
      <Link href="/absences" data-press className="mt-4 flex h-16 items-center justify-between rounded-[18px] bg-blue-600 px-5 text-white">
        <span className="text-xl font-black">휴가·불참 입력</span>
        <span aria-hidden className="text-2xl leading-none">＋</span>
      </Link>

      {/* ───── 1순위 ② 1차 명단 (내일 출근자 중 높은 기수 9명 + 예비 2명) + 아래에 작게 "내일 운전병" ───── */}
      {(todayLineup.boardingSupported || todayLineup.driveSupported) && (
        <Card className="mt-4 p-4">
          {todayLineup.boardingSupported && (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[22px] font-display font-black tracking-[-0.02em]">1차 명단</h2>
                <span className="text-sm text-muted">내일 {formatShort(lineupDate)}</span>
              </div>
              {todayLineup.boarding.length > 0 ? (
                <>
                  <p className="mt-3 flex flex-wrap gap-2">
                    {todayLineup.boarding.map((p) => (
                      <span key={p.id} className="rounded-full bg-blue-100 px-3 py-1.5 text-base font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">
                        {p.name}
                      </span>
                    ))}
                  </p>
                  {todayLineup.reserve.length > 0 && (
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <b className="text-muted">예비</b>
                      {todayLineup.reserve.map((p, i) => (
                        <span key={p.id} className="rounded-full border border-hairline px-3 py-1">
                          {i + 1}. {p.name}
                        </span>
                      ))}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {todayLineup.isDutyDay && !todayLineup.drawn ? "추첨이 끝나면 표시됩니다." : "기수를 입력한 출근자가 없습니다."}
                </p>
              )}
            </>
          )}
          {/* 내일 운전병 (운전 지정): 운전하는 사람은 위 1차 명단에서 빠져 있음. 운전병·관리자만 지정·수정 링크가 보임. 다른 사람에게는 작게만 */}
          {todayLineup.driveSupported && (
            <div className={`flex items-center justify-between gap-3 text-xs ${todayLineup.boardingSupported ? "mt-3 border-t border-hairline pt-2.5" : ""}`}>
              <p className="min-w-0 text-muted">
                내일 운전병(1차 명단 제외){" "}
                <b className="font-semibold text-foreground">
                  {todayLineup.drivers.length ? todayLineup.drivers.map((p) => (p.rank ? `${p.rank} ${p.name}` : p.name)).join(", ") : <span className="font-normal text-muted">지정 없음</span>}
                </b>
              </p>
              {(me.is_driver || me.is_admin) && (
                <Link href="/drive" className="shrink-0 font-semibold text-link">
                  지정·수정 ›
                </Link>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ───── 1순위 ③ 주말출근 투표 ───── */}
      <h2 className="mt-8 mb-2 text-[26px] leading-[1.14] font-display font-black tracking-[-0.02em]">주말출근 투표</h2>
      <CountdownCard compact title={countdown.title} target={countdown.target.toISOString()} sub={countdown.sub} />
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

      {/* ───── 2순위: 라인업 파일 확인 ───── */}
      <Link href={`/lineup?date=${lineupDate}`} data-press className="mt-3 flex min-h-14 items-center justify-between rounded-[18px] border border-hairline bg-card px-5 py-3">
        <span className="font-semibold">라인업 파일 확인</span>
        <span className="text-sm text-muted">
          출근 {todayLineup.isDutyDay && !todayLineup.drawn ? "-" : todayLineup.presentCount}명 ·{" "}
          <b className={todayAbsent ? "text-link" : ""}>불참 {todayAbsent}명</b> ›
        </span>
      </Link>

      {/* 부가 기능(덜 쓰는 것)은 작게: 통계 · 비밀번호 · 로그아웃 */}
      <nav className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
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
