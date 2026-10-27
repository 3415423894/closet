import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

const { data: a, error: aErr } = await supabase.auth.signInAnonymously()
if (aErr) { console.log('匿名登录失败', aErr.message); process.exit(1) }
const uid = a.user.id
console.log('uid =', uid)

const code = () => 'D' + randomBytes(4).toString('hex').toUpperCase()

// 变体 1：不传 created_by（依赖 default auth.uid()）
{
  const { error } = await supabase.from('closets').insert({ code: code(), name: 'v1' }).select().single()
  console.log('变体1（不传 created_by）:', error ? '✗ ' + error.message : '✓ 成功')
}
// 变体 2：显式传 created_by = 当前用户
{
  const { error } = await supabase.from('closets').insert({ code: code(), name: 'v2', created_by: uid }).select().single()
  console.log('变体2（显式传 created_by）:', error ? '✗ ' + error.message : '✓ 成功')
}
// 变体 3：显式传 created_by，且不带 .select()
{
  const { error } = await supabase.from('closets').insert({ code: code(), name: 'v3', created_by: uid })
  console.log('变体3（显式传 + 无 select）:', error ? '✗ ' + error.message : '✓ 成功')
}
