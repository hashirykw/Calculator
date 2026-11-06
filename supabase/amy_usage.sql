-- Rate limiting for Amy (api/amy.js). Run once in the Supabase SQL editor.
-- Stores only a hashed key, a time window and a count: no messages, no IPs.

create table if not exists public.amy_usage (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.amy_usage enable row level security;   -- no public access; the service role bypasses RLS

-- Atomically add one hit and return the new count.
create or replace function public.amy_hit(p_key text, p_window timestamptz)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.amy_usage (key, window_start, count)
  values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = public.amy_usage.count + 1
  returning count;
$$;

revoke all on function public.amy_hit(text, timestamptz) from public, anon, authenticated;

-- Optional clean-up: delete windows older than two days (run daily with pg_cron, or by hand).
-- delete from public.amy_usage where window_start < now() - interval '2 days';
