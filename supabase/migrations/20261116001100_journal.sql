-- ============================================================================
-- ROVIA · PHASE 6 — Yolculuk arşivi ve seyahat günlüğü
-- * Fotoğraflar: istemci küçültür (EXIF'i siler), sunucunun ürettiği yola imzalı bağlantıyla
--   yükler, ardından media_register() dosyanın gerçekten yüklendiğini, boyutunu ve türünü
--   storage.objects üzerinden doğrular. Kullanıcı başına kota: 300 MB / 3000 fotoğraf.
-- * Günlük notu: journal_note_save() notu ve fotoğraf bağlantılarını tek işlemde kaydeder.
-- * Arşiv: trip_archive() tamamlanan yolculukları özet, rota önizlemesi, fotoğraf/not sayısı ve
--   kapak fotoğrafıyla döndürür.
-- * Silme: trip_delete() ve media_delete() silinen dosya yollarını döndürür; uygulama bu
--   dosyaları Storage'dan siler (SQL'den Storage dosyası silinmez).
-- Tüm fonksiyonlar SECURITY INVOKER: RLS geçerli.
-- ============================================================================

-- ---------------------------------------------------------------------------- Medya
alter table public.media_assets
  add column thumb_path text check (char_length(thumb_path) <= 512),
  add column thumb_bytes int not null default 0 check (thumb_bytes >= 0 and thumb_bytes <= 2097152),
  add constraint media_assets_thumb_owner check (thumb_path is null or split_part(thumb_path, '/', 1) = user_id::text);

-- Yükleme yolu biçimi: {user_id}/{uuid}.{ext} ve küçük görsel {user_id}/{uuid}_t.{ext}
create or replace function public.media_path_ok(p_path text, p_uid uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path ~ ('^' || p_uid::text || '/[0-9a-f-]{36}(_t)?\.(jpg|webp)$')
$$;

create or replace function public.media_quota()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'bytes', coalesce(sum(size_bytes::bigint + thumb_bytes), 0),
    'count', count(*),
    'max_bytes', 314572800,
    'max_count', 3000)
  from public.media_assets
  where user_id = (select auth.uid())
$$;

-- p_items: [{path, thumb_path, width, height, taken_at?, lat?, lng?}]
create or replace function public.media_register(p_trip_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_out jsonb := '[]'::jsonb;
  v_used_bytes bigint;
  v_used_count int;
  r record;
  o_main record;
  o_thumb record;
  v_id uuid;
  v_lat double precision;
  v_lng double precision;
  v_taken timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  if p_trip_id is not null and not exists (select 1 from public.trips where id = p_trip_id) then
    raise exception 'trip_not_found' using errcode = 'PT404';
  end if;

  select coalesce(sum(size_bytes::bigint + thumb_bytes), 0), count(*) into v_used_bytes, v_used_count
  from public.media_assets where user_id = v_uid;

  for r in select e, ord from jsonb_array_elements(p_items) with ordinality as x(e, ord) loop
    if not public.media_path_ok(r.e ->> 'path', v_uid) or not public.media_path_ok(r.e ->> 'thumb_path', v_uid)
       or (r.e ->> 'path') like '%\_t.%' or (r.e ->> 'thumb_path') not like '%\_t.%' then
      raise exception 'invalid_path' using errcode = '22023';
    end if;

    -- Dosyalar gerçekten yüklenmiş olmalı (RLS: yalnızca kendi klasörü görünür)
    select (metadata ->> 'size')::bigint as size, metadata ->> 'mimetype' as mime into o_main
    from storage.objects where bucket_id = 'media' and name = r.e ->> 'path';
    select (metadata ->> 'size')::bigint as size, metadata ->> 'mimetype' as mime into o_thumb
    from storage.objects where bucket_id = 'media' and name = r.e ->> 'thumb_path';
    if o_main.size is null or o_thumb.size is null then
      raise exception 'upload_missing' using errcode = 'PT404';
    end if;
    if o_main.mime not in ('image/jpeg', 'image/webp') or o_thumb.mime not in ('image/jpeg', 'image/webp') then
      raise exception 'invalid_type' using errcode = '22023';
    end if;
    if o_main.size > 20971520 or o_thumb.size > 2097152 then
      raise exception 'too_large' using errcode = '22023';
    end if;

    v_used_bytes := v_used_bytes + o_main.size + o_thumb.size;
    v_used_count := v_used_count + 1;
    if v_used_bytes > 314572800 or v_used_count > 3000 then
      raise exception 'quota_exceeded' using errcode = 'PT413';
    end if;

    v_lat := (r.e ->> 'lat')::double precision;
    v_lng := (r.e ->> 'lng')::double precision;
    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_lat := null; v_lng := null;
    end if;
    v_taken := (r.e ->> 'taken_at')::timestamptz;
    if v_taken is not null and (v_taken < '1990-01-01' or v_taken > now() + interval '1 day') then
      v_taken := null;
    end if;

    insert into public.media_assets (
      user_id, trip_id, storage_path, thumb_path, mime_type, size_bytes, thumb_bytes, width, height, taken_at, latitude, longitude)
    values (
      v_uid, p_trip_id, r.e ->> 'path', r.e ->> 'thumb_path', o_main.mime, o_main.size, o_thumb.size,
      nullif((r.e ->> 'width')::int, 0), nullif((r.e ->> 'height')::int, 0), v_taken, v_lat, v_lng)
    on conflict (storage_path) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.media_assets where storage_path = r.e ->> 'path';
    end if;
    v_out := v_out || jsonb_build_object('i', r.ord - 1, 'id', v_id);
  end loop;
  return v_out;
end;
$$;

-- Silinen fotoğrafların dosya yolları döner (Storage'dan uygulama siler)
create or replace function public.media_delete(p_ids uuid[])
returns text[]
language sql
security invoker
set search_path = ''
as $$
  with d as (
    delete from public.media_assets where id = any (p_ids) returning storage_path, thumb_path
  )
  select coalesce(array_agg(p), '{}') from (
    select storage_path as p from d union all select thumb_path from d where thumb_path is not null
  ) x
$$;

-- ---------------------------------------------------------------------------- Günlük notları
create or replace function public.journal_note_save(
  p_id uuid, p_trip_id uuid, p_kind text, p_title text, p_body text, p_noted_at timestamptz,
  p_location_name text, p_lat double precision, p_lng double precision, p_saved_place_id uuid, p_media_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_media uuid[] := coalesce(p_media_ids, '{}');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if cardinality(v_media) > 30 then
    raise exception 'too_many_media' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null and nullif(btrim(coalesce(p_body, '')), '') is null and cardinality(v_media) = 0 then
    raise exception 'empty_note' using errcode = '22023';
  end if;
  if (select count(*) from public.media_assets where id = any (v_media)) <> cardinality(v_media) then
    raise exception 'media_not_found' using errcode = 'PT404';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'invalid_location' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.journal_notes (user_id, trip_id, kind, title, body, noted_at, location_name, latitude, longitude, saved_place_id)
    values (v_uid, p_trip_id, p_kind, nullif(btrim(p_title), ''), nullif(btrim(p_body), ''), coalesce(p_noted_at, now()),
            nullif(btrim(p_location_name), ''), p_lat, p_lng, p_saved_place_id)
    returning id into v_id;
  else
    update public.journal_notes
       set trip_id = p_trip_id, kind = p_kind, title = nullif(btrim(p_title), ''), body = nullif(btrim(p_body), ''),
           noted_at = coalesce(p_noted_at, noted_at), location_name = nullif(btrim(p_location_name), ''),
           latitude = p_lat, longitude = p_lng, saved_place_id = p_saved_place_id
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'note_not_found' using errcode = 'PT404';
    end if;
    delete from public.journal_note_media where note_id = v_id and media_id <> all (v_media);
  end if;

  insert into public.journal_note_media (note_id, media_id, user_id, sort_order)
  select v_id, m, v_uid, (ord - 1)::int from unnest(v_media) with ordinality as u(m, ord)
  on conflict (note_id, media_id) do update set sort_order = excluded.sort_order;

  -- Yolculuğa yazılan notun fotoğrafları da o yolculuğa bağlanır (yalnızca bağsızsa)
  if p_trip_id is not null then
    update public.media_assets set trip_id = p_trip_id where id = any (v_media) and trip_id is null;
  end if;
  return v_id;
end;
$$;

-- Yalnızca fotoğraftan oluşan not (başlıksız, metinsiz) mümkün olsun. İçerik kuralı journal_note_save'de:
-- başlık, metin veya en az bir fotoğraf. Fotoğrafı sonradan silinen boş not uygulamada "Fotoğraf notu" görünür.
alter table public.journal_notes drop constraint journal_notes_has_content;

-- ---------------------------------------------------------------------------- Arşiv
create or replace function public.trip_archive()
returns table (
  id uuid, title text, description text, started_at timestamptz, ended_at timestamptz,
  distance_m double precision, elapsed_s int, moving_s int, start_label text, end_label text,
  polyline text, photo_count int, note_count int, cover_thumb text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.description, r.started_at, r.ended_at,
         r.total_distance_m::double precision, r.elapsed_duration_s, r.moving_duration_s, r.start_label, r.end_label,
         coalesce(r.simplified_polyline, t.route_polyline),
         (select count(*)::int from public.media_assets m where m.trip_id = t.id),
         (select count(*)::int from public.journal_notes n where n.trip_id = t.id),
         (select m.thumb_path from public.media_assets m where m.trip_id = t.id and m.thumb_path is not null
            order by m.taken_at nulls last, m.created_at limit 1)
  from public.trips t
  join lateral (
    select * from public.trip_recordings x where x.trip_id = t.id and x.status = 'completed'
    order by x.ended_at desc nulls last limit 1
  ) r on true
  where t.status = 'completed'
  order by r.ended_at desc nulls last
  limit 1000
$$;

-- Yolculuğu sil; p_with_journal ise notları ve fotoğrafları da. Silinen dosya yolları döner.
create or replace function public.trip_delete(p_id uuid, p_with_journal boolean)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paths text[] := '{}';
begin
  if not exists (select 1 from public.trips where id = p_id) then
    raise exception 'trip_not_found' using errcode = 'PT404';
  end if;
  if p_with_journal then
    delete from public.journal_notes where trip_id = p_id;
    v_paths := public.media_delete(array(select id from public.media_assets where trip_id = p_id));
  end if;
  delete from public.trips where id = p_id;
  return v_paths;
end;
$$;

-- ---------------------------------------------------------------------------- Hız sınırı kovaları
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
    ('journal',       60, 1000)
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

revoke all on function public.media_register(uuid, jsonb), public.media_delete(uuid[]), public.media_quota(),
  public.journal_note_save(uuid, uuid, text, text, text, timestamptz, text, double precision, double precision, uuid, uuid[]),
  public.trip_archive(), public.trip_delete(uuid, boolean), public.media_path_ok(text, uuid) from public, anon;
grant execute on function public.media_register(uuid, jsonb), public.media_delete(uuid[]), public.media_quota(),
  public.journal_note_save(uuid, uuid, text, text, text, timestamptz, text, double precision, double precision, uuid, uuid[]),
  public.trip_archive(), public.trip_delete(uuid, boolean), public.media_path_ok(text, uuid) to authenticated;
