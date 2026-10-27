-- ============================================================
-- 「我们的衣橱」 Supabase 初始化脚本
-- 在 Supabase 控制台 → SQL Editor → New query 中粘贴并运行一次
-- 运行前请到 Authentication → Sign In / Up 里启用 Anonymous sign-ins
-- ============================================================

-- ---------- 表 ----------
create table if not exists public.closets (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null default '我们的衣橱',
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  closet_id    uuid not null references public.closets(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  display_name text not null default '我',
  created_at   timestamptz not null default now(),
  primary key (closet_id, user_id)
);

create table if not exists public.outfits (
  id          uuid primary key default gen_random_uuid(),
  closet_id   uuid not null references public.closets(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  image_path  text not null,
  title       text,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.closets enable row level security;
alter table public.members enable row level security;
alter table public.outfits enable row level security;

-- 安全定义器函数：判断当前用户是否某衣橱成员（绕过 RLS 以免递归）
create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where closet_id = cid and user_id = auth.uid()) $$;

-- 安全定义器函数：按邀请码找到衣橱（未加入的人也能据此加入）
create or replace function public.find_closet(c text)
returns table(id uuid, name text) language sql stable security definer set search_path = public as
$$ select id, name from public.closets where code = upper(c) $$;

-- closets
drop policy if exists "closets_read" on public.closets;
create policy "closets_read" on public.closets for select using (
  public.is_member(id) or auth.uid() = created_by
);
drop policy if exists "closets_insert" on public.closets;
create policy "closets_insert" on public.closets for insert with check (auth.uid() = created_by);
drop policy if exists "closets_update" on public.closets;
create policy "closets_update" on public.closets for update using (public.is_member(id));

-- members
drop policy if exists "members_read" on public.members;
create policy "members_read" on public.members for select
  using (user_id = auth.uid() or public.is_member(closet_id));
drop policy if exists "members_insert" on public.members;
create policy "members_insert" on public.members for insert with check (user_id = auth.uid());
drop policy if exists "members_delete" on public.members;
create policy "members_delete" on public.members for delete using (user_id = auth.uid());

-- outfits
drop policy if exists "outfits_read" on public.outfits;
create policy "outfits_read" on public.outfits for select using (public.is_member(closet_id));
drop policy if exists "outfits_insert" on public.outfits;
create policy "outfits_insert" on public.outfits for insert
  with check (public.is_member(closet_id) and user_id = auth.uid());
drop policy if exists "outfits_delete" on public.outfits;
create policy "outfits_delete" on public.outfits for delete
  using (public.is_member(closet_id) and user_id = auth.uid());

-- ---------- 图片存储桶（private）----------
insert into storage.buckets (id, name, public)
values ('outfits', 'outfits', false)
on conflict (id) do nothing;

-- 路径约定：<closet_id>/<outfit_id>.<ext>
drop policy if exists "outfits_objects_read" on storage.objects;
create policy "outfits_objects_read" on storage.objects for select using (
  bucket_id = 'outfits'
  and public.is_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "outfits_objects_insert" on storage.objects;
create policy "outfits_objects_insert" on storage.objects for insert with check (
  bucket_id = 'outfits'
  and public.is_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "outfits_objects_delete" on storage.objects;
create policy "outfits_objects_delete" on storage.objects for delete using (
  bucket_id = 'outfits'
  and public.is_member((storage.foldername(name))[1]::uuid)
);