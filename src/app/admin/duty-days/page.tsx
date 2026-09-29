// ─────────────────────────────────────────────────────────────
// 근무일 관리 화면 (/admin/duty-days) — 관리자 전용
//   - 오늘부터 60일 앞까지의 근무일 목록 (주말·공휴일 자동 + 관리자 설정)
//   - 근무일 추가, 근무 없음(삭제), 되돌리기
//   - 날짜를 누르면 그날만 자리별 인원을 다르게 설정하는 화면으로 이동
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getAllDays, viewRange } from "@/lib/duty-days-server";
import { holidayListOutdated } from "@/lib/duty-days";
import { formatShort } from "@/lib/kst";
import { Notice, Page } from "@/components/ui";
import { addDutyDayAction, removeDutyDayAction, restoreDutyDayAction } from "./actions";

export default async function DutyDaysPage({ searchParams }: PageProps<"/admin/duty-days">) {
  await requireAdmin();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const { from, to } = viewRange();
  const days = await getAllDays(from, to);

  // 인원이 따로 설정된 날짜 표시용
  const { data: countRows } = await getSupabaseAdmin()
    .from("duty_day_post_counts")
    .select("duty_date")
    .gte("duty_date", from)
    .lte("duty_date", to);
  const customCountDates = new Set((countRows ?? []).map((r) => r.duty_date as string));

  return (
    <Page title="근무일 관리">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {holidayListOutdated(to) && (
          <Notice kind="warn">
            공휴일 내장 목록이 내년 날짜를 아직 포함하지 않습니다. README의 &quot;공휴일 목록 갱신&quot; 안내에 따라
            목록을 추가해 주세요. (그 전까지는 주말만 자동으로 잡힙니다)
          </Notice>
        )}
      </div>

      {/* 근무일 추가 폼 */}
      <form id="add" action={addDutyDayAction} className="mt-4 scroll-mt-4 space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-semibold">공휴일 추가 (임시공휴일, 평일 출근일 등)</p>
        <input
          type="date"
          name="date"
          required
          min={from}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <input
          name="note"
          maxLength={50}
          placeholder="이름 (예: 임시공휴일, 국군의날)"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
          공휴일 추가
        </button>
        <p className="text-xs text-zinc-500">
          금요일을 추가하면 그 주 투표는 화요일 21:00에 마감됩니다. 투표 기간이 이미 지난 날을 추가하면 곧바로 자동
          추첨(전원 차출)됩니다.
        </p>
      </form>

      {/* 근무일 목록 */}
      <h2 className="mt-8 mb-2 text-lg font-bold">
        {formatShort(from)} ~ {formatShort(to)}
      </h2>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {days.map((d) => (
          <li key={d.date} className={`flex items-center gap-2 px-3 py-2 ${d.isDutyDay ? "" : "bg-zinc-50 dark:bg-zinc-900"}`}>
            <div className="min-w-0 flex-1">
              {d.isDutyDay ? (
                <Link href={`/admin/duty-days/${d.date}`} className="font-semibold underline decoration-zinc-300">
                  {formatShort(d.date)}
                </Link>
              ) : (
                <span className="font-semibold text-zinc-400 line-through">{formatShort(d.date)}</span>
              )}
              <span className={`ml-2 text-sm ${d.isDutyDay ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400"}`}>
                {d.label}
              </span>
              {customCountDates.has(d.date) && d.isDutyDay && (
                <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">인원 변경</span>
              )}
            </div>
            {/* 오른쪽 버튼: 근무일이면 "근무 없음", 삭제된 날이면 "되돌리기" */}
            <form action={d.isDutyDay ? removeDutyDayAction : restoreDutyDayAction}>
              <input type="hidden" name="date" value={d.date} />
              <button
                type="submit"
                className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
              >
                {d.isDutyDay ? "근무 없음" : "되돌리기"}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-500">날짜를 누르면 그날만 자리별 인원을 다르게 설정할 수 있습니다.</p>

      <Link href="/home" className="mt-6 block text-center text-sm text-zinc-500 underline">
        돌아가기
      </Link>
    </Page>
  );
}
