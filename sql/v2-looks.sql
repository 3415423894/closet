-- ============================================================
-- v2：把「一套搭配 = 一张照片」升级成「一套搭配 = 从头到脚多张照片」
-- 每个部位一张：帽子 / 外套 / 内搭 / 裤子 / 鞋子
-- 在 Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- 每套搭配里的单张照片（从头到脚的一个部位）
create table if not exists public.outfit_items (
  id          uuid primary key default gen_random_uuid(),
  outfit_id   uuid not null references public.outfits(id) on delete cascade,
  closet_id   uuid not null references public.closets(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  category    text not null,          -- hat | outer | top | bottom | shoes
  image_path  text not null,
  position    int not null default 0, -- 0..4 从帽子到鞋子的顺序
  created_at  timestamptz not null default now()
);

-- outfits 现在只代表「一套搭配」本身，不再存单张照片
alter table public.outfits drop column if exists image_path;

-- ---------- RLS ----------
alter table public.outfit_items enable row level security;

drop policy if exists "outfit_items_read" on public.outfit_items;
create policy "outfit_items_read" on public.outfit_items for select
  using (public.is_member(closet_id));

drop policy if exists "outfit_items_insert" on public.outfit_items;
create policy "outfit_items_insert" on public.outfit_items for insert
  with check (public.is_member(closet_id) and user_id = auth.uid());

drop policy if exists "outfit_items_delete" on public.outfit_items;
create policy "outfit_items_delete" on public.outfit_items for delete
  using (public.is_member(closet_id) and user_id = auth.uid());
