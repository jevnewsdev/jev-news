import { getTokenCa } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ ca: await getTokenCa() });
}
