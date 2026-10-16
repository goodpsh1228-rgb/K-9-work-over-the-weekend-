// 옛 주소(/admin/squads): 반·기수는 이제 인원 관리 목록에서 바로 지정합니다 → 인원 관리로 보냄
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

export default async function SquadsPage() {
  await requireAdmin();
  redirect("/admin/members");
}
