import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { privateAddress } from "../connectors/jsonld";

const MAX_BYTES = 2_000_000;

/** Fetches a public web page for a household's own recipe import (no internal addresses, size-capped). */
export async function fetchPublicPage(raw: string): Promise<{ html: string; url: string }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only web links work here.");
    if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("That link isn't supported.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (!addrs.length || addrs.some(privateAddress)) throw new Error("That link isn't on the public web.");
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "LUKA/0.3 (+https://luka-delta.vercel.app/about; personal recipe import)", accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`That page answered ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("That page was empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: url.toString() };
  }
  throw new Error("Too many redirects.");
}

export { recipeTextFromHtml } from "../connectors/jsonld";
