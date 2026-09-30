"use client";
// ─────────────────────────────────────────────────────────────
// 내 계급 선택 드롭다운 (홈 화면) — 고르면 바로 저장
// 실제 저장은 서버 액션(updateMyRankAction)이 합니다.
// ─────────────────────────────────────────────────────────────
import { RANKS } from "@/lib/voting";

export function MyRankSelect({
  action,
  current,
}: {
  action: (formData: FormData) => void | Promise<void>;
  current: string | null;
}) {
  return (
    <form action={action} className="inline">
      <select
        name="rank"
        defaultValue={current ?? ""}
        aria-label="내 계급"
        // 값을 바꾸면 바로 저장
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {current === null && (
          <option value="" disabled>
            계급 선택
          </option>
        )}
        {RANKS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </form>
  );
}
