// ─────────────────────────────────────────────────────────────
// 근무일 화면 (/day/2026-10-10 같은 주소)
//   1) 맨 위 주황색: 아직 응답하지 않은 사람
//   2) 투표 기간 안내 + 내 투표 (희망할 동 선택 / 이날은 어려워요 / 취소)
//   3) 자리(진료실·각 동)별 희망 인원 / 정원 과 희망자 이름
//   4) 미희망·제외 인원
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { formatLong, formatShort, isValidDate } from "@/lib/kst";
import { autoLabel, computeDutyDays } from "@/lib/duty-days";
import { getOverrides } from "@/lib/duty-days-server";
import { getDayBoard, myStateFrom, type PostSlot } from "@/lib/day-board";
import { STATUS_LABEL, votingStatus, votingWindow } from "@/lib/voting";
import { Notice, Page } from "@/components/ui";
import { cancelVoteAction, declineAction, wantAction } from "./actions";

export default async function DayPage({ params, searchParams }: PageProps<"/day/[date]">) {
  const me = await requireMember();
  const { date } = await params;
  if (!isValidDate(date)) notFound();
  const day = computeDutyDays(date, date, await getOverrides(date, date))[0];
  if (!day) notFound(); // 근무일이 아닌 날
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const board = await getDayBoard(date);
  const mine = myStateFrom(board, me.id);
  const status = votingStatus(date);
  const win = votingWindow(date);
  const canVote = status === "open" && mine.kind !== "excluded";
  const myPool = me.is_clinic ? "clinic" : "general";
  const myPosts = board.posts.filter((p) => p.pool === myPool && p.required > 0);
  const clinicPosts = board.posts.filter((p) => p.pool === "clinic");
  const generalPosts = board.posts.filter((p) => p.pool === "general");

  return (
    <Page title={formatLong(date)}>
      <p className="-mt-4 mb-4 text-sm text-zinc-500">{day.label ?? autoLabel(date)}</p>

      {/* 1) 미응답자 — 최상단 주황색 */}
      {board.unanswered.length > 0 && (
        <section className="mb-4 rounded-lg border border-orange-300 bg-orange-50 p-3 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100">
          <p className="font-bold">아직 응답하지 않은 사람 ({board.unanswered.length}명)</p>
          <p className="mt-1 text-sm leading-6">{board.unanswered.map((m) => m.name).join(", ")}</p>
        </section>
      )}

      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* 2) 투표 기간 + 내 투표 */}
      <section className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm">
          <StatusChip status={status} /> {formatShort(win.openDate)} 00:00 ~ {formatShort(win.closeDate)} 21:00
        </p>
        <p className="mt-2 font-semibold">
          내 상태: <MyStateText state={mine} />
        </p>

        {mine.kind === "excluded" && (
          <p className="mt-1 text-sm text-zinc-500">휴가·부상 기간에 걸쳐 이 날은 추첨에서 제외됩니다.</p>
        )}
        {status === "before" && <p className="mt-1 text-sm text-zinc-500">투표는 {formatShort(win.openDate)} 00:00에 열립니다.</p>}
        {status === "closed" && <p className="mt-1 text-sm text-zinc-500">투표가 마감되었습니다.</p>}

        {canVote && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {me.is_clinic ? "진료반은 진료실로 희망합니다." : "출근을 희망하면 원하는 동을 누르세요."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {myPosts.map((p) => {
                const selected = mine.kind === "want" && mine.postId === p.id;
                return (
                  <form key={p.id} action={wantAction}>
                    <input type="hidden" name="date" value={date} />
                    <input type="hidden" name="post_id" value={p.id} />
                    <button
                      type="submit"
                      className={`w-full rounded-lg px-2 py-3 text-sm font-semibold ${
                        selected ? "bg-blue-600 text-white" : "border border-blue-300 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {selected ? "✓ " : ""}
                      {p.name} 희망
                      <span className="block text-xs font-normal opacity-80">
                        {p.wanters.length}/{p.required}명
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
            <form action={declineAction}>
              <input type="hidden" name="date" value={date} />
              <button
                type="submit"
                className={`w-full rounded-lg px-4 py-3 text-sm font-semibold ${
                  mine.kind === "decline" ? "bg-zinc-700 text-white" : "border border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {mine.kind === "decline" ? "✓ " : ""}이날은 어려워요 (미희망)
              </button>
            </form>
            {mine.kind !== "none" && (
              <form action={cancelVoteAction}>
                <input type="hidden" name="date" value={date} />
                <button type="submit" className="w-full py-2 text-sm text-zinc-500 underline">
                  응답 취소 (미응답으로 되돌리기)
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* 3) 자리별 희망 현황 */}
      <h2 className="mt-6 mb-2 text-lg font-bold">희망 현황</h2>
      <PostTable title="진료실 (진료반)" posts={clinicPosts} />
      <div className="h-3" />
      <PostTable title="일반" posts={generalPosts} />

      {/* 4) 미희망·제외 */}
      <div className="mt-4 space-y-2 text-sm">
        <p>
          <b>미희망 ({board.declines.length}명)</b>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">{board.declines.map((m) => m.name).join(", ") || "-"}</span>
        </p>
        <p>
          <b>제외 · 휴가/부상 ({board.excluded.length}명)</b>{" "}
          <span className="text-zinc-600 dark:text-zinc-400">{board.excluded.map((m) => m.name).join(", ") || "-"}</span>
        </p>
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
  if (state.kind === "excluded") return <span className="text-zinc-500">제외 (휴가·부상)</span>;
  return <span className="text-orange-600">미응답</span>;
}
