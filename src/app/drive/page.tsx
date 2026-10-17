// ─────────────────────────────────────────────────────────────
// 운전 지정 (/drive) — 운전병과 관리자만 보임 (그 사람들끼리 추가·삭제)
//   ① 지정하기: 운전병 선택 + 기간(휴가 입력처럼 달력에서 시작일·종료일) → 저장
//   ② 달력: 한 달씩, 옆으로 밀거나 ‹ › 로 넘김. 날짜 칸마다 그날 운전하는 사람 이름 (사람별 색)
//   ③ 운전병 휴가 일정: 운전병들의 앞으로 휴가(실제·계획 구분)
//   ④ 운전 지정 목록: 오늘 이후까지 걸친 지정 (삭제 가능)
//   운전하는 날은 라인업의 1차탑승·예비 명단에서 빠지고, 홈에 "내일 운전병"으로 보입니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { DateRangePicker } from "@/components/date-range-picker";
import { getDriveDuties } from "@/lib/drivers";
import { addDays, todayKST } from "@/lib/kst";
import { shiftMonth } from "@/lib/leave";
import { DriveCalendar, type CalLeave } from "./drive-calendar";
import { isFullLeave } from "@/lib/leave";
import { dotsRange } from "@/lib/spans";
import { mergeConsecutive } from "@/lib/squads";
import { addDriveDutyAction, deleteDriveDutyAction } from "./actions";

// 달력에서 넘겨 볼 수 있는 범위: 3달 전 ~ 12달 뒤
const MIN_MONTH = (today: string) => shiftMonth(today.slice(0, 7), -3);
const MAX_MONTH = (today: string) => shiftMonth(today.slice(0, 7), 12);

const inputClass = "h-12 min-w-0 w-full rounded-full border border-hairline bg-input px-4 text-base text-foreground outline-none focus:border-blue-500";

export default async function DrivePage({ searchParams }: PageProps<"/drive">) {
  const me = await requireMember();
  if (!me.is_driver && !me.is_admin) redirect("/home"); // 운전병·관리자만
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const today = todayKST();
  const tomorrow = addDays(today, 1);

  const db = getSupabaseAdmin();
  const [{ data: drivers }, duties] = await Promise.all([
    db.from("members").select("id, name, rank").eq("is_active", true).eq("is_driver", true).order("name"),
    getDriveDuties(`${MIN_MONTH(today)}-01`, addDays(`${shiftMonth(MAX_MONTH(today), 1)}-01`, -1)), // 달력에서 넘겨 볼 수 있는 범위 전체를 한 번에 읽음
  ]);
  const { data: all } = await db.from("members").select("id, name, rank");
  // 운전병들의 휴가 (휴가 계산기의 실제 휴가·계획 + 불참 입력의 휴가) — 운전을 겹치지 않게 지정하려고 달력에 같이 보여 줌
  const driverIds = (drivers ?? []).map((d) => d.id as number);
  const rangeFrom = `${MIN_MONTH(today)}-01`;
  const rangeTo = addDays(`${shiftMonth(MAX_MONTH(today), 1)}-01`, -1);
  const leaveCols = "id, member_id, kind, start_date, end_date, absence_id";
  let lv = driverIds.length ? await db.from("leaves").select(`${leaveCols}, planned`).in("member_id", driverIds).lte("start_date", rangeTo).gte("end_date", rangeFrom) : { data: [], error: null };
  if (lv.error) lv = (await db.from("leaves").select(leaveCols).in("member_id", driverIds).lte("start_date", rangeTo).gte("end_date", rangeFrom)) as typeof lv; // 0013 전이면 계획 칸 없음
  const leaveRows = ((lv.data ?? []) as { id: number; member_id: number; kind: string; start_date: string; end_date: string; absence_id: number | null; planned?: boolean | null }[]).filter((r) => isFullLeave(r.kind));
  const linked = new Set(leaveRows.map((r) => r.absence_id).filter((x): x is number => x !== null)); // 휴가 계산기에서 이미 보낸 불참 기록은 중복 표시하지 않음
  const { data: absLeaves } = driverIds.length
    ? await db.from("absences").select("id, member_id, start_date, end_date").eq("kind", "leave").in("member_id", driverIds).lte("start_date", rangeTo).gte("end_date", rangeFrom)
    : { data: [] };
  const driverLeaves: CalLeave[] = [
    ...leaveRows.map((r) => ({ id: r.id, member_id: r.member_id, start_date: r.start_date, end_date: r.end_date, planned: r.planned === true })),
    ...(absLeaves ?? []).filter((a) => !linked.has(a.id as number)).map((a) => ({ id: 1_000_000 + (a.id as number), member_id: a.member_id as number, start_date: a.start_date as string, end_date: a.end_date as string, planned: false })),
  ];
  const info = new Map((all ?? []).map((m) => [m.id as number, m as { id: number; name: string; rank: string | null }]));
  const nm = (id: number) => {
    const m = info.get(id);
    return m ? `${m.rank ? `${m.rank} ` : ""}${m.name}` : "(알 수 없음)";
  };

  if (!duties.ok) {
    return (
      <Page title="운전 지정">
        <Notice kind="warn">운전 지정을 쓰려면 먼저 추가 SQL(supabase/migrations/0017_drive_duty.sql)을 Supabase SQL Editor에서 실행해 주세요.</Notice>
        <Link href="/home" className="mt-6 block text-center text-sm text-muted underline">
          돌아가기
        </Link>
      </Page>
    );
  }

  const names = Object.fromEntries((all ?? []).map((m) => [m.id as number, m.name as string])); // 달력 칸에는 이름만 (계급 생략)
  const toneOrder = (drivers ?? []).map((d) => d.id as number); // 사람별 색 배정 순서
  // 운전병 휴가 목록 (오늘 이후까지 걸친 것, 한 사람의 이어지는 휴가는 하나로 합침 / 실제와 계획은 따로)
  const leaveList = mergeConsecutive(driverLeaves.filter((l) => l.end_date >= today).map((l) => ({ key: l.member_id, start: l.start_date, end: l.end_date, planned: l.planned }))).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = duties.rows.filter((r) => r.end_date >= today); // 지정 목록은 오늘 이후까지 걸친 것만

  return (
    <Page title="운전 지정">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* ① 지정하기 */}
      <Card className="mt-3 p-4">
        <h2 className="mb-3 text-lg font-black">운전 지정하기</h2>
        {(drivers ?? []).length === 0 ? (
          <p className="text-sm text-muted">운전병이 없습니다. 관리자 메뉴 &gt; 인원 관리에서 운전병을 지정해 주세요.</p>
        ) : (
          <form action={addDriveDutyAction} className="flex flex-col gap-4">
            <select name="member_id" defaultValue={drivers!.some((d) => d.id === me.id) ? me.id : drivers![0].id} aria-label="운전할 사람" className={inputClass}>
              {drivers!.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.rank ? `${d.rank} ` : ""}
                  {d.name}
                  {d.id === me.id ? " (나)" : ""}
                </option>
              ))}
            </select>
            {/* 기간: 달력에서 처음 누른 날 = 시작일, 나중에 누른 날 = 종료일 (하루만이면 한 번만) */}
            <DateRangePicker defaultDate={tomorrow} />
            <button type="submit" className="min-h-12 w-full rounded-full bg-blue-600 px-4 text-base text-white">
              저장 (시작일 ~ 종료일)
            </button>
          </form>
        )}
        <p className="mt-3 text-xs text-muted">운전하는 날은 그날 1차 명단(1차탑승·예비)에서 빠지고, 홈에 &quot;내일 운전병&quot;으로 표시됩니다. 운전병과 관리자가 서로 수정할 수 있습니다.</p>
      </Card>

      {/* ② 달력: 이번 달 · 다음 달 */}
      <h2 className="mt-8 mb-2 text-lg font-black">운전 달력 · 운전병 휴가</h2>
      <DriveCalendar duties={duties.rows} leaves={driverLeaves} names={names} toneOrder={toneOrder} today={today} minMonth={MIN_MONTH(today)} maxMonth={MAX_MONTH(today)} />

      {/* ③ 운전병 휴가 목록 — 운전 지정과 따로 */}
      <h2 className="mt-8 mb-2 text-lg font-black">운전병 휴가 일정</h2>
      {leaveList.length === 0 ? (
        <p className="text-sm text-muted">앞으로 예정된 운전병 휴가가 없습니다.</p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {leaveList.map((l, i) => (
              <li key={`${l.key}-${l.start}-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${l.planned ? "border border-dashed border-orange-400 text-orange-700" : "border border-orange-200 bg-orange-100 text-orange-800"}`}>{l.planned ? "휴가 계획" : "휴가"}</span>
                <b>{nm(l.key as number)}</b>
                <span className="ml-auto tabular-nums text-foreground/80">{dotsRange(l.start, l.end)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ④ 운전 지정 목록 */}
      <h2 className="mt-8 mb-2 text-lg font-black">운전 지정 목록</h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">지정된 운전이 없습니다.</p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1 text-sm">
                  <b>{nm(r.member_id)}</b>
                  <span className="ml-2 tabular-nums text-foreground/80">{dotsRange(r.start_date, r.end_date)}</span>
                  {r.created_by !== null && r.created_by !== r.member_id && <span className="ml-1 text-xs text-muted">(입력: {nm(r.created_by)})</span>}
                </div>
                <form action={deleteDriveDutyAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="rounded border border-hairline px-2 py-1 text-xs">
                    삭제
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/home" className="mt-6 block text-center text-sm text-muted underline">
        돌아가기
      </Link>
    </Page>
  );
}
