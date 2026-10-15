// ─────────────────────────────────────────────────────────────
// 라인업 (/lineup) — 그날 출근 인원표. 모든 인원이 볼 수 있음.
//   수기로 다시 옮겨 적는 표라서 "불참자"가 가장 크게·먼저 보이도록 만들었습니다.
//   ① 날짜 이동(어제/내일/오늘/날짜 선택) + 출근·불참 인원 수
//   ② 불참자: 사유별(휴가·교육·당직오프·근무오프·외진) 색 배지 + 상세 내용
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
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : today;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const l = await getLineup(date);
  const absentCount = new Set(l.absent.map((a) => a.id)).size;
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
          <Link href="/lineup" className="flex h-10 items-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white">
            오늘
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

      {/* ② 불참자 — 가장 눈에 띄게 */}
      <Card className="mt-4 overflow-hidden border-2 border-orange-400">
        <div className="flex items-center justify-between bg-orange-400 px-4 py-2.5 text-black">
          <p className="text-lg font-black">불참 {absentCount}명</p>
          <p className="text-xs font-semibold">휴가·교육·당직오프·근무오프·외진</p>
        </div>
        {l.absent.length === 0 ? (
          <p className="p-4 text-sm text-muted">이 날 불참자가 없습니다.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {LINEUP_ABSENT_KINDS.map((kind) => {
              const list = l.absent.filter((a) => a.kind === kind);
              if (!list.length) return null;
              return (
                <div key={kind} className="p-4">
                  <p className="mb-2 flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${KIND_BADGE[kind]}`}>{KIND_LABEL[kind]}</span>
                    <span className="text-sm font-semibold">{list.length}명</span>
                  </p>
                  <ul className="space-y-1.5">
                    {list.map((a) => (
                      <li key={`${a.id}-${a.start}`} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 text-base">
                          <b>{a.rank ? `${a.rank} ` : ""}{a.name}</b>
                          {a.detail && <span className="ml-1.5 text-sm text-foreground/80">· {a.detail}</span>}
                          {a.start !== a.end && (
                            <span className="ml-1.5 text-xs text-muted">
                              ({formatShort(a.start)}~{formatShort(a.end)})
                            </span>
                          )}
                        </span>
                        {deletable.has(`${a.id}:${a.kind}`) && (
                          <form action={deleteAbsenceAction}>
                            <input type="hidden" name="id" value={deletable.get(`${a.id}:${a.kind}`)} />
                            <input type="hidden" name="back" value={`/lineup?date=${date}`} />
                            <button type="submit" className="shrink-0 text-xs text-red-600 underline">
                              삭제
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 복사 */}
      <div className="mt-4">
        <CopyButton text={text} label="라인업 글 복사" />
      </div>

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
                <Names people={g.people} />
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
                <Names people={list} />
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

function Names({ people }: { people: LineupPerson[] }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-base">
      {people.map((p) => (
        <span key={p.id}>
          {p.name}
          {p.tag && <span className="ml-0.5 text-xs text-muted">({p.tag})</span>}
        </span>
      ))}
    </p>
  );
}
