-- ============================================================================
-- ROVIA · Yer arama sıralaması düzeltmesi
-- 1) Tam ad eşleşmesi öne çıkar: "goreme" yazan kullanıcı önce Göreme yerleşimini görür
--    (önceden "Göreme Tarihî Parkı" gibi daha "önemli" ilgi noktalarıyla berabere kalıp alta düşüyordu).
-- 2) Aday kümesi sıralı kesilir: geniş sorgularda (ör. "an", "ankara") eşleşen binlerce kayıt
--    olabilir; sırasız `limit 400` asıl şehri rastgele dışarıda bırakabiliyordu. Artık tam eşleşme,
--    önek eşleşmesi ve önem derecesine göre seçilen ilk 400 aday puanlanır.
-- ============================================================================

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

  return query
  with matches as (
    select f.*,
           (f.name_search = p_query) as exact,
           (f.name_search like p_query || '%') as prefix
    from public.geo_features f
    where f.name_search operator(extensions.%>) p_query
       or f.name_search like p_query || '%'
  ),
  candidates as (
    select m.*,
           greatest(
             extensions.similarity(m.name_search, p_query),
             extensions.word_similarity(p_query, m.name_search),
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
           + case when bias is null then 0
                  else 0.10 * (1 - least(1, extensions.st_distance(c.geog, bias) / 300000.0)) end)::real
  from candidates c
  order by 9 desc, c.importance desc
  limit p_limit;
end;
$$;

revoke execute on function public.search_places(text, double precision, double precision, int) from public, anon;
grant execute on function public.search_places(text, double precision, double precision, int) to authenticated;
