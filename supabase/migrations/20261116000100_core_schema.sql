-- ============================================================================
-- ROVIA · Core schema (PHASE 1)
-- Tüm tablolar, kısıtlar, indeksler, tetikleyiciler ve RLS politikaları.
-- Tasarım gerekçeleri: docs/ARCHITECTURE.md §7
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Yardımcı fonksiyonlar
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Alt kayıtların, bağlandıkları üst kayıtla aynı kullanıcıya ait olmasını zorlar.
-- Kullanım: trigger ... execute function public.enforce_parent_owner('trips','trip_id', 'media_assets','cover_media_id')
-- Argümanlar (tablo, sütun) çiftleridir. Sütun NULL ise kontrol atlanır.
create or replace function public.enforce_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i int := 0;
  parent_table text;
  fk_column text;
  fk_value uuid;
  parent_owner uuid;
begin
  while i < tg_nargs loop
    parent_table := tg_argv[i];
    fk_column := tg_argv[i + 1];
    fk_value := (to_jsonb(new) ->> fk_column)::uuid;

    if fk_value is not null then
      execute format('select user_id from public.%I where id = $1', parent_table)
        into parent_owner
        using fk_value;

      if parent_owner is null or parent_owner <> new.user_id then
        raise exception 'ownership_violation: %.% does not belong to the row owner', parent_table, fk_column
          using errcode = '42501';
      end if;
    end if;

    i := i + 2;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Profil ve ayarlar
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  username    text check (username ~ '^[a-z0-9_.]{3,30}$'),
  avatar_url  text check (char_length(avatar_url) <= 2048),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username)) where username is not null;

create table public.user_settings (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  locale                   text not null default 'tr' check (locale in ('tr', 'en')),
  distance_unit            text not null default 'km' check (distance_unit in ('km', 'mi')),
  default_visibility       text not null default 'private' check (default_visibility in ('private', 'link', 'public')),
  -- Ham GPS noktalarının saklanma süresi (gün). NULL = süresiz, 0 = tamamlanınca sil.
  gps_raw_retention_days   int default 90 check (gps_raw_retention_days is null or gps_raw_retention_days between 0 and 3650),
  -- Paylaşımlarda başlangıç ve bitiş çevresinde gizlenecek yarıçap (metre).
  share_privacy_radius_m   int not null default 500 check (share_privacy_radius_m between 0 and 5000),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Yeni kullanıcı kaydında profil ve ayar satırını oluşturur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    left(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), 2048)
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. ROVIA Garage
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 80),
  make              text check (char_length(make) <= 60),
  model             text check (char_length(model) <= 60),
  model_year        int check (model_year between 1900 and 2100),
  fuel_type         text not null default 'gasoline'
                    check (fuel_type in ('gasoline', 'diesel', 'lpg', 'hybrid', 'plugin_hybrid', 'electric', 'other')),
  -- L/100 km (elektrikte kWh/100 km)
  consumption_per_100km numeric(5,2) check (consumption_per_100km > 0 and consumption_per_100km < 100),
  tank_capacity     numeric(6,1) check (tank_capacity > 0 and tank_capacity < 1000),
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index vehicles_user_id_idx on public.vehicles (user_id);
create unique index vehicles_one_default_per_user on public.vehicles (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- 3. Yolculuklar ve duraklar
-- ---------------------------------------------------------------------------

create table public.trips (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 160),
  description        text check (char_length(description) <= 5000),
  status             text not null default 'planned' check (status in ('planned', 'active', 'completed', 'archived')),
  planned_date       date,
  started_at         timestamptz,
  completed_at       timestamptz,
  -- Seçili rota (Routes API çıktısı; Google içeriği değil, kullanıcının planına ait geometri)
  route_polyline     text,
  route_distance_m   int check (route_distance_m >= 0),
  route_duration_s   int check (route_duration_s >= 0),
  routing_preference text not null default 'traffic_unaware' check (routing_preference in ('traffic_unaware', 'traffic_aware')),
  route_computed_at  timestamptz,
  vehicle_id         uuid references public.vehicles (id) on delete set null,
  visibility         text not null default 'private' check (visibility in ('private', 'link', 'public')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint trips_completed_after_start check (completed_at is null or started_at is null or completed_at >= started_at)
);
create index trips_user_id_idx on public.trips (user_id, created_at desc);
create index trips_user_status_idx on public.trips (user_id, status, planned_date);
create index trips_vehicle_id_idx on public.trips (vehicle_id);

create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  source      text not null check (source in ('google_takeout', 'kml', 'gpx', 'csv')),
  file_name   text check (char_length(file_name) <= 255),
  status      text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  total_count    int not null default 0 check (total_count >= 0),
  imported_count int not null default 0 check (imported_count >= 0),
  skipped_count  int not null default 0 check (skipped_count >= 0),
  error_message  text,
  created_at  timestamptz not null default now()
);
create index import_batches_user_id_idx on public.import_batches (user_id, created_at desc);

create table public.saved_places (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 200),
  category         text not null default 'other'
                   check (category in ('restaurant', 'cafe', 'attraction', 'historic', 'nature', 'hotel', 'camping', 'fuel', 'other')),
  list_type        text not null default 'favorite' check (list_type in ('favorite', 'want_to_go')),
  latitude         double precision check (latitude between -90 and 90),
  longitude        double precision check (longitude between -180 and 180),
  -- Google kaynaklı koordinatlar en fazla 30 gün önbelleğe alınabilir (Places politikası)
  coords_cached_at timestamptz,
  address          text check (char_length(address) <= 500),
  google_place_id  text check (char_length(google_place_id) <= 512),
  source           text not null default 'manual'
                   check (source in ('manual', 'google_takeout', 'google_link', 'kml', 'explore', 'trip')),
  source_ref       text check (char_length(source_ref) <= 1024),
  source_list_name text check (char_length(source_list_name) <= 200),
  import_batch_id  uuid references public.import_batches (id) on delete set null,
  notes            text check (char_length(notes) <= 5000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint saved_places_coords_pair check ((latitude is null) = (longitude is null)),
  constraint saved_places_locatable check (latitude is not null or google_place_id is not null)
);
create index saved_places_user_idx on public.saved_places (user_id, created_at desc);
create index saved_places_user_category_idx on public.saved_places (user_id, category);
create index saved_places_import_batch_idx on public.saved_places (import_batch_id);
create unique index saved_places_user_google_place_key on public.saved_places (user_id, google_place_id) where google_place_id is not null;
create unique index saved_places_user_source_ref_key on public.saved_places (user_id, source, source_ref) where source_ref is not null;

create table public.trip_stops (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  kind             text not null default 'waypoint' check (kind in ('origin', 'waypoint', 'destination')),
  stop_order       int not null check (stop_order >= 0),
  name             text not null check (char_length(name) between 1 and 200),
  address          text check (char_length(address) <= 500),
  latitude         double precision check (latitude between -90 and 90),
  longitude        double precision check (longitude between -180 and 180),
  coords_cached_at timestamptz,
  google_place_id  text check (char_length(google_place_id) <= 512),
  saved_place_id   uuid references public.saved_places (id) on delete set null,
  category         text check (char_length(category) <= 60),
  notes            text check (char_length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint trip_stops_coords_pair check ((latitude is null) = (longitude is null)),
  constraint trip_stops_locatable check (latitude is not null or google_place_id is not null),
  constraint trip_stops_order_key unique (trip_id, stop_order) deferrable initially deferred
);
create index trip_stops_user_idx on public.trip_stops (user_id);
create index trip_stops_saved_place_idx on public.trip_stops (saved_place_id);
create unique index trip_stops_one_origin on public.trip_stops (trip_id) where kind = 'origin';
create unique index trip_stops_one_destination on public.trip_stops (trip_id) where kind = 'destination';

-- ---------------------------------------------------------------------------
-- 4. GPS kayıtları
-- ---------------------------------------------------------------------------

create table public.trip_recordings (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  status              text not null default 'recording' check (status in ('recording', 'paused', 'completed', 'cancelled')),
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  total_distance_m    numeric(12,1) not null default 0 check (total_distance_m >= 0),
  moving_duration_s   int not null default 0 check (moving_duration_s >= 0),
  paused_duration_s   int not null default 0 check (paused_duration_s >= 0),
  elapsed_duration_s  int not null default 0 check (elapsed_duration_s >= 0),
  average_speed_kmh   numeric(6,2) check (average_speed_kmh >= 0),
  max_speed_kmh       numeric(6,2) check (max_speed_kmh >= 0),
  start_latitude      double precision check (start_latitude between -90 and 90),
  start_longitude     double precision check (start_longitude between -180 and 180),
  end_latitude        double precision check (end_latitude between -90 and 90),
  end_longitude       double precision check (end_longitude between -180 and 180),
  start_label         text check (char_length(start_label) <= 200),
  end_label           text check (char_length(end_label) <= 200),
  simplified_polyline text,
  point_count         int not null default 0 check (point_count >= 0),
  -- İstemcinin ürettiği kimlik: çevrimdışı başlatılan kayıtların tekrar gönderiminde mükerrer kayıt önler
  client_id           uuid not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint trip_recordings_end_after_start check (ended_at is null or ended_at >= started_at),
  constraint trip_recordings_client_key unique (user_id, client_id)
);
create index trip_recordings_trip_idx on public.trip_recordings (trip_id);
create index trip_recordings_user_idx on public.trip_recordings (user_id, started_at desc);
-- Bir kullanıcının aynı anda en fazla bir aktif kaydı olabilir
create unique index trip_recordings_one_active_per_user on public.trip_recordings (user_id) where status in ('recording', 'paused');

create table public.recording_segments (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid not null references public.trip_recordings (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  end_reason    text check (end_reason in ('pause', 'complete', 'cancel', 'gap')),
  distance_m    numeric(12,1) not null default 0 check (distance_m >= 0),
  created_at    timestamptz not null default now(),
  constraint recording_segments_end_after_start check (ended_at is null or ended_at >= started_at)
);
create index recording_segments_recording_idx on public.recording_segments (recording_id, started_at);
create index recording_segments_user_idx on public.recording_segments (user_id);

create table public.gps_points (
  id            bigint generated always as identity primary key,
  recording_id  uuid not null references public.trip_recordings (id) on delete cascade,
  segment_id    uuid references public.recording_segments (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  recorded_at   timestamptz not null,
  latitude      double precision not null check (latitude between -90 and 90),
  longitude     double precision not null check (longitude between -180 and 180),
  accuracy_m    real check (accuracy_m >= 0),
  altitude_m    real,
  speed_mps     real check (speed_mps >= 0),
  heading_deg   real check (heading_deg >= 0 and heading_deg < 360),
  -- Toplu gönderim idempotent olsun: aynı kayıt + zaman damgası tek satır
  constraint gps_points_recording_time_key unique (recording_id, recorded_at)
);
create index gps_points_user_idx on public.gps_points (user_id);
create index gps_points_segment_idx on public.gps_points (segment_id);

-- ---------------------------------------------------------------------------
-- 5. Medya (tek kayıt, çoklu kullanım)
-- ---------------------------------------------------------------------------

create table public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  trip_id       uuid references public.trips (id) on delete set null,
  storage_path  text not null unique check (char_length(storage_path) <= 512),
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic')),
  size_bytes    int not null check (size_bytes > 0 and size_bytes <= 20971520),
  width         int check (width > 0),
  height        int check (height > 0),
  taken_at      timestamptz,
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  title         text check (char_length(title) <= 200),
  caption       text check (char_length(caption) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Depolama yolu sahibin klasöründe olmalı: {user_id}/...
  constraint media_assets_path_owner check (split_part(storage_path, '/', 1) = user_id::text)
);
create index media_assets_user_idx on public.media_assets (user_id, created_at desc);
create index media_assets_trip_idx on public.media_assets (trip_id, taken_at);

-- ---------------------------------------------------------------------------
-- 6. Seyahat Günlüğü (kısa notlar ve anılar)
-- ---------------------------------------------------------------------------

create table public.journal_notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  trip_id         uuid references public.trips (id) on delete set null,
  kind            text not null default 'note' check (kind in ('note', 'memory', 'visit')),
  title           text check (char_length(title) <= 200),
  body            text check (char_length(body) <= 10000),
  noted_at        timestamptz not null default now(),
  location_name   text check (char_length(location_name) <= 200),
  latitude        double precision check (latitude between -90 and 90),
  longitude       double precision check (longitude between -180 and 180),
  saved_place_id  uuid references public.saved_places (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint journal_notes_has_content check (title is not null or body is not null)
);
create index journal_notes_user_idx on public.journal_notes (user_id, noted_at desc);
create index journal_notes_trip_idx on public.journal_notes (trip_id, noted_at);
create index journal_notes_saved_place_idx on public.journal_notes (saved_place_id);

create table public.journal_note_media (
  note_id     uuid not null references public.journal_notes (id) on delete cascade,
  media_id    uuid not null references public.media_assets (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  sort_order  int not null default 0,
  primary key (note_id, media_id)
);
create index journal_note_media_media_idx on public.journal_note_media (media_id);
create index journal_note_media_user_idx on public.journal_note_media (user_id);

-- ---------------------------------------------------------------------------
-- 7. ROVIA Journal (dijital seyahatname)
-- ---------------------------------------------------------------------------

create table public.travelogues (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  trip_id         uuid references public.trips (id) on delete set null,
  title           text not null check (char_length(title) between 1 and 200),
  subtitle        text check (char_length(subtitle) <= 300),
  purpose         text check (char_length(purpose) <= 2000),
  summary         text check (char_length(summary) <= 5000),
  introduction    jsonb,
  cover_media_id  uuid references public.media_assets (id) on delete set null,
  visibility      text not null default 'private' check (visibility in ('private', 'link', 'public')),
  status          text not null default 'draft' check (status in ('draft', 'published')),
  ordering        text not null default 'chronological' check (ordering in ('chronological', 'manual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index travelogues_user_idx on public.travelogues (user_id, updated_at desc);
create unique index travelogues_one_per_trip on public.travelogues (trip_id) where trip_id is not null;
create index travelogues_cover_idx on public.travelogues (cover_media_id);

create table public.travelogue_sections (
  id              uuid primary key default gen_random_uuid(),
  travelogue_id   uuid not null references public.travelogues (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null default 'custom'
                  check (kind in ('cover', 'introduction', 'trip_info', 'map', 'chronicle', 'places', 'gallery', 'evaluation', 'epilogue', 'custom')),
  title           text not null check (char_length(title) between 1 and 200),
  content         jsonb,
  is_visible      boolean not null default true,
  sort_order      int not null check (sort_order >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint travelogue_sections_order_key unique (travelogue_id, sort_order) deferrable initially deferred
);
create index travelogue_sections_user_idx on public.travelogue_sections (user_id);

create table public.travelogue_entries (
  id               uuid primary key default gen_random_uuid(),
  travelogue_id    uuid not null references public.travelogues (id) on delete cascade,
  trip_id          uuid references public.trips (id) on delete set null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  entry_type       text not null default 'place' check (entry_type in ('place', 'chronicle', 'free')),
  title            text not null default '' check (char_length(title) <= 200),
  introduction     jsonb,   -- İlk izlenim
  narrative        jsonb,   -- Anlatı (ana metin)
  history_notes    jsonb,   -- Tarihçe ve kültürel bilgiler
  personal_review  jsonb,   -- Kişisel değerlendirme
  content_text     text,    -- Arama ve dışa aktarma için düz metin
  location_name    text check (char_length(location_name) <= 200),
  address          text check (char_length(address) <= 500),
  latitude         double precision check (latitude between -90 and 90),
  longitude        double precision check (longitude between -180 and 180),
  google_place_id  text check (char_length(google_place_id) <= 512),
  saved_place_id   uuid references public.saved_places (id) on delete set null,
  visited_at       timestamptz,              -- Ziyaret zamanı (yazım zamanından bağımsız)
  tags             text[] not null default '{}' check (cardinality(tags) <= 20),
  sort_order       int not null default 0,
  version          int not null default 1 check (version >= 1),  -- Otomatik kayıt çakışma kontrolü
  ai_assisted      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint travelogue_entries_coords_pair check ((latitude is null) = (longitude is null))
);
create index travelogue_entries_travelogue_idx on public.travelogue_entries (travelogue_id, visited_at, sort_order);
create index travelogue_entries_user_idx on public.travelogue_entries (user_id, updated_at desc);
create index travelogue_entries_trip_idx on public.travelogue_entries (trip_id);
create index travelogue_entries_saved_place_idx on public.travelogue_entries (saved_place_id);
create index travelogue_entries_tags_idx on public.travelogue_entries using gin (tags);

create table public.travelogue_entry_media (
  entry_id    uuid not null references public.travelogue_entries (id) on delete cascade,
  media_id    uuid not null references public.media_assets (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  caption     text check (char_length(caption) <= 2000),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (entry_id, media_id)
);
create index travelogue_entry_media_media_idx on public.travelogue_entry_media (media_id);
create index travelogue_entry_media_user_idx on public.travelogue_entry_media (user_id);

create table public.travelogue_entry_revisions (
  id          bigint generated always as identity primary key,
  entry_id    uuid not null references public.travelogue_entries (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     int not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  constraint travelogue_entry_revisions_key unique (entry_id, version)
);
create index travelogue_entry_revisions_user_idx on public.travelogue_entry_revisions (user_id);

-- ---------------------------------------------------------------------------
-- 8. Paylaşım
-- ---------------------------------------------------------------------------

create table public.shares (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  trip_id           uuid references public.trips (id) on delete cascade,
  travelogue_id     uuid references public.travelogues (id) on delete cascade,
  -- ~244 bit rastgelelik; tahmin edilemez
  token             text not null unique
                    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  visibility        text not null default 'link' check (visibility in ('link', 'public')),
  -- Paylaşılacak içerik seçimi: {"photos":true,"notes":false,"route":true,...}
  options           jsonb not null default '{}'::jsonb,
  privacy_radius_m  int not null default 500 check (privacy_radius_m between 0 and 5000),
  expires_at        timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint shares_exactly_one_target check (num_nonnulls(trip_id, travelogue_id) = 1)
);
create index shares_user_idx on public.shares (user_id);
create index shares_trip_idx on public.shares (trip_id);
create index shares_travelogue_idx on public.shares (travelogue_id);

-- ---------------------------------------------------------------------------
-- 9. Tetikleyiciler: updated_at ve sahiplik tutarlılığı
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'vehicles', 'trips', 'saved_places', 'trip_stops',
    'trip_recordings', 'media_assets', 'journal_notes', 'travelogues',
    'travelogue_sections', 'travelogue_entries'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

create trigger enforce_owner before insert or update on public.trips
  for each row execute function public.enforce_parent_owner('vehicles', 'vehicle_id');
create trigger enforce_owner before insert or update on public.saved_places
  for each row execute function public.enforce_parent_owner('import_batches', 'import_batch_id');
create trigger enforce_owner before insert or update on public.trip_stops
  for each row execute function public.enforce_parent_owner('trips', 'trip_id', 'saved_places', 'saved_place_id');
create trigger enforce_owner before insert or update on public.trip_recordings
  for each row execute function public.enforce_parent_owner('trips', 'trip_id');
create trigger enforce_owner before insert or update on public.recording_segments
  for each row execute function public.enforce_parent_owner('trip_recordings', 'recording_id');
create trigger enforce_owner before insert or update on public.gps_points
  for each row execute function public.enforce_parent_owner('trip_recordings', 'recording_id', 'recording_segments', 'segment_id');
create trigger enforce_owner before insert or update on public.media_assets
  for each row execute function public.enforce_parent_owner('trips', 'trip_id');
create trigger enforce_owner before insert or update on public.journal_notes
  for each row execute function public.enforce_parent_owner('trips', 'trip_id', 'saved_places', 'saved_place_id');
create trigger enforce_owner before insert or update on public.journal_note_media
  for each row execute function public.enforce_parent_owner('journal_notes', 'note_id', 'media_assets', 'media_id');
create trigger enforce_owner before insert or update on public.travelogues
  for each row execute function public.enforce_parent_owner('trips', 'trip_id', 'media_assets', 'cover_media_id');
create trigger enforce_owner before insert or update on public.travelogue_sections
  for each row execute function public.enforce_parent_owner('travelogues', 'travelogue_id');
create trigger enforce_owner before insert or update on public.travelogue_entries
  for each row execute function public.enforce_parent_owner('travelogues', 'travelogue_id', 'trips', 'trip_id', 'saved_places', 'saved_place_id');
create trigger enforce_owner before insert or update on public.travelogue_entry_media
  for each row execute function public.enforce_parent_owner('travelogue_entries', 'entry_id', 'media_assets', 'media_id');
create trigger enforce_owner before insert or update on public.travelogue_entry_revisions
  for each row execute function public.enforce_parent_owner('travelogue_entries', 'entry_id');
create trigger enforce_owner before insert or update on public.shares
  for each row execute function public.enforce_parent_owner('trips', 'trip_id', 'travelogues', 'travelogue_id');

-- ---------------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Ekleme tetikleyiciyle yapılır; silme auth.users silinince cascade ile.

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'vehicles', 'trips', 'import_batches', 'saved_places', 'trip_stops',
    'trip_recordings', 'recording_segments', 'gps_points', 'media_assets',
    'journal_notes', 'journal_note_media', 'travelogues', 'travelogue_sections',
    'travelogue_entries', 'travelogue_entry_media', 'travelogue_entry_revisions', 'shares'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: owner select" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- user_settings satırı tetikleyiciyle oluşur; kullanıcı silemez.
drop policy "user_settings: owner delete" on public.user_settings;
-- Revizyonlar değiştirilemez geçmiştir.
drop policy "travelogue_entry_revisions: owner update" on public.travelogue_entry_revisions;

-- Derinlemesine savunma: anonim rol hiçbir tabloya doğrudan erişemez.
-- Paylaşılan içerik yalnızca SECURITY DEFINER fonksiyonlarıyla açılır (PHASE 9).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on function public.enforce_parent_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Panel istatistikleri (çağıranın yetkileriyle; RLS geçerli)
-- ---------------------------------------------------------------------------

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
        select coalesce(s.google_place_id, round(s.latitude::numeric, 3) || ',' || round(s.longitude::numeric, 3))
        from public.trip_stops s
        join public.trips t on t.id = s.trip_id
        where t.status in ('completed', 'archived')
        union
        select coalesce(e.google_place_id, round(e.latitude::numeric, 3) || ',' || round(e.longitude::numeric, 3))
        from public.travelogue_entries e
        where e.latitude is not null or e.google_place_id is not null
      ) places
    ),
    'travelogues', (select count(*) from public.travelogues),
    'photos', (select count(*) from public.media_assets)
  );
$$;

revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Storage: özel medya kovası
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic'])
on conflict (id) do nothing;

create policy "media: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
