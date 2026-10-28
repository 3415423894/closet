import { useEffect, useRef, useState } from 'react'
import { supabase, configured } from './supabase.js'
import { randomCode, normalizeCode } from './code.js'

export default function App() {
  const [session, setSession] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    if (!supabase) { setBooting(false); return }
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (alive) setSession(s)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  if (booting) return <Screen><p className="muted dim center pad">载入中…</p></Screen>
  if (!configured) return <SetupGuide />
  if (!session) return <Welcome />

  return <Home session={session} key={session.user.id} />
}

// ---------------- 基础组件 ----------------
function Screen({ children }) {
  return <div className="screen">{children}</div>
}

function Toast({ msg, text }) {
  useEffect(() => {
    const t = setTimeout(() => msg(''), 3200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div className="toast show">{text}</div>
}

// ---------------- 未配置引导 ----------------
function SetupGuide() {
  return (
    <Screen>
      <div className="card block">
        <h1>我们的衣橱</h1>
        <p className="big">还差一步就能用了 ✨</p>
        <p>照片需要存到一个「云端」，这里用的是 <strong>Supabase</strong>（免费额度够用）。</p>
        <p>把这四件事做好，手机打开网址就能和你对象一起用：</p>
        <ol>
          <li>到 <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a> 免费注册，新建一个项目；</li>
          <li>在 <b>SQL Editor</b> 里新建查询，把项目里 <code>sql/setup.sql</code> 的内容粘贴进去运行；</li>
          <li>到 <b>Authentication → Sign In / Up</b>，把 <b>Anonymous sign-ins</b> 打开；</li>
          <li>在 <b>Project Settings → API</b> 里复制 URL 和 anon key，新建一个 <code>.env</code> 文件填上（照着 <code>.env.example</code>）。</li>
        </ol>
        <p className="muted dim">填好后重新 <code>npm run dev</code> 即可。</p>
      </div>
    </Screen>
  )
}

// ---------------- 欢迎 / 登录 ----------------
function Welcome() {
  const [name, setName] = useState(() => localStorage.getItem('closet:name') || '我')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function enter() {
    setBusy(true); setErr('')
    try {
      const { error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      try { localStorage.setItem('closet:name', name.trim() || '我') } catch { /* ignore */ }
    } catch (e) {
      setErr(e.message || '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <div className="card block">
        <h1>👗 我们的衣橱</h1>
        <p className="big">记录我们搭配好的衣服</p>
        <label className="field">
          <span>你的称呼</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：宝宝 / 亲爱的 / 我"
            maxLength={20}
          />
        </label>
        <button className="primary" onClick={enter} disabled={busy}>
          {busy ? '进入中…' : '进入衣橱'}
        </button>
        {err && <p className="error">{err}</p>}
      </div>
      <p className="muted dim center">第一次用会自动为你建一个匿名账号（保存在你手机浏览器里）</p>
    </Screen>
  )
}

// ---------------- 主页面 ----------------
function Home({ session }) {
  const [closets, setClosets] = useState(null)
  const [active, setActive] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const myName = (() => { try { return localStorage.getItem('closet:name') || '我' } catch { return '我' } })()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('members')
        .select('closet_id, display_name, closet:closets(*)')
      if (alive && !error) {
        const list = (data || []).map((m) => ({
          id: m.closet_id,
          name: m.closet?.name || '我们的衣橱',
          display_name: m.display_name,
        }))
        setClosets(list)
        setActive((cur) => cur || (list[0] ? list[0].id : null))
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, reloadKey])

  const current = closets?.find((c) => c.id === active) || null

  async function createCloset() {
    setBusy(true); setMsg('')
    try {
      const code = randomCode()
      const { data, error } = await supabase
        .from('closets')
        .insert({ code, name: '我们的衣橱' })
        .select()
        .single()
      if (error) throw error
      const { error: mErr } = await supabase
        .from('members')
        .insert({ closet_id: data.id, display_name: myName })
      if (mErr) throw mErr
      setInviteCode(code)
      setShowInvite(true)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setMsg('创建失败：' + (e.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function joinCloset(code) {
    setBusy(true)
    try {
      const normalized = normalizeCode(code)
      if (!normalized) { setMsg('请输入邀请码'); return }
      const { data, error } = await supabase.rpc('find_closet', { c: normalized })
      if (error) throw error
      if (!data || data.length === 0) { setMsg('没找到这个衣橱，检查一下邀请码？'); return }
      const closet = data[0]
      const { error: mErr } = await supabase
        .from('members')
        .insert({ closet_id: closet.id, display_name: myName })
      if (mErr && mErr.code !== '23505') throw mErr
      setMsg(`已加入「${closet.name}」`)
      setShowInvite(false)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setMsg('加入失败：' + (e.message || e))
    } finally {
      setBusy(false)
    }
  }

  function switchUser() {
    supabase.auth.signOut()
  }

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-title">
          <span className="logo">👗</span>
          <span>{current?.name || '我们的衣橱'}</span>
        </div>
        <div className="bar-actions">
          {closets && closets.length > 0 && (
            <button className="ghost" onClick={() => setShowInvite(true)}>邀请</button>
          )}
          <button className="ghost" onClick={switchUser}>换人</button>
        </div>
      </header>

      {msg && <Toast msg={setMsg} text={msg} />}

      <main>
        {!closets ? (
          <div className="center pad"><p className="muted dim">载入中…</p></div>
        ) : closets.length === 0 ? (
          <EmptyState onCreate={createCloset} busy={busy} />
        ) : (
          <>
            {closets.length > 1 && (
              <div className="tabs">
                {closets.map((c) => (
                  <button
                    key={c.id}
                    className={c.id === active ? 'active' : ''}
                    onClick={() => setActive(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {current && <Wardrobe key={current.id} closetId={current.id} />}
          </>
        )}
      </main>

      {current && <AddSheet closetId={current.id} onDone={() => setReloadKey((k) => k + 1)} />}

      {closets && closets.length > 0 && (
        <InviteSheet
          open={showInvite}
          onClose={() => setShowInvite(false)}
          closet={current}
          owner={current?.display_name === myName}
          inviteCode={inviteCode}
          onJoin={joinCloset}
          busy={busy}
        />
      )}
    </div>
  )
}

// ---------------- 空状态 ----------------
function EmptyState({ onCreate, busy }) {
  return (
    <div className="card block center">
      <div className="empty-emoji">🧥</div>
      <h2>还没有衣橱</h2>
      <p className="muted">你们两个人共用一个衣橱，把搭配好的衣服照片存进来</p>
      <button className="primary" onClick={onCreate} disabled={busy}>
        {busy ? '创建中…' : '创建我们的衣橱'}
      </button>
    </div>
  )
}

// ---------------- 从头到脚的五类部位 ----------------
const CATEGORIES = [
  { id: 'hat',    label: '帽子', emoji: '🧢' },
  { id: 'outer',  label: '外套', emoji: '🧥' },
  { id: 'top',    label: '内搭', emoji: '👕' },
  { id: 'bottom', label: '裤子', emoji: '👖' },
  { id: 'shoes',  label: '鞋子', emoji: '👟' },
].map((c, i) => ({ ...c, index: i }))

// ---------------- 衣橱（一套搭配 = 一组从头到脚的照片） ----------------
function Wardrobe({ closetId }) {
  const [looks, setLooks] = useState(null)
  const [err, setErr] = useState('')
  const [viewer, setViewer] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setErr('')
      const [oRes, iRes] = await Promise.all([
        supabase.from('outfits').select('id, title, note, created_at').eq('closet_id', closetId).order('created_at', { ascending: false }),
        supabase.from('outfit_items').select('id, outfit_id, category, image_path, position').eq('closet_id', closetId),
      ])
      if (!alive) return
      if (oRes.error || iRes.error) { setErr((oRes.error || iRes.error)?.message || '载入失败'); return }
      const byOutfit = {}
      ;(iRes.data || []).forEach((it) => { (byOutfit[it.outfit_id] ||= []).push(it) })
      const list = (oRes.data || []).map((o) => {
        const items = (byOutfit[o.id] || []).slice().sort((a, b) => a.position - b.position)
        return { ...o, items, cover: items.find((i) => i.image_path)?.image_path || null }
      })
      setLooks(list)
    })()
    return () => { alive = false }
  }, [closetId])

  if (err) return <div className="center pad"><p className="error">{err}</p></div>
  if (!looks) return <div className="center pad"><p className="muted dim">载入中…</p></div>
  if (looks.length === 0) {
    return (
      <div className="card block center">
        <div className="empty-emoji">📸</div>
        <h2>衣橱还空着</h2>
        <p className="muted">点右下角的「＋」，按「帽子 → 鞋子」传一套搭配的照片</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid">
        {looks.map((o) => (
          <Tile key={o.id} look={o} onOpen={setViewer} />
        ))}
      </div>
      {viewer && <Viewer look={viewer} onClose={() => setViewer(null)} />}
    </>
  )
}

function Tile({ look, onOpen }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  const cover = look.cover
  useEffect(() => {
    let alive = true
    setUrl(null); setFailed(false)
    if (!cover) return
    if (cover.startsWith('data:') || cover.startsWith('blob:')) { setUrl(cover); return }
    ;(async () => {
      const { data } = await supabase.storage.from('outfits').createSignedUrl(cover, 3600)
      if (alive) setUrl(data?.signedUrl || null)
    })()
    return () => { alive = false }
  }, [cover])

  async function remove(e) {
    e.stopPropagation()
    const yes = confirm('删除这套搭配？')
    if (!yes) return
    const { error } = await supabase.from('outfits').delete().eq('id', look.id)
    if (error) alert(error.message)
    else window.location.reload()
  }

  const thumb = url || (failed ? fallbackThumb(cover) : embeddedCover())

  return (
    <figure className="tile" onClick={() => onOpen(look)} role="button" tabIndex={0}>
      <div className="tile-img">
        <img
          src={thumb}
          alt={look.title || '搭配'}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
      <div className="tile-cap">
        {look.title || `${look.items.length} 件单品`}
      </div>
      {look.items.length > 0 && (
        <div className="tile-tags">
          {look.items.slice().sort((a, b) => a.position - b.position).map((it) => (
            <span key={it.id} className="tag">{catById(it.category)?.emoji || '👕'}</span>
          ))}
        </div>
      )}
      <button className="tile-del" onClick={remove} aria-label="删除">✕</button>
    </figure>
  )
}

function catById(id) {
  return CATEGORIES.find((c) => c.id === id)
}

function fallbackThumb(originalPath) {
  if (!originalPath) return embeddedCover()
  if (originalPath.includes('proxy/')) {
    // 从本地封面里把原图路径取出来 —— 见 svgCover 的 data 包
    try {
      const m = decodeURIComponent(originalPath).match(/href="([^"]+)"/)
      return m ? m[1] : originalPath
    } catch { return originalPath }
  }
  return originalPath
}

// 图片还没加载出来时的浅色占位
function embeddedCover() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
    '<rect width="200" height="200" fill="#efe7db"/>' +
    '<text x="100" y="108" font-family="sans-serif" font-size="40" text-anchor="middle">👗</text>' +
    '</svg>',
  )
}

// ---------------- 大图查看 ----------------
function Viewer({ look, onClose }) {
  const items = (look.items || []).slice().sort((a, b) => a.position - b.position)
  const when = look.created_at ? formatTime(look.created_at) : ''

  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-scroll">
          <div className="viewer-head">
            {look.title && <h3>{look.title}</h3>}
            {look.note && <p className="note">{look.note}</p>}
          </div>

          {items.length === 0 ? (
            <p className="muted center pad">这套还没上传照片</p>
          ) : (
            <div className="look-list">
              {items.map((it) => (
                <LookRow key={it.id} item={it} />
              ))}
            </div>
          )}

          {when && <p className="muted dim small viewer-when">{when}</p>}
        </div>
        <button className="viewer-close" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}

function LookRow({ item }) {
  const cat = catById(item.category)
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const p = item.image_path
    if (!p) return
    if (p.startsWith('data:') || p.startsWith('blob:')) { setUrl(p); return }
    ;(async () => {
      const { data } = await supabase.storage.from('outfits').createSignedUrl(p, 3600)
      if (alive) setUrl(data?.signedUrl || null)
    })()
    return () => { alive = false }
  }, [item.image_path])

  return (
    <div className="look-row">
      <div className="look-row-img">
        {!failed ? (
          <img src={url || fallbackThumb(item.image_path)} alt={cat?.label || '单品'} onError={() => setFailed(true)} />
        ) : (
          <div className="fallback-note">加载失败</div>
        )}
      </div>
      <div className="look-row-label">{cat?.emoji || '👕'} {cat?.label || '单品'}</div>
    </div>
  )
}

function formatTime(iso) {
  try {
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { return '' }
}

// ---------------- 添加搭配（一套 = 从头到脚多张） ----------------
function AddSheet({ closetId, onDone }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState({}) // category -> { file, preview }
  const [saving, setSaving] = useState(false)

  function reset() {
    setTitle(''); setNote(''); setItems({})
  }
  function close() {
    if (saving) return
    setOpen(false)
    reset()
  }

  async function onPick(category, file) {
    if (!file) return
    let preview = null
    try { preview = URL.createObjectURL(file) } catch { /* ignore */ }
    setItems((cur) => ({ ...cur, [category]: { file, preview } }))
  }

  async function save() {
    setSaving(true)
    const used = CATEGORIES.filter((c) => items[c.id]?.file)
    try {
      if (used.length === 0) throw new Error('请至少上传一张照片')
      const outfitId = crypto.randomUUID()
      // 先建「一套搭配」这条记录
      const { error: oErr } = await supabase.from('outfits').insert({
        id: outfitId, closet_id: closetId,
        title: title.trim() || null, note: note.trim() || null,
      })
      if (oErr) throw oErr
      // 再逐张上传照片并写进 outfit_items
      for (const c of used) {
        const out = await shrinkImage(items[c.id].file)
        const ext = (out.name ? out.name.split('.').pop() : 'jpg').toLowerCase() || 'jpg'
        const path = `${closetId}/${outfitId}/${c.id}.${ext}`
        await upstore(path, out)
        const { error: iErr } = await supabase.from('outfit_items').insert({
          outfit_id: outfitId, closet_id: closetId,
          category: c.id, image_path: path, position: c.index,
        })
        if (iErr) throw iErr
      }
      close()
      onDone()
    } catch (e) {
      alert('上传失败：' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {open && (
        <div className="overlay" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {saving ? (
              <div className="pad center">
                <div className="spinner" />
                <p className="muted">上传中…</p>
              </div>
            ) : (
              <>
                <h3>新增一套搭配</h3>
                <p className="muted small">按顺序上传：帽子 → 外套 → 内搭 → 裤子 → 鞋子（可选）</p>

                <label className="field">
                  <span>标题（可选）</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：约会日"
                    maxLength={40}
                  />
                </label>
                <label className="field">
                  <span>备注（可选）</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="这套什么时候穿、怎么搭更好看…"
                    rows={2}
                  />
                </label>

                <div className="cat-list">
                  {CATEGORIES.map((c) => (
                    <CatRow key={c.id} cat={c} item={items[c.id]} onPick={(f) => onPick(c.id, f)} />
                  ))}
                </div>

                <button className="primary" onClick={save} disabled={Object.keys(items).length === 0}>
                  保存这套搭配
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <button className="fab" onClick={() => setOpen(true)} aria-label="添加">＋</button>
    </>
  )
}

function CatRow({ cat, item, onPick }) {
  const has = Boolean(item?.file)
  return (
    <div className={`cat-row ${has ? 'has' : ''}`}>
      <div className="cat-row-head">
        <span className="cat-row-name">{cat.emoji} {cat.label}</span>
      </div>
      {has ? (
        <div className="cat-row-body">
          {item.preview && <img className="cat-thumb" src={item.preview} alt={cat.label} />}
          <label className="cat-repick">
            换一张
            <input type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <div className="cat-add-row">
          <label className="cat-add">
            📷 拍照
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(e.target.files[0])} />
          </label>
          <label className="cat-add">
            🖼 上传
            <input type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files[0])} />
          </label>
        </div>
      )}
    </div>
  )
}

// ---------------- 邀请 ----------------
function InviteSheet({ open, onClose, closet, owner, inviteCode, onJoin, busy }) {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (open) { setCode(''); setCopied(false) } }, [open])
  if (!open) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>邀请 TA 一起用</h3>

        {owner && inviteCode ? (
          <div className="invite-code-block">
            <p className="muted">把这个邀请码告诉 TA，TA 在「邀请」里输入就能加入：</p>
            <div className="invite-code">{inviteCode}</div>
            <button className="primary" onClick={copy}>{copied ? '已复制 ✓' : '复制邀请码'}</button>
          </div>
        ) : !owner ? (
          <div className="join-block">
            <p className="muted">输入 TA 给你的邀请码：</p>
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例如 3K7M2PQ"
              maxLength={12}
              autoFocus
            />
            <button className="primary" onClick={() => onJoin(code)} disabled={busy}>
              {busy ? '加入中…' : '加入衣橱'}
            </button>
          </div>
        ) : (
          <p className="muted">衣橱创建中…</p>
        )}

        <p className="muted dim small center">提示：没看到邀请码？因为邀请码只有「创建人」能看到，让 TA 告诉你。</p>
      </div>
    </div>
  )
}

// ---------------- 上传 ----------------
async function upstore(path, file) {
  const { error } = await supabase.storage.from('outfits').upload(path, file, { upsert: true })
  if (error) throw error
}

// 把照片压小并统一转成 JPG（最长边 1600px，质量 0.85），
// HEIC 等浏览器读不了的格式会直接在这里转成 JPG。
async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file // 万一失败，退回原图
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file // 兼容老浏览器或异常：退回原图
  }
}