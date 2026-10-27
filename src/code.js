const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 无易混淆字符
const N = 7

function randInt(max) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

export function randomCode() {
  let s = ''
  for (let i = 0; i < N; i++) s += CODE_CHARS[randInt(CODE_CHARS.length)]
  return s
}

export function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}