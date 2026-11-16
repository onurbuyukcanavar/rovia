-- ============================================================================
-- ROVIA · Hız sınırlama sertleştirmesi (PHASE 2)
-- Supabase Security Advisor: consume_rate_limit authenticated rolüyle /rpc üzerinden
-- doğrudan çağrılabiliyordu ve kova adı/limit çağırandan geliyordu → kullanıcı keyfi
-- kova adlarıyla sınırsız satır üretebilirdi. Artık kovalar ve limitler fonksiyonun
-- içinde sabittir; doğrudan çağrı yalnızca kullanıcının kendi kotasını tüketir.
-- ============================================================================

drop function if exists public.consume_rate_limit(text, int, int);

create or replace function public.consume_rate_limit(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  per_minute int;
  per_day int;
  minute_hits int;
  day_hits int;
  minute_win timestamptz := date_trunc('minute', now());
  day_win timestamptz := date_trunc('day', now());
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select l.per_minute, l.per_day into per_minute, per_day
  from (values
    ('autocomplete', 120, 2000),
    ('place',         60, 1000),
    ('details',       40,  500),
    ('photo',         60,  600),
    ('route',         30,  500),
    ('search',        20,  300),
    ('geocode',       30,  500)
  ) as l(bucket, per_minute, per_day)
  where l.bucket = p_bucket;

  if per_minute is null then
    raise exception 'unknown_rate_limit_bucket' using errcode = '22023';
  end if;

  insert into public.api_rate_limits as r (user_id, bucket, window_start, hits)
  values (uid, p_bucket || ':m', minute_win, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning hits into minute_hits;

  insert into public.api_rate_limits as r (user_id, bucket, window_start, hits)
  values (uid, p_bucket || ':d', day_win, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning hits into day_hits;

  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '2 days';
  end if;

  return minute_hits <= per_minute and day_hits <= per_day;
end;
$$;

comment on function public.consume_rate_limit(text) is
  'Oturumdaki kullanıcı için sabit izin listesindeki bir API kovasından hak tüketir. Doğrudan çağrılabilir olması bilinçlidir: yalnızca çağıranın kendi kotasını etkiler.';

revoke execute on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;
