// ─────────────────────────────────────────────────────────────
// 공휴일 목록 붙여넣기 읽기 (순수 계산)
//   천문연구원 월력요항·달력 사이트 등에서 복사한 글을 한 줄씩 읽습니다.
//   알아듣는 날짜 모양 (뒤에 이름):
//     2028-01-01 신정 / 2028.1.1 신정 / 2028/01/01(토) 신정 / 2028년 1월 26일 설날
//   이름이 없으면 "공휴일"로 적습니다. 날짜가 없는 줄은 건너뜁니다.
// ─────────────────────────────────────────────────────────────
import { isValidDate } from "./kst";

const LINE = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*(?:\([^)]*\))?\s*[:\-–·,]?\s*(.*)$/;

export function parseHolidayList(text: string): { rows: { date: string; name: string }[]; errors: string[] } {
  const rows: { date: string; name: string }[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(LINE);
    if (!m) return; // 제목 줄 등 날짜가 없는 줄
    const date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (!isValidDate(date)) {
      errors.push(`${i + 1}번째 줄: "${line}" 날짜가 올바르지 않습니다.`);
      return;
    }
    if (seen.has(date)) return;
    seen.add(date);
    rows.push({ date, name: (m[4] ?? "").trim().slice(0, 50) || "공휴일" });
  });
  return { rows, errors };
}
