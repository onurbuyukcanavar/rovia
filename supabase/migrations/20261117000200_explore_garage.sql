-- ============================================================================
-- ROVIA · PHASE 8 — ROVIA Explore ve Garage
-- * Keşif kategorileri: açık veri (OpenStreetMap) üzerinde 14 keşif kategorisi + öne çıkanlar.
--   Kategori eşlemesi tek yerde (explore_match) tutulur; harita alanında veya rota boyunca aranır.
-- * Garaj: varsayılan aracı tek işlemle değiştirme.
-- * Maliyet: yolculuk başına maliyet varsayımları ve kullanıcının yakıt fiyatı varsayılanları
--   (fiyatlar kullanıcı girdisidir; tarihleriyle saklanır, kesin bilgi gibi sunulmaz).
-- ============================================================================

-- ---------------------------------------------------------------------------- Keşif
create or replace function public.explore_match(p_category text, p_kind text, p_cat text, p_subtype text, p_tags jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'featured'   then p_kind = 'poi' and p_cat in ('historic', 'museum', 'nature', 'attraction') and (p_tags ? 'wikidata' or p_tags ? 'heritage')
    when 'historic'   then p_cat = 'historic' and p_subtype in ('monument', 'bridge', 'aqueduct', 'caravanserai', 'tomb', 'city_gate', 'citywalls')
    when 'ancient'    then p_cat = 'historic' and p_subtype in ('archaeological_site', 'ruins')
    when 'museum'     then p_cat = 'museum'
    when 'mosque'     then (p_cat = 'worship' and p_subtype = 'muslim') or (p_cat = 'historic' and p_subtype = 'mosque')
    when 'church'     then (p_cat = 'worship' and p_subtype = 'christian') or (p_cat = 'historic' and p_subtype = 'church')
    when 'castle'     then p_cat = 'historic' and p_subtype in ('castle', 'fort')
    when 'park'       then p_cat = 'nature' and p_subtype in ('national_park', 'nature_reserve')
    when 'lake'       then p_cat = 'nature' and p_subtype = 'lake'
    when 'waterfall'  then p_cat = 'nature' and p_subtype = 'waterfall'
    when 'mountain'   then p_cat = 'nature' and p_subtype in ('peak', 'volcano')
    when 'viewpoint'  then p_cat = 'nature' and p_subtype = 'viewpoint'
    when 'village'    then p_kind = 'settlement' and p_subtype in ('village', 'town')
    when 'gastronomy' then p_cat = 'restaurant'
                           and coalesce(p_tags ->> 'cuisine', '') ~* '(turkish|kebab|regional|local|pide|lahmacun|kofte|köfte|manti|mantı|ottoman|meze|seafood|fish)'
    when 'heritage'   then p_cat in ('historic', 'museum') and (p_tags ? 'heritage' or p_tags ? 'wikidata')
    else false
  end
$$;

-- Harita alanında (p_bbox: [batı, güney, doğu, kuzey]) ya da rota boyunca (p_route: GeoJSON LineString) keşif.
-- Sıralama: önem (Wikidata/miras etiketi olanlar önce), sonra rota üzerindeki konum ya da ad.
create or replace function public.explore_features(
  p_category text,
  p_bbox double precision[] default null,
  p_route jsonb default null,
  p_radius_m int default 5000,
  p_limit int default 150
)
returns table (
  osm_ref text, name text, kind text, category text, subtype text, admin text, tags jsonb,
  lat double precision, lng double precision, importance real, distance_m double precision, along_m double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_env extensions.geometry;
  v_route extensions.geometry;
  v_len double precision;
  v_max_area double precision;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_category not in ('featured', 'historic', 'ancient', 'museum', 'mosque', 'church', 'castle', 'park', 'lake',
                        'waterfall', 'mountain', 'viewpoint', 'village', 'gastronomy', 'heritage')
     or p_limit not between 1 and 300 or p_radius_m not between 200 and 30000 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  if p_route is not null then
    if p_route ->> 'type' is distinct from 'LineString' or jsonb_array_length(p_route -> 'coordinates') not between 2 and 5000 then
      raise exception 'invalid_route' using errcode = '22023';
    end if;
    v_route := extensions.st_setsrid(extensions.st_geomfromgeojson(p_route::text), 4326);
    v_len := extensions.st_length(v_route::extensions.geography);
    return query
    select f.osm_ref, f.name, f.kind, f.category, f.subtype, f.admin, f.tags,
           extensions.st_y(f.geog::extensions.geometry), extensions.st_x(f.geog::extensions.geometry), f.importance,
           extensions.st_distance(f.geog, v_route::extensions.geography),
           extensions.st_linelocatepoint(v_route, f.geog::extensions.geometry) * v_len
    from public.geo_features f
    where extensions.st_dwithin(f.geog, v_route::extensions.geography, p_radius_m)
      and public.explore_match(p_category, f.kind, f.category, f.subtype, f.tags)
    order by f.importance desc, (f.tags ? 'wikidata') desc, 12
    limit p_limit;
    return;
  end if;

  if p_bbox is null or cardinality(p_bbox) <> 4
     or p_bbox[1] >= p_bbox[3] or p_bbox[2] >= p_bbox[4]
     or p_bbox[1] < -180 or p_bbox[3] > 180 or p_bbox[2] < -90 or p_bbox[4] > 90 then
    raise exception 'invalid_bbox' using errcode = '22023';
  end if;
  -- Çok geniş alanlar (Türkiye'nin tamamı ~ 19°x6°) yalnızca öne çıkanlar için; diğerlerinde yakınlaşılmalı
  v_max_area := 40;
  if p_category = 'featured' then
    v_max_area := 200;
  end if;
  if (p_bbox[3] - p_bbox[1]) * (p_bbox[4] - p_bbox[2]) > v_max_area then
    raise exception 'area_too_large' using errcode = '22023';
  end if;
  v_env := extensions.st_makeenvelope(p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], 4326);
  return query
  select f.osm_ref, f.name, f.kind, f.category, f.subtype, f.admin, f.tags,
         extensions.st_y(f.geog::extensions.geometry), extensions.st_x(f.geog::extensions.geometry), f.importance,
         null::double precision, null::double precision
  from public.geo_features f
  where f.geog operator(extensions.&&) v_env::extensions.geography
    and public.explore_match(p_category, f.kind, f.category, f.subtype, f.tags)
  order by f.importance desc, (f.tags ? 'wikidata') desc, f.name
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------- Garaj
-- Varsayılan aracı değiştirir (önceki varsayılan kaldırılır). p_id null → hiçbiri varsayılan değil.
create or replace function public.vehicle_set_default(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_id is not null and not exists (select 1 from public.vehicles where id = p_id) then
    raise exception 'vehicle_not_found' using errcode = 'PT404';
  end if;
  update public.vehicles set is_default = false where is_default and id is distinct from p_id;
  if p_id is not null then
    update public.vehicles set is_default = true where id = p_id;
  end if;
end;
$$;

-- Bir kullanıcı en fazla 20 araç ekleyebilir
create or replace function public.vehicles_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.vehicles where user_id = new.user_id) >= 20 then
    raise exception 'too_many_vehicles' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger vehicles_limit before insert on public.vehicles for each row execute function public.vehicles_limit();

-- ---------------------------------------------------------------------------- Maliyet varsayımları
-- trips.cost_assumptions: { vehicleId?, fuelType, consumption, fuelPrice, priceDate, tolls: [{label, amount}], extra?: [{label, amount}] }
-- user_settings.cost_defaults: { fuelPrices: { gasoline?: {price, date}, diesel?: ..., lpg?: ..., electric?: ... } }
alter table public.trips add column cost_assumptions jsonb
  check (cost_assumptions is null or (jsonb_typeof(cost_assumptions) = 'object' and octet_length(cost_assumptions::text) <= 8000));
alter table public.user_settings add column cost_defaults jsonb
  check (cost_defaults is null or (jsonb_typeof(cost_defaults) = 'object' and octet_length(cost_defaults::text) <= 4000));

revoke all on function public.explore_match(text, text, text, text, jsonb), public.explore_features(text, double precision[], jsonb, int, int),
  public.vehicle_set_default(uuid), public.vehicles_limit() from public, anon;
grant execute on function public.explore_match(text, text, text, text, jsonb), public.explore_features(text, double precision[], jsonb, int, int),
  public.vehicle_set_default(uuid) to authenticated;

-- ---------------------------------------------------------------------------- Hız: kategoriler önceden hesaplanır
-- explore_match satır başına çağrıldığında Türkiye geneli sorgu ~9 sn sürüyordu. Her nesnenin
-- eşleştiği keşif kategorileri oluşturulmuş sütunda tutulur ve GIN indeksiyle aranır.
create or replace function public.explore_categories(p_kind text, p_cat text, p_subtype text, p_tags jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(c), '{}') from unnest(array['featured', 'historic', 'ancient', 'museum', 'mosque', 'church', 'castle',
    'park', 'lake', 'waterfall', 'mountain', 'viewpoint', 'village', 'gastronomy', 'heritage']) c
  where public.explore_match(c, p_kind, p_cat, p_subtype, p_tags)
$$;

alter table public.geo_features
  add column explore text[] generated always as (public.explore_categories(kind, category, subtype, tags)) stored;
create index geo_features_explore_idx on public.geo_features using gin (explore) where explore <> '{}';

create or replace function public.explore_features(
  p_category text,
  p_bbox double precision[] default null,
  p_route jsonb default null,
  p_radius_m int default 5000,
  p_limit int default 150
)
returns table (
  osm_ref text, name text, kind text, category text, subtype text, admin text, tags jsonb,
  lat double precision, lng double precision, importance real, distance_m double precision, along_m double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_env extensions.geometry;
  v_route extensions.geometry;
  v_len double precision;
  v_max_area double precision;
  v_cat text[] := array[p_category];
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_category not in ('featured', 'historic', 'ancient', 'museum', 'mosque', 'church', 'castle', 'park', 'lake',
                        'waterfall', 'mountain', 'viewpoint', 'village', 'gastronomy', 'heritage')
     or p_limit not between 1 and 300 or p_radius_m not between 200 and 30000 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  if p_route is not null then
    if p_route ->> 'type' is distinct from 'LineString' or jsonb_array_length(p_route -> 'coordinates') not between 2 and 5000 then
      raise exception 'invalid_route' using errcode = '22023';
    end if;
    v_route := extensions.st_setsrid(extensions.st_geomfromgeojson(p_route::text), 4326);
    v_len := extensions.st_length(v_route::extensions.geography);
    return query
    select f.osm_ref, f.name, f.kind, f.category, f.subtype, f.admin, f.tags,
           extensions.st_y(f.geog::extensions.geometry), extensions.st_x(f.geog::extensions.geometry), f.importance,
           extensions.st_distance(f.geog, v_route::extensions.geography),
           extensions.st_linelocatepoint(v_route, f.geog::extensions.geometry) * v_len
    from public.geo_features f
    where f.explore operator(pg_catalog.@>) v_cat and f.explore <> '{}'
      and extensions.st_dwithin(f.geog, v_route::extensions.geography, p_radius_m)
    order by f.importance desc, (f.tags ? 'wikidata') desc, 12
    limit p_limit;
    return;
  end if;

  if p_bbox is null or cardinality(p_bbox) <> 4
     or p_bbox[1] >= p_bbox[3] or p_bbox[2] >= p_bbox[4]
     or p_bbox[1] < -180 or p_bbox[3] > 180 or p_bbox[2] < -90 or p_bbox[4] > 90 then
    raise exception 'invalid_bbox' using errcode = '22023';
  end if;
  v_max_area := 40;
  if p_category = 'featured' then
    v_max_area := 200;
  end if;
  if (p_bbox[3] - p_bbox[1]) * (p_bbox[4] - p_bbox[2]) > v_max_area then
    raise exception 'area_too_large' using errcode = '22023';
  end if;
  v_env := extensions.st_makeenvelope(p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], 4326);
  return query
  select f.osm_ref, f.name, f.kind, f.category, f.subtype, f.admin, f.tags,
         extensions.st_y(f.geog::extensions.geometry), extensions.st_x(f.geog::extensions.geometry), f.importance,
         null::double precision, null::double precision
  from public.geo_features f
  where f.explore operator(pg_catalog.@>) v_cat and f.explore <> '{}'
    and f.geog operator(extensions.&&) v_env::extensions.geography
  order by f.importance desc, (f.tags ? 'wikidata') desc, f.name
  limit p_limit;
end;
$$;

revoke all on function public.explore_categories(text, text, text, jsonb) from public, anon;
grant execute on function public.explore_categories(text, text, text, jsonb) to authenticated;
