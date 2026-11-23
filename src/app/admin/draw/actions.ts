"use server";
// ─────────────────────────────────────────────────────────────
// [한 달 차출하기] 서버 액션 (관리자 전용)
//   그 달 모든 근무일의 공석을 순번으로 한꺼번에 채웁니다. 한 달에 한 번만 실행됩니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { executeMonthlyDraw, isValidMonth } from "@/lib/monthly-draw-server";

export async function monthlyDrawAction(formData: FormData) {
  const me = await requireAdmin();
  const month = String(formData.get("month") ?? "");
  if (!isValidMonth(month)) redirect("/admin/draw");
  let kind: "msg" | "error" = "msg";
  let text: string;
  try {
    const r = await executeMonthlyDraw(month, me.id, formData.get("force") === "1"); // force = 투표 마감 전 차출
    if (r.status === "not-ready") {
      kind = "error";
      text = r.reason;
    } else if (r.status === "already") {
      text = "이미 차출이 끝난 달입니다. (결과는 한 번만 만들어집니다)";
    } else {
      const short = Object.values(r.shortage).reduce((a, b) => a + b, 0);
      text =
        `${month} 차출을 완료했습니다. ${r.days}일 · 순번으로 ${r.picked}명 뽑힘.` +
        (r.unassignedDong > 0 ? ` 동을 정해야 하는 사람 ${r.unassignedDong}명 → 각 날짜 [명단 수정]에서 배정해 주세요.` : "") +
        (short > 0 ? ` ⚠️ 인원 부족 ${short}명.` : "");
    }
  } catch (e) {
    kind = "error";
    text = e instanceof Error ? e.message : "차출 중 오류가 났습니다.";
  }
  revalidatePath("/admin/draw");
  revalidatePath("/home");
  redirect(`/admin/draw?month=${month}&${kind}=${encodeURIComponent(text)}`);
}
