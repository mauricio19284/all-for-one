-- All For One: WHOOP connection.
-- One private row holds the WHOOP app's credentials and tokens. Row-level security is on with no
-- policies, so only the `whoop` edge function (service role) can read it; the page never sees it.
create table if not exists public.whoop_auth (
  id            int primary key default 1 check (id = 1),
  client_id     text,
  client_secret text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  state         text,
  state_at      timestamptz,
  return_to     text,
  cron_key      text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.whoop_auth enable row level security;
revoke all on public.whoop_auth from anon, authenticated;
insert into public.whoop_auth (id) values (1) on conflict do nothing;

-- Hourly sync, so sessions log themselves even when the page is closed.
create extension if not exists pg_net;
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'whoop-sync') then perform cron.unschedule('whoop-sync'); end if;
end $$;
select cron.schedule('whoop-sync', '7 * * * *', $job$
  select net.http_post(
    url := 'https://lijjbumgqelkqwpljjov.supabase.co/functions/v1/whoop',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select cron_key from public.whoop_auth where id = 1)),
    body := '{"action":"sync"}'::jsonb
  );
$job$);
