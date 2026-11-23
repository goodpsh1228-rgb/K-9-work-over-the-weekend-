// ─────────────────────────────────────────────────────────────
// 한 달 차출 미리보기 (/admin/draw/preview) — 관리자 전용, 저장하지 않음
//   지금 데이터로 차출하면 누가 어느 날 뽑히는지, 누가 건너뛰어 빚이 생기는지 날짜별로 보여 줍니다.
//   · 뽑힌 사람 옆 [이 날 빼기]: 그 사람을 그날 순번에서 빼고(빚 기록) 다음 순번으로 다시 계산
//   · 맨 아래 [이 결과로 차출하기]: 미리보기와 같은 값(seed)으로 실제 차출 (희망자 초과 추첨까지 같은 결과)
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { Notice, Page } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { formatShort, todayKST, weekday } from "@/lib/kst";
import { isValidMonth, newSeed, previewMonthlyDraw, type PreviewPerson } from "@/lib/monthly-draw-server";
import { excludeFromDayAction, monthlyDrawAction, undoExcludeAction } from "../actions";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const POOL = { general: "일반 (동 랜덤 배정)", clinic: "진료실", driver: "주말 운전" } as const;

export default async function PreviewPage({ searchParams }: PageProps<"/admin/draw/preview">) {
  await requireAdmin();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isValidMonth(sp.month) ? sp.month : null;
  if (!month) redirect("/admin/draw");
  const seed = typeof sp.seed === "string" ? sp.seed.replace(/[^0-9a-z]/g, "").slice(0, 40) : "";
  if (!seed) redirect(`/admin/draw/preview?month=${month}&seed=${newSeed()}`); // 같은 결과를 재현하기 위한 값 고정
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const pv = await previewMonthlyDraw(month, seed);
  // 미리보기에서 관리자가 이 날 뺀 사람 (되돌리기용)
  const dates = pv.days.map((d) => d.date);
  const { data: excused } = dates.length
    ? await getSupabaseAdmin().from("absences").select("id, member_id, start_date").eq("kind", "excused").in("start_date", dates)
    : { data: [] };
  const { data: names } = await getSupabaseAdmin().from("members").select("id, name");
  const nameOf = new Map((names ?? []).map((m) => [m.id as number, m.name as string]));

  const label = (p: PreviewPerson) => `${p.rank ? `${p.rank} ` : ""}${p.name}${p.cohort != null ? ` (${p.cohort}기)` : ""}`;
  const canRun = !pv.executedAt && pv.stillVoting === 0 && pv.days.length > 0;
  const totalPicks = pv.days.reduce((s, d) => s + d.picks.length, 0);
  const totalShort = pv.days.reduce((s, d) => s + d.shortage, 0);

  return (
    <Page title="차출 미리보기">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        {month.replace("-", "년 ")}월 · 저장되지 않습니다. 결과가 이상한 사람은 [이 날 빼기]로 바꿔 보세요.
      </p>
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {pv.executedAt && <Notice kind="warn">이 달은 이미 차출했습니다. 미리보기는 참고용입니다.</Notice>}
        {pv.stillVoting > 0 && !pv.executedAt && (
          <Notice kind="warn">아직 투표가 끝나지 않은 날이 {pv.stillVoting}일 있습니다. 지금 결과는 현재까지의 응답 기준입니다. 마감 후에 차출할 수 있어요.</Notice>
        )}
      </div>

      <section className="mt-3 rounded-[18px] border border-hairline bg-card p-4 text-sm">
        <p>차출 대상 <b>{pv.days.length}일</b> · 순번으로 <b>{totalPicks}명</b> 뽑힘{totalShort > 0 && <span className="text-red-600"> · 인원 부족 {totalShort}명</span>}</p>
        {pv.skippedPast > 0 && <p className="mt-1 text-muted">이미 지난 날 {pv.skippedPast}일은 제외됩니다.</p>}
        <p className="mt-1 text-xs text-muted">희망자가 정원보다 많은 자리는 랜덤으로 정해지는데, 아래 [이 결과로 차출하기]는 이 미리보기와 같은 결과로 실행됩니다.</p>
      </section>

      <div className="mt-3 space-y-3">
        {pv.days.map((d) => {
          const dayExcused = (excused ?? []).filter((e) => e.start_date === d.date);
          return (
            <section key={d.date} className="rounded-[18px] border border-hairline bg-card">
              <p className="flex justify-between border-b border-hairline px-3 py-2 text-sm font-semibold">
                <span>{formatShort(d.date)} ({DOW[weekday(d.date)]})</span>
                <span className={d.shortage > 0 ? "text-red-600" : "text-muted"}>{d.shortage > 0 ? `인원 부족 ${d.shortage}` : "충족"}</span>
              </p>
              <div className="space-y-2 px-3 py-2 text-sm">
                {d.wanted.length > 0 && (
                  <p><b className="text-blue-700">희망 확정</b> {d.wanted.map((w) => `${w.name}(${w.post})`).join(", ")}</p>
                )}
                {(["general", "clinic", "driver"] as const).map((pool) => {
                  const rows = d.picks.filter((x) => x.pool === pool);
                  if (rows.length === 0) return null;
                  return (
                    <div key={pool}>
                      <p className="text-xs font-semibold text-orange-700">순번 · {POOL[pool]}</p>
                      <ul className="mt-1 divide-y divide-hairline">
                        {rows.map((x) => (
                          <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
                            <span>{label(x)}{x.post && <span className="text-muted"> · {x.post}</span>}</span>
                            {!pv.executedAt && (
                              <form action={excludeFromDayAction}>
                                <input type="hidden" name="month" value={month} />
                                <input type="hidden" name="seed" value={seed} />
                                <input type="hidden" name="date" value={d.date} />
                                <input type="hidden" name="member_id" value={x.id} />
                                <ConfirmButton message={`${x.name} 을(를) ${formatShort(d.date)} 순번에서 뺄까요? 다음 순번 사람이 대신 뽑히고, ${x.name}은(는) 빚으로 기록되어 다음에 먼저 배정됩니다.`} className="shrink-0 rounded border border-red-300 px-2 py-1 text-xs text-red-700">
                                  이 날 빼기
                                </ConfirmButton>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {d.skips.length > 0 && (
                  <p className="text-xs text-muted"><b>건너뜀(빚)</b> {d.skips.map((x) => `${x.name}(${POOL[x.pool].split("(")[0]})`).join(", ")}</p>
                )}
                {d.rested.length > 0 && <p className="text-xs text-muted"><b>정원 초과로 쉼</b> {d.rested.map((x) => x.name).join(", ")}</p>}
                {dayExcused.length > 0 && (
                  <div className="border-t border-hairline pt-2">
                    <p className="text-xs text-muted">관리자가 이 날 뺀 사람</p>
                    {dayExcused.map((e) => (
                      <form key={e.id} action={undoExcludeAction} className="flex items-center justify-between gap-2 text-sm">
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="seed" value={seed} />
                        <input type="hidden" name="absence_id" value={e.id} />
                        <span>{nameOf.get(e.member_id as number) ?? "?"}</span>
                        {!pv.executedAt && <button type="submit" className="text-xs text-link underline">되돌리기</button>}
                      </form>
                    ))}
                  </div>
                )}
                {d.picks.length === 0 && d.wanted.length === 0 && <p className="text-muted">이 날은 배정 대상이 없습니다.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {canRun && (
        <form action={monthlyDrawAction} className="mt-4">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="seed" value={seed} />
          <ConfirmButton
            message={`이 미리보기 결과로 ${month} 한 달치를 차출합니다. 한 번만 실행되고 되돌릴 수 없습니다. 진행할까요?`}
            className="min-h-12 w-full rounded-full bg-red-600 px-[22px] text-base font-semibold text-white"
          >
            이 결과로 차출하기
          </ConfirmButton>
        </form>
      )}
      <Link href={`/admin/draw?month=${month}`} className="mt-6 block text-center text-sm text-zinc-500 underline">한 달 차출 화면으로</Link>
      <p className="mt-2 text-center text-xs text-zinc-400">오늘 {todayKST()}</p>
    </Page>
  );
}
