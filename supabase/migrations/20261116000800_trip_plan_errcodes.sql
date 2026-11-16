-- ============================================================================
-- ROVIA · save_trip_plan hata kodları
-- Çakışma hatası 40001 (serialization_failure) ile bildiriliyordu. Bu kod "geçici hata, tekrar dene"
-- anlamı taşır; API katmanında istek yanıt vermeden bekledi (E2E'de yakalandı). PostgREST'in
-- açık HTTP durum kodu sözleşmesine (PTxxx) geçildi: bulunamadı → 404, çakışma/düzenlenemez → 409.
-- ============================================================================

create or replace function public.save_trip_plan(
  p_trip_id          uuid,
  p_expected_version int,
  p_title            text,
  p_description      text,
  p_planned_date     date,
  p_stops            jsonb,
  p_route            jsonb
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
    -- Rota bacak sayısı durak sayısının bir eksiği olmalı (aksi hâlde rota başka duraklara ait)
    if v_polyline is null or v_distance is null or v_duration is null
       or v_legs is null or jsonb_typeof(v_legs) <> 'array' or jsonb_array_length(v_legs) <> v_count - 1 then
      raise exception 'invalid_route' using errcode = '22023';
    end if;
  end if;

  if p_trip_id is null then
    insert into public.trips as t (
      user_id, title, description, planned_date,
      route_polyline, route_distance_m, route_duration_s, route_legs, route_has_toll, route_has_ferry, route_computed_at
    )
    values (
      v_uid, p_title, p_description, p_planned_date,
      v_polyline, v_distance, v_duration, v_legs, v_toll, v_ferry, case when p_route is null then null else now() end
    )
    returning t.id, t.version into v_id, v_version;
  else
    update public.trips as t
       set title = p_title,
           description = p_description,
           planned_date = p_planned_date,
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

revoke execute on function public.save_trip_plan(uuid, int, text, text, date, jsonb, jsonb) from public, anon;
grant execute on function public.save_trip_plan(uuid, int, text, text, date, jsonb, jsonb) to authenticated;
