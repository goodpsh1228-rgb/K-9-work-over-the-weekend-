// ─────────────────────────────────────────────────────────────
// 선탑 규칙대로 다시 뽑기 칸 (관리자) — 근무일 화면과 명단 수정 화면에서 같이 씁니다.
//   규칙: 그날 운전병보다 기수가 같거나 높은 출근자 중 랜덤 1명 (추첨이 끝나면 자동으로 한 번 뽑힘)
//   plan: 지금 기준 운전병·대상자 요약 (서버에서 계산해 넘겨 줌)
// ─────────────────────────────────────────────────────────────
export function EscortAutoForm({
  date,
  action,
  returnTo,
  plan,
}: {
  date: string;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: "day" | "roster";
  plan: { drivers: { name: string; cohort: number | null }[]; refCohort: number | null; pool: { name: string; cohort: number | null }[]; reason: string | null };
}) {
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="return_to" value={returnTo} />
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        <b>선탑 규칙</b>: 그날 운전병보다 기수가 <b>같거나 높은</b> 출근자 중 랜덤 1명. 추첨이 끝나면 자동으로 정해집니다.
      </p>
      {plan.drivers.length > 0 && (
        <p className="text-xs">
          기준 운전병: {plan.drivers.map((d) => `${d.name}${d.cohort ? `(${d.cohort}기)` : "(기수 없음)"}`).join(", ")}
          {plan.refCohort !== null && (
            <>
              {" "}
              → {plan.refCohort}기 이상 대상 <b>{plan.pool.length}명</b>
              {plan.pool.length > 0 && <span className="text-zinc-500"> ({plan.pool.map((p) => `${p.name} ${p.cohort}기`).join(", ")})</span>}
            </>
          )}
        </p>
      )}
      {plan.reason && <p className="text-xs font-semibold text-red-600">{plan.reason}</p>}
      <button type="submit" className="min-h-11 w-full rounded-full bg-blue-600 px-3 py-2 text-base font-normal text-white">
        규칙대로 선탑 다시 뽑기
      </button>
    </form>
  );
}
