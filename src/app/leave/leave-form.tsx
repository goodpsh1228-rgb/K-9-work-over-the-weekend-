"use client";
// ─────────────────────────────────────────────────────────────
// 휴가·외출·면회 입력 칸 (하나의 폼)
//   맨 위 스위치로 "실제 휴가"와 "휴가 계획" 중 하나를 고릅니다.
//   - 실제 휴가: 확정된 기록. 사용 현황에 반영, "주말출근 추첨에서 제외" 체크박스가 보임
//   - 휴가 계획: 참고용. 달력에 점선으로만 표시되고 추첨·사용 현황에는 영향 없음 (planned=1 로 전송)
//   종류를 고르면 필요한 칸만 보입니다.
//   - 포상: 마일리지 / 가점,  연가: 일·이병 / 상병 / 병장 (지금 계급이 기본)
//   - 외출·면회: 날짜 하나만
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { isFullLeave, LEAVE_KINDS, SUBKINDS } from "@/lib/leave";
import { dotsRange, spansOverlap } from "@/lib/spans";

const inputClass = "h-12 min-w-0 w-full rounded-full border border-hairline bg-input px-4 text-base text-foreground outline-none focus:border-blue-500";

export function LeaveForm({
  action,
  month,
  defaultAnnual,
  defaultDate,
  planSupported = true,
  squad = null,
  mates = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  month: string;
  defaultAnnual: string;
  defaultDate: string;
  planSupported?: boolean; // false 면 계획 스위치를 숨김 (SQL 0013 전)
  squad?: string | null; // 내 반 (없으면 겹침 안내 대신 "반 지정" 안내)
  mates?: { id: number; name: string; rank: string | null; start: string; end: string; planned: boolean }[]; // 같은 반 사람들의 휴가·계획
}) {
  const [mode, setMode] = useState<"actual" | "plan">("actual");
  const [kind, setKind] = useState("regular");
  const subs = SUBKINDS[kind];
  const oneDay = kind === "outing" || kind === "visit";
  const planned = planSupported && mode === "plan";
  // 지금 고른 기간과 같은 반 사람들의 휴가가 겹치는지 (고르는 즉시 미리 보여 줌)
  const [range, setRange] = useState<{ start: string; end: string }>({ start: defaultDate, end: defaultDate });
  const showOverlap = isFullLeave(kind);
  const hits = mates.filter((l) => spansOverlap(range, l));
  const hitPeople = new Set(hits.map((h) => h.id)).size;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      {planned && <input type="hidden" name="planned" value="1" />}

      {/* 실제 휴가 / 휴가 계획 스위치 */}
      {planSupported && (
        <div role="tablist" aria-label="입력 종류" className="grid grid-cols-2 rounded-full bg-hairline/50 p-1 text-sm font-semibold">
          {(
            [
              ["actual", "실제 휴가"],
              ["plan", "휴가 계획"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`h-10 rounded-full ${mode === value ? "bg-blue-600 text-white" : "text-foreground/70"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-500">
        {planned
          ? "아직 확정되지 않은 계획입니다. 달력에 점선으로만 보이고, 사용 현황·주말출근 추첨에는 반영되지 않습니다. 확정되면 아래 \"이 달 계획\"에서 \"실제로 확정\"을 누르세요."
          : "이미 확정된(다녀왔거나 승인된) 기록입니다. 사용 현황에 반영되고, 주말출근 추첨에서 뺄 수 있습니다."}
      </p>

      {/* 종류 버튼 */}
      <div className="grid grid-cols-4 gap-1.5">
        {LEAVE_KINDS.map((k) => (
          <label
            key={k.value}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-card text-center text-sm ${
              kind === k.value ? "border-2 border-blue-500 font-semibold" : "m-px border border-hairline"
            }`}
          >
            <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
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
      {/* 날짜: 달력에서 시작일 → 종료일 순서로 누름 (외출·면회는 하루만 한 번 누름) */}
      <DateRangePicker key={oneDay ? "one" : "range"} defaultDate={defaultDate} single={oneDay} onChange={(a, b) => setRange({ start: a, end: b })} />
      {/* 같은 반 휴가 겹침 미리보기 (휴가 종류일 때) */}
      {showOverlap &&
        (squad ? (
          hits.length === 0 ? (
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">✓ {squad}에서 이 기간에 겹치는 사람 없음</p>
          ) : (
            <div className="rounded-[11px] bg-orange-50 p-2.5 text-sm text-orange-900 dark:bg-orange-950 dark:text-orange-100">
              <p className="font-bold">
                ⚠️ {squad} {hitPeople}명과 휴가가 겹칩니다
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {hits.map((h, i) => (
                  <li key={i}>
                    {h.rank ?? ""} <b>{h.name}</b> {dotsRange(h.start, h.end)} {h.planned ? "휴가 희망" : "휴가"}
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <p className="text-xs text-muted">반이 지정되면 같은 반 사람과 휴가가 겹치는지 바로 보여 드려요. (관리자가 반을 지정합니다)</p>
        ))}
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
