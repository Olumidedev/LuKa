import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/** Verifies the caller's Supabase session token (Authorization: Bearer …). */
export async function requireUser(req: Request): Promise<{ id: string; isAdmin: boolean } | null> {
  const db = supabaseAdmin();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!db || !token || token.length > 4000) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await db.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, isAdmin: !!p?.is_admin };
}
