-- ============================================================
-- 修复「创建衣橱」被权限拦截的问题
-- 原因：创建人在还没成为成员前，插入后用 .select() 读回该行，
--       但 closets 的读权限只放行成员，导致整条语句失败。
-- Supabase 控制台 → SQL Editor → New query → 粘贴 → Run
-- ============================================================

drop policy if exists "closets_read" on public.closets;
create policy "closets_read" on public.closets
  for select using (
    public.is_member(id) or auth.uid() = created_by
  );
