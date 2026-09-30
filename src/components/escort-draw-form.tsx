// ─────────────────────────────────────────────────────────────
// 선탑 뽑기 칸 (관리자) — 근무일 화면과 명단 수정 화면에서 같이 씁니다.
//   그날 출근자(동·진료실) 중 대상자를 체크 → 버튼 → 그 안에서 랜덤 1명
//   returnTo: 뽑은 뒤 돌아갈 화면 ("day" = 근무일 화면, "roster" = 명단 수정)
// ─────────────────────────────────────────────────────────────
type Worker = { memberId: number; name: string; rank: string | null };

export function EscortDrawForm({
  date,
  workers,
  action,
  returnTo,
  note,
}: {
  date: string;
  workers: Worker[];
  action: (formData: FormData) => void | Promise<void>;
  returnTo: "day" | "roster";
  note?: string;
}) {
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {workers.map((w) => (
          <label key={w.memberId} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="candidate_ids" value={w.memberId} className="h-4 w-4" />
            {w.rank ? `${w.rank} ` : ""}
            {w.name}
          </label>
        ))}
      </div>
      <button type="submit" className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
        🎲 체크한 사람 중 랜덤으로 선탑 정하기
      </button>
      <p className="text-xs text-zinc-500">{note ?? "다시 누르면 다시 뽑습니다."}</p>
    </form>
  );
}

// 선탑 대상자 후보 = 그날 동·진료실 출근자 (한 사람 한 번, 계급 높은 순 → 가나다)
const RANKS_DESC = ["병장", "상병", "일병", "이병"];
export function escortWorkers<T extends Worker & { postId: number }>(roster: T[], workPostIds: Set<number>): Worker[] {
  const rankIdx = (r: string | null) => (r && RANKS_DESC.includes(r) ? RANKS_DESC.indexOf(r) : 9);
  const unique = new Map<number, Worker>();
  for (const r of roster) if (workPostIds.has(r.postId)) unique.set(r.memberId, { memberId: r.memberId, name: r.name, rank: r.rank });
  return [...unique.values()].sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || a.name.localeCompare(b.name, "ko"));
}
