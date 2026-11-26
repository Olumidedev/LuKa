import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/gateway";
import { chatConfigured } from "@/lib/kb/chatChain";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

/** Which optional services this server has keys for (names only, never the keys). */
export function GET() {
  const db = !!supabaseAdmin();
  return NextResponse.json({
    // Generation stores recipes in the shared catalog, so it needs the database too.
    enabled: aiConfigured() && db,
    chat: chatConfigured() && db,
    instacart: !!process.env.INSTACART_API_KEY,
    places: process.env.GOOGLE_MAPS_API_KEY ? "google" : "osm",
  });
}
