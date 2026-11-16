-- ============================================================================
-- ROVIA · Açık kaynak coğrafi veri katmanı (PHASE 2)
-- OpenStreetMap (ODbL) Türkiye verisinden türetilen yerleşim ve ilgi noktaları.
-- Veri .github/workflows/osm-import.yml ile periyodik olarak yüklenir.
-- Arama fonksiyonları SECURITY INVOKER'dır; okuma RLS ile oturum açmış kullanıcılara açıktır.
-- ============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------

/** Yerleşimler (il/ilçe merkezleri, kasaba, köy, mahalle) ve ilgi noktaları (POI). */
create table public.geo_features (
  osm_ref      text primary key check (osm_ref ~ '^[nwr][0-9]+$'),   -- n123 / w456 / r789
  kind         text not null check (kind in ('settlement', 'poi')),
  category     text not null check (char_length(category) between 1 and 40),
  subtype      text check (char_length(subtype) <= 60),              -- OSM değeri: castle, fuel, museum...
  name         text not null check (char_length(name) between 1 and 300),
  name_search  text not null,                                        -- normalize edilmiş ad (aksansız, küçük harf)
  admin        text check (char_length(admin) <= 200),               -- "İlçe, İl"
  geog         extensions.geography(Point, 4326) not null,
  tags         jsonb not null default '{}'::jsonb,                   -- seçili OSM etiketleri (saat, telefon, web, wikidata...)
  importance   real not null default 0 check (importance between 0 and 1)
);
create index geo_features_geog_idx on public.geo_features using gist (geog);
create index geo_features_name_trgm_idx on public.geo_features using gin (name_search extensions.gin_trgm_ops);
create index geo_features_category_idx on public.geo_features (category);

/** İl (admin_level 4) ve ilçe (admin_level 6) sınırları — ters geocoding için. */
create table public.geo_admin_areas (
  osm_ref      text primary key check (osm_ref ~ '^[wr][0-9]+$'),
  name         text not null,
  admin_level  smallint not null check (admin_level in (4, 6)),
  geom         extensions.geometry(MultiPolygon, 4326) not null
);
create index geo_admin_areas_geom_idx on public.geo_admin_areas using gist (geom);

/** İçe aktarma geçmişi (hangi OSM tarihli veri yüklü). */
create table public.geo_import_runs (
  id             bigint generated always as identity primary key,
  source         text not null,
  data_timestamp timestamptz,
  feature_count  int not null default 0,
  admin_count    int not null default 0,
  finished_at    timestamptz not null default now()
);

alter table public.geo_features enable row level security;
alter table public.geo_admin_areas enable row level security;
alter table public.geo_import_runs enable row level security;

-- OSM verisi kullanıcıya özel değildir: oturum açmış herkes okuyabilir, kimse API'den yazamaz.
create policy "geo_features: authenticated read" on public.geo_features for select to authenticated using (true);
create policy "geo_admin_areas: authenticated read" on public.geo_admin_areas for select to authenticated using (true);
create policy "geo_import_runs: authenticated read" on public.geo_import_runs for select to authenticated using (true);
revoke all on public.geo_features, public.geo_admin_areas, public.geo_import_runs from anon;
revoke insert, update, delete, truncate on public.geo_features, public.geo_admin_areas, public.geo_import_runs from authenticated;

-- ---------------------------------------------------------------------------
-- Rota boyunca arama
-- ---------------------------------------------------------------------------

/**
 * Rota (GeoJSON LineString) çevresinde, `p_radius_m` içindeki ilgi noktaları.
 * Sonuçlar rota boyunca konuma göre (yolculuk sırası) dizilir.
 */
create or replace function public.search_features_along_route(
  p_route jsonb,
  p_categories text[],
  p_radius_m int,
  p_limit int default 60
)
returns table (
  osm_ref text, name text, category text, subtype text, admin text, tags jsonb,
  lat double precision, lng double precision, distance_m double precision, along_m double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  route_geom extensions.geometry;
  route_len double precision;
begin
  if p_route ->> 'type' is distinct from 'LineString' then
    raise exception 'invalid_route' using errcode = '22023';
  end if;
  if jsonb_array_length(p_route -> 'coordinates') not between 2 and 5000 then
    raise exception 'invalid_route_length' using errcode = '22023';
  end if;
  if p_radius_m not between 100 and 50000 or p_limit not between 1 and 200
     or cardinality(p_categories) not between 1 and 20 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  route_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_route::text), 4326);
  route_len := extensions.st_length(route_geom::extensions.geography);

  return query
  select f.osm_ref, f.name, f.category, f.subtype, f.admin, f.tags,
         extensions.st_y(f.geog::extensions.geometry), extensions.st_x(f.geog::extensions.geometry),
         extensions.st_distance(f.geog, route_geom::extensions.geography),
         extensions.st_linelocatepoint(route_geom, f.geog::extensions.geometry) * route_len
  from public.geo_features f
  where f.kind = 'poi'
    and f.category = any (p_categories)
    and extensions.st_dwithin(f.geog, route_geom::extensions.geography, p_radius_m)
  order by 10, 9
  limit p_limit;
end;
$$;

/** Bir nokta çevresinde (rota yokken) ilgi noktaları, yakından uzağa. */
create or replace function public.search_features_nearby(
  p_lat double precision,
  p_lng double precision,
  p_categories text[],
  p_radius_m int,
  p_limit int default 60
)
returns table (
  osm_ref text, name text, category text, subtype text, admin text, tags jsonb,
  lat double precision, lng double precision, distance_m double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  center extensions.geography;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_radius_m not between 100 and 50000 or p_limit not between 1 and 200
     or cardinality(p_categories) not between 1 and 20 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  center := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  return query
  select f.osm_ref, f.name, f.category, f.subtype, f.admin, f.tags,
         extensions.st_y(f.geog::extensions.geometry), extensions.st_x(f.geog::extensions.geometry),
         extensions.st_distance(f.geog, center)
  from public.geo_features f
  where f.kind = 'poi'
    and f.category = any (p_categories)
    and extensions.st_dwithin(f.geog, center, p_radius_m)
  order by 9
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- İsimle arama (otomatik tamamlama) ve ters geocoding
-- ---------------------------------------------------------------------------

/**
 * Yazarken arama. `p_query` istemcide normalize edilmiş olmalı (aksansız, küçük harf).
 * Sıralama: metin benzerliği + önem (il > ilçe > köy > POI) + yakınlık.
 */
create or replace function public.search_places(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit int default 8
)
returns table (
  osm_ref text, kind text, name text, category text, subtype text, admin text,
  lat double precision, lng double precision, score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  bias extensions.geography;
begin
  if char_length(coalesce(p_query, '')) not between 2 and 120 or p_limit not between 1 and 20 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_lat is not null and p_lng is not null then
    bias := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  return query
  with candidates as (
    select f.*,
           greatest(
             extensions.similarity(f.name_search, p_query),
             extensions.word_similarity(p_query, f.name_search),
             case when f.name_search like p_query || '%' then 0.9 else 0 end
           )::real as sim
    from public.geo_features f
    where f.name_search operator(extensions.%>) p_query
       or f.name_search like p_query || '%'
    limit 400
  )
  select c.osm_ref, c.kind, c.name, c.category, c.subtype, c.admin,
         extensions.st_y(c.geog::extensions.geometry), extensions.st_x(c.geog::extensions.geometry),
         (c.sim * 0.65 + c.importance * 0.25
           + case when bias is null then 0
                  else 0.10 * (1 - least(1, extensions.st_distance(c.geog, bias) / 300000.0)) end)::real
  from candidates c
  order by 9 desc
  limit p_limit;
end;
$$;

/** Koordinattan "Yerleşim, İlçe, İl" etiketi. */
create or replace function public.reverse_geocode(p_lat double precision, p_lng double precision)
returns table (label text, settlement text, district text, province text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  pt extensions.geometry;
  v_settlement text;
  v_district text;
  v_province text;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  pt := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  select f.name into v_settlement
  from public.geo_features f
  where f.kind = 'settlement' and extensions.st_dwithin(f.geog, pt::extensions.geography, 15000)
  order by f.geog operator(extensions.<->) pt::extensions.geography
  limit 1;

  select a.name into v_district from public.geo_admin_areas a
  where a.admin_level = 6 and extensions.st_covers(a.geom, pt) limit 1;
  select a.name into v_province from public.geo_admin_areas a
  where a.admin_level = 4 and extensions.st_covers(a.geom, pt) limit 1;

  return query select
    nullif(concat_ws(', ',
      v_settlement,
      case when v_district is distinct from v_settlement then v_district end,
      case when v_province is distinct from v_district then v_province end), ''),
    v_settlement, v_district, v_province;
end;
$$;

revoke execute on function public.search_features_along_route(jsonb, text[], int, int) from public, anon;
revoke execute on function public.search_features_nearby(double precision, double precision, text[], int, int) from public, anon;
revoke execute on function public.search_places(text, double precision, double precision, int) from public, anon;
revoke execute on function public.reverse_geocode(double precision, double precision) from public, anon;
grant execute on function public.search_features_along_route(jsonb, text[], int, int) to authenticated;
grant execute on function public.search_features_nearby(double precision, double precision, text[], int, int) to authenticated;
grant execute on function public.search_places(text, double precision, double precision, int) to authenticated;
grant execute on function public.reverse_geocode(double precision, double precision) to authenticated;
