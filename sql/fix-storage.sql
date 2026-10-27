-- ============================================================
-- 补建图片存储桶（如果 setup.sql 的存储部分没生效，单独跑这个）
-- Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- 建桶（私有，不公开）
insert into storage.buckets (id, name, public, file_size_limit)
values ('outfits', 'outfits', false, null)
on conflict (id) do nothing;

-- 三个权限策略：路径约定 <closet_id>/<outfit_id>.<ext>，
-- 只有该衣橱成员能读、传、删
drop policy if exists "outfits_objects_read" on storage.objects;
create policy "outfits_objects_read" on storage.objects
  for select using (
    bucket_id = 'outfits'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "outfits_objects_insert" on storage.objects;
create policy "outfits_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'outfits'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "outfits_objects_delete" on storage.objects;
create policy "outfits_objects_delete" on storage.objects
  for delete using (
    bucket_id = 'outfits'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );
