import "server-only";
import { requireUser } from "./auth";

/** Scheduled jobs accept Vercel Cron (Bearer CRON_SECRET) or a signed-in admin. */
export async function authorizeJob(req: Request): Promise<"cron" | "admin" | null> {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return "cron";
  const user = await requireUser(req);
  return user?.isAdmin ? "admin" : null;
}
