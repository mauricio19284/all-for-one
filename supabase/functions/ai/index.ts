// All For One: the one place the Anthropic API key lives.
// The page calls this function with the signed-in user's token; the key never reaches the browser.
// Set the secret ANTHROPIC_API_KEY on the Supabase project before using it.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODELS: Record<string, string> = {
  quick: "claude-haiku-4-5-20251001",
  default: "claude-sonnet-5-5",
  complex: "claude-sonnet-5-5",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Only the owner's signed-in account may spend the key.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: owner, error: ownerErr } = await supabase.rpc("is_owner");
  if (ownerErr || owner !== true) return json({ error: "not allowed" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY is not set" }, 500);

  let body: { prompt?: unknown; tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt || prompt.length > 60000) return json({ error: "prompt missing or too long" }, 400);
  const model = MODELS[String(body.tier)] ?? MODELS.default;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) return json({ error: "anthropic " + r.status }, 502);
  const out = await r.json();
  const text = (out.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  return json({ text });
});
