import { authorized } from "@/lib/config";
import { board } from "@/lib/service";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  try {
    return Response.json(await board(), { headers: noStore });
  } catch (e) {
    // Details go to the server log only, never to the caller.
    console.error("board failed", e);
    return Response.json({ error: "server error" }, { status: 500, headers: noStore });
  }
}
