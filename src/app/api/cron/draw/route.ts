// ─────────────────────────────────────────────────────────────
// 정기 실행 주소 (/api/cron/draw) — Vercel Cron 이 매일 밤 부릅니다.
//   추첨은 더 이상 자동으로 하지 않습니다(관리자가 [주말출근 차출하기]를 눌러야 함).
//   여기서는 계급 자동 진급·전역 자동 비활성화만 하고, 차출을 기다리는 날짜 목록(pending)을 알려 줍니다.
//
// 보안: 요청에 "Authorization: Bearer <CRON_SECRET>" 이 있어야만 실행합니다.
//   Vercel 은 환경변수 CRON_SECRET 이 설정돼 있으면 이 값을 자동으로 붙여서 부릅니다.
//   그래서 주소를 아는 외부 사람이 마음대로 불러도 거부됩니다.
// 여러 번 불려도 같은 일을 반복할 뿐 안전합니다.
// ─────────────────────────────────────────────────────────────
import { createHash, timingSafeEqual } from "node:crypto";
import { getPendingDrawDates } from "@/lib/draw-server";
import { syncServiceStatusSafely } from "@/lib/service-sync";

// 두 글자를 길이·시간 차이 없이 비교 (추측 공격 방지)
function sameSecret(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) {
    return Response.json({ ok: false, error: "CRON_SECRET 이 설정되지 않았거나 16자 미만입니다." }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!sameSecret(auth, `Bearer ${secret}`)) {
    return Response.json({ ok: false, error: "권한 없음" }, { status: 401 });
  }
  try {
    await syncServiceStatusSafely({ force: true }); // 계급 자동 진급·전역 자동 비활성화
    const pending = await getPendingDrawDates(); // 마감됐지만 아직 관리자가 차출하지 않은 날짜 (추첨은 하지 않음)
    return Response.json({ ok: true, pending, drawn: [] });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
