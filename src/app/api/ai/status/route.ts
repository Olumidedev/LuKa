import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ enabled: aiConfigured() });
}
