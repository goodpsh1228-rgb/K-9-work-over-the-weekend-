"use client";
// ─────────────────────────────────────────────────────────────
// 휴가·외출·면회 입력 칸
//   종류를 고르면 필요한 칸만 보입니다.
//   - 포상: 마일리지 / 가점,  연가: 일·이병 / 상병 / 병장 (지금 계급이 기본)
//   - 외출·면회: 날짜 하나만
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { LEAVE_KINDS, SUBKINDS } from "@/lib/leave";

const inputClass = "h-12 w-full rounded-full border border-hairline bg-input px-4 text-base text-foreground outline-none focus:border-blue-500";

export function LeaveForm({
  action,
  month,
  defaultAnnual,
  defaultDate,
  planned = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  month: string;
  defaultAnnual: string;
  defaultDate: string;
  planned?: boolean; // true 면 "휴가 계획" 입력 칸 (주말출근 제외 보내기 없음)
}) {
  const [kind, setKind] = useState("regular");
  const subs = SUBKINDS[kind];
  const oneDay = kind === "outing" || kind === "visit";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      {planned && <input type="hidden" name="planned" value="1" />}
      {/* 종류 버튼 */}
      <div className="grid grid-cols-4 gap-1.5">
        {LEAVE_KINDS.map((k) => (
          <label
            key={k.value}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-card text-center text-sm ${
              kind === k.value ? "border-2 border-blue-500 font-semibold" : "m-px border border-hairline"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value={k.value}
              checked={kind === k.value}
              onChange={() => setKind(k.value)}
              className="sr-only"
            />
            {k.label}
          </label>
        ))}
      </div>
      {/* 세부 종류 (포상·연가만) — key 를 바꿔 종류가 바뀌면 기본값으로 다시 그림 */}
      {subs && (
        <select key={kind} name="subkind" defaultValue={kind === "annual" ? defaultAnnual : subs[0].value} className={inputClass} aria-label="세부 종류">
          {subs.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} (한도 {s.quota}일)
            </option>
          ))}
        </select>
      )}
      {/* 날짜 */}
      <div className={oneDay ? "" : "grid grid-cols-2 gap-2"}>
        <label className="block text-xs text-zinc-500">
          {oneDay ? "날짜" : "시작일"}
          <input type="date" name="start_date" required defaultValue={defaultDate} className={`${inputClass} px-3! text-sm!`} />
        </label>
        {!oneDay && (
          <label className="block text-xs text-zinc-500">
            종료일
            <input type="date" name="end_date" required defaultValue={defaultDate} className={`${inputClass} px-3! text-sm!`} />
          </label>
        )}
      </div>
      <input name="memo" maxLength={100} placeholder="메모 (선택)" className={inputClass} />
      {!planned && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="send" defaultChecked className="h-4 w-4" />
          주말출근 추첨에서 제외되도록 바로 보내기
        </label>
      )}
      <button
        type="submit"
        className={`h-12 w-full rounded-full font-normal ${planned ? "border border-blue-600 text-link" : "bg-blue-600 text-white"}`}
      >
        {planned ? "계획 저장" : "저장"}
      </button>
    </form>
  );
}
