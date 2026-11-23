// ─────────────────────────────────────────────────────────────
// 간부 홈 화면 — 간부 계정(관리자 기능 + 병사 기능 없음)용
//   간부는 주말출근·순번·기수·전역일·휴가 계산기 대상이 아니라서, 관리·확인에 필요한 것만 보여 줍니다.
//     맨 위: 라인업 · 반별 휴가 TO → 안내(차출 대기·확정 명단 확인) → 순번 현황·한 달 차출·미리보기 → 주말출근 현황(날짜 → 명단 수정)
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import { Card, Notice, Page } from "@/components/ui";
import { Chip } from "@/components/chip";
import { getDutyDays, homeRange } from "@/lib/duty-days-server";
import { getDayBoard } from "@/lib/day-board";
import { votingStatus } from "@/lib/voting";
import { getLineup } from "@/lib/lineup";
import { getPendingMonths, getRosterConflicts, type RosterConflict } from "@/lib/monthly-draw-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { addDays, formatShort, todayKST } from "@/lib/kst";
import type { Member } from "@/lib/session";

export async function OfficerHome({ me, msg, error }: { me: Member; msg: string | null; error: string | null }) {
  const { from, to } = homeRange();
  const today = todayKST();
  const now = new Date();
  const days = await getDutyDays(from, to);
  const [{ data: drawRows }, pendingMonths, conflicts, lineup] = await Promise.all([
    getSupabaseAdmin().from("draws").select("duty_date, clinic_shortage, general_shortage").gte("duty_date", from).lte("duty_date", to),
    getPendingMonths(today, now).catch(() => [] as string[]),
    getRosterConflicts(today).catch(() => [] as RosterConflict[]),
    getLineup(addDays(today, 1)).catch(() => null),
  ]);
  const drawn = new Map((drawRows ?? []).map((d) => [d.duty_date as string, d]));
  // 날짜별 희망 현황: 희망 확정 인원 / 순번·희망으로 채울 정원 (동·진료실 기준)
  const rows = await Promise.all(
    days.map(async (d) => {
      const board = await getDayBoard(d.date);
      const work = board.posts.filter((p) => p.pool === "general" || p.pool === "clinic");
      const need = work.reduce((s, p) => s + p.required, 0);
      const wanted = work.reduce((s, p) => s + Math.min(p.required, p.wanters.length), 0);
      return { date: d.date, label: d.label, need, wanted, status: votingStatus(d.date, false, now), draw: drawn.get(d.date) ?? null };
    }),
  );
  // 달별로 묶기
  const months: { key: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const m = months.find((x) => x.key === key) ?? (months[months.push({ key, items: [] }) - 1]);
    m.items.push(r);
  }
  const card = "flex items-center justify-between gap-3 rounded-[18px] border border-hairline bg-card px-5 py-4";

  return (
    <Page title={`${me.name} 님`}>
      <div className="-mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Chip tone="solid">간부</Chip>
        <span className="text-xs text-muted">관리자 기능을 쓸 수 있고, 주말출근·순번 대상은 아닙니다.</span>
      </div>
      <div className="space-y-3">
        {msg && <div className="mt-3"><Notice kind="success">{msg}</Notice></div>}
        {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
      </div>

      {/* ① 맨 위: 라인업 · 반별 휴가 TO (간부가 가장 자주 보는 것) */}
      <div className="mt-4 space-y-2">
        <Link href={`/lineup?date=${addDays(today, 1)}`} className={card}>
          <span><b className="block text-base">라인업</b><span className="text-xs text-muted">내일 출근·불참 인원표</span></span>
          <span className="shrink-0 text-sm text-muted">
            {lineup ? <>출근 {lineup.presentCount}명 · 불참 {new Set(lineup.absent.map((a) => a.id)).size}명 ›</> : "›"}
          </span>
        </Link>
        <Link href="/admin/leave-to" className={card}>
          <span><b className="block text-base">반별 휴가 TO</b><span className="text-xs text-muted">반마다 휴가 희망·확정 인원, 가장 많이 겹치는 날</span></span>
          <span aria-hidden>›</span>
        </Link>
      </div>

      {/* 관리자 안내: 한 달 차출 대기 / 확정 뒤 출근 불가 */}
      {pendingMonths.length > 0 && (
        <div className="mt-3 rounded-[18px] border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm font-black text-red-600">한 달 차출 대기 {pendingMonths.length}달</p>
          <p className="mt-2 flex flex-wrap gap-2">
            {pendingMonths.map((m) => (
              <Link key={m} href={`/admin/draw?month=${m}`} className="rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">
                {Number(m.slice(5))}월 차출하기 ›
              </Link>
            ))}
          </p>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="mt-3 rounded-[18px] border border-orange-300 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950/30">
          <p className="text-sm font-black text-orange-700">확정 명단 확인 필요 {conflicts.length}건</p>
          <p className="mt-0.5 text-xs text-muted">확정된 뒤 출근이 어려워진 사람입니다. 명단 수정에서 교체해 주세요.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.map((c) => (
              <li key={`${c.date}-${c.memberId}`} className="flex items-center justify-between gap-2">
                <span>{formatShort(c.date)} · <b>{c.name}</b> <span className="text-muted">({c.post} · {c.reason})</span></span>
                <Link href={`/admin/roster/${c.date}`} className="shrink-0 text-link underline">교체</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ② 그 밖의 바로가기: 순번 현황 · 한 달 차출 */}
      <div className="mt-4 space-y-2">
        <Link href="/admin/rotation" className={card}>
          <span><b className="block text-base">순번 현황</b><span className="text-xs text-muted">다음 차례, 빚(건너뛴 사람), 이번 바퀴 진행</span></span>
          <span aria-hidden>›</span>
        </Link>
        <Link href="/admin/draw" className={card}>
          <span><b className="block text-base">한 달 차출 · 미리보기</b><span className="text-xs text-muted">순번으로 공석을 채우는 결과를 미리 보고 실행</span></span>
          <span aria-hidden>›</span>
        </Link>
      </div>

      {/* ③ 주말출근 투표 현황 + 출근 인원 변경(날짜 → 명단 수정) */}
      <h2 className="mt-8 mb-2 text-[26px] leading-[1.14] font-display font-black tracking-[-0.02em]">주말출근 현황</h2>
      <p className="mb-3 text-xs text-muted">날짜를 누르면 희망 현황을 보고, 차출이 끝난 날은 [명단 수정]으로 출근 인원을 바꿀 수 있습니다.</p>
      {months.length === 0 && <p className="text-sm text-muted">표시할 근무일이 없습니다.</p>}
      <div className="space-y-5">
        {months.map((m) => (
          <div key={m.key}>
            <p className="mb-2 px-1 text-lg font-black tracking-[-0.02em]">{Number(m.key.slice(5))}월</p>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-hairline">
                {m.items.map((r) => (
                  <li key={r.date} className="flex items-center justify-between gap-3 px-4 py-3">
                    <Link href={`/day/${r.date}`} className="min-w-0 flex-1">
                      <span className="block text-base font-semibold tracking-[-0.02em]">{formatShort(r.date)}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.draw ? "추첨 완료" : r.status === "open" ? "투표 중" : r.status === "closed" ? "투표 마감 · 차출 대기" : "투표 예정"}
                        {r.label && r.label !== "주말" ? ` · ${r.label}` : ""}
                        {" · "}희망 {r.wanted}/{r.need}명
                      </span>
                    </Link>
                    {r.draw ? (
                      <Link href={`/admin/roster/${r.date}`} className="shrink-0 rounded-full border border-blue-600 px-3 py-1 text-xs font-semibold text-link">
                        명단 수정
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-muted">›</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ))}
      </div>

      <nav className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        <Link href="/admin" className="font-semibold text-foreground">관리자 메뉴</Link>
        <Link href="/change-password">비밀번호 변경</Link>
        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-muted underline">로그아웃</button>
        </form>
      </nav>
    </Page>
  );
}
