import { NextResponse } from "next/server";
import { AIError } from "@/lib/ai/gateway";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export { clientIp };

export function guard(req: Request): NextResponse | null {
  if (!rateLimit(`ai:${clientIp(req)}`, 6)) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  return null;
}

export function fail(e: unknown) {
  if (e instanceof AIError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Something went wrong talking to the AI service." }, { status: 502 });
}
