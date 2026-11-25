import { NextResponse } from "next/server";
import { AIError, rateLimit } from "@/lib/ai/gateway";

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

export function guard(req: Request): NextResponse | null {
  if (!rateLimit(clientIp(req))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  return null;
}

export function fail(e: unknown) {
  if (e instanceof AIError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Something went wrong talking to the AI service." }, { status: 502 });
}
