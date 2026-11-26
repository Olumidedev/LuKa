import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/gateway";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

export function GET() {
  // Generation stores recipes in the shared catalog, so it needs the database too.
  return NextResponse.json({ enabled: aiConfigured() && !!supabaseAdmin() });
}
