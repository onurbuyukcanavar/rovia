-- ============================================================================
-- ROVIA · PHASE 7 — ROVIA Journal (dijital seyahatname)
-- * Seyahatname: kapak, bölümler (sırası değişir, gizlenebilir, özel bölüm eklenir), yazılar.
-- * Otomatik kayıt: her kayıt beklenen sürümle yapılır (iyimser kilit). Başka sekmede/cihazda
--   değişmişse 'version_conflict' döner; kullanıcı üzerine yazmayı (p_force) seçebilir.
-- * Yazı geçmişi: kayıttan önce en fazla 15 dakikada bir eski hâlin anlık görüntüsü saklanır
--   (yazı başına en fazla 50).
-- * Zengin metin (TipTap JSON) uygulamada izinli düğüm/işaret listesine göre temizlenir;
--   veritabanı boyut sınırlarını uygular.
-- * Günlük ile ilişki: seyahatname oluşturulurken yolculuğun günlük notları yazı taslağına
--   dönüştürülebilir; fotoğraflar kopyalanmaz, aynı medya kaydı bağlanır.
-- Tüm fonksiyonlar SECURITY INVOKER: RLS ve enforce_parent_owner tetikleyicileri geçerli.
-- ============================================================================

alter table public.travelogues add column version int not null default 1 check (version >= 1);
alter table public.travelogue_sections add column version int not null default 1 check (version >= 1);

-- Zengin metin alanları için boyut sınırı (~400 KB / alan)
alter table public.travelogues
  add constraint travelogues_intro_size check (introduction is null or octet_length(introduction::text) <= 400000);
alter table public.travelogue_sections
  add constraint travelogue_sections_content_size check (content is null or octet_length(content::text) <= 400000);
alter table public.travelogue_entries
  add constraint travelogue_entries_rich_size check (
    octet_length(coalesce(introduction::text, '')) + octet_length(coalesce(narrative::text, ''))
    + octet_length(coalesce(history_notes::text, '')) + octet_length(coalesce(personal_review::text, '')) <= 1200000),
  add constraint travelogue_entries_text_size check (content_text is null or char_length(content_text) <= 300000);

create index travelogue_entry_revisions_entry_idx on public.travelogue_entry_revisions (entry_id, created_at desc);
create index travelogue_entry_media_entry_idx on public.travelogue_entry_media (entry_id, sort_order);

-- ---------------------------------------------------------------------------- Yardımcılar
-- Düz metni paragraflara bölüp TipTap belgesine çevirir (günlük notlarını aktarmak için)
create or replace function public.plain_to_doc(p_text text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when nullif(btrim(coalesce(p_text, '')), '') is null then null else
    jsonb_build_object('type', 'doc', 'content', coalesce((
      select jsonb_agg(
        case when btrim(line) = '' then jsonb_build_object('type', 'paragraph')
        else jsonb_build_object('type', 'paragraph', 'content',
          jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))) end
        order by ord)
      from unnest(string_to_array(replace(p_text, E'\r', ''), E'\n')) with ordinality as l(line, ord)
    ), '[]'::jsonb))
  end
$$;

-- ---------------------------------------------------------------------------- Oluşturma
create or replace function public.travelogue_create(p_trip_id uuid, p_title text, p_import_notes boolean default true)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_entry uuid;
  n record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_trip_id is not null then
    if not exists (select 1 from public.trips where id = p_trip_id) then
      raise exception 'trip_not_found' using errcode = 'PT404';
    end if;
    select id into v_id from public.travelogues where trip_id = p_trip_id;
    if v_id is not null then
      return v_id;  -- Her yolculuğun tek seyahatnamesi olur
    end if;
    v_title := coalesce(v_title, (select title from public.trips where id = p_trip_id));
  end if;
  if v_title is null then
    raise exception 'title_required' using errcode = '22023';
  end if;

  insert into public.travelogues (user_id, trip_id, title)
  values (v_uid, p_trip_id, left(v_title, 200))
  returning id into v_id;

  insert into public.travelogue_sections (travelogue_id, user_id, kind, title, sort_order)
  select v_id, v_uid, s.kind, s.title, (s.ord - 1)::int
  from unnest(
    array['cover', 'introduction', 'trip_info', 'map', 'chronicle', 'places', 'gallery', 'evaluation', 'epilogue'],
    array['Kapak', 'Giriş', 'Yolculuk bilgileri', 'Harita ve rota', 'Kronolojik anlatı', 'Keşfedilen noktalar',
          'Fotoğraf galerisi', 'Genel değerlendirme', 'Son söz']
  ) with ordinality as s(kind, title, ord);

  if p_trip_id is not null and p_import_notes then
    for n in
      select * from public.journal_notes where trip_id = p_trip_id order by noted_at, created_at
    loop
      insert into public.travelogue_entries (
        travelogue_id, trip_id, user_id, entry_type, title, narrative, content_text, location_name,
        latitude, longitude, saved_place_id, visited_at, sort_order)
      values (
        v_id, p_trip_id, v_uid,
        case when n.latitude is not null or n.location_name is not null then 'place' else 'chronicle' end,
        left(coalesce(n.title, n.location_name, ''), 200), public.plain_to_doc(n.body), n.body,
        n.location_name, n.latitude, n.longitude, n.saved_place_id, n.noted_at,
        (select count(*) from public.travelogue_entries where travelogue_id = v_id)::int)
      returning id into v_entry;

      insert into public.travelogue_entry_media (entry_id, media_id, user_id, sort_order)
      select v_entry, m.media_id, v_uid, m.sort_order
      from public.journal_note_media m where m.note_id = n.id
      on conflict do nothing;
    end loop;
  end if;
  return v_id;
end;
$$;

-- p_fields: {entry_type?, title?, location_name?, address?, lat?, lng?, osm_ref?, saved_place_id?, visited_at?, tags?}
create or replace function public.travelogue_entry_create(p_travelogue_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip uuid;
  v_id uuid;
  v_lat double precision := (p_fields ->> 'lat')::double precision;
  v_lng double precision := (p_fields ->> 'lng')::double precision;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select trip_id into v_trip from public.travelogues where id = p_travelogue_id;
  if not found then
    raise exception 'travelogue_not_found' using errcode = 'PT404';
  end if;
  if (select count(*) from public.travelogue_entries where travelogue_id = p_travelogue_id) >= 500 then
    raise exception 'too_many_entries' using errcode = '22023';
  end if;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'invalid_location' using errcode = '22023';
  end if;

  insert into public.travelogue_entries (
    travelogue_id, trip_id, user_id, entry_type, title, location_name, address, latitude, longitude,
    osm_ref, saved_place_id, visited_at, tags, sort_order)
  values (
    p_travelogue_id, v_trip, v_uid,
    coalesce(p_fields ->> 'entry_type', case when v_lat is not null then 'place' else 'free' end),
    left(coalesce(p_fields ->> 'title', ''), 200),
    nullif(btrim(p_fields ->> 'location_name'), ''), nullif(btrim(p_fields ->> 'address'), ''), v_lat, v_lng,
    nullif(p_fields ->> 'osm_ref', ''), (p_fields ->> 'saved_place_id')::uuid,
    (p_fields ->> 'visited_at')::timestamptz,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_fields -> 'tags', '[]'::jsonb))), '{}'),
    coalesce((select max(sort_order) + 1 from public.travelogue_entries where travelogue_id = p_travelogue_id), 0))
  returning id into v_id;

  update public.travelogues set updated_at = now() where id = p_travelogue_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------- Otomatik kayıt
-- Yazı. p_patch yalnızca izinli anahtarları değiştirir; verilmeyen alanlar korunur.
create or replace function public.travelogue_entry_save(p_id uuid, p_version int, p_patch jsonb, p_force boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  e public.travelogue_entries;
  v_new public.travelogue_entries;
  k text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 1500000 then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['title', 'entry_type', 'introduction', 'narrative', 'history_notes', 'personal_review', 'content_text',
                       'location_name', 'address', 'latitude', 'longitude', 'osm_ref', 'saved_place_id',
                       'visited_at', 'tags', 'ai_assisted']) then
      raise exception 'invalid_patch' using errcode = '22023';
    end if;
  end loop;

  select * into e from public.travelogue_entries where id = p_id for update;
  if not found then
    raise exception 'entry_not_found' using errcode = 'PT404';
  end if;
  if e.version <> p_version and not p_force then
    raise exception 'version_conflict' using errcode = 'PT409', detail = e.version::text;
  end if;

  -- Eski hâlin anlık görüntüsü (15 dakikada en fazla bir)
  if not exists (
    select 1 from public.travelogue_entry_revisions r
    where r.entry_id = p_id and r.created_at > now() - interval '15 minutes'
  ) and (e.content_text is not null or e.narrative is not null or e.title <> '') then
    insert into public.travelogue_entry_revisions (entry_id, user_id, version, snapshot)
    values (p_id, v_uid, e.version, to_jsonb(e) - array['id', 'user_id', 'travelogue_id', 'trip_id', 'created_at', 'sort_order'])
    on conflict (entry_id, version) do nothing;
    delete from public.travelogue_entry_revisions
    where entry_id = p_id and id not in (
      select id from public.travelogue_entry_revisions where entry_id = p_id order by created_at desc limit 50);
  end if;

  update public.travelogue_entries set
    title           = case when p_patch ? 'title' then left(coalesce(p_patch ->> 'title', ''), 200) else title end,
    entry_type      = case when p_patch ? 'entry_type' then p_patch ->> 'entry_type' else entry_type end,
    introduction    = case when p_patch ? 'introduction' then nullif(p_patch -> 'introduction', 'null'::jsonb) else introduction end,
    narrative       = case when p_patch ? 'narrative' then nullif(p_patch -> 'narrative', 'null'::jsonb) else narrative end,
    history_notes   = case when p_patch ? 'history_notes' then nullif(p_patch -> 'history_notes', 'null'::jsonb) else history_notes end,
    personal_review = case when p_patch ? 'personal_review' then nullif(p_patch -> 'personal_review', 'null'::jsonb) else personal_review end,
    content_text    = case when p_patch ? 'content_text' then nullif(p_patch ->> 'content_text', '') else content_text end,
    location_name   = case when p_patch ? 'location_name' then nullif(btrim(p_patch ->> 'location_name'), '') else location_name end,
    address         = case when p_patch ? 'address' then nullif(btrim(p_patch ->> 'address'), '') else address end,
    latitude        = case when p_patch ? 'latitude' then (p_patch ->> 'latitude')::double precision else latitude end,
    longitude       = case when p_patch ? 'longitude' then (p_patch ->> 'longitude')::double precision else longitude end,
    osm_ref = case when p_patch ? 'osm_ref' then nullif(p_patch ->> 'osm_ref', '') else osm_ref end,
    saved_place_id  = case when p_patch ? 'saved_place_id' then (p_patch ->> 'saved_place_id')::uuid else saved_place_id end,
    visited_at      = case when p_patch ? 'visited_at' then (p_patch ->> 'visited_at')::timestamptz else visited_at end,
    tags            = case when p_patch ? 'tags'
                        then coalesce(array(select jsonb_array_elements_text(p_patch -> 'tags')), '{}') else tags end,
    ai_assisted     = case when p_patch ? 'ai_assisted' then (p_patch ->> 'ai_assisted')::boolean else ai_assisted end,
    version         = e.version + 1
  where id = p_id
  returning * into v_new;

  update public.travelogues set updated_at = now() where id = e.travelogue_id;
  return jsonb_build_object('version', v_new.version, 'updated_at', v_new.updated_at);
end;
$$;

-- Seyahatname bilgileri (kapak). p_patch: title, subtitle, purpose, summary, introduction, cover_media_id, ordering, status
create or replace function public.travelogue_save(p_id uuid, p_version int, p_patch jsonb, p_force boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.travelogues;
  k text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 500000 then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['title', 'subtitle', 'purpose', 'summary', 'introduction', 'cover_media_id', 'ordering', 'status']) then
      raise exception 'invalid_patch' using errcode = '22023';
    end if;
  end loop;
  select * into v from public.travelogues where id = p_id for update;
  if not found then
    raise exception 'travelogue_not_found' using errcode = 'PT404';
  end if;
  if v.version <> p_version and not p_force then
    raise exception 'version_conflict' using errcode = 'PT409', detail = v.version::text;
  end if;
  if p_patch ? 'title' and nullif(btrim(coalesce(p_patch ->> 'title', '')), '') is null then
    raise exception 'title_required' using errcode = '22023';
  end if;

  update public.travelogues set
    title          = case when p_patch ? 'title' then left(btrim(p_patch ->> 'title'), 200) else title end,
    subtitle       = case when p_patch ? 'subtitle' then nullif(btrim(p_patch ->> 'subtitle'), '') else subtitle end,
    purpose        = case when p_patch ? 'purpose' then nullif(btrim(p_patch ->> 'purpose'), '') else purpose end,
    summary        = case when p_patch ? 'summary' then nullif(btrim(p_patch ->> 'summary'), '') else summary end,
    introduction   = case when p_patch ? 'introduction' then nullif(p_patch -> 'introduction', 'null'::jsonb) else introduction end,
    cover_media_id = case when p_patch ? 'cover_media_id' then (p_patch ->> 'cover_media_id')::uuid else cover_media_id end,
    ordering       = case when p_patch ? 'ordering' then p_patch ->> 'ordering' else ordering end,
    status         = case when p_patch ? 'status' then p_patch ->> 'status' else status end,
    version        = v.version + 1
  where id = p_id
  returning * into v;
  return jsonb_build_object('version', v.version, 'updated_at', v.updated_at);
end;
$$;

-- Bölüm. p_patch: title, content, is_visible
create or replace function public.travelogue_section_save(p_id uuid, p_version int, p_patch jsonb, p_force boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.travelogue_sections;
  k text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 500000 then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['title', 'content', 'is_visible']) then
      raise exception 'invalid_patch' using errcode = '22023';
    end if;
  end loop;
  select * into s from public.travelogue_sections where id = p_id for update;
  if not found then
    raise exception 'section_not_found' using errcode = 'PT404';
  end if;
  if s.version <> p_version and not p_force then
    raise exception 'version_conflict' using errcode = 'PT409', detail = s.version::text;
  end if;
  if p_patch ? 'title' and nullif(btrim(coalesce(p_patch ->> 'title', '')), '') is null then
    raise exception 'title_required' using errcode = '22023';
  end if;

  update public.travelogue_sections set
    title      = case when p_patch ? 'title' then left(btrim(p_patch ->> 'title'), 200) else title end,
    content    = case when p_patch ? 'content' then nullif(p_patch -> 'content', 'null'::jsonb) else content end,
    is_visible = case when p_patch ? 'is_visible' then (p_patch ->> 'is_visible')::boolean else is_visible end,
    version    = s.version + 1
  where id = p_id
  returning * into s;
  update public.travelogues set updated_at = now() where id = s.travelogue_id;
  return jsonb_build_object('version', s.version, 'updated_at', s.updated_at);
end;
$$;

-- ---------------------------------------------------------------------------- Bölüm ve yazı düzeni
create or replace function public.travelogue_section_add(p_travelogue_id uuid, p_title text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.travelogues where id = p_travelogue_id) then
    raise exception 'travelogue_not_found' using errcode = 'PT404';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if (select count(*) from public.travelogue_sections where travelogue_id = p_travelogue_id) >= 60 then
    raise exception 'too_many_sections' using errcode = '22023';
  end if;
  insert into public.travelogue_sections (travelogue_id, user_id, kind, title, sort_order)
  values (p_travelogue_id, (select auth.uid()), 'custom', left(btrim(p_title), 200),
          coalesce((select max(sort_order) + 1 from public.travelogue_sections where travelogue_id = p_travelogue_id), 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- p_kind: 'sections' | 'entries'. p_ids tam ve eksiksiz yeni sıra olmalı.
-- Yazıların elle sıralanması seyahatnameyi 'manual' sıralamaya geçirir.
create or replace function public.travelogue_reorder(p_travelogue_id uuid, p_kind text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.travelogues where id = p_travelogue_id) then
    raise exception 'travelogue_not_found' using errcode = 'PT404';
  end if;
  if cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  if p_kind = 'sections' then
    select count(*) into v_count from public.travelogue_sections where travelogue_id = p_travelogue_id;
    if v_count <> cardinality(p_ids)
       or exists (select 1 from unnest(p_ids) x where x not in (select id from public.travelogue_sections where travelogue_id = p_travelogue_id)) then
      raise exception 'invalid_order' using errcode = '22023';
    end if;
    update public.travelogue_sections s set sort_order = (u.ord - 1)::int
    from unnest(p_ids) with ordinality as u(id, ord)
    where s.id = u.id and s.travelogue_id = p_travelogue_id;
  elsif p_kind = 'entries' then
    select count(*) into v_count from public.travelogue_entries where travelogue_id = p_travelogue_id;
    if v_count <> cardinality(p_ids)
       or exists (select 1 from unnest(p_ids) x where x not in (select id from public.travelogue_entries where travelogue_id = p_travelogue_id)) then
      raise exception 'invalid_order' using errcode = '22023';
    end if;
    update public.travelogue_entries e set sort_order = (u.ord - 1)::int
    from unnest(p_ids) with ordinality as u(id, ord)
    where e.id = u.id and e.travelogue_id = p_travelogue_id;
    update public.travelogues set ordering = 'manual', version = version + 1 where id = p_travelogue_id;
  else
    raise exception 'invalid_order' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------- Yazı fotoğrafları
-- p_items: [{id, caption?}] — yazının fotoğraf listesinin tamamı (sırasıyla). Fotoğraf kopyalanmaz.
create or replace function public.travelogue_entry_set_media(p_entry_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip uuid;
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  select trip_id into v_trip from public.travelogue_entries where id = p_entry_id;
  if not found then
    raise exception 'entry_not_found' using errcode = 'PT404';
  end if;
  v_ids := array(select (x ->> 'id')::uuid from jsonb_array_elements(p_items) x);
  if cardinality(v_ids) <> (select count(distinct i) from unnest(v_ids) i)
     or (select count(*) from public.media_assets where id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'media_not_found' using errcode = 'PT404';
  end if;

  delete from public.travelogue_entry_media where entry_id = p_entry_id and media_id <> all (v_ids);
  insert into public.travelogue_entry_media (entry_id, media_id, user_id, caption, sort_order)
  select p_entry_id, (x ->> 'id')::uuid, v_uid, left(nullif(btrim(x ->> 'caption'), ''), 2000), (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as u(x, ord)
  on conflict (entry_id, media_id) do update set caption = excluded.caption, sort_order = excluded.sort_order;

  if v_trip is not null then
    update public.media_assets set trip_id = v_trip where id = any (v_ids) and trip_id is null;
  end if;
  update public.travelogues set updated_at = now()
  where id = (select travelogue_id from public.travelogue_entries where id = p_entry_id);
end;
$$;

-- ---------------------------------------------------------------------------- Liste
create or replace function public.travelogue_list()
returns table (
  id uuid, title text, subtitle text, status text, trip_id uuid, trip_title text, cover_thumb text,
  entry_count int, photo_count int, first_visit timestamptz, last_visit timestamptz, updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id, v.title, v.subtitle, v.status, v.trip_id, t.title,
         coalesce(c.thumb_path, (
           select m.thumb_path from public.travelogue_entry_media em
           join public.media_assets m on m.id = em.media_id
           join public.travelogue_entries e on e.id = em.entry_id
           where e.travelogue_id = v.id order by e.visited_at nulls last, em.sort_order limit 1)),
         (select count(*)::int from public.travelogue_entries e where e.travelogue_id = v.id),
         (select count(distinct em.media_id)::int from public.travelogue_entry_media em
            join public.travelogue_entries e on e.id = em.entry_id where e.travelogue_id = v.id),
         (select min(visited_at) from public.travelogue_entries e where e.travelogue_id = v.id),
         (select max(visited_at) from public.travelogue_entries e where e.travelogue_id = v.id),
         v.updated_at
  from public.travelogues v
  left join public.trips t on t.id = v.trip_id
  left join public.media_assets c on c.id = v.cover_media_id
  order by v.updated_at desc
  limit 500
$$;

-- ---------------------------------------------------------------------------- Hız sınırı: seyahatname kovası
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
    ('gps',           60, 6000),
    ('places',        60, 1000),
    ('media',         30,  400),
    ('journal',       60, 1000),
    ('travelogue',   120, 6000)
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

revoke all on function public.plain_to_doc(text), public.travelogue_create(uuid, text, boolean),
  public.travelogue_entry_create(uuid, jsonb), public.travelogue_entry_save(uuid, int, jsonb, boolean),
  public.travelogue_save(uuid, int, jsonb, boolean), public.travelogue_section_save(uuid, int, jsonb, boolean),
  public.travelogue_section_add(uuid, text), public.travelogue_reorder(uuid, text, uuid[]),
  public.travelogue_entry_set_media(uuid, jsonb), public.travelogue_list() from public, anon;
grant execute on function public.plain_to_doc(text), public.travelogue_create(uuid, text, boolean),
  public.travelogue_entry_create(uuid, jsonb), public.travelogue_entry_save(uuid, int, jsonb, boolean),
  public.travelogue_save(uuid, int, jsonb, boolean), public.travelogue_section_save(uuid, int, jsonb, boolean),
  public.travelogue_section_add(uuid, text), public.travelogue_reorder(uuid, text, uuid[]),
  public.travelogue_entry_set_media(uuid, jsonb), public.travelogue_list() to authenticated;
