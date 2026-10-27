import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

console.log('URL        :', url)
console.log('Key prefix :', (key || '').slice(0, 24) + '…')

if (!url || !key) {
  console.log('\n缺少环境变量，请先建好 .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// 1) 匿名登录是否开启
const { data: authData, error: authErr } = await supabase.auth.signInAnonymously()
if (authErr) {
  console.log('\n[1/3 匿名登录] ❌ 未开启')
  console.log('    → Supabase 控制台 → Authentication → Sign In / Up → 打开 Anonymous sign-ins')
} else {
  console.log('\n[1/3 匿名登录] ✓ 成功（用户', authData.user.id.slice(0, 8) + '…）')
}

// 2) 数据表是否建好
const { error: tableErr } = await supabase.from('members').select('closet_id').limit(1)
if (tableErr) {
  console.log('[2/3 数据表]     ❌ 未建好')
  console.log('    → Supabase 控制台 → SQL Editor → 粘贴 sql/setup.sql 全部内容 → Run')
} else {
  console.log('[2/3 数据表]     ✓ 就绪')
}

// 3) 图片存储桶是否可用（私有桶对匿名 key 用 getBucket 会「隐身」误报，
//    真正可靠的是 scripts/smoke.mjs 的实际上传测试）
console.log('[3/3 图片桶]     用 `node scripts/smoke.mjs` 做完整上传验证')

console.log('\n——— 检查完毕 ———')
