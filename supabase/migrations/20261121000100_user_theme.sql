-- Tema tercihi hesapta saklanır: her cihaz açılışta bunu uygular (çerez cihaz önbelleği olarak kalır).
-- NULL = hesapta tercih yok (cihazdaki seçim ilk fırsatta hesaba yazılır).
alter table public.user_settings
  add column theme text check (theme in ('dark', 'light', 'system'));

comment on column public.user_settings.theme is 'Arayüz teması: dark (Koyu) · light (Aydınlık) · system (cihazı izle). NULL = seçilmedi.';
