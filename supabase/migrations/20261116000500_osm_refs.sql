-- ============================================================================
-- ROVIA · Google Places alanlarından OSM referanslarına geçiş (ADR-001)
-- Google Places verisi saklanamadığı için tasarlanan alanlar (google_place_id,
-- 30 günlük koordinat önbelleği) artık gerekmez: OSM verisi ODbL ile saklanabilir.
-- Tablolar bu migration anında boştur (PHASE 1–2'de kullanıcı verisi yazılmadı).
-- ============================================================================

-- saved_places ---------------------------------------------------------------
alter table public.saved_places rename column google_place_id to osm_ref;
alter table public.saved_places drop column coords_cached_at;
alter table public.saved_places drop constraint saved_places_locatable;
alter table public.saved_places drop constraint saved_places_coords_pair;
alter table public.saved_places alter column latitude set not null, alter column longitude set not null;
alter table public.saved_places drop constraint if exists saved_places_google_place_id_check;
alter table public.saved_places add constraint saved_places_osm_ref_check check (osm_ref ~ '^[nwr][0-9]+$');
alter index public.saved_places_user_google_place_key rename to saved_places_user_osm_ref_key;

-- trip_stops ------------------------------------------------------------------
alter table public.trip_stops rename column google_place_id to osm_ref;
alter table public.trip_stops drop column coords_cached_at;
alter table public.trip_stops drop constraint trip_stops_locatable;
alter table public.trip_stops drop constraint trip_stops_coords_pair;
alter table public.trip_stops alter column latitude set not null, alter column longitude set not null;
alter table public.trip_stops drop constraint if exists trip_stops_google_place_id_check;
alter table public.trip_stops add constraint trip_stops_osm_ref_check check (osm_ref ~ '^[nwr][0-9]+$');

-- travelogue_entries ------------------------------------------------------------
alter table public.travelogue_entries rename column google_place_id to osm_ref;
alter table public.travelogue_entries drop constraint if exists travelogue_entries_google_place_id_check;
alter table public.travelogue_entries add constraint travelogue_entries_osm_ref_check check (osm_ref ~ '^[nwr][0-9]+$');

-- Panel istatistiği: ziyaret edilen yer anahtarı artık osm_ref ---------------------
create or replace function public.dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'completed_trips', (select count(*) from public.trips where status in ('completed', 'archived')),
    'total_distance_m', coalesce((select sum(total_distance_m) from public.trip_recordings where status = 'completed'), 0),
    'total_duration_s', coalesce((select sum(elapsed_duration_s) from public.trip_recordings where status = 'completed'), 0),
    'visited_places', (
      select count(*) from (
        select coalesce(s.osm_ref, round(s.latitude::numeric, 3) || ',' || round(s.longitude::numeric, 3))
        from public.trip_stops s
        join public.trips t on t.id = s.trip_id
        where t.status in ('completed', 'archived')
        union
        select coalesce(e.osm_ref, round(e.latitude::numeric, 3) || ',' || round(e.longitude::numeric, 3))
        from public.travelogue_entries e
        where e.latitude is not null or e.osm_ref is not null
      ) places
    ),
    'travelogues', (select count(*) from public.travelogues),
    'photos', (select count(*) from public.media_assets)
  );
$$;
