// ─────────────────────────────────────────────────────────────
// 라인업 (/lineup) — 그날 출근 인원표. 모든 인원이 볼 수 있음.
//   수기로 다시 옮겨 적는 표라서 "불참자"가 가장 크게·먼저 보이도록 만들었습니다.
//   ① 날짜 이동(어제/내일/오늘/날짜 선택) + 출근·불참 인원 수
//   ② 불참자: 높은 기수부터 한 줄씩(이름·기수 / 날짜·사유 배지·상세), 이 날부터 새로 불참인 사람은 붉게 표시
//   ③ 출근자: 평일은 계급별, 주말·공휴일은 자리(동)별 (부상·외출·면회는 출근, 꼬리표만)
//   ④ 라인업 글 복사 / 이 날 불참 입력(본인, 관리자는 다른 사람도)
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Card, Notice, Page } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { AbsenceForm } from "@/components/absence-form";
import { addAbsenceAction, deleteAbsenceAction } from "@/app/absences/actions";
import { addDays, formatLong, formatShort, isValidDate, todayKST } from "@/lib/kst";
import { getLineup, lineupText, RANK_ORDER, rankIndex, type LineupPerson } from "@/lib/lineup";
import { KIND_BADGE, KIND_LABEL, LINEUP_ABSENT_KINDS } from "@/lib/absence-kinds";

export default async function LineupPage({ searchParams }: PageProps<"/lineup">) {
  const me = await requireMember();
  const sp = await searchParams;
  const today = todayKST();
  const tomorrow = addDays(today, 1); // 날짜를 고르지 않으면 내일 라인업 (전날 미리 확인·수기 입력용)
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : tomorrow;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const l = await getLineup(date);
  const absentCount = new Set(l.absent.map((a) => a.id)).size;
  const newCount = new Set(l.absent.filter((a) => a.isNew).map((a) => a.id)).size; // 이 날부터 새로 불참인 사람
  const first = new Set(l.boarding.map((p) => p.id)); // 1차탑승 표시용
  const text = lineupText(date, formatShort(date), l);
  const { data: members } = me.is_admin
    ? await getSupabaseAdmin().from("members").select("id, name").eq("is_active", true).order("name")
    : { data: null };
  // 내 불참 기록 중 이 날에 걸린 것 (본인은 여기서 바로 삭제 가능, 관리자는 전부)
  const { data: delRows } = await getSupabaseAdmin()
    .from("absences")
    .select("id, member_id, kind")
    .lte("start_date", date)
    .gte("end_date", date)
    .in("kind", [...LINEUP_ABSENT_KINDS]);
  const deletable = new Map<string, number>(); // "인원번호:종류" → 기록 번호
  for (const r of delRows ?? []) if (me.is_admin || r.member_id === me.id) deletable.set(`${r.member_id}:${r.kind}`, r.id as number);

  return (
    <Page title="라인업">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      {/* ① 날짜 이동 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Link href={`/lineup?date=${addDays(date, -1)}`} className="flex h-11 items-center rounded-full border border-hairline bg-card px-4 text-sm font-semibold text-link">
          ‹ 어제
        </Link>
        <div className="text-center">
          <p className="text-lg font-semibold tracking-[-0.02em]">{formatLong(date)}</p>
          <p className="text-xs text-muted">{l.isDutyDay ? `주말·공휴일 근무일${l.dutyLabel ? ` · ${l.dutyLabel}` : ""}` : "평일"}</p>
        </div>
        <Link href={`/lineup?date=${addDays(date, 1)}`} className="flex h-11 items-center rounded-full border border-hairline bg-card px-4 text-sm font-semibold text-link">
          내일 ›
        </Link>
      </div>
      <form action="/lineup" className="mt-2 flex items-center gap-2">
        <input type="date" name="date" defaultValue={date} aria-label="날짜 선택" className="h-10 min-w-0 flex-1 rounded-full border border-hairline bg-input px-4 text-sm" />
        <button type="submit" className="h-10 rounded-full border border-blue-600 px-4 text-sm font-semibold text-link">
          이동
        </button>
        {date !== today && (
          <Link href={`/lineup?date=${today}`} className="flex h-10 items-center rounded-full border border-blue-600 px-4 text-sm font-semibold text-link">
            오늘
          </Link>
        )}
        {date !== tomorrow && (
          <Link href="/lineup" className="flex h-10 items-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white">
            내일
          </Link>
        )}
      </form>

      {/* 인원 수 요약 (어두운 타일) */}
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[18px] bg-tile text-center text-white">
        <div className="py-5">
          <p className="text-4xl font-black tabular-nums">{l.isDutyDay && !l.drawn ? "-" : l.presentCount}</p>
          <p className="mt-1 text-sm text-white/70">출근</p>
        </div>
        <div className="border-l border-white/15 py-5">
          <p className={`text-4xl font-black tabular-nums ${absentCount ? "text-orange-400" : ""}`}>{absentCount}</p>
          <p className="mt-1 text-sm text-white/70">불참</p>
        </div>
      </div>

      {/* ② 불참자 — 가장 눈에 띄게. 높은 기수부터 한 줄씩(이름·기수 / 날짜·사유). 전날은 출근이었다가 이 날부터 새로 불참인 사람은 붉은색 */}
      <Card className="mt-4 overflow-hidden border-2 border-orange-400">
        <div className="bg-orange-400 px-4 py-2.5 text-black">
          <div className="flex items-center justify-between">
            <p className="text-lg font-black">불참 {absentCount}명</p>
            <p className="text-xs font-semibold">높은 기수 순</p>
          </div>
          {newCount > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
              <span className="inline-block size-2.5 rounded-full bg-rose-600" /> 새로 불참 {newCount}명 (전날은 출근)
            </p>
          )}
        </div>
        {l.absent.length === 0 ? (
          <p className="p-4 text-sm text-muted">이 날 불참자가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {l.absent.map((a) => {
              // 사유: "라인업 불참"은 직접 쓴 사유만, 나머지는 종류(+상세)
              const reason = a.kind === "lineup" ? (a.detail ?? "불참") : `${KIND_LABEL[a.kind]}${a.detail ? `·${a.detail}` : ""}`;
              const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
              return (
                <li
                  key={`${a.id}-${a.kind}-${a.start}`}
                  className={`flex items-center gap-2 border-l-4 px-3 py-1.5 text-sm ${a.isNew ? "border-rose-600 bg-rose-50 dark:bg-rose-950" : "border-transparent"}`}
                >
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">{a.cohort ?? ""}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <b>
                      {a.rank ? `${a.rank} ` : ""}
                      {a.name}
                    </b>
                    {a.isNew && <span className="ml-1 rounded bg-rose-600 px-1 py-0.5 text-[10px] font-bold text-white">신규</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-foreground/80">{a.start === a.end ? md(a.start) : `${md(a.start)}~${md(a.end)}`}</span>
                  <span className={`max-w-[34%] shrink-0 truncate rounded-full px-2 py-0.5 text-xs font-bold ${KIND_BADGE[a.kind]}`}>{reason}</span>
                  {deletable.has(`${a.id}:${a.kind}`) && (
                    <form action={deleteAbsenceAction} className="shrink-0">
                      <input type="hidden" name="id" value={deletable.get(`${a.id}:${a.kind}`)} />
                      <input type="hidden" name="back" value={`/lineup?date=${date}`} />
                      <button type="submit" aria-label={`${a.name} 불참 삭제`} className="px-1 text-xs text-red-600">
                        ✕
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 복사 */}
      <div className="mt-4">
        <CopyButton text={text} label="라인업 글 복사" />
      </div>

      {/* 1차탑승 — 그날 출근자 중 높은 기수 9명 */}
      {l.boardingSupported && (l.isDutyDay ? l.drawn : true) && (
        <>
          <h2 className="mt-8 mb-2 flex items-baseline justify-between text-xl font-black tracking-[-0.02em]">
            <span>1차탑승 {l.boarding.length}명</span>
            <span className="text-xs font-normal text-muted">그날 출근자 중 높은 기수 순</span>
          </h2>
          {l.boarding.length === 0 ? (
            <Notice kind="warn">기수가 입력된 출근자가 없습니다. 홈에서 각자 기수를 입력해 주세요.</Notice>
          ) : (
            <Card className="overflow-hidden border-2 border-blue-600">
              <ul className="divide-y divide-hairline">
                {l.boarding.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                    <span className="flex-1 text-base">
                      <b>{p.rank ? `${p.rank} ` : ""}{p.name}</b>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-link">{p.cohort}기</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {l.reserve.length > 0 && (
            <Card className="mt-2 overflow-hidden">
              <p className="bg-hairline/40 px-4 py-1.5 text-xs font-bold text-muted">예비 {l.reserve.length}명 (탑승자가 빠질 때 순서대로)</p>
              <ul className="divide-y divide-hairline">
                {l.reserve.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-blue-600 text-[11px] font-bold text-link">예{i + 1}</span>
                    <span className="flex-1 text-base">
                      <b>{p.rank ? `${p.rank} ` : ""}{p.name}</b>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-muted">{p.cohort}기</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {l.noCohort > 0 && <p className="mt-2 text-xs text-muted">출근자 중 기수 미입력 {l.noCohort}명은 1차탑승 선정에서 빠집니다. 같은 기수가 9명 컷에 걸리면 날짜마다 정해진 무작위로 뽑습니다.</p>}
        </>
      )}

      {/* ③ 출근자 */}
      <h2 className="mt-8 mb-2 text-xl font-black tracking-[-0.02em]">
        출근 {l.isDutyDay && !l.drawn ? "" : `${l.presentCount}명`}
      </h2>
      {l.isDutyDay ? (
        l.drawn ? (
          <Card className="divide-y divide-hairline">
            {l.byPost.length === 0 && <p className="p-4 text-sm text-muted">확정된 출근자가 없습니다.</p>}
            {l.byPost.map((g) => (
              <div key={g.post} className="p-4">
                <p className="mb-1.5 text-sm font-semibold text-muted">
                  {g.post} ({g.people.length}명)
                </p>
                <Names people={g.people} first={first} />
              </div>
            ))}
          </Card>
        ) : (
          <Notice kind="warn">아직 추첨 전입니다. 주말·공휴일은 추첨이 끝나면 확정된 출근자가 여기에 나옵니다.</Notice>
        )
      ) : (
        <Card className="divide-y divide-hairline">
          {[...RANK_ORDER, null].map((rank) => {
            const list = l.present.filter((p) => (rank === null ? rankIndex(p.rank) === RANK_ORDER.length : p.rank === rank));
            if (!list.length) return null;
            return (
              <div key={rank ?? "none"} className="p-4">
                <p className="mb-1.5 text-sm font-semibold text-muted">
                  {rank ?? "계급 미지정"} ({list.length}명)
                </p>
                <Names people={list} first={first} />
              </div>
            );
          })}
        </Card>
      )}
      <p className="mt-2 text-xs text-muted">부상·외출·면회는 출근으로 보고 이름 옆에 작게 표시합니다.</p>

      {/* ④ 이 날 불참 입력 */}
      <details className="mt-8 rounded-[18px] border border-hairline bg-card p-4">
        <summary className="cursor-pointer text-base font-semibold">＋ {formatShort(date)} 불참 입력</summary>
        <div className="mt-3">
          <AbsenceForm
            action={addAbsenceAction}
            back={`/lineup?date=${date}`}
            defaultDate={date}
            myId={me.id}
            members={me.is_admin ? (members ?? []).map((m) => ({ id: m.id as number, name: m.name as string })) : undefined}
          />
        </div>
      </details>
    </Page>
  );
}

function Names({ people, first }: { people: LineupPerson[]; first: Set<number> }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-base">
      {people.map((p) => (
        <span key={p.id}>
          {p.name}
          {first.has(p.id) && <span className="ml-1 rounded bg-blue-600 px-1 text-[10px] font-bold text-white">1차</span>}
          {p.tag && <span className="ml-0.5 text-xs text-muted">({p.tag})</span>}
        </span>
      ))}
    </p>
  );
}
