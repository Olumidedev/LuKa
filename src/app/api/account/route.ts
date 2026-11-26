import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Deletes the signed-in person's account. Households they share with others
 * are handed to the longest-standing other member first, so nobody else
 * loses their plan; households only they belong to are deleted with them.
 */
export async function DELETE(req: Request) {
  if (!rateLimit(`account:${clientIp(req)}`, 3)) return new NextResponse(null, { status: 429 });
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = supabaseAdmin()!;

  const { data: owned } = await db.from("household_members").select("household_id").eq("user_id", user.id).eq("role", "owner");
  for (const { household_id } of owned ?? []) {
    const { data: heir } = await db
      .from("household_members")
      .select("user_id")
      .eq("household_id", household_id)
      .neq("user_id", user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!heir) continue;
    await db.from("household_members").update({ role: "owner" }).eq("household_id", household_id).eq("user_id", heir.user_id);
    await db.from("households").update({ created_by: heir.user_id }).eq("id", household_id);
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Couldn't delete the account. Try again." }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
