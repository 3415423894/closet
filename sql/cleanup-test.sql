-- ============================================================
-- 清理端到端测试留下的数据（可选，留着也不影响使用）
-- Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- 删除测试衣橱（会级联删掉成员、搭配记录）
delete from public.closets where name = '冒烟测试';

-- 删除测试上传的 hello.txt（私有桶里的孤儿文件）
delete from storage.objects
where bucket_id = 'outfits'
  and name like '%/hello.txt';
