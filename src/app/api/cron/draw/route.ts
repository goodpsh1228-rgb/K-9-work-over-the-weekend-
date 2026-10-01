// ─────────────────────────────────────────────────────────────
// 자동 추첨 주소 (/api/cron/draw) — Vercel Cron 이 매일 밤 부릅니다.
//
// 보안: 요청에 "Authorization: Bearer <CRON_SECRET>" 이 있어야만 실행합니다.
//   Vercel 은 환경변수 CRON_SECRET 이 설정돼 있으면 이 값을 자동으로 붙여서 부릅니다.
//   그래서 주소를 아는 외부 사람이 마음대로 불러도 거부됩니다.
// 여러 번 불려도 이미 추첨된 날은 건너뛰므로 결과는 날짜마다 하나입니다(멱등성).
// ─────────────────────────────────────────────────────────────
import { createHash, timingSafeEqual } from "node:crypto";
import { runPendingDraws } from "@/lib/draw-server";
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
    const result = await runPendingDraws("cron");
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
