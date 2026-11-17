-- ============================================================================
-- ROVIA · PHASE 9 — GPX/KML iz içe aktarma
--
-- Dosya tarayıcıda ayrıştırılır ve doğrulanır; sunucuya yalnızca SADELEŞTİRİLMİŞ iz
-- (polyline5, bölümler ' ' ile ayrılmış), özet istatistikler ve en fazla 20 durak gelir.
-- Ham noktalar (gps_points) SAKLANMAZ: gizlilik (dosyadaki tam zaman/konum dizisi) ve boyut.
-- Bu yüzden içe aktarılan kayıtların "ham veriyi sil" seçeneği yoktur; özet ve iz kalıcıdır.
--
-- trip_import_track(): SECURITY INVOKER — RLS ve enforce_parent_owner aynen uygulanır.
--   p_mode 'recording': tamamlanmış kayıt (zaman damgalı iz)
--       p_trip_id null → yeni 'completed' yolculuk (+ duraklar: başlangıç, yol noktaları, bitiş)
--       p_trip_id dolu → yolculuğa tamamlanmış kayıt eklenir (aktif değil, kaydı olmayan);
--                        planlı yolculuk 'completed' olur, duraklarına dokunulmaz
--   p_mode 'route': planlı rota (zaman damgasız iz)
--       p_trip_id null → yeni 'planned' yolculuk; dolu → planlı yolculuğun rotası ve durakları değişir
--   p_stops: [{name, lat, lng}] — ilk eleman başlangıç, son eleman bitiş (2..20)
--   p_legs : yalnızca 'route' için [{d, s}] (durak sayısı − 1)
-- Hata kodları: 22023 doğrulama, PT404 bulunamadı, PT409 durum çakışması.
-- ============================================================================

alter table public.trip_recordings
  add column source text not null default 'gps' check (source in ('gps', 'gpx', 'kml'));

create or replace function public.trip_import_track(
  p_trip_id     uuid,
  p_title       text,
  p_mode        text,
  p_polyline    text,
  p_distance_m  numeric,
  p_started_at  timestamptz,
  p_ended_at    timestamptz,
  p_moving_s    int,
  p_point_count int,
  p_stops       jsonb,
  p_legs        jsonb,
  p_source      text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip uuid;
  v_status text;
  v_n int;
  v_elapsed int;
  v_moving int;
  v_first jsonb;
  v_last jsonb;
  v_title text := left(nullif(btrim(coalesce(p_title, '')), ''), 160);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('recording', 'route') or p_source is null or p_source not in ('gpx', 'kml') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  -- İz: polyline alfabesi (ASCII 63–126); kayıtta bölümler tek boşlukla ayrılır
  if p_polyline is null or char_length(p_polyline) not between 2 and 200000
     or p_polyline !~ (case when p_mode = 'route' then '^[?-~]+$' else '^[?-~]+( [?-~]+)*$' end) then
    raise exception 'invalid_track' using errcode = '22023';
  end if;
  if p_distance_m is null or p_distance_m < 0 or p_distance_m > 50000000 then
    raise exception 'invalid_track' using errcode = '22023';
  end if;

  -- Duraklar
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'invalid_stops' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_stops);
  if v_n < 2 or v_n > 20 or exists (
    select 1 from jsonb_array_elements(p_stops) x
    where case
            when jsonb_typeof(x) is distinct from 'object'
              or jsonb_typeof(x -> 'lat') is distinct from 'number' or jsonb_typeof(x -> 'lng') is distinct from 'number' then true
            else (x ->> 'lat')::double precision not between -90 and 90
              or (x ->> 'lng')::double precision not between -180 and 180
              or char_length(btrim(coalesce(x ->> 'name', ''))) not between 1 and 200
          end
  ) then
    raise exception 'invalid_stops' using errcode = '22023';
  end if;
  v_first := p_stops -> 0;
  v_last := p_stops -> (v_n - 1);

  if p_mode = 'recording' then
    if p_started_at is null or p_ended_at is null or p_ended_at < p_started_at
       or p_started_at < timestamptz '1990-01-01' or p_ended_at > now() + interval '1 day'
       or p_ended_at - p_started_at > interval '90 days' then
      raise exception 'invalid_time' using errcode = '22023';
    end if;
    v_elapsed := extract(epoch from p_ended_at - p_started_at)::int;
    v_moving := least(greatest(coalesce(p_moving_s, v_elapsed), 0), v_elapsed);
    -- Uçak bile değil: ortalama 1200 km/sa üstü gerçek bir yolculuk değildir
    if v_elapsed > 0 and p_distance_m / v_elapsed * 3.6 > 1200 then
      raise exception 'invalid_track' using errcode = '22023';
    end if;
    if p_point_count is null or p_point_count not between 2 and 200000 then
      raise exception 'invalid_track' using errcode = '22023';
    end if;
  else
    if p_legs is null or jsonb_typeof(p_legs) <> 'array' or jsonb_array_length(p_legs) <> v_n - 1 or exists (
      select 1 from jsonb_array_elements(p_legs) l
      where case
              when jsonb_typeof(l -> 'd') is distinct from 'number' or jsonb_typeof(l -> 's') is distinct from 'number' then true
              else (l ->> 'd')::numeric not between 0 and 50000000 or (l ->> 's')::numeric not between 0 and 100000000
            end
    ) then
      raise exception 'invalid_route' using errcode = '22023';
    end if;
  end if;

  -- Hedef yolculuk
  if p_trip_id is null then
    if (select count(*) from public.trips where user_id = v_uid) >= 1000 then
      raise exception 'too_many_trips' using errcode = '22023';
    end if;
    insert into public.trips (user_id, title, status, started_at, completed_at)
    values (v_uid, coalesce(v_title, 'İçe aktarılan yolculuk'),
            case when p_mode = 'recording' then 'completed' else 'planned' end,
            case when p_mode = 'recording' then p_started_at end,
            case when p_mode = 'recording' then p_ended_at end)
    returning id into v_trip;
  else
    select t.status into v_status from public.trips t where t.id = p_trip_id for update;
    if not found then
      raise exception 'trip_not_found' using errcode = 'PT404';
    end if;
    v_trip := p_trip_id;
    if p_mode = 'recording' then
      if v_status = 'active' then
        raise exception 'trip_active' using errcode = 'PT409';
      end if;
      if exists (select 1 from public.trip_recordings r where r.trip_id = v_trip and r.status in ('recording', 'paused', 'completed')) then
        raise exception 'trip_has_recording' using errcode = 'PT409';
      end if;
      if v_status = 'planned' then
        update public.trips set status = 'completed', started_at = p_started_at, completed_at = p_ended_at where id = v_trip;
      end if;
    elsif v_status <> 'planned' then
      raise exception 'trip_not_editable' using errcode = 'PT409';
    end if;
  end if;

  if p_mode = 'recording' then
    insert into public.trip_recordings (
      trip_id, user_id, status, started_at, ended_at, total_distance_m, elapsed_duration_s, moving_duration_s,
      average_speed_kmh, start_latitude, start_longitude, end_latitude, end_longitude, start_label, end_label,
      simplified_polyline, point_count, source)
    values (
      v_trip, v_uid, 'completed', p_started_at, p_ended_at, round(p_distance_m, 1), v_elapsed, v_moving,
      case when v_moving > 0 then least(round(p_distance_m / v_moving * 3.6, 2), 9999.99) end,
      (v_first ->> 'lat')::double precision, (v_first ->> 'lng')::double precision,
      (v_last ->> 'lat')::double precision, (v_last ->> 'lng')::double precision,
      left(btrim(v_first ->> 'name'), 200), left(btrim(v_last ->> 'name'), 200),
      p_polyline, p_point_count, p_source);
  else
    update public.trips
       set route_polyline = p_polyline,
           route_distance_m = round(p_distance_m)::int,
           route_duration_s = (select coalesce(sum(round((l ->> 's')::numeric)), 0)::int from jsonb_array_elements(p_legs) l),
           route_legs = (select jsonb_agg(jsonb_build_object('d', round((l ->> 'd')::numeric), 's', round((l ->> 's')::numeric)) order by o)
                           from jsonb_array_elements(p_legs) with ordinality as a(l, o)),
           route_has_toll = false, route_has_ferry = false, route_computed_at = now()
     where id = v_trip;
    delete from public.trip_stops where trip_id = v_trip;
  end if;

  -- Duraklar: yeni yolculukta her iki modda; mevcut yolculukta yalnızca rota modunda (yukarıda silindi)
  if p_trip_id is null or p_mode = 'route' then
    insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude)
    select v_trip, v_uid,
           case when o = 1 then 'origin' when o = v_n then 'destination' else 'waypoint' end,
           (o - 1)::int, left(btrim(x ->> 'name'), 200), (x ->> 'lat')::double precision, (x ->> 'lng')::double precision
    from jsonb_array_elements(p_stops) with ordinality as a(x, o);
  end if;

  return v_trip;
end;
$$;

revoke all on function public.trip_import_track(uuid, text, text, text, numeric, timestamptz, timestamptz, int, int, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.trip_import_track(uuid, text, text, text, numeric, timestamptz, timestamptz, int, int, jsonb, jsonb, text)
  to authenticated;
