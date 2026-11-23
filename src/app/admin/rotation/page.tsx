// ─────────────────────────────────────────────────────────────
// 순번 현황 (/admin/rotation) — 관리자 전용
//   순번표(일반·진료실·운전)마다 지금 누구 차례인지 보여 줍니다.
//   · 빚이 있는 사람: 출근 가능한 날이 오면 가장 먼저 배정됩니다 (건너뛰었던 사람)
//   · 이번 바퀴 대기: 위에서부터 차례 (높은 기수순)
//   · 이번 바퀴 완료: 이미 근무했거나(자발 출근 포함) 건너뛴 사람
// ─────────────────────────────────────────────────────────────
import { requireAdmin } from "@/lib/session";
import { Notice, Page } from "@/components/ui";
import { getRotationBoards } from "@/lib/monthly-draw-server";

const TITLE = { general: "일반 (동)", clinic: "진료실 (진료반)", driver: "주말 운전 (운전병)" } as const;
const KIND = { served: "근무", volunteered: "자발 출근", skipped: "건너뜀" } as const;

export default async function RotationPage() {
  await requireAdmin();
  let boards: Awaited<ReturnType<typeof getRotationBoards>> | null = null;
  let error: string | null = null;
  try {
    boards = await getRotationBoards();
  } catch (e) {
    error = e instanceof Error ? e.message : "순번 현황을 불러오지 못했습니다.";
  }
  return (
    <Page title="순번 현황">
      <p className="-mt-4 mb-4 text-sm text-zinc-500">
        높은 기수부터 한 바퀴씩 돕니다. 못 하는 순번은 다음 사람에게 넘어가고 빚으로 남아, 다음에 먼저 배정됩니다.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="space-y-4">
        {boards?.map(({ pool, board, info, cohortOf }) => {
          const label = (id: number) => {
            const m = info.get(id);
            const c = cohortOf.get(id);
            return `${m?.rank ? `${m.rank} ` : ""}${m?.name ?? "?"}${c != null ? ` (${c}기)` : ""}`;
          };
          return (
            <section key={pool} className="rounded-[18px] border border-hairline bg-card p-4">
              <p className="flex justify-between font-semibold">
                <span>{TITLE[pool]}</span>
                <span className="text-sm text-muted">{board.cycle}바퀴째</span>
              </p>
              {board.debtors.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-orange-700">빚 있음 — 먼저 배정 ({board.debtors.length}명)</p>
                  <ul className="mt-1 text-sm">
                    {board.debtors.map((d) => (
                      <li key={d.memberId}>{label(d.memberId)} <span className="text-muted">· {d.debts}회 · {d.since.slice(5).replace("-", "/")}부터</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3">
                <p className="text-xs font-semibold text-blue-700">이번 바퀴 차례 ({board.waiting.length}명)</p>
                <ol className="mt-1 list-decimal pl-5 text-sm">
                  {board.waiting.map((id, i) => (
                    <li key={id} className={i === 0 ? "font-bold" : ""}>{label(id)}{i === 0 ? " ← 다음 차례" : ""}</li>
                  ))}
                  {board.waiting.length === 0 && <li className="list-none text-muted">모두 지나갔습니다. 다음 차출 때 새 바퀴가 시작됩니다.</li>}
                </ol>
              </div>
              {board.finished.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted">이번 바퀴 완료 ({board.finished.length}명)</summary>
                  <ul className="mt-1 text-sm text-muted">
                    {board.finished.map((f) => (
                      <li key={f.memberId}>{label(f.memberId)} · {KIND[f.kind]}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </Page>
  );
}
