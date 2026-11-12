-- StudHub: каталог профилей (раздел «Профили»).
-- Supabase → SQL Editor → New query → вставить файл → Run. Можно запускать повторно.
drop function if exists public.list_profiles(text, integer);
create or replace function public.list_profiles(q text default '', lim integer default 25)
returns table (id uuid, name text, username text, subtitle text, bio text, city text, campus text, interests text, created_at timestamptz, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.username, p.subtitle, p.bio, p.city, p.campus, p.interests, p.created_at, p.avatar_url
  from public.profiles p
  where p.id <> auth.uid()
    and (btrim(coalesce(q, '')) = ''
         or p.name ilike '%' || replace(replace(btrim(q), '%', ''), '_', '') || '%'
         or p.username ilike '%' || replace(replace(btrim(q), '%', ''), '_', '') || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(lim, 25), 1), 200)
$$;
revoke all on function public.list_profiles(text, integer) from public, anon;
grant execute on function public.list_profiles(text, integer) to authenticated;
notify pgrst, 'reload schema';
