import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(url, key, { auth: { persistSession: false } })

const ok = (n, t) => console.log(`[${n}] ✓ ${t}`)
const bad = (n, t, h) => { console.log(`[${n}] ✗ ${t}`); if (h) console.log('      →', h) }

let closetId = null
let path = null

try {
  // 1. 匿名登录
  const { data: a, error: aErr } = await supabase.auth.signInAnonymously()
  if (aErr) throw new Error('匿名登录失败：' + aErr.message)
  ok('1', '匿名登录 ' + a.user.id.slice(0, 8) + '…')

  // 2. 建衣橱
  const code = 'SMOKE' + randomBytes(3).toString('hex').toUpperCase()
  const { data: c, error: cErr } = await supabase
    .from('closets').insert({ code, name: '冒烟测试' }).select().single()
  if (cErr) throw new Error('建衣橱失败：' + cErr.message)
  closetId = c.id
  ok('2', '建衣橱 ' + closetId.slice(0, 8) + '…')

  // 3. 加入成员
  const { error: mErr } = await supabase
    .from('members').insert({ closet_id: closetId, display_name: '测试' })
  if (mErr) throw new Error('加成员失败：' + mErr.message)
  ok('3', '加入成员')

  // 4. 上传一个文件到图片桶
  path = `${closetId}/hello.txt`
  const { error: uErr } = await supabase.storage
    .from('outfits').upload(path, new Blob(['hello 衣橱']), { upsert: true })
  if (uErr) throw new Error('上传失败：' + uErr.message)
  ok('4', '上传文件到 outfits/' + path)

  // 5. 生成签名链接并抓取
  const { data: su, error: sErr } = await supabase.storage
    .from('outfits').createSignedUrl(path, 60)
  if (sErr || !su?.signedUrl) throw new Error('签名链接失败：' + (sErr?.message || '无链接'))
  const res = await fetch(su.signedUrl)
  const text = await res.text()
  if (!res.ok || text !== 'hello 衣橱') throw new Error('读取内容不符：' + text)
  ok('5', '签名链接可读，内容一致')

  // 6. 写一条搭配记录
  const { error: oErr } = await supabase.from('outfits').insert({
    closet_id: closetId, image_path: path, title: '冒烟测试搭配',
  })
  if (oErr) throw new Error('写搭配记录失败：' + oErr.message)
  const { data: oList, error: oErr2 } = await supabase
    .from('outfits').select('id,title').eq('closet_id', closetId)
  if (oErr2) throw new Error('读搭配失败：' + oErr2.message)
  ok('6', '搭配记录写入并读回（' + oList.length + ' 条）')

  console.log('\n全部通过 ✅ 存储桶其实早就建好了，之前是私有桶对匿名 key 隐身导致的误报。')
} catch (e) {
  console.log('\n中断：', e.message)
  process.exitCode = 1
} finally {
  // 清理测试数据（RLS 下匿名账号无法复用，残留需靠 sql/cleanup-test.sql）
  if (path) { try { await supabase.storage.from('outfits').remove([path]) } catch {} }
  if (closetId) { try { await supabase.from('closets').delete().eq('id', closetId) } catch {} }
}
