// ─────────────────────────────────────────────────────────────
// 변경 이력(audit_logs) 을 사람이 읽기 쉬운 한국어로 바꾸는 도구
//   action 코드 → 이름,  details(상세 내용) → 한 줄 설명
// ─────────────────────────────────────────────────────────────
import { KIND_LABEL } from "./absence-kinds";

const LABELS: Record<string, string> = {
  "auth.locked": "로그인 차단(5회 실패)",
  "auth.password_change": "비밀번호 변경",
  "emergency.recover": "비상 관리자 복구",
  "member.import": "인원 일괄 등록",
  "member.add": "인원 추가",
  "member.rank": "계급 변경",
  "member.rank_self": "계급 변경(본인)",
  "member.clinic": "진료반 변경",
  "member.driver": "운전병 변경",
  "member.delete": "인원 삭제",
  "member.deactivate": "인원 비활성화",
  "member.activate": "인원 재활성화",
  "member.reset_password": "비밀번호 초기화",
  "member.grant_admin": "관리자 지정",
  "member.revoke_admin": "관리자 권한 내려놓기",
  "dutyday.add": "공휴일(근무일) 추가",
  "dutyday.remove": "근무 없음 처리",
  "dutyday.restore": "근무일 되돌리기",
  "dutyday.post_counts": "날짜별 인원 변경",
  "absence.add": "제외 기간 입력",
  "absence.delete": "제외 기간 삭제",
  "draw.run": "추첨 실행",
  "roster.add": "명단에 추가",
  "roster.remove": "명단에서 삭제",
  "roster.replace": "명단 교체",
};

export function actionLabel(action: string): string {
  return LABELS[action] ?? action;
}

const KIND = KIND_LABEL;
const TRIGGER = { cron: "자동(정기)", visit: "자동(접속 시)", manual: "관리자 수동" } as Record<string, string>;

// 상세 내용 한 줄 요약 (모르는 형식이면 짧게 줄인 원문)
export function detailText(action: string, d: Record<string, unknown>): string {
  const s = (v: unknown) => (v === null || v === undefined ? "-" : String(v));
  switch (action) {
    case "member.import":
      return `${s(d.count)}명`;
    case "member.rank":
    case "member.rank_self":
      return `${s(d.name)}: ${s(d.from ?? "미지정")} → ${s(d.to ?? "미지정")}`;
    case "member.clinic":
      return `${s(d.name)}: ${d.to ? "진료반으로" : "진료반 해제"}`;
    case "member.driver":
      return `${s(d.name)}: ${d.to ? "운전병으로" : "운전병 해제"}`;
    case "member.add":
      return `${s(d.name)}${d.rank ? ` (${d.rank})` : ""}${d.is_clinic ? " · 진료반" : ""}${d.is_driver ? " · 운전병" : ""}`;
    case "member.delete":
    case "member.deactivate":
    case "member.activate":
    case "member.reset_password":
    case "member.grant_admin":
    case "member.revoke_admin":
      return s(d.name);
    case "dutyday.add":
      return d.note ? s(d.note) : "";
    case "dutyday.post_counts": {
      const changes = (d.changes ?? {}) as Record<string, { from: number; to: number }>;
      const parts = Object.entries(changes).map(([k, v]) => `${k} ${v.from}→${v.to}`);
      return parts.length ? parts.join(", ") : "기본값으로";
    }
    case "absence.add": {
      const cancelled = Array.isArray(d.cancelled_wants) && d.cancelled_wants.length ? ` · 희망 ${d.cancelled_wants.length}건 자동 취소` : "";
      return `${KIND[s(d.kind)] ?? s(d.kind)} ${s(d.start_date)} ~ ${s(d.end_date)}${cancelled}`;
    }
    case "absence.delete":
      return `${KIND[s(d.kind)] ?? s(d.kind)} ${s(d.start_date)} ~ ${s(d.end_date)}`;
    case "draw.run": {
      const short = (d.shortage ?? {}) as { clinic?: number; general?: number; driver?: number };
      const total = (short.clinic ?? 0) + (short.general ?? 0) + (short.driver ?? 0);
      return `${TRIGGER[s(d.trigger)] ?? s(d.trigger)} · ${s(d.assigned)}명 배정${total ? ` · 부족 ${total}명` : ""}`;
    }
    case "roster.add":
      return `${s(d.name)} → ${s(d.post)}${d.excluded ? " (휴가·부상 중)" : ""}`;
    case "roster.remove":
      return `${s(d.name)} (${s(d.post)})`;
    case "roster.replace":
      return `${s(d.post)}: ${s(d.from)} → ${s(d.to)}${d.excluded ? " (휴가·부상 중)" : ""}`;
    default: {
      const text = JSON.stringify(d);
      return text === "{}" ? "" : text.slice(0, 80);
    }
  }
}
