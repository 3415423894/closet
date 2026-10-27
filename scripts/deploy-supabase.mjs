// 把 dist/ 里的静态网站上传到 Supabase 的公开桶「site」
import { createClient } from '@supabase/supabase-js'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(url, key, { auth: { persistSession: false } })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
}

async function walk(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

const root = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// 匿名登录（拿到上传权限）
const { error: authErr } = await supabase.auth.signInAnonymously()
if (authErr) { console.error('匿名登录失败:', authErr.message); process.exit(1) }
console.log('✓ 已登录（匿名）')

const files = await walk(root)
let ok = 0
for (const f of files) {
  const rel = relative(root, f).replace(/\\/g, '/')
  const contentType = MIME[extname(f).toLowerCase()] || 'application/octet-stream'
  const body = await readFile(f)
  const { error } = await supabase.storage
    .from('site')
    .upload(rel, body, { contentType, upsert: true })
  if (error) { console.error('✗', rel, error.message) }
  else { ok++; console.log('✓', rel, '→', contentType) }
}

console.log(`\n上传完成：${ok}/${files.length} 个文件`)
console.log('网站地址：')
console.log(`  ${url}/storage/v1/object/public/site/index.html`)
