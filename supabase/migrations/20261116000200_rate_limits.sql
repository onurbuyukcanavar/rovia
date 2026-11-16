-- ============================================================================
-- ROVIA · API hız sınırlama (PHASE 2)
-- Google Maps Platform çağrıları kullanıcı başına sınırlanır; sayaçlar sunucusuz
-- ortamda bellek yerine Postgres'te tutulur. Tabloya doğrudan erişim yoktur;
-- yalnızca consume_rate_limit() fonksiyonu (oturumdaki kullanıcı için) yazabilir.
-- ============================================================================

create table public.api_rate_limits (
  user_id       uuid not null references auth.users (id) on delete cascade,
  bucket        text not null check (char_length(bucket) between 1 and 64),
  window_start  timestamptz not null,
  hits          int not null default 0 check (hits >= 0),
  primary key (user_id, bucket, window_start)
);
create index api_rate_limits_window_idx on public.api_rate_limits (window_start);

alter table public.api_rate_limits enable row level security;
-- Politika yok: authenticated/anon doğrudan okuyamaz veya yazamaz.
revoke all on public.api_rate_limits from anon, authenticated;

/**
 * Oturumdaki kullanıcı için `bucket` kovasından bir hak tüketir.
 * Pencere içinde `p_limit` aşılmışsa false döner (sayaç yine artırılır).
 */
create or replace function public.consume_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  win timestamptz;
  current_hits int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_arguments' using errcode = '22023';
  end if;

  win := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits as r (user_id, bucket, window_start, hits)
  values (uid, p_bucket, win, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning hits into current_hits;

  -- Eski pencereleri ara sıra temizle (çağrıların ~%1'inde)
  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '2 days';
  end if;

  return current_hits <= p_limit;
end;
$$;

revoke execute on function public.consume_rate_limit(text, int, int) from public, anon;
grant execute on function public.consume_rate_limit(text, int, int) to authenticated;
