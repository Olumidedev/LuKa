import { NextResponse } from "next/server";
import { AIError } from "@/lib/ai/gateway";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export { clientIp };

/** Signed-in users only, plus a per-IP burst limit. */
export async function guard(req: Request): Promise<{ user: { id: string; isAdmin: boolean } } | { res: NextResponse }> {
  if (!rateLimit(`ai:${clientIp(req)}`, 8)) return { res: NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 }) };
  const user = await requireUser(req);
  if (!user) return { res: NextResponse.json({ error: "Sign in to use AI features." }, { status: 401 }) };
  return { user };
}

export function fail(e: unknown) {
  if (e instanceof AIError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[ai]", e);
  return NextResponse.json({ error: "Something went wrong talking to the AI service." }, { status: 502 });
}
