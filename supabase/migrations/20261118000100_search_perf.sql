-- ============================================================================
-- ROVIA · PHASE 10 — Performans: yer arama (otomatik tamamlama)
-- search_places PL/pgSQL içinde parametreli genel planla çalışınca LIKE önek koşulu trigram
-- indeksini kullanamıyor ve ~700 ms sürüyordu (aynı sorgu sabit değerle 12 ms). Sorgu artık
-- dinamik SQL ile her çağrıda gerçek değerle planlanıyor. Sonuçlar ve imza değişmedi.
-- İki harfli sorgular (ör. "is") bulanık eşleşmeyle binlerce satır tarıyordu (~2,9 sn): 3 harften kısa
-- sorgularda yalnızca önek eşleşmesi yapılır; önek için B-tree (text_pattern_ops) indeksi eklendi.
-- ============================================================================

create index if not exists geo_features_name_prefix_idx on public.geo_features (name_search text_pattern_ops);

create or replace function public.search_places(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit int default 8
)
returns table (
  osm_ref text, kind text, name text, category text, subtype text, admin text,
  lat double precision, lng double precision, score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  bias extensions.geography;
begin
  if char_length(coalesce(p_query, '')) not between 2 and 120 or p_limit not between 1 and 20 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_lat is not null and p_lng is not null then
    bias := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  -- Dinamik SQL: her çağrıda gerçek değerle planlanır (genel planda LIKE önek indeksi kullanılamıyordu: 12 ms → 700 ms)
  return query execute $q$
  with matches as (
    select f.*,
           (f.name_search = $1) as exact,
           (f.name_search like $1 || '%') as prefix
    from public.geo_features f
    where (char_length($1) >= 3 and f.name_search operator(extensions.%>) $1)
       or f.name_search like $1 || '%'
  ),
  candidates as (
    select m.*,
           greatest(
             extensions.similarity(m.name_search, $1),
             extensions.word_similarity($1, m.name_search),
             case when m.prefix then 0.9 else 0 end
           )::real as sim
    from matches m
    order by m.exact desc, m.prefix desc, m.importance desc
    limit 400
  )
  select c.osm_ref, c.kind, c.name, c.category, c.subtype, c.admin,
         extensions.st_y(c.geog::extensions.geometry), extensions.st_x(c.geog::extensions.geometry),
         (c.sim * 0.65 + c.importance * 0.25
           + case when c.exact then 0.20 else 0 end
           + case when $2 is null then 0
                  else 0.10 * (1 - least(1, extensions.st_distance(c.geog, $2) / 300000.0)) end)::real
  from candidates c
  order by 9 desc, c.importance desc
  limit $3
  $q$ using p_query, bias, p_limit;
end;
$$;
