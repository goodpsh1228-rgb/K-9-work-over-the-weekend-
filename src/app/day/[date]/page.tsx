// ─────────────────────────────────────────────────────────────
// 근무일 화면 (/day/2026-10-10 같은 주소)
//   1) 맨 위 주황색: 아직 응답하지 않은 사람
//   2) 투표 기간 안내 + 내 투표 (희망할 동 선택 / 이날은 어려워요 / 취소)
//   3) 자리(진료실·각 동)별 희망 인원 / 정원 과 희망자 이름
//   4) 미희망·제외 인원
//   추첨이 끝난 날은 맨 위에 "확정 명단"이 나옵니다 (희망 확정 / 차출 / 관리자 수정 꼬리표).
//   관리자: 마감 후 "지금 추첨" 버튼, 투표 중에는 "추첨 미리보기"(저장 안 됨)
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { addDays, dateRange, formatLong, formatShort, isValidDate } from "@/lib/kst";
import { autoLabel, computeDutyDays } from "@/lib/duty-days";
import { getOverrides, getVoteInfo } from "@/lib/duty-days-server";
import { getDayBoard, getPostsForDate, myStateFrom, type PostSlot } from "@/lib/day-board";
import { STATUS_LABEL } from "@/lib/voting";
import { Notice, Page } from "@/components/ui";
import { buildDrawInput, getDraw, getRoster, runPendingDrawsSafely, simulateDraw, type RosterEntry } from "@/lib/draw-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildPostText, buildRankText } from "@/lib/roster-text";
import { CopyButton } from "@/components/copy-button";
import { excuseUnansweredAction, manualDrawAction, undoExcuseAction } from "./actions";
import { VotePanel } from "./vote-panel";
import { DrivePanel } from "./drive-panel";
import { EscortDrawForm, escortWorkers } from "@/components/escort-draw-form";
import { drawEscortAction } from "@/app/admin/roster/[date]/actions";

export default async function DayPage({ params, searchParams }: PageProps<"/day/[date]">) {
  const me = await requireMember();
  const { date } = await params;
  if (!isValidDate(date)) notFound();
  const day = computeDutyDays(date, date, await getOverrides(date, date))[0];
  if (!day) notFound(); // 근무일이 아닌 날
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  // 안전장치: 마감됐는데 아직 추첨 안 된 날이 있으면 지금 추첨
  await runPendingDrawsSafely();
  // 필요한 정보를 동시에(병렬로) 읽어 기다리는 시간을 줄임
  const [board, voteInfo, draw] = await Promise.all([getDayBoard(date), getVoteInfo(date, me.rank), getDraw(date)]);
  const mine = myStateFrom(board, me.id);
  // 투표 상태: status = 내 계급 기준, overall = 투표 전체 기준(월요일 시작)
  const { status, overall, window: win, fridayIsDuty } = voteInfo;
  const canVote = status === "open" && mine.kind !== "excluded";
  // 희망할 수 있는 자리: 모든 동 + (진료반이면 진료실). 주말 운전은 운전병만, 아래 운전 버튼으로 따로
  const myPosts = board.posts.filter((p) => (p.pool === "general" || (p.pool === "clinic" && me.is_clinic)) && p.required > 0);
  const clinicPosts = board.posts.filter((p) => p.pool === "clinic");
  const driverPosts = board.posts.filter((p) => p.pool === "driver" && p.required > 0);
  const generalPosts = board.posts.filter((p) => p.pool === "general");

  // 추첨 결과 (있으면) / 관리자 미리보기
  const roster = draw ? await getRoster(date) : null;
  let preview: RosterEntry[] | null = null;
  let previewShortage = 0;
  if (!draw && me.is_admin && sp.preview === "1") {
    const sim = simulateDraw(await buildDrawInput(date));
    const { data: names } = await getSupabaseAdmin().from("members").select("id, name");
    const nameOf = new Map((names ?? []).map((m) => [m.id as number, m.name as string]));
    preview = sim.assignments.map((a) => ({ ...a, name: nameOf.get(a.memberId) ?? "?", rank: null }));
    previewShortage = sim.shortage.clinic + sim.shortage.general + sim.shortage.driver;
  }
  // 희망했지만 정원 초과로 떨어져 쉬는 사람 (추첨 후)
  const rosterIds = new Set((roster ?? []).map((r) => r.memberId));
  //   (운전 희망에서 떨어진 사람은 쉼이 아님 — 동 출근은 따로)
  const rested = roster
    ? board.posts.filter((p) => p.pool !== "driver").flatMap((p) => p.wanters.filter((w) => !rosterIds.has(w.id)))
    : [];
  // 내 배정 (운전병은 동 + 운전 두 곳일 수 있음)
  const myPostNames = (roster ?? [])
    .filter((r) => r.memberId === me.id)
    .map((r) => board.posts.find((p) => p.id === r.postId)?.name ?? "?");
  const myAssignment = myPostNames.length > 0;

  // 관리자가 이 날만 뺀 사람(관리자 제외) 목록
  const excusedRows = (
    await getSupabaseAdmin().from("absences").select("id, member_id").eq("kind", "excused").eq("start_date", date)
  ).data;
  const nameById = new Map([...board.excluded].map((m) => [m.id, m.name]));
  const excused = (excusedRows ?? [])
    .filter((r) => nameById.has(r.member_id))
    .map((r) => ({ id: r.id as number, name: nameById.get(r.member_id)! }));

  // 관리자 선탑 뽑기: 선탑 자리, 현재 선탑, 대상자 후보(그날 동·진료실 출근자)
  const escortPost = board.posts.find((p) => p.pool === "escort");
  const currentEscort = (roster ?? []).filter((r) => r.postId === escortPost?.id);
  const escortCandidates = escortWorkers(
    roster ?? [],
    new Set(board.posts.filter((p) => p.pool === "clinic" || p.pool === "general").map((p) => p.id)),
  );

  // 카카오톡용 출근 명단 글 (추첨이 끝나면 모두에게): ① 동별 ② 계급별
  const postText = roster ? buildPostText(date, board.posts, roster) : null;
  const rankText = roster ? buildRankText(date, board.posts, roster) : null;
  // 관리자: 같은 투표 주에 추첨이 끝난 모든 날의 동별 글을 한 번에
  let kakaoWeek: string | null = null;
  if (me.is_admin && postText) {
    const texts: string[] = [];
    for (const d of dateRange(win.coverFrom, win.coverTo)) {
      if (d === date) texts.push(postText);
      else if (await getDraw(d)) texts.push(buildPostText(d, await getPostsForDate(d), await getRoster(d)));
    }
    if (texts.length > 1) kakaoWeek = texts.join("\n\n");
  }

  return (
    <Page title={formatLong(date)}>
      <p className="-mt-4 mb-4 text-sm text-zinc-500">{day.label ?? autoLabel(date)}</p>

      {/* 안내 문구 (저장 결과, 선탑 뽑기 결과 등) — 맨 위에 */}
      {(msg || error) && (
        <div className="mb-3 space-y-3">
          {msg && <Notice kind="success">{msg}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}
        </div>
      )}

      {/* 추첨 결과: 확정 명단 */}
      {roster && draw && (
        <section className="mb-4 space-y-3">
          <p className={`rounded-lg p-3 font-semibold ${myAssignment ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-900"}`}>
            {myAssignment
              ? `${me.name} 님은 ${myPostNames.join(" + ")} 출근입니다.`
              : `${me.name} 님은 이 날 출근하지 않습니다.`}
          </p>
          {me.is_admin && draw.clinic_shortage + draw.general_shortage > 0 && (
            <Notice kind="error">
              ⚠️ 인원 부족 {draw.clinic_shortage + draw.general_shortage}명 (진료실 {draw.clinic_shortage} · 동·운전{" "}
              {draw.general_shortage}). 빈자리를 채워 주세요.
            </Notice>
          )}
          {/* 관리자: 선탑 뽑기 (따로 눈에 띄게) */}
          {me.is_admin && escortPost && (
            <Fold
              title="🎲 선탑 뽑기 (관리자)"
              hint={`현재 선탑: ${currentEscort.length ? currentEscort.map((r) => `${r.rank ? `${r.rank} ` : ""}${r.name}`).join(", ") : "미정"}`}
              className="border-2 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
            >
              <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">이 날 출근자 중 대상자를 체크한 뒤 버튼을 누르세요.</p>
              <EscortDrawForm date={date} workers={escortCandidates} action={drawEscortAction} returnTo="day" />
            </Fold>
          )}

          {/* 출근 명단 글 두 가지 — 글을 보여 주고, 버튼으로 복사 */}
          {postText && rankText && (
            <div className="space-y-3">
              <TextBlock title="동별 출근 인원" text={postText} label="동별 명단 복사" />
              <TextBlock title="계급별 출근 인원" text={rankText} label="계급별 명단 복사" />
              {kakaoWeek && <CopyButton text={kakaoWeek} label="이번 투표 주 동별 명단 전체 복사" />}
            </div>
          )}
          <RosterView title="확정 명단" posts={board.posts} roster={roster} />
          {me.is_admin && (
            <Link
              href={`/admin/roster/${date}`}
              className="block rounded-lg border border-purple-300 px-3 py-2 text-center text-sm font-semibold text-purple-800 dark:text-purple-300"
            >
              명단 수정 (관리자) →
            </Link>
          )}
          {rested.length > 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <b>정원 초과로 쉼:</b> {rested.map((w) => w.name).join(", ")}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            추첨: {new Date(draw.executed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} ·{" "}
            {{ cron: "자동(정기)", visit: "자동(접속 시)", manual: "관리자 수동" }[draw.triggered_by]}
          </p>
        </section>
      )}

      {/* 1) 미응답자 — 최상단 주황색 (추첨 전까지) */}
      {!draw && board.unanswered.length > 0 && (
        <section className="mb-4 rounded-lg border border-orange-300 bg-orange-50 p-3 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100">
          <p className="font-bold">아직 응답하지 않은 사람 ({board.unanswered.length}명)</p>
          <p className="mt-1 text-sm leading-6">{board.unanswered.map((m) => m.name).join(", ")}</p>
          {/* 관리자: 투표를 깜빡했지만 이 날 출근하지 않는 사람을 골라 이 날 추첨에서만 빼기 */}
          {me.is_admin && (
            <details className="mt-2 rounded-lg bg-white/70 dark:bg-black/20">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">관리자: 이 날 추첨에서 뺄 사람 고르기</summary>
              <form action={excuseUnansweredAction} className="space-y-2 px-3 pb-3">
                <input type="hidden" name="date" value={date} />
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  {board.unanswered.map((m) => (
                    <label key={m.id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="ids" value={m.id} className="h-4 w-4" />
                      {m.name}
                    </label>
                  ))}
                </div>
                <button type="submit" className="h-11 w-full rounded-lg bg-orange-600 text-sm font-bold text-white">
                  선택한 사람 이 날 추첨에서 빼기
                </button>
                <p className="text-xs opacity-80">이 날 하루만 빠집니다. 아래 &quot;제외&quot; 목록에서 되돌릴 수 있습니다.</p>
              </form>
            </details>
          )}
        </section>
      )}


      {/* 2) 투표 기간 + 내 투표 */}
      <section className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm">
          <StatusChip status={overall} /> {formatShort(win.monday)} 00:00 ~ {formatShort(win.closeDate)} 21:00
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          월요일은 상병·병장만, 화요일부터 일병·이병도 투표할 수 있습니다.
          {fridayIsDuty && " 이번 주는 금요일이 공휴일이라 화요일 21:00에 마감합니다."}
        </p>
        <p className="mt-2 font-semibold">
          내 상태: <MyStateText state={mine} />
        </p>

        {mine.kind === "excluded" && (
          <p className="mt-1 text-sm text-zinc-500">이 날은 추첨에서 제외됩니다. (휴가·부상 등 제외 기간 또는 관리자 지정 제외)</p>
        )}
        {status === "before" && (
          <p className="mt-1 text-sm text-zinc-500">
            {overall === "open"
              ? `${me.rank ?? "계급 미지정"}은(는) ${formatShort(addDays(win.monday, 1))} 00:00부터 투표할 수 있습니다.`
              : `투표는 ${formatShort(win.monday)} 00:00에 열립니다.`}
          </p>
        )}
        {status === "closed" && <p className="mt-1 text-sm text-zinc-500">투표가 마감되었습니다.</p>}

        {canVote && (
          <VotePanel
            date={date}
            isClinic={me.is_clinic}
            posts={myPosts.map((p) => ({ id: p.id, name: p.name, required: p.required, count: p.wanters.length }))}
            initial={mine.kind === "want" ? { kind: "want", postId: mine.postId } : mine.kind === "decline" ? { kind: "decline" } : { kind: "none" }}
          />
        )}
        {/* 운전병: 주말 운전 희망 (동 희망과 따로) */}
        {canVote && me.is_driver && driverPosts.length > 0 && (
          <DrivePanel
            date={date}
            initial={driverPosts[0].wanters.some((w) => w.id === me.id)}
            count={driverPosts[0].wanters.length}
            required={driverPosts.reduce((s, p) => s + p.required, 0)}
          />
        )}
      </section>

      {/* 관리자: 수동 추첨 / 미리보기 */}
      {me.is_admin && !draw && (
        <section className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-sm font-semibold">관리자</p>
          {overall === "closed" ? (
            <form action={manualDrawAction} className="mt-2">
              <input type="hidden" name="date" value={date} />
              <button type="submit" className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white">
                지금 추첨 (한 번만 실행됩니다)
              </button>
            </form>
          ) : (
            <Link href={`/day/${date}?preview=1`} className="mt-2 block text-sm text-blue-600 underline">
              추첨 미리보기 (현재 응답 기준 · 저장 안 됨 · 누를 때마다 결과가 달라짐)
            </Link>
          )}
          {preview && (
            <div className="mt-3 space-y-2">
              {previewShortage > 0 && <Notice kind="warn">미리보기상 인원 부족 {previewShortage}명</Notice>}
              <RosterView title="미리보기 (저장 안 됨)" posts={board.posts} roster={preview} />
            </div>
          )}
        </section>
      )}

      {/* 3) 자리별 희망 현황 */}
      <h2 className="mt-6 mb-2 text-lg font-bold">희망 현황</h2>
      <PostTable title="진료실 (진료반)" posts={clinicPosts} />
      <div className="h-3" />
      <PostTable title="일반" posts={generalPosts} />
      {driverPosts.length > 0 && (
        <>
          <div className="h-3" />
          <PostTable title="주말 운전 (운전병)" posts={driverPosts} />
        </>
      )}

      {/* 4) 미희망·제외 */}
      <div className="mt-4 space-y-2 text-sm">
        <p>
          <b>미희망 ({board.declines.length}명)</b>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">{board.declines.map((m) => m.name).join(", ") || "-"}</span>
        </p>
        <p>
          <b>제외 · 휴가/부상 등 ({board.excluded.length}명)</b>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">{board.excluded.map((m) => m.name).join(", ") || "-"}</span>
        </p>
        {/* 관리자가 이 날만 뺀 사람: 관리자에게 되돌리기 버튼 (추첨 전) */}
        {excused.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">그중 관리자 제외 (투표 깜빡한 사람을 이 날만 뺌)</p>
            {excused.map((e) => (
              <form key={e.id} action={undoExcuseAction} className="flex items-center justify-between gap-2">
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="absence_id" value={e.id} />
                <span>{e.name}</span>
                {me.is_admin && !draw && (
                  <button type="submit" className="text-xs text-blue-600 underline">
                    되돌리기
                  </button>
                )}
              </form>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between text-sm text-zinc-500">
        <Link href="/home" className="underline">
          ← 근무일 목록
        </Link>
        <Link href="/absences" className="underline">
          휴가·부상 입력 →
        </Link>
      </div>
    </Page>
  );
}

// 복사용 글 한 덩어리: 제목 + 글 + 복사 버튼
//   처음에는 제목만 보이고, 누르면 글과 복사 버튼이 펼쳐집니다.
function TextBlock({ title, text, label }: { title: string; text: string; label: string }) {
  return (
    <Fold title={title} className="bg-white shadow-[0_4px_12px_rgba(15,16,32,0.08)] dark:bg-zinc-900">
      <div className="space-y-2">
        <pre className="whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 font-sans text-sm leading-6 dark:bg-zinc-800">{text}</pre>
        <CopyButton text={text} label={label} />
      </div>
    </Fold>
  );
}

// 접었다 펼치는 칸: 제목(+짧은 안내)만 보이다가 누르면 내용이 펼쳐짐 (▾ 표시가 돌아감)
//   <details> = 브라우저 기본 "펼치기" 상자라 따로 프로그램 없이 동작합니다.
function Fold({ title, hint, className, children }: { title: string; hint?: string; className: string; children: React.ReactNode }) {
  return (
    <details className={`group rounded-lg ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-bold">{title}</span>
          {hint && <span className="mt-0.5 block text-sm">{hint}</span>}
        </span>
        <span aria-hidden className="text-xl text-zinc-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

// 확정 명단 표: 자리마다 이름 + 꼬리표, 빈자리는 빨간색 (선탑은 "미정")
const SOURCE_LABEL = { wanted: "희망 확정", drafted: "차출", admin: "관리자 수정" } as const;
const SOURCE_COLOR = {
  wanted: "bg-blue-100 text-blue-800",
  drafted: "bg-amber-100 text-amber-800",
  admin: "bg-purple-100 text-purple-800",
} as const;
function RosterView({ title, posts, roster }: { title: string; posts: PostSlot[]; roster: RosterEntry[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <p className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">{title}</p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {posts
          .filter((p) => p.required > 0 || roster.some((r) => r.postId === p.id))
          .map((p) => {
            const people = roster.filter((r) => r.postId === p.id);
            const empty = Math.max(0, p.required - people.length);
            return (
              <li key={p.id} className="px-3 py-2">
                <p className="text-sm font-semibold">
                  {p.name} ({people.length}/{p.required}명)
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-sm">
                  {people.map((r) => (
                    <span key={r.memberId} className="inline-flex items-center gap-1">
                      {r.name}
                      <span className={`rounded px-1 text-[11px] ${SOURCE_COLOR[r.source]}`}>{SOURCE_LABEL[r.source]}</span>
                    </span>
                  ))}
                  {empty > 0 &&
                    (p.pool === "escort" ? (
                      <span className="text-zinc-500">미정 (관리자가 지정)</span>
                    ) : (
                      <span className="text-red-600">빈자리 {empty}</span>
                    ))}
                </p>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

// 자리별 표: "관리 2동  2/3명  홍길동, 김철수"
function PostTable({ title, posts }: { title: string; posts: PostSlot[] }) {
  const wantTotal = posts.reduce((s, p) => s + p.wanters.length, 0);
  const reqTotal = posts.reduce((s, p) => s + p.required, 0);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <p className="flex justify-between border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">
        <span>{title}</span>
        <span>
          희망 {wantTotal} / 정원 {reqTotal}
        </span>
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {posts.map((p) => {
          const over = p.wanters.length > p.required;
          const full = p.wanters.length === p.required;
          return (
            <li key={p.id} className="px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.name}</span>
                <span
                  className={`text-sm font-semibold ${
                    over ? "text-red-600" : full ? "text-green-600" : "text-zinc-500"
                  }`}
                >
                  {p.wanters.length}/{p.required}명{over ? " (초과)" : full ? " (충족)" : ""}
                </span>
              </div>
              {p.wanters.length > 0 && (
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{p.wanters.map((w) => w.name).join(", ")}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusChip({ status }: { status: "before" | "open" | "closed" }) {
  const color =
    status === "open" ? "bg-green-100 text-green-800" : status === "closed" ? "bg-zinc-200 text-zinc-700" : "bg-blue-100 text-blue-800";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>{STATUS_LABEL[status]}</span>;
}

function MyStateText({ state }: { state: ReturnType<typeof myStateFrom> }) {
  if (state.kind === "want") return <span className="text-blue-700 dark:text-blue-300">희망 · {state.postName}</span>;
  if (state.kind === "decline") return <span>미희망</span>;
  if (state.kind === "excluded") return <span className="text-zinc-500">제외</span>;
  return <span className="text-orange-600">미응답</span>;
}
