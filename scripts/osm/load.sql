-- ============================================================================
-- ROVIA · OSM içe aktarma — yükleme (psql). Kullanım:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -v source="geofabrik turkey" -v data_ts="2026-11-15T21:00:00Z" -f scripts/osm/load.sql
-- Çalışma dizininde out/features.csv ve out/admin.csv bulunmalı.
-- ============================================================================
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;

create temp table stg_meta (source text, data_timestamp timestamptz) on commit drop;
insert into stg_meta values (:'source', nullif(:'data_ts', '')::timestamptz);

create temp table stg_features (osm_ref text, kind text, category text, subtype text, name text,
                                name_search text, tags text, importance text, wkb text) on commit drop;
create temp table stg_admin (osm_ref text, name text, admin_level text, wkb text) on commit drop;

\copy stg_features from 'out/features.csv' with (format csv, header true)
\copy stg_admin from 'out/admin.csv' with (format csv, header true)

\ir apply.sql
commit;

-- Silinen satırların alanını geri kazan ve planlayıcı istatistiklerini güncelle
vacuum (analyze) public.geo_features;
vacuum (analyze) public.geo_admin_areas;
select feature_count, admin_count, data_timestamp from public.geo_import_runs order by id desc limit 1;
