-- ============================================================================
-- ROVIA · PHASE 10 — Güvenlik sıkılaştırma, hesap silme (KVKK)
-- * En az yetki: anonim rolün çağırabildiği yardımcı fonksiyonlar kapatılır.
-- * share_copy SECURITY INVOKER'a çevrilir (paylaşım okuması zaten share_get ile sınırlı).
-- * Fotoğraf kovası yalnızca istemcinin yeniden kodladığı biçimleri (WebP/JPEG, konum/cihaz verisi
--   silinmiş) kabul eder; dosya sınırı 8 MB. Ham HEIC/AVIF doğrudan API ile yüklenemez.
-- * Hesap silme: yalnızca son 15 dakikada giriş yapılmışsa ve kullanıcının fotoğrafları önce
--   silinmişse; tüm veriler auth.users üzerinden zincirleme silinir.
-- ============================================================================

revoke execute on function public.favorite_category_for(text), public.place_name_key(text),
  public.set_updated_at() from public, anon;

alter function public.share_copy(text) security invoker;

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg'], file_size_limit = 8 * 1024 * 1024
where id = 'media';

create or replace function public.account_delete(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_last timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_confirm is distinct from 'HESABIMI SİL' then
    raise exception 'confirmation_required' using errcode = '22023';
  end if;
  select last_sign_in_at into v_last from auth.users where id = v_uid;
  if v_last is null or v_last < now() - interval '15 minutes' then
    raise exception 'reauth_required' using errcode = '42501';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'media' and (storage.foldername(name))[1] = v_uid::text) then
    raise exception 'media_remaining' using errcode = '22023';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.account_delete(text) from public, anon;
grant execute on function public.account_delete(text) to authenticated;

-- ---------------------------------------------------------------------------- Veri indirme kotası
-- "Verilerimi indir" ağır bir sorgudur: dakikada 3, günde 5.
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
    ('export',         3,    5)
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
