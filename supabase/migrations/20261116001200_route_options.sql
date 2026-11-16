-- ============================================================================
-- ROVIA · Rota seçenekleri ve rota üzerindeki öneriler
-- * trips.route_options: kaydedilen planın rota seçenekleri (ücretli yol / otoyol / feribot kaçınma),
--   plan yeniden açıldığında aynı rota hesaplanır.
-- * save_trip_plan(..., p_route_options): seçenekleri planla birlikte atomik kaydeder.
-- * route_suggestions(): rota çevresindeki öne çıkan turistik/tarihî/doğal yerler (aday listesi;
--   rota boyunca dağıtma ve en fazla 6'ya indirme uygulamada yapılır).
-- ============================================================================

alter table public.trips
  add column route_options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(route_options) = 'object'
           and route_options - array['avoid_tolls', 'avoid_highways', 'avoid_ferries'] = '{}'::jsonb);

-- Seçenekleri yalnızca bilinen anahtarlar ve true değerleriyle sakla
create or replace function public.normalize_route_options(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb)
  from unnest(array['avoid_tolls', 'avoid_highways', 'avoid_ferries']) as k
  where coalesce((p ->> k)::boolean, false)
$$;

drop function public.save_trip_plan(uuid, int, text, text, date, jsonb, jsonb);

create function public.save_trip_plan(
  p_trip_id          uuid,
  p_expected_version int,
  p_title            text,
  p_description      text,
  p_planned_date     date,
  p_stops            jsonb,
  p_route            jsonb,
  p_route_options    jsonb default '{}'::jsonb
)
returns table (trip_id uuid, trip_version int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_id       uuid;
  v_version  int;
  v_status   text;
  v_count    int;
  v_polyline text;
  v_distance int;
  v_duration int;
  v_legs     jsonb;
  v_toll     boolean := false;
  v_ferry    boolean := false;
  v_options  jsonb := public.normalize_route_options(coalesce(p_route_options, '{}'::jsonb));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'invalid_stops' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_stops);
  if v_count < 2 or v_count > 20 then
    raise exception 'invalid_stops' using errcode = '22023';
  end if;

  if p_route is not null then
    v_polyline := p_route ->> 'polyline';
    v_distance := (p_route ->> 'distance_m')::int;
    v_duration := (p_route ->> 'duration_s')::int;
    v_legs     := p_route -> 'legs';
    v_toll     := coalesce((p_route ->> 'has_toll')::boolean, false);
    v_ferry    := coalesce((p_route ->> 'has_ferry')::boolean, false);
    if v_polyline is null or v_distance is null or v_duration is null
       or v_legs is null or jsonb_typeof(v_legs) <> 'array' or jsonb_array_length(v_legs) <> v_count - 1 then
      raise exception 'invalid_route' using errcode = '22023';
    end if;
  end if;

  if p_trip_id is null then
    insert into public.trips as t (
      user_id, title, description, planned_date, route_options,
      route_polyline, route_distance_m, route_duration_s, route_legs, route_has_toll, route_has_ferry, route_computed_at
    )
    values (
      v_uid, p_title, p_description, p_planned_date, v_options,
      v_polyline, v_distance, v_duration, v_legs, v_toll, v_ferry, case when p_route is null then null else now() end
    )
    returning t.id, t.version into v_id, v_version;
  else
    update public.trips as t
       set title = p_title,
           description = p_description,
           planned_date = p_planned_date,
           route_options = v_options,
           route_polyline = v_polyline,
           route_distance_m = v_distance,
           route_duration_s = v_duration,
           route_legs = v_legs,
           route_has_toll = v_toll,
           route_has_ferry = v_ferry,
           route_computed_at = case when p_route is null then null else now() end
     where t.id = p_trip_id
       and t.version = p_expected_version
       and t.status = 'planned'
    returning t.id, t.version into v_id, v_version;

    if v_id is null then
      select t.status into v_status from public.trips t where t.id = p_trip_id;
      if not found then
        raise exception 'trip_not_found' using errcode = 'PT404';
      elsif v_status <> 'planned' then
        raise exception 'trip_not_editable' using errcode = 'PT409';
      else
        raise exception 'trip_conflict' using errcode = 'PT409';
      end if;
    end if;

    delete from public.trip_stops s where s.trip_id = v_id;
  end if;

  insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, address, latitude, longitude, osm_ref)
  select v_id,
         v_uid,
         case when x.ord = 1 then 'origin' when x.ord = v_count then 'destination' else 'waypoint' end,
         x.ord - 1,
         x.e ->> 'name',
         nullif(x.e ->> 'address', ''),
         (x.e ->> 'lat')::double precision,
         (x.e ->> 'lng')::double precision,
         nullif(x.e ->> 'ref', '')
    from jsonb_array_elements(p_stops) with ordinality as x(e, ord);

  return query select v_id, v_version;
end;
$$;

-- ---------------------------------------------------------------------------- Rota üzerindeki öneriler
/**
 * Rota çevresindeki öne çıkan yerler: tarihî, müze, doğal güzellik, turistik nokta.
 * Yalnızca "kayda değer" olanlar: Vikipedi/Vikiveri kaydı, koruma (heritage) etiketi ya da güçlü tür
 * (kale, ören yeri, şelale, kanyon, milli park, kervansaray, seyir noktası, müze...).
 * Puan: önem + tür + koruma − rotaya uzaklık. Sonuç puana göre sıralı aday listesidir.
 */
create or replace function public.route_suggestions(p_route jsonb, p_radius_m int default 3000, p_limit int default 40)
returns table (
  osm_ref text, name text, category text, subtype text, admin text, tags jsonb,
  lat double precision, lng double precision, distance_m double precision, along_m double precision, score double precision
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
  if p_radius_m not between 500 and 10000 or p_limit not between 1 and 100 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  route_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_route::text), 4326);
  route_len := extensions.st_length(route_geom::extensions.geography);

  return query
  with c as (
    select f.*, extensions.st_distance(f.geog, route_geom::extensions.geography) as dist
    from public.geo_features f
    where f.kind = 'poi'
      and f.category in ('historic', 'museum', 'nature', 'attraction')
      and extensions.st_dwithin(f.geog, route_geom::extensions.geography, p_radius_m)
      and (f.tags ? 'wikidata' or f.tags ? 'wikipedia' or f.tags ? 'heritage'
           or f.subtype in ('castle', 'archaeological_site', 'ruins', 'fort', 'caravanserai', 'aqueduct', 'citywalls',
                            'waterfall', 'canyon', 'gorge', 'cave_entrance', 'national_park', 'nature_reserve',
                            'viewpoint', 'museum', 'theme_park', 'zoo', 'aquarium'))
  )
  select c.osm_ref, c.name, c.category, c.subtype, c.admin, c.tags,
         extensions.st_y(c.geog::extensions.geometry), extensions.st_x(c.geog::extensions.geometry),
         c.dist,
         extensions.st_linelocatepoint(route_geom, c.geog::extensions.geometry) * route_len,
         (c.importance
          + case when c.subtype in ('castle', 'archaeological_site', 'waterfall', 'canyon', 'gorge', 'national_park',
                                    'caravanserai', 'aqueduct', 'museum', 'cave_entrance') then 0.15
                 when c.subtype in ('ruins', 'fort', 'viewpoint', 'nature_reserve', 'citywalls', 'theme_park', 'zoo', 'aquarium') then 0.08
                 else 0 end
          + case when c.tags ? 'heritage' then 0.08 else 0 end
          - 0.1 * (c.dist / p_radius_m))::double precision as score
  from c
  order by 11 desc, 9
  limit p_limit;
end;
$$;

revoke all on function public.route_suggestions(jsonb, int, int), public.normalize_route_options(jsonb),
  public.save_trip_plan(uuid, int, text, text, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.route_suggestions(jsonb, int, int), public.normalize_route_options(jsonb),
  public.save_trip_plan(uuid, int, text, text, date, jsonb, jsonb, jsonb) to authenticated;
