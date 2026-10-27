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
            {current && <Wardrobe key={current.id} closetId={current.id} myName={myName} />}
          </>
        )}
      </main>

      {current && <AddSheet closetId={current.id} myName={myName} onDone={() => setReloadKey((k) => k + 1)} />}

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

// ---------------- 衣橱（照片网格） ----------------
function Wardrobe({ closetId, myName }) {
  const [outfits, setOutfits] = useState(null)
  const [err, setErr] = useState('')
  const [viewer, setViewer] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setErr('')
      const { data, error } = await supabase
        .from('outfits')
        .select('id, title, note, image_path, created_at, user:user_id')
        .eq('closet_id', closetId)
        .order('created_at', { ascending: false })
      if (error || !alive) { if (alive) setErr(error?.message || '载入失败'); return }
      setOutfits(data || [])
    })()
    return () => { alive = false }
  }, [closetId])

  if (err) return <div className="center pad"><p className="error">{err}</p></div>
  if (!outfits) return <div className="center pad"><p className="muted dim">载入中…</p></div>
  if (outfits.length === 0) {
    return (
      <div className="card block center">
        <div className="empty-emoji">📸</div>
        <h2>衣橱还空着</h2>
        <p className="muted">点右下角的「＋」，把你们搭配好的衣服拍下来或传上来</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid">
        {outfits.map((o) => (
          <Tile key={o.id} outfit={o} onOpen={setViewer} />
        ))}
      </div>
      {viewer && <Viewer outfit={viewer} onClose={() => setViewer(null)} myName={myName} />}
    </>
  )
}

function Tile({ outfit, onOpen }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const path = outfit.image_path
    if (path.startsWith('data:') || path.startsWith('blob:')) { setUrl(path); return }
    ;(async () => {
      const { data } = await supabase.storage.from('outfits').createSignedUrl(path, 3600)
      if (alive) setUrl(data?.signedUrl || null)
    })()
    return () => { alive = false }
  }, [outfit.image_path])

  async function remove(e) {
    e.stopPropagation()
    const yes = confirm('删除这件搭配？')
    if (!yes) return
    const { error } = await supabase.from('outfits').delete().eq('id', outfit.id)
    if (!error && !outfit.image_path.startsWith('data:') && !outfit.image_path.startsWith('blob:')) {
      await supabase.storage.from('outfits').remove([outfit.image_path])
    }
    if (error) alert(error.message)
    else window.location.reload()
  }

  const thumb = url || (failed ? fallbackThumb(outfit.image_path) : embeddedCover())

  return (
    <figure className="tile" onClick={() => onOpen({ ...outfit, url })} role="button" tabIndex={0}>
      <div className="tile-img">
        <img
          src={thumb}
          alt={outfit.title || '搭配'}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
      {outfit.title && <figcaption className="tile-cap">{outfit.title}</figcaption>}
      <button className="tile-del" onClick={remove} aria-label="删除">✕</button>
    </figure>
  )
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
function Viewer({ outfit, onClose, myName }) {
  const [url, setUrl] = useState(outfit.url || null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (url) return
    if (outfit.image_path.startsWith('data:') || outfit.image_path.startsWith('blob:')) { setUrl(outfit.image_path); return }
    ;(async () => {
      const { data } = await supabase.storage.from('outfits').createSignedUrl(outfit.image_path, 3600)
      setUrl(data?.signedUrl || null)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const when = outfit.created_at ? formatTime(outfit.created_at) : ''

  return (
    <div className="overlay" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-img">
          {!failed ? (
            <img src={url || fallbackThumb(outfit.image_path)} alt={outfit.title || '搭配'} onError={() => setFailed(true)} />
          ) : (
            <div className="fallback-note">图片加载失败</div>
          )}
        </div>
        <div className="viewer-body">
          {outfit.title && <h3>{outfit.title}</h3>}
          {outfit.note && <p className="note">{outfit.note}</p>}
          {when && <p className="muted dim small">{when}</p>}
        </div>
        <button className="viewer-close" onClick={onClose}>✕</button>
      </div>
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

// ---------------- 添加搭配 ----------------
function AddSheet({ closetId, onDone }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState('') // '' | 'camera' | 'album'
  const [processing, setProcessing] = useState(false)

  async function onPick(file) {
    if (!file) return
    setProcessing(true)
    try {
      const ext = (file.name ? file.name.split('.').pop() : 'jpg').toLowerCase() || 'jpg'
      const outfitId = crypto.randomUUID()
      const path = `${closetId}/${outfitId}.${ext}`
      await upstore(path, file)
      const { error } = await supabase.from('outfits').insert({
        id: outfitId,
        closet_id: closetId,
        image_path: path,
        title: title.trim() || null,
        note: note.trim() || null,
      })
      if (error) throw error
      onDone()
    } catch (e) {
      alert('上传失败：' + (e.message || e))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      {method !== '' && (
        <div className="overlay" onClick={() => setMethod('')}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {processing ? (
              <div className="pad center">
                <div className="spinner" />
                <p className="muted">上传中…</p>
              </div>
            ) : (
              <>
                <h3>新增搭配</h3>
                <label className="field">
                  <span>标题（可选）</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：约会日 — 白衬衫配牛仔裤"
                    maxLength={40}
                  />
                </label>
                <label className="field">
                  <span>备注（可选）</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="这件和哪双鞋最搭…"
                    rows={2}
                  />
                </label>
                <div className="method-row">
                  <label className="method-btn">
                    📷 拍照
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(e.target.files[0])} />
                  </label>
                  <label className="method-btn">
                    🖼 相册
                    <input type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files[0])} />
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <button className="fab" onClick={() => setMethod('camera')} aria-label="添加">＋</button>
    </>
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