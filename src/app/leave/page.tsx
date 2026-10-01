// ─────────────────────────────────────────────────────────────
// 휴가 계산기 (/leave) — 본인만 보는 화면
//   ① 입대일·전역일 → 전역 진행률(%)·D-day, 복무일, 실제 남은 출근일
//   ② 휴가 사용 현황 (포상·연가 한도)
//   ③ 달력: 휴가·외출·면회 표시 + 입력
//   ④ 이 달 기록: "주말출근 제외로 보내기"(추첨 제외) / 취소 / 삭제
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { ServiceProgress } from "@/components/service-progress";
import { nextPromotion, promotionDates } from "@/lib/promotion";
import { HOLIDAYS } from "@/lib/holidays";
import { formatShort, todayKST, weekday } from "@/lib/kst";
import {
  annualSubkindFor,
  daysBetween,
  isFullLeave,
  isValidMonth,
  LEAVE_COLOR,
  LEAVE_LABEL,
  leaveDays,
  leaveSummary,
  monthGrid,
  remainingWorkdays,
  serviceStats,
  shiftMonth,
  SUBKINDS,
} from "@/lib/leave";
import { addLeaveAction, deleteLeaveAction, saveServiceDatesAction, sendLeaveAction, unsendLeaveAction } from "./actions";
import { LeaveForm } from "./leave-form";

type Leave = {
  id: number;
  kind: string;
  subkind: string | null;
  start_date: string;
  end_date: string;
  memo: string | null;
  absence_id: number | null;
};

const subLabel = (kind: string, sub: string | null) => SUBKINDS[kind]?.find((s) => s.value === sub)?.label;
const inputClass = "h-12 w-full rounded-lg bg-input px-3 text-base text-foreground outline-none ring-blue-600 focus:ring-2";

export default async function LeavePage({ searchParams }: PageProps<"/leave">) {
  const me = await requireMember();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const today = todayKST();
  const month = typeof sp.month === "string" && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);

  // 내 입대일·전역일 + 내 기록 (SQL 0009 전이면 표가 없어 오류 → 안내만)
  const db = getSupabaseAdmin();
  const [{ data: dates, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    db.from("members").select("enlist_date, discharge_date").eq("id", me.id).maybeSingle(),
    db.from("leaves").select("id, kind, subkind, start_date, end_date, memo, absence_id").eq("member_id", me.id).order("start_date"),
  ]);
  if (e1 || e2) {
    return (
      <Page title="휴가 계산기">
        <Notice kind="warn">휴가 계산기를 쓰려면 관리자가 추가 SQL(supabase/migrations/0009_leave_calculator.sql)을 실행해야 합니다.</Notice>
      </Page>
    );
  }
  const leaves = (rows ?? []) as Leave[];
  const enlist = (dates?.enlist_date as string | null) ?? null;
  const discharge = (dates?.discharge_date as string | null) ?? null;

  // 계산
  const stats = enlist && discharge ? serviceStats(enlist, discharge, today) : null;
  // 관리자가 추가한 공휴일(내장 목록 밖)도 쉬는 날로 셈
  const { data: added } = discharge
    ? await db.from("duty_day_overrides").select("duty_date").eq("kind", "add").gte("duty_date", today).lt("duty_date", discharge)
    : { data: [] };
  const extraHolidays = new Set((added ?? []).map((r) => r.duty_date as string));
  const workLeft = discharge ? remainingWorkdays(today, discharge, leaves, extraHolidays) : null;
  const nextLeave = leaves.find((l) => isFullLeave(l.kind) && l.start_date > today);
  const summary = leaveSummary(leaves);
  const promos = enlist ? promotionDates(enlist) : null;
  const next = enlist ? nextPromotion(enlist, today) : null;

  // 이 달 달력과 기록
  const grid = monthGrid(month);
  const monthEnd = `${month}-31`;
  const inMonth = leaves.filter((l) => l.start_date <= monthEnd && l.end_date >= `${month}-01`);
  const onDay = (d: string) => inMonth.filter((l) => l.start_date <= d && d <= l.end_date);
  const [y, m] = month.split("-").map(Number);

  return (
    <Page title="휴가 계산기">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* ① 입대일·전역일 → 진행률 */}
      {stats && enlist && discharge && promos ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
              {me.name.slice(0, 1)}
            </div>
            <div className="text-sm leading-6">
              <p className="text-lg font-semibold">
                {me.rank ? `${me.rank} ` : ""}
                {me.name}
              </p>
              <p className="text-zinc-500">
                입대 {enlist.replaceAll("-", ".")} · 전역 {discharge.replaceAll("-", ".")}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <ServiceProgress enlist={enlist} discharge={discharge} dDay={daysBetween(today, discharge)} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-y-4 text-center">
            <Stat n={stats.total} label="전체 복무일" />
            <Stat n={stats.served} label="현재 복무일" />
            <Stat n={stats.remaining} label="남은 복무일" />
            <Stat n={workLeft ?? 0} label="실제 남은 출근일" strong />
            <Stat n={nextLeave ? `D-${daysBetween(today, nextLeave.start_date)}` : "-"} label="다음 휴가" />
            <Stat
              n={leaves.filter((l) => isFullLeave(l.kind) && l.end_date >= today).reduce((s, l) => s + leaveDays(l), 0)}
              label="예정 휴가일"
            />
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">실제 남은 출근일 = 오늘~전역 전날 중 주말·공휴일·휴가를 뺀 평일 수</p>
          {/* 진급 일정 (매월 1일 자동 진급) */}
          <Card className="mt-4 p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">진급 일정</p>
              {next && (
                <p className="text-sm font-bold text-blue-600">
                  {next.rank} 진급 D-{daysBetween(today, next.date)}
                </p>
              )}
            </div>
            <ul className="mt-2 grid grid-cols-4 text-center text-sm">
              {(["일병", "상병", "병장"] as const).map((r) => (
                <li key={r} className={promos[r] <= today ? "text-zinc-400" : ""}>
                  <p className="font-semibold">{r}</p>
                  <p className="tabular-nums">{formatShort(promos[r])}</p>
                  {promos[r] <= today && <p className="text-xs">✓</p>}
                </li>
              ))}
              <li>
                <p className="font-semibold">전역</p>
                <p className="tabular-nums">{formatShort(discharge)}</p>
              </li>
            </ul>
            <p className="mt-2 text-xs text-zinc-500">계급은 입대일 기준으로 매월 1일 자동 진급됩니다(홈에서 직접 바꾸면 다음 진급일까지 유지). 전역일이 되면 자동으로 비활성화됩니다.</p>
          </Card>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-zinc-500">입대일·전역일 수정</summary>
            <DatesForm enlist={enlist} discharge={discharge} month={month} />
          </details>
        </>
      ) : (
        <Card className="mt-3 p-4">
          <p className="font-semibold">입대일과 전역일을 입력하세요</p>
          <p className="mt-1 text-sm text-zinc-500">전역까지 진행률과 실제 남은 출근일을 계산해 드립니다.</p>
          <DatesForm enlist={enlist} discharge={discharge} month={month} />
        </Card>
      )}

      {/* ② 휴가 사용 현황 */}
      <Card className="mt-6 p-4">
        <p className="mb-2 font-semibold">휴가 사용 현황</p>
        <ul className="space-y-1.5 text-sm">
          {summary.quotas.map((q) => (
            <li key={q.label} className="flex items-center justify-between gap-2">
              <span>{q.label}</span>
              <span className={`tabular-nums ${q.used > q.quota ? "font-bold text-red-600" : ""}`}>
                {q.used} / {q.quota}일 <span className="text-zinc-500">(남은 {Math.max(0, q.quota - q.used)}일)</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{summary.others.map((o) => `${o.label} ${o.value}`).join(" · ")}</p>
      </Card>

      {/* ③ 달력 */}
      <Card className="mt-6 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Link href={`/leave?month=${shiftMonth(month, -1)}`} className="px-3 py-1 text-xl text-blue-600" aria-label="이전 달">
            ‹
          </Link>
          <p className="font-bold">
            {y}년 {m}월
          </p>
          <Link href={`/leave?month=${shiftMonth(month, 1)}`} className="px-3 py-1 text-xl text-blue-600" aria-label="다음 달">
            ›
          </Link>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-zinc-500">
          {"일월화수목금토".split("").map((w, i) => (
            <span key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-600" : ""}>
              {w}
            </span>
          ))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-t border-zinc-100 dark:border-zinc-800">
            {week.map((d, di) =>
              d === null ? (
                <span key={di} />
              ) : (
                <div key={d} className={`min-h-14 px-0.5 py-1 ${d === today ? "rounded-md bg-blue-50 dark:bg-blue-950" : ""}`}>
                  <p
                    className={`text-center text-xs ${
                      weekday(d) === 0 || HOLIDAYS[d] ? "text-red-500" : weekday(d) === 6 ? "text-blue-600" : ""
                    } ${d === today ? "font-bold" : ""}`}
                  >
                    {Number(d.slice(8))}
                  </p>
                  {onDay(d)
                    .slice(0, 2)
                    .map((l) => (
                      <p key={l.id} className={`mt-0.5 truncate rounded px-0.5 text-center text-[10px] leading-4 text-white ${LEAVE_COLOR[l.kind]}`}>
                        {LEAVE_LABEL[l.kind]}
                      </p>
                    ))}
                </div>
              ),
            )}
          </div>
        ))}
      </Card>

      {/* 입력 */}
      <Card className="mt-4 p-4">
        <p className="mb-3 font-semibold">휴가·외출·면회 입력</p>
        <LeaveForm action={addLeaveAction} month={month} defaultAnnual={annualSubkindFor(me.rank)} defaultDate={today} />
      </Card>

      {/* ④ 이 달 기록 */}
      <h2 className="mt-6 mb-2 text-lg font-semibold">{m}월 기록</h2>
      {inMonth.length === 0 ? (
        <p className="text-sm text-zinc-500">이 달에 입력한 기록이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {inMonth.map((l) => (
            <li key={l.id}>
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">
                    <span className={`mr-1.5 inline-block size-2.5 rounded-full ${LEAVE_COLOR[l.kind]}`} />
                    <b>{subLabel(l.kind, l.subkind) ?? LEAVE_LABEL[l.kind]}</b>{" "}
                    {l.start_date === l.end_date ? formatShort(l.start_date) : `${formatShort(l.start_date)} ~ ${formatShort(l.end_date)}`}
                    {isFullLeave(l.kind) && <span className="text-zinc-500"> · {leaveDays(l)}일</span>}
                    {l.memo && <span className="block text-xs text-zinc-500">{l.memo}</span>}
                  </p>
                  <form action={deleteLeaveAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="month" value={month} />
                    <ConfirmButton message="이 기록을 삭제할까요? (주말출근 제외로 보냈다면 그것도 취소됩니다)" className="text-xs text-red-600 underline">
                      삭제
                    </ConfirmButton>
                  </form>
                </div>
                {/* 주말출근 제외 보내기 / 취소 */}
                <form action={l.absence_id ? unsendLeaveAction : sendLeaveAction} className="mt-2 flex items-center justify-between gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="month" value={month} />
                  {l.absence_id ? (
                    <>
                      <span className="text-xs font-semibold text-green-700 dark:text-green-400">✓ 주말출근 추첨에서 제외됨</span>
                      <button type="submit" className="text-xs text-zinc-500 underline">
                        보내기 취소
                      </button>
                    </>
                  ) : (
                    <button type="submit" className="h-9 w-full rounded-lg border border-blue-600 text-sm font-semibold text-blue-600">
                      주말출근 제외로 보내기
                    </button>
                  )}
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function Stat({ n, label, strong }: { n: number | string; label: string; strong?: boolean }) {
  return (
    <div>
      <p className={`text-2xl font-bold tabular-nums ${strong ? "text-blue-600" : ""}`}>{n}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function DatesForm({ enlist, discharge, month }: { enlist: string | null; discharge: string | null; month: string }) {
  return (
    <form action={saveServiceDatesAction} className="mt-3 space-y-2">
      <input type="hidden" name="month" value={month} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-zinc-500">
          입대일
          <input type="date" name="enlist_date" required defaultValue={enlist ?? ""} className={inputClass} />
        </label>
        <label className="block text-xs text-zinc-500">
          전역일 (비우면 자동)
          <input type="date" name="discharge_date" defaultValue={discharge ?? ""} className={inputClass} />
        </label>
      </div>
      <p className="text-xs text-zinc-500">전역일을 비워 두면 입대일 + 21개월 − 1일로 계산합니다. 계급은 입대일 기준으로 자동 진급됩니다.</p>
      <button type="submit" className="h-12 w-full rounded-lg bg-blue-600 font-bold text-white">
        저장
      </button>
    </form>
  );
}
