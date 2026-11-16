-- ============================================================================
-- ROVIA · OSM içe aktarma — dönüşüm ve yayınlama (saf SQL; load.sql tarafından çağrılır)
-- Girdi: geçici tablolar stg_meta, stg_features, stg_admin (load.sql oluşturur).
-- Tüm değişiklik çağıranın işlemi (transaction) içinde olur; okuyucular commit'e
-- kadar eski veriyi görür (DELETE + INSERT, MVCC — TRUNCATE gibi kilitlemez).
-- ============================================================================

-- İl / ilçe sınırları (sadeleştirilmiş, geçerli hale getirilmiş çokgenler)
delete from public.geo_admin_areas;
insert into public.geo_admin_areas (osm_ref, name, admin_level, geom)
select osm_ref, left(name, 200), admin_level::smallint,
       extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
         extensions.st_simplifypreservetopology(
           extensions.st_setsrid(extensions.st_geomfromwkb(decode(wkb, 'hex')), 4326), 0.0005)), 3))
from stg_admin
where admin_level in ('4', '6') and coalesce(name, '') <> ''
on conflict (osm_ref) do nothing;

-- Özellikler: alanlar temsil noktasına (yüzey üzerindeki nokta) çevrilir
create temp table stg_points on commit drop as
select distinct on (osm_ref)
       osm_ref, kind, category, nullif(subtype, '') as subtype, left(name, 300) as name, name_search,
       coalesce(nullif(tags, ''), '{}')::jsonb as tags,
       least(1, greatest(0, importance::real)) as importance,
       extensions.st_pointonsurface(extensions.st_setsrid(extensions.st_geomfromwkb(decode(wkb, 'hex')), 4326)) as pt,
       null::text as admin
from stg_features
where coalesce(name, '') <> '' and coalesce(name_search, '') <> '';

create index on stg_points using gist (pt);

update stg_points s
set admin = nullif(concat_ws(', ',
              d.name,
              case when p.name is distinct from d.name then p.name end), '')
from stg_points s2
left join lateral (select a.name from public.geo_admin_areas a
                   where a.admin_level = 6 and extensions.st_covers(a.geom, s2.pt) limit 1) d on true
left join lateral (select a.name from public.geo_admin_areas a
                   where a.admin_level = 4 and extensions.st_covers(a.geom, s2.pt) limit 1) p on true
where s.osm_ref = s2.osm_ref;

delete from public.geo_features;
insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, admin, geog, tags, importance)
select osm_ref, kind, category, subtype, name, name_search, admin, pt::extensions.geography, tags, importance
from stg_points
where pt is not null and not extensions.st_isempty(pt)
  and osm_ref ~ '^[nwr][0-9]+$' and kind in ('settlement', 'poi');

insert into public.geo_import_runs (source, data_timestamp, feature_count, admin_count)
select m.source, m.data_timestamp,
       (select count(*) from public.geo_features),
       (select count(*) from public.geo_admin_areas)
from stg_meta m;
