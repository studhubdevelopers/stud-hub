-- StudHub: дневник проекта (лента обновлений от автора).
-- Как применить: Supabase → SQL Editor → New query → вставить ВЕСЬ файл → Run.
-- Файл можно запускать повторно и поверх любой прошлой версии таблицы: данные не удаляются,
-- недостающие колонки добавляются.
-- В конце в Results должна появиться строка: status = «project_updates готова», policies = 2,
-- extra_required_columns — пусто.

create table if not exists public.project_updates (
  id bigint generated always as identity primary key,
  project_id text not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Автор',
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

/* Если таблица осталась от более ранней версии, «create table if not exists» её не трогает —
   поэтому достраиваем недостающие колонки отдельно. Для уже существующих колонок это ничего не меняет. */
alter table public.project_updates add column if not exists author_name text not null default 'Автор';
alter table public.project_updates add column if not exists title text not null default '';
alter table public.project_updates add column if not exists body text not null default '';
alter table public.project_updates add column if not exists created_at timestamptz not null default now();
alter table public.project_updates alter column title drop default;
alter table public.project_updates alter column body drop default;

-- Уже опубликованным новостям подставляем настоящее имя автора вместо «Автор»
-- (до ограничений длины ниже: они проверяют и изменяемые старые строки).
update public.project_updates u set author_name = p.name
  from public.profiles p
  where p.id = u.author_id and u.author_name = 'Автор';

-- Ограничения длины. NOT VALID: проверяются для новых записей, старые строки миграцию не блокируют.
alter table public.project_updates drop constraint if exists project_updates_title_len;
alter table public.project_updates add constraint project_updates_title_len
  check (char_length(title) between 3 and 100) not valid;
alter table public.project_updates drop constraint if exists project_updates_body_len;
alter table public.project_updates add constraint project_updates_body_len
  check (char_length(body) between 5 and 3000) not valid;

create index if not exists project_updates_project_created_idx
  on public.project_updates(project_id, created_at desc);

/* Автор и его имя подставляются на сервере (как в обсуждениях): нельзя выдать себя за другого,
   и в ленте показывается настоящее имя, а не значение по умолчанию «Автор». */
alter table public.project_updates alter column author_id set default auth.uid();

create or replace function public.project_updates_set_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if auth.uid() is null then return new; end if;   -- вставка из SQL Editor / сервисным ключом
  new.author_id := auth.uid();
  select name into nm from public.profiles where id = auth.uid();
  new.author_name := coalesce(nm, 'Автор');
  return new;
end $$;
revoke all on function public.project_updates_set_author() from public, anon, authenticated;
drop trigger if exists project_updates_set_author on public.project_updates;
create trigger project_updates_set_author before insert on public.project_updates
  for each row execute function public.project_updates_set_author();

/* Права и RLS: читают все вошедшие пользователи, публикует только владелец проекта. */
alter table public.project_updates enable row level security;
revoke all on public.project_updates from anon, authenticated;
grant select on public.project_updates to authenticated;
grant insert (project_id, author_id, title, body) on public.project_updates to authenticated;

-- Убираем все старые политики таблицы (в прошлых версиях они могли называться иначе) и создаём две актуальные.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'public' and tablename = 'project_updates' loop
    execute format('drop policy %I on public.project_updates', pol.policyname);
  end loop;
end $$;

create policy project_updates_read on public.project_updates
  for select to authenticated using (true);

create policy project_updates_owner_insert on public.project_updates
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.projects p
                where p.id = project_updates.project_id and p.owner_id = auth.uid())
  );

-- Просим API Supabase перечитать схему: иначе новые колонки/таблица могут какое-то время отвечать
-- ошибкой «... in the schema cache».
notify pgrst, 'reload schema';

-- Проверка результата (видна во вкладке Results).
-- extra_required_columns: обязательные колонки старой версии таблицы, о которых сайт не знает.
-- Если там что-то есть — публикация будет падать, пришлите это значение.
select 'project_updates готова' as status,
       (select count(*) from public.project_updates) as updates,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'project_updates') as policies,
       (select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
          from information_schema.columns
         where table_schema = 'public' and table_name = 'project_updates') as columns,
       (select coalesce(string_agg(column_name, ', '), '')
          from information_schema.columns
         where table_schema = 'public' and table_name = 'project_updates'
           and column_name not in ('id','project_id','author_id','author_name','title','body','created_at')
           and is_nullable = 'NO' and column_default is null and is_identity = 'NO') as extra_required_columns;
