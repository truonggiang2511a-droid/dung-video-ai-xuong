// NỐI APP CHÍNH (Dựng Video AI) ↔ MÁY DỰNG (4/11 → 5/11, Giang: “kết nối với App chính, khách sửa được trên timeline”).
// - Khách của app chính KHÔNG có mã xưởng: app (Cloudflare Worker) cấp MÃ KHÁCH ký bằng PRO_SECRET; máy dựng kiểm bằng XUONG_SECRET (cùng 1 chuỗi,
//   Giang đặt ở cả 2 nơi — cau-hinh.txt và Secret của Worker). Mã = base64url(JSON {u, n, exp, adm}) + "." + HMAC-SHA256.
// - Máy dựng TỰ BÁO ĐỊA CHỈ cho app (POST {APP_URL}/api/pro/register, ký HMAC) lúc mở + mỗi 5 phút → laptop dùng đường hầm nhanh
//   (địa chỉ đổi mỗi lần mở) hay VPS có tên miền đều được, app luôn biết gọi đâu.
//   Địa chỉ lấy theo thứ tự: XUONG_PUBLIC_URL (VPS có tên miền) → cloudflared --metrics 127.0.0.1:20241 /quicktunnel (đường hầm nhanh).
// - Trình duyệt của khách gọi thẳng máy dựng từ trang app chính → CORS chỉ mở cho địa chỉ app (APP_URL + XUONG_ORIGINS).
import crypto from 'node:crypto';

const SECRET = () => process.env.XUONG_SECRET || '';
const b64u = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET()).update(s).digest('base64url');

// mã khách do app cấp → {u, n, adm} hoặc null
export function verifyToken(tok) {
  if (!SECRET() || !tok) return null;
  const [p, s] = String(tok).split('.');
  if (!p || !s) return null;
  const want = Buffer.from(sign(p)), got = Buffer.from(s);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() / 1000 && o.u ? o : null; } catch { return null; }
}
// gọi chép lời / AI nhìn của app chính kèm chữ ký máy dựng: VPS phục vụ nhiều khách trên CÙNG 1 IP → app bỏ giới hạn 30 lượt/phút/IP cho máy dựng
export function proHeaders(pathname) {
  if (!SECRET()) return {};
  const ts = String(Math.floor(Date.now() / 1000));
  return { 'x-pro-ts': ts, 'x-pro-sign': sign(ts + '\n' + pathname) };
}
// (dùng trong kiểm thử: tạo mã giống app)
export function makeToken(o) { const p = b64u(JSON.stringify(o)); return p + '.' + sign(p); }

export function corsHeaders(req, appUrl) {
  const o = req.headers.origin;
  if (!o) return {};
  const allow = [appUrl, ...(process.env.XUONG_ORIGINS || '').split(',')].map(x => { try { return new URL(x.trim()).origin; } catch { return ''; } }).filter(Boolean);
  if (!allow.includes(o)) return {};
  return { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type, x-key', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-max-age': '600', vary: 'origin' };
}

// địa chỉ công khai của máy dựng
async function publicUrl() {
  if (process.env.XUONG_PUBLIC_URL) return process.env.XUONG_PUBLIC_URL.replace(/\/$/, '');
  try {
    const r = await fetch(`http://${process.env.XUONG_TUNNEL_METRICS || '127.0.0.1:20241'}/quicktunnel`, { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    return j.hostname ? 'https://' + String(j.hostname).replace(/^https?:\/\//, '').replace(/\/$/, '') : ''; // cloudflared /quicktunnel → {"hostname": "…trycloudflare.com"}
  } catch { return ''; }
}
let last = '';
export async function registerOnce(appUrl, extra = {}, log = console.log) {
  if (!SECRET()) return { ok: false, why: 'chưa có XUONG_SECRET' };
  const url = await publicUrl();
  if (!url) return { ok: false, why: 'chưa thấy địa chỉ công khai (đường hầm chưa mở / chưa đặt XUONG_PUBLIC_URL)' };
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    const r = await fetch(`${appUrl}/api/pro/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pro-ts': ts, 'x-pro-sign': sign(ts + '\n' + url) },
      body: JSON.stringify({ url, ...extra }), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, why: j.error || `app trả ${r.status}` };
    if (url !== last) { log(`Đã báo địa chỉ máy dựng cho app: ${url}`); last = url; }
    return { ok: true, url };
  } catch (e) { return { ok: false, why: e.message }; }
}
export function startRegister(appUrl, extra, log = console.log) {
  if (!SECRET()) return log('Chưa nối app chính (thiếu XUONG_SECRET trong cau-hinh.txt) — chỉ dùng được trang thử của máy dựng');
  // xem địa chỉ mỗi 30 s: đường hầm nhanh mở lại (VPS khởi động lại, mất mạng) là ĐỔI địa chỉ → báo ngay; không đổi thì 4 phút báo 1 lần (app coi máy tắt sau 15 phút im)
  let warned = false, sent = '', at = 0;
  const tick = async () => {
    const url = await publicUrl();
    if (url && url === sent && Date.now() - at < 4 * 60e3) return;
    const r = await registerOnce(appUrl, extra(), log);
    if (r.ok) { sent = r.url; at = Date.now(); warned = false; }
    else if (!warned) { log('Chưa báo được địa chỉ cho app: ' + r.why + ' — thử lại sau'); warned = true; }
  };
  tick(); setInterval(tick, 30e3);
}
