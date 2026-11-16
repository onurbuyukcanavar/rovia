-- ============================================================================
-- ROVIA · PHASE 4 — GPS yolculuk kaydı
--
-- Kayıt istemcide çevrimdışı çalışabilir: tarayıcı işlemleri (başlat, nokta, duraklat,
-- devam, bitir, iptal) sırayla kuyruğa yazar ve bağlantı gelince gönderir. Bu yüzden
-- her işlem İDEMPOTENTTİR: kayıt ve bölüm kimlikleri istemcide üretilir; aynı işlemin
-- tekrar gönderilmesi ikinci bir satır ya da hata üretmez.
--
-- Tüm fonksiyonlar SECURITY INVOKER: RLS ve enforce_parent_owner aynen uygulanır.
-- Hata kodları PostgREST HTTP sözleşmesiyle: PT404 bulunamadı, PT409 durum çakışması.
-- ============================================================================

-- Zaman damgası makul aralıkta mı (çevrimdışı kuyruk günler sonra gönderilebilir)
create or replace function public.assert_recording_time(p_at timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at is null or p_at < now() - interval '30 days' or p_at > now() + interval '10 minutes' then
    raise exception 'invalid_time' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Başlat: plansız yolculukta yeni yolculuk oluşturur; planlı yolculuğu 'active' yapar.
-- ---------------------------------------------------------------------------
create or replace function public.recording_start(
  p_id         uuid,
  p_segment_id uuid,
  p_started_at timestamptz,
  p_trip_id    uuid,
  p_title      text
)
returns table (recording_id uuid, trip_id uuid, status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_trip uuid;
  v_trip_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Tekrar gönderim: kayıt zaten varsa olduğu gibi döndür
  return query select r.id, r.trip_id, r.status from public.trip_recordings r where r.id = p_id;
  if found then return; end if;

  perform public.assert_recording_time(p_started_at);

  if p_trip_id is not null then
    update public.trips t
       set status = 'active', started_at = coalesce(t.started_at, p_started_at)
     where t.id = p_trip_id and t.status = 'planned'
    returning t.id into v_trip;
    if v_trip is null then
      select t.status into v_trip_status from public.trips t where t.id = p_trip_id;
      if not found then
        raise exception 'trip_not_found' using errcode = 'PT404';
      end if;
      raise exception 'trip_not_startable' using errcode = 'PT409';
    end if;
  else
    insert into public.trips (user_id, title, status, started_at)
    values (v_uid, coalesce(nullif(btrim(p_title), ''), 'Yolculuk'), 'active', p_started_at)
    returning id into v_trip;
  end if;

  begin
    insert into public.trip_recordings (id, client_id, trip_id, user_id, status, started_at)
    values (p_id, p_id, v_trip, v_uid, 'recording', p_started_at);
  exception when unique_violation then
    -- trip_recordings_one_active_per_user: aynı anda tek aktif kayıt
    raise exception 'recording_active' using errcode = 'PT409';
  end;

  insert into public.recording_segments (id, recording_id, user_id, started_at)
  values (p_segment_id, p_id, v_uid, p_started_at);

  return query select p_id, v_trip, 'recording'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Noktalar: aynı (kayıt, zaman) tek satır; tekrar gönderim sessizce yok sayılır.
-- p_points: [{t: epoch ms, lat, lng, acc, alt, spd, hdg}], en fazla 1000
-- ---------------------------------------------------------------------------
create or replace function public.recording_add_points(p_id uuid, p_segment_id uuid, p_points jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_count int;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) > 1000 then
    raise exception 'invalid_points' using errcode = '22023';
  end if;

  select r.status into v_status from public.trip_recordings r where r.id = p_id;
  if not found then
    raise exception 'recording_not_found' using errcode = 'PT404';
  end if;
  if v_status not in ('recording', 'paused') then
    raise exception 'recording_closed' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.recording_segments s where s.id = p_segment_id and s.recording_id = p_id) then
    raise exception 'segment_not_found' using errcode = 'PT404';
  end if;

  insert into public.gps_points (recording_id, segment_id, user_id, recorded_at, latitude, longitude, accuracy_m, altitude_m, speed_mps, heading_deg)
  select p_id, p_segment_id, v_uid,
         to_timestamp(x.t / 1000.0),
         x.lat, x.lng,
         case when x.acc >= 0 then x.acc end,
         x.alt,
         case when x.spd >= 0 then x.spd end,
         case when x.hdg >= 0 and x.hdg < 360 then x.hdg end
    from jsonb_to_recordset(p_points) as x(t bigint, lat double precision, lng double precision, acc real, alt real, spd real, hdg real)
   where x.t is not null and x.lat between -90 and 90 and x.lng between -180 and 180
  on conflict (recording_id, recorded_at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Duraklat / devam: bölüm kapanır, yenisi açılır. Durum zaten istenen hâldeyse işlem yok.
-- ---------------------------------------------------------------------------
create or replace function public.recording_pause(p_id uuid, p_segment_id uuid, p_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select r.status into v_status from public.trip_recordings r where r.id = p_id for update;
  if not found then
    raise exception 'recording_not_found' using errcode = 'PT404';
  end if;
  if v_status <> 'recording' then
    return v_status; -- zaten duraklatılmış veya kapanmış: tekrar gönderim
  end if;
  perform public.assert_recording_time(p_at);

  update public.recording_segments s
     set ended_at = greatest(p_at, s.started_at), end_reason = 'pause'
   where s.id = p_segment_id and s.recording_id = p_id and s.ended_at is null;
  update public.trip_recordings set status = 'paused' where id = p_id;
  return 'paused';
end;
$$;

create or replace function public.recording_resume(p_id uuid, p_segment_id uuid, p_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  select r.status into v_status from public.trip_recordings r where r.id = p_id for update;
  if not found then
    raise exception 'recording_not_found' using errcode = 'PT404';
  end if;
  if v_status not in ('recording', 'paused') then
    raise exception 'recording_closed' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.recording_segments s where s.id = p_segment_id) then
    return v_status; -- bu devam işlemi zaten uygulanmış
  end if;
  perform public.assert_recording_time(p_at);

  -- Açık kalmış bölüm varsa (ör. duraklatma işlemi kaybolduysa) kesinti olarak kapat
  update public.recording_segments s
     set ended_at = greatest(p_at, s.started_at), end_reason = 'gap'
   where s.recording_id = p_id and s.ended_at is null;
  insert into public.recording_segments (id, recording_id, user_id, started_at)
  values (p_segment_id, p_id, v_uid, p_at);
  update public.trip_recordings set status = 'recording' where id = p_id;
  return 'recording';
end;
$$;

-- ---------------------------------------------------------------------------
-- Bitir: bölümler ve kayıt kapanır, yolculuk 'completed'. Özet istatistikler sunucuda,
-- kaydedilmiş noktalardan (aynı GPS filtresiyle) hesaplanıp ayrıca yazılır.
-- ---------------------------------------------------------------------------
create or replace function public.recording_finish(p_id uuid, p_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_trip uuid;
  v_started timestamptz;
  v_end timestamptz;
begin
  select r.status, r.trip_id, r.started_at into v_status, v_trip, v_started
    from public.trip_recordings r where r.id = p_id for update;
  if not found then
    raise exception 'recording_not_found' using errcode = 'PT404';
  end if;
  if v_status = 'completed' then
    return 'completed';
  end if;
  if v_status <> 'recording' and v_status <> 'paused' then
    raise exception 'recording_closed' using errcode = 'PT409';
  end if;
  perform public.assert_recording_time(p_at);

  -- Bitiş, son bölüm başlangıcı ve son noktadan önce olamaz (saat kayması)
  select greatest(p_at, v_started,
                  coalesce((select max(s.started_at) from public.recording_segments s where s.recording_id = p_id), v_started),
                  coalesce((select max(g.recorded_at) from public.gps_points g where g.recording_id = p_id), v_started))
    into v_end;

  update public.recording_segments s
     set ended_at = v_end, end_reason = 'complete'
   where s.recording_id = p_id and s.ended_at is null;
  update public.trip_recordings
     set status = 'completed', ended_at = v_end,
         elapsed_duration_s = extract(epoch from v_end - v_started)::int
   where id = p_id;
  update public.trips
     set status = 'completed', completed_at = v_end
   where id = v_trip and status = 'active';
  return 'completed';
end;
$$;

-- ---------------------------------------------------------------------------
-- İptal: kayıt ve tüm noktaları silinir. Plansız (durağı olmayan) yolculuk da silinir;
-- planlı yolculuk yeniden 'planned' olur. Kayıt zaten yoksa işlem yok (tekrar gönderim).
-- ---------------------------------------------------------------------------
create or replace function public.recording_cancel(p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_trip uuid;
begin
  select r.status, r.trip_id into v_status, v_trip from public.trip_recordings r where r.id = p_id for update;
  if not found then
    return 'cancelled';
  end if;
  if v_status = 'completed' then
    raise exception 'recording_closed' using errcode = 'PT409';
  end if;

  delete from public.trip_recordings where id = p_id;
  if exists (select 1 from public.trip_stops s where s.trip_id = v_trip) then
    update public.trips set status = 'planned', started_at = null where id = v_trip and status = 'active';
  else
    delete from public.trips t
     where t.id = v_trip and t.status = 'active'
       and not exists (select 1 from public.trip_recordings r where r.trip_id = t.id);
  end if;
  return 'cancelled';
end;
$$;

-- ---------------------------------------------------------------------------
-- Kaydın tüm bölümleri ve noktaları tek JSON'da (özet hesabı ve kurtarma için).
-- PostgREST satır sınırına takılmamak için tek değer döner; noktalar kompakt dizi:
-- [epoch_ms, lat, lng, accuracy, speed]
-- ---------------------------------------------------------------------------
create or replace function public.recording_track(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'started_at', s.started_at,
               'ended_at', s.ended_at,
               'points', coalesce((
                 select jsonb_agg(jsonb_build_array(
                          (extract(epoch from g.recorded_at) * 1000)::bigint, g.latitude, g.longitude, g.accuracy_m, g.speed_mps)
                        order by g.recorded_at)
                   from public.gps_points g where g.segment_id = s.id), '[]'::jsonb))
             order by s.started_at)
        from public.recording_segments s where s.recording_id = r.id), '[]'::jsonb))
  from public.trip_recordings r
  where r.id = p_id
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'recording_track(uuid)',
    'recording_start(uuid, uuid, timestamptz, uuid, text)',
    'recording_add_points(uuid, uuid, jsonb)',
    'recording_pause(uuid, uuid, timestamptz)',
    'recording_resume(uuid, uuid, timestamptz)',
    'recording_finish(uuid, timestamptz)',
    'recording_cancel(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
revoke execute on function public.assert_recording_time(timestamptz) from public, anon;
grant execute on function public.assert_recording_time(timestamptz) to authenticated;

-- Özet alanları için ek tutarlılık
alter table public.trip_recordings
  add constraint trip_recordings_polyline_len check (simplified_polyline is null or char_length(simplified_polyline) <= 200000);

-- Yolculuk listesinde tamamlanan kayıtlar
create index trip_recordings_user_status_idx on public.trip_recordings (user_id, status, ended_at desc);

-- ---------------------------------------------------------------------------
-- Ham GPS saklama süresi (user_settings.gps_raw_retention_days):
-- süre dolan TAMAMLANMIŞ kayıtların ham noktaları silinir; özet, sadeleştirilmiş rota
-- çizgisi ve istatistikler kalır. NULL = süresiz, 0 = tamamlanınca (ilk çalıştırmada) sil.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_gps_points(p_batch int default 50000)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  delete from public.gps_points g
   where g.id in (
     select g2.id
       from public.gps_points g2
       join public.trip_recordings r on r.id = g2.recording_id
       join public.user_settings s on s.user_id = r.user_id
      where r.status = 'completed'
        and r.simplified_polyline is not null   -- özet yazılmadan ham veri silinmez
        and s.gps_raw_retention_days is not null
        and r.ended_at < now() - make_interval(days => s.gps_raw_retention_days)
      limit p_batch
   );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.purge_expired_gps_points(int) from public, anon, authenticated;

-- pg_cron varsa (Supabase) saatlik çalıştır; yerel test ortamında (PGlite) yok, atlanır.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rovia-purge-gps', '23 * * * *', 'select public.purge_expired_gps_points()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hız sınırı: GPS senkron kovası ('gps')
-- ---------------------------------------------------------------------------
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
    ('gps',           60, 6000)
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
