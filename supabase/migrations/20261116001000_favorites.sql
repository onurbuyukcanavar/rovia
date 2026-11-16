-- ============================================================================
-- ROVIA · PHASE 5 — Favoriler ve içe aktarma
-- * save_places(): elle ekleme, yer detayından ekleme ve dosya/Google içe aktarmanın tek kapısı.
--   Mükerrer kayıt önlenir: aynı OSM yeri, aynı kaynak bağlantısı (ör. Google Maps URL'si) veya
--   aynı ad + 75 m içinde. Aynı içe aktarmanın içindeki tekrarlar da yakalanır.
-- * Kategori verilmemişse yakındaki (≤60 m) ve adı benzeyen OSM yerinden çıkarılır; eşleşen yerin
--   OSM kimliği de kaydedilir (sonraki mükerrer kontrolleri için).
-- * match_place_names(): koordinatsız Google listeleri (Takeout CSV) için ada göre konum önerisi.
-- Tüm fonksiyonlar SECURITY INVOKER: RLS geçerli.
-- ============================================================================

-- Kaynak türleri: genel CSV ve GPX de içe aktarılabilir
alter table public.saved_places drop constraint saved_places_source_check;
alter table public.saved_places add constraint saved_places_source_check
  check (source in ('manual', 'google_takeout', 'google_link', 'kml', 'gpx', 'csv', 'explore', 'trip'));

-- Mükerrer kontrolü için ad anahtarı (Türkçe karakterler sadeleştirilir; TS normalizeForSearch ile uyumlu)
create or replace function public.place_name_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

alter table public.saved_places
  add column name_key text generated always as (public.place_name_key(name)) stored;
create index saved_places_user_name_key_idx on public.saved_places (user_id, name_key);

-- OSM kategorisi → favori kategorisi
create or replace function public.favorite_category_for(p_osm_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_osm_category
    when 'restaurant' then 'restaurant'
    when 'cafe' then 'cafe'
    when 'attraction' then 'attraction'
    when 'museum' then 'attraction'
    when 'historic' then 'historic'
    when 'worship' then 'historic'
    when 'nature' then 'nature'
    when 'hotel' then 'hotel'
    when 'camping' then 'camping'
    when 'fuel' then 'fuel'
    when 'ev' then 'fuel'
    else 'other'
  end
$$;

-- ---------------------------------------------------------------------------
-- save_places(p_source, p_file_name, p_items)
--   p_items: [{name, lat, lng, address?, notes?, category?, list_type?, osm_ref?, source_ref?, list_name?}]
--   Dosya kaynaklarında (google_takeout, kml, gpx, csv) bir import_batches kaydı oluşturur.
--   Dönüş: {batch_id, imported, duplicates, invalid, results: [{i, status, id}]}
--     status: imported | duplicate (id = mevcut kayıt) | invalid
-- ---------------------------------------------------------------------------
create or replace function public.save_places(p_source text, p_file_name text, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_batch uuid;
  v_results jsonb := '[]'::jsonb;
  v_imported int := 0;
  v_duplicates int := 0;
  v_invalid int := 0;
  r record;
  v_name text;
  v_lat double precision;
  v_lng double precision;
  v_key text;
  v_osm text;
  v_src_ref text;
  v_category text;
  v_list text;
  v_point extensions.geography;
  v_dup uuid;
  v_id uuid;
  v_match record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_source not in ('manual', 'google_takeout', 'google_link', 'kml', 'gpx', 'csv', 'explore', 'trip') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 1000 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  if p_source in ('google_takeout', 'kml', 'gpx', 'csv') then
    insert into public.import_batches (user_id, source, file_name, status, total_count)
    values (v_uid, p_source, left(p_file_name, 255), 'pending', jsonb_array_length(p_items))
    returning id into v_batch;
  end if;

  for r in select x.e, (x.ord - 1)::int as i from jsonb_array_elements(p_items) with ordinality as x(e, ord) loop
    v_name := left(btrim(coalesce(r.e ->> 'name', '')), 200);
    begin
      v_lat := (r.e ->> 'lat')::double precision;
      v_lng := (r.e ->> 'lng')::double precision;
    exception when others then
      v_lat := null;
    end;
    if v_name = '' or v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180
       or (v_lat = 0 and v_lng = 0) then
      v_invalid := v_invalid + 1;
      v_results := v_results || jsonb_build_object('i', r.i, 'status', 'invalid');
      continue;
    end if;

    v_key := public.place_name_key(v_name);
    v_point := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
    v_osm := nullif(r.e ->> 'osm_ref', '');
    if v_osm is not null and v_osm !~ '^[nwr][0-9]+$' then v_osm := null; end if;
    v_src_ref := left(nullif(r.e ->> 'source_ref', ''), 1024);
    v_category := nullif(r.e ->> 'category', '');
    if v_category is not null and v_category not in ('restaurant', 'cafe', 'attraction', 'historic', 'nature', 'hotel', 'camping', 'fuel', 'other') then
      v_category := null;
    end if;
    v_list := case when r.e ->> 'list_type' = 'want_to_go' then 'want_to_go' else 'favorite' end;

    -- Yakındaki OSM yeriyle eşleştir (kategori ve OSM kimliği için)
    if v_osm is null or v_category is null then
      select f.osm_ref, f.category into v_match
        from public.geo_features f
       where f.kind = 'poi'
         and extensions.st_dwithin(f.geog, v_point, 60)
         and extensions.similarity(f.name_search, v_key) >= 0.35
       order by extensions.similarity(f.name_search, v_key) desc, extensions.st_distance(f.geog, v_point)
       limit 1;
      if found then
        v_osm := coalesce(v_osm, v_match.osm_ref);
        v_category := coalesce(v_category, public.favorite_category_for(v_match.category));
      end if;
    end if;

    select s.id into v_dup
      from public.saved_places s
     where s.user_id = v_uid
       and (
         (v_osm is not null and s.osm_ref = v_osm)
         or (v_src_ref is not null and s.source = p_source and s.source_ref = v_src_ref)
         or (s.name_key = v_key and extensions.st_dwithin(
               extensions.st_setsrid(extensions.st_makepoint(s.longitude, s.latitude), 4326)::extensions.geography, v_point, 75))
       )
     limit 1;
    if found then
      v_duplicates := v_duplicates + 1;
      v_results := v_results || jsonb_build_object('i', r.i, 'status', 'duplicate', 'id', v_dup);
      continue;
    end if;

    insert into public.saved_places (
      user_id, name, category, list_type, latitude, longitude, address, notes,
      osm_ref, source, source_ref, source_list_name, import_batch_id
    ) values (
      v_uid, v_name, coalesce(v_category, 'other'), v_list, v_lat, v_lng,
      left(nullif(btrim(r.e ->> 'address'), ''), 500),
      left(nullif(btrim(r.e ->> 'notes'), ''), 5000),
      v_osm, p_source, v_src_ref, left(nullif(btrim(r.e ->> 'list_name'), ''), 200), v_batch
    ) returning id into v_id;
    v_imported := v_imported + 1;
    v_results := v_results || jsonb_build_object('i', r.i, 'status', 'imported', 'id', v_id);
  end loop;

  if v_batch is not null then
    update public.import_batches
       set status = 'completed', imported_count = v_imported, skipped_count = v_duplicates + v_invalid
     where id = v_batch;
  end if;

  return jsonb_build_object(
    'batch_id', v_batch, 'imported', v_imported, 'duplicates', v_duplicates, 'invalid', v_invalid, 'results', v_results);
end;
$$;

-- ---------------------------------------------------------------------------
-- match_place_names(p_queries): koordinatı olmayan kayıtlar için ada göre en iyi eşleşme.
--   p_queries: normalize edilmiş adlar (istemci normalizeForSearch ile), en fazla 200.
--   Yalnızca güçlü eşleşmeler döner (score ≥ 0.6); sonuç "tahmini konum" olarak kullanıcıya sorulur.
-- ---------------------------------------------------------------------------
create or replace function public.match_place_names(p_queries text[])
returns table (i int, osm_ref text, name text, admin text, category text, lat double precision, lng double precision, score real)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_queries is null or cardinality(p_queries) > 200 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  return query
  select q.i::int, m.osm_ref, m.name, m.admin, m.category, m.lat, m.lng, m.score
    from unnest(p_queries) with ordinality as q(text, i)
    cross join lateral (
      select * from public.search_places(left(q.text, 120), null, null, 1)
    ) m
   where char_length(q.text) >= 2 and m.score >= 0.6;
end;
$$;

revoke execute on function public.save_places(text, text, jsonb) from public, anon;
grant execute on function public.save_places(text, text, jsonb) to authenticated;
revoke execute on function public.match_place_names(text[]) from public, anon;
grant execute on function public.match_place_names(text[]) to authenticated;

-- Hız sınırı: favori kaydetme / içe aktarma ('places')
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
    ('places',        60, 1000)
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
