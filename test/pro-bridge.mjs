// KIỂM CẦU NỐI APP CHÍNH ↔ MÁY DỰNG (không cần Cloudflare): chạy worker.js của app chính trong Node (Request/Response có sẵn),
// Durable Object giả bằng Map, rồi: máy dựng báo địa chỉ → app cấp mã khách → khách gọi máy dựng (tạo dự án, xem danh sách, CORS, sửa tay, hoàn tác).
// node test/pro-bridge.mjs <đường dẫn worker.js> <thư mục job đã dựng xong để thử sửa tay (tuỳ chọn)>
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [workerPath, doneJob] = process.argv.slice(2);
const W = await import(path.resolve(workerPath));
const store = new Map(), storage = { get: async k => store.get(k), put: async (k, v) => store.set(k, v), deleteAll: async () => store.clear() };
const SECRET = 'thu-bi-mat-123', env = { PRO_SECRET: SECRET, PRO_ADMIN: 'admin-9999', PRO_CODES: 'chi-thuy:moi-2611,anh-nam:moi-7788' };
const gate = new W.AiGate({ storage }, env);
env.AI_GATE = { idFromName: n => n, get: () => ({ fetch: (u, init) => gate.fetch(new Request(u, init)) }) };
// máy chủ giả của app chính
const app = http.createServer(async (req, res) => {
  const b = []; for await (const c of req) b.push(c);
  const r = await W.default.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(b) }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787);
const ok = (c, m) => console.log(c ? '✅' : '❌', m);
// máy dựng (cổng 8791 để không đụng máy đang chạy)
// đường hầm nhanh giả (cloudflared --metrics …/quicktunnel) — giống VPS không tên miền
let tunnelHost = 'thu-mot-hai.trycloudflare.com';
const tun = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ hostname: tunnelHost })); }).listen(20299, '127.0.0.1');
const xs = spawn('node', ['server.mjs'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: '8791', XUONG_HOST: '127.0.0.1', XUONG_KEY: 'test123', XUONG_SECRET: SECRET, APP_URL: 'http://localhost:8787', XUONG_PUBLIC_URL: '', XUONG_TUNNEL_METRICS: '127.0.0.1:20299' } });
let log = ''; xs.stdout.on('data', d => log += d); xs.stderr.on('data', d => log += d);
await new Promise(r => setTimeout(r, 2500));
const j = async (u, o = {}) => { const r = await fetch(u, o); return { s: r.status, h: r.headers, b: await r.json().catch(() => ({})) }; };
try {
  let info; for (let k = 0; k < 20; k++) { info = await j('http://localhost:8787/api/pro/info'); if (info.b.on) break; await new Promise(r => setTimeout(r, 500)); }
  ok(info.b.on && info.b.url === 'https://' + tunnelHost, `máy dựng tự báo địa chỉ đường hầm nhanh cho app: ${info.b.url}`);
  // chép lời / AI nhìn: máy dựng ký → app bỏ giới hạn theo IP (VPS nhiều khách chung 1 IP); không ký → vẫn bị giới hạn
  const { proHeaders } = await import('../lib/pro.mjs');
  process.env.XUONG_SECRET = SECRET;
  const env2 = { ...env, AI: { run: async () => ({ response: '{}' }) }, STT_LIMIT: { limit: async () => ({ success: false }) } };
  const vis = h => W.default.fetch(new Request('http://localhost:8787/api/vision', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify({ items: [] }) }), env2);
  ok((await vis({})).status === 429 && (await vis(proHeaders('/api/vision'))).status !== 429 && (await vis({ 'x-pro-ts': String(Math.floor(Date.now() / 1000)), 'x-pro-sign': 'gia' })).status === 429,
    'AI nhìn: máy dựng ký → không bị giới hạn IP; không ký / ký giả → 429');
  ok((await j('http://localhost:8787/api/pro/token', { method: 'POST', body: JSON.stringify({ code: 'sai-ma' }) })).s === 403, 'mã mời sai bị chặn');
  const t1 = (await j('http://localhost:8787/api/pro/token', { method: 'POST', body: JSON.stringify({ code: 'moi-2611' }) })).b;
  const t2 = (await j('http://localhost:8787/api/pro/token', { method: 'POST', body: JSON.stringify({ code: 'moi-7788' }) })).b;
  ok(t1.token && t1.name === 'chi-thuy' && !t1.adm, `mã mời đúng → mã khách (${t1.name}, hết hạn ${new Date(t1.exp * 1000).toISOString().slice(0, 10)})`);
  // giả chữ ký máy dựng → app từ chối
  const bad = await j('http://localhost:8787/api/pro/register', { method: 'POST', headers: { 'x-pro-ts': String(Math.floor(Date.now() / 1000)), 'x-pro-sign': 'gia' }, body: JSON.stringify({ url: 'https://ke-gian.com' }) });
  ok(bad.s === 401, 'kẻ lạ giả máy dựng đổi địa chỉ → bị chặn');
  const X = 'http://127.0.0.1:8791', A = tok => ({ authorization: 'Bearer ' + tok, origin: 'http://localhost:8787', 'content-type': 'application/json' });
  ok((await j(X + '/api/jobs', { headers: { origin: 'http://localhost:8787' } })).s === 401, 'gọi máy dựng không có mã → 401');
  ok((await j(X + '/api/jobs', { headers: { authorization: 'Bearer ' + t1.token.slice(0, -2) + 'xx' } })).s === 401, 'mã khách bị sửa → 401');
  const pre = await fetch(X + '/api/jobs', { method: 'OPTIONS', headers: { origin: 'http://localhost:8787', 'access-control-request-method': 'POST' } });
  ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'http://localhost:8787', 'CORS cho trang app chính');
  const pre2 = await fetch(X + '/api/jobs', { method: 'OPTIONS', headers: { origin: 'https://trang-la.com' } });
  ok(!pre2.headers.get('access-control-allow-origin'), 'CORS không mở cho trang lạ');
  const c1 = await j(X + '/api/jobs', { method: 'POST', headers: A(t1.token), body: JSON.stringify({ industry: 'bat-dong-san' }) });
  ok(c1.s === 200 && c1.b.id, `khách 1 tạo dự án ${c1.b.id}`);
  const l1 = await j(X + '/api/jobs', { headers: A(t1.token) }), l2 = await j(X + '/api/jobs', { headers: A(t2.token) });
  ok(l1.b.jobs.some(x => x.id === c1.b.id) && !l2.b.jobs.some(x => x.id === c1.b.id), 'khách 2 không thấy dự án của khách 1');
  ok((await j(X + '/api/jobs/' + c1.b.id, { headers: A(t2.token) })).s === 404, 'khách 2 mở dự án khách 1 → 404');
  if (doneJob) { // sửa tay trên dự án đã dựng (chép vào jobs/ của máy dựng, gán chủ = khách 1)
    const id = 'thu' + Date.now().toString(36) + 'abcd', dst = path.resolve(import.meta.dirname, '..', 'jobs', id);
    fs.cpSync(doneJob, dst, { recursive: true });
    const st = JSON.parse(fs.readFileSync(path.join(dst, 'state.json'), 'utf8')); st.id = id; st.owner = JSON.parse(Buffer.from(t1.token.split('.')[0], 'base64url')).u; fs.writeFileSync(path.join(dst, 'state.json'), JSON.stringify(st));
    const T = JSON.parse(fs.readFileSync(path.join(dst, 'timeline.json'), 'utf8')), tx = T.clips.find(c => c.type === 'text' && c.tpl !== 'cta');
    const r = await j(X + `/api/jobs/${id}/ops`, { method: 'POST', headers: A(t1.token), body: JSON.stringify({ ops: [{ op: 'update', id: tx.id, start: tx.start + 1, props: { text: 'CHỮ KHÁCH SỬA' } }] }) });
    const t2c = r.b.timeline?.clips.find(c => c.id === tx.id);
    ok(r.s === 200 && t2c?.props.text === 'CHỮ KHÁCH SỬA' && Math.abs(t2c.start - tx.start - 1) < 0.01, `sửa tay: dời chữ ${tx.id} +1 s, đổi chữ`);
    const html = fs.readFileSync(path.join(dst, 'index.html'), 'utf8');
    ok(html.includes('CHỮ KHÁCH SỬA'), 'bản xem nhanh (index.html) dựng lại theo chỗ sửa');
    const u = await j(X + `/api/jobs/${id}/undo`, { method: 'POST', headers: A(t1.token) });
    ok(u.s === 200 && u.b.timeline.clips.find(c => c.id === tx.id).props.text === tx.props.text, 'hoàn tác → chữ cũ');
    const rd = await j(X + `/api/jobs/${id}/redo`, { method: 'POST', headers: A(t1.token) });
    ok(rd.s === 200 && rd.b.timeline.clips.find(c => c.id === tx.id).props.text === 'CHỮ KHÁCH SỬA', 'làm lại → chữ khách sửa');
    fs.rmSync(dst, { recursive: true, force: true });
  }
  if (process.env.TUNNEL_CHANGE) {
    tunnelHost = 'dia-chi-moi-ba-bon.trycloudflare.com'; const t0 = Date.now(); let i2;
    for (let k = 0; k < 45; k++) { await new Promise(r => setTimeout(r, 1000)); i2 = await j('http://localhost:8787/api/pro/info'); if (i2.b.url === 'https://' + tunnelHost) break; }
    ok(i2.b.url === 'https://' + tunnelHost, `đường hầm đổi địa chỉ → app biết sau ${Math.round((Date.now() - t0) / 1000)} s`);
  }
} finally { xs.kill(); app.close(); tun.close(); console.log('--- máy dựng:', log.split('\n').filter(l => /báo|nối|Chưa/.test(l)).join(' | ')); }
