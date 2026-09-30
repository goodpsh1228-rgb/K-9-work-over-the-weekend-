"use client";
// ─────────────────────────────────────────────────────────────
// 제외 기간 입력 폼 (홈 맨 위 · 휴가·부상 화면에서 같이 씀)
//   종류: 휴가 / 부상 / 외출·면회 → 시작일 ~ 종료일 입력
//         전역 1개월 전 면제      → 전역일만 입력 (한 달 전부터 자동 계산)
// "use client": 종류를 바꾸면 입력칸이 바로 바뀌도록 브라우저에서 동작합니다.
// 실제 저장과 규칙 확인은 서버 액션(addAbsenceAction)이 합니다.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { ABSENCE_KINDS, dischargeRange } from "@/lib/absence-kinds";
import { formatShort } from "@/lib/kst";

const inputClass =
  "min-w-0 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function AbsenceForm({
  action,
  back,
  members,
  myId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  back?: string; // 저장 후 돌아갈 화면 ("/home" 이면 홈으로)
  members?: { id: number; name: string }[]; // 관리자만: 대신 입력할 사람 목록
  myId?: number;
}) {
  const [kind, setKind] = useState<string>("leave");
  const [discharge, setDischarge] = useState("");
  const isDischarge = kind === "discharge";

  return (
    <form action={action} className="space-y-2">
      {back && <input type="hidden" name="back" value={back} />}
      {members && (
        <select name="member_id" defaultValue={myId} aria-label="누구" className={inputClass}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.id === myId ? " (나)" : ""}
            </option>
          ))}
        </select>
      )}

      {/* 종류 선택 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {ABSENCE_KINDS.map((k) => (
          <label key={k.value} className="flex items-center gap-1">
            <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
            {k.label}
          </label>
        ))}
      </div>

      {/* 날짜 입력: 전역 면제는 전역일 하나, 나머지는 시작~종료 */}
      {isDischarge ? (
        <div className="space-y-1">
          <label className="block text-xs text-zinc-500">
            전역일
            <input
              type="date"
              name="end_date"
              required
              value={discharge}
              onChange={(e) => setDischarge(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <p className="text-xs text-zinc-500">
            {discharge
              ? `${formatShort(dischargeRange(discharge).start)} ~ ${formatShort(discharge)} 동안 제외됩니다.`
              : "전역일 한 달 전부터 전역일까지 자동으로 제외됩니다."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="start_date" required aria-label="시작일" className={inputClass} />
          <input type="date" name="end_date" required aria-label="종료일" className={inputClass} />
        </div>
      )}

      <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
        {isDischarge ? "저장 (전역일 기준)" : "저장 (시작일 ~ 종료일)"}
      </button>
    </form>
  );
}
