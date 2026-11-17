-- ============================================================================
-- ROVIA · PHASE 9 — Paylaşım, rota yeniden kullanımı
-- * Her yolculuk ve seyahatname için gizlilik: private (yalnızca ben) / link (bağlantıya sahip olanlar) /
--   public (herkese açık; arama motorlarına açık). Varsayılan özeldir.
-- * Paylaşım içeriği yalnızca share_get() ile, yalnızca seçilen alanlarla, oturumsuz okunur (SECURITY DEFINER,
--   dar kapsam). Tablolara anonim erişim açılmaz.
-- * Gizlilik yarıçapı: rotanın başlangıç/bitiş noktası çevresi rotadan kırpılır; bu çevredeki duraklar, notlar,
--   yazı konumları ve fotoğraflar paylaşılmaz (ev adresi koruması). Fotoğraf konumları hiç paylaşılmaz.
-- * Fotoğraflar: özel kovada kalır; yalnızca aktif bir paylaşımın kapsamındaki dosyalar için anonim imzalı
--   bağlantı oluşturulabilir (storage politikası + media_shared()).
-- * Canlı (aktif) yolculuk paylaşılamaz.
-- ============================================================================

create index shares_token_active_idx on public.shares (token) where revoked_at is null;

-- ---------------------------------------------------------------------------- Seçenekler
-- Bilinmeyen anahtarlar atılır, eksikler varsayılanla doldurulur.
create or replace function public.normalize_share_options(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'route',      coalesce((p ->> 'route')::boolean, true),
    'stats',      coalesce((p ->> 'stats')::boolean, true),
    'stops',      coalesce((p ->> 'stops')::boolean, true),
    'photos',     coalesce((p ->> 'photos')::boolean, true),
    'notes',      coalesce((p ->> 'notes')::boolean, false),
    'travelogue', coalesce((p ->> 'travelogue')::boolean, true),
    'ownerName',  coalesce((p ->> 'ownerName')::boolean, false),
    'endpoints',  coalesce((p ->> 'endpoints')::boolean, false)
  )
$$;

-- ---------------------------------------------------------------------------- Paylaşım ayarı
-- p_kind: 'trip' | 'travelogue'. p_visibility 'private' aktif bağlantıyı iptal eder.
-- p_rotate: true ise eski bağlantı iptal edilip yeni bağlantı üretilir.
create or replace function public.share_set(
  p_kind text, p_target uuid, p_visibility text, p_options jsonb default '{}'::jsonb,
  p_privacy_radius_m int default null, p_rotate boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_share public.shares;
  v_radius int;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_kind not in ('trip', 'travelogue') or p_visibility not in ('private', 'link', 'public')
     or (p_privacy_radius_m is not null and p_privacy_radius_m not between 0 and 5000) then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  if p_kind = 'trip' then
    select status into v_status from public.trips where id = p_target;
    if not found then
      raise exception 'not_found' using errcode = 'PT404';
    end if;
    if v_status = 'active' and p_visibility <> 'private' then
      raise exception 'trip_active' using errcode = '22023';
    end if;
    select * into v_share from public.shares where trip_id = p_target and revoked_at is null order by created_at desc limit 1;
  else
    if not exists (select 1 from public.travelogues where id = p_target) then
      raise exception 'not_found' using errcode = 'PT404';
    end if;
    select * into v_share from public.shares where travelogue_id = p_target and revoked_at is null order by created_at desc limit 1;
  end if;

  if p_visibility = 'private' or p_rotate then
    update public.shares set revoked_at = now()
    where revoked_at is null and (trip_id = p_target or travelogue_id = p_target);
    v_share := null;
  end if;

  if p_visibility = 'private' then
    if p_kind = 'trip' then
      update public.trips set visibility = 'private' where id = p_target;
    else
      update public.travelogues set visibility = 'private' where id = p_target;
    end if;
    return jsonb_build_object('visibility', 'private', 'token', null);
  end if;

  v_radius := coalesce(p_privacy_radius_m, v_share.privacy_radius_m,
    (select share_privacy_radius_m from public.user_settings where user_id = v_uid), 500);

  if v_share.id is null then
    insert into public.shares (user_id, trip_id, travelogue_id, visibility, options, privacy_radius_m)
    values (v_uid, case when p_kind = 'trip' then p_target end, case when p_kind = 'travelogue' then p_target end,
            p_visibility, public.normalize_share_options(p_options), v_radius)
    returning * into v_share;
  else
    update public.shares
    set visibility = p_visibility, options = public.normalize_share_options(p_options), privacy_radius_m = v_radius
    where id = v_share.id
    returning * into v_share;
  end if;

  if p_kind = 'trip' then
    update public.trips set visibility = p_visibility where id = p_target;
  else
    update public.travelogues set visibility = p_visibility where id = p_target;
  end if;

  return jsonb_build_object('visibility', v_share.visibility, 'token', v_share.token,
    'options', v_share.options, 'privacyRadiusM', v_share.privacy_radius_m, 'createdAt', v_share.created_at);
end;
$$;

-- ---------------------------------------------------------------------------- Yardımcılar (iç)
-- Kayıtlı iz (birden çok parça, boşlukla ayrılmış polyline5) veya planlanan rota → MultiLineString
create or replace function public._share_trip_line(p_trip_id uuid)
returns extensions.geometry
language sql
stable
security definer
set search_path = ''
as $$
  with src as (
    select coalesce(
      (select r.simplified_polyline from public.trip_recordings r
        where r.trip_id = p_trip_id and r.status = 'completed' and r.simplified_polyline is not null
        order by r.ended_at desc nulls last limit 1),
      (select t.route_polyline from public.trips t where t.id = p_trip_id)) as poly
  )
  select extensions.st_collect(extensions.st_setsrid(extensions.st_linefromencodedpolyline(seg, 5), 4326) order by ord)
  from src, unnest(string_to_array(src.poly, ' ')) with ordinality as u(seg, ord)
  where seg <> ''
$$;

-- Bir noktanın gizli bölgede (başlangıç/bitiş çevresi) olup olmadığı
create or replace function public._share_hidden(p_mask extensions.geography, p_lat double precision, p_lng double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_mask is not null and p_lat is not null and p_lng is not null
     and extensions.st_intersects(p_mask, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
$$;

create or replace function public._share_media_json(m public.media_assets, p_caption text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'path', m.storage_path, 'thumb', m.thumb_path, 'width', m.width, 'height', m.height,
    'caption', coalesce(p_caption, m.caption), 'takenAt', m.taken_at)
$$;

-- ---------------------------------------------------------------------------- Okuma (oturumsuz)
-- Geçersiz, iptal edilmiş veya süresi dolmuş bağlantı için NULL döner.
create or replace function public.share_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.shares;
  o jsonb;
  v_trip public.trips;
  v_tl public.travelogues;
  v_line extensions.geometry;
  v_start extensions.geometry;
  v_end extensions.geometry;
  v_mask extensions.geography;
  v_route text;
  v_out jsonb;
  v_rec record;
  v_trip_id uuid;
  v_endpoints boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into s from public.shares
  where token = p_token and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then
    return null;
  end if;
  o := public.normalize_share_options(s.options);
  v_endpoints := (o ->> 'endpoints')::boolean;

  if s.travelogue_id is not null then
    select * into v_tl from public.travelogues where id = s.travelogue_id;
    v_trip_id := v_tl.trip_id;
  else
    v_trip_id := s.trip_id;
  end if;
  if v_trip_id is not null then
    select * into v_trip from public.trips where id = v_trip_id;
    if v_trip.status = 'active' then
      return null;   -- canlı yolculuk paylaşılmaz
    end if;
  end if;

  -- Rota ve gizli bölge
  if v_trip.id is not null then
    v_line := public._share_trip_line(v_trip.id);
    if v_line is not null and not extensions.st_isempty(v_line) then
      v_start := extensions.st_startpoint(extensions.st_geometryn(v_line, 1));
      v_end := extensions.st_endpoint(extensions.st_geometryn(v_line, extensions.st_numgeometries(v_line)));
    else
      -- Rota yoksa duraklardan
      select extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326) into v_start
      from public.trip_stops where trip_id = v_trip.id and latitude is not null order by stop_order limit 1;
      select extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326) into v_end
      from public.trip_stops where trip_id = v_trip.id and latitude is not null order by stop_order desc limit 1;
    end if;
    if s.privacy_radius_m > 0 and not v_endpoints and v_start is not null then
      v_mask := extensions.st_union(
        extensions.st_buffer(v_start::extensions.geography, s.privacy_radius_m)::extensions.geometry,
        extensions.st_buffer(coalesce(v_end, v_start)::extensions.geography, s.privacy_radius_m)::extensions.geometry
      )::extensions.geography;
    end if;
    if (o ->> 'route')::boolean and v_line is not null then
      select string_agg(extensions.st_asencodedpolyline(d.geom, 5), ' ' order by d.path)
      into v_route
      from extensions.st_dump(
        case when v_mask is null then v_line else extensions.st_difference(v_line, v_mask::extensions.geometry) end
      ) d
      where extensions.st_npoints(d.geom) >= 2;
    end if;
  end if;

  v_out := jsonb_build_object(
    'kind', case when s.travelogue_id is not null then 'travelogue' else 'trip' end,
    'visibility', s.visibility,
    'options', o,
    'privacyRadiusM', s.privacy_radius_m,
    'ownerName', case when (o ->> 'ownerName')::boolean then (select full_name from public.profiles where id = s.user_id) end,
    'route', v_route
  );

  if v_trip.id is not null then
    v_out := v_out || jsonb_build_object('trip', jsonb_build_object(
      'title', v_trip.title,
      'description', v_trip.description,
      'status', v_trip.status,
      'plannedDate', v_trip.planned_date,
      'startedAt', case when (o ->> 'stats')::boolean then v_trip.started_at end,
      'completedAt', case when (o ->> 'stats')::boolean then v_trip.completed_at end,
      'stats', case when (o ->> 'stats')::boolean then (
        select jsonb_build_object('distanceM', r.total_distance_m, 'elapsedS', r.elapsed_duration_s, 'movingS', r.moving_duration_s,
                                  'avgKmh', r.average_speed_kmh, 'startedAt', r.started_at, 'endedAt', r.ended_at)
        from public.trip_recordings r where r.trip_id = v_trip.id and r.status = 'completed'
        order by r.ended_at desc nulls last limit 1)
      end,
      'plannedDistanceM', case when (o ->> 'stats')::boolean then v_trip.route_distance_m end,
      'plannedDurationS', case when (o ->> 'stats')::boolean then v_trip.route_duration_s end,
      'stops', case when (o ->> 'stops')::boolean then coalesce((
        select jsonb_agg(jsonb_build_object('name', st.name, 'kind', st.kind,
                 'lat', case when public._share_hidden(v_mask, st.latitude, st.longitude) then null else st.latitude end,
                 'lng', case when public._share_hidden(v_mask, st.latitude, st.longitude) then null else st.longitude end)
               order by st.stop_order)
        from public.trip_stops st
        where st.trip_id = v_trip.id
          and (v_endpoints or st.kind <> 'origin')
          and (not public._share_hidden(v_mask, st.latitude, st.longitude)
               -- Varış durağı gizli bölgedeyse yalnızca adı gösterilir; başlangıca yakınsa (dönüş, ev) hiç gösterilmez
               or (st.kind = 'destination' and v_start is not null and not extensions.st_dwithin(
                     extensions.st_setsrid(extensions.st_makepoint(st.longitude, st.latitude), 4326)::extensions.geography,
                     v_start::extensions.geography, greatest(s.privacy_radius_m, 1) * 2)))), '[]'::jsonb)
      end,
      'notes', case when (o ->> 'notes')::boolean then coalesce((
        select jsonb_agg(jsonb_build_object('title', n.title, 'body', n.body, 'notedAt', n.noted_at, 'kind', n.kind,
                 'locationName', n.location_name, 'lat', n.latitude, 'lng', n.longitude) order by n.noted_at)
        from public.journal_notes n
        where n.trip_id = v_trip.id and not public._share_hidden(v_mask, n.latitude, n.longitude)), '[]'::jsonb)
      end,
      'photos', case when (o ->> 'photos')::boolean and s.trip_id is not null then coalesce((
        select jsonb_agg(public._share_media_json(m) order by m.taken_at nulls last, m.created_at)
        from public.media_assets m
        where m.trip_id = v_trip.id and m.user_id = s.user_id and not public._share_hidden(v_mask, m.latitude, m.longitude)), '[]'::jsonb)
      end
    ));
  end if;

  -- Seyahatname: doğrudan paylaşılan ya da yolculuk paylaşımında "seyahatname" seçiliyse
  if v_tl.id is null and s.trip_id is not null and (o ->> 'travelogue')::boolean then
    select * into v_tl from public.travelogues where trip_id = s.trip_id;
  end if;
  if v_tl.id is not null then
    v_out := v_out || jsonb_build_object('travelogue', jsonb_build_object(
      'title', v_tl.title, 'subtitle', v_tl.subtitle, 'purpose', v_tl.purpose, 'summary', v_tl.summary,
      'ordering', v_tl.ordering, 'updatedAt', v_tl.updated_at,
      'cover', (select public._share_media_json(m) from public.media_assets m where m.id = v_tl.cover_media_id and m.user_id = s.user_id),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object('kind', x.kind, 'title', x.title, 'content', x.content) order by x.sort_order)
        from public.travelogue_sections x where x.travelogue_id = v_tl.id and x.is_visible), '[]'::jsonb),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'entryType', e.entry_type, 'title', e.title,
          'introduction', e.introduction, 'narrative', e.narrative, 'historyNotes', e.history_notes, 'personalReview', e.personal_review,
          'locationName', case when public._share_hidden(v_mask, e.latitude, e.longitude) then null else e.location_name end,
          'address', case when public._share_hidden(v_mask, e.latitude, e.longitude) then null else e.address end,
          'lat', case when public._share_hidden(v_mask, e.latitude, e.longitude) then null else e.latitude end,
          'lng', case when public._share_hidden(v_mask, e.latitude, e.longitude) then null else e.longitude end,
          'visitedAt', e.visited_at, 'tags', e.tags, 'aiAssisted', e.ai_assisted, 'sortOrder', e.sort_order, 'createdAt', e.created_at,
          'photos', case when (o ->> 'photos')::boolean then coalesce((
            select jsonb_agg(public._share_media_json(m, em.caption) order by em.sort_order)
            from public.travelogue_entry_media em join public.media_assets m on m.id = em.media_id
            where em.entry_id = e.id and m.user_id = s.user_id and not public._share_hidden(v_mask, m.latitude, m.longitude)), '[]'::jsonb)
            else '[]'::jsonb end)
          order by case when v_tl.ordering = 'manual' then e.sort_order end, coalesce(e.visited_at, e.created_at), e.sort_order)
        from public.travelogue_entries e where e.travelogue_id = v_tl.id), '[]'::jsonb),
      -- Metinlerdeki görseller (mediaId → dosya); yalnızca sahibin fotoğrafları
      'media', case when (o ->> 'photos')::boolean then coalesce((
        select jsonb_object_agg(m.id, public._share_media_json(m))
        from public.media_assets m
        where m.user_id = s.user_id
          and not public._share_hidden(v_mask, m.latitude, m.longitude)
          and (exists (select 1 from public.travelogue_sections x where x.travelogue_id = v_tl.id and x.is_visible
                         and x.content::text like '%' || m.id::text || '%')
               or exists (select 1 from public.travelogue_entries e where e.travelogue_id = v_tl.id
                         and concat_ws(' ', e.introduction::text, e.narrative::text, e.history_notes::text, e.personal_review::text)
                             like '%' || m.id::text || '%'))), '{}'::jsonb)
        else '{}'::jsonb end
    ));
  end if;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------- Fotoğraf erişimi (oturumsuz imzalı bağlantı)
-- Dosya, aktif bir paylaşımın kapsamındaysa true. Fotoğraf seçeneği kapalıysa false.
create or replace function public.media_shared(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_assets m
    join public.shares s on s.user_id = m.user_id and s.revoked_at is null and (s.expires_at is null or s.expires_at > now())
      and coalesce((s.options ->> 'photos')::boolean, true)
    left join public.travelogues tl on tl.id = s.travelogue_id
      or (s.trip_id is not null and coalesce((s.options ->> 'travelogue')::boolean, true) and tl.trip_id = s.trip_id)
    where (m.storage_path = p_name or m.thumb_path = p_name)
      and (
        (s.trip_id is not null and m.trip_id = s.trip_id)
        or tl.cover_media_id = m.id
        or exists (select 1 from public.travelogue_entry_media em join public.travelogue_entries e on e.id = em.entry_id
                   where em.media_id = m.id and e.travelogue_id = tl.id)
        or exists (select 1 from public.travelogue_sections x where x.travelogue_id = tl.id and x.is_visible
                   and x.content::text like '%' || m.id::text || '%')
        or exists (select 1 from public.travelogue_entries e where e.travelogue_id = tl.id
                   and concat_ws(' ', e.introduction::text, e.narrative::text, e.history_notes::text, e.personal_review::text)
                       like '%' || m.id::text || '%')
      )
  )
$$;

create policy "media: shared read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media' and public.media_shared(name));

-- ---------------------------------------------------------------------------- Rota yeniden kullanımı
-- Kendi yolculuğunu yeni bir plan olarak kopyalar (duraklar, rota seçenekleri ve rota).
create or replace function public.trip_copy(p_trip_id uuid, p_title text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  t public.trips;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into t from public.trips where id = p_trip_id;
  if not found then
    raise exception 'not_found' using errcode = 'PT404';
  end if;
  insert into public.trips (user_id, title, description, status, route_polyline, route_distance_m, route_duration_s,
                            route_computed_at, route_legs, route_has_toll, route_has_ferry, route_options, vehicle_id)
  values (v_uid, left(coalesce(nullif(btrim(p_title), ''), t.title), 160), t.description, 'planned', t.route_polyline,
          t.route_distance_m, t.route_duration_s, t.route_computed_at, t.route_legs, t.route_has_toll, t.route_has_ferry,
          t.route_options, t.vehicle_id)
  returning id into v_id;
  insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, address, latitude, longitude,
                                 osm_ref, saved_place_id, category, notes)
  select v_id, v_uid, kind, stop_order, name, address, latitude, longitude, osm_ref, saved_place_id, category, notes
  from public.trip_stops where trip_id = p_trip_id;
  return v_id;
end;
$$;

-- Paylaşılan bir yolculuğun görünür duraklarını kendi yeni planına kopyalar (oturum gerekir).
-- Gizli bölgedeki ve (uç noktalar gizliyse) başlangıç durağı kopyalanmaz; rota planlayıcıda yeniden hesaplanır.
create or replace function public.share_copy(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v jsonb;
  v_id uuid;
  v_stops jsonb;
  v_n int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v := public.share_get(p_token);
  if v is null or v -> 'trip' is null then
    raise exception 'not_found' using errcode = 'PT404';
  end if;
  v_stops := coalesce(
    (select jsonb_agg(x order by ord) from jsonb_array_elements(v -> 'trip' -> 'stops') with ordinality as a(x, ord)
     where x ->> 'lat' is not null), '[]'::jsonb);
  v_n := jsonb_array_length(v_stops);
  if v_n = 0 then
    raise exception 'nothing_to_copy' using errcode = '22023';
  end if;
  if (select count(*) from public.trips where user_id = v_uid) >= 1000 then
    raise exception 'too_many_trips' using errcode = '22023';
  end if;

  insert into public.trips (user_id, title, status)
  values (v_uid, left(v -> 'trip' ->> 'title', 160), 'planned')
  returning id into v_id;
  insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude)
  select v_id, v_uid,
         case when ord = 1 and v_n > 1 then 'origin' when ord = v_n then 'destination' else 'waypoint' end,
         (ord - 1)::int, left(x ->> 'name', 200), (x ->> 'lat')::double precision, (x ->> 'lng')::double precision
  from jsonb_array_elements(v_stops) with ordinality as a(x, ord);
  return v_id;
end;
$$;

revoke all on function public.normalize_share_options(jsonb), public.share_set(text, uuid, text, jsonb, int, boolean),
  public._share_trip_line(uuid), public._share_hidden(extensions.geography, double precision, double precision),
  public._share_media_json(public.media_assets, text), public.share_get(text), public.media_shared(text),
  public.trip_copy(uuid, text), public.share_copy(text) from public, anon, authenticated;
grant execute on function public.share_get(text), public.media_shared(text) to anon, authenticated;
grant execute on function public.normalize_share_options(jsonb), public.share_set(text, uuid, text, jsonb, int, boolean),
  public.trip_copy(uuid, text), public.share_copy(text) to authenticated;
