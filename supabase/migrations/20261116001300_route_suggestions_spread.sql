-- ============================================================================
-- ROVIA · Rota önerileri: rota boyunca dağılım
-- Yoğun şehirlerdeki (ör. İstanbul'un tarihî yarımadası) çok sayıda Vikipedi kayıtlı müze aday listesini
-- dolduruyor, yolun ortasındaki yerler hiç gelmiyordu. Artık:
-- * başlangıç ve varışın hemen çevresi (rota uzunluğunun %10'u, en fazla 15 km) önerilmez — zaten oradasın;
-- * rota 12 parçaya bölünür, her parçadan en fazla 3 aday döner.
-- ============================================================================

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
  skip_m double precision;
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
  skip_m := least(15000, route_len * 0.1);

  return query
  with c as (
    select f.*,
           extensions.st_distance(f.geog, route_geom::extensions.geography) as dist,
           extensions.st_linelocatepoint(route_geom, f.geog::extensions.geometry) * route_len as along
    from public.geo_features f
    where f.kind = 'poi'
      and f.category in ('historic', 'museum', 'nature', 'attraction')
      and extensions.st_dwithin(f.geog, route_geom::extensions.geography, p_radius_m)
      and (f.tags ? 'wikidata' or f.tags ? 'wikipedia' or f.tags ? 'heritage'
           or f.subtype in ('castle', 'archaeological_site', 'ruins', 'fort', 'caravanserai', 'aqueduct', 'citywalls',
                            'waterfall', 'canyon', 'gorge', 'cave_entrance', 'national_park', 'nature_reserve',
                            'viewpoint', 'museum', 'theme_park', 'zoo', 'aquarium'))
  ),
  scored as (
    select c.*,
           (c.importance
            + case when c.subtype in ('castle', 'archaeological_site', 'waterfall', 'canyon', 'gorge', 'national_park',
                                      'caravanserai', 'aqueduct', 'museum', 'cave_entrance') then 0.15
                   when c.subtype in ('ruins', 'fort', 'viewpoint', 'nature_reserve', 'citywalls', 'theme_park', 'zoo', 'aquarium') then 0.08
                   else 0 end
            + case when c.tags ? 'heritage' then 0.08 else 0 end
            - 0.1 * (c.dist / p_radius_m))::double precision as sc,
           least(11, floor(c.along / greatest(route_len, 1) * 12))::int as bucket
    from c
    where c.along >= skip_m and c.along <= route_len - skip_m
  ),
  ranked as (
    select s.*, row_number() over (partition by s.bucket order by s.sc desc, s.dist) as rn from scored s
  )
  select r.osm_ref, r.name, r.category, r.subtype, r.admin, r.tags,
         extensions.st_y(r.geog::extensions.geometry), extensions.st_x(r.geog::extensions.geometry),
         r.dist, r.along, r.sc
  from ranked r
  where r.rn <= 3
  order by r.sc desc, r.dist
  limit p_limit;
end;
$$;
