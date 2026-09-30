"use client";
// ─────────────────────────────────────────────────────────────
// 주말 운전 희망 버튼 (운전병만 보임) — 동 희망과 따로
//   누르면 켜짐(✓ 희망) / 다시 누르면 꺼짐. 화면을 먼저 바꾸고 저장은 뒤에서 합니다.
// ─────────────────────────────────────────────────────────────
import { useOptimistic, useState, useTransition } from "react";
import { driveVoteAction } from "./actions";

export function DrivePanel({
  date,
  initial,
  count,
  required,
}: {
  date: string;
  initial: boolean; // 지금 운전 희망 중인지
  count: number; // 운전 희망자 수
  required: number; // 운전 정원
}) {
  const [on, setOn] = useOptimistic(initial);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  function toggle() {
    startTransition(async () => {
      setOn(!on); // ① 화면 먼저
      setNotice(await driveVoteAction(date, !on)); // ② 저장
    });
  }
  const shown = count - (initial ? 1 : 0) + (on ? 1 : 0);

  return (
    <div className="mt-3 rounded-lg border border-orange-200 p-2 dark:border-orange-900">
      <button
        type="button"
        onClick={toggle}
        className={`w-full rounded-lg px-2 py-3 text-sm font-semibold transition-colors ${
          on ? "bg-orange-600 text-white" : "border border-orange-300 text-orange-700 dark:text-orange-300"
        }`}
      >
        {on ? "✓ " : ""}🚗 주말 운전 희망
        <span className="block text-xs font-normal opacity-80">
          {shown}/{required}명
        </span>
      </button>
      <p className="mt-1 text-xs text-zinc-500">
        동 출근과 따로 뽑습니다(같은 날 함께 가능). 운전 희망자가 없으면 운전병 중 랜덤으로 1명을 뽑습니다.
      </p>
      <p role="status" className="min-h-5 text-center text-sm">
        {isPending ? (
          <span className="text-zinc-500">저장 중…</span>
        ) : notice ? (
          <span className={notice.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}>{notice.message}</span>
        ) : null}
      </p>
    </div>
  );
}
