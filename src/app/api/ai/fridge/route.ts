import { NextResponse } from "next/server";
import { INGREDIENTS } from "@/lib/data/ingredients";
import { generateJSON } from "@/lib/ai/gateway";
import { fridgePrompt } from "@/lib/ai/prompts";
import { fail, guard } from "../_util";

const MAX_BYTES = 6 * 1024 * 1024;

/** Magic-byte check: only real JPEG / PNG / WebP pass, whatever the declared type says. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "Attach a photo." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large (6 MB max)." }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniff(bytes);
    if (!mimeType) return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });
    // The photo is processed in memory and never stored.
    const out = (await generateJSON(fridgePrompt(), [{ mimeType, base64: Buffer.from(bytes).toString("base64") }])) as {
      items?: { id?: string; name?: string; qty?: number | null; useWithinDays?: number | null }[];
    };
    const items = [];
    const unknown: string[] = [];
    for (const it of (out.items ?? []).slice(0, 60)) {
      const byId = it.id && INGREDIENTS[it.id] ? it.id : null;
      const byName = Object.values(INGREDIENTS).find((i) => i.name.toLowerCase() === String(it.name ?? "").toLowerCase())?.key;
      const key = byId ?? byName;
      if (!key) {
        if (it.name) unknown.push(String(it.name).slice(0, 60));
        continue;
      }
      const qty = typeof it.qty === "number" && it.qty > 0 ? Math.min(it.qty, 20000) : null;
      const soon = typeof it.useWithinDays === "number" && it.useWithinDays >= 0 ? Math.min(30, Math.round(it.useWithinDays)) : undefined;
      items.push({ key, qty, useWithinDays: soon });
    }
    return NextResponse.json({ items, unknown });
  } catch (e) {
    return fail(e);
  }
}
