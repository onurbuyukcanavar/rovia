-- ============================================================================
-- ROVIA · Vikipedi bilgisi hız sınırı kovası ("wiki": dakikada 60, günde 2000)
-- /api/maps/wiki her yer paneli açılışında bir kez çağrılır (yanıt sunucuda 7 gün önbellekte).
-- Bu migration uygulanana kadar uç nokta "place" kovasına düşer (src/lib/api/maps-handler.ts).
-- Fonksiyon gövdesi 20261117000500_hardening_account.sql ile aynıdır; yalnızca "wiki" satırı eklendi.
-- ============================================================================
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
    ('geocode',       30,  500),
    ('gps',           60, 6000),
    ('places',        60, 1000),
    ('media',         30,  400),
    ('journal',       60, 1000),
    ('travelogue',   120, 6000),
    ('export',         3,    5),
    ('wiki',          60, 2000)
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
