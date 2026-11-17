// All For One: the WHOOP connection.
// Holds the WHOOP tokens (table public.whoop_auth, service role only), pulls recovery, sleep, strain and
// workouts from the WHOOP API v2, and writes them into public.docs:
//   whoop/<YYYY-MM-DD>  one record per day
//   meta/whoop          connection state shown on the Gym page
//   gymlog/<YYYY-MM-DD> a session, created when WHOOP recorded a workout that day (never overwrites a hand-logged one)
// Calls: POST {action: connect|sync|disconnect} with the owner's sign-in token; GET ?code&state is WHOOP's
// redirect after approval; POST {action:"sync"} with x-cron-key is the hourly job.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const REDIRECT = URL_BASE + "/functions/v1/whoop";
const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";
const SCOPES = "offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement";
const SITE_OK = /^https:\/\/mauricio19284\.github\.io\/|^http:\/\/localhost(:\d+)?\//;
// Recorded activities that are not a training session.
const NOT_TRAINING = /golf|walk|commut|meditat|sauna|ice.?bath|massage|breath|caddy|gaming|stretch|nap|percussive|air.?compression|cooking|clean|chore|driving|motor|spectat|stage|music|operations|wheelchair|babywear|dedicated.?parenting|public.?speaking|steam/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Auth = {
  client_id: string | null; client_secret: string | null; access_token: string | null; refresh_token: string | null;
  expires_at: string | null; state: string | null; state_at: string | null; return_to: string | null; cron_key: string;
};
async function getAuth(): Promise<Auth> {
  const r = await admin.from("whoop_auth").select("*").eq("id", 1).single();
  if (r.error) throw new Error("auth row: " + r.error.message);
  return r.data as Auth;
}
const setAuth = async (patch: Partial<Auth>) => {
  const r = await admin.from("whoop_auth").update(patch).eq("id", 1);
  if (r.error) throw new Error("auth save: " + r.error.message);
};
const creds = (a: Auth) => ({
  id: Deno.env.get("WHOOP_CLIENT_ID") || a.client_id || "",
  secret: Deno.env.get("WHOOP_CLIENT_SECRET") || a.client_secret || "",
});
async function getDoc(collection: string, id: string) {
  const r = await admin.from("docs").select("data").eq("collection", collection).eq("id", id).maybeSingle();
  return r.data ? (r.data.data as Record<string, any>) : null;
}
async function putDoc(collection: string, id: string, data: unknown) {
  const r = await admin.from("docs").upsert({ collection, id, data, updated_at: new Date().toISOString() });
  if (r.error) throw new Error("save " + collection + "/" + id + ": " + r.error.message);
}
async function setMeta(patch: Record<string, unknown>) {
  const cur = (await getDoc("meta", "whoop")) || {};
  await putDoc("meta", "whoop", { ...cur, ...patch });
}

async function token(form: Record<string, string>) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("whoop token " + r.status + ": " + text.slice(0, 200));
  return JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in: number };
}
async function saveTokens(t: { access_token: string; refresh_token?: string; expires_in: number }, keep: string | null) {
  await setAuth({
    access_token: t.access_token,
    refresh_token: t.refresh_token || keep,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
  });
}
async function accessToken(): Promise<string> {
  let a = await getAuth();
  if (!a.refresh_token && !a.access_token) throw new Error("not connected");
  if (a.access_token && a.expires_at && Date.parse(a.expires_at) - Date.now() > 5 * 60 * 1000) return a.access_token;
  const c = creds(a);
  try {
    const t = await token({ grant_type: "refresh_token", refresh_token: a.refresh_token || "", client_id: c.id, client_secret: c.secret, scope: "offline" });
    await saveTokens(t, a.refresh_token);
    return t.access_token;
  } catch (e) {
    // Another run may have refreshed a moment ago; use what it stored.
    const b = await getAuth();
    if (b.access_token && b.access_token !== a.access_token && b.expires_at && Date.parse(b.expires_at) > Date.now()) return b.access_token;
    a = b;
    throw e;
  }
}
async function pull(tok: string, path: string, start: string) {
  const out: any[] = [];
  let next = "";
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams({ limit: "25", start });
    if (next) q.set("nextToken", next);
    let r = await fetch(API + path + "?" + q, { headers: { Authorization: "Bearer " + tok } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 2500)); r = await fetch(API + path + "?" + q, { headers: { Authorization: "Bearer " + tok } }); }
    if (!r.ok) throw new Error("whoop " + path + " " + r.status);
    const j = await r.json();
    out.push(...(j.records || []));
    next = j.next_token || "";
    if (!next) break;
  }
  return out;
}

const offMin = (o: string) => { const m = /^([+-])(\d\d):?(\d\d)$/.exec(o || ""); return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -360; };
const localDate = (iso: string, off: string, plusHours = 0) => new Date(Date.parse(iso) + (offMin(off) + plusHours * 60) * 60000).toISOString().slice(0, 10);
const localTime = (iso: string, off: string) => new Date(Date.parse(iso) + offMin(off) * 60000).toISOString().slice(11, 16);
const r1 = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : null);
const hrs = (ms: unknown) => (typeof ms === "number" ? Math.round(ms / 36000) / 100 : null);
const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

async function sync(days: number) {
  const tok = await accessToken();
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const [cycles, recs, sleeps, workouts] = await Promise.all([
    pull(tok, "/cycle", start), pull(tok, "/recovery", start), pull(tok, "/activity/sleep", start), pull(tok, "/activity/workout", start),
  ]);
  const day: Record<string, any> = {};
  const at = (d: string) => (day[d] ||= { date: d, workouts: [] });
  // A cycle starts when he falls asleep; the day it belongs to is the one he wakes up in.
  const cycleDay: Record<string, string> = {};
  for (const c of cycles) {
    const d = localDate(c.start, c.timezone_offset, 12);
    cycleDay[String(c.id)] = d;
    const s = c.score || {};
    Object.assign(at(d), { strain: r1(s.strain), kj: r1(s.kilojoule), avgHr: s.average_heart_rate ?? null, maxHr: s.max_heart_rate ?? null, open: !c.end });
  }
  for (const s of sleeps) {
    if (s.nap || s.score_state !== "SCORED" || !s.score) continue;
    const d = cycleDay[String(s.cycle_id)] || localDate(s.end, s.timezone_offset);
    const st = s.score.stage_summary || {}, need = s.score.sleep_needed || {};
    const asleep = (st.total_light_sleep_time_milli || 0) + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0);
    const prev = at(d).sleep;
    if (prev && prev.hours >= (hrs(asleep) || 0)) continue;
    at(d).sleep = {
      hours: hrs(asleep), inBed: hrs(st.total_in_bed_time_milli), rem: hrs(st.total_rem_sleep_time_milli), deep: hrs(st.total_slow_wave_sleep_time_milli),
      light: hrs(st.total_light_sleep_time_milli), awake: hrs(st.total_awake_time_milli),
      need: hrs((need.baseline_milli || 0) + (need.need_from_sleep_debt_milli || 0) + (need.need_from_recent_strain_milli || 0) + (need.need_from_recent_nap_milli || 0)),
      perf: r1(s.score.sleep_performance_percentage), eff: r1(s.score.sleep_efficiency_percentage), cons: r1(s.score.sleep_consistency_percentage),
      resp: r1(s.score.respiratory_rate), bed: localTime(s.start, s.timezone_offset), wake: localTime(s.end, s.timezone_offset),
    };
  }
  for (const r of recs) {
    if (r.score_state !== "SCORED" || !r.score) continue;
    const d = cycleDay[String(r.cycle_id)];
    if (!d) continue;
    at(d).recovery = { score: r.score.recovery_score ?? null, hrv: r1(r.score.hrv_rmssd_milli), rhr: r.score.resting_heart_rate ?? null, spo2: r1(r.score.spo2_percentage), skin: r1(r.score.skin_temp_celsius) };
  }
  for (const w of workouts) {
    if (!w.end) continue;
    const d = localDate(w.start, w.timezone_offset), s = w.score || {}, z = s.zone_durations || {};
    const min = Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000);
    const sport = String(w.sport_name || "activity").replace(/[-_]/g, " ");
    at(d).workouts.push({
      id: w.id, sport, at: localTime(w.start, w.timezone_offset), min, strain: r1(s.strain), avgHr: s.average_heart_rate ?? null, maxHr: s.max_heart_rate ?? null,
      kcal: typeof s.kilojoule === "number" ? Math.round(s.kilojoule / 4.184) : null,
      zones: [z.zone_zero_milli, z.zone_one_milli, z.zone_two_milli, z.zone_three_milli, z.zone_four_milli, z.zone_five_milli].map((m: unknown) => (typeof m === "number" ? Math.round(m / 60000) : 0)),
      training: min >= 15 && !NOT_TRAINING.test(sport),
    });
  }
  const dates = Object.keys(day).sort();
  if (!dates.length) { await setMeta({ connected: true, lastSync: new Date().toISOString(), error: "" }); return { days: 0, sessions: 0 }; }
  const have = await admin.from("docs").select("collection,id,data").in("collection", ["whoop", "gymlog"]).gte("id", dates[0]);
  const old: Record<string, any> = {};
  (have.data || []).forEach((x: any) => (old[x.collection + "/" + x.id] = x.data));
  const split = ((await getDoc("meta", "config")) || {}).split || {};
  const now = new Date().toISOString(), rows: any[] = [];
  let sessions = 0;
  for (const d of dates) {
    const rec = day[d], prev = old["whoop/" + d] || {};
    rec.workouts.sort((a: any, b: any) => a.at.localeCompare(b.at));
    if (prev.nogym) rec.nogym = true;
    // A partial window can miss one of the four pieces for its first day; keep what was already stored.
    for (const k of ["recovery", "sleep", "strain"]) if (rec[k] == null && prev[k] != null) rec[k] = prev[k];
    rec.syncedAt = now;
    if (JSON.stringify({ ...prev, syncedAt: 0 }) !== JSON.stringify({ ...rec, syncedAt: 0 })) rows.push({ collection: "whoop", id: d, data: rec, updated_at: now });
    const tr = rec.workouts.filter((w: any) => w.training);
    const g = old["gymlog/" + d];
    if (tr.length && !rec.nogym && (!g || g.source === "WHOOP")) {
      const w = { sport: tr.map((x: any) => x.sport).join(" + "), min: tr.reduce((n: number, x: any) => n + x.min, 0), strain: Math.max(...tr.map((x: any) => x.strain || 0)), avgHr: tr[0].avgHr, at: tr[0].at };
      const log = { date: d, split: (g && g.split) || split[WD[new Date(d + "T12:00:00Z").getUTCDay()]] || "", note: (g && g.note) || "", source: "WHOOP", whoop: w, loggedAt: (g && g.loggedAt) || now };
      if (JSON.stringify(g) !== JSON.stringify(log)) rows.push({ collection: "gymlog", id: d, data: log, updated_at: now });
      if (!g) sessions++;
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    const r = await admin.from("docs").upsert(rows.slice(i, i + 200));
    if (r.error) throw new Error("save: " + r.error.message);
  }
  await setMeta({ connected: true, lastSync: now, error: "" });
  return { days: dates.length, sessions };
}

const back = (to: string | null, flag: string) => {
  const base = to && SITE_OK.test(to) ? to.split("#")[0].split("?")[0] : "https://mauricio19284.github.io/all-for-one/";
  return Response.redirect(base + "?whoop=" + flag + "#gym", 302);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // WHOOP sends the browser back here after he approves.
  if (req.method === "GET") {
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    let a: Auth;
    try { a = await getAuth(); } catch { return json({ error: "not set up" }, 500); }
    if (!state || !a.state || state !== a.state || !a.state_at || Date.now() - Date.parse(a.state_at) > 15 * 60 * 1000) return back(a.return_to, "expired");
    if (!code) { await setAuth({ state: null }); return back(a.return_to, "denied"); }
    try {
      const c = creds(a);
      const t = await token({ grant_type: "authorization_code", code, client_id: c.id, client_secret: c.secret, redirect_uri: REDIRECT });
      await saveTokens(t, null);
      await setAuth({ state: null, state_at: null });
      await setMeta({ connected: true, connectedAt: new Date().toISOString(), error: "" });
      // Recent days now, the long history right after the redirect.
      try { await sync(10); } catch (e) { await setMeta({ error: String((e as Error).message || e).slice(0, 200) }); }
      // @ts-ignore EdgeRuntime exists on Supabase
      EdgeRuntime.waitUntil(sync(120).catch(() => {}));
      return back(a.return_to, "connected");
    } catch (e) {
      await setMeta({ connected: false, error: String((e as Error).message || e).slice(0, 200) });
      return back(a.return_to, "failed");
    }
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const action = String(body.action || "sync");

  const cronKey = req.headers.get("x-cron-key");
  let allowed = false;
  if (cronKey) {
    const a = await getAuth();
    allowed = action === "sync" && cronKey === a.cron_key;
    if (allowed && !a.refresh_token) return json({ ok: true, skipped: "not connected" });
  } else {
    const user = createClient(URL_BASE, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: owner, error } = await user.rpc("is_owner");
    allowed = !error && owner === true;
  }
  if (!allowed) return json({ error: "not allowed" }, 403);

  try {
    if (action === "connect") {
      const id = String(body.clientId || "").trim(), secret = String(body.clientSecret || "").trim();
      const a = await getAuth();
      const patch: Partial<Auth> = {};
      if (id) patch.client_id = id;
      if (secret) patch.client_secret = secret;
      const c = creds({ ...a, ...patch } as Auth);
      if (!c.id || !c.secret) return json({ error: "Paste the Client ID and Client Secret from your WHOOP app first." }, 400);
      const state = crypto.randomUUID().replace(/-/g, "");
      await setAuth({ ...patch, state, state_at: new Date().toISOString(), return_to: String(body.returnTo || "") });
      const q = new URLSearchParams({ response_type: "code", client_id: c.id, redirect_uri: REDIRECT, scope: SCOPES, state });
      return json({ url: AUTH_URL + "?" + q });
    }
    if (action === "disconnect") {
      try { const tok = await accessToken(); await fetch(API + "/user/access", { method: "DELETE", headers: { Authorization: "Bearer " + tok } }); } catch { /* already gone */ }
      await setAuth({ access_token: null, refresh_token: null, expires_at: null, state: null });
      await setMeta({ connected: false, error: "" });
      return json({ ok: true });
    }
    const days = Math.max(1, Math.min(180, Number(body.days) || 4));
    return json({ ok: true, ...(await sync(days)) });
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 200);
    if (action === "sync") { try { await setMeta({ error: msg, errorAt: new Date().toISOString() }); } catch { /* ignore */ } }
    return json({ error: msg }, msg === "not connected" ? 409 : 502);
  }
});
