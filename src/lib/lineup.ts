// ─────────────────────────────────────────────────────────────
// 라인업(그날 출근 인원표) 데이터 만들기 (서버 전용)
//   - 평일·휴일 구분 없이 어느 날짜든 볼 수 있음
//   - 불참 = 그날을 포함한 기간의 휴가·교육·당직오프·근무오프·외진 기록 (사유·상세 내용 포함)
//   - 출근:
//       · 평일(근무일 아님)        → 활성 인원 전체에서 불참자를 뺀 사람 (부상·외출·면회는 출근, 꼬리표만 붙임)
//       · 주말·공휴일(근무일)      → 추첨으로 확정된 출근자 (추첨 전이면 "추첨 전")
//   - 주말·공휴일에도 불참 기록이 있는 사람은 불참 목록에 보임(수기 입력 때 참고)
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./supabase-server";
import { addDays } from "./kst";
import { dotsRange } from "./spans";
import { getDutyDays } from "./duty-days-server";
import { isLineupAbsent } from "./absence-kinds";
import { pickBoardingWithReserve } from "./squads";

export type LineupPerson = { id: number; name: string; rank: string | null; cohort: number | null; tag?: string };
export type LineupAbsent = LineupPerson & { kind: string; detail: string | null; start: string; end: string; isNew: boolean }; // isNew: 전날은 출근이었는데 이 날부터 새로 불참
export type Lineup = {
  isDutyDay: boolean;
  dutyLabel: string | null;
  drawn: boolean;
  absent: LineupAbsent[]; // 불참자 (종류 순서 → 이름 순)
  present: LineupPerson[]; // 출근자 (평일)
  byPost: { post: string; people: LineupPerson[] }[]; // 출근자 자리별 (주말·공휴일, 추첨 후)
  presentCount: number;
  detailSupported: boolean;
  boarding: LineupPerson[]; // 1차탑승: 그날 출근자 중 높은 기수 9명 (기수 순)
  reserve: LineupPerson[]; // 1차탑승 예비 2명 (다음 순위)
  boardingSupported: boolean; // 기수 칸(SQL 0015)이 있는지
  noCohort: number; // 출근자 중 기수를 아직 입력하지 않은 사람 수
};

export const RANK_ORDER = ["병장", "상병", "일병", "이병"];
export const rankIndex = (r: string | null) => (r && RANK_ORDER.includes(r) ? RANK_ORDER.indexOf(r) : RANK_ORDER.length);
export const byRankName = (a: { rank: string | null; name: string }, b: { rank: string | null; name: string }) =>
  rankIndex(a.rank) - rankIndex(b.rank) || a.name.localeCompare(b.name, "ko");

export async function getLineup(date: string): Promise<Lineup> {
  const db = getSupabaseAdmin();
  // 상세 내용 칸(SQL 0014)이 아직 없으면 상세 없이 읽음
  let detailSupported = true;
  const prevDate = addDays(date, -1); // 전날(새로 불참이 된 사람을 가리기 위해 함께 읽음)
  let abs = await db.from("absences").select("member_id, kind, detail, start_date, end_date").lte("start_date", date).gte("end_date", prevDate);
  if (abs.error) {
    detailSupported = false;
    abs = (await db.from("absences").select("member_id, kind, start_date, end_date").lte("start_date", date).gte("end_date", prevDate)) as typeof abs;
  }
  // 기수 칸(SQL 0015)이 아직 없으면 기수 없이 읽음
  let boardingSupported = true;
  let mem = await db.from("members").select("id, name, rank, cohort").eq("is_active", true);
  if (mem.error) {
    boardingSupported = false;
    mem = (await db.from("members").select("id, name, rank").eq("is_active", true)) as typeof mem;
  }
  const [dutyDays, { data: draw }, { data: assigns }, { data: posts }] = await Promise.all([
    getDutyDays(date, date),
    db.from("draws").select("duty_date").eq("duty_date", date).maybeSingle(),
    db.from("assignments").select("member_id, post_id").eq("duty_date", date),
    db.from("posts").select("id, name, sort_order").order("sort_order"),
  ]);
  const person = new Map(
    (mem.data ?? []).map((m) => [
      m.id as number,
      { id: m.id as number, name: m.name as string, rank: (m.rank as string | null) ?? null, cohort: ((m as { cohort?: number | null }).cohort ?? null) as number | null },
    ]),
  );
  const rows = (abs.data ?? []) as { member_id: number; kind: string; detail?: string | null; start_date: string; end_date: string }[];

  const absent: LineupAbsent[] = [];
  const absentIds = new Set<number>();
  const tagOf = new Map<number, string>();
  // 전날에도 불참이던 사람 (이 날 "새로 불참"이 아닌 사람)
  const prevAbsent = new Set(rows.filter((r) => isLineupAbsent(r.kind) && r.start_date <= prevDate && prevDate <= r.end_date).map((r) => r.member_id));
  for (const r of rows) {
    if (!(r.start_date <= date && date <= r.end_date)) continue; // 이 날을 포함하는 기록만
    const p = person.get(r.member_id);
    if (!p) continue;
    if (isLineupAbsent(r.kind)) {
      absentIds.add(p.id);
      absent.push({ ...p, kind: r.kind, detail: r.detail ?? null, start: r.start_date, end: r.end_date, isNew: !prevAbsent.has(p.id) });
    } else if (r.kind === "injury") tagOf.set(p.id, "부상");
    else if (r.kind === "outing") tagOf.set(p.id, "외출·면회");
  }
  // 높은 기수(작은 숫자)부터, 기수가 같거나 없으면 계급·이름 순
  absent.sort((a, b) => (a.cohort ?? 99999) - (b.cohort ?? 99999) || byRankName(a, b) || a.start.localeCompare(b.start));

  const isDutyDay = dutyDays.length > 0;
  const drawn = Boolean(draw);
  const withTag = (p: { id: number; name: string; rank: string | null; cohort: number | null }): LineupPerson => ({ ...p, tag: tagOf.get(p.id) });

  let present: LineupPerson[] = [];
  const byPost: Lineup["byPost"] = [];
  if (!isDutyDay) {
    present = [...person.values()].filter((p) => !absentIds.has(p.id)).map(withTag).sort(byRankName);
  } else if (drawn) {
    const postName = new Map((posts ?? []).map((p) => [p.id as number, p.name as string]));
    const bucket = new Map<number, LineupPerson[]>();
    for (const a of assigns ?? []) {
      const p = person.get(a.member_id as number);
      if (!p) continue;
      const list = bucket.get(a.post_id as number) ?? [];
      list.push(withTag(p));
      bucket.set(a.post_id as number, list);
    }
    for (const po of posts ?? []) {
      const list = bucket.get(po.id as number);
      if (list?.length) byPost.push({ post: postName.get(po.id as number)!, people: list.sort(byRankName) });
    }
  }
  const presentCount = isDutyDay ? new Set((assigns ?? []).map((a) => a.member_id)).size : present.length;
  // 그날 출근자 전체(주말·공휴일은 여러 자리에 걸친 사람을 한 번만) 중 1차탑승 선정
  const everyone = isDutyDay ? [...new Map(byPost.flatMap((g) => g.people).map((p) => [p.id, p])).values()] : present;
  const picked = boardingSupported ? pickBoardingWithReserve(everyone, date) : { boarding: [], reserve: [] };
  const byCohort = (a: LineupPerson, b: LineupPerson) => (a.cohort ?? 0) - (b.cohort ?? 0) || a.name.localeCompare(b.name, "ko");
  const boarding = [...picked.boarding].sort(byCohort);
  const reserve = [...picked.reserve].sort(byCohort);
  const noCohort = everyone.filter((p) => p.cohort === null).length;
  return { isDutyDay, dutyLabel: dutyDays[0]?.label ?? null, drawn, absent, present, byPost, presentCount, detailSupported, boarding, reserve, boardingSupported, noCohort };
}

// 카카오톡·수기 입력용 글
export function lineupText(date: string, shortDate: string, l: Lineup): string {
  const nm = (p: LineupPerson) => (p.rank ? `${p.rank} ${p.name}` : p.name);
  const lines = [`[${shortDate} 라인업] 출근 ${l.presentCount}명 / 불참 ${new Set(l.absent.map((a) => a.id)).size}명`];
  lines.push(`■ 불참 (높은 기수 순${l.absent.some((x) => x.isNew) ? ", ★=새로 불참" : ""})`);
  if (l.absent.length === 0) lines.push("- 없음");
  for (const a of l.absent) {
    const reason = `${KIND_TEXT[a.kind] ?? a.kind}${a.detail ? `(${a.detail})` : ""}`;
    lines.push(`- ${a.isNew ? "★" : ""}${a.cohort ? `${a.cohort}기 ` : ""}${nm(a)} ${dotsRange(a.start, a.end)} ${reason}`);
  }
  if (l.boarding.length) {
    lines.push(`■ 1차탑승 (${l.boarding.length}명)`);
    for (const p of l.boarding) lines.push(`- ${p.cohort}기 ${nm(p)}`);
  }
  if (l.reserve.length) {
    lines.push(`■ 1차탑승 예비 (${l.reserve.length}명)`);
    for (const p of l.reserve) lines.push(`- ${p.cohort}기 ${nm(p)}`);
  }
  lines.push("■ 출근");
  if (l.isDutyDay) {
    if (!l.drawn) lines.push("- 추첨 전");
    for (const g of l.byPost) lines.push(`${g.post}: ${g.people.map((p) => nm(p) + (p.tag ? `(${p.tag})` : "")).join(", ")}`);
  } else {
    for (const rank of [...RANK_ORDER, null]) {
      const names = l.present.filter((p) => (rank === null ? rankIndex(p.rank) === RANK_ORDER.length : p.rank === rank)).map((p) => p.name + (p.tag ? `(${p.tag})` : ""));
      if (names.length) lines.push(`${rank ?? "계급 미지정"} : ${names.join(", ")}`);
    }
  }
  void date;
  return lines.join("\n");
}
const KIND_TEXT: Record<string, string> = { leave: "휴가", training: "교육", duty_off: "당직오프", work_off: "근무오프", outpatient: "외진", lineup: "기타 불참" };
