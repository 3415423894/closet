-- ============================================================
-- 建一个「公开网站桶」，用来托管「我们的衣橱」网页本身
-- （数据照旧走 outfits 私有桶，互不影响）
-- Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- 公开桶：任何人能看（网站文件没有秘密，anon key 本来就是公开的）
insert into storage.buckets (id, name, public, file_size_limit)
values ('site', 'site', true, null)
on conflict (id) do nothing;

-- 任何人可读取网站文件
drop policy if exists "site_public_read" on storage.objects;
create policy "site_public_read" on storage.objects
  for select using (bucket_id = 'site');

-- 已登录（含匿名登录）用户可上传，供发布脚本用
drop policy if exists "site_authenticated_insert" on storage.objects;
create policy "site_authenticated_insert" on storage.objects
  for insert with check (bucket_id = 'site' and auth.uid() is not null);
