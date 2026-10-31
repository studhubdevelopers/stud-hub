-- StudHub: пользовательские обложки профилей и изображения сообществ.
-- Выполнить один раз в Supabase → SQL Editor после базовой миграции профилей/аватаров.
-- Повторный запуск безопасен.

-- 1. Обложка профиля хранится рядом с avatar_url.
alter table public.profiles add column if not exists cover_url text;
grant select (cover_url) on public.profiles to anon, authenticated;
grant update (cover_url) on public.profiles to authenticated;

-- Публичная проекция профилей дополнена cover_url без раскрытия приватных полей.
create or replace view public.public_profiles
with (security_invoker = true) as
select id, name, username, subtitle, bio, city, campus, interests, created_at, avatar_url, cover_url
from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- 2. Публичное хранилище фотографий сообществ.
-- Файлы лежат в папке UUID загрузившего пользователя: <uid>/<community-id>/<type>.jpg.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-assets', 'community-assets', true, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg'];

drop policy if exists community_assets_public_read on storage.objects;
create policy community_assets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'community-assets');

drop policy if exists community_assets_insert_own on storage.objects;
create policy community_assets_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists community_assets_update_own on storage.objects;
create policy community_assets_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'community-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'community-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3. В текущем приложении сообщества заданы статически и таблицы ролей модераторов пока нет.
-- Поэтому чтение публичное, а менять ссылки на обложку/значок может любой вошедший пользователь.
-- updated_by фиксирует автора последнего изменения; когда появятся роли, write-policy нужно сузить до модераторов.
create table if not exists public.community_appearance (
  community_id text primary key check (char_length(community_id) between 1 and 40),
  avatar_url text,
  cover_url text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.community_appearance enable row level security;
drop policy if exists community_appearance_public_read on public.community_appearance;
create policy community_appearance_public_read on public.community_appearance
  for select to anon, authenticated using (true);
drop policy if exists community_appearance_authenticated_insert on public.community_appearance;
create policy community_appearance_authenticated_insert on public.community_appearance
  for insert to authenticated with check (updated_by = auth.uid());
drop policy if exists community_appearance_authenticated_update on public.community_appearance;
create policy community_appearance_authenticated_update on public.community_appearance
  for update to authenticated using (true) with check (updated_by = auth.uid());

grant select on public.community_appearance to anon, authenticated;
grant insert, update on public.community_appearance to authenticated;


-- 4. Публичный поиск и получение профилей для чата также возвращают cover_url.
-- Это позволяет открыть обложку чужого профиля по тем же ссылкам, что и раньше.
drop function if exists public.chat_find_profiles(text, integer);
create function public.chat_find_profiles(q text default '', lim integer default 8)
returns table (
  id uuid, name text, username text, subtitle text, bio text, city text,
  campus text, interests text, created_at timestamptz, avatar_url text, cover_url text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.username, p.subtitle, p.bio, p.city,
         p.campus, p.interests, p.created_at, p.avatar_url, p.cover_url
  from public.profiles p
  where p.id <> auth.uid()
    and (btrim(coalesce(q, '')) = ''
         or p.name ilike '%' || replace(replace(btrim(q), '%', ''), '_', '') || '%'
         or p.username ilike '%' || replace(replace(btrim(q), '%', ''), '_', '') || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(lim, 8), 1), 20)
$$;
revoke all on function public.chat_find_profiles(text, integer) from public, anon;
grant execute on function public.chat_find_profiles(text, integer) to authenticated;

drop function if exists public.chat_get_profiles(uuid[]);
create function public.chat_get_profiles(ids uuid[])
returns table (
  id uuid, name text, username text, subtitle text, bio text, city text,
  campus text, interests text, created_at timestamptz, avatar_url text, cover_url text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.username, p.subtitle, p.bio, p.city,
         p.campus, p.interests, p.created_at, p.avatar_url, p.cover_url
  from public.profiles p
  where p.id = any(ids)
  limit 50
$$;
revoke all on function public.chat_get_profiles(uuid[]) from public, anon;
grant execute on function public.chat_get_profiles(uuid[]) to authenticated;
