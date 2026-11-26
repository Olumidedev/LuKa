import { NextResponse } from "next/server";
import { cleanEvent, isDeviceId } from "@/lib/analyticsSchema";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
const MAX_BODY = 32_000;

/**
 * First-party analytics intake. Clients send small batches; the server
 * validates them, attaches the verified user (if a session token is given),
 * stores them in Supabase and, if configured, forwards them to PostHog.
 */
export async function POST(req: Request) {
  if (!rateLimit(`events:${clientIp(req)}`, 30)) return new NextResponse(null, { status: 429 });
  const text = await req.text();
  if (text.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let body: { deviceId?: unknown; token?: unknown; events?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!isDeviceId(body.deviceId) || !Array.isArray(body.events)) return new NextResponse(null, { status: 400 });
  const events = body.events.slice(0, 25).map(cleanEvent).filter((e) => e !== null);
  if (!events.length) return new NextResponse(null, { status: 204 });

  const db = supabaseAdmin();
  let userId: string | null = null;
  if (db && typeof body.token === "string" && body.token.length < 4000) {
    const { data } = await db.auth.getUser(body.token);
    userId = data.user?.id ?? null;
  }

  if (db) {
    const { error } = await db.from("usage_events").insert(
      events.map((e) => ({ device_id: body.deviceId, user_id: userId, name: e.name, props: e.props, path: e.path, created_at: e.at })),
    );
    if (error) console.error("[events] insert failed:", error.message);
  }

  const phKey = process.env.POSTHOG_KEY;
  if (phKey) {
    const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
    await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: phKey,
        batch: events.map((e) => ({
          event: e.name,
          distinct_id: userId ?? body.deviceId,
          timestamp: e.at,
          properties: { ...e.props, $current_url: e.path, device_id: body.deviceId, $process_person_profile: !!userId },
        })),
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }
  return new NextResponse(null, { status: 204 });
}
