"use client";
// ─────────────────────────────────────────────────────────────
// 투표 버튼 묶음 (브라우저 쪽)
//
// 누르는 순간 화면을 먼저 바꿔 보여 주고("낙관적 업데이트"), 저장은 뒤에서 합니다.
//   예) "관리 2동 희망"을 누르면 바로 ✓ 표시와 1/3명 → 2/3명이 보이고,
//       서버 저장이 끝나면 아래 희망자 이름 목록도 새로 그려집니다(새로고침 불필요).
//   저장이 실패하면 원래 상태로 돌아가고 빨간 안내가 뜹니다.
// ─────────────────────────────────────────────────────────────
import { useOptimistic, useState, useTransition } from "react";
import { voteAction, type VoteChoice } from "./actions";

type Mine = { kind: "want"; postId: number } | { kind: "decline" } | { kind: "none" };
type PostButton = { id: number; name: string; required: number; count: number };

export function VotePanel({
  date,
  isClinic,
  posts,
  initial,
}: {
  date: string;
  isClinic: boolean;
  posts: PostButton[];
  initial: Mine;
}) {
  // optimistic = 화면에 먼저 보여 줄 내 선택 (저장이 끝나면 서버 값으로 맞춰짐)
  const [optimistic, setOptimistic] = useOptimistic(initial);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  function send(choice: VoteChoice) {
    const next: Mine = choice.kind === "cancel" ? { kind: "none" } : choice;
    startTransition(async () => {
      setOptimistic(next); // ① 화면 먼저 바꾸기
      const result = await voteAction(date, choice); // ② 서버에 저장 (+ 화면 새로 그리기)
      setNotice(result); // ③ 결과 문구
    });
  }

  // 인원 수도 먼저 조정해서 보여 줌: 원래 내 선택 -1, 새 선택 +1
  const countFor = (p: PostButton) => {
    let c = p.count;
    if (initial.kind === "want" && initial.postId === p.id) c -= 1;
    if (optimistic.kind === "want" && optimistic.postId === p.id) c += 1;
    return c;
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {isClinic
          ? "출근을 희망하면 진료실 또는 원하는 동을 누르세요. (동을 고르면 그날 진료실 차출에서는 빠집니다)"
          : "출근을 희망하면 원하는 동을 누르세요."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {posts.map((p) => {
          const selected = optimistic.kind === "want" && optimistic.postId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => send({ kind: "want", postId: p.id })}
              className={`w-full rounded-lg px-2 py-3 text-sm font-semibold transition-colors ${
                selected ? "bg-blue-600 text-white" : "border border-blue-300 text-blue-700 dark:text-blue-300"
              }`}
            >
              {selected ? "✓ " : ""}
              {p.name} 희망
              <span className="block text-xs font-normal opacity-80">
                {countFor(p)}/{p.required}명
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => send({ kind: "decline" })}
        className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
          optimistic.kind === "decline" ? "bg-zinc-700 text-white" : "border border-zinc-300 dark:border-zinc-700"
        }`}
      >
        {optimistic.kind === "decline" ? "✓ " : ""}이날은 어려워요 (미희망)
      </button>
      {optimistic.kind !== "none" && (
        <button type="button" onClick={() => send({ kind: "cancel" })} className="w-full py-2 text-sm text-zinc-500 underline">
          응답 취소 (미응답으로 되돌리기)
        </button>
      )}
      {/* 저장 상태 안내 */}
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
