"use client";
// ─────────────────────────────────────────────────────────────
// 불참·제외 입력 폼 (홈 "빠른 불참 입력" · 라인업 · 불참 입력 화면에서 같이 씀)
//   크게 3칸으로 나눕니다.
//     ① 휴가         — 시작일 ~ 종료일 (상세는 선택)
//     ② 외출·면회    — 시작일 ~ 종료일 (보통 하루)
//     ③ 라인업 불참  — 시작일 ~ 종료일 + 사유를 직접 입력 (교육·외진·당직오프·근무오프 등 자유롭게)
//   부상은 3칸 아래에 따로 한 줄 버튼으로 둡니다 (라인업에는 출근, 주말출근 추첨에서만 제외).
//   전역 1개월 전 면제는 휴가 계산기에 입력한 전역일로 자동 적용되므로 여기서는 입력하지 않습니다.
// "use client": 종류를 바꾸면 입력칸이 바로 바뀌도록 브라우저에서 동작합니다.
// 실제 저장과 규칙 확인은 서버 액션(addAbsenceAction)이 합니다.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { DateRangePicker } from "./date-range-picker";

const inputClass =
  "h-12 min-w-0 w-full rounded-full border border-hairline bg-input px-4 text-base text-foreground outline-none focus:border-blue-500";

// 큰 3칸
const BIG = [
  { value: "leave", label: "휴가" },
  { value: "outing", label: "외출·면회" },
  { value: "lineup", label: "라인업 불참" },
] as const;

export function AbsenceForm({
  action,
  back,
  members,
  myId,
  defaultDate,
}: {
  action: (formData: FormData) => void | Promise<void>;
  back?: string; // 저장 후 돌아갈 화면 ("/home" 이면 홈으로)
  members?: { id: number; name: string }[]; // 관리자만: 대신 입력할 사람 목록
  myId?: number;
  defaultDate?: string; // 시작일·종료일 칸에 미리 넣을 날짜
}) {
  const [kind, setKind] = useState<string>("leave");
  const isLineup = kind === "lineup";

  return (
    <form action={action} className="flex flex-col gap-4">
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

      {/* 종류: 크게 3칸 + 바로 아래 부상 (둘 사이 간격은 좁게, 아래 날짜와는 넉넉하게) */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {BIG.map((k) => (
            <label
              key={k.value}
              className={`flex min-h-14 cursor-pointer items-center justify-center rounded-[18px] border-2 bg-card px-1 text-center text-base leading-tight font-bold ${
                kind === k.value ? "border-blue-500 text-link" : "border-transparent ring-1 ring-hairline"
              }`}
            >
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
              {k.label}
            </label>
          ))}
        </div>
        {/* 부상: 큰 3칸과 따로, 한 줄 전체 버튼 */}
        <label
          className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 bg-card px-3 text-center ${
            kind === "injury" ? "border-blue-500 text-link" : "border-transparent ring-1 ring-hairline"
          }`}
        >
          <input type="radio" name="kind" value="injury" checked={kind === "injury"} onChange={() => setKind("injury")} className="sr-only" />
          <span className="text-base font-bold">부상</span>
          <span className="text-xs text-muted">라인업엔 출근, 주말출근 추첨에서만 제외</span>
        </label>
      </div>

      {/* 기간: 달력에서 처음 누른 날 = 시작일, 나중에 누른 날 = 종료일 (하루만이면 한 번만) */}
      <DateRangePicker defaultDate={defaultDate} />

      {/* 라인업 불참은 사유를 직접 입력(필수), 나머지는 상세 내용(선택) */}
      <input
        name="detail"
        maxLength={100}
        required={isLineup}
        placeholder={isLineup ? "사유 입력 (예: 교육, 외진, 당직오프, 근무오프)" : "상세 내용 (선택)"}
        aria-label={isLineup ? "불참 사유" : "상세 내용"}
        className={`${inputClass} ${isLineup ? "border-blue-500" : ""}`}
      />

      <button type="submit" className="w-full min-h-12 rounded-full bg-blue-600 px-4 py-2 text-base font-normal text-white">
        저장 (시작일 ~ 종료일)
      </button>
    </form>
  );
}
