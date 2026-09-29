// ─────────────────────────────────────────────────────────────
// 인원 일괄 등록 — 목록 글(CSV 또는 표 붙여넣기)을 읽어서 검사하는 도구
//
// 받는 형식 (첫 줄은 제목 줄이어도 되고 없어도 됩니다)
//   이름, 초기비밀번호, 진료반 여부, 관리자 여부
//   홍길동, 1234, O, X
//   김철수, , X, X          ← 비밀번호를 비우면 기본 초기 비밀번호(1111)로 등록
//
// - 쉼표(,)로 구분된 CSV 와, 엑셀/Numbers 에서 표를 복사해 붙여넣은 글(칸 사이가 탭)을 모두 읽습니다.
// - "여부" 칸은 O/X, 예/아니오, Y/N, 1/0 등을 알아듣습니다. 빈칸은 "아니오"로 봅니다.
// 이 파일은 데이터베이스를 건드리지 않는 "순수 계산"만 하므로 따로 시험하기 쉽습니다.
// ─────────────────────────────────────────────────────────────

export type ImportRow = {
  line: number; // 원본 몇 번째 줄인지 (오류 안내용)
  name: string;
  password: string; // 빈 문자열이면 기본 초기 비밀번호(1111) 사용
  isClinic: boolean;
  isAdmin: boolean;
};

export type ParseResult = { rows: ImportRow[]; errors: string[] };

const YES = new Set(["o", "ㅇ", "○", "●", "v", "✓", "y", "yes", "예", "네", "true", "1"]);
const NO = new Set(["", "x", "ㅌ", "×", "n", "no", "아니오", "아니요", "false", "0", "-"]);

function parseYesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null; // 알아들을 수 없는 값
}

// 한 줄을 칸으로 나누기. 큰따옴표("...")로 감싼 칸 안의 구분자는 무시합니다.
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function parseMemberTable(text: string): ParseResult {
  const errors: string[] = [];
  const rows: ImportRow[] = [];

  // 줄 나누기 (윈도우/맥 줄바꿈 모두 처리), 맨 앞 BOM(보이지 않는 표시 문자) 제거
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  // 탭이 있으면 표 붙여넣기, 아니면 쉼표 CSV 로 판단
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";

  const seen = new Map<string, number>(); // 파일 안 이름 중복 검사용

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    if (rawLine.trim() === "") return; // 빈 줄은 건너뜀
    const cells = splitLine(rawLine, delimiter);
    if (cells.every((c) => c === "")) return; // 칸이 모두 비어 있으면 건너뜀

    // 제목 줄("이름"으로 시작)은 건너뜀
    if (index === 0 || rows.length === 0) {
      if (cells[0].replace(/\s/g, "") === "이름") return;
    }

    const [name = "", password = "", clinicRaw = "", adminRaw = ""] = cells;

    if (name === "") {
      errors.push(`${lineNo}번째 줄: 이름이 비어 있습니다.`);
      return;
    }
    if (name.length > 30) {
      errors.push(`${lineNo}번째 줄: 이름이 너무 깁니다(30자 이하).`);
      return;
    }
    if (seen.has(name)) {
      errors.push(`${lineNo}번째 줄: "${name}" 이(가) ${seen.get(name)}번째 줄과 겹칩니다. 동명이인은 홍길동A/홍길동B 처럼 구분해 주세요.`);
      return;
    }
    if (password !== "" && (password.length < 4 || password.length > 100)) {
      errors.push(`${lineNo}번째 줄: 초기 비밀번호는 4자 이상이어야 합니다(비우면 1111).`);
      return;
    }
    const isClinic = parseYesNo(clinicRaw);
    if (isClinic === null) {
      errors.push(`${lineNo}번째 줄: 진료반 여부 "${clinicRaw}" 를 알 수 없습니다(O 또는 X).`);
      return;
    }
    const isAdmin = parseYesNo(adminRaw);
    if (isAdmin === null) {
      errors.push(`${lineNo}번째 줄: 관리자 여부 "${adminRaw}" 를 알 수 없습니다(O 또는 X).`);
      return;
    }

    seen.set(name, lineNo);
    rows.push({ line: lineNo, name, password, isClinic, isAdmin });
  });

  if (rows.length === 0 && errors.length === 0) errors.push("등록할 인원이 없습니다.");
  if (rows.length > 200) errors.push("한 번에 200명까지만 등록할 수 있습니다.");
  return { rows, errors };
}

// 결과 파일(CSV) 만들기 — 엑셀에서 한글이 깨지지 않도록 BOM 을 앞에 붙입니다.
export function buildResultCsv(list: { name: string; password: string; generated: boolean }[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["이름,초기비밀번호,기본값사용"];
  for (const r of list) lines.push([esc(r.name), esc(r.password), r.generated ? "O" : "X"].join(","));
  return "﻿" + lines.join("\r\n");
}
