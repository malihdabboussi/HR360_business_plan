import { servePlan } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  return servePlan(params.token, "ar");
}
