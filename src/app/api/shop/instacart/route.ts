import { NextResponse } from "next/server";
import { instacartBase, toLineItems, type ListLine } from "@/lib/connectors/instacart";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** "Shop on Instacart": creates a shoppable list page. Item names and amounts only. */
export async function POST(req: Request) {
  if (!rateLimit(`instacart:${clientIp(req)}`, 6)) return NextResponse.json({ error: "One moment, please." }, { status: 429 });
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const key = process.env.INSTACART_API_KEY;
  if (!key) return NextResponse.json({ error: "Instacart isn't switched on." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; lines?: ListLine[] };
  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .filter((l) => l && typeof l.name === "string" && ["g", "ml", "pc"].includes(l.unit) && Number(l.amount) > 0)
    .map((l) => ({ name: l.name.slice(0, 100), amount: Number(l.amount), unit: l.unit, display: String(l.display ?? "").slice(0, 120) }));
  const line_items = toLineItems(lines);
  if (!line_items.length) return NextResponse.json({ error: "Your list is empty." }, { status: 400 });
  try {
    const res = await fetch(`${instacartBase()}/idp/v1/products/products_link`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        title: String(b.title ?? "LUKA shopping list").slice(0, 80),
        link_type: "shopping_list",
        expires_in: 30,
        line_items,
        landing_page_configuration: { partner_linkback_url: "https://luka-delta.vercel.app" },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[instacart]", res.status, (await res.text()).slice(0, 300));
      return NextResponse.json({ error: "Instacart didn't answer. Use your copied list instead." }, { status: 502 });
    }
    const data = (await res.json()) as { products_link_url?: string };
    if (!data.products_link_url?.startsWith("https://") && !data.products_link_url?.startsWith("http://")) return NextResponse.json({ error: "Instacart didn't return a link." }, { status: 502 });
    return NextResponse.json({ url: data.products_link_url });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Instacart. Use your copied list instead." }, { status: 502 });
  }
}
