import { getTokenCa, getTotals } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [ca, totals] = await Promise.all([getTokenCa(), getTotals()]);
  return Response.json({ ca, totals });
}
