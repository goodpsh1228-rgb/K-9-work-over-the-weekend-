// ─────────────────────────────────────────────────────────────
// 라인업 불참 표시용: 이어서 쓰는 불참(휴가 종류가 바뀌어도)을 한 사람 한 줄로 합치는 순수 계산
//   예) 위로휴가 11/24~11/28 + 포상휴가 11/29~12/2 → "11/24~12/2  위로휴가 → 포상휴가"
//   · 하루라도 겹치거나 바로 이어지는(끝난 다음 날 시작) 기록은 같은 기간으로 봅니다.
//   · 같은 사유는 한 번만 보여 줍니다. ("휴가·휴가" 처럼 종류 이름과 상세 내용이 같으면 "휴가" 한 번)
// ─────────────────────────────────────────────────────────────
import { addDays } from "./kst";
import { KIND_LABEL } from "./absence-kinds";

export type AbsRec = { kind: string; detail?: string | null; start: string; end: string };

// 기록 하나의 사유 문구
//   · 라인업 불참(직접 입력): 적은 사유 그대로
//   · 그 밖: 종류 이름. 상세 내용이 있으면 덧붙이되, 종류 이름과 같거나 이미 포함하면 중복하지 않음
export function reasonOf(kind: string, detail?: string | null): string {
  const d = (detail ?? "").trim();
  if (kind === "lineup") return d || "불참";
  const label = KIND_LABEL[kind] ?? kind;
  if (!d || d === label) return label;
  if (d.includes(label)) return d; // 예: 종류 "휴가" + 상세 "위로휴가" → "위로휴가"
  return `${label}·${d}`;
}

// date 를 포함하는 연속 불참 기간 하나로 합치기 (없으면 null)
export function mergeAbsenceChain(recs: AbsRec[], date: string): { start: string; end: string; kind: string; reason: string } | null {
  const sorted = [...recs].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : 1));
  // 이어지는 기록끼리 묶기
  const chains: AbsRec[][] = [];
  let curEnd = "";
  for (const r of sorted) {
    const last = chains[chains.length - 1];
    if (last && r.start <= addDays(curEnd, 1)) {
      last.push(r);
      if (r.end > curEnd) curEnd = r.end;
    } else {
      chains.push([r]);
      curEnd = r.end;
    }
  }
  const chain = chains.find((c) => c.some((r) => r.start <= date && date <= r.end));
  if (!chain) return null;
  const reasons: string[] = [];
  for (const r of chain) {
    const t = reasonOf(r.kind, r.detail);
    if (!reasons.includes(t)) reasons.push(t); // 같은 사유는 한 번만 (시작일 순서 유지)
  }
  // 색(배지)은 그 날을 포함하는 기록의 종류를 따름
  const covering = chain.filter((r) => r.start <= date && date <= r.end);
  return {
    start: chain.reduce((m, r) => (r.start < m ? r.start : m), chain[0].start),
    end: chain.reduce((m, r) => (r.end > m ? r.end : m), chain[0].end),
    kind: covering[covering.length - 1].kind,
    reason: reasons.join(" → "),
  };
}
