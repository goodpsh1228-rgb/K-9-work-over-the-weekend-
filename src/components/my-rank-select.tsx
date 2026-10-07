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
        className="h-8 rounded-full border border-hairline bg-card px-3 text-sm text-foreground"
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
